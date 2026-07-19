"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const outputDir = path.join(__dirname, "images");
fs.mkdirSync(outputDir, { recursive: true });

const today = "2026-07-19";
const data = {
  customers: [
    { id: "c1", firstName: "Sophie", lastName: "De Vries", companyName: "", email: "sophie.devries@example.nl", phone: "06 12345678", address: "Lindelaan 24", postalCode: "3581 AB", city: "Utrecht", createdAt: "2026-07-12T10:00:00.000Z" },
    { id: "c2", firstName: "Jeroen", lastName: "Bakker", companyName: "Bakker Vastgoed", email: "jeroen@bakkervastgoed.nl", phone: "030 7654321", address: "Stationsweg 8", postalCode: "3811 MH", city: "Amersfoort", createdAt: "2026-07-08T10:00:00.000Z" },
    { id: "c3", firstName: "Nora", lastName: "Smit", companyName: "", email: "nora.smit@example.nl", phone: "06 87654321", address: "Parklaan 17", postalCode: "3701 CB", city: "Zeist", createdAt: "2026-06-28T10:00:00.000Z" }
  ],
  customerNotes: [],
  customerDocuments: [],
  products: [
    { id: "p1", name: "Climature T15 thuisbatterij", category: "Thuisbatterij", sku: "BAT-T15", priceExVat: 13594, vatRate: 21, unit: "stuk", active: true },
    { id: "p2", name: "TC Swiss Ecoline 8KW Hybride", category: "Warmtepomp", sku: "WP-H8", priceExVat: 9781, vatRate: 21, unit: "stuk", active: true },
    { id: "p3", name: "Airco single split", category: "Airco", sku: "AIR-SS", priceExVat: 2450, vatRate: 21, unit: "stuk", active: true }
  ],
  quotes: [
    { id: "q1", quoteNumber: "CL-OFF-2026-0042", customerId: "c1", quoteDate: "2026-07-14", validUntil: "2026-08-13", status: "verstuurd", templateType: "combinatie", total: 21780, lines: [{ description: "Thuisbatterij en warmtepomp", qty: 1, unit: "post", priceExVat: 18000, vatRate: 21, total: 21780 }] },
    { id: "q2", quoteNumber: "CL-OFF-2026-0041", customerId: "c2", quoteDate: "2026-07-10", validUntil: "2026-08-09", status: "geaccepteerd", templateType: "warmtepomp", total: 14320, lines: [{ description: "Hybride warmtepomp", qty: 1, unit: "post", priceExVat: 11834.71, vatRate: 21, total: 14320 }] }
  ],
  invoices: [
    { id: "i1", invoiceNumber: "CL-FAC-2026-0038", quoteNumber: "CL-OFF-2026-0041", customerId: "c2", invoiceDate: "2026-07-15", dueDate: "2026-07-29", status: "verzonden", total: 14320, lines: [{ description: "Hybride warmtepomp", qty: 1, unit: "post", priceExVat: 11834.71, vatRate: 21, total: 14320 }] },
    { id: "i2", invoiceNumber: "CL-FAC-2026-0037", quoteNumber: "", customerId: "c3", invoiceDate: "2026-07-05", dueDate: "2026-07-19", status: "betaald", paidAt: "2026-07-18T12:00:00.000Z", total: 895, lines: [{ description: "Onderhoud en inspectie", qty: 1, unit: "beurt", priceExVat: 739.67, vatRate: 21, total: 895 }] }
  ],
  installations: [
    { id: "in1", customerId: "c2", quoteId: "q2", quoteNumber: "CL-OFF-2026-0041", plannedDate: "2026-07-21", startTime: "08:00", durationHours: 6, status: "ingepland", installer: "Sam Monteur", workType: "heat_pump", notes: "Buitenunit aan achtergevel." },
    { id: "in2", customerId: "c1", quoteId: "q1", quoteNumber: "CL-OFF-2026-0042", plannedDate: "2026-07-24", startTime: "09:00", durationHours: 5, status: "ingepland", installer: "Lisa Installateur", workType: "home_battery", notes: "Meterkast vooraf controleren." }
  ],
  advices: [],
  salesOpportunities: [
    { id: "o1", customerId: "c1", title: "Combinatie thuisbatterij + warmtepomp", stage: "advies", expectedValue: 22000, probability: 60, expectedCloseDate: "2026-08-08", followUpDate: "2026-07-22", notes: "Technische opname inplannen.", createdAt: "2026-07-10T09:00:00.000Z" },
    { id: "o2", customerId: "c2", title: "Hybride warmtepomp", stage: "offerte_verstuurd", expectedValue: 14320, probability: 80, expectedCloseDate: "2026-07-30", followUpDate: "2026-07-20", quoteId: "q2", createdAt: "2026-07-04T09:00:00.000Z" },
    { id: "o3", customerId: "c3", title: "Airco woonkamer", stage: "contact", expectedValue: 3200, probability: 35, expectedCloseDate: "2026-08-20", followUpDate: "2026-07-25", createdAt: "2026-07-16T09:00:00.000Z" }
  ],
  salesAppointments: [
    { id: "a1", customerId: "c1", opportunityId: "o1", title: "Technische opname", type: "opname", status: "gepland", date: "2026-07-22", startTime: "10:00", endTime: "11:00", location: "Lindelaan 24, Utrecht", contactName: "Sophie de Vries" },
    { id: "a2", customerId: "c3", opportunityId: "o3", title: "Adviesgesprek airco", type: "advies", status: "gepland", date: "2026-07-25", startTime: "14:00", endTime: "15:00", location: "Online" }
  ],
  settings: {
    companyName: "Climature", companyAddress: "Nevadadreef 17J", companyCity: "3565 CA Utrecht", companyPhone: "085 060 3664", companyEmail: "info@climature.nl", companySite: "www.climature.nl", companyIban: "NL00 BANK 0123 4567 89", paymentDays: 14,
    defaultInvoiceNote: "Gelieve het openstaande bedrag binnen de betaaltermijn te voldoen.",
    defaultQuoteTerms: "Deze offerte is geldig tot de genoemde datum. Planning vindt plaats na akkoord.",
    googleBusinessProfile: { profileUrl: "", reviewUrl: "" }
  },
  counters: { "quote-2026": 42, "invoice-2026": 38 },
  dashboard: { portalCounts: { customers: 3, openOpportunities: 3, scheduledInstallations: 2, openInvoices: 1, products: 3 } }
};

function json(route, payload) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  // Playwright evaluates matching routes in reverse registration order.
  await page.route("**/api/**", route => json(route, { items: [], totalPages: 1, page: 1 }));
  await page.route("**/api/service/dashboard", route => json(route, { data: { metrics: { openRequests: 2, plannedVisits: 2, activeContracts: 3, equipment: 7 }, requests: [], visits: [], contracts: [], equipment: [] } }));
  await page.route("**/api/bootstrap", route => json(route, { data }));
  await page.route("**/api/auth/session", route => json(route, { authenticated: true, user: { id: "admin-1", username: "admin", email: "beheer@climature.nl", role: "admin", active: true }, csrfToken: "manual-token", features: { hrPortalEnabled: true } }));

  await page.goto("http://127.0.0.1:4173/#portals");
  await page.waitForSelector(".portal-grid");

  const captures = [
    ["01-portalen.png", "#portals", ".app-shell"],
    ["02-klanten.png", "#customers", ".app-shell"],
    ["03-sales-funnel.png", "#sales-funnel", ".app-shell"],
    ["04-offertebouwer.png", "#quote-new?customerId=c1", ".app-shell"],
    ["05-installaties.png", "#installations", ".app-shell"],
    ["06-facturen.png", "#invoices", ".app-shell"],
    ["07-advies-tool.png", "#advice-v2:c1", ".app-shell"]
  ];

  for (const [filename, hash, selector] of captures) {
    await page.evaluate(next => { window.location.hash = next; }, hash);
    await page.waitForTimeout(500);
    await page.locator(selector).screenshot({ path: path.join(outputDir, filename) });
  }

  await browser.close();
  process.stdout.write(`Screenshots opgeslagen in ${outputDir}\n`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
