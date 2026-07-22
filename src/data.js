"use strict";

const crypto = require("crypto");
const { DEFAULT_PRODUCTS, DEFAULT_SETTINGS } = require("./defaults");
const { normalizeAssumptions, refreshAdviceAssumptions: refreshAssumptionsFromSources, refreshEnergyAssumptions: refreshEnergyFromSource } = require("./advice-assumptions");
const bootstrapCache = require("./bootstrap-cache");
const { multiplyMoney, parseLocalizedNumber: parseNumber, percentageMoney, roundMoney, sumMoney } = require("./numbers");
const { pageResponse, parsePagination, validationError } = require("./shared/pagination");

const COLLECTIONS = ["customers", "customerNotes", "customerDocuments", "products", "quotes", "invoices", "installations", "advices", "salesOpportunities", "salesAppointments"];
const SALES_STAGES = ["lead", "contact", "advies", "offerte_maken", "offerte_verstuurd", "gewonnen", "verloren"];
const APPOINTMENT_TYPES = ["belafspraak", "videogesprek", "bezoek", "adviesgesprek", "overig"];
const APPOINTMENT_STATUSES = ["gepland", "afgerond", "geannuleerd"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function calculateTotals(lines) {
  const normalized = (lines || []).map((line) => {
    const lineKind = line.lineKind === "discount" || parseNumber(line.priceExVat) < 0 ? "discount" : "item";
    const qty = Math.abs(parseNumber(line.qty));
    const rawPrice = parseNumber(line.priceExVat);
    const priceExVat = lineKind === "discount" ? -Math.abs(rawPrice) : Math.max(0, rawPrice);
    const vatRate = parseNumber(line.vatRate);
    const subtotal = multiplyMoney(qty, priceExVat);
    const vat = percentageMoney(subtotal, vatRate);
    return {
      productId: line.productId || "",
      componentKey: String(line.componentKey || "general"),
      lineKind,
      vatRefundEligible: line.vatRefundEligible === true || line.vatRefundEligible === "true",
      description: String(line.description || "").trim(),
      qty,
      unit: String(line.unit || "stuk").trim(),
      priceExVat,
      vatRate,
      subtotal,
      vat,
      total: roundMoney(subtotal + vat)
    };
  }).filter((line) => line.description || line.qty || line.priceExVat);
  return {
    lines: normalized,
    subtotal: sumMoney(normalized.map((line) => line.subtotal)),
    vat: sumMoney(normalized.map((line) => line.vat)),
    total: sumMoney(normalized.map((line) => line.total))
  };
}

function asDate(value) {
  return value ? new Date(value) : null;
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function stripUndefined(object) {
  return Object.fromEntries(Object.entries(object).filter((entry) => entry[1] !== undefined));
}

function normalizeGoogleBusinessProfile(value) {
  const profile = value && typeof value === "object" ? value : {};
  const normalizeUrl = (input) => {
    const url = String(input || "").trim();
    if (!url) return "";
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") throw new Error();
      return parsed.toString();
    } catch (_error) {
      throw Object.assign(new Error("Gebruik voor Google Bedrijfsprofiel een geldige https-link."), { status: 400 });
    }
  };
  return { profileUrl: normalizeUrl(profile.profileUrl), reviewUrl: normalizeUrl(profile.reviewUrl) };
}

function serializeQuote(quote) {
  return {
    ...quote,
    acceptedAt: iso(quote.acceptedAt),
    statusUpdatedAt: iso(quote.statusUpdatedAt),
    createdAt: iso(quote.createdAt),
    updatedAt: iso(quote.updatedAt),
    lines: (quote.lines || []).sort((a, b) => a.position - b.position).map((line) => ({
      productId: line.productId || "",
      componentKey: line.componentKey || "general",
      lineKind: line.lineKind || "item",
      vatRefundEligible: Boolean(line.vatRefundEligible),
      description: line.description,
      qty: line.qty,
      unit: line.unit,
      priceExVat: line.priceExVat,
      vatRate: line.vatRate,
      subtotal: line.subtotal,
      vat: line.vat,
      total: line.total
    }))
  };
}

function legacyBenefit(item) {
  const type = String(item.benefitType || "geen");
  const amount = Math.max(0, parseNumber(item.benefitAmount));
  if (type === "geen" || !amount) return [];
  return [{
    id: "legacy-benefit",
    type: type === "btw" ? "btw_refund" : type === "subsidie" ? "isde" : "other",
    label: String(item.benefitLabel || "Verwacht voordeel"),
    amount,
    componentKey: type === "btw" ? "thuisbatterij" : type === "subsidie" ? "warmtepomp" : "general",
    calculationMode: "manual",
    reviewed: false
  }];
}

function normalizeBenefits(item, lines) {
  const source = Array.isArray(item.benefits) ? item.benefits : legacyBenefit(item);
  const allowed = ["btw_refund", "isde", "other"];
  return source.map((benefit, index) => {
    const type = allowed.includes(benefit && benefit.type) ? benefit.type : "other";
    const calculationMode = benefit && benefit.calculationMode === "eligible_vat" ? "eligible_vat" : benefit && benefit.calculationMode === "advice" ? "advice" : "manual";
    const automaticVat = sumMoney((lines || []).filter((line) => line.vatRefundEligible).map((line) => line.vat));
    return {
      id: String(benefit && benefit.id || `benefit-${index + 1}`),
      type,
      label: String(benefit && benefit.label || (type === "btw_refund" ? "Mogelijke btw-teruggave" : type === "isde" ? "Verwachte ISDE-subsidie" : "Ander verwacht voordeel")),
      amount: calculationMode === "eligible_vat" ? Math.max(0, automaticVat) : Math.max(0, parseNumber(benefit && benefit.amount)),
      componentKey: String(benefit && benefit.componentKey || (type === "btw_refund" ? "thuisbatterij" : type === "isde" ? "warmtepomp" : "general")),
      calculationMode,
      reviewed: Boolean(benefit && (benefit.reviewed === true || benefit.reviewed === "true"))
    };
  });
}

function serializeInvoice(invoice) {
  return {
    ...invoice,
    paidAt: iso(invoice.paidAt),
    statusUpdatedAt: iso(invoice.statusUpdatedAt),
    createdAt: iso(invoice.createdAt),
    updatedAt: iso(invoice.updatedAt),
    lines: (invoice.lines || []).sort((a, b) => a.position - b.position).map((line) => ({
      productId: line.productId || "",
      description: line.description,
      qty: line.qty,
      unit: line.unit,
      priceExVat: line.priceExVat,
      vatRate: line.vatRate,
      subtotal: line.subtotal,
      vat: line.vat,
      total: line.total
    }))
  };
}

function serializeSalesOpportunity(opportunity) {
  return {
    ...opportunity,
    customerId: opportunity.customerId || "",
    quoteId: opportunity.quoteId || "",
    createdAt: iso(opportunity.createdAt),
    updatedAt: iso(opportunity.updatedAt)
  };
}

let defaultsEnsured = false;

async function ensureDefaults(prisma) {
  await prisma.setting.upsert({
    where: { key: "settings" },
    update: {},
    create: { key: "settings", value: DEFAULT_SETTINGS }
  });

  const productCount = await prisma.product.count();
  if (!productCount) {
    await prisma.product.createMany({ data: DEFAULT_PRODUCTS, skipDuplicates: true });
  }
  defaultsEnsured = true;
}

async function ensureDefaultsOnce(prisma) {
  if (defaultsEnsured && process.env.NODE_ENV !== "test") return;
  await ensureDefaults(prisma);
}

async function getSettings(prisma) {
  const record = await prisma.setting.findUnique({ where: { key: "settings" } });
  const value = { ...DEFAULT_SETTINGS, ...(record && record.value ? record.value : {}) };
  value.adviceAssumptions = normalizeAssumptions(value.adviceAssumptions);
  value.googleBusinessProfile = normalizeGoogleBusinessProfile(value.googleBusinessProfile);
  return value;
}

async function saveSettings(prisma, data) {
  const current = await getSettings(prisma);
  const value = { ...current, ...data, paymentDays: parseNumber(data.paymentDays || current.paymentDays) || 14 };
  value.adviceAssumptions = normalizeAssumptions(value.adviceAssumptions);
  value.googleBusinessProfile = normalizeGoogleBusinessProfile(value.googleBusinessProfile);
  await prisma.setting.upsert({
    where: { key: "settings" },
    update: { value },
    create: { key: "settings", value }
  });
  bootstrapCache.invalidate();
  return value;
}

async function refreshAdviceAssumptions(prisma) {
  const current = await getSettings(prisma);
  const adviceAssumptions = await refreshAssumptionsFromSources(current.adviceAssumptions);
  return saveSettings(prisma, { ...current, adviceAssumptions });
}

async function refreshEnergyPrices(prisma) {
  const current = await getSettings(prisma);
  const adviceAssumptions = await refreshEnergyFromSource(current.adviceAssumptions);
  return saveSettings(prisma, { ...current, adviceAssumptions });
}

async function getCounters(prisma) {
  const rows = await prisma.counter.findMany();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function numberPrefix(type) {
  if (type === "quote") return "CL-OFF-";
  if (type === "invoice") return "CL-FAC-";
  throw Object.assign(new Error("Ongeldig nummertype."), { status: 400 });
}

async function nextNumber(prisma, type) {
  const year = new Date().getFullYear();
  const key = `${type}-${year}`;
  const counter = await prisma.counter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 }
  });
  bootstrapCache.invalidate();
  return `${numberPrefix(type)}${year}-${String(counter.value).padStart(4, "0")}`;
}

async function peekNumber(prisma, type) {
  const year = new Date().getFullYear();
  const key = `${type}-${year}`;
  const counter = await prisma.counter.findUnique({ where: { key } });
  return `${numberPrefix(type)}${year}-${String(((counter && counter.value) || 0) + 1).padStart(4, "0")}`;
}

async function refreshOverdueInvoices(prisma) {
  const result = await prisma.invoice.updateMany({
    where: {
      status: "verzonden",
      dueDate: { lt: today() }
    },
    data: {
      status: "verlopen",
      statusUpdatedAt: new Date()
    }
  });
  if (result.count) bootstrapCache.invalidate();
  return result;
}

const OVERDUE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let lastOverdueRefreshAt = 0;
let lastOverdueRefreshDate = "";

async function maybeRefreshOverdueInvoices(prisma) {
  const now = Date.now();
  const date = today();
  const fresh = lastOverdueRefreshAt && now - lastOverdueRefreshAt < OVERDUE_REFRESH_INTERVAL_MS && lastOverdueRefreshDate === date;
  if (fresh && process.env.NODE_ENV !== "test") return;
  await refreshOverdueInvoices(prisma);
  lastOverdueRefreshAt = now;
  lastOverdueRefreshDate = date;
}

async function listCollection(prisma, collection, where) {
  if (collection === "customers") return prisma.customer.findMany({ where, orderBy: { createdAt: "desc" } });
  if (collection === "customerNotes") return prisma.customerNote.findMany({ where, orderBy: { createdAt: "desc" } });
  if (collection === "customerDocuments") return prisma.customerDocument.findMany({ where, orderBy: { createdAt: "desc" } });
  if (collection === "products") return prisma.product.findMany({ where, orderBy: [{ category: "asc" }, { brand: "asc" }, { name: "asc" }] });
  if (collection === "quotes") {
    const rows = await prisma.quote.findMany({ where, include: { lines: true }, orderBy: { createdAt: "desc" } });
    return rows.map(serializeQuote);
  }
  if (collection === "invoices") {
    const rows = await prisma.invoice.findMany({ where, include: { lines: true }, orderBy: { createdAt: "desc" } });
    return rows.map(serializeInvoice);
  }
  if (collection === "installations") return prisma.installation.findMany({ where, orderBy: [{ plannedDate: "asc" }, { startTime: "asc" }] });
  if (collection === "advices") return prisma.advice.findMany({ where, orderBy: { createdAt: "desc" } });
  if (collection === "salesOpportunities") {
    const rows = await prisma.salesOpportunity.findMany({ where, orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }] });
    return rows.map(serializeSalesOpportunity);
  }
  if (collection === "salesAppointments") return prisma.salesAppointment.findMany({ where, orderBy: [{ date: "asc" }, { startTime: "asc" }] });
  throw Object.assign(new Error("Onbekende collectie."), { status: 404 });
}

const PAGE_CONFIG = {
  customers: { model: "customer", search: ["firstName", "lastName", "companyName", "email", "postalCode", "city"], sorts: ["createdAt", "updatedAt", "lastName", "companyName", "city"], defaultSort: "createdAt", defaultOrder: "desc", filters: ["city", "postalCode"], summarySelect: { id: true, firstName: true, lastName: true, companyName: true, email: true, phone: true, address: true, postalCode: true, city: true, createdAt: true, updatedAt: true } },
  customerNotes: { model: "customerNote", search: ["body", "type"], sorts: ["createdAt", "updatedAt", "date", "type"], defaultSort: "createdAt", defaultOrder: "desc", filters: ["customerId", "type"] },
  customerDocuments: { model: "customerDocument", search: ["fileName"], sorts: ["createdAt", "updatedAt", "fileName", "size"], defaultSort: "createdAt", defaultOrder: "desc", filters: ["customerId", "mimeType", "scanStatus"], select: { id: true, customerId: true, fileName: true, mimeType: true, size: true, scanStatus: true, createdAt: true, updatedAt: true } },
  products: { model: "product", search: ["sku", "category", "brand", "name", "specs"], sorts: ["createdAt", "updatedAt", "sku", "category", "brand", "name", "priceExVat", "stockQuantity"], defaultSort: "name", defaultOrder: "asc", filters: ["category", "brand"] },
  quotes: { model: "quote", search: ["quoteNumber", "notes", "documentTitle", "status"], customerSearch: true, sorts: ["createdAt", "updatedAt", "quoteDate", "validUntil", "quoteNumber", "status", "total"], defaultSort: "createdAt", defaultOrder: "desc", filters: ["customerId", "status"], include: { lines: true }, serialize: serializeQuote, summarySelect: { id: true, quoteNumber: true, customerId: true, quoteDate: true, validUntil: true, status: true, templateType: true, documentTitle: true, subtotal: true, vat: true, total: true, createdAt: true, updatedAt: true, customer: { select: { firstName: true, lastName: true, companyName: true } } } },
  invoices: { model: "invoice", search: ["invoiceNumber", "quoteNumber", "notes", "status"], customerSearch: true, sorts: ["createdAt", "updatedAt", "invoiceDate", "dueDate", "invoiceNumber", "status", "total"], defaultSort: "createdAt", defaultOrder: "desc", filters: ["customerId", "status"], include: { lines: true }, serialize: serializeInvoice, summarySelect: { id: true, invoiceNumber: true, quoteNumber: true, customerId: true, invoiceDate: true, dueDate: true, status: true, subtotal: true, vat: true, total: true, createdAt: true, updatedAt: true, customer: { select: { firstName: true, lastName: true, companyName: true } } } },
  installations: { model: "installation", search: ["installer", "notes", "quoteNumber", "status"], customerSearch: true, sorts: ["createdAt", "updatedAt", "plannedDate", "startTime", "status", "installer"], defaultSort: "plannedDate", defaultOrder: "asc", filters: ["customerId", "employeeId", "status", "workType"], summarySelect: { id: true, customerId: true, quoteId: true, quoteNumber: true, plannedDate: true, startTime: true, durationHours: true, status: true, installer: true, employeeId: true, workType: true, createdAt: true, updatedAt: true, customer: { select: { firstName: true, lastName: true, companyName: true } } } },
  advices: { model: "advice", search: ["title", "summary", "productName", "kind"], sorts: ["createdAt", "updatedAt", "title", "kind", "investment"], defaultSort: "createdAt", defaultOrder: "desc", filters: ["customerId", "kind"] },
  salesOpportunities: { model: "salesOpportunity", search: ["title", "contactName", "companyName", "email", "phone", "notes"], sorts: ["createdAt", "updatedAt", "title", "stage", "expectedValue", "followUpDate"], defaultSort: "updatedAt", defaultOrder: "desc", filters: ["customerId", "quoteId", "stage"] },
  salesAppointments: { model: "salesAppointment", search: ["title", "contactName", "location", "notes"], sorts: ["createdAt", "updatedAt", "date", "startTime", "title", "status"], defaultSort: "date", defaultOrder: "asc", filters: ["customerId", "opportunityId", "status", "type"] }
};

function combineWhere(parts) {
  const clauses = parts.filter((part) => part && Object.keys(part).length);
  if (!clauses.length) return undefined;
  return clauses.length === 1 ? clauses[0] : { AND: clauses };
}

async function listCollectionPage(prisma, collection, query = {}, scopeWhere) {
  const config = PAGE_CONFIG[collection];
  if (!config) throw Object.assign(new Error("Onbekende collectie."), { status: 404 });
  const parsed = parsePagination(query, config.sorts, config.defaultSort);
  const filterWhere = {};
  for (const field of config.filters) {
    if (query[field] === undefined || query[field] === "") continue;
    const value = String(query[field]).trim();
    if (value.length > 200) throw validationError(`${field} is ongeldig.`);
    filterWhere[field] = value;
  }
  const searchClauses = parsed.search ? config.search.map((field) => ({ [field]: { contains: parsed.search, mode: "insensitive" } })) : [];
  if (parsed.search && config.customerSearch) searchClauses.push({ customer: { is: { OR: ["firstName", "lastName", "companyName"].map((field) => ({ [field]: { contains: parsed.search, mode: "insensitive" } })) } } });
  const searchWhere = searchClauses.length ? { OR: searchClauses } : undefined;
  const where = combineWhere([scopeWhere, filterWhere, searchWhere]);
  const order = query.sortOrder ? parsed.sortOrder : config.defaultOrder;
  const model = prisma[config.model];
  const summary = query.view === "summary" && config.summarySelect;
  const [totalItems, rows] = await prisma.$transaction([
    model.count({ where }),
    model.findMany({
      where,
      include: summary ? undefined : config.include,
      select: summary ? config.summarySelect : config.select,
      orderBy: [{ [parsed.sortBy]: order }, { id: "asc" }],
      skip: (parsed.page - 1) * parsed.pageSize,
      take: parsed.pageSize
    })
  ]);
  const items = config.serialize && !summary ? rows.map(config.serialize) : rows;
  return pageResponse(items, parsed.page, parsed.pageSize, totalItems);
}

async function getCollectionItem(prisma, collection, id, scopeWhere) {
  const config = PAGE_CONFIG[collection];
  if (!config) throw Object.assign(new Error("Onbekende collectie."), { status: 404 });
  const where = combineWhere([{ id }, scopeWhere]);
  const row = await prisma[config.model].findFirst({ where, include: config.include, select: config.select });
  if (!row) return null;
  return config.serialize ? config.serialize(row) : row;
}

let pendingBootstrapLoad = null;

async function loadBootstrap(prisma) {
  const loadEpoch = bootstrapCache.beginLoad();
  const [collections, settings, counters] = await Promise.all([
    Promise.all(COLLECTIONS.map((collection) => listCollection(prisma, collection))),
    getSettings(prisma),
    getCounters(prisma)
  ]);
  const data = {};
  COLLECTIONS.forEach((collection, index) => {
    data[collection] = collections[index];
  });
  data.settings = settings;
  data.counters = counters;
  bootstrapCache.set(data, loadEpoch);
  return data;
}

async function bootstrap(prisma) {
  await ensureDefaultsOnce(prisma);
  await maybeRefreshOverdueInvoices(prisma);
  const cached = bootstrapCache.get();
  if (cached) return cached;
  if (!pendingBootstrapLoad) {
    pendingBootstrapLoad = loadBootstrap(prisma).finally(() => {
      pendingBootstrapLoad = null;
    });
  }
  const data = await pendingBootstrapLoad;
  return { ...data };
}

function customerData(item) {
  return stripUndefined({
    id: item.id || undefined,
    firstName: String(item.firstName || "").trim(),
    lastName: String(item.lastName || "").trim(),
    companyName: String(item.companyName || ""),
    email: String(item.email || "").trim(),
    phone: String(item.phone || "").trim(),
    address: String(item.address || ""),
    postalCode: String(item.postalCode || ""),
    city: String(item.city || ""),
    notes: String(item.notes || ""),
    createdAt: asDate(item.createdAt) || undefined
  });
}

function customerNoteData(item) {
  return stripUndefined({
    id: item.id || undefined,
    customerId: item.customerId,
    date: item.date || today(),
    type: item.type || "Notitie",
    body: String(item.body || "").trim(),
    createdAt: asDate(item.createdAt) || undefined
  });
}

function customerDocumentData(item) {
  const mimeType = String(item.mimeType || "application/pdf").trim();
  const fileName = String(item.fileName || "").trim();
  const storageKey = String(item.storageKey || "").trim();
  if (!item.customerId) throw Object.assign(new Error("Klant ontbreekt bij PDF-document."), { status: 400 });
  if (!fileName) throw Object.assign(new Error("Bestandsnaam ontbreekt."), { status: 400 });
  if (mimeType !== "application/pdf" || !fileName.toLowerCase().endsWith(".pdf")) {
    throw Object.assign(new Error("Alleen PDF-bestanden kunnen worden toegevoegd."), { status: 400 });
  }
  if (!storageKey) throw Object.assign(new Error("Storage key ontbreekt bij documentmetadata."), { status: 400 });
  return stripUndefined({
    id: item.id || undefined,
    customerId: item.customerId,
    fileName,
    mimeType: "application/pdf",
    size: Math.max(0, parseInt(item.size, 10) || 0),
    storageKey,
    sha256: String(item.sha256 || ""),
    scanStatus: String(item.scanStatus || "clean"),
    scanMessage: String(item.scanMessage || ""),
    createdAt: asDate(item.createdAt) || undefined
  });
}

function productData(item) {
  return stripUndefined({
    id: item.id || undefined,
    sku: item.sku === undefined ? undefined : (String(item.sku || "").trim().toUpperCase() || null),
    category: String(item.category || "").trim(),
    brand: String(item.brand || "").trim(),
    name: String(item.name || "").trim(),
    specs: String(item.specs || ""),
    priceExVat: parseNumber(item.priceExVat),
    vatRate: parseNumber(item.vatRate) || 21,
    description: String(item.description || ""),
    adviceType: String(item.adviceType || ""),
    capacityKw: Math.max(0, parseNumber(item.capacityKw)),
    capacityKwh: Math.max(0, parseNumber(item.capacityKwh)),
    connection: String(item.connection || ""),
    subsidy: Math.max(0, parseNumber(item.subsidy)),
    stockQuantity: item.stockQuantity === undefined ? undefined : Math.max(0, parseNumber(item.stockQuantity)),
    minimumStock: item.minimumStock === undefined ? undefined : Math.max(0, parseNumber(item.minimumStock)),
    stockUnit: item.stockUnit === undefined ? undefined : (String(item.stockUnit || "").trim() || "stuk"),
    stockLocation: item.stockLocation === undefined ? undefined : String(item.stockLocation || "").trim(),
    inventoryUpdatedAt: item.inventoryUpdatedAt === undefined ? undefined : asDate(item.inventoryUpdatedAt),
    createdAt: asDate(item.createdAt) || undefined
  });
}

function quoteData(item) {
  const totals = calculateTotals(item.lines || []);
  const benefits = normalizeBenefits(item, totals.lines);
  const firstBenefit = benefits[0];
  return {
    header: stripUndefined({
      id: item.id || undefined,
      quoteNumber: item.quoteNumber,
      customerId: item.customerId,
      quoteDate: item.quoteDate || today(),
      validUntil: item.validUntil || today(),
      status: item.status || "concept",
      notes: String(item.notes || ""),
      templateType: String(item.templateType || "maatwerk"),
      designStyle: String(item.designStyle || "licht"),
      documentTitle: String(item.documentTitle || "Uw energieoplossing op maat"),
      introText: String(item.introText || ""),
      includedText: String(item.includedText || ""),
      advantagesText: String(item.advantagesText || ""),
      benefitType: firstBenefit ? firstBenefit.type === "btw_refund" ? "btw" : firstBenefit.type === "isde" ? "subsidie" : "anders" : "geen",
      benefitLabel: firstBenefit ? firstBenefit.label : "",
      benefitAmount: firstBenefit ? firstBenefit.amount : 0,
      benefits,
      documentConfig: item.documentConfig && typeof item.documentConfig === "object" ? item.documentConfig : undefined,
      sourceAdviceId: String(item.sourceAdviceId || ""),
      subtotal: totals.subtotal,
      vat: totals.vat,
      total: totals.total,
      acceptedAt: asDate(item.acceptedAt) || undefined,
      statusUpdatedAt: asDate(item.statusUpdatedAt) || undefined,
      createdAt: asDate(item.createdAt) || undefined
    }),
    lines: totals.lines
  };
}

function invoiceData(item) {
  const totals = calculateTotals(item.lines || []);
  return {
    header: stripUndefined({
      id: item.id || undefined,
      invoiceNumber: item.invoiceNumber,
      quoteNumber: item.quoteNumber || "",
      customerId: item.customerId,
      invoiceDate: item.invoiceDate || today(),
      dueDate: item.dueDate || today(),
      status: item.status || "concept",
      paymentInstructions: String(item.paymentInstructions || ""),
      notes: String(item.notes || ""),
      subtotal: totals.subtotal,
      vat: totals.vat,
      total: totals.total,
      paidAt: asDate(item.paidAt) || undefined,
      statusUpdatedAt: asDate(item.statusUpdatedAt) || undefined,
      createdAt: asDate(item.createdAt) || undefined
    }),
    lines: totals.lines.map(({ componentKey, lineKind, vatRefundEligible, ...line }) => line)
  };
}

function installationData(item) {
  const workOrder = item.workOrder && typeof item.workOrder === "object" ? item.workOrder : undefined;
  const workTypes = ["air_conditioning", "heat_pump", "boiler", "home_battery", "other"];
  const qualificationCheck = item.qualificationCheck && typeof item.qualificationCheck === "object" ? item.qualificationCheck : undefined;
  return stripUndefined({
    id: item.id || undefined,
    customerId: item.customerId,
    quoteId: item.quoteId || "",
    quoteNumber: item.quoteNumber || "",
    plannedDate: item.plannedDate || today(),
    startTime: item.startTime || "09:00",
    durationHours: parseNumber(item.durationHours) || 4,
    status: item.status || "ingepland",
    installer: item.installer || "",
    employeeId: item.employeeId || null,
    workType: workTypes.includes(item.workType) ? item.workType : "other",
    qualificationCheck,
    notes: item.notes || "",
    workOrder,
    createdAt: asDate(item.createdAt) || undefined
  });
}

function workOrderData(item) {
  const status = ["ingepland", "uitgevoerd", "geannuleerd"].includes(item.status) ? item.status : "ingepland";
  const workOrder = item.workOrder && typeof item.workOrder === "object" ? item.workOrder : {};
  return { status, workOrder };
}

function adviceData(item) {
  return stripUndefined({
    id: item.id || undefined,
    customerId: item.customerId,
    kind: String(item.kind || "").trim(),
    title: String(item.title || ""),
    summary: String(item.summary || ""),
    powerKw: parseNumber(item.powerKw),
    investment: parseNumber(item.investment),
    subsidy: parseNumber(item.subsidy),
    yearlySaving: parseNumber(item.yearlySaving),
    paybackYears: parseNumber(item.paybackYears),
    productName: String(item.productName || ""),
    sourceQuoteId: String(item.sourceQuoteId || ""),
    payload: item.payload === undefined ? undefined : (item.payload || null),
    createdAt: asDate(item.createdAt) || undefined
  });
}

function salesOpportunityData(item) {
  const title = String(item.title || "").trim();
  const customerId = item.customerId || null;
  const contactName = String(item.contactName || "").trim();
  const stage = SALES_STAGES.includes(item.stage) ? item.stage : "lead";
  const probability = Math.max(0, Math.min(100, parseNumber(item.probability)));
  if (!title) throw Object.assign(new Error("Titel ontbreekt bij saleskans."), { status: 400 });
  if (!customerId && !contactName) {
    throw Object.assign(new Error("Vul een contactnaam in of koppel een klant."), { status: 400 });
  }
  return stripUndefined({
    id: item.id || undefined,
    title,
    stage,
    customerId,
    quoteId: item.quoteId || null,
    contactName,
    companyName: String(item.companyName || "").trim(),
    email: String(item.email || "").trim(),
    phone: String(item.phone || "").trim(),
    source: String(item.source || "").trim(),
    expectedValue: parseNumber(item.expectedValue),
    probability,
    expectedCloseDate: String(item.expectedCloseDate || ""),
    followUpDate: String(item.followUpDate || ""),
    notes: String(item.notes || ""),
    lostReason: String(item.lostReason || ""),
    createdAt: asDate(item.createdAt) || undefined
  });
}

function salesAppointmentData(item) {
  const title = String(item.title || "").trim();
  const date = String(item.date || "");
  const startTime = String(item.startTime || "09:00");
  const endTime = String(item.endTime || "09:30");
  if (!title) throw Object.assign(new Error("Titel ontbreekt bij salesafspraak."), { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Object.assign(new Error("Kies een geldige afspraakdatum."), { status: 400 });
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || endTime <= startTime) {
    throw Object.assign(new Error("De eindtijd moet na de starttijd liggen."), { status: 400 });
  }
  return stripUndefined({
    id: item.id || undefined,
    title,
    type: APPOINTMENT_TYPES.includes(item.type) ? item.type : "overig",
    status: APPOINTMENT_STATUSES.includes(item.status) ? item.status : "gepland",
    date,
    startTime,
    endTime,
    customerId: item.customerId || null,
    opportunityId: item.opportunityId || null,
    contactName: String(item.contactName || "").trim(),
    location: String(item.location || "").trim(),
    notes: String(item.notes || ""),
    createdAt: asDate(item.createdAt) || undefined
  });
}

function quoteStage(status) {
  if (status === "geaccepteerd" || status === "geaccepteerd/aanbetaling") return { stage: "gewonnen", probability: 100, lostReason: "" };
  if (status === "afgewezen") return { stage: "verloren", probability: 0, lostReason: "Offerte afgewezen" };
  if (status === "verstuurd") return { stage: "offerte_verstuurd" };
  if (status === "concept") return { stage: "offerte_maken" };
  return null;
}

async function upsertQuote(prisma, item) {
  const data = quoteData(item);
  const id = data.header.id;
  const saved = await prisma.$transaction(async (tx) => {
    const quote = id
      ? await tx.quote.update({ where: { id }, data: data.header })
      : await tx.quote.create({ data: data.header });
    await tx.quoteLine.deleteMany({ where: { quoteId: quote.id } });
    if (data.lines.length) {
      await tx.quoteLine.createMany({
        data: data.lines.map((line, index) => ({ ...line, quoteId: quote.id, position: index }))
      });
    }
    const syncedStage = quoteStage(quote.status);
    if (syncedStage) {
      await tx.salesOpportunity.updateMany({
        where: { quoteId: quote.id },
        data: syncedStage
      });
    }
    return tx.quote.findUnique({ where: { id: quote.id }, include: { lines: true } });
  });
  return serializeQuote(saved);
}

async function upsertInvoice(prisma, item) {
  const data = invoiceData(item);
  const id = data.header.id;
  const linkedPayment = id ? await prisma.payment.findUnique({ where: { invoiceId: id }, select: { id: true } }) : null;
  if (linkedPayment) {
    throw Object.assign(new Error("Een factuur met betalingshistorie kan niet rechtstreeks worden gewijzigd."), { status: 409 });
  }
  if (data.header.status === "betaald") {
    throw Object.assign(new Error("Registreer de betaling via de betalingsmodule."), { status: 409 });
  }
  if (data.header.quoteNumber && data.header.status !== "concept") {
    const duplicate = await prisma.invoice.findFirst({
      where: {
        quoteNumber: data.header.quoteNumber,
        status: { not: "concept" },
        id: id ? { not: id } : undefined
      }
    });
    if (duplicate) {
      throw Object.assign(new Error("Deze offerte is al definitief gefactureerd."), { status: 409 });
    }
  }
  const saved = await prisma.$transaction(async (tx) => {
    const invoice = id
      ? await tx.invoice.update({ where: { id }, data: data.header })
      : await tx.invoice.create({ data: data.header });
    await tx.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } });
    if (data.lines.length) {
      await tx.invoiceLine.createMany({
        data: data.lines.map((line, index) => ({ ...line, invoiceId: invoice.id, position: index }))
      });
    }
    return tx.invoice.findUnique({ where: { id: invoice.id }, include: { lines: true } });
  });
  return serializeInvoice(saved);
}

async function createInvoiceFromQuote(prisma, quoteId) {
  const settings = await getSettings(prisma);
  const result = await prisma.$transaction(async (tx) => {
    // Serialiseer omzettingen per offerte, zodat dubbelklikken maar één factuur oplevert.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`quote-invoice:${quoteId}`})) IS NULL AS locked`;
    const quote = await tx.quote.findUnique({ where: { id: quoteId }, include: { lines: true } });
    if (!quote) throw Object.assign(new Error("Offerte niet gevonden."), { status: 404 });
    if (!["geaccepteerd", "geaccepteerd/aanbetaling"].includes(quote.status)) {
      throw Object.assign(new Error("Alleen een geaccepteerde offerte kan worden gefactureerd."), { status: 409 });
    }

    const existing = await tx.invoice.findFirst({
      where: { quoteNumber: quote.quoteNumber },
      include: { lines: true },
      orderBy: { createdAt: "asc" }
    });
    if (existing) return { item: serializeInvoice(existing), created: false };

    const totals = calculateTotals(quote.lines);
    const invoiceNumber = await nextNumber(tx, "invoice");
    const invoiceDate = today();
    const defaultNote = String(settings.defaultInvoiceNote || "");
    const paymentInstructions = settings.companyIban
      ? `Gelieve te betalen op ${settings.companyIban} onder vermelding van het factuurnummer.`
      : defaultNote;
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        quoteNumber: quote.quoteNumber,
        customerId: quote.customerId,
        invoiceDate,
        dueDate: addDays(invoiceDate, Number(settings.paymentDays) || 14),
        status: "concept",
        paymentInstructions,
        notes: quote.notes || defaultNote,
        subtotal: totals.subtotal,
        vat: totals.vat,
        total: totals.total,
        lines: {
          create: totals.lines.map((line, position) => ({
            position,
            productId: line.productId || "",
            description: line.description,
            qty: line.qty,
            unit: line.unit,
            priceExVat: line.priceExVat,
            vatRate: line.vatRate,
            subtotal: line.subtotal,
            vat: line.vat,
            total: line.total
          }))
        }
      },
      include: { lines: true }
    });
    return { item: serializeInvoice(invoice), created: true };
  });
  bootstrapCache.invalidate();
  return result;
}

async function upsertItem(prisma, collection, item) {
  if (collection === "customers") {
    const data = customerData(item);
    return data.id
      ? prisma.customer.update({ where: { id: data.id }, data })
      : prisma.customer.create({ data });
  }
  if (collection === "customerNotes") {
    const data = customerNoteData(item);
    return data.id
      ? prisma.customerNote.update({ where: { id: data.id }, data })
      : prisma.customerNote.create({ data });
  }
  if (collection === "customerDocuments") {
    const data = customerDocumentData(item);
    return data.id
      ? prisma.customerDocument.update({ where: { id: data.id }, data })
      : prisma.customerDocument.create({ data });
  }
  if (collection === "products") {
    const data = productData(item);
    return data.id
      ? prisma.product.update({ where: { id: data.id }, data })
      : prisma.product.create({ data });
  }
  if (collection === "quotes") return upsertQuote(prisma, item);
  if (collection === "invoices") return upsertInvoice(prisma, item);
  if (collection === "installations") {
    const data = installationData(item);
    if (data.employeeId) {
      const employee = await prisma.employee.findFirst({ where: { id: data.employeeId, status: "active" }, select: { firstName: true, lastName: true } });
      if (!employee) throw Object.assign(new Error("Geselecteerde werknemer is niet actief."), { status: 400 });
      data.installer = `${employee.firstName} ${employee.lastName}`.trim();
    }
    return data.id
      ? prisma.installation.update({ where: { id: data.id }, data })
      : prisma.installation.create({ data });
  }
  if (collection === "advices") {
    const data = adviceData(item);
    return data.id
      ? prisma.advice.update({ where: { id: data.id }, data })
      : prisma.advice.create({ data });
  }
  if (collection === "salesOpportunities") {
    const data = salesOpportunityData(item);
    const saved = data.id
      ? await prisma.salesOpportunity.update({ where: { id: data.id }, data })
      : await prisma.salesOpportunity.create({ data });
    return serializeSalesOpportunity(saved);
  }
  if (collection === "salesAppointments") {
    const appointment = salesAppointmentData(item);
    return appointment.id
      ? prisma.salesAppointment.update({ where: { id: appointment.id }, data: appointment })
      : prisma.salesAppointment.create({ data: appointment });
  }
  throw Object.assign(new Error("Onbekende collectie."), { status: 404 });
}

async function upsert(prisma, collection, item) {
  const result = await upsertItem(prisma, collection, item);
  bootstrapCache.invalidate();
  return result;
}

async function removeItem(prisma, collection, id) {
  if (collection === "customers") return prisma.customer.delete({ where: { id } });
  if (collection === "customerNotes") return prisma.customerNote.delete({ where: { id } });
  if (collection === "customerDocuments") return prisma.customerDocument.delete({ where: { id } });
  if (collection === "products") return prisma.product.delete({ where: { id } });
  if (collection === "quotes") return prisma.quote.delete({ where: { id } });
  if (collection === "invoices") return prisma.invoice.delete({ where: { id } });
  if (collection === "installations") return prisma.installation.delete({ where: { id } });
  if (collection === "advices") return prisma.advice.delete({ where: { id } });
  if (collection === "salesOpportunities") return prisma.salesOpportunity.delete({ where: { id } });
  if (collection === "salesAppointments") return prisma.salesAppointment.delete({ where: { id } });
  throw Object.assign(new Error("Onbekende collectie."), { status: 404 });
}

async function remove(prisma, collection, id) {
  const result = await removeItem(prisma, collection, id);
  bootstrapCache.invalidate();
  return result;
}

async function saveInstallationWorkOrder(prisma, id, item) {
  const data = workOrderData(item || {});
  const result = await prisma.installation.update({ where: { id }, data });
  bootstrapCache.invalidate();
  return result;
}

async function clearBusinessData(tx) {
  await tx.serviceDocument.deleteMany();
  await tx.maintenanceMeasurement.deleteMany();
  await tx.serviceReminderRun.deleteMany();
  await tx.maintenanceVisit.deleteMany();
  await tx.serviceRequest.deleteMany();
  await tx.serviceContract.deleteMany();
  await tx.customerEquipment.deleteMany();
  await tx.serviceAuditEvent.deleteMany();
  await tx.salesAppointment.deleteMany();
  await tx.customerProject.deleteMany();
  await tx.invoiceLine.deleteMany();
  await tx.quoteLine.deleteMany();
  await tx.salesOpportunity.deleteMany();
  await tx.installation.deleteMany();
  await tx.advice.deleteMany();
  await tx.invoice.deleteMany();
  await tx.quote.deleteMany();
  await tx.customerNote.deleteMany();
  await tx.customerDocument.deleteMany();
  await tx.customer.deleteMany();
  await tx.product.deleteMany();
  await tx.counter.deleteMany();
}

function withId(record) {
  return record.id ? record : { ...record, id: crypto.randomUUID() };
}

async function createManyBatch(model, records) {
  if (records.length) await model.createMany({ data: records });
}

async function replaceAll(prisma, payload) {
  const quotes = (payload.quotes || []).map(quoteData).map((item) => ({ ...item, header: withId(item.header) }));
  const invoices = (payload.invoices || []).map(invoiceData).map((item) => ({ ...item, header: withId(item.header) }));
  await prisma.$transaction(async (tx) => {
    await clearBusinessData(tx);
    const settings = payload.settings || payload.data && payload.data.settings || DEFAULT_SETTINGS;
    settings.adviceAssumptions = normalizeAssumptions(settings.adviceAssumptions);
    await tx.setting.upsert({
      where: { key: "settings" },
      update: { value: { ...DEFAULT_SETTINGS, ...settings } },
      create: { key: "settings", value: { ...DEFAULT_SETTINGS, ...settings } }
    });
    await createManyBatch(tx.product, (payload.products || []).map(productData).map(withId));
    await createManyBatch(tx.customer, (payload.customers || []).map(customerData).map(withId));
    await createManyBatch(tx.customerNote, (payload.customerNotes || []).map(customerNoteData).map(withId));
    await createManyBatch(tx.customerDocument, (payload.customerDocuments || []).map(customerDocumentData).map(withId));
    await createManyBatch(tx.quote, quotes.map((item) => item.header));
    await createManyBatch(tx.quoteLine, quotes.flatMap((item) => item.lines.map((line, index) => ({ ...line, quoteId: item.header.id, position: index }))));
    await createManyBatch(tx.invoice, invoices.map((item) => item.header));
    await createManyBatch(tx.invoiceLine, invoices.flatMap((item) => item.lines.map((line, index) => ({ ...line, invoiceId: item.header.id, position: index }))));
    await createManyBatch(tx.installation, (payload.installations || []).map(installationData).map(withId));
    await createManyBatch(tx.advice, (payload.advices || []).map(adviceData).map(withId));
    await createManyBatch(tx.salesOpportunity, (payload.salesOpportunities || []).map(salesOpportunityData).map(withId));
    await createManyBatch(tx.salesAppointment, (payload.salesAppointments || []).map(salesAppointmentData).map(withId));
    await createManyBatch(tx.customerEquipment, payload.serviceEquipment || []);
    await createManyBatch(tx.serviceContract, payload.serviceContracts || []);
    await createManyBatch(tx.serviceRequest, payload.serviceRequests || []);
    await createManyBatch(tx.maintenanceVisit, (payload.maintenanceVisits || []).map((visit) => ({ ...visit, assignedEmployeeId: null, completedAt: asDate(visit.completedAt), signedAt: asDate(visit.signedAt), createdAt: asDate(visit.createdAt), updatedAt: asDate(visit.updatedAt) })));
    await createManyBatch(tx.maintenanceMeasurement, (payload.maintenanceMeasurements || []).map((measurement) => ({ ...measurement, createdAt: asDate(measurement.createdAt) })));
    await createManyBatch(tx.serviceDocument, (payload.serviceDocuments || []).map((document) => ({ ...document, createdAt: asDate(document.createdAt) })));
    await createManyBatch(tx.counter, Object.entries(payload.counters || {}).map(([key, value]) => ({ key, value: parseInt(value, 10) || 0 })));
  }, { timeout: 60_000 });
  bootstrapCache.invalidate();
  await ensureDefaults(prisma);
  return bootstrap(prisma);
}

async function replaceCollection(prisma, collection, items) {
  const current = await bootstrap(prisma);
  current[collection] = items;
  return replaceAll(prisma, current);
}

async function exportData(prisma) {
  const payload = await bootstrap(prisma);
  payload.installations = (payload.installations || []).map(({ employeeId: _employeeId, qualificationCheck: _qualificationCheck, ...installation }) => installation);
  const [serviceEquipment, serviceContracts, serviceRequests, maintenanceVisits, maintenanceMeasurements, serviceDocuments] = await Promise.all([
    prisma.customerEquipment.findMany(), prisma.serviceContract.findMany(), prisma.serviceRequest.findMany(), prisma.maintenanceVisit.findMany(), prisma.maintenanceMeasurement.findMany(), prisma.serviceDocument.findMany()
  ]);
  Object.assign(payload, {
    serviceEquipment,
    serviceContracts,
    serviceRequests: serviceRequests.map(({ assignedEmployeeId: _assignedEmployeeId, ...item }) => ({ ...item, assignedEmployeeId: null })),
    maintenanceVisits: maintenanceVisits.map(({ assignedEmployeeId: _assignedEmployeeId, ...item }) => ({ ...item, assignedEmployeeId: null })),
    maintenanceMeasurements,
    serviceDocuments
  });
  return {
    app: "climature-bedrijfsportaal",
    version: 2,
    exportedAt: new Date().toISOString(),
    data: payload
  };
}

async function importData(prisma, payload) {
  if (!payload || payload.app !== "climature-bedrijfsportaal" || !payload.data) {
    throw Object.assign(new Error("Ongeldig back-upbestand."), { status: 400 });
  }
  return replaceAll(prisma, payload.data);
}

async function resetData(prisma) {
  await prisma.$transaction(async (tx) => {
    await clearBusinessData(tx);
    await tx.setting.deleteMany({});
  });
  bootstrapCache.invalidate();
  lastOverdueRefreshAt = 0;
  lastOverdueRefreshDate = "";
  await ensureDefaults(prisma);
  return bootstrap(prisma);
}

module.exports = {
  COLLECTIONS,
  bootstrap,
  createInvoiceFromQuote,
  exportData,
  ensureDefaults,
  getCounters,
  getSettings,
  importData,
  listCollection,
  listCollectionPage,
  getCollectionItem,
  nextNumber,
  peekNumber,
  remove,
  replaceCollection,
  resetData,
  saveSettings,
  saveInstallationWorkOrder,
  refreshAdviceAssumptions,
  refreshEnergyPrices,
  upsert
};
