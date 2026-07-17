"use strict";

const { DEFAULT_PRODUCTS, DEFAULT_SETTINGS } = require("./defaults");
const { normalizeAssumptions, refreshAdviceAssumptions: refreshAssumptionsFromSources } = require("./advice-assumptions");

const COLLECTIONS = ["customers", "customerNotes", "customerDocuments", "products", "quotes", "invoices", "installations", "advices", "salesOpportunities", "salesAppointments"];
const SALES_STAGES = ["lead", "contact", "advies", "offerte_maken", "offerte_verstuurd", "gewonnen", "verloren"];
const APPOINTMENT_TYPES = ["belafspraak", "videogesprek", "bezoek", "adviesgesprek", "overig"];
const APPOINTMENT_STATUSES = ["gepland", "afgerond", "geannuleerd"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function parseNumber(value) {
  const parsed = parseFloat(String(value == null ? "" : value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateTotals(lines) {
  const normalized = (lines || []).map((line) => {
    const qty = parseNumber(line.qty);
    const priceExVat = parseNumber(line.priceExVat);
    const vatRate = parseNumber(line.vatRate);
    const subtotal = qty * priceExVat;
    const vat = subtotal * (vatRate / 100);
    return {
      productId: line.productId || "",
      description: String(line.description || "").trim(),
      qty,
      unit: String(line.unit || "stuk").trim(),
      priceExVat,
      vatRate,
      subtotal,
      vat,
      total: subtotal + vat
    };
  }).filter((line) => line.description || line.qty || line.priceExVat);
  return {
    lines: normalized,
    subtotal: normalized.reduce((sum, line) => sum + line.subtotal, 0),
    vat: normalized.reduce((sum, line) => sum + line.vat, 0),
    total: normalized.reduce((sum, line) => sum + line.total, 0)
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
  return value;
}

async function refreshAdviceAssumptions(prisma) {
  const current = await getSettings(prisma);
  const adviceAssumptions = await refreshAssumptionsFromSources(current.adviceAssumptions);
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
  return `${numberPrefix(type)}${year}-${String(counter.value).padStart(4, "0")}`;
}

async function peekNumber(prisma, type) {
  const year = new Date().getFullYear();
  const key = `${type}-${year}`;
  const counter = await prisma.counter.findUnique({ where: { key } });
  return `${numberPrefix(type)}${year}-${String(((counter && counter.value) || 0) + 1).padStart(4, "0")}`;
}

async function refreshOverdueInvoices(prisma) {
  await prisma.invoice.updateMany({
    where: {
      status: "verzonden",
      dueDate: { lt: today() }
    },
    data: {
      status: "verlopen",
      statusUpdatedAt: new Date()
    }
  });
}

async function listCollection(prisma, collection) {
  if (collection === "customers") return prisma.customer.findMany({ orderBy: { createdAt: "desc" } });
  if (collection === "customerNotes") return prisma.customerNote.findMany({ orderBy: { createdAt: "desc" } });
  if (collection === "customerDocuments") return prisma.customerDocument.findMany({ orderBy: { createdAt: "desc" } });
  if (collection === "products") return prisma.product.findMany({ orderBy: [{ category: "asc" }, { brand: "asc" }, { name: "asc" }] });
  if (collection === "quotes") {
    const rows = await prisma.quote.findMany({ include: { lines: true }, orderBy: { createdAt: "desc" } });
    return rows.map(serializeQuote);
  }
  if (collection === "invoices") {
    const rows = await prisma.invoice.findMany({ include: { lines: true }, orderBy: { createdAt: "desc" } });
    return rows.map(serializeInvoice);
  }
  if (collection === "installations") return prisma.installation.findMany({ orderBy: [{ plannedDate: "asc" }, { startTime: "asc" }] });
  if (collection === "advices") return prisma.advice.findMany({ orderBy: { createdAt: "desc" } });
  if (collection === "salesOpportunities") {
    const rows = await prisma.salesOpportunity.findMany({ orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }] });
    return rows.map(serializeSalesOpportunity);
  }
  if (collection === "salesAppointments") return prisma.salesAppointment.findMany({ orderBy: [{ date: "asc" }, { startTime: "asc" }] });
  throw Object.assign(new Error("Onbekende collectie."), { status: 404 });
}

async function bootstrap(prisma) {
  await ensureDefaults(prisma);
  await refreshOverdueInvoices(prisma);
  const data = {};
  for (const collection of COLLECTIONS) {
    data[collection] = await listCollection(prisma, collection);
  }
  data.settings = await getSettings(prisma);
  data.counters = await getCounters(prisma);
  return data;
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
  const content = String(item.content || "").trim();
  const size = parseInt(item.size, 10) || 0;
  if (!item.customerId) throw Object.assign(new Error("Klant ontbreekt bij PDF-document."), { status: 400 });
  if (!fileName) throw Object.assign(new Error("Bestandsnaam ontbreekt."), { status: 400 });
  if (mimeType !== "application/pdf" && !fileName.toLowerCase().endsWith(".pdf")) {
    throw Object.assign(new Error("Alleen PDF-bestanden kunnen worden toegevoegd."), { status: 400 });
  }
  if (!content) throw Object.assign(new Error("PDF-bestand is leeg."), { status: 400 });
  if (size > 8 * 1024 * 1024) throw Object.assign(new Error("PDF is groter dan 8 MB."), { status: 400 });
  return stripUndefined({
    id: item.id || undefined,
    customerId: item.customerId,
    fileName,
    mimeType: "application/pdf",
    size,
    content,
    createdAt: asDate(item.createdAt) || undefined
  });
}

function productData(item) {
  return stripUndefined({
    id: item.id || undefined,
    category: String(item.category || "").trim(),
    brand: String(item.brand || "").trim(),
    name: String(item.name || "").trim(),
    specs: String(item.specs || ""),
    priceExVat: parseNumber(item.priceExVat),
    vatRate: parseNumber(item.vatRate) || 21,
    description: String(item.description || ""),
    createdAt: asDate(item.createdAt) || undefined
  });
}

function quoteData(item) {
  const totals = calculateTotals(item.lines || []);
  return {
    header: stripUndefined({
      id: item.id || undefined,
      quoteNumber: item.quoteNumber,
      customerId: item.customerId,
      quoteDate: item.quoteDate || today(),
      validUntil: item.validUntil || today(),
      status: item.status || "concept",
      notes: String(item.notes || ""),
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
    lines: totals.lines
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

async function upsert(prisma, collection, item) {
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

async function remove(prisma, collection, id) {
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

async function saveInstallationWorkOrder(prisma, id, item) {
  const data = workOrderData(item || {});
  return prisma.installation.update({ where: { id }, data });
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

async function replaceAll(prisma, payload) {
  await prisma.$transaction(async (tx) => {
    await clearBusinessData(tx);
    const settings = payload.settings || payload.data && payload.data.settings || DEFAULT_SETTINGS;
    settings.adviceAssumptions = normalizeAssumptions(settings.adviceAssumptions);
    await tx.setting.upsert({
      where: { key: "settings" },
      update: { value: { ...DEFAULT_SETTINGS, ...settings } },
      create: { key: "settings", value: { ...DEFAULT_SETTINGS, ...settings } }
    });
    for (const product of payload.products || []) await tx.product.create({ data: productData(product) });
    for (const customer of payload.customers || []) await tx.customer.create({ data: customerData(customer) });
    for (const note of payload.customerNotes || []) await tx.customerNote.create({ data: customerNoteData(note) });
    for (const document of payload.customerDocuments || []) await tx.customerDocument.create({ data: customerDocumentData(document) });
    for (const quote of payload.quotes || []) {
      const data = quoteData(quote);
      const created = await tx.quote.create({ data: data.header });
      if (data.lines.length) await tx.quoteLine.createMany({ data: data.lines.map((line, index) => ({ ...line, quoteId: created.id, position: index })) });
    }
    for (const invoice of payload.invoices || []) {
      const data = invoiceData(invoice);
      const created = await tx.invoice.create({ data: data.header });
      if (data.lines.length) await tx.invoiceLine.createMany({ data: data.lines.map((line, index) => ({ ...line, invoiceId: created.id, position: index })) });
    }
    for (const installation of payload.installations || []) await tx.installation.create({ data: installationData(installation) });
    for (const advice of payload.advices || []) await tx.advice.create({ data: adviceData(advice) });
    for (const opportunity of payload.salesOpportunities || []) await tx.salesOpportunity.create({ data: salesOpportunityData(opportunity) });
    for (const appointment of payload.salesAppointments || []) await tx.salesAppointment.create({ data: salesAppointmentData(appointment) });
    for (const equipment of payload.serviceEquipment || []) await tx.customerEquipment.create({ data: equipment });
    for (const contract of payload.serviceContracts || []) await tx.serviceContract.create({ data: contract });
    for (const serviceRequest of payload.serviceRequests || []) await tx.serviceRequest.create({ data: serviceRequest });
    for (const visit of payload.maintenanceVisits || []) await tx.maintenanceVisit.create({ data: { ...visit, assignedEmployeeId: null, completedAt: asDate(visit.completedAt), signedAt: asDate(visit.signedAt), createdAt: asDate(visit.createdAt), updatedAt: asDate(visit.updatedAt) } });
    for (const measurement of payload.maintenanceMeasurements || []) await tx.maintenanceMeasurement.create({ data: { ...measurement, createdAt: asDate(measurement.createdAt) } });
    for (const document of payload.serviceDocuments || []) await tx.serviceDocument.create({ data: { ...document, content: Buffer.from(document.content || "", "base64"), createdAt: asDate(document.createdAt) } });
    const counters = payload.counters || {};
    for (const [key, value] of Object.entries(counters)) {
      await tx.counter.create({ data: { key, value: parseInt(value, 10) || 0 } });
    }
  });
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
    serviceDocuments: serviceDocuments.map((item) => ({ ...item, content: Buffer.from(item.content).toString("base64") }))
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
  await ensureDefaults(prisma);
  return bootstrap(prisma);
}

module.exports = {
  COLLECTIONS,
  bootstrap,
  exportData,
  getSettings,
  importData,
  listCollection,
  nextNumber,
  peekNumber,
  remove,
  replaceCollection,
  resetData,
  saveSettings,
  saveInstallationWorkOrder,
  refreshAdviceAssumptions,
  upsert
};
