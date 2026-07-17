"use strict";

const security = require("./hr-security");
const workforce = require("./hr-workforce");

const WORK_TYPES = ["air_conditioning", "heat_pump", "boiler", "home_battery", "other"];
const PROJECT_STATUSES = ["preparation", "ready", "in_progress", "completed", "cancelled"];
const MATERIAL_STATUSES = ["to_determine", "to_order", "ordered", "confirmed", "partial", "delivered", "cancelled"];
const TASK_STATUSES = ["open", "completed", "not_applicable"];
const MEMBER_ROLES = ["lead_installer", "assistant", "project_owner"];
const EQUIPMENT_STATUSES = ["not_connected", "prepared", "connected", "error"];

const TYPE_LABELS = {
  air_conditioning: "Airconditioning",
  heat_pump: "Warmtepomp",
  boiler: "Cv-ketel",
  home_battery: "Thuisbatterij",
  other: "Overig"
};

const COMMON_TASKS = [
  ["Schouw en technische situatie gecontroleerd", "preparation", -28, false],
  ["Klantvoorwaarden en bereikbaarheid gecontroleerd", "customer", -14, true],
  ["Installatieplanning definitief bevestigd", "planning", -14, true],
  ["Materialen en gereedschap gecontroleerd", "materials", -3, true],
  ["Werkvoorbereiding vrijgegeven", "administration", -1, false]
];

const TEMPLATE_MATERIALS = {
  home_battery: [["Thuisbatterij (model uit offerte)", 21, 3], ["Omvormer / energiemanagement", 14, 3], ["Energiemeter", 10, 3], ["Bekabeling", 5, 2], ["Beveiligingen", 7, 2], ["Montagemateriaal", 5, 2]],
  heat_pump: [["Buitenunit", 28, 5], ["Binnenunit", 28, 5], ["Boiler / buffervat", 21, 5], ["Leidingwerk", 7, 3], ["Appendages", 7, 3], ["Elektramateriaal", 7, 3]],
  air_conditioning: [["Buitenunit", 21, 4], ["Binnenunit(s)", 21, 4], ["Koelleidingen", 7, 3], ["Condensafvoer", 5, 2], ["Montagemateriaal", 5, 2]],
  boiler: [["Cv-ketel", 14, 3], ["Rookgasafvoer", 7, 3], ["Aansluitmateriaal", 5, 2], ["Regeling / thermostaat", 7, 2]],
  other: []
};

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function cleanText(value, name, max, required = false) {
  const result = String(value == null ? "" : value).trim();
  if (required && !result) fail(`${name} is verplicht.`);
  if (result.length > max) fail(`${name} is te lang.`);
  return result;
}
function dateValue(value, name, required = false) {
  const result = cleanText(value, name, 10, required);
  if (result && !/^\d{4}-\d{2}-\d{2}$/.test(result)) fail(`${name} is ongeldig.`);
  return result;
}
function timeValue(value, name, fallback = "") {
  const result = cleanText(value || fallback, name, 5, Boolean(fallback));
  if (result && !/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) fail(`${name} is ongeldig.`);
  return result;
}
function enumValue(value, allowed, fallback, name) {
  const result = String(value || fallback);
  if (!allowed.includes(result)) fail(`${name} is ongeldig.`);
  return result;
}
function boolValue(value, fallback = true) {
  if (value === undefined) return fallback;
  return value === true || value === "true" || value === "1" || value === 1;
}
function numberValue(value, name, min, max, fallback = 0) {
  const result = value === "" || value == null ? fallback : Number(value);
  if (!Number.isFinite(result) || result < min || result > max) fail(`${name} is ongeldig.`);
  return result;
}
function today() { return new Date().toISOString().slice(0, 10); }
function addDays(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}
function previousWorkday(value) {
  let date = value;
  while ([0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())) date = addDays(date, -1);
  return date;
}
function automaticTaskDate(plannedDate, offset) { return previousWorkday(addDays(plannedDate, offset)); }
function automaticMaterialDates(plannedDate, neededOffsetDays, leadTimeDays, safetyMarginDays) {
  const neededOnDate = addDays(plannedDate, neededOffsetDays);
  return { neededOnDate, orderByDate: previousWorkday(addDays(neededOnDate, -(leadTimeDays + safetyMarginDays))) };
}
function minutes(value) { const parts = String(value || "00:00").split(":").map(Number); return parts[0] * 60 + parts[1]; }
function endTime(start, hours) { const total = minutes(start) + Math.round(Number(hours || 0) * 60); return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; }
function overlaps(startA, endA, startB, endB, buffer = 0) { return minutes(startA) < minutes(endB) + buffer && minutes(endA) + buffer > minutes(startB); }
function customerName(customer) { return customer.companyName || `${customer.firstName} ${customer.lastName}`.trim(); }

async function ensureTemplates(prisma) {
  for (const workType of WORK_TYPES) {
    const template = await prisma.projectTemplate.upsert({ where: { workType }, update: {}, create: { workType, name: `${TYPE_LABELS[workType]} projecttemplate` } });
    if (await prisma.projectTemplateTask.count({ where: { templateId: template.id } }) === 0) {
      await prisma.projectTemplateTask.createMany({ data: COMMON_TASKS.map((item, index) => ({ templateId: template.id, title: item[0], category: item[1], dueOffsetDays: item[2], operational: item[3], sortOrder: index })) });
    }
    if (await prisma.projectTemplateMaterial.count({ where: { templateId: template.id } }) === 0 && TEMPLATE_MATERIALS[workType].length) {
      await prisma.projectTemplateMaterial.createMany({ data: TEMPLATE_MATERIALS[workType].map((item, index) => ({ templateId: template.id, name: item[0], leadTimeDays: item[1], safetyMarginDays: item[2], sortOrder: index })) });
    }
  }
}

async function nextProjectNumber(prisma) {
  const year = new Date().getFullYear();
  const counter = await prisma.counter.upsert({ where: { key: `project-${year}` }, update: { value: { increment: 1 } }, create: { key: `project-${year}`, value: 1 } });
  return `CL-PRJ-${year}-${String(counter.value).padStart(4, "0")}`;
}

async function templateSnapshot(prisma, workType, plannedDate, quoteId) {
  await ensureTemplates(prisma);
  const template = await prisma.projectTemplate.findUnique({ where: { workType }, include: { tasks: { orderBy: { sortOrder: "asc" } }, materials: { orderBy: { sortOrder: "asc" } } } });
  const quote = quoteId ? await prisma.quote.findUnique({ where: { id: quoteId }, include: { lines: { orderBy: { position: "asc" } } } }) : null;
  const tasks = template.tasks.map((item) => ({ title: item.title, category: item.category, description: item.description, dueOffsetDays: item.dueOffsetDays, dueDate: automaticTaskDate(plannedDate, item.dueOffsetDays), automaticDate: true, required: item.required, operational: item.operational }));
  const materials = template.materials.map((item) => ({ ...automaticMaterialDates(plannedDate, item.neededOffsetDays, item.leadTimeDays, item.safetyMarginDays), name: item.name, sku: item.sku, unit: item.unit, quantity: item.quantity, supplier: item.supplier, leadTimeDays: item.leadTimeDays, safetyMarginDays: item.safetyMarginDays, neededOffsetDays: item.neededOffsetDays, status: "to_determine" }));
  if (quote && quote.lines.length) {
    const quoted = quote.lines.filter((line) => line.productId || line.description).map((line) => ({ name: line.description, sku: line.productId || "", unit: line.unit || "stuk", quantity: line.qty || 1 }));
    if (quoted.length && materials.length) Object.assign(materials[0], quoted.shift());
    quoted.forEach((line) => materials.push({ ...automaticMaterialDates(plannedDate, 0, 14, 3), ...line, supplier: "", leadTimeDays: 14, safetyMarginDays: 3, neededOffsetDays: 0, status: "to_determine" }));
  }
  return { template, tasks, materials };
}

async function audit(prisma, projectId, actorId, action, entityType, entityId, metadata) {
  return prisma.projectAuditEvent.create({ data: { projectId, actorId: actorId || null, action, entityType, entityId, metadata: metadata || undefined } });
}

async function createProject(prisma, input, actorId) {
  const customerId = cleanText(input.customerId, "Klant", 100, true);
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) fail("Klant niet gevonden.", 404);
  const workType = enumValue(input.workType, WORK_TYPES, "other", "Werksoort");
  const plannedDate = dateValue(input.plannedDate, "Installatiedatum", true);
  const quoteId = cleanText(input.quoteId, "Offerte", 100) || null;
  const snapshot = await templateSnapshot(prisma, workType, plannedDate, quoteId);
  const projectNumber = await nextProjectNumber(prisma);
  const project = await prisma.customerProject.create({ data: {
    projectNumber, customerId, quoteId, installationId: input.installationId || null, ownerUserId: actorId || null,
    title: cleanText(input.title, "Projecttitel", 180) || `${TYPE_LABELS[workType]} - ${customerName(customer)}`,
    workType, plannedDate, startTime: timeValue(input.startTime, "Starttijd", "09:00"), durationHours: numberValue(input.durationHours, "Duur", 0.5, 24, 4),
    tasks: { create: snapshot.tasks }, materials: { create: snapshot.materials }
  } });
  if (input.employeeId) await prisma.projectMember.create({ data: { projectId: project.id, employeeId: input.employeeId, role: "lead_installer" } }).catch((error) => { if (error.code !== "P2002") throw error; });
  await audit(prisma, project.id, actorId, "project.created", "project", project.id, { projectNumber, workType, templateVersion: snapshot.template.version });
  return project;
}

async function recalculateDates(prisma, projectId, plannedDate) {
  const [tasks, materials] = await Promise.all([
    prisma.projectTask.findMany({ where: { projectId, automaticDate: true, status: "open" } }),
    prisma.projectMaterial.findMany({ where: { projectId, automaticDates: true, status: { in: ["to_determine", "to_order"] } } })
  ]);
  await prisma.$transaction([
    ...tasks.map((task) => prisma.projectTask.update({ where: { id: task.id }, data: { dueDate: automaticTaskDate(plannedDate, task.dueOffsetDays) } })),
    ...materials.map((material) => prisma.projectMaterial.update({ where: { id: material.id }, data: automaticMaterialDates(plannedDate, material.neededOffsetDays, material.leadTimeDays, material.safetyMarginDays) }))
  ]);
}

async function ensureProjectForInstallation(prisma, installationId, actorId) {
  const installation = await prisma.installation.findUnique({ where: { id: installationId }, include: { customer: true } });
  if (!installation) fail("Installatie niet gevonden.", 404);
  let project = await prisma.customerProject.findUnique({ where: { installationId } });
  const quote = installation.quoteId ? await prisma.quote.findUnique({ where: { id: installation.quoteId }, select: { id: true } }) : null;
  if (!project) return createProject(prisma, { customerId: installation.customerId, installationId, quoteId: quote ? quote.id : null, employeeId: installation.employeeId, workType: installation.workType, plannedDate: installation.plannedDate, startTime: installation.startTime, durationHours: installation.durationHours }, actorId);
  const dateChanged = project.plannedDate !== installation.plannedDate;
  project = await prisma.customerProject.update({ where: { id: project.id }, data: { plannedDate: installation.plannedDate, startTime: installation.startTime, durationHours: installation.durationHours, workType: installation.workType, quoteId: quote ? quote.id : project.quoteId } });
  if (dateChanged) await recalculateDates(prisma, project.id, installation.plannedDate);
  if (installation.employeeId) await prisma.projectMember.upsert({ where: { projectId_employeeId: { projectId: project.id, employeeId: installation.employeeId } }, update: { role: "lead_installer" }, create: { projectId: project.id, employeeId: installation.employeeId, role: "lead_installer" } });
  return project;
}

async function ensureProjectsForExistingInstallations(prisma) {
  await ensureTemplates(prisma);
  const installations = await prisma.installation.findMany({ select: { id: true } });
  for (const item of installations) await ensureProjectForInstallation(prisma, item.id, null);
}

async function userContext(prisma, user) {
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, active: true, employeeId: true, email: true } });
  if (!row || !row.active) fail("Sessie is niet meer geldig.", 401);
  return row;
}

async function assertProjectAccess(prisma, user, projectId, adminOnly = false) {
  const context = await userContext(prisma, user);
  if (["admin", "execution"].includes(context.role)) return { context, admin: true };
  if (adminOnly || !context.employeeId) fail("Geen toegang.", 403);
  const member = await prisma.projectMember.findUnique({ where: { projectId_employeeId: { projectId, employeeId: context.employeeId } } });
  if (!member) fail("Geen toegang.", 403);
  return { context, admin: false, member };
}

async function employeeAvailability(prisma, employeeId, input, excludeInstallationId) {
  const date = dateValue(input.date, "Datum", true);
  const startTime = timeValue(input.startTime, "Starttijd", "09:00");
  const durationHours = numberValue(input.durationHours, "Duur", 0.5, 24, 4);
  const buffer = numberValue(input.travelBufferMinutes, "Planningsbuffer", 0, 240, 30);
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: { workSchedules: { where: { active: true } }, absences: { where: { startDate: { lte: date }, endDate: { gte: date } } } } });
  if (!employee || employee.status !== "active") return { available: false, qualified: false, reasons: ["inactive"] };
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  const schedule = employee.workSchedules.find((item) => item.weekday === weekday);
  const effectiveSchedule = schedule || (weekday <= 5 && employee.workSchedules.length === 0 ? { startTime: "08:00", endTime: "17:00" } : null);
  const requestedEnd = endTime(startTime, durationHours);
  const reasons = [];
  if (!effectiveSchedule || minutes(startTime) < minutes(effectiveSchedule.startTime) || minutes(requestedEnd) > minutes(effectiveSchedule.endTime)) reasons.push("outside_schedule");
  if (employee.absences.some((absence) => !absence.startTime || overlaps(startTime, requestedEnd, absence.startTime, absence.endTime || "23:59"))) reasons.push("absent");
  const clashes = await prisma.installation.findMany({ where: { employeeId, plannedDate: date, status: { not: "geannuleerd" }, id: excludeInstallationId ? { not: excludeInstallationId } : undefined }, select: { id: true, startTime: true, durationHours: true } });
  if (clashes.some((item) => overlaps(startTime, requestedEnd, item.startTime, endTime(item.startTime, item.durationHours), buffer))) reasons.push("overlap");
  const qualification = await workforce.checkEmployeeQualifications(prisma, employeeId, input.workType || "other", date);
  if (!qualification.qualified) reasons.push("qualification");
  return { available: reasons.length === 0, qualified: qualification.qualified, reasons, qualificationWarnings: qualification.warnings.map(({ code, label }) => ({ code, label })) };
}

async function availabilityDirectory(prisma, input) {
  const employees = await prisma.employee.findMany({ where: { status: "active" }, select: { id: true, firstName: true, lastName: true, jobTitle: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
  return Promise.all(employees.map(async (employee) => ({ id: employee.id, displayName: `${employee.firstName} ${employee.lastName}`.trim(), jobTitle: employee.jobTitle, ...(await employeeAvailability(prisma, employee.id, input, input.excludeInstallationId)) })));
}

async function readiness(prisma, project) {
  const current = today();
  const warnings = [];
  for (const material of project.materials || []) {
    if (["delivered", "cancelled"].includes(material.status)) continue;
    if (["to_determine", "to_order"].includes(material.status) && material.orderByDate <= current) warnings.push({ code: material.orderByDate < current ? "material_order_overdue" : "material_order_today", severity: "red", category: "materials", title: `${material.name} ${material.orderByDate < current ? "had besteld moeten zijn" : "vandaag bestellen"}`, dueDate: material.orderByDate, entityId: material.id });
    else if (["to_determine", "to_order"].includes(material.status) && material.orderByDate <= addDays(current, 7)) warnings.push({ code: "material_order_upcoming", severity: "orange", category: "materials", title: `${material.name} binnenkort bestellen`, dueDate: material.orderByDate, entityId: material.id });
    if (material.expectedDeliveryDate && material.expectedDeliveryDate > material.neededOnDate) warnings.push({ code: "delivery_late", severity: "red", category: "materials", title: `${material.name} wordt te laat verwacht`, dueDate: material.neededOnDate, entityId: material.id });
  }
  for (const task of project.tasks || []) {
    if (task.status !== "open") continue;
    if (task.dueDate < current) warnings.push({ code: "task_overdue", severity: "red", category: task.category, title: task.title, dueDate: task.dueDate, entityId: task.id });
    else if (task.dueDate <= addDays(current, 7)) warnings.push({ code: "task_upcoming", severity: "orange", category: task.category, title: task.title, dueDate: task.dueDate, entityId: task.id });
  }
  if (!(project.members || []).length) warnings.push({ code: "no_installer", severity: "red", category: "planning", title: "Geen monteur toegewezen", dueDate: project.plannedDate, entityId: project.id });
  for (const member of project.members || []) {
    const availability = await employeeAvailability(prisma, member.employeeId, { date: project.plannedDate, startTime: project.startTime, durationHours: project.durationHours, travelBufferMinutes: project.travelBufferMinutes, workType: project.workType }, project.installationId);
    if (!availability.available) warnings.push({ code: "installer_unavailable", severity: "red", category: "planning", title: `${member.employee.firstName} ${member.employee.lastName} is niet volledig inzetbaar`, dueDate: project.plannedDate, entityId: member.employeeId, reasons: availability.reasons });
  }
  const level = warnings.some((item) => item.severity === "red") ? "red" : warnings.some((item) => item.severity === "orange") ? "orange" : "green";
  return { level, warnings, nextAction: warnings.slice().sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0] || null };
}

const projectInclude = {
  customer: { select: { id: true, firstName: true, lastName: true, companyName: true, address: true, postalCode: true, city: true } },
  quote: { select: { id: true, quoteNumber: true, status: true } },
  installation: { select: { id: true, status: true } },
  owner: { select: { id: true, username: true, email: true } },
  members: { include: { employee: { select: { id: true, firstName: true, lastName: true, jobTitle: true, user: { select: { id: true } } } } }, orderBy: { createdAt: "asc" } },
  tasks: { include: { assignedEmployee: { select: { id: true, firstName: true, lastName: true } } }, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] },
  materials: { orderBy: [{ orderByDate: "asc" }, { createdAt: "asc" }] },
  equipment: { orderBy: { createdAt: "desc" } },
  auditEvents: { include: { actor: { select: { username: true } } }, orderBy: { createdAt: "desc" }, take: 50 }
};

function equipmentEncryptionConfig(config) { return { ...config, hrEncryptionKey: config.projectEncryptionKey || config.hrEncryptionKey, hrKeyVersion: config.projectKeyVersion || config.hrKeyVersion || "v1" }; }
function serializeEquipment(config, item, admin) {
  let externalDeviceId = "";
  if (admin && item.externalIdCipher) externalDeviceId = security.decrypt(equipmentEncryptionConfig(config), item.externalIdCipher, item.externalIdIv, item.externalIdTag).toString("utf8");
  return { id: item.id, type: item.type, brand: item.brand, model: item.model, serialNumber: item.serialNumber, installedAt: item.installedAt, warrantyUntil: item.warrantyUntil, providerCode: item.providerCode, connectionStatus: item.connectionStatus, lastSyncAt: item.lastSyncAt, externalDeviceId };
}
async function serializeProject(prisma, config, row, admin) {
  const projectReadiness = await readiness(prisma, row);
  const base = { id: row.id, projectNumber: row.projectNumber, title: row.title, workType: row.workType, status: row.status, plannedDate: row.plannedDate, startTime: row.startTime, durationHours: row.durationHours, travelBufferMinutes: row.travelBufferMinutes, customer: row.customer, quote: row.quote, installation: row.installation, members: row.members.map((member) => ({ id: member.id, role: member.role, employeeId: member.employeeId, displayName: `${member.employee.firstName} ${member.employee.lastName}`.trim(), jobTitle: member.employee.jobTitle })), readiness: projectReadiness };
  if (admin) return { ...base, owner: row.owner, internalNotes: row.internalNotes, tasks: row.tasks, materials: row.materials, equipment: row.equipment.map((item) => serializeEquipment(config, item, true)), audit: row.auditEvents.map((item) => ({ id: item.id, action: item.action, entityType: item.entityType, metadata: item.metadata, actor: item.actor ? item.actor.username : "Systeem", createdAt: item.createdAt })) };
  return { ...base, customer: { id: row.customer.id, displayName: customerName(row.customer), address: row.customer.address, postalCode: row.customer.postalCode, city: row.customer.city }, tasks: row.tasks.filter((task) => task.operational), materials: row.materials.map((item) => ({ id: item.id, name: item.name, sku: item.sku, unit: item.unit, quantity: item.quantity, neededOnDate: item.neededOnDate, status: item.status })), equipment: row.equipment.map((item) => serializeEquipment(config, item, false)) };
}

async function getProject(prisma, config, user, id) {
  const access = await assertProjectAccess(prisma, user, id);
  const row = await prisma.customerProject.findUnique({ where: { id }, include: projectInclude });
  if (!row) fail("Project niet gevonden.", 404);
  return serializeProject(prisma, config, row, access.admin);
}

async function listProjects(prisma, config, user, query = {}) {
  const context = await userContext(prisma, user);
  const page = Math.max(1, Number(query.page) || 1), pageSize = Math.min(100, Math.max(10, Number(query.pageSize) || 25));
  if (!["admin", "execution", "installer"].includes(context.role)) fail("Geen toegang.", 403);
  const where = { customerId: query.customerId || undefined, status: query.status || undefined, members: context.role === "installer" ? { some: { employeeId: context.employeeId || "__none__" } } : undefined };
  const [total, rows] = await prisma.$transaction([prisma.customerProject.count({ where }), prisma.customerProject.findMany({ where, include: projectInclude, orderBy: [{ plannedDate: "asc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize })]);
  return { items: await Promise.all(rows.map((row) => serializeProject(prisma, config, row, ["admin", "execution"].includes(context.role)))), total, page, pageSize };
}

async function updateProject(prisma, user, id, input) {
  const access = await assertProjectAccess(prisma, user, id, true);
  const current = await prisma.customerProject.findUnique({ where: { id }, include: projectInclude });
  if (!current) fail("Project niet gevonden.", 404);
  const warningOverrideReason = cleanText(input.warningOverrideReason, "Reden waarschuwing", 500);
  const currentReadiness = await readiness(prisma, current);
  if (currentReadiness.level === "red" && !warningOverrideReason) fail("Een auditreden is verplicht bij kritieke projectwaarschuwingen.", 400);
  const plannedDate = dateValue(input.plannedDate || current.plannedDate, "Installatiedatum", true);
  const data = {
    title: cleanText(input.title == null ? current.title : input.title, "Projecttitel", 180, true), status: enumValue(input.status, PROJECT_STATUSES, current.status, "Projectstatus"),
    plannedDate, startTime: timeValue(input.startTime, "Starttijd", current.startTime), durationHours: numberValue(input.durationHours, "Duur", 0.5, 24, current.durationHours),
    travelBufferMinutes: numberValue(input.travelBufferMinutes, "Planningsbuffer", 0, 240, current.travelBufferMinutes), internalNotes: cleanText(input.internalNotes == null ? current.internalNotes : input.internalNotes, "Interne notities", 5000),
    ownerUserId: Object.prototype.hasOwnProperty.call(input, "ownerUserId") ? (input.ownerUserId || null) : current.ownerUserId
  };
  const saved = await prisma.customerProject.update({ where: { id }, data });
  if (plannedDate !== current.plannedDate) await recalculateDates(prisma, id, plannedDate);
  if (current.installationId) await prisma.installation.update({ where: { id: current.installationId }, data: { plannedDate, startTime: data.startTime, durationHours: data.durationHours } });
  await audit(prisma, id, access.context.id, "project.updated", "project", id, { plannedDate, status: data.status, warningOverrideReason: warningOverrideReason || undefined, warningCodes: currentReadiness.warnings.map((item) => item.code) });
  return saved;
}

function materialData(input, project, current) {
  const leadTimeDays = numberValue(input.leadTimeDays, "Levertijd", 0, 365, current ? current.leadTimeDays : 14);
  const safetyMarginDays = numberValue(input.safetyMarginDays, "Veiligheidsmarge", 0, 90, current ? current.safetyMarginDays : 3);
  const neededOffsetDays = numberValue(input.neededOffsetDays, "Benodigd-offset", -365, 365, current ? current.neededOffsetDays : 0);
  const automaticDates = boolValue(input.automaticDates, current ? current.automaticDates : true);
  const automatic = automaticMaterialDates(project.plannedDate, neededOffsetDays, leadTimeDays, safetyMarginDays);
  const status = enumValue(input.status, MATERIAL_STATUSES, current ? current.status : "to_determine", "Materiaalstatus");
  return {
    name: cleanText(input.name, "Onderdeel", 180, true), sku: cleanText(input.sku, "Artikelnummer", 100), unit: cleanText(input.unit, "Eenheid", 40) || "stuk", quantity: numberValue(input.quantity, "Aantal", 0.01, 100000, 1),
    supplier: cleanText(input.supplier, "Leverancier", 160), purchasePrice: numberValue(input.purchasePrice, "Inkoopprijs", 0, 10000000, 0), leadTimeDays, safetyMarginDays, neededOffsetDays, automaticDates,
    neededOnDate: automaticDates ? automatic.neededOnDate : dateValue(input.neededOnDate, "Benodigd op", true), orderByDate: automaticDates ? automatic.orderByDate : dateValue(input.orderByDate, "Uiterlijk bestellen", true),
    expectedDeliveryDate: dateValue(input.expectedDeliveryDate, "Verwachte levering"), status,
    orderedAt: ["ordered", "confirmed", "partial", "delivered"].includes(status) ? (current && current.orderedAt || new Date()) : null,
    receivedAt: status === "delivered" ? (current && current.receivedAt || new Date()) : null
  };
}

async function saveMaterial(prisma, user, projectId, id, input) {
  const access = await assertProjectAccess(prisma, user, projectId, true);
  const project = await prisma.customerProject.findUnique({ where: { id: projectId } });
  if (!project) fail("Project niet gevonden.", 404);
  const current = id ? await prisma.projectMaterial.findFirst({ where: { id, projectId } }) : null;
  if (id && !current) fail("Materiaal niet gevonden.", 404);
  const data = materialData(input, project, current);
  const saved = id ? await prisma.projectMaterial.update({ where: { id }, data }) : await prisma.projectMaterial.create({ data: { ...data, projectId } });
  await audit(prisma, projectId, access.context.id, id ? "material.updated" : "material.created", "material", saved.id, { status: saved.status, orderByDate: saved.orderByDate });
  return saved;
}

async function removeMaterial(prisma, user, projectId, id) { const access = await assertProjectAccess(prisma, user, projectId, true); const item = await prisma.projectMaterial.findFirst({ where: { id, projectId } }); if (!item) fail("Materiaal niet gevonden.", 404); await prisma.projectMaterial.delete({ where: { id } }); await audit(prisma, projectId, access.context.id, "material.deleted", "material", id); }

function taskData(input, project, current, installerMode) {
  const automaticDate = installerMode ? current.automaticDate : boolValue(input.automaticDate, current ? current.automaticDate : true);
  const dueOffsetDays = installerMode ? current.dueOffsetDays : numberValue(input.dueOffsetDays, "Deadline-offset", -365, 365, current ? current.dueOffsetDays : -7);
  const status = enumValue(input.status, TASK_STATUSES, current ? current.status : "open", "Taakstatus");
  return {
    title: installerMode ? current.title : cleanText(input.title, "Taak", 180, true), category: installerMode ? current.category : cleanText(input.category, "Categorie", 50) || "preparation",
    description: installerMode ? current.description : cleanText(input.description, "Omschrijving", 2000), dueOffsetDays, automaticDate, dueDate: automaticDate ? automaticTaskDate(project.plannedDate, dueOffsetDays) : dateValue(input.dueDate, "Deadline", true),
    required: installerMode ? current.required : boolValue(input.required, current ? current.required : true), operational: installerMode ? current.operational : boolValue(input.operational, current ? current.operational : true), status,
    assignedEmployeeId: installerMode ? current.assignedEmployeeId : (input.assignedEmployeeId || null), completedAt: status === "completed" ? (current && current.completedAt || new Date()) : null
  };
}

async function saveTask(prisma, user, projectId, id, input) {
  const access = await assertProjectAccess(prisma, user, projectId);
  const project = await prisma.customerProject.findUnique({ where: { id: projectId } });
  if (!project) fail("Project niet gevonden.", 404);
  const current = id ? await prisma.projectTask.findFirst({ where: { id, projectId } }) : null;
  if (!access.admin && (!current || !current.operational || !["open", "completed", "not_applicable"].includes(input.status))) fail("Geen toegang.", 403);
  if (id && !current) fail("Taak niet gevonden.", 404);
  if (!id && !access.admin) fail("Geen toegang.", 403);
  const data = taskData(input, project, current, !access.admin);
  const saved = id ? await prisma.projectTask.update({ where: { id }, data }) : await prisma.projectTask.create({ data: { ...data, projectId } });
  await audit(prisma, projectId, access.context.id, id ? "task.updated" : "task.created", "task", saved.id, { status: saved.status });
  return saved;
}

async function saveMember(prisma, user, projectId, input) {
  const access = await assertProjectAccess(prisma, user, projectId, true);
  const employeeId = cleanText(input.employeeId, "Werknemer", 100, true);
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, status: "active" } });
  if (!employee) fail("Actieve werknemer niet gevonden.", 404);
  const role = enumValue(input.role, MEMBER_ROLES, "assistant", "Projectrol");
  const item = await prisma.projectMember.upsert({ where: { projectId_employeeId: { projectId, employeeId } }, update: { role }, create: { projectId, employeeId, role } });
  await audit(prisma, projectId, access.context.id, "member.saved", "member", item.id, { employeeId, role });
  return item;
}
async function removeMember(prisma, user, projectId, id) { const access = await assertProjectAccess(prisma, user, projectId, true); const item = await prisma.projectMember.findFirst({ where: { id, projectId } }); if (!item) fail("Projectlid niet gevonden.", 404); await prisma.projectMember.delete({ where: { id } }); await audit(prisma, projectId, access.context.id, "member.deleted", "member", id, { employeeId: item.employeeId }); }

async function saveEquipment(prisma, config, user, projectId, id, input) {
  const access = await assertProjectAccess(prisma, user, projectId);
  const current = id ? await prisma.projectEquipment.findFirst({ where: { id, projectId } }) : null;
  if (id && !current) fail("Apparaat niet gevonden.", 404);
  const data = { type: cleanText(input.type, "Apparaattype", 80, true), brand: cleanText(input.brand, "Merk", 100), model: cleanText(input.model, "Model", 120), serialNumber: cleanText(input.serialNumber, "Serienummer", 160), installedAt: dateValue(input.installedAt, "Installatiedatum"), warrantyUntil: dateValue(input.warrantyUntil, "Garantie tot") };
  if (access.admin) {
    data.providerCode = cleanText(input.providerCode, "Provider", 80);
    data.connectionStatus = enumValue(input.connectionStatus, EQUIPMENT_STATUSES, current ? current.connectionStatus : "not_connected", "Koppelstatus");
    const external = cleanText(input.externalDeviceId, "Externe apparaat-ID", 500);
    if (external) { const encrypted = security.encrypt(equipmentEncryptionConfig(config), external); Object.assign(data, { externalIdCipher: encrypted.cipher, externalIdIv: encrypted.iv, externalIdTag: encrypted.tag, keyVersion: encrypted.keyVersion }); }
  }
  const saved = id ? await prisma.projectEquipment.update({ where: { id }, data }) : await prisma.projectEquipment.create({ data: { ...data, projectId } });
  await audit(prisma, projectId, access.context.id, id ? "equipment.updated" : "equipment.created", "equipment", saved.id, { type: saved.type, connectionStatus: saved.connectionStatus });
  return saved;
}

async function actionCenter(prisma, user, query = {}) {
  const context = await userContext(prisma, user);
  if (!["admin", "execution"].includes(context.role)) fail("Geen toegang.", 403);
  const projects = await prisma.customerProject.findMany({ where: { status: { notIn: ["completed", "cancelled"] } }, include: projectInclude, orderBy: { plannedDate: "asc" }, take: 200 });
  const items = [];
  for (const project of projects) {
    const result = await readiness(prisma, project);
    result.warnings.forEach((warning) => items.push({ ...warning, projectId: project.id, projectNumber: project.projectNumber, projectTitle: project.title, customerName: customerName(project.customer), plannedDate: project.plannedDate }));
  }
  const category = query.category && query.category !== "all" ? String(query.category) : null;
  const window = String(query.window || "all");
  const current = today(), until = window === "7" ? addDays(current, 7) : window === "30" ? addDays(current, 30) : current;
  return items.filter((item) => !category || item.category === category).filter((item) => window === "all" || (window === "overdue" ? item.dueDate < current : window === "today" ? item.dueDate === current : item.dueDate >= current && item.dueDate <= until)).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))).slice(0, 200);
}

async function saveSchedule(prisma, employeeId, items) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } }); if (!employee) fail("Werknemer niet gevonden.", 404);
  if (!Array.isArray(items) || items.length > 7) fail("Werkrooster is ongeldig.");
  const normalized = items.map((item) => ({ employeeId, weekday: numberValue(item.weekday, "Weekdag", 1, 7), startTime: timeValue(item.startTime, "Starttijd", "08:00"), endTime: timeValue(item.endTime, "Eindtijd", "17:00"), active: boolValue(item.active) }));
  if (new Set(normalized.map((item) => item.weekday)).size !== normalized.length || normalized.some((item) => minutes(item.endTime) <= minutes(item.startTime))) fail("Werkrooster bevat ongeldige of dubbele dagen.");
  await prisma.$transaction([prisma.employeeWorkSchedule.deleteMany({ where: { employeeId } }), ...(normalized.length ? [prisma.employeeWorkSchedule.createMany({ data: normalized })] : [])]);
  return prisma.employeeWorkSchedule.findMany({ where: { employeeId }, orderBy: { weekday: "asc" } });
}

async function saveAbsence(prisma, employeeId, id, input) {
  const startDate = dateValue(input.startDate, "Begindatum", true), endDate = dateValue(input.endDate, "Einddatum", true); if (endDate < startDate) fail("Einddatum mag niet vóór begindatum liggen.");
  const data = { employeeId, startDate, endDate, startTime: timeValue(input.startTime, "Starttijd"), endTime: timeValue(input.endTime, "Eindtijd"), type: enumValue(input.type, ["unavailable", "leave", "training"], "unavailable", "Afwezigheidstype"), note: cleanText(input.note, "Notitie", 500) };
  return id ? prisma.employeeAbsence.update({ where: { id }, data }) : prisma.employeeAbsence.create({ data });
}

async function listTemplates(prisma) { await ensureTemplates(prisma); return prisma.projectTemplate.findMany({ include: { tasks: { orderBy: { sortOrder: "asc" } }, materials: { orderBy: { sortOrder: "asc" } } }, orderBy: { workType: "asc" } }); }

module.exports = { WORK_TYPES, TYPE_LABELS, ensureTemplates, ensureProjectForInstallation, ensureProjectsForExistingInstallations, createProject, listProjects, getProject, updateProject, saveMaterial, removeMaterial, saveTask, saveMember, removeMember, saveEquipment, availabilityDirectory, actionCenter, assertProjectAccess, saveSchedule, saveAbsence, listTemplates, automaticMaterialDates, automaticTaskDate, readiness, today };
