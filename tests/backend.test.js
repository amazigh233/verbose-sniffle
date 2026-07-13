"use strict";

const bcrypt = require("bcrypt");
const request = require("supertest");
const { createApp } = require("../src/server");
const { prisma } = require("../src/prisma");
const data = require("../src/data");
const { assumptionsFromCbsRows } = require("../src/advice-assumptions");
const { authenticator, encrypt, decrypt, scanWithClamav } = require("../src/hr-security");

let app;
let hrApp;

beforeAll(async () => {
  const adminPasswordHash = await bcrypt.hash("test-password", 4);
  app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    sessionSecret: "test-session-secret-at-least-32-chars",
    adminUsername: "admin",
    adminPasswordHash,
    port: 0,
    nodeEnv: "test",
    isProduction: false
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
  await prisma.hrAuditEvent.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();
  await data.resetData(prisma);
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

async function createInstaller(client, username = "installer") {
  return (await client.post("/api/users").send({
    username,
    password: "installer-pass",
    role: "installer"
  }).expect(200)).body.item;
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

describe("role access", () => {
  it("limits installers to customers, installations and work orders", async () => {
    const admin = agent();
    await login(admin);
    await createInstaller(admin);
    const customer = await createCustomer(admin);
    await admin.post("/api/collections/installations").send({
      customerId: customer.id,
      plannedDate: "2026-07-30",
      startTime: "09:00",
      durationHours: 4,
      installer: "Sam"
    }).expect(200);

    const installer = agent();
    await installer.post("/api/auth/login").send({ username: "installer", password: "installer-pass" }).expect(200);
    const bootstrap = await installer.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.data.customers).toHaveLength(1);
    expect(bootstrap.body.data.installations).toHaveLength(1);
    expect(bootstrap.body.data.quotes).toBeUndefined();
    expect(bootstrap.body.data.settings).toBeUndefined();

    await installer.get("/api/collections/customers").expect(200);
    await installer.get("/api/collections/installations").expect(200);
    await installer.get("/api/collections/quotes").expect(403);
    await installer.get("/api/settings").expect(403);
    await installer.get("/api/users").expect(403);
    await installer.get("/api/backup/export").expect(403);
    await installer.post("/api/admin/reset").expect(403);
    await installer.post("/api/collections/customers").send({ firstName: "Nope" }).expect(403);
    await installer.post("/api/collections/installations").send({ customerId: customer.id }).expect(403);

    const installation = bootstrap.body.data.installations[0];
    await installer.put(`/api/installations/${installation.id}/workorder`).send({
      status: "uitgevoerd",
      workOrder: {
        workDone: "Getest",
        mechanicName: "Sam",
        checks: { installedTested: true }
      }
    }).expect(200);
    const updated = await admin.get("/api/bootstrap").expect(200);
    expect(updated.body.data.installations[0].status).toBe("uitgevoerd");
    expect(updated.body.data.installations[0].workOrder.workDone).toBe("Getest");
  });
});

describe("business data", () => {
  it("bootstraps seeded products and settings", async () => {
    const client = agent();
    await login(client);
    const response = await client.get("/api/bootstrap").expect(200);
    expect(response.body.data.products.length).toBeGreaterThan(0);
    expect(response.body.data.settings.companyName).toBe("Climature");
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
      lines: [{ description: "Warmtepomp", qty: 1, unit: "stuk", priceExVat: 1000, vatRate: 21 }]
    }).expect(200)).body.item;
    expect(quote.lines[0].total).toBe(1210);

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

    const document = (await client.post("/api/collections/customerDocuments").send({
      customerId: customer.id,
      fileName: "scan.pdf",
      mimeType: "application/pdf",
      size: 25,
      content: Buffer.from("%PDF-1.4\n%%EOF").toString("base64")
    }).expect(200)).body.item;
    expect(document.fileName).toBe("scan.pdf");

    const bootstrap = await client.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.data.customerDocuments).toHaveLength(1);
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

    const listed = await client.get("/api/bootstrap").expect(200);
    expect(listed.body.data.salesOpportunities).toHaveLength(1);

    const backup = (await client.get("/api/backup/export").expect(200)).body;
    await data.resetData(prisma);
    await client.post("/api/backup/import").send(backup).expect(200);
    expect((await client.get("/api/bootstrap").expect(200)).body.data.salesOpportunities).toHaveLength(1);

    await client.delete(`/api/collections/salesOpportunities/${opportunity.id}`).expect(200);
    expect((await client.get("/api/bootstrap").expect(200)).body.data.salesOpportunities).toHaveLength(0);
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

    const bootstrap = await client.get("/api/bootstrap").expect(200);
    const synced = bootstrap.body.data.salesOpportunities.find((item) => item.id === opportunity.id);
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
});

describe("secure HR portal", () => {
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
    expect(Buffer.from(stored.fileCipher).equals(pdf)).toBe(false);
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
    expect(directory.body.items).toEqual([{ id: employee.id, displayName: "Sam Monteur", jobTitle: "Installateur", active: true }]);
    expect(JSON.stringify(directory.body)).not.toContain("sam.prive@example.com");

    const customer = await createCustomer(client);
    const installation = (await client.post("/api/collections/installations").send({
      customerId: customer.id,
      plannedDate: "2026-08-01",
      employeeId: employee.id,
      installer: "Wordt overschreven"
    }).expect(200)).body.item;
    expect(installation.installer).toBe("Sam Monteur");
    expect(installation.employeeId).toBe(employee.id);

    await client.post("/api/users").send({ username: "field", password: "installer-pass", role: "installer" }).expect(200);
    const installer = hrAgent();
    await installer.post("/api/auth/login").send({ username: "field", password: "installer-pass" }).expect(200);
    const bootstrap = await installer.get("/api/bootstrap").expect(200);
    expect(bootstrap.body.data.installations[0].installer).toBe("Sam Monteur");
    expect(bootstrap.body.data.installations[0].employeeId).toBeUndefined();
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
