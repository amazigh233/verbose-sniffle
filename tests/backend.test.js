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
