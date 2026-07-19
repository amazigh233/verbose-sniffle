"use strict";

const authorization = require("./middleware/authorization");

function range(query) {
  const from = String(query.from || "");
  const to = String(query.to || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw Object.assign(new Error("Kies een geldige rapportageperiode."), { status: 400, code: "VALIDATION_ERROR" });
  }
  return { from, to };
}

function assertFinance(user) {
  if (!["admin", "finance"].includes(user.role)) throw Object.assign(new Error("Geen toegang."), { status: 403 });
}

function customerName(customer) {
  return customer.companyName || [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Onbekende klant";
}

async function summary(prisma, user, query) {
  assertFinance(user);
  const period = range(query);
  const scope = await authorization.collectionWhere(prisma, user, "invoices");
  const where = { AND: [scope || {}, { status: { not: "concept" }, invoiceDate: { gte: period.from, lte: period.to } }] };
  const invoices = await prisma.invoice.findMany({ where, select: { id: true, customerId: true, invoiceDate: true, status: true, subtotal: true, vat: true, total: true, lines: { select: { vatRate: true, subtotal: true, vat: true } }, customer: { select: { firstName: true, lastName: true, companyName: true } } } });
  const totals = { count: invoices.length, subtotal: 0, vat: 0, total: 0, paid: 0, outstanding: 0 };
  const rates = new Map();
  const customers = new Map();
  const months = new Map();
  const statuses = new Map();
  for (const invoice of invoices) {
    const subtotal = Number(invoice.subtotal || 0), vat = Number(invoice.vat || 0), total = Number(invoice.total || 0);
    totals.subtotal += subtotal; totals.vat += vat; totals.total += total;
    if (invoice.status === "betaald") totals.paid += total; else totals.outstanding += total;
    const monthKey = String(invoice.invoiceDate || "").slice(0, 7);
    const month = months.get(monthKey) || { period: monthKey, count: 0, amount: 0 };
    month.count += 1; month.amount += total; months.set(monthKey, month);
    const status = statuses.get(invoice.status) || { status: invoice.status, count: 0, amount: 0 };
    status.count += 1; status.amount += total; statuses.set(invoice.status, status);
    const currentCustomer = customers.get(invoice.customerId) || { customerId: invoice.customerId, name: customerName(invoice.customer), count: 0, amount: 0 };
    currentCustomer.count += 1; currentCustomer.amount += total; customers.set(invoice.customerId, currentCustomer);
    for (const line of invoice.lines) {
      const key = String(Number(line.vatRate));
      const current = rates.get(key) || { rate: Number(line.vatRate), base: 0, vat: 0 };
      current.base += Number(line.subtotal); current.vat += Number(line.vat); rates.set(key, current);
    }
  }
  const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
  Object.keys(totals).forEach((key) => { if (key !== "count") totals[key] = round(totals[key]); });
  return {
    period,
    totals,
    rates: [...rates.values()].map((item) => ({ ...item, base: round(item.base), vat: round(item.vat) })).sort((a, b) => b.rate - a.rate),
    revenueSeries: [...months.values()].map((item) => ({ ...item, amount: round(item.amount) })).sort((a, b) => a.period.localeCompare(b.period)),
    statuses: [...statuses.values()].map((item) => ({ ...item, amount: round(item.amount) })).sort((a, b) => b.amount - a.amount),
    topCustomers: [...customers.values()].map((item) => ({ ...item, amount: round(item.amount) })).sort((a, b) => b.amount - a.amount).slice(0, 10)
  };
}

function csvCell(value) {
  let text = String(value == null ? "" : value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvMoney(value) { return Number(value || 0).toFixed(2).replace(".", ","); }

async function exportCsv(prisma, user, query) {
  assertFinance(user);
  const period = range(query);
  const dataset = String(query.dataset || "");
  if (!["quotes", "invoices"].includes(dataset)) throw Object.assign(new Error("Onbekende export."), { status: 400, code: "VALIDATION_ERROR" });
  const collection = dataset === "quotes" ? "quotes" : "invoices";
  const scope = await authorization.collectionWhere(prisma, user, collection);
  const isQuotes = dataset === "quotes";
  const model = isQuotes ? prisma.quote : prisma.invoice;
  const dateField = isQuotes ? "quoteDate" : "invoiceDate";
  const rows = await model.findMany({ where: { AND: [scope || {}, { [dateField]: { gte: period.from, lte: period.to } }, ...(isQuotes ? [] : [{ status: { not: "concept" } }])] }, select: isQuotes ? { quoteNumber: true, quoteDate: true, status: true, subtotal: true, vat: true, total: true, customer: { select: { firstName: true, lastName: true, companyName: true } } } : { invoiceNumber: true, invoiceDate: true, status: true, subtotal: true, vat: true, total: true, customer: { select: { firstName: true, lastName: true, companyName: true } } }, orderBy: [{ [dateField]: "asc" }, { id: "asc" }] });
  const header = ["Nummer", "Datum", "Klant", "Status", "Subtotaal excl. BTW", "BTW", "Totaal incl. BTW"];
  const lines = rows.map((row) => [isQuotes ? row.quoteNumber : row.invoiceNumber, isQuotes ? row.quoteDate : row.invoiceDate, customerName(row.customer), row.status, csvMoney(row.subtotal), csvMoney(row.vat), csvMoney(row.total)].map(csvCell).join(";"));
  return `\uFEFF${[header.map(csvCell).join(";"), ...lines].join("\r\n")}`;
}

module.exports = { exportCsv, range, summary };
