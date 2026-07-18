"use strict";

const crypto = require("crypto");
const workforce = require("./hr-workforce");
const bootstrapCache = require("./bootstrap-cache");
const filePolicy = require("./infrastructure/object-storage/file-policy");
const { multiplyMoney, parseLocalizedNumber, percentageMoney, roundMoney, sumMoney } = require("./numbers");

const CONTRACT_STATUSES = ["active", "paused", "ended"];
const BILLING_PERIODS = ["once", "monthly", "quarterly", "yearly"];
const EQUIPMENT_STATUSES = ["active", "inactive", "replaced"];
const REQUEST_TYPES = ["malfunction", "maintenance", "warranty", "question", "other"];
const REQUEST_PRIORITIES = ["low", "normal", "high", "urgent"];
const REQUEST_STATUSES = ["open", "planned", "in_progress", "resolved", "cancelled"];
const VISIT_TYPES = ["maintenance", "malfunction", "warranty", "inspection", "other"];
const VISIT_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"];
const WORK_TYPES = ["air_conditioning", "heat_pump", "boiler", "home_battery", "other"];
const managerRoles = ["admin", "execution"];

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function text(value, name, max, required = false) {
  const result = String(value == null ? "" : value).trim();
  if (required && !result) fail(`${name} is verplicht.`);
  if (result.length > max) fail(`${name} is te lang.`);
  return result;
}
function date(value, name, required = false) {
  const result = text(value, name, 10, required);
  if (result && !/^\d{4}-\d{2}-\d{2}$/.test(result)) fail(`${name} is ongeldig.`);
  return result;
}
function time(value, name, fallback = "09:00") {
  const result = text(value || fallback, name, 5, true);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) fail(`${name} is ongeldig.`);
  return result;
}
function number(value, name, min, max, fallback = 0) {
  const result = value === "" || value == null ? fallback : parseLocalizedNumber(value, NaN);
  if (!Number.isFinite(result) || result < min || result > max) fail(`${name} is ongeldig.`);
  return result;
}
function integer(value, name, min, max, fallback) {
  const result = number(value, name, min, max, fallback);
  if (!Number.isInteger(result)) fail(`${name} is ongeldig.`);
  return result;
}
function choice(value, allowed, fallback, name) {
  const result = String(value || fallback);
  if (!allowed.includes(result)) fail(`${name} is ongeldig.`);
  return result;
}
function today() { return new Date().toISOString().slice(0, 10); }
function addMonths(value, months) {
  const result = new Date(`${value || today()}T12:00:00Z`);
  result.setUTCMonth(result.getUTCMonth() + Number(months || 0));
  return result.toISOString().slice(0, 10);
}
function minutes(value) { const parts = String(value || "00:00").split(":").map(Number); return parts[0] * 60 + parts[1]; }
function overlaps(startA, durationA, startB, durationB, buffer = 30) { return minutes(startA) < minutes(startB) + Number(durationB || 0) * 60 + buffer && minutes(startA) + Number(durationA || 0) * 60 + buffer > minutes(startB); }
function customerName(customer) { return customer.companyName || `${customer.firstName} ${customer.lastName}`.trim(); }
function serialize(row) {
  return JSON.parse(JSON.stringify(row, (_key, value) => value instanceof Date ? value.toISOString() : value));
}

async function actor(prisma, sessionUser) {
  const item = await prisma.user.findUnique({ where: { id: sessionUser.id }, select: { id: true, role: true, active: true, employeeId: true } });
  if (!item || !item.active) fail("Geen toegang.", 403);
  return item;
}
async function audit(prisma, sessionUser, action, entityType, entityId, metadata) {
  return prisma.serviceAuditEvent.create({ data: { actorId: sessionUser && sessionUser.id || null, action, entityType, entityId, metadata: metadata || undefined } });
}
async function nextNumber(prisma, type) {
  const prefixes = { contract: "CL-SVC", request: "CL-MEL", visit: "CL-OND" };
  const year = new Date().getFullYear();
  const counter = await prisma.counter.upsert({ where: { key: `service-${type}-${year}` }, update: { value: { increment: 1 } }, create: { key: `service-${type}-${year}`, value: 1 } });
  bootstrapCache.invalidate();
  return `${prefixes[type]}-${year}-${String(counter.value).padStart(4, "0")}`;
}
async function customerExists(prisma, id) {
  const item = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
  if (!item) fail("Klant niet gevonden.", 404);
}
async function matchingEquipment(prisma, customerId, equipmentId) {
  if (!equipmentId) return null;
  const item = await prisma.customerEquipment.findFirst({ where: { id: equipmentId, customerId } });
  if (!item) fail("Apparaat hoort niet bij deze klant.");
  return item;
}

async function dashboard(prisma, sessionUser) {
  const context = await actor(prisma, sessionUser);
  if (context.role === "crm") return {};
  if (context.role === "finance") {
    const contracts = await prisma.serviceContract.findMany({ where: { status: "active" }, select: { price: true, billingPeriod: true } });
    return { activeContracts: contracts.length, annualContractValue: contracts.reduce((sum, item) => sum + item.price * ({ monthly: 12, quarterly: 4, yearly: 1, once: 0 }[item.billingPeriod] || 0), 0) };
  }
  const now = today(), in30 = new Date(`${now}T12:00:00Z`); in30.setUTCDate(in30.getUTCDate() + 30);
  const until = in30.toISOString().slice(0, 10);
  const visitWhere = context.role === "installer" ? { assignedEmployeeId: context.employeeId || "__none__" } : {};
  const [openRequests, urgentRequests, upcomingVisits, overdueMaintenance, expiredWarranties, contracts] = await Promise.all([
    prisma.serviceRequest.count({ where: { status: { in: ["open", "planned", "in_progress"] }, ...(context.role === "installer" ? { assignedEmployeeId: context.employeeId || "__none__" } : {}) } }),
    prisma.serviceRequest.count({ where: { priority: "urgent", status: { in: ["open", "planned", "in_progress"] }, ...(context.role === "installer" ? { assignedEmployeeId: context.employeeId || "__none__" } : {}) } }),
    prisma.maintenanceVisit.count({ where: { ...visitWhere, plannedDate: { gte: now, lte: until }, status: { in: ["scheduled", "in_progress"] } } }),
    prisma.customerEquipment.count({ where: { status: "active", nextMaintenanceDate: { not: "", lt: now } } }),
    prisma.customerEquipment.count({ where: { status: "active", warrantyUntil: { not: "", lt: now } } }),
    prisma.serviceContract.findMany({ where: { status: "active" }, select: { price: true, billingPeriod: true } })
  ]);
  const annualContractValue = contracts.reduce((sum, item) => sum + item.price * ({ monthly: 12, quarterly: 4, yearly: 1, once: 0 }[item.billingPeriod] || 0), 0);
  return { openRequests, urgentRequests, upcomingVisits, overdueMaintenance, expiredWarranties, activeContracts: contracts.length, annualContractValue };
}

const fullInclude = {
  customer: { select: { id: true, firstName: true, lastName: true, companyName: true, email: true, phone: true, address: true, postalCode: true, city: true } },
  equipment: { select: { id: true, type: true, brand: true, model: true, serialNumber: true } }
};

async function bootstrap(prisma, sessionUser, query = {}) {
  const context = await actor(prisma, sessionUser);
  const customerId = query.customerId ? text(query.customerId, "Klant", 100) : undefined;
  if (context.role === "finance") {
    const contracts = await prisma.serviceContract.findMany({ where: { customerId }, include: fullInclude, orderBy: { createdAt: "desc" } });
    return { dashboard: await dashboard(prisma, sessionUser), contracts: contracts.map((item) => ({ id: item.id, contractNumber: item.contractNumber, customerId: item.customerId, customer: item.customer, title: item.title, status: item.status, price: item.price, billingPeriod: item.billingPeriod, startDate: item.startDate, endDate: item.endDate, nextMaintenanceDate: item.nextMaintenanceDate })) };
  }
  if (context.role === "crm") {
    if (!customerId) return { dashboard: await dashboard(prisma, sessionUser), equipment: [], contracts: [], requests: [], visits: [] };
    const [equipment, contracts, requests, visits] = await Promise.all([
      prisma.customerEquipment.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } }),
      prisma.serviceContract.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } }),
      prisma.serviceRequest.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.maintenanceVisit.findMany({ where: { customerId }, orderBy: [{ plannedDate: "desc" }, { startTime: "desc" }], take: 50 })
    ]);
    return serialize({
      dashboard: await dashboard(prisma, sessionUser),
      equipment: equipment.map((item) => ({ id: item.id, customerId: item.customerId, type: item.type, brand: item.brand, model: item.model, serialNumber: item.serialNumber, installedAt: item.installedAt, warrantyUntil: item.warrantyUntil, nextMaintenanceDate: item.nextMaintenanceDate, status: item.status })),
      contracts: contracts.map((item) => ({ id: item.id, contractNumber: item.contractNumber, customerId: item.customerId, equipmentId: item.equipmentId, title: item.title, status: item.status, startDate: item.startDate, endDate: item.endDate, nextMaintenanceDate: item.nextMaintenanceDate })),
      requests: requests.map((item) => ({ id: item.id, requestNumber: item.requestNumber, customerId: item.customerId, equipmentId: item.equipmentId, title: item.title, type: item.type, priority: item.priority, status: item.status, preferredDate: item.preferredDate, createdAt: item.createdAt })),
      visits: visits.map((item) => ({ id: item.id, visitNumber: item.visitNumber, customerId: item.customerId, equipmentId: item.equipmentId, type: item.type, status: item.status, plannedDate: item.plannedDate, startTime: item.startTime, completedAt: item.completedAt }))
    });
  }
  const own = context.role === "installer" ? { assignedEmployeeId: context.employeeId || "__none__" } : {};
  const [equipment, contracts, requests, visits] = await Promise.all([
    context.role === "installer" ? [] : prisma.customerEquipment.findMany({ where: { customerId }, include: { customer: fullInclude.customer }, orderBy: { createdAt: "desc" } }),
    context.role === "installer" ? [] : prisma.serviceContract.findMany({ where: { customerId }, include: fullInclude, orderBy: { createdAt: "desc" } }),
    prisma.serviceRequest.findMany({ where: { customerId, ...own }, include: fullInclude, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.maintenanceVisit.findMany({ where: { customerId, ...own }, include: { ...fullInclude, assignedEmployee: { select: { id: true, firstName: true, lastName: true } }, measurements: true, documents: { select: { id: true, fileName: true, mimeType: true, size: true, scanStatus: true, createdAt: true } } }, orderBy: [{ plannedDate: "desc" }, { startTime: "desc" }], take: 200 })
  ]);
  return serialize({ dashboard: await dashboard(prisma, sessionUser), equipment, contracts, requests, visits });
}

async function saveEquipment(prisma, sessionUser, id, input) {
  const customerId = text(input.customerId, "Klant", 100, true); await customerExists(prisma, customerId);
  const current = id ? await prisma.customerEquipment.findUnique({ where: { id } }) : null;
  if (id && !current) fail("Apparaat niet gevonden.", 404);
  const interval = integer(input.maintenanceIntervalMonths, "Onderhoudsinterval", 1, 120, current ? current.maintenanceIntervalMonths : 12);
  const last = date(input.lastMaintenanceDate, "Laatste onderhoud");
  const installedAt = date(input.installedAt, "Installatiedatum");
  const payload = { customerId, installationId: text(input.installationId, "Installatie", 100) || null, type: text(input.type, "Apparaattype", 80, true), brand: text(input.brand, "Merk", 100), model: text(input.model, "Model", 120), serialNumber: text(input.serialNumber, "Serienummer", 160), installedAt, warrantyUntil: date(input.warrantyUntil, "Garantie tot"), maintenanceIntervalMonths: interval, lastMaintenanceDate: last, nextMaintenanceDate: date(input.nextMaintenanceDate, "Volgend onderhoud") || addMonths(last || installedAt, interval), status: choice(input.status, EQUIPMENT_STATUSES, current ? current.status : "active", "Apparaatstatus"), notes: text(input.notes, "Notities", 4000) };
  const saved = current ? await prisma.customerEquipment.update({ where: { id }, data: payload }) : await prisma.customerEquipment.create({ data: payload });
  await audit(prisma, sessionUser, current ? "equipment.updated" : "equipment.created", "equipment", saved.id, { customerId, status: saved.status });
  return serialize(saved);
}

async function saveContract(prisma, sessionUser, id, input) {
  const customerId = text(input.customerId, "Klant", 100, true); await customerExists(prisma, customerId);
  const current = id ? await prisma.serviceContract.findUnique({ where: { id } }) : null;
  if (id && !current) fail("Servicecontract niet gevonden.", 404);
  const equipment = await matchingEquipment(prisma, customerId, input.equipmentId || null);
  const startDate = date(input.startDate, "Startdatum", true), endDate = date(input.endDate, "Einddatum");
  if (endDate && endDate < startDate) fail("Einddatum mag niet vóór startdatum liggen.");
  const frequency = integer(input.maintenanceFrequency, "Onderhoudsfrequentie", 1, 120, current ? current.maintenanceFrequency : 12);
  const payload = { customerId, equipmentId: equipment && equipment.id, title: text(input.title, "Contracttitel", 180, true), status: choice(input.status, CONTRACT_STATUSES, current ? current.status : "active", "Contractstatus"), startDate, endDate, price: number(input.price, "Prijs", 0, 1000000), billingPeriod: choice(input.billingPeriod, BILLING_PERIODS, current ? current.billingPeriod : "yearly", "Facturatieperiode"), maintenanceFrequency: frequency, nextMaintenanceDate: date(input.nextMaintenanceDate, "Volgend onderhoud") || addMonths(startDate, frequency), notes: text(input.notes, "Notities", 4000) };
  const saved = current ? await prisma.serviceContract.update({ where: { id }, data: payload }) : await prisma.serviceContract.create({ data: { ...payload, contractNumber: await nextNumber(prisma, "contract") } });
  await audit(prisma, sessionUser, current ? "contract.updated" : "contract.created", "contract", saved.id, { status: saved.status, customerId });
  return serialize(saved);
}

async function saveRequest(prisma, sessionUser, id, input) {
  const customerId = text(input.customerId, "Klant", 100, true); await customerExists(prisma, customerId);
  const current = id ? await prisma.serviceRequest.findUnique({ where: { id } }) : null;
  if (id && !current) fail("Servicemelding niet gevonden.", 404);
  const equipment = await matchingEquipment(prisma, customerId, input.equipmentId || null);
  const status = choice(input.status, REQUEST_STATUSES, current ? current.status : "open", "Meldingstatus");
  const assignedEmployeeId = text(input.assignedEmployeeId, "Monteur", 100) || null;
  if (assignedEmployeeId && !(await prisma.employee.findFirst({ where: { id: assignedEmployeeId, status: "active" } }))) fail("Actieve monteur niet gevonden.");
  const payload = { customerId, equipmentId: equipment && equipment.id, title: text(input.title, "Titel", 180, true), type: choice(input.type, REQUEST_TYPES, current ? current.type : "malfunction", "Meldingstype"), priority: choice(input.priority, REQUEST_PRIORITIES, current ? current.priority : "normal", "Prioriteit"), description: text(input.description, "Omschrijving", 8000), status, assignedEmployeeId, preferredDate: date(input.preferredDate, "Voorkeursdatum"), resolvedAt: status === "resolved" ? (current && current.resolvedAt || new Date()) : null };
  const saved = current ? await prisma.serviceRequest.update({ where: { id }, data: payload }) : await prisma.serviceRequest.create({ data: { ...payload, requestNumber: await nextNumber(prisma, "request") } });
  await audit(prisma, sessionUser, current ? "request.updated" : "request.created", "request", saved.id, { status, priority: saved.priority });
  return serialize(saved);
}

function materials(value) {
  if (!Array.isArray(value)) return [];
  if (value.length > 100) fail("Te veel materiaalregels.");
  return value.map((item) => ({ description: text(item.description, "Materiaal", 240, true), quantity: number(item.quantity, "Aantal", 0.01, 100000, 1), unit: text(item.unit, "Eenheid", 40) || "stuk", priceExVat: number(item.priceExVat, "Prijs", 0, 1000000, 0) }));
}
function measurements(value) {
  if (!Array.isArray(value)) return [];
  if (value.length > 100) fail("Te veel meetwaarden.");
  return value.map((item) => ({ name: text(item.name, "Meetwaarde", 160, true), value: number(item.value, "Meetwaarde", -1000000000, 1000000000), unit: text(item.unit, "Eenheid", 40), note: text(item.note, "Meetnotitie", 500) }));
}

async function assertVisitAccess(prisma, sessionUser, id) {
  const context = await actor(prisma, sessionUser);
  const visit = await prisma.maintenanceVisit.findUnique({ where: { id } });
  if (!visit) fail("Onderhoudsbezoek niet gevonden.", 404);
  if (context.role === "installer" && (!context.employeeId || visit.assignedEmployeeId !== context.employeeId)) fail("Geen toegang.", 403);
  return { context, visit };
}

async function saveVisit(prisma, sessionUser, id, input) {
  const context = await actor(prisma, sessionUser);
  const current = id ? (await assertVisitAccess(prisma, sessionUser, id)).visit : null;
  if (!current && !managerRoles.includes(context.role)) fail("Geen toegang.", 403);
  const installerMode = context.role === "installer";
  const customerId = installerMode || (current && input.customerId === undefined) ? current.customerId : text(input.customerId, "Klant", 100, true);
  if (!installerMode) await customerExists(prisma, customerId);
  const equipmentId = installerMode || (current && input.equipmentId === undefined) ? current.equipmentId : ((await matchingEquipment(prisma, customerId, input.equipmentId || null)) || {}).id || null;
  const plannedDate = installerMode || (current && input.plannedDate === undefined) ? current.plannedDate : date(input.plannedDate, "Bezoekdatum", true);
  const workType = installerMode || (current && input.workType === undefined) ? current.workType : choice(input.workType, WORK_TYPES, current ? current.workType : "other", "Werksoort");
  const assignedEmployeeId = installerMode || (current && input.assignedEmployeeId === undefined) ? current.assignedEmployeeId : (text(input.assignedEmployeeId, "Monteur", 100) || null);
  const startTime = installerMode || (current && input.startTime === undefined) ? current.startTime : time(input.startTime, "Starttijd");
  const durationHours = installerMode || (current && input.durationHours === undefined) ? current.durationHours : number(input.durationHours, "Duur", 0.5, 24, 2);
  const contractId = installerMode || (current && input.contractId === undefined) ? current.contractId : (text(input.contractId, "Contract", 100) || null);
  const serviceRequestId = installerMode || (current && input.serviceRequestId === undefined) ? current.serviceRequestId : (text(input.serviceRequestId, "Servicemelding", 100) || null);
  if (contractId && !(await prisma.serviceContract.findFirst({ where: { id: contractId, customerId }, select: { id: true } }))) fail("Servicecontract hoort niet bij deze klant.");
  if (serviceRequestId && !(await prisma.serviceRequest.findFirst({ where: { id: serviceRequestId, customerId }, select: { id: true } }))) fail("Servicemelding hoort niet bij deze klant.");
  let qualificationCheck = current && current.qualificationCheck || null;
  if (assignedEmployeeId) {
    const employee = await prisma.employee.findFirst({ where: { id: assignedEmployeeId, status: "active" } });
    if (!employee) fail("Actieve monteur niet gevonden.");
    qualificationCheck = await workforce.checkEmployeeQualifications(prisma, assignedEmployeeId, workType, plannedDate);
    const available = (await availability(prisma, { plannedDate, startTime, durationHours, workType, excludeVisitId: current && current.id })).find((item) => item.id === assignedEmployeeId);
    qualificationCheck.availability = available ? { available: available.available, reasons: available.reasons } : { available: false, reasons: ["inactive"] };
  }
  const status = choice(input.status, VISIT_STATUSES, current ? current.status : "scheduled", "Bezoekstatus");
  if (installerMode && !["scheduled", "in_progress", "completed"].includes(status)) fail("Geen toegang.", 403);
  const measurementRows = measurements(input.measurements);
  const payload = {
    customerId, equipmentId,
    contractId,
    serviceRequestId,
    assignedEmployeeId, type: installerMode || (current && input.type === undefined) ? current.type : choice(input.type, VISIT_TYPES, current ? current.type : "maintenance", "Bezoekstype"),
    status, plannedDate, startTime,
    durationHours, workType, qualificationCheck,
    diagnosis: current && input.diagnosis === undefined ? current.diagnosis : text(input.diagnosis, "Diagnose", 8000),
    workPerformed: current && input.workPerformed === undefined ? current.workPerformed : text(input.workPerformed, "Werkzaamheden", 12000),
    materialsUsed: current && input.materialsUsed === undefined ? current.materialsUsed : materials(input.materialsUsed),
    customerName: current && input.customerName === undefined ? current.customerName : text(input.customerName, "Naam klant", 180),
    customerSignature: current && input.customerSignature === undefined ? current.customerSignature : text(input.customerSignature, "Handtekening", 300000),
    signedAt: input.customerSignature === undefined ? (current && current.signedAt) : (input.customerSignature ? (current && current.signedAt || new Date()) : null),
    completedAt: status === "completed" ? (current && current.completedAt || new Date()) : null, notes: text(input.notes, "Notities", 8000)
  };
  const saved = await prisma.$transaction(async (tx) => {
    const row = current ? await tx.maintenanceVisit.update({ where: { id }, data: payload }) : await tx.maintenanceVisit.create({ data: { ...payload, visitNumber: await nextNumber(tx, "visit") } });
    if (input.measurements !== undefined) {
      await tx.maintenanceMeasurement.deleteMany({ where: { visitId: row.id } });
      if (measurementRows.length) await tx.maintenanceMeasurement.createMany({ data: measurementRows.map((item) => ({ ...item, visitId: row.id })) });
    }
    if (status === "completed") {
      if (equipmentId) await tx.customerEquipment.update({ where: { id: equipmentId }, data: { lastMaintenanceDate: plannedDate, nextMaintenanceDate: addMonths(plannedDate, (await tx.customerEquipment.findUnique({ where: { id: equipmentId }, select: { maintenanceIntervalMonths: true } })).maintenanceIntervalMonths) } });
      if (row.contractId) {
        const contract = await tx.serviceContract.findUnique({ where: { id: row.contractId } });
        if (contract) await tx.serviceContract.update({ where: { id: contract.id }, data: { nextMaintenanceDate: addMonths(plannedDate, contract.maintenanceFrequency) } });
      }
      if (row.serviceRequestId) await tx.serviceRequest.update({ where: { id: row.serviceRequestId }, data: { status: "resolved", resolvedAt: new Date() } });
    }
    return tx.maintenanceVisit.findUnique({ where: { id: row.id }, include: { ...fullInclude, assignedEmployee: { select: { id: true, firstName: true, lastName: true } }, measurements: true, documents: { select: { id: true, fileName: true, mimeType: true, size: true, scanStatus: true, createdAt: true } } } });
  });
  await audit(prisma, sessionUser, current ? "visit.updated" : "visit.created", "visit", saved.id, { status, assignedEmployeeId, qualificationWarnings: qualificationCheck && qualificationCheck.warnings ? qualificationCheck.warnings.map((item) => item.code) : [] });
  return serialize(saved);
}

async function availability(prisma, input) {
  const plannedDate = date(input.plannedDate, "Bezoekdatum", true), startTime = time(input.startTime, "Starttijd"), durationHours = number(input.durationHours, "Duur", 0.5, 24, 2);
  const base = await require("./project-data").availabilityDirectory(prisma, { date: plannedDate, startTime, durationHours, workType: input.workType, travelBufferMinutes: input.travelBufferMinutes || 30 });
  const visits = await prisma.maintenanceVisit.findMany({ where: { plannedDate, status: { not: "cancelled" }, id: input.excludeVisitId ? { not: input.excludeVisitId } : undefined }, select: { assignedEmployeeId: true, startTime: true, durationHours: true } });
  return base.map((employee) => {
    const clash = visits.some((visit) => visit.assignedEmployeeId === employee.id && overlaps(startTime, durationHours, visit.startTime, visit.durationHours, Number(input.travelBufferMinutes || 30)));
    return clash ? { ...employee, available: false, reasons: Array.from(new Set((employee.reasons || []).concat("service_overlap"))) } : employee;
  });
}

async function createInvoice(prisma, sessionUser, visitId) {
  const { visit } = await assertVisitAccess(prisma, sessionUser, visitId);
  if (visit.status !== "completed") fail("Rond het onderhoudsbezoek eerst af.", 409);
  if (visit.invoiceId) return prisma.invoice.findUnique({ where: { id: visit.invoiceId }, include: { lines: true } });
  const contract = visit.contractId ? await prisma.serviceContract.findUnique({ where: { id: visit.contractId } }) : null;
  const materialRows = Array.isArray(visit.materialsUsed) ? visit.materialsUsed : [];
  const baseLines = contract && contract.price > 0 ? [{ description: contract.title, qty: 1, unit: "bezoek", priceExVat: contract.price, vatRate: 21 }] : [];
  const lines = baseLines.concat(materialRows.filter((item) => item.priceExVat > 0).map((item) => ({ description: item.description, qty: item.quantity, unit: item.unit, priceExVat: item.priceExVat, vatRate: 21 })));
  if (!lines.length) fail("Voeg een contractprijs of geprijsde materialen toe.", 409);
  const calculated = lines.map((line) => {
    const subtotal = multiplyMoney(line.qty, line.priceExVat);
    const vat = percentageMoney(subtotal, line.vatRate);
    return { ...line, subtotal, vat, total: roundMoney(subtotal + vat) };
  });
  const invoiceNumber = await require("./data").nextNumber(prisma, "invoice");
  const invoiceDate = today();
  const settings = await require("./data").getSettings(prisma);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${visit.id}))) AS acquired`;
    const lockedVisit = await tx.maintenanceVisit.findUnique({ where: { id: visit.id }, select: { invoiceId: true } });
    if (lockedVisit && lockedVisit.invoiceId) return { invoice: await tx.invoice.findUnique({ where: { id: lockedVisit.invoiceId }, include: { lines: true } }), created: false };
    const created = await tx.invoice.create({ data: { invoiceNumber, customerId: visit.customerId, invoiceDate, dueDate: (() => { const d = new Date(`${invoiceDate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + Number(settings.paymentDays || 14)); return d.toISOString().slice(0, 10); })(), notes: `Onderhoudsbezoek ${visit.visitNumber}`, paymentInstructions: settings.defaultInvoiceNote || "", subtotal: sumMoney(calculated.map((item) => item.subtotal)), vat: sumMoney(calculated.map((item) => item.vat)), total: sumMoney(calculated.map((item) => item.total)), lines: { create: calculated.map((item, position) => ({ ...item, position, productId: "" })) } }, include: { lines: true } });
    await tx.maintenanceVisit.update({ where: { id: visit.id }, data: { invoiceId: created.id } });
    return { invoice: created, created: true };
  });
  if (result.created) {
    bootstrapCache.invalidate();
    await audit(prisma, sessionUser, "visit.invoice_created", "visit", visit.id, { invoiceId: result.invoice.id, invoiceNumber: result.invoice.invoiceNumber });
  }
  return serialize(result.invoice);
}

function matchesMagicBytes(file) {
  const head = file.buffer.subarray(0, 8);
  if (file.mimetype === "application/pdf") return head.subarray(0, 5).toString("ascii") === "%PDF-";
  if (file.mimetype === "image/jpeg") return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (file.mimetype === "image/png") return head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return false;
}

async function saveDocument(prisma, config, objectStorage, sessionUser, target, id, file) {
  const metadata = filePolicy.validateFile(file, ["pdf", "jpeg", "png"]);
  let data = {};
  if (target === "request") { await prisma.serviceRequest.findUniqueOrThrow({ where: { id } }).catch(() => fail("Servicemelding niet gevonden.", 404)); data.serviceRequestId = id; }
  else { await assertVisitAccess(prisma, sessionUser, id); data.visitId = id; }
  const scan = await filePolicy.scanFile(config, file.buffer);
  const key = filePolicy.storageKey("service-documents");
  await objectStorage.put(key, file.buffer, metadata);
  let item;
  try {
    item = await prisma.serviceDocument.create({ data: { ...data, fileName: metadata.fileName, mimeType: metadata.mimeType, size: metadata.size, sha256: metadata.sha256, scanStatus: "clean", scanMessage: scan.message || "", storageKey: key } });
  } catch (error) { await objectStorage.delete(key).catch(() => {}); throw error; }
  await audit(prisma, sessionUser, "document.uploaded", target, id, { documentId: item.id, fileName: item.fileName });
  return { id: item.id, fileName: item.fileName, mimeType: item.mimeType, size: item.size, scanStatus: item.scanStatus, createdAt: item.createdAt };
}
async function documentFile(prisma, objectStorage, sessionUser, id) {
  const item = await prisma.serviceDocument.findUnique({ where: { id } });
  if (!item || item.scanStatus !== "clean") fail("Document niet gevonden.", 404);
  if (item.visitId) await assertVisitAccess(prisma, sessionUser, item.visitId);
  if (item.serviceRequestId && (await actor(prisma, sessionUser)).role === "installer") fail("Geen toegang.", 403);
  const content = await objectStorage.get(item.storageKey);
  if (crypto.createHash("sha256").update(content).digest("hex") !== item.sha256) fail("Integriteitscontrole van document is mislukt.", 500);
  return { ...item, content };
}

async function sendReminders(prisma, config, sessionUser) {
  const settings = await require("./data").getSettings(prisma);
  const reminderSettings = settings.serviceReminders || { enabled: true, daysBefore: 30 };
  if (reminderSettings.enabled === false) return [];
  if (!config.resendApiKey || !config.serviceMailFrom) fail("Service-e-mail is nog niet geconfigureerd.", 503);
  const daysBefore = Math.max(1, Math.min(180, Number(reminderSettings.daysBefore || 30)));
  const current = today(), untilDate = new Date(`${current}T12:00:00Z`); untilDate.setUTCDate(untilDate.getUTCDate() + daysBefore); const until = untilDate.toISOString().slice(0, 10);
  const contracts = await prisma.serviceContract.findMany({ where: { status: "active", nextMaintenanceDate: { gte: current, lte: until } }, include: { customer: true, equipment: true } });
  const results = [];
  for (const contract of contracts) {
    let run;
    try { run = await prisma.serviceReminderRun.create({ data: { contractId: contract.id, reminderDate: current } }); }
    catch (error) { if (error.code === "P2002") { results.push({ contractId: contract.id, status: "duplicate" }); continue; } throw error; }
    if (!contract.customer.email) { await prisma.serviceReminderRun.update({ where: { id: run.id }, data: { status: "skipped", lastError: "Klant heeft geen e-mailadres." } }); results.push({ contractId: contract.id, status: "skipped" }); continue; }
    try {
      const equipment = contract.equipment ? `${contract.equipment.brand} ${contract.equipment.model}`.trim() : "uw installatie";
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: config.serviceMailFrom, to: [contract.customer.email], subject: "Onderhoud aan uw installatie", text: `Beste ${customerName(contract.customer)},\n\nVolgens ons onderhoudscontract staat het onderhoud aan ${equipment} gepland rond ${contract.nextMaintenanceDate}. Wij nemen contact met u op om een afspraak te maken.\n\nMet vriendelijke groet,\nClimature` }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "E-mailprovider heeft het bericht geweigerd.");
      await prisma.serviceReminderRun.update({ where: { id: run.id }, data: { status: "sent", providerId: payload.id || "", sentAt: new Date() } }); results.push({ contractId: contract.id, status: "sent" });
    } catch (error) { await prisma.serviceReminderRun.update({ where: { id: run.id }, data: { status: "failed", lastError: String(error.message || error).slice(0, 1000) } }); results.push({ contractId: contract.id, status: "failed" }); }
  }
  await audit(prisma, sessionUser, "reminders.run", "service", current, { results });
  return results;
}

async function sendVisitConfirmation(prisma, config, sessionUser, visitId) {
  if (!config.resendApiKey || !config.serviceMailFrom) fail("Service-e-mail is nog niet geconfigureerd.", 503);
  const visit = await prisma.maintenanceVisit.findUnique({ where: { id: visitId }, include: { customer: true, equipment: true, assignedEmployee: true } });
  if (!visit) fail("Onderhoudsbezoek niet gevonden.", 404);
  if (!visit.customer.email) fail("Klant heeft geen e-mailadres.", 409);
  const alreadySent = await prisma.serviceAuditEvent.findFirst({ where: { action: "visit.confirmation_sent", entityType: "visit", entityId: visit.id } });
  if (alreadySent) return { status: "duplicate" };
  const equipment = visit.equipment ? `${visit.equipment.brand} ${visit.equipment.model}`.trim() : "uw installatie";
  const employee = visit.assignedEmployee ? `${visit.assignedEmployee.firstName} ${visit.assignedEmployee.lastName}`.trim() : "onze servicemonteur";
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: config.serviceMailFrom, to: [visit.customer.email], subject: `Afspraakbevestiging ${visit.visitNumber}`, text: `Beste ${customerName(visit.customer)},\n\nHierbij bevestigen wij de afspraak voor ${equipment} op ${visit.plannedDate} om ${visit.startTime}. ${employee} voert het bezoek uit.\n\nMet vriendelijke groet,\nClimature` }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) fail(payload.message || "Afspraakbevestiging kon niet worden verstuurd.", 502);
  await audit(prisma, sessionUser, "visit.confirmation_sent", "visit", visit.id, { providerId: payload.id || "" });
  return { status: "sent", providerId: payload.id || "" };
}

module.exports = { managerRoles, dashboard, bootstrap, saveEquipment, saveContract, saveRequest, saveVisit, availability, assertVisitAccess, createInvoice, saveDocument, documentFile, sendReminders, sendVisitConfirmation, audit };
