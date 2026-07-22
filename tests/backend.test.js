"use strict";

const bcrypt = require("bcrypt");
const request = require("supertest");
const { createApp } = require("../src/server");
const { prisma } = require("../src/prisma");
const data = require("../src/data");
const service = require("../src/service-data");
const { assumptionsFromCbsRows, priceHistoryFromCbsRows, refreshEnergyAssumptions } = require("../src/advice-assumptions");
const { authenticator, encrypt, decrypt, scanWithClamav } = require("../src/hr-security");
const { inventoryWorkbookBuffer } = require("./helpers/inventory-workbook");

let app;
let hrApp;
let energyPriceFetchMock;

function binaryParser(response, callback) {
  const chunks = [];
  response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
}

function energyPricePoint(start, hours, price) {
  const startDate = new Date(start);
  return { start: startDate.toISOString(), end: new Date(startDate.getTime() + hours * 60 * 60 * 1000).toISOString(), price: { value: String(price) } };
}

function energyPriceFixture(url) {
  const parsed = new URL(String(url));
  let points;
  if (parsed.searchParams.get("energyType") === "ENERGY_TYPE_ELECTRICITY") {
    const start = Date.parse("2026-07-19T22:00:00.000Z");
    points = Array.from({ length: 48 }, (_, index) => energyPricePoint(start + index * 60 * 60 * 1000, 1, 0.2 + index / 1000));
  } else {
    const month = Number(parsed.searchParams.get("month"));
    const start = Date.parse(month === 7 ? "2026-07-01T04:00:00.000Z" : "2026-06-01T04:00:00.000Z");
    const count = month === 7 ? 20 : 30;
    points = Array.from({ length: count }, (_, index) => energyPricePoint(start + index * 24 * 60 * 60 * 1000, 24, 1.1 + index / 1000));
  }
  return { ok: true, json: async () => ({ all_in_with_vat: points }) };
}

beforeAll(async () => {
  const adminPasswordHash = await bcrypt.hash("test-password", 4);
  energyPriceFetchMock = vi.fn(async (url) => energyPriceFixture(url));
  app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    sessionSecret: "test-session-secret-at-least-32-chars",
    adminUsername: "admin",
    adminPasswordHash,
    port: 0,
    nodeEnv: "test",
    isProduction: false,
    allowUnscannedHrFiles: true,
    energyPriceFetch: (...args) => energyPriceFetchMock(...args),
    energyPriceNow: () => new Date("2026-07-20T10:30:00.000Z")
  });
  hrApp = createApp({
    databaseUrl: process.env.DATABASE_URL,
    sessionSecret: "test-hr-session-secret-at-least-32-chars",
    adminUsername: "admin",
    adminPasswordHash,
    port: 0,
    nodeEnv: "test",
    isProduction: false,
    hrPortalEnabled: true,
    hrEncryptionKey: Buffer.alloc(32, 7).toString("base64"),
    hrKeyVersion: "v1",
    allowUnscannedHrFiles: true
  });
});

beforeEach(async () => {
  await prisma.serviceAuditEvent.deleteMany();
  await prisma.serviceDocument.deleteMany();
  await prisma.maintenanceMeasurement.deleteMany();
  await prisma.serviceReminderRun.deleteMany();
  await prisma.maintenanceVisit.deleteMany();
  await prisma.serviceRequest.deleteMany();
  await prisma.serviceContract.deleteMany();
  await prisma.customerEquipment.deleteMany();
  await prisma.hrAuditEvent.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.qualificationRequirement.deleteMany();
  await prisma.qualificationDefinition.deleteMany();
  await prisma.checklistTemplate.deleteMany();
  await prisma.user.deleteMany();
  await data.resetData(prisma);
});

describe("service and maintenance", () => {
  it("sends each due maintenance reminder at most once per day", async () => {
    const client = agent(); await login(client);
    const customer = await createCustomer(client);
    await client.post("/api/service/contracts").send({ customerId: customer.id, title: "Onderhoud", startDate: "2026-01-01", nextMaintenanceDate: new Date().toISOString().slice(0, 10), price: 100, billingPeriod: "yearly", maintenanceFrequency: 12 }).expect(201);
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ id: "mail-1" }) }));
    try {
      const config = { resendApiKey: "test-key", serviceMailFrom: "service@example.com" };
      const first = await service.sendReminders(prisma, config, null);
      const second = await service.sendReminders(prisma, config, null);
      expect(first[0].status).toBe("sent");
      expect(second[0].status).toBe("duplicate");
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally { global.fetch = originalFetch; }
  });

  it("runs the service lifecycle and creates at most one concept invoice", async () => {
    const client = agent();
    await login(client);
    const customer = await createCustomer(client);
    const employee = await prisma.employee.create({ data: { employeeNumber: "CL-SVC-001", firstName: "Sam", lastName: "Service", startDate: "2026-01-01", status: "active" } });

    const equipment = (await client.post("/api/service/equipment").send({ customerId: customer.id, type: "heat_pump", brand: "Test", model: "HP-1", serialNumber: "SN-001", installedAt: "2026-01-15", warrantyUntil: "2031-01-15", maintenanceIntervalMonths: 12 }).expect(201)).body.item;
    expect(equipment.nextMaintenanceDate).toBe("2027-01-15");
    const contract = (await client.post("/api/service/contracts").send({ customerId: customer.id, equipmentId: equipment.id, title: "Jaarlijks onderhoud", startDate: "2026-01-15", price: 150, billingPeriod: "yearly", maintenanceFrequency: 12 }).expect(201)).body.item;
    const serviceRequest = (await client.post("/api/service/requests").send({ customerId: customer.id, equipmentId: equipment.id, title: "Lage waterdruk", priority: "high", type: "malfunction", description: "Druk zakt weg." }).expect(201)).body.item;
    const visit = (await client.post("/api/service/visits").send({ customerId: customer.id, equipmentId: equipment.id, contractId: contract.id, serviceRequestId: serviceRequest.id, assignedEmployeeId: employee.id, type: "malfunction", workType: "heat_pump", plannedDate: "2026-08-01", startTime: "09:00", durationHours: 2 }).expect(201)).body.item;
    expect(visit.qualificationCheck.availability).toBeDefined();

    const completed = (await client.put(`/api/service/visits/${visit.id}`).send({ status: "completed", diagnosis: "Expansievat defect", workPerformed: "Expansievat vervangen", customerName: "Test Klant", customerSignature: "data:image/png;base64,dGVzdA==", materialsUsed: [{ description: "Expansievat", quantity: 1, unit: "stuk", priceExVat: 75 }], measurements: [{ name: "Waterdruk", value: 1.8, unit: "bar" }] }).expect(200)).body.item;
    expect(completed.measurements[0]).toMatchObject({ name: "Waterdruk", value: 1.8, unit: "bar" });
    expect((await prisma.serviceRequest.findUnique({ where: { id: serviceRequest.id } })).status).toBe("resolved");
    expect((await prisma.customerEquipment.findUnique({ where: { id: equipment.id } })).lastMaintenanceDate).toBe("2026-08-01");

    const invoiceResponses = await Promise.all([
      client.post(`/api/service/visits/${visit.id}/invoice`).send({}).expect(201),
      client.post(`/api/service/visits/${visit.id}/invoice`).send({}).expect(201)
    ]);
    const firstInvoice = invoiceResponses[0].body.item, secondInvoice = invoiceResponses[1].body.item;
    expect(secondInvoice.id).toBe(firstInvoice.id);
    expect(firstInvoice.lines).toHaveLength(2);
    expect(await prisma.invoice.count({ where: { id: firstInvoice.id } })).toBe(1);
    expect(await prisma.serviceAuditEvent.count({ where: { entityType: "visit", entityId: visit.id } })).toBeGreaterThan(1);
    const backup = (await client.get("/api/backup/export").expect(200)).body;
    expect(backup.data.serviceContracts).toHaveLength(1);
    expect(backup.data.maintenanceVisits).toHaveLength(1);
    await client.post("/api/backup/import").send(backup).expect(200);
    expect(await prisma.customerEquipment.count()).toBe(1);
    expect(await prisma.maintenanceVisit.count()).toBe(1);
  });

  it("limits installers to their own service visits and gives CRM and finance read-only views", async () => {
    const admin = agent(); await login(admin);
    const customer = await createCustomer(admin);
    const ownEmployee = await prisma.employee.create({ data: { employeeNumber: "CL-SVC-002", firstName: "Eigen", lastName: "Monteur", startDate: "2026-01-01", status: "active" } });
    const otherEmployee = await prisma.employee.create({ data: { employeeNumber: "CL-SVC-003", firstName: "Andere", lastName: "Monteur", startDate: "2026-01-01", status: "active" } });
    const installerUser = await createInstaller(admin, "service-installer");
    await prisma.user.update({ where: { id: installerUser.id }, data: { employeeId: ownEmployee.id } });
    const ownVisit = (await admin.post("/api/service/visits").send({ customerId: customer.id, assignedEmployeeId: ownEmployee.id, plannedDate: "2026-08-02", startTime: "09:00", durationHours: 2, workType: "other" }).expect(201)).body.item;
    const otherVisit = (await admin.post("/api/service/visits").send({ customerId: customer.id, assignedEmployeeId: otherEmployee.id, plannedDate: "2026-08-02", startTime: "12:00", durationHours: 2, workType: "other" }).expect(201)).body.item;

    const installer = agent(); await installer.post("/api/auth/login").send({ username: "service-installer", password: "installer-pass" }).expect(200);
    const ownData = await installer.get("/api/service/bootstrap").expect(200);
    expect(ownData.body.visits.map((item) => item.id)).toEqual([ownVisit.id]);
    await installer.put(`/api/service/visits/${ownVisit.id}`).send({ status: "in_progress", diagnosis: "Controle" }).expect(200);
    await installer.put(`/api/service/visits/${otherVisit.id}`).send({ status: "in_progress" }).expect(403);
    await installer.post("/api/service/contracts").send({}).expect(403);

    await createRoleUser(admin, "crm"); await createRoleUser(admin, "finance");
    const crm = await loginAsRole("crm"), finance = await loginAsRole("finance");
    await crm.get(`/api/service/bootstrap?customerId=${customer.id}`).expect(200);
    await finance.get("/api/service/bootstrap").expect(200);
    await crm.post("/api/service/requests").send({}).expect(403);
    await finance.post("/api/service/contracts").send({}).expect(403);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
  if (app && app.locals && app.locals.pool) await app.locals.pool.end();
  if (hrApp && hrApp.locals && hrApp.locals.pool) await hrApp.locals.pool.end();
});

function agent() {
  return request.agent(app);
}

async function login(client) {
  await client.post("/api/auth/login").send({ username: "admin", password: "test-password" }).expect(200);
}

async function createCustomer(client) {
  const response = await client.post("/api/collections/customers").send({
    firstName: "Test",
    lastName: "Klant",
    email: "test@example.com",
    phone: "0612345678",
    address: "Straat 1",
    postalCode: "1234 AB",
    city: "Utrecht"
  }).expect(200);
  return response.body.item;
}

async function createInstaller(client, username = "installer", employeeId = null) {
  return (await client.post("/api/users").send({
    username,
    password: "installer-pass",
    role: "installer",
    employeeId
  }).expect(200)).body.item;
}

async function createRoleUser(client, role) {
  return (await client.post("/api/users").send({
    username: `${role}-user`,
    password: `${role}-password`,
    role
  }).expect(200)).body.item;
}

async function loginAsRole(role) {
  const client = agent();
  await client.post("/api/auth/login").send({ username: `${role}-user`, password: `${role}-password` }).expect(200);
  return client;
}

async function enableHr(client) {
  const setup = await client.post("/api/hr/mfa/setup/start").send({ password: "test-password" }).expect(200);
  const code = authenticator.generate(setup.body.secret);
  const confirmed = await client.post("/api/hr/mfa/setup/confirm").send({ code }).expect(200);
  expect(confirmed.body.recoveryCodes).toHaveLength(10);
  return confirmed.body.recoveryCodes;
}

describe("auth", () => {
  it("rejects protected routes without login", async () => {
    await request(app).get("/api/bootstrap").expect(401);
  });

  it("logs in with configured credentials and rejects wrong passwords", async () => {
    await request(app).post("/api/auth/login").send({ username: "admin", password: "wrong" }).expect(401);
    const client = agent();
    await login(client);
    const session = await client.get("/api/auth/session").expect(200);
    expect(session.body.authenticated).toBe(true);
    expect(session.body.user.role).toBe("admin");
    expect((await client.get("/api/users").expect(200)).body.items).toHaveLength(1);
  });

  it("lets admins create installers and installers log in", async () => {
    const client = agent();
    await login(client);
    const installer = await createInstaller(client);
    expect(installer.role).toBe("installer");
    expect(installer.passwordHash).toBeUndefined();

    const installerClient = agent();
    await installerClient.post("/api/auth/login").send({ username: "installer", password: "installer-pass" }).expect(200);
    const session = await installerClient.get("/api/auth/session").expect(200);
    expect(session.body.user.role).toBe("installer");
  });

  it("stores every selected account role and rejects missing or unknown roles", async () => {
    const client = agent();
    await login(client);
    for (const role of ["admin", "crm", "sales", "execution", "finance", "installer"]) {
      const item = (await client.post("/api/users").send({ username: `account-${role}`, password: "account-password", role }).expect(200)).body.item;
      expect(item.role).toBe(role);
    }
    await client.post("/api/users").send({ username: "zonder-rol", password: "account-password" }).expect(400);
    await client.post("/api/users").send({ username: "verkeerde-rol", password: "account-password", role: "uitvoerder" }).expect(400);
    const salesLogin = agent();
    const session = await salesLogin.post("/api/auth/login").send({ username: "account-sales", password: "account-password" }).expect(200);
    expect(session.body.user.role).toBe("sales");
  });

  it("allows users to change their own username and password", async () => {
    const client = agent();
    await login(client);
    await client.put("/api/auth/me").send({
      username: "owner",
      currentPassword: "test-password",
      newPassword: "new-password"
    }).expect(200);

    await request(app).post("/api/auth/login").send({ username: "admin", password: "test-password" }).expect(401);
    await request(app).post("/api/auth/login").send({ username: "owner", password: "new-password" }).expect(200);
  });

  it("protects the last active admin from lock-out", async () => {
    const client = agent();
    await login(client);
    const admin = (await client.get("/api/users").expect(200)).body.items[0];
    await client.put(`/api/users/${admin.id}`).send({ active: false }).expect(400);
    await client.put(`/api/users/${admin.id}`).send({ role: "installer" }).expect(400);

    await client.post("/api/users").send({ username: "second", password: "second-pass", role: "admin" }).expect(200);
    await client.put(`/api/users/${admin.id}`).send({ role: "installer" }).expect(200);
  });
});

describe("live energy price endpoint", () => {
  it("is admin-only and returns a cached normalized dashboard response", async () => {
    await request(app).get("/api/energy-prices").expect(401);
    const admin = agent();
    await login(admin);
    await createRoleUser(admin, "sales");
    const sales = await loginAsRole("sales");
    await sales.get("/api/energy-prices").expect(403);

    const first = await admin.get("/api/energy-prices").expect(200);
    expect(first.body.source).toMatchObject({ name: "EnergyZero", status: "fresh" });
    expect(first.body.electricity).toMatchObject({ unit: "EUR/kWh", interval: "hour" });
    expect(first.body.electricity.points).toHaveLength(48);
    expect(first.body.gas.points).toHaveLength(30);
    expect(energyPriceFetchMock).toHaveBeenCalledTimes(3);

    await admin.get("/api/energy-prices").expect(200);
    expect(energyPriceFetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns 502 when the source fails and no last-good response exists", async () => {
    const failingApp = createApp({
      databaseUrl: process.env.DATABASE_URL,
      sessionSecret: "failing-energy-session-secret-at-least-32-chars",
      adminUsername: "admin",
      adminPasswordHash: await bcrypt.hash("test-password", 4),
      port: 0,
      nodeEnv: "test",
      isProduction: false,
      allowUnscannedHrFiles: true,
      energyPriceFetch: async () => { throw new Error("offline"); },
      energyPriceNow: () => new Date("2026-07-20T10:30:00.000Z")
    });
    try {
      const client = request.agent(failingApp);
      await client.post("/api/auth/login").send({ username: "admin", password: "test-password" }).expect(200);
      const response = await client.get("/api/energy-prices").expect(502);
      expect(response.body).toMatchObject({ code: "ENERGY_PRICES_UNAVAILABLE", error: "Actuele energieprijzen zijn tijdelijk niet beschikbaar." });
    } finally {
      await failingApp.locals.coordination.close();
      await failingApp.locals.objectStorage.close();
      await failingApp.locals.pool.end();
    }
  });
});

describe("role access", () => {
  it("limits installers to customers, installations and work orders", async () => {
    const admin = agent();
    await login(admin);
    const ownEmployee = await prisma.employee.create({ data: { employeeNumber: "CL-AUTHZ-001", firstName: "Sam", lastName: "Eigen", startDate: "2026-01-01", status: "active" } });
    const otherEmployee = await prisma.employee.create({ data: { employeeNumber: "CL-AUTHZ-002", firstName: "Piet", lastName: "Ander", startDate: "2026-01-01", status: "active" } });
    await createInstaller(admin, "installer", ownEmployee.id);
    const customer = await createCustomer(admin);
    const otherCustomer = (await admin.post("/api/collections/customers").send({
      firstName: "Andere", lastName: "Klant", email: "ander@example.com", phone: "0699999999",
      address: "Andere straat 2", postalCode: "4321 BA", city: "Rotterdam"
    }).expect(200)).body.item;
    const ownInstallation = await prisma.installation.create({ data: {
      customerId: customer.id, plannedDate: "2026-07-30", startTime: "09:00", durationHours: 4,
      installer: "Sam Eigen", employeeId: ownEmployee.id
    } });
    const otherInstallation = await prisma.installation.create({ data: {
      customerId: otherCustomer.id, plannedDate: "2026-07-31", startTime: "09:00", durationHours: 4,
      installer: "Piet Ander", employeeId: otherEmployee.id
    } });
    const ownProject = (await admin.post("/api/projects").send({ customerId: customer.id, plannedDate: "2026-07-30", workType: "other", employeeId: ownEmployee.id }).expect(201)).body.item;
    const otherProject = (await admin.post("/api/projects").send({ customerId: otherCustomer.id, plannedDate: "2026-07-31", workType: "other", employeeId: otherEmployee.id }).expect(201)).body.item;
    await admin.post("/api/collections/customerNotes").send({ customerId: customer.id, body: "Eigen notitie" }).expect(200);
    await admin.post("/api/collections/customerNotes").send({ customerId: otherCustomer.id, body: "Verborgen notitie" }).expect(200);
    const pdfContent = Buffer.from("%PDF-1.4\n%%EOF");
    await admin.post(`/api/customers/${customer.id}/documents`).attach("file", pdfContent, { filename: "eigen.pdf", contentType: "application/pdf" }).expect(201);
    await admin.post(`/api/customers/${otherCustomer.id}/documents`).attach("file", pdfContent, { filename: "verborgen.pdf", contentType: "application/pdf" }).expect(201);

    const installer = agent();
    await installer.post("/api/auth/login").send({ username: "installer", password: "installer-pass" }).expect(200);
    const bootstrap = await installer.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.data.user).toMatchObject({ role: "installer", employeeId: ownEmployee.id });
    expect(bootstrap.body.data.permissions.readableCollections).toEqual(["customers", "customerNotes", "customerDocuments", "installations"]);
    expect(bootstrap.body.data.customers).toBeUndefined();
    expect(bootstrap.body.data.installations).toBeUndefined();
    expect(bootstrap.body.data.customerDocuments).toBeUndefined();
    expect(bootstrap.body.data.settings).toEqual({});

    expect((await installer.get("/api/collections/customers").expect(200)).body.items.map((item) => item.id)).toEqual([customer.id]);
    expect((await installer.get("/api/collections/installations").expect(200)).body.items.map((item) => item.id)).toEqual([ownInstallation.id]);
    expect((await installer.get("/api/collections/customerNotes").expect(200)).body.items.map((item) => item.body)).toEqual(["Eigen notitie"]);
    expect((await installer.get("/api/collections/customerDocuments").expect(200)).body.items.map((item) => item.fileName)).toEqual(["eigen.pdf"]);
    const pagedCustomers = await installer.get("/api/customers?page=1&pageSize=25&sortBy=lastName&sortOrder=asc").expect(200);
    expect(pagedCustomers.body).toMatchObject({ page: 1, pageSize: 25, totalItems: 1, totalPages: 1 });
    expect(pagedCustomers.body.items.map((item) => item.id)).toEqual([customer.id]);
    const pagedDocuments = await installer.get("/api/documents?page=1&pageSize=25").expect(200);
    expect(pagedDocuments.body.items.map((item) => item.fileName)).toEqual(["eigen.pdf"]);
    expect(pagedDocuments.body.items[0].content).toBeUndefined();
    await installer.get(`/api/documents/${pagedDocuments.body.items[0].id}/download`).expect("Content-Type", /application\/pdf/).expect(200);
    const otherDocument = await prisma.customerDocument.findFirst({ where: { customerId: otherCustomer.id } });
    await installer.get(`/api/documents/${otherDocument.id}/download`).expect(404);
    await installer.get(`/api/projects/${ownProject.id}`).expect(200);
    await installer.get(`/api/projects/${otherProject.id}`).expect(404);
    await installer.put(`/api/projects/${otherProject.id}/tasks/${otherProject.tasks[0].id}`).send({ status: "completed" }).expect(404);
    await installer.get("/api/collections/quotes").expect(403);
    await installer.get("/api/settings").expect(403);
    await installer.get("/api/users").expect(403);
    await installer.get("/api/backup/export").expect(403);
    await installer.post("/api/admin/reset").expect(403);
    await installer.post("/api/collections/customers").send({ firstName: "Nope" }).expect(403);
    await installer.post("/api/collections/installations").send({ customerId: customer.id }).expect(403);

    await installer.put(`/api/installations/${otherInstallation.id}/workorder`).send({ status: "uitgevoerd", workOrder: { workDone: "Onbevoegd" } }).expect(404);
    await installer.put(`/api/installations/${ownInstallation.id}/workorder`).send({
      status: "uitgevoerd",
      workOrder: {
        workDone: "Getest",
        mechanicName: "Sam",
        checks: { installedTested: true }
      }
    }).expect(200);
    const updated = await admin.get(`/api/installations?customerId=${customer.id}&pageSize=25`).expect(200);
    expect(updated.body.items[0].status).toBe("uitgevoerd");
    expect(updated.body.items[0].workOrder.workDone).toBe("Getest");
  });

  it("isolates CRM, sales, execution and finance by portal and API collection", async () => {
    const admin = agent();
    await login(admin);
    for (const role of ["crm", "sales", "execution", "finance"]) await createRoleUser(admin, role);
    const customer = await createCustomer(admin);
    await admin.post("/api/collections/installations").send({
      customerId: customer.id,
      plannedDate: "2026-08-20",
      startTime: "09:00",
      durationHours: 4,
      workType: "other"
    }).expect(200);

    const crm = await loginAsRole("crm");
    const crmData = (await crm.get("/api/bootstrap").expect(200)).body.data;
    expect(crmData.permissions.readableCollections).toEqual(["customers", "customerNotes", "customerDocuments"]);
    expect(crmData.customers).toBeUndefined();
    await crm.get("/api/collections/customers").expect(200);
    await crm.get("/api/collections/salesOpportunities").expect(403);
    await crm.post("/api/collections/customers").send({
      firstName: "CRM",
      lastName: "Klant",
      email: "crm@example.com",
      phone: "0611111111",
      address: "CRM-straat 1",
      postalCode: "1234 AB",
      city: "Utrecht"
    }).expect(200);
    await crm.post("/api/collections/quotes").send({}).expect(403);

    const sales = await loginAsRole("sales");
    const salesData = (await sales.get("/api/bootstrap").expect(200)).body.data;
    expect(salesData.permissions.readableCollections).toContain("salesOpportunities");
    expect(salesData.salesOpportunities).toBeUndefined();
    await sales.get("/api/collections/quotes").expect(200);
    await sales.get("/api/collections/invoices").expect(403);
    await sales.post("/api/collections/salesAppointments").send({ title: "Belafspraak", date: "2026-08-01", startTime: "10:00", endTime: "10:30" }).expect(200);
    await sales.post("/api/collections/customers").send({ firstName: "Nope" }).expect(403);
    await sales.post("/api/counters/quote/next").expect(200);
    await sales.post("/api/counters/invoice/next").expect(403);
    await sales.get("/api/projects").expect(403);

    const execution = await loginAsRole("execution");
    const executionData = (await execution.get("/api/bootstrap").expect(200)).body.data;
    expect(executionData.permissions.readableCollections).toEqual(["customers", "quotes", "installations"]);
    expect(executionData.installations).toBeUndefined();
    await execution.get("/api/collections/installations").expect(200);
    await execution.get("/api/collections/invoices").expect(403);
    await execution.get("/api/projects").expect(200);
    await execution.get("/api/inventory").expect(200);
    await execution.post("/api/collections/installations").send({ customerId: customer.id, plannedDate: "2026-08-21", startTime: "09:00", durationHours: 4, workType: "other" }).expect(200);
    await execution.post("/api/collections/invoices").send({}).expect(403);

    const finance = await loginAsRole("finance");
    const financeData = (await finance.get("/api/bootstrap").expect(200)).body.data;
    expect(financeData.permissions.readableCollections).toEqual(["customers", "products", "quotes", "invoices"]);
    expect(financeData.invoices).toBeUndefined();
    await finance.get("/api/collections/invoices").expect(200);
    await finance.get("/api/collections/salesOpportunities").expect(403);
    await finance.get("/api/inventory").expect(403);
    await finance.post("/api/counters/invoice/next").expect(200);
    await finance.post("/api/counters/quote/next").expect(403);
    await finance.post("/api/collections/customers").send({ firstName: "Nope" }).expect(403);
    await finance.get("/api/users").expect(403);
    await finance.get("/api/backup/export").expect(403);
  });
});

describe("business data", () => {
  it("paginates, searches, filters and sorts domain collections server-side", async () => {
    const client = agent();
    await login(client);
    await createCustomer(client);
    await client.post("/api/collections/customers").send({ firstName: "Ada", lastName: "Alfa", companyName: "Zon BV", email: "ada@example.com", phone: "0611111111", address: "A 1", postalCode: "1000 AA", city: "Amsterdam" }).expect(200);
    await client.post("/api/collections/customers").send({ firstName: "Bert", lastName: "Beta", companyName: "Wind BV", email: "bert@example.com", phone: "0622222222", address: "B 2", postalCode: "2000 BB", city: "Amsterdam" }).expect(200);

    const firstPage = await client.get("/api/customers?page=1&pageSize=2&sortBy=lastName&sortOrder=asc").expect(200);
    expect(firstPage.body).toMatchObject({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
    expect(firstPage.body.items.map((item) => item.lastName)).toEqual(["Alfa", "Beta"]);
    const searched = await client.get("/api/customers?search=wind&city=Amsterdam&pageSize=25").expect(200);
    expect(searched.body.items.map((item) => item.companyName)).toEqual(["Wind BV"]);
    await client.get("/api/customers?pageSize=101").expect(400);
    await client.get("/api/customers?sortBy=passwordHash").expect(400);
  });

  it("bootstraps only session metadata and lists seeded products separately", async () => {
    const client = agent();
    await login(client);
    const response = await client.get("/api/bootstrap").expect(200);
    expect(response.body.data.products).toBeUndefined();
    expect(response.body.data.customers).toBeUndefined();
    expect(response.body.data.customerDocuments).toBeUndefined();
    expect(response.body.data.settings.companyName).toBe("Climature");
    expect(response.body.data.user.role).toBe("admin");
    expect(response.body.data.references.apiVersion).toBe(2);
    expect((await client.get("/api/products?pageSize=25").expect(200)).body.items.length).toBeGreaterThan(0);
  });

  it("beheert voorraad met minimumwaarden en een controleerbare mutatie", async () => {
    const client = agent();
    await login(client);
    const product = await prisma.product.findFirst({ orderBy: { name: "asc" } });
    const response = await client.put(`/api/inventory/${product.id}`).send({
      quantity: "7,5",
      minimumStock: 3,
      stockUnit: "stuk",
      stockLocation: "Magazijn A, vak 3",
      reason: "Voorraadtelling test"
    }).expect(200);

    expect(response.body.item).toMatchObject({ stockQuantity: 7.5, minimumStock: 3, stockLocation: "Magazijn A, vak 3" });
    const overview = await client.get("/api/inventory").expect(200);
    expect(overview.body.movements[0]).toMatchObject({ productId: product.id, delta: 7.5, reason: "Voorraadtelling test" });
  });

  it("voegt voorraadproducten toe vanuit een echt Excel-bestand", async () => {
    const client = agent();
    await login(client);
    const response = await client.post("/api/inventory/import")
      .attach("file", inventoryWorkbookBuffer(), { filename: "voorraad.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
      .expect(201);

    expect(response.body.summary).toMatchObject({ total: 1, created: 1, updated: 0 });
    const product = await prisma.product.findUnique({ where: { sku: "WP-100" } });
    expect(product).toMatchObject({ name: "Model 100", stockQuantity: expect.anything(), stockLocation: "Magazijn A" });
    expect(Number(product.stockQuantity)).toBe(8);
  });

  it("downloadt een geldig Excel-sjabloon voor de voorraadimport", async () => {
    const client = agent();
    await login(client);
    const response = await client.get("/api/inventory/template")
      .buffer(true)
      .parse(binaryParser)
      .expect("Content-Type", /spreadsheetml/)
      .expect("Content-Disposition", /climature-voorraad-import\.xlsx/)
      .expect(200);

    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(response.body.subarray(0, 2).toString("ascii")).toBe("PK");
  });

  it("serves scoped summaries, details, dashboards and server-side reports", async () => {
    const client = agent();
    await login(client);
    const customer = await createCustomer(client);
    const quoteNumber = (await client.post("/api/counters/quote/next").expect(200)).body.value;
    const quote = (await client.post("/api/collections/quotes").send({
      quoteNumber,
      customerId: customer.id,
      quoteDate: "2026-07-01",
      validUntil: "2026-08-01",
      status: "verstuurd",
      notes: "Dit zware detail hoort niet in de lijstprojectie.",
      lines: [{ description: "Warmtepomp", qty: 1, unit: "stuk", priceExVat: 1000, vatRate: 21 }]
    }).expect(200)).body.item;
    const invoiceNumber = (await client.post("/api/counters/invoice/next").expect(200)).body.value;
    const invoice = (await client.post("/api/collections/invoices").send({
      invoiceNumber,
      customerId: customer.id,
      invoiceDate: "2026-07-02",
      dueDate: "2026-07-16",
      status: "verzonden",
      lines: quote.lines
    }).expect(200)).body.item;

    const list = await client.get("/api/quotes?view=summary&page=1&pageSize=25").expect(200);
    expect(list.body).toMatchObject({ page: 1, pageSize: 25, totalItems: 1, totalPages: 1 });
    expect(list.body.items[0]).toMatchObject({ id: quote.id, quoteNumber, customer: { companyName: customer.companyName } });
    expect(list.body.items[0].lines).toBeUndefined();
    expect(list.body.items[0].notes).toBeUndefined();
    expect((await client.get(`/api/customers/${customer.id}`).expect(200)).body.item.id).toBe(customer.id);
    expect((await client.get(`/api/quotes/${quote.id}`).expect(200)).body.item.lines).toHaveLength(1);
    expect((await client.get(`/api/invoices/${invoice.id}`).expect(200)).body.item.lines).toHaveLength(1);
    await client.get("/api/quotes/not-a-real-id").expect(404);

    const dashboard = await client.get("/api/dashboard/finance").expect(200);
    expect(dashboard.body.metrics).toMatchObject({ openInvoices: 1, outstandingAmount: 1210 });
    expect(dashboard.body.items.urgentInvoices).toHaveLength(1);
    const report = await client.get("/api/reports/summary?from=2026-07-01&to=2026-07-31").expect(200);
    expect(report.body).toMatchObject({ totals: { count: 1, subtotal: 1000, vat: 210, total: 1210, outstanding: 1210 } });
    expect(report.body.revenueSeries).toEqual([{ period: "2026-07", count: 1, amount: 1210 }]);
    expect(report.body.statuses).toEqual([{ status: "verzonden", count: 1, amount: 1210 }]);
    expect(report.body.topCustomers[0]).toMatchObject({ customerId: customer.id, count: 1, amount: 1210 });
    const csv = await client.get("/api/reports/export?dataset=invoices&from=2026-07-01&to=2026-07-31").expect("Content-Type", /text\/csv/).expect(200);
    expect(csv.text).toContain(invoiceNumber);
    expect(csv.text).toContain("1210,00");
  });

  it("creates one concept invoice directly from an accepted quote", async () => {
    const client = agent();
    await login(client);
    const customer = await createCustomer(client);
    const quoteNumber = (await client.post("/api/counters/quote/next").expect(200)).body.value;
    const quote = (await client.post("/api/collections/quotes").send({
      quoteNumber,
      customerId: customer.id,
      quoteDate: "2026-07-18",
      validUntil: "2026-08-18",
      status: "geaccepteerd",
      notes: "Conform geaccepteerde offerte.",
      lines: [
        { description: "Warmtepomp inclusief installatie", qty: 1, unit: "stuk", priceExVat: 10000, vatRate: 21 },
        { description: "Actiekorting", qty: 1, unit: "post", priceExVat: -500, vatRate: 21, lineKind: "discount" }
      ]
    }).expect(200)).body.item;

    const responses = await Promise.all([
      client.post(`/api/quotes/${quote.id}/invoice`).send({}),
      client.post(`/api/quotes/${quote.id}/invoice`).send({})
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(responses[0].body.item.id).toBe(responses[1].body.item.id);
    expect(responses[0].body.item).toMatchObject({
      quoteNumber,
      customerId: customer.id,
      status: "concept",
      subtotal: 9500,
      vat: 1995,
      total: 11495
    });
    expect(responses[0].body.item.lines.map((line) => line.description)).toEqual([
      "Warmtepomp inclusief installatie",
      "Actiekorting"
    ]);
    expect(await prisma.invoice.count({ where: { quoteNumber } })).toBe(1);
  });

  it("does not invoice a quote before it is accepted", async () => {
    const client = agent();
    await login(client);
    const customer = await createCustomer(client);
    const quoteNumber = (await client.post("/api/counters/quote/next").expect(200)).body.value;
    const quote = (await client.post("/api/collections/quotes").send({
      quoteNumber,
      customerId: customer.id,
      quoteDate: "2026-07-18",
      validUntil: "2026-08-18",
      status: "concept",
      lines: [{ description: "Installatie", qty: 1, unit: "post", priceExVat: 1000, vatRate: 21 }]
    }).expect(200)).body.item;

    await client.post(`/api/quotes/${quote.id}/invoice`).send({}).expect(409);
    expect(await prisma.invoice.count({ where: { quoteNumber } })).toBe(0);
  });

  it("creates customers, quotes, invoices and installations", async () => {
    const client = agent();
    await login(client);
    const customer = await createCustomer(client);
    const quoteNumber = (await client.post("/api/counters/quote/next").expect(200)).body.value;
    const quote = (await client.post("/api/collections/quotes").send({
      quoteNumber,
      customerId: customer.id,
      quoteDate: "2026-07-08",
      validUntil: "2026-08-07",
      status: "geaccepteerd",
      templateType: "warmtepomp",
      designStyle: "donker",
      documentTitle: "Comfortabel en energiezuinig verwarmen",
      introText: "Een oplossing afgestemd op de woning.",
      includedText: "Warmtepomp\nInstallatie\nInbedrijfstelling",
      advantagesText: "Minder gasverbruik\nMeer comfort",
      benefitType: "subsidie",
      benefitLabel: "Verwachte ISDE-subsidie",
      benefitAmount: 3025,
      documentConfig: { version: 2, pages: [{ id: "cover", enabled: true, order: 0 }], financial: { yearlySaving: 1200 } },
      lines: [{ description: "Warmtepomp", qty: 1, unit: "stuk", priceExVat: 1000, vatRate: 21 }]
    }).expect(200)).body.item;
    expect(quote.lines[0].total).toBe(1210);
    expect(quote.templateType).toBe("warmtepomp");
    expect(quote.designStyle).toBe("donker");
    expect(quote.benefitAmount).toBe(3025);
    expect(quote.documentConfig.version).toBe(2);

    const invoiceNumber = (await client.post("/api/counters/invoice/next").expect(200)).body.value;
    const invoice = (await client.post("/api/collections/invoices").send({
      invoiceNumber,
      quoteNumber,
      customerId: customer.id,
      invoiceDate: "2026-07-08",
      dueDate: "2026-07-22",
      status: "verzonden",
      lines: quote.lines
    }).expect(200)).body.item;
    expect(invoice.total).toBe(1210);

    await client.post("/api/collections/installations").send({
      customerId: customer.id,
      quoteId: quote.id,
      quoteNumber,
      plannedDate: "2026-07-30",
      startTime: "09:00",
      durationHours: 4
    }).expect(200);

    const document = (await client.post(`/api/customers/${customer.id}/documents`)
      .attach("file", Buffer.from("%PDF-1.4\n%%EOF"), { filename: "scan.pdf", contentType: "application/pdf" })
      .expect(201)).body.item;
    expect(document.fileName).toBe("scan.pdf");

    const documents = await client.get(`/api/documents?customerId=${customer.id}&pageSize=25`).expect(200);
    expect(documents.body.items).toHaveLength(1);
    expect(documents.body.items[0].content).toBeUndefined();
  });

  it("stores normalized quote images and protects their content", async () => {
    const client = agent();
    await login(client);
    const customer = await createCustomer(client);
    const quoteNumber = (await client.post("/api/counters/quote/next").expect(200)).body.value;
    const quote = (await client.post("/api/collections/quotes").send({
      quoteNumber, customerId: customer.id, quoteDate: "2026-07-17", validUntil: "2026-08-16", status: "concept",
      lines: [{ description: "Thuisbatterij", qty: 1, unit: "stuk", priceExVat: 1000, vatRate: 21 }]
    }).expect(200)).body.item;
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    const asset = (await client.post(`/api/quotes/${quote.id}/assets`).attach("file", png, { filename: "product.png", contentType: "image/png" }).expect(201)).body.item;
    expect(asset.mimeType).toBe("image/webp");
    expect(asset.width).toBe(1);
    await client.get(`/api/quote-assets/${asset.id}/content`).expect("Content-Type", /image\/webp/).expect(200);
    await client.delete(`/api/quote-assets/${asset.id}`).expect(200);
    await client.get(`/api/quote-assets/${asset.id}/content`).expect(404);
  });

  it("stores combination quotes, recalculates eligible VAT and keeps benefits out of invoices", async () => {
    const client = agent();
    await login(client);
    const customer = await createCustomer(client);
    const quoteNumber = (await client.post("/api/counters/quote/next").expect(200)).body.value;
    const quote = (await client.post("/api/collections/quotes").send({
      quoteNumber,
      customerId: customer.id,
      quoteDate: "2026-07-18",
      validUntil: "2026-08-17",
      status: "geaccepteerd",
      templateType: "combinatie",
      documentConfig: { version: 3, components: [{ key: "thuisbatterij", type: "thuisbatterij", title: "Thuisbatterij" }, { key: "warmtepomp", type: "warmtepomp", title: "Warmtepomp" }] },
      benefits: [
        { id: "vat", type: "btw_refund", label: "Mogelijke btw-teruggave", amount: 9999, componentKey: "thuisbatterij", calculationMode: "eligible_vat", reviewed: true },
        { id: "isde", type: "isde", label: "Verwachte ISDE-subsidie", amount: 3025, componentKey: "warmtepomp", calculationMode: "advice", reviewed: false }
      ],
      lines: [
        { description: "Thuisbatterij", qty: 1, unit: "pakket", priceExVat: 10000, vatRate: 21, componentKey: "thuisbatterij", lineKind: "item", vatRefundEligible: true },
        { description: "Combinatiekorting batterij", qty: 1, unit: "post", priceExVat: 500, vatRate: 21, componentKey: "thuisbatterij", lineKind: "discount", vatRefundEligible: true },
        { description: "Warmtepomp", qty: 1, unit: "pakket", priceExVat: 8000, vatRate: 21, componentKey: "warmtepomp", lineKind: "item", vatRefundEligible: false }
      ]
    }).expect(200)).body.item;

    expect(quote.templateType).toBe("combinatie");
    expect(quote.lines).toHaveLength(3);
    expect(quote.lines[1]).toMatchObject({ lineKind: "discount", priceExVat: -500, componentKey: "thuisbatterij", vatRefundEligible: true });
    expect(quote.total).toBe(21175);
    expect(quote.benefits).toEqual([
      expect.objectContaining({ type: "btw_refund", amount: 1995, reviewed: true }),
      expect.objectContaining({ type: "isde", amount: 3025, reviewed: false })
    ]);

    const invoiceNumber = (await client.post("/api/counters/invoice/next").expect(200)).body.value;
    const invoice = (await client.post("/api/collections/invoices").send({
      invoiceNumber,
      quoteNumber,
      customerId: customer.id,
      invoiceDate: "2026-07-18",
      dueDate: "2026-08-01",
      status: "concept",
      lines: quote.lines
    }).expect(200)).body.item;
    expect(invoice.total).toBe(quote.total);
    expect(invoice.lines.some((line) => line.description === "Combinatiekorting batterij" && line.priceExVat === -500)).toBe(true);
    expect(invoice.lines.some((line) => /ISDE|teruggave/i.test(line.description))).toBe(false);
  });

  it("creates sales opportunities and includes them in backups", async () => {
    const client = agent();
    await login(client);
    const customer = await createCustomer(client);
    const opportunity = (await client.post("/api/collections/salesOpportunities").send({
      title: "Thuisbatterij familie Test",
      stage: "contact",
      customerId: customer.id,
      contactName: "Test Klant",
      source: "Website",
      expectedValue: 9500,
      probability: 25,
      followUpDate: "2026-07-12"
    }).expect(200)).body.item;

    expect(opportunity.stage).toBe("contact");
    expect(opportunity.customerId).toBe(customer.id);

    const appointment = (await client.post("/api/collections/salesAppointments").send({
      title: "Kennismakingsgesprek",
      type: "videogesprek",
      date: "2026-07-16",
      startTime: "10:00",
      endTime: "10:45",
      customerId: customer.id,
      opportunityId: opportunity.id,
      contactName: "Test Klant"
    }).expect(200)).body.item;
    expect(appointment.opportunityId).toBe(opportunity.id);

    expect((await client.get("/api/sales-opportunities?pageSize=25").expect(200)).body.items).toHaveLength(1);
    expect((await client.get("/api/sales-appointments?pageSize=25").expect(200)).body.items).toHaveLength(1);

    const backup = (await client.get("/api/backup/export").expect(200)).body;
    await data.resetData(prisma);
    await client.post("/api/backup/import").send(backup).expect(200);
    expect((await client.get("/api/sales-opportunities?pageSize=25").expect(200)).body.items).toHaveLength(1);
    expect((await client.get("/api/sales-appointments?pageSize=25").expect(200)).body.items).toHaveLength(1);

    await client.post("/api/collections/salesAppointments").send({
      ...appointment,
      endTime: "09:30"
    }).expect(400);

    await client.delete(`/api/collections/salesOpportunities/${opportunity.id}`).expect(200);
    expect((await client.get("/api/sales-opportunities?pageSize=25").expect(200)).body.items).toHaveLength(0);
  });

  it("syncs linked sales opportunities when quote status changes", async () => {
    const client = agent();
    await login(client);
    const customer = await createCustomer(client);
    const quote = (await client.post("/api/collections/quotes").send({
      quoteNumber: "CL-OFF-2026-7777",
      customerId: customer.id,
      quoteDate: "2026-07-08",
      validUntil: "2026-08-07",
      status: "verstuurd",
      lines: [{ description: "Warmtepomp", qty: 1, unit: "stuk", priceExVat: 1000, vatRate: 21 }]
    }).expect(200)).body.item;
    const opportunity = (await client.post("/api/collections/salesOpportunities").send({
      title: "Warmtepomp offerte",
      stage: "offerte_verstuurd",
      customerId: customer.id,
      quoteId: quote.id,
      contactName: "Test Klant",
      expectedValue: 1210,
      probability: 70
    }).expect(200)).body.item;

    await client.post("/api/collections/quotes").send({
      ...quote,
      status: "geaccepteerd/aanbetaling",
      lines: quote.lines
    }).expect(200);

    const listed = await client.get(`/api/sales-opportunities?quoteId=${quote.id}&pageSize=25`).expect(200);
    const synced = listed.body.items.find((item) => item.id === opportunity.id);
    expect(synced.stage).toBe("gewonnen");
    expect(synced.probability).toBe(100);
  });

  it("blocks duplicate final invoices for the same quote", async () => {
    const client = agent();
    await login(client);
    const customer = await createCustomer(client);
    const body = {
      quoteNumber: "CL-OFF-2026-9999",
      customerId: customer.id,
      invoiceDate: "2026-07-08",
      dueDate: "2026-07-22",
      status: "verzonden",
      lines: [{ description: "Werk", qty: 1, unit: "post", priceExVat: 100, vatRate: 21 }]
    };
    await client.post("/api/collections/invoices").send({ ...body, invoiceNumber: "CL-FAC-2026-0001" }).expect(200);
    await client.post("/api/collections/invoices").send({ ...body, invoiceNumber: "CL-FAC-2026-0002" }).expect(409);
  });

  it("persists settings and imports exported backups", async () => {
    const client = agent();
    await login(client);
    await client.put("/api/settings").send({ companyName: "Climature Test" }).expect(200);
    expect((await client.get("/api/settings").expect(200)).body.item.companyName).toBe("Climature Test");
    const backup = (await client.get("/api/backup/export").expect(200)).body;
    await data.resetData(prisma);
    await client.post("/api/backup/import").send(backup).expect(200);
    expect((await client.get("/api/settings").expect(200)).body.item.companyName).toBe("Climature Test");
  });

  it("stores only secure Google Business Profile links", async () => {
    const client = agent();
    await login(client);
    const googleBusinessProfile = { profileUrl: "https://maps.app.goo.gl/climature", reviewUrl: "https://g.page/r/climature/review" };
    const saved = await client.put("/api/settings").send({ googleBusinessProfile }).expect(200);
    expect(saved.body.item.googleBusinessProfile).toEqual(googleBusinessProfile);
    await client.put("/api/settings").send({ googleBusinessProfile: { profileUrl: "javascript:alert(1)", reviewUrl: "" } }).expect(400);
  });
});

describe("secure HR portal", () => {
  it("decrypts historical key versions and encrypts new data with the active key", () => {
    const oldKey = Buffer.alloc(32, 3).toString("base64");
    const newKey = Buffer.alloc(32, 4).toString("base64");
    const oldConfig = { hrEncryptionKey: oldKey, hrEncryptionKeys: { v1: oldKey }, hrKeyVersion: "v1" };
    const historical = encrypt(oldConfig, "historische HR-data");
    const rotatedConfig = { hrEncryptionKeys: { v1: oldKey, v2: newKey }, hrKeyVersion: "v2" };
    expect(decrypt(rotatedConfig, historical.cipher, historical.iv, historical.tag, historical.keyVersion).toString("utf8")).toBe("historische HR-data");
    const current = encrypt(rotatedConfig, "nieuwe HR-data");
    expect(current.keyVersion).toBe("v2");
    expect(decrypt(rotatedConfig, current.cipher, current.iv, current.tag, "v2").toString("utf8")).toBe("nieuwe HR-data");
    expect(() => decrypt(rotatedConfig, historical.cipher, historical.iv, historical.tag, "missing")).toThrow(/sleutelversie/i);
  });

  function hrAgent() {
    return request.agent(hrApp);
  }

  async function createEmployee(client, overrides = {}) {
    return (await client.post("/api/hr/employees").send({
      employeeNumber: "CL-001",
      firstName: "Sam",
      lastName: "Monteur",
      workEmail: "sam@climature.nl",
      workPhone: "0612345678",
      jobTitle: "Installateur",
      department: "Uitvoering",
      status: "active",
      employmentType: "permanent",
      hoursPerWeek: 40,
      startDate: "2026-01-01",
      privateEmail: "sam.prive@example.com",
      privatePhone: "0687654321",
      address: "Privéstraat 1",
      postalCode: "1234 AB",
      city: "Utrecht",
      emergencyContactName: "Alex",
      emergencyContactPhone: "0611111111",
      ...overrides
    }).expect(201)).body.item;
  }

  it("blocks installers from the HR shell, APIs and employee identifiers", async () => {
    const admin = hrAgent();
    await login(admin);
    await admin.post("/api/users").send({ username: "installer", password: "installer-pass", role: "installer" }).expect(200);
    const installer = hrAgent();
    await installer.post("/api/auth/login").send({ username: "installer", password: "installer-pass" }).expect(200);
    await installer.get("/medewerkers/").expect(403);
    await installer.get("/api/hr/session").expect(403);
    await installer.get("/api/hr/employees").expect(403);
    await installer.get("/api/hr/skills-matrix").expect(403);
    await installer.get("/api/hr/qualification-definitions").expect(403);
    await installer.get("/api/hr/checklist-templates").expect(403);
    await installer.get("/api/admin/employee-directory").expect(403);
  });

  it("sets up MFA, stores private data encrypted and audits employee actions", async () => {
    const client = hrAgent();
    await login(client);
    const recoveryCodes = await enableHr(client);
    const employee = await createEmployee(client);
    expect(employee.privateEmail).toBe("sam.prive@example.com");

    const stored = await prisma.employee.findUnique({ where: { id: employee.id } });
    expect(stored.privateDataCipher).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(stored.privateDataCipher).toString("utf8")).not.toContain("sam.prive@example.com");

    await client.post(`/api/hr/employees/${employee.id}/notes`).send({ category: "agreement", body: "Interne afspraak" }).expect(201);
    const note = await prisma.employeeNote.findFirst({ where: { employeeId: employee.id } });
    expect(Buffer.from(note.bodyCipher).toString("utf8")).not.toContain("Interne afspraak");

    const audit = await client.get(`/api/hr/employees/${employee.id}/audit`).expect(200);
    expect(audit.body.items.map((item) => item.action)).toEqual(expect.arrayContaining(["employee.created", "note.created"]));

    await client.put(`/api/hr/employees/${employee.id}`).send({ ...employee, status: "archived" }).expect(200);
    await client.post(`/api/hr/employees/${employee.id}/purge`).send({
      confirmEmployeeNumber: employee.employeeNumber,
      password: "test-password",
      code: recoveryCodes[0]
    }).expect(200);
    expect(await prisma.employee.findUnique({ where: { id: employee.id } })).toBeNull();
    expect(await prisma.hrAuditEvent.findFirst({ where: { entityId: employee.id, action: "employee.purged" } })).toBeTruthy();
  });

  it("scans, encrypts and downloads PDF contracts without exposing them in backups", async () => {
    const client = hrAgent();
    await login(client);
    await enableHr(client);
    const employee = await createEmployee(client);
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");
    const uploaded = await client.post(`/api/hr/employees/${employee.id}/contracts`)
      .field("title", "Arbeidsovereenkomst")
      .field("contractType", "permanent")
      .field("startDate", "2026-01-01")
      .field("endDate", "2027-01-01")
      .field("hoursPerWeek", "40")
      .attach("file", pdf, { filename: "contract.pdf", contentType: "application/pdf" })
      .expect(201);
    expect(uploaded.body.item.scanStatus).toBe("clean");

    const stored = await prisma.employmentContract.findUnique({ where: { id: uploaded.body.item.id } });
    expect(stored.storageKey).toMatch(/^hr\/contracts\//);
    expect(Object.prototype.hasOwnProperty.call(stored, "fileCipher")).toBe(false);
    const downloaded = await client.get(`/api/hr/employees/${employee.id}/contracts/${stored.id}/download`).expect(200);
    expect(Buffer.from(downloaded.body).equals(pdf)).toBe(true);
    expect(downloaded.headers["cache-control"]).toContain("no-store");

    await client.post(`/api/hr/employees/${employee.id}/contracts`)
      .field("title", "Ongeldig")
      .field("startDate", "2026-01-01")
      .attach("file", Buffer.from("not a pdf"), { filename: "fake.pdf", contentType: "application/pdf" })
      .expect(400);

    const backup = await client.get("/api/backup/export").expect(200);
    expect(backup.body.data.employees).toBeUndefined();
    expect(JSON.stringify(backup.body)).not.toContain("sam.prive@example.com");
    expect(JSON.stringify(backup.body)).not.toContain("contract.pdf");
  });

  it("provides only a safe active-worker projection to CRM installation planning", async () => {
    const client = hrAgent();
    await login(client);
    await enableHr(client);
    const employee = await createEmployee(client);
    const directory = await client.get("/api/admin/employee-directory").expect(200);
    expect(directory.body.items).toEqual([{ id: employee.id, displayName: "Sam Monteur", jobTitle: "Installateur", active: true, qualified: false, warnings: [{ code: "missing", label: "VCA", minimumLevel: "" }] }]);
    expect(JSON.stringify(directory.body)).not.toContain("sam.prive@example.com");

    const customer = await createCustomer(client);
    const installation = (await client.post("/api/collections/installations").send({
      customerId: customer.id,
      plannedDate: "2026-08-01",
      workType: "other",
      employeeId: employee.id,
      installer: "Wordt overschreven"
    }).expect(200)).body.item;
    expect(installation.installer).toBe("Sam Monteur");
    expect(installation.employeeId).toBe(employee.id);
    expect(installation.qualificationCheck.qualified).toBe(false);
    expect(installation.qualificationCheck.warnings[0].qualificationCode).toBe("VCA");

    await client.post("/api/users").send({ username: "field", password: "installer-pass", role: "installer", employeeId: employee.id }).expect(200);
    const installer = hrAgent();
    await installer.post("/api/auth/login").send({ username: "field", password: "installer-pass" }).expect(200);
    const installations = await installer.get("/api/installations?pageSize=25").expect(200);
    expect(installations.body.items[0].installer).toBe("Sam Monteur");
    expect(installations.body.items[0].employeeId).toBeUndefined();
    expect(installations.body.items[0].qualificationCheck).toBeUndefined();
  });

  it("evaluates qualification evidence and validity against the planned date", async () => {
    const client = hrAgent();
    await login(client);
    await enableHr(client);
    const employee = await createEmployee(client);
    const definitions = (await client.get("/api/hr/qualification-definitions").expect(200)).body.items;
    const vca = definitions.find((item) => item.code === "VCA");
    const pdf = Buffer.from("%PDF-1.4\nqualification\n%%EOF");

    const uploaded = await client.post(`/api/hr/employees/${employee.id}/qualifications`)
      .field("definitionId", vca.id)
      .field("issuer", "Erkende opleider")
      .field("certificateNumber", "VCA-123")
      .field("issueDate", "2026-01-01")
      .field("expiryDate", "2026-08-01")
      .field("note", "Alleen intern zichtbaar")
      .attach("file", pdf, { filename: "vca.pdf", contentType: "application/pdf" })
      .expect(201);
    expect(uploaded.body.item.evidenceScanStatus).toBe("clean");

    const stored = await prisma.employeeQualification.findUnique({ where: { id: uploaded.body.item.id } });
    expect(stored.evidenceStorageKey).toMatch(/^hr\/qualifications\//);
    expect(Object.prototype.hasOwnProperty.call(stored, "evidenceCipher")).toBe(false);
    expect(Buffer.from(stored.noteCipher).toString("utf8")).not.toContain("Alleen intern zichtbaar");

    const onBoundary = await client.get("/api/admin/employee-directory?workType=other&plannedDate=2026-08-01").expect(200);
    expect(onBoundary.body.items[0]).toMatchObject({ qualified: true, warnings: [] });
    const practical = definitions.find((item) => item.code === "PRACTICAL_SKILL");
    await client.post("/api/hr/qualification-requirements").send({ workType: "other", definitionId: practical.id, minimumLevel: "independent", active: true }).expect(200);
    const skill = (await client.post(`/api/hr/employees/${employee.id}/qualifications`)
      .field("definitionId", practical.id)
      .field("skillLevel", "basic")
      .field("issueDate", "2026-01-01")
      .expect(201)).body.item;
    const insufficient = await client.get("/api/admin/employee-directory?workType=other&plannedDate=2026-08-01").expect(200);
    expect(insufficient.body.items[0].warnings).toEqual([expect.objectContaining({ code: "insufficient_level", label: "Praktische vakvaardigheid" })]);
    await client.put(`/api/hr/employees/${employee.id}/qualifications/${skill.id}`)
      .field("definitionId", practical.id)
      .field("skillLevel", "specialist")
      .field("issueDate", "2026-01-01")
      .expect(200);
    expect((await client.get("/api/admin/employee-directory?workType=other&plannedDate=2026-08-01").expect(200)).body.items[0].qualified).toBe(true);
    const expired = await client.get("/api/admin/employee-directory?workType=other&plannedDate=2026-08-02").expect(200);
    expect(expired.body.items[0].warnings).toEqual([expect.objectContaining({ code: "expired", label: "VCA" })]);

    const airco = await client.get("/api/admin/employee-directory?workType=air_conditioning&plannedDate=2026-08-01").expect(200);
    expect(airco.body.items[0].warnings).toEqual([expect.objectContaining({ code: "missing", label: "F-gassen / BRL 200" })]);
    const requirements = (await client.get("/api/hr/qualification-requirements").expect(200)).body.items;
    const fGasRequirement = requirements.find((item) => item.workType === "air_conditioning" && item.definition.code === "FGAS_BRL200");
    await client.delete(`/api/hr/qualification-requirements/${fGasRequirement.id}`).expect(200);
    const afterConfigurationChange = await client.get("/api/admin/employee-directory?workType=air_conditioning&plannedDate=2026-08-01").expect(200);
    expect(afterConfigurationChange.body.items[0]).toMatchObject({ qualified: true, warnings: [] });
    const download = await client.get(`/api/hr/employees/${employee.id}/qualifications/${stored.id}/download`).expect(200);
    expect(Buffer.from(download.body).equals(pdf)).toBe(true);
    expect(download.headers["cache-control"]).toContain("no-store");
    expect(JSON.stringify((await client.get("/api/backup/export").expect(200)).body)).not.toContain("vca.pdf");
  });

  it("creates versioned onboarding and offboarding checklists without duplicates", async () => {
    const client = hrAgent();
    await login(client);
    await enableHr(client);
    const employee = await createEmployee(client);
    let checklists = (await client.get(`/api/hr/employees/${employee.id}/checklists`).expect(200)).body.items;
    expect(checklists.filter((item) => item.type === "onboarding")).toHaveLength(1);
    expect(checklists[0].items.map((item) => item.title)).toContain("Contract ondertekend");
    expect(checklists[0].items[0].dueDate).toBe("2025-12-25");
    const dashboard = await client.get("/api/hr/dashboard").expect(200);
    expect(dashboard.body.checklistOverdue).toBeGreaterThan(0);
    expect(dashboard.body.checklistTasks[0].employee.displayName).toBe("Sam Monteur");
    expect(dashboard.body.qualificationMissing).toBe(1);

    const users = (await client.get("/api/users").expect(200)).body.items;
    await client.put(`/api/hr/checklists/${checklists[0].id}/items/${checklists[0].items[0].id}`).send({
      status: "completed", dueDate: checklists[0].items[0].dueDate, assignedToId: users[0].id, note: "Afgetekend"
    }).expect(200);
    const storedTask = await prisma.employeeChecklistItem.findUnique({ where: { id: checklists[0].items[0].id } });
    expect(Buffer.from(storedTask.noteCipher).toString("utf8")).not.toContain("Afgetekend");

    await client.put(`/api/hr/employees/${employee.id}`).send({ ...employee, status: "ended", endDate: "2026-12-31" }).expect(200);
    await client.put(`/api/hr/employees/${employee.id}`).send({ ...employee, status: "archived", endDate: "2026-12-31" }).expect(200);
    checklists = (await client.get(`/api/hr/employees/${employee.id}/checklists`).expect(200)).body.items;
    expect(checklists.filter((item) => item.type === "offboarding")).toHaveLength(1);
    expect(checklists.find((item) => item.type === "offboarding").items.map((item) => item.title)).toContain("Accounts geblokkeerd");

    const templates = (await client.get("/api/hr/checklist-templates").expect(200)).body.items;
    const onboarding = templates.find((item) => item.type === "onboarding");
    await client.put("/api/hr/checklist-templates/onboarding").send({ name: "Onboarding nieuw", active: true, items: [{ title: "Nieuwe taak", description: "Nieuwe versie", dueOffsetDays: 0, required: true }] }).expect(200);
    const existing = (await client.get(`/api/hr/employees/${employee.id}/checklists`).expect(200)).body.items.find((item) => item.type === "onboarding");
    expect(existing.templateVersion).toBe(onboarding.version);
    expect(existing.items.map((item) => item.title)).toContain("Contract ondertekend");
  });

  it("enforces origin, CSRF tokens and immediate session invalidation", async () => {
    const client = hrAgent();
    await login(client);
    const session = await client.get("/api/auth/session").expect(200);
    await client.post("/api/users").set("Host", "portal.test").set("Origin", "http://portal.test").send({ username: "blocked", password: "blocked-password", role: "installer" }).expect(403);
    await client.post("/api/users").set("Host", "portal.test").set("Origin", "http://portal.test").set("X-CSRF-Token", session.body.csrfToken).send({ username: "allowed", password: "allowed-password", role: "installer" }).expect(200);

    const installer = hrAgent();
    await installer.post("/api/auth/login").send({ username: "allowed", password: "allowed-password" }).expect(200);
    const allowed = (await client.get("/api/users").expect(200)).body.items.find((item) => item.username === "allowed");
    await client.put(`/api/users/${allowed.id}`).send({ active: false }).expect(200);
    await installer.get("/api/bootstrap").expect(401);

    await request(hrApp).get("/package.json").expect(404);
    await request(hrApp).get("/hr/index.html").expect(404);
    const root = await request(hrApp).get("/").expect(200);
    expect(root.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(root.headers["content-security-policy"]).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it("rejects replayed recovery codes and fails closed without a malware scanner", async () => {
    const client = hrAgent();
    await login(client);
    const recoveryCodes = await enableHr(client);
    await client.post("/api/hr/lock").expect(200);
    await client.post("/api/hr/elevate").send({ password: "test-password", code: recoveryCodes[0] }).expect(200);
    await client.post("/api/hr/lock").expect(200);
    await client.post("/api/hr/elevate").send({ password: "test-password", code: recoveryCodes[0] }).expect(401);

    const scan = await scanWithClamav({ isProduction: true, clamavHost: "", allowUnscannedHrFiles: false }, Buffer.from("%PDF-test"));
    expect(scan).toMatchObject({ clean: false, unavailable: true });

    const config = { hrEncryptionKey: Buffer.alloc(32, 7).toString("base64"), hrKeyVersion: "v1" };
    const encrypted = encrypt(config, "gevoelig");
    expect(() => decrypt({ ...config, hrEncryptionKey: Buffer.alloc(32, 8).toString("base64") }, encrypted.cipher, encrypted.iv, encrypted.tag)).toThrow(/veilig worden geopend/);
  });
});

describe("payments and cash settlement", () => {
  async function createInvoice(client, total = 100) {
    const customer = await createCustomer(client);
    const invoiceNumber = (await client.post("/api/counters/invoice/next").expect(200)).body.value;
    const item = (await client.post("/api/collections/invoices").send({
      invoiceNumber,
      customerId: customer.id,
      invoiceDate: "2026-07-19",
      dueDate: "2026-08-02",
      status: "verzonden",
      lines: [{ description: "Betalingstest", qty: 1, unit: "stuk", priceExVat: total, vatRate: 0 }]
    }).expect(200)).body.item;
    return { customer, invoice: item };
  }

  async function openDrawer(client, openingBalance = 100) {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const drawer = (await client.post("/api/cash-drawers").send({ name: `Testlade ${suffix}` }).expect(201)).body.item;
    const shift = (await client.post(`/api/cash-drawers/${drawer.id}/shifts`).send({ openingBalance }).expect(201)).body.item;
    return { drawer, shift };
  }

  it("supports partial, split and multiple tenders with discount, tip and immutable receipt snapshots", async () => {
    const client = agent();
    await login(client);
    const { invoice } = await createInvoice(client, 121);
    const { shift } = await openDrawer(client);
    const createKey = `mixed-create-${Date.now()}`;
    const partial = (await client.post("/api/payments").set("Idempotency-Key", createKey).send({
      invoiceId: invoice.id,
      discountAmount: 11,
      discountReason: "Loyaliteitskorting",
      tipAmount: 5,
      tenders: [
        { type: "cash", amount: 40, amountReceived: 50, shiftId: shift.id },
        { type: "pin", amount: 25, provider: "adyen", externalReference: `pin-${Date.now()}` }
      ]
    }).expect(201)).body.item;
    expect(partial).toMatchObject({ status: "partially_paid", subtotal: 121, discountAmount: 11, tipAmount: 5, totalAmount: 115, paidAmount: 65 });
    expect(partial.tenders.find((item) => item.type === "cash")).toMatchObject({ amount: 40, amountReceived: 50, changeAmount: 10 });
    expect(partial.receipts).toHaveLength(1);

    const addKey = `mixed-complete-${Date.now()}`;
    const completionBody = { tenders: [
      { type: "credit_card", amount: 10, provider: "stripe", externalReference: `card-${Date.now()}`, cardBrand: "visa", cardLast4: "4242" },
      { type: "apple_pay", amount: 20, provider: "stripe", externalReference: `apple-${Date.now()}` },
      { type: "google_pay", amount: 20, provider: "stripe", externalReference: `google-${Date.now()}` }
    ] };
    const completed = (await client.post(`/api/payments/${partial.id}/tenders`).set("Idempotency-Key", addKey).send(completionBody).expect(200)).body.item;
    expect(completed).toMatchObject({ status: "paid", paidAmount: 115, refundedAmount: 0 });
    expect(completed.tenders.map((item) => item.type)).toEqual(["cash", "pin", "credit_card", "apple_pay", "google_pay"]);
    expect(completed.receipts).toHaveLength(2);
    expect(new Set(completed.receipts.map((item) => item.number)).size).toBe(2);
    expect((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status).toBe("betaald");

    const replayed = (await client.post(`/api/payments/${partial.id}/tenders`).set("Idempotency-Key", addKey).send(completionBody).expect(200)).body.item;
    expect(replayed.tenders).toHaveLength(5);
    expect(replayed.receipts).toHaveLength(2);
    const history = (await client.get(`/api/payments/${partial.id}/history`).expect(200)).body;
    expect(history.verification).toMatchObject({ valid: true, entries: 6 });
    expect(history.ledger.map((item) => item.eventType)).toEqual(["payment.created", "tender.captured", "tender.captured", "tender.captured", "tender.captured", "tender.captured"]);
    const receipt = (await client.get(`/api/payments/receipts/${completed.receipts[0].number}`).expect(200)).body.item;
    expect(receipt.snapshot.payment).toMatchObject({ id: partial.id, discountAmount: "11.00", tipAmount: "5.00", totalAmount: "115.00" });
    expect(receipt.snapshot.tenders[0]).toMatchObject({ type: "cash", amountReceived: "50.00", changeAmount: "10.00" });

    await client.post("/api/payments").set("Idempotency-Key", `invalid-card-${Date.now()}`).send({
      amount: 10,
      tenders: [{ type: "credit_card", amount: 10, provider: "stripe", externalReference: `invalid-${Date.now()}`, cardNumber: "4242424242424242" }]
    }).expect(400);
  });

  it("records refunds and cancellations and settles the cash drawer atomically", async () => {
    const client = agent();
    await login(client);
    const { invoice } = await createInvoice(client, 100);
    const { shift } = await openDrawer(client, 100);
    const paid = (await client.post("/api/payments").set("Idempotency-Key", `refund-source-${Date.now()}`).send({
      invoiceId: invoice.id,
      tenders: [
        { type: "cash", amount: 60, amountReceived: 70, shiftId: shift.id },
        { type: "credit_card", amount: 40, provider: "stripe", externalReference: `refund-card-${Date.now()}`, cardBrand: "mastercard", cardLast4: "4444" }
      ]
    }).expect(201)).body.item;
    const cashTender = paid.tenders.find((item) => item.type === "cash");
    const cardTender = paid.tenders.find((item) => item.type === "credit_card");
    const refunded = (await client.post(`/api/payments/${paid.id}/refunds`).set("Idempotency-Key", `refund-op-${Date.now()}`).send({
      amount: 30,
      reason: "Gedeeltelijke retour",
      cashShiftId: shift.id,
      allocations: [
        { tenderId: cashTender.id, amount: 10 },
        { tenderId: cardTender.id, amount: 20, externalReference: `card-refund-${Date.now()}` }
      ]
    }).expect(201)).body.item;
    expect(refunded).toMatchObject({ status: "partially_refunded", paidAmount: 100, refundedAmount: 30 });
    expect((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status).toBe("verzonden");

    const repaid = (await client.post(`/api/payments/${paid.id}/tenders`).set("Idempotency-Key", `refund-repay-${Date.now()}`).send({
      tenders: [{ type: "google_pay", amount: 30, provider: "stripe", externalReference: `repay-${Date.now()}` }]
    }).expect(200)).body.item;
    expect(repaid).toMatchObject({ status: "paid", paidAmount: 130, refundedAmount: 30 });
    await client.post(`/api/payments/${paid.id}/cancel`).set("Idempotency-Key", `bad-cancel-${Date.now()}`).send({ reason: "Niet toegestaan na retour" }).expect(409);

    const cancellable = (await client.post("/api/payments").set("Idempotency-Key", `cancel-create-${Date.now()}`).send({
      amount: 20,
      tenders: [{ type: "cash", amount: 20, shiftId: shift.id }]
    }).expect(201)).body.item;
    const cancelled = (await client.post(`/api/payments/${cancellable.id}/cancel`).set("Idempotency-Key", `cancel-op-${Date.now()}`).send({ reason: "Klant ziet af van aankoop" }).expect(200)).body.item;
    expect(cancelled).toMatchObject({ status: "cancelled", paidAmount: 0, cancellationReason: "Klant ziet af van aankoop" });

    const firstLedger = await prisma.paymentLedgerEntry.findFirst({ where: { paymentId: paid.id }, orderBy: { sequence: "asc" } });
    await expect(prisma.paymentLedgerEntry.update({ where: { id: firstLedger.id }, data: { eventType: "tampered" } })).rejects.toThrow(/immutable payment record/i);
    const firstReceipt = await prisma.paymentReceipt.findFirst({ where: { paymentId: paid.id } });
    await expect(prisma.paymentReceipt.update({ where: { id: firstReceipt.id }, data: { kind: "cancellation" } })).rejects.toThrow(/immutable payment record/i);

    const closed = (await client.post(`/api/cash-drawer-shifts/${shift.id}/close`).send({ closingBalance: 148, notes: "Twee euro kasverschil" }).expect(200)).body.item;
    expect(closed.settlement).toMatchObject({ openingBalance: "100.00", cashPayments: "60.00", cashRefunds: "10.00", expectedClosingBalance: "150.00", closingBalance: "148.00", variance: "-2.00" });
    const shiftDetail = (await client.get(`/api/cash-drawer-shifts/${shift.id}`).expect(200)).body.item;
    expect(shiftDetail.ledgerVerification).toMatchObject({ valid: true, entries: 6 });
    await client.post("/api/payments").set("Idempotency-Key", `closed-cash-${Date.now()}`).send({
      amount: 5,
      tenders: [{ type: "cash", amount: 5, shiftId: shift.id }]
    }).expect(409);
  });

  it("serializes concurrent retries and never double-captures a tender", async () => {
    const client = agent();
    await login(client);
    const payment = (await client.post("/api/payments").set("Idempotency-Key", `concurrent-create-${Date.now()}`).send({ amount: 50 }).expect(201)).body.item;
    const key = `concurrent-tender-${Date.now()}`;
    const body = { tenders: [{ type: "pin", amount: 50, provider: "adyen", externalReference: `concurrent-pin-${Date.now()}` }] };
    const responses = await Promise.all([
      client.post(`/api/payments/${payment.id}/tenders`).set("Idempotency-Key", key).send(body),
      client.post(`/api/payments/${payment.id}/tenders`).set("Idempotency-Key", key).send(body)
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const stored = (await client.get(`/api/payments/${payment.id}`).expect(200)).body.item;
    expect(stored).toMatchObject({ status: "paid", paidAmount: 50, remainingAmount: 0 });
    expect(stored.tenders).toHaveLength(1);
    expect(stored.receipts).toHaveLength(1);
    expect(await prisma.paymentOperation.count({ where: { paymentId: payment.id, type: "payment.tenders" } })).toBe(1);
    expect((await client.get(`/api/payments/${payment.id}/history`).expect(200)).body.verification.valid).toBe(true);
  });
});

describe("advice assumptions", () => {
  const cbsRows = [
    {
      Perioden: "2026MM05",
      VariabelLeveringstariefContractprijs_3: 0.90,
      OpslagDuurzameEnergieODE_5: 0,
      Energiebelasting_6: 0.60,
      VariabelLeveringstariefContractprijs_9: 0.18,
      VariabelLeveringstariefDynamisch_12: 0.14,
      OpslagDuurzameEnergieODE_13: 0,
      Energiebelasting_14: 0.14
    },
    {
      Perioden: "2026MM06",
      VariabelLeveringstariefContractprijs_3: 0.85,
      OpslagDuurzameEnergieODE_5: 0,
      Energiebelasting_6: 0.60,
      VariabelLeveringstariefContractprijs_9: 0.16,
      VariabelLeveringstariefDynamisch_12: 0.12,
      OpslagDuurzameEnergieODE_13: 0,
      Energiebelasting_14: 0.14
    }
  ];

  it("parses the latest CBS month for energy tariffs", () => {
    const assumptions = assumptionsFromCbsRows(cbsRows, undefined, "2026-07-09T10:00:00.000Z");
    expect(assumptions.energy.gasPrice).toBe(1.45);
    expect(assumptions.energy.electricityPrice).toBe(0.30);
    expect(assumptions.energy.dynamicElectricityPrice).toBe(0.26);
    expect(assumptions.sources.energy.period).toBe("juni 2026");
    expect(assumptions.sources.energy.periodKey).toBe("2026MM06");
    expect(assumptions.energy.priceHistory.map((item) => item.periodKey)).toEqual(["2026MM06", "2026MM05"]);
    expect(assumptions.energy.priceHistory[0]).toMatchObject({ vatIncluded: true, gasPrice: 1.45, electricityPrice: 0.30, dynamicElectricityPrice: 0.26 });
  });

  it("keeps only the newest twelve CBS months and ignores annual rows", () => {
    const rows = [];
    for (let year = 2025; year <= 2026; year += 1) {
      for (let month = 1; month <= 12; month += 1) rows.push({ ...cbsRows[0], Perioden: `${year}MM${String(month).padStart(2, "0")}` });
    }
    rows.push({ ...cbsRows[0], Perioden: "2026JJ00" });
    const history = priceHistoryFromCbsRows(rows, "2026-07-09T10:00:00.000Z");
    expect(history).toHaveLength(12);
    expect(history[0].periodKey).toBe("2026MM12");
    expect(history[11].periodKey).toBe("2026MM01");
  });

  it("preserves the last valid history when the scheduled CBS refresh fails", async () => {
    const current = assumptionsFromCbsRows(cbsRows, undefined, "2026-07-09T10:00:00.000Z");
    const refreshed = await refreshEnergyAssumptions(current, { fetch: async () => ({ ok: false }) });
    expect(refreshed.energy.priceHistory).toEqual(current.energy.priceHistory);
    expect(refreshed.sources.lastEnergyRefresh.ok).toBe(false);
    expect(refreshed.sources.lastEnergyRefresh.errors[0]).toContain("CBS-tarieven");
  });

  it("refreshes advice assumptions and preserves manual market values", async () => {
    const client = agent();
    await login(client);
    await client.put("/api/settings").send({
      adviceAssumptions: {
        battery: { epexMargin: 0.33, aggregatorFeeExternal: 28 }
      }
    }).expect(200);

    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("85592NED")) {
        return {
          ok: true,
          json: async () => ({ value: cbsRows })
        };
      }
      if (href.includes("rvo.nl")) {
        return {
          ok: true,
          text: async () => "<html><body>Geen Excel-link in deze testfixture.</body></html>"
        };
      }
      throw new Error("Unexpected fetch: " + href);
    });

    try {
      const response = await client.post("/api/advice-assumptions/refresh").expect(200);
      const assumptions = response.body.item.adviceAssumptions;
      expect(assumptions.energy.gasPrice).toBe(1.45);
      expect(assumptions.energy.electricityPrice).toBe(0.30);
      expect(assumptions.sources.energy.period).toBe("juni 2026");
      expect(assumptions.battery.epexMargin).toBe(0.33);
      expect(assumptions.battery.aggregatorFeeExternal).toBe(28);
      expect(assumptions.sources.lastRefresh.ok).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("security hardening", () => {
  it("blokkeert password spraying per IP over verschillende gebruikersnamen", async () => {
    const sprayApp = createApp({
      databaseUrl: process.env.DATABASE_URL,
      sessionSecret: "spray-test-session-secret-at-least-32",
      adminUsername: "admin",
      adminPasswordHash: await bcrypt.hash("x", 4),
      port: 0,
      nodeEnv: "test",
      isProduction: false
    });
    for (let i = 0; i < 20; i += 1) {
      await request(sprayApp).post("/api/auth/login").send({ username: `spray-${i}`, password: "nope" }).expect(401);
    }
    await request(sprayApp).post("/api/auth/login").send({ username: "spray-final", password: "nope" }).expect(429);
  });

  it("weigert klantdocumenten zonder PDF-inhoud en leidt de grootte af uit de bytes", async () => {
    const client = agent();
    await login(client);
    const customer = await createCustomer(client);
    await client.post(`/api/customers/${customer.id}/documents`)
      .attach("file", Buffer.from("MZ\x90\x00 dit is geen pdf"), { filename: "malware.pdf", contentType: "application/pdf" })
      .expect(400);
    const pdfBytes = Buffer.from("%PDF-1.4\n%%EOF");
    const document = (await client.post(`/api/customers/${customer.id}/documents`)
      .attach("file", pdfBytes, { filename: "echt.pdf", contentType: "application/pdf" })
      .expect(201)).body.item;
    expect(document.size).toBe(pdfBytes.length);
  });

  it("weigert service-uploads waarvan de inhoud niet bij het bestandstype past", async () => {
    const client = request.agent(hrApp);
    await client.post("/api/auth/login").send({ username: "admin", password: "test-password" }).expect(200);
    const customer = await createCustomer(client);
    const serviceRequest = (await client.post("/api/service/requests").send({
      customerId: customer.id,
      title: "Storing warmtepomp"
    }).expect(201)).body.item;
    await client.post(`/api/service/requests/${serviceRequest.id}/documents`)
      .attach("file", Buffer.from("dit is geen png"), { filename: "foto.png", contentType: "image/png" })
      .expect(400);
    const uploaded = await client.post(`/api/service/requests/${serviceRequest.id}/documents`)
      .attach("file", Buffer.from("%PDF-1.4\n%%EOF"), { filename: "rapport.pdf", contentType: "application/pdf" })
      .expect(201);
    expect(uploaded.body.item.fileName).toBe("rapport.pdf");
  });

  it("beperkt API-verzoeken per IP buiten de testmodus", async () => {
    process.env.API_RATE_LIMIT = "3";
    try {
      const limitedApp = createApp({
        databaseUrl: process.env.DATABASE_URL,
        sessionSecret: "ratelimit-test-session-secret-at-least-32",
        adminUsername: "admin",
        adminPasswordHash: await bcrypt.hash("x", 4),
        port: 0,
        nodeEnv: "development",
        isProduction: false
      });
      for (let i = 0; i < 3; i += 1) await request(limitedApp).get("/api/health").expect(200);
      await request(limitedApp).get("/api/health").expect(429);
    } finally {
      delete process.env.API_RATE_LIMIT;
    }
  });

  it("blokkeert wachtwoordwijziging na vijf foute pogingen", async () => {
    const client = agent();
    await login(client);
    for (let i = 0; i < 5; i += 1) {
      await client.put("/api/auth/me").send({ currentPassword: "fout-wachtwoord", newPassword: "nieuw-wachtwoord" }).expect(401);
    }
    await client.put("/api/auth/me").send({ currentPassword: "test-password", newPassword: "nieuw-wachtwoord" }).expect(429);
  });

  it("geeft anonieme bezoekers geen csrf-token en geen sessiecookie", async () => {
    const response = await request(app).get("/api/auth/session").expect(200);
    expect(response.body.authenticated).toBe(false);
    expect(response.body.csrfToken).toBeNull();
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("retourneert consistente Zod-validatiefouten en een request-ID", async () => {
    const client = agent();
    await login(client);
    const response = await client.post("/api/collections/customers").send({
      firstName: "Test",
      email: "geen-geldig-mailadres",
      phone: "abc"
    }).expect(400);
    expect(response.headers["x-request-id"]).toMatch(/^[a-f0-9-]{36}$/);
    expect(response.body).toMatchObject({ error: "De aanvraag bevat ongeldige gegevens.", code: "VALIDATION_ERROR" });
    expect(response.body.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "email" }),
      expect.objectContaining({ path: "phone" })
    ]));
    expect(JSON.stringify(response.body)).not.toContain("stack");
  });
});
