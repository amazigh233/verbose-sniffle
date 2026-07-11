"use strict";

const bcrypt = require("bcrypt");
const request = require("supertest");
const { createApp } = require("../src/server");
const { prisma } = require("../src/prisma");
const data = require("../src/data");
const { assumptionsFromCbsRows } = require("../src/advice-assumptions");

let app;

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
});

beforeEach(async () => {
  await prisma.user.deleteMany();
  await data.resetData(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
  if (app && app.locals && app.locals.pool) await app.locals.pool.end();
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
