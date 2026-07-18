"use strict";

const crypto = require("crypto");
const security = require("./hr-security");
const { storageKey } = require("./infrastructure/object-storage/file-policy");

const WORK_TYPES = ["air_conditioning", "heat_pump", "boiler", "home_battery", "other"];
const QUALIFICATION_KINDS = ["certificate", "training", "license", "skill"];
const EVIDENCE_POLICIES = ["required", "optional", "none"];
const SKILL_LEVELS = ["", "training", "basic", "independent", "specialist"];
const CHECKLIST_TYPES = ["onboarding", "offboarding"];
const TASK_STATUSES = ["open", "completed", "not_applicable"];

const DEFAULT_DEFINITIONS = [
  { code: "VCA", name: "VCA", kind: "certificate", description: "Veilig werken volgens VCA.", evidencePolicy: "required", sortOrder: 10 },
  { code: "FGAS_BRL200", name: "F-gassen / BRL 200", kind: "certificate", description: "Persoonscertificering voor werkzaamheden aan koudemiddelen.", evidencePolicy: "required", sortOrder: 20 },
  { code: "CO_VRIJ", name: "CO-vrij vakbekwaamheid", kind: "certificate", description: "Vakbekwaamheid voor werkzaamheden aan gasverbrandingsinstallaties.", evidencePolicy: "required", sortOrder: 30 },
  { code: "MANUFACTURER", name: "Fabrikanttraining", kind: "training", description: "Product- of fabrikantspecifieke training.", evidencePolicy: "required", sortOrder: 40 },
  { code: "DRIVING_LICENSE", name: "Rijbewijs", kind: "license", description: "Rijbewijscategorie en geldigheid; kopie is niet vereist.", evidencePolicy: "optional", sortOrder: 50 },
  { code: "PRACTICAL_SKILL", name: "Praktische vakvaardigheid", kind: "skill", description: "Intern beoordeeld vaardigheidsniveau.", evidencePolicy: "optional", sortOrder: 60 }
];

const DEFAULT_REQUIREMENTS = {
  air_conditioning: ["VCA", "FGAS_BRL200"],
  heat_pump: ["VCA", "FGAS_BRL200"],
  boiler: ["VCA", "CO_VRIJ"],
  home_battery: ["VCA"],
  other: ["VCA"]
};

const DEFAULT_TEMPLATES = {
  onboarding: {
    name: "Onboarding",
    items: [
      ["Contract ondertekend", "Controleer of de arbeidsovereenkomst door beide partijen is ondertekend.", -7],
      ["Bedrijfskleding uitgegeven", "Registreer de uitgegeven bedrijfskleding.", -3],
      ["Telefoon en laptop uitgegeven", "Registreer serienummers in het daarvoor bestemde bedrijfssysteem.", -3],
      ["Accounts aangemaakt", "Maak uitsluitend noodzakelijke accounts aan en pas minimale rechten toe.", -1],
      ["Sleutels en bus uitgegeven", "Registreer sleutels en voertuiguitgifte.", -1],
      ["Veiligheidsinstructies gevolgd", "Leg vast dat de relevante veiligheidsinstructies zijn behandeld.", 0]
    ]
  },
  offboarding: {
    name: "Offboarding",
    items: [
      ["Accounts geblokkeerd", "Blokkeer bedrijfsaccounts en trek actieve sessies in.", 0],
      ["Sleutels ingeleverd", "Controleer en registreer alle ingeleverde sleutels.", 0],
      ["Telefoon en laptop ingeleverd", "Controleer apparatuur en draag deze over aan beheer.", 0],
      ["Bus ingeleverd", "Controleer voertuig, sleutels en aanwezige materialen.", 0],
      ["Kleding en materialen ingeleverd", "Controleer alle bedrijfseigendommen.", 0],
      ["Overdracht afgerond", "Bevestig dat openstaande werkzaamheden en dossiers zijn overgedragen.", 0]
    ]
  }
};

function fail(message, status = 400) { throw security.publicError(message, status); }
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
function enumValue(value, values, fallback, name) {
  const result = String(value || fallback);
  if (!values.includes(result)) fail(`${name} is ongeldig.`);
  return result;
}
function booleanValue(value, fallback = true) {
  if (value === undefined) return fallback;
  return value === true || value === "true" || value === "1" || value === 1;
}
function utcToday() { return new Date().toISOString().slice(0, 10); }
function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

async function ensureDefaults(prisma) {
  for (const definition of DEFAULT_DEFINITIONS) {
    await prisma.qualificationDefinition.upsert({ where: { code: definition.code }, update: {}, create: definition });
  }
  const definitions = await prisma.qualificationDefinition.findMany({ select: { id: true, code: true } });
  const byCode = Object.fromEntries(definitions.map((item) => [item.code, item.id]));
  for (const [workType, codes] of Object.entries(DEFAULT_REQUIREMENTS)) {
    for (const code of codes) {
      if (!byCode[code]) continue;
      await prisma.qualificationRequirement.upsert({
        where: { workType_definitionId: { workType, definitionId: byCode[code] } },
        update: {},
        create: { workType, definitionId: byCode[code] }
      });
    }
  }
  for (const type of CHECKLIST_TYPES) {
    const template = await prisma.checklistTemplate.upsert({
      where: { type }, update: {}, create: { type, name: DEFAULT_TEMPLATES[type].name }
    });
    if (await prisma.checklistTemplateItem.count({ where: { templateId: template.id } }) === 0) {
      await prisma.checklistTemplateItem.createMany({ data: DEFAULT_TEMPLATES[type].items.map((item, index) => ({
        templateId: template.id, title: item[0], description: item[1], dueOffsetDays: item[2], required: true, sortOrder: index
      })) });
    }
  }
}

function definitionData(input) {
  const months = input.defaultValidityMonths === "" || input.defaultValidityMonths == null ? null : Number(input.defaultValidityMonths);
  if (months != null && (!Number.isInteger(months) || months < 1 || months > 240)) fail("Standaardgeldigheid is ongeldig.");
  return {
    code: cleanText(input.code, "Code", 50, true).toUpperCase().replace(/[^A-Z0-9_-]/g, "_"),
    name: cleanText(input.name, "Naam", 160, true),
    kind: enumValue(input.kind, QUALIFICATION_KINDS, "certificate", "Soort"),
    description: cleanText(input.description, "Omschrijving", 1000),
    evidencePolicy: enumValue(input.evidencePolicy, EVIDENCE_POLICIES, "required", "Bewijsbeleid"),
    defaultValidityMonths: months,
    active: booleanValue(input.active),
    sortOrder: Math.max(0, Math.min(10000, Number(input.sortOrder) || 0))
  };
}

async function listDefinitions(prisma) {
  await ensureDefaults(prisma);
  return prisma.qualificationDefinition.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

async function saveDefinition(prisma, id, input) {
  const data = definitionData(input);
  try {
    return id ? await prisma.qualificationDefinition.update({ where: { id }, data }) : await prisma.qualificationDefinition.create({ data });
  } catch (error) {
    if (error.code === "P2002") fail("Deze kwalificatiecode bestaat al.", 409);
    if (error.code === "P2025") fail("Kwalificatiedefinitie niet gevonden.", 404);
    throw error;
  }
}

async function listRequirements(prisma) {
  await ensureDefaults(prisma);
  return prisma.qualificationRequirement.findMany({ include: { definition: true }, orderBy: [{ workType: "asc" }, { definition: { sortOrder: "asc" } }] });
}

async function saveRequirement(prisma, input) {
  const workType = enumValue(input.workType, WORK_TYPES, "other", "Werksoort");
  const definitionId = cleanText(input.definitionId, "Kwalificatie", 100, true);
  const definition = await prisma.qualificationDefinition.findUnique({ where: { id: definitionId } });
  if (!definition) fail("Kwalificatiedefinitie niet gevonden.", 404);
  const minimumLevel = definition.kind === "skill" ? enumValue(input.minimumLevel, SKILL_LEVELS, "", "Minimumniveau") : "";
  return prisma.qualificationRequirement.upsert({
    where: { workType_definitionId: { workType, definitionId } },
    update: { minimumLevel, active: booleanValue(input.active) },
    create: { workType, definitionId, minimumLevel, active: booleanValue(input.active) },
    include: { definition: true }
  });
}

async function deleteRequirement(prisma, id) {
  try { await prisma.qualificationRequirement.update({ where: { id }, data: { active: false } }); }
  catch (error) { if (error.code === "P2025") fail("Eis niet gevonden.", 404); throw error; }
}

function validatePdf(file) {
  if (!file || !file.buffer || !file.buffer.length) return null;
  if (file.size > 8 * 1024 * 1024) fail("PDF is groter dan 8 MB.", 413);
  const name = cleanText(file.originalname, "Bestandsnaam", 180, true).replace(/[\\/\0]/g, "_");
  if (!name.toLowerCase().endsWith(".pdf") || file.mimetype !== "application/pdf" || file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") fail("Alleen geldige PDF-bestanden zijn toegestaan.");
  return name;
}

function serializeQualification(config, row) {
  let note = "";
  if (row.noteCipher) note = security.decrypt(config, row.noteCipher, row.noteIv, row.noteTag, row.keyVersion).toString("utf8");
  return {
    id: row.id, employeeId: row.employeeId, definitionId: row.definitionId, definition: row.definition,
    issuer: row.issuer, certificateNumber: row.certificateNumber, issueDate: row.issueDate,
    expiryDate: row.expiryDate, skillLevel: row.skillLevel, note,
    evidenceFileName: row.evidenceFileName, evidenceSize: row.evidenceSize,
    evidenceScanStatus: row.evidenceScanStatus, archivedAt: row.archivedAt,
    createdBy: row.createdBy ? row.createdBy.username : "", createdAt: row.createdAt, updatedAt: row.updatedAt
  };
}

async function listEmployeeQualifications(prisma, config, employeeId, includeArchived = false) {
  const rows = await prisma.employeeQualification.findMany({
    where: { employeeId, archivedAt: includeArchived ? undefined : null },
    include: { definition: true, createdBy: { select: { username: true } } },
    orderBy: [{ definition: { sortOrder: "asc" } }, { expiryDate: "asc" }]
  });
  return rows.map((row) => serializeQualification(config, row));
}

async function saveEmployeeQualification(prisma, config, objectStorage, actorId, employeeId, id, input, file) {
  const [employee, definition] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } }),
    prisma.qualificationDefinition.findUnique({ where: { id: cleanText(input.definitionId, "Kwalificatie", 100, true) } })
  ]);
  if (!employee) fail("Werknemer niet gevonden.", 404);
  if (!definition || !definition.active) fail("Kwalificatiedefinitie niet gevonden.", 404);
  const issueDate = dateValue(input.issueDate, "Uitgiftedatum");
  const expiryDate = dateValue(input.expiryDate, "Vervaldatum");
  if (issueDate && expiryDate && expiryDate < issueDate) fail("Vervaldatum mag niet vóór uitgiftedatum liggen.");
  const note = cleanText(input.note, "Notitie", 4000);
  const encryptedNote = note ? security.encrypt(config, note) : null;
  const data = {
    definitionId: definition.id,
    issuer: cleanText(input.issuer, "Uitgevende instantie", 160),
    certificateNumber: cleanText(input.certificateNumber, "Certificaatnummer", 120),
    issueDate, expiryDate,
    skillLevel: definition.kind === "skill" ? enumValue(input.skillLevel, SKILL_LEVELS, "training", "Vaardigheidsniveau") : "",
    noteCipher: encryptedNote ? encryptedNote.cipher : null,
    noteIv: encryptedNote ? encryptedNote.iv : null,
    noteTag: encryptedNote ? encryptedNote.tag : null,
    keyVersion: encryptedNote ? encryptedNote.keyVersion : config.hrKeyVersion || "v1"
  };
  const fileName = validatePdf(file);
  let storedKey = "";
  if (fileName) {
    const scan = await security.scanWithClamav(config, file.buffer);
    const encrypted = security.encryptFileEnvelope(config, file.buffer);
    storedKey = storageKey(`hr/qualifications/${employeeId}`);
    await objectStorage.put(storedKey, encrypted.content, { mimeType: "application/octet-stream" });
    Object.assign(data, {
      evidenceFileName: fileName, evidenceMimeType: "application/pdf", evidenceSize: file.size,
      evidenceSha256: crypto.createHash("sha256").update(file.buffer).digest("hex"),
      evidenceScanStatus: scan.clean ? "clean" : "quarantine", evidenceScanMessage: scan.message || "",
      evidenceStorageKey: storedKey, keyVersion: encrypted.keyVersion
    });
  }
  let row;
  let previousKey = "";
  try {
    if (id) {
      const existing = await prisma.employeeQualification.findFirst({ where: { id, employeeId } });
      if (!existing) fail("Kwalificatie niet gevonden.", 404);
      previousKey = fileName ? existing.evidenceStorageKey || "" : "";
      row = await prisma.employeeQualification.update({ where: { id }, data, include: { definition: true, createdBy: { select: { username: true } } } });
    } else {
      row = await prisma.employeeQualification.create({ data: { ...data, employeeId, createdById: actorId }, include: { definition: true, createdBy: { select: { username: true } } } });
    }
  } catch (error) {
    if (storedKey) await objectStorage.delete(storedKey).catch(() => {});
    throw error;
  }
  if (previousKey) await objectStorage.delete(previousKey).catch(() => {});
  return serializeQualification(config, row);
}

async function archiveQualification(prisma, employeeId, id) {
  const row = await prisma.employeeQualification.findFirst({ where: { id, employeeId } });
  if (!row) fail("Kwalificatie niet gevonden.", 404);
  return prisma.employeeQualification.update({ where: { id }, data: { archivedAt: new Date() } });
}

async function rescanQualification(prisma, config, objectStorage, employeeId, id) {
  const row = await prisma.employeeQualification.findFirst({ where: { id, employeeId } });
  if (!row || !row.evidenceStorageKey) fail("Bewijsdocument niet gevonden.", 404);
  const buffer = security.decryptFileEnvelope(config, await objectStorage.get(row.evidenceStorageKey), row.keyVersion);
  const scan = await security.scanWithClamav(config, buffer);
  return prisma.employeeQualification.update({ where: { id }, data: { evidenceScanStatus: scan.clean ? "clean" : "quarantine", evidenceScanMessage: scan.message || "" } });
}

async function qualificationFile(prisma, config, objectStorage, employeeId, id) {
  const row = await prisma.employeeQualification.findFirst({ where: { id, employeeId } });
  if (!row || !row.evidenceStorageKey) fail("Bewijsdocument niet gevonden.", 404);
  if (row.evidenceScanStatus !== "clean") fail("Bewijsdocument is nog niet veilig vrijgegeven.", 423);
  const buffer = security.decryptFileEnvelope(config, await objectStorage.get(row.evidenceStorageKey), row.keyVersion);
  if (crypto.createHash("sha256").update(buffer).digest("hex") !== row.evidenceSha256) fail("Integriteitscontrole van bewijsdocument is mislukt.", 500);
  return { row, buffer };
}

function evaluateRecord(record, definition, plannedDate, minimumLevel) {
  if (record.issueDate && record.issueDate > plannedDate) return "not_yet_valid";
  if (record.expiryDate && record.expiryDate < plannedDate) return "expired";
  if (definition.evidencePolicy === "required" && record.evidenceScanStatus !== "clean") return record.evidenceScanStatus === "quarantine" ? "evidence_quarantine" : "evidence_missing";
  if (minimumLevel && SKILL_LEVELS.indexOf(record.skillLevel) < SKILL_LEVELS.indexOf(minimumLevel)) return "insufficient_level";
  return "valid";
}

async function checkEmployeeQualifications(prisma, employeeId, workType, plannedDate, defaultsReady = false) {
  workType = enumValue(workType, WORK_TYPES, "other", "Werksoort");
  plannedDate = dateValue(plannedDate || utcToday(), "Geplande datum", true);
  if (!defaultsReady) await ensureDefaults(prisma);
  const requirements = await prisma.qualificationRequirement.findMany({ where: { workType, active: true, definition: { active: true } }, include: { definition: true }, orderBy: { definition: { sortOrder: "asc" } } });
  if (!employeeId) return { qualified: false, warnings: [], checkedAt: new Date().toISOString(), plannedDate, workType };
  const records = await prisma.employeeQualification.findMany({ where: { employeeId, archivedAt: null, definitionId: { in: requirements.map((item) => item.definitionId) } } });
  const warnings = [];
  for (const requirement of requirements) {
    const candidates = records.filter((record) => record.definitionId === requirement.definitionId);
    const states = candidates.map((record) => evaluateRecord(record, requirement.definition, plannedDate, requirement.minimumLevel));
    if (states.includes("valid")) continue;
    warnings.push({
      code: candidates.length ? states[0] : "missing",
      definitionId: requirement.definitionId,
      qualificationCode: requirement.definition.code,
      label: requirement.definition.name,
      minimumLevel: requirement.minimumLevel || ""
    });
  }
  return { qualified: warnings.length === 0, warnings, checkedAt: new Date().toISOString(), plannedDate, workType };
}

function matrixStatus(record, definition, today) {
  if (!record) return { code: "missing", label: "Ontbreekt" };
  if (record.issueDate && record.issueDate > today) return { code: "not_yet_valid", label: "Nog niet geldig" };
  if (definition.evidencePolicy === "required" && record.evidenceScanStatus !== "clean") return { code: record.evidenceScanStatus === "quarantine" ? "quarantine" : "evidence_missing", label: record.evidenceScanStatus === "quarantine" ? "Quarantaine" : "Bewijs ontbreekt" };
  if (!record.expiryDate) return { code: "valid", label: "Geldig" };
  const days = Math.ceil((new Date(`${record.expiryDate}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
  if (days < 0) return { code: "expired", label: "Verlopen" };
  if (days <= 30) return { code: "expiring30", label: `Verloopt binnen 30 dagen` };
  if (days <= 60) return { code: "expiring60", label: `Verloopt binnen 60 dagen` };
  if (days <= 90) return { code: "expiring90", label: `Verloopt binnen 90 dagen` };
  return { code: "valid", label: "Geldig" };
}

async function qualificationMatrix(prisma, query = {}) {
  await ensureDefaults(prisma);
  const where = {
    status: query.status === "all" ? undefined : (query.status ? enumValue(query.status, ["active", "leave", "ended", "archived"], "active", "Status") : "active"),
    department: query.department ? { contains: cleanText(query.department, "Afdeling", 120), mode: "insensitive" } : undefined
  };
  const [definitions, employees] = await Promise.all([
    prisma.qualificationDefinition.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.employee.findMany({ where, include: { qualifications: { where: { archivedAt: null }, orderBy: { updatedAt: "desc" } } }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] })
  ]);
  const today = utcToday();
  let serializedEmployees = employees.map((employee) => ({
      id: employee.id, employeeNumber: employee.employeeNumber, displayName: `${employee.firstName} ${employee.lastName}`.trim(), department: employee.department, status: employee.status,
      cells: Object.fromEntries(definitions.map((definition) => {
        const record = employee.qualifications.find((item) => item.definitionId === definition.id);
        return [definition.id, { qualificationId: record ? record.id : null, expiryDate: record ? record.expiryDate : "", skillLevel: record ? record.skillLevel : "", ...matrixStatus(record, definition, today) }];
      }))
    }));
  const definitionId = cleanText(query.qualificationId, "Kwalificatie", 100);
  const validity = cleanText(query.validity, "Geldigheid", 30);
  const visibleDefinitions = definitionId ? definitions.filter((item) => item.id === definitionId) : definitions;
  if (definitionId && !visibleDefinitions.length) fail("Kwalificatiefilter is ongeldig.");
  if (validity) {
    const allowed = ["valid", "expiring", "expired", "missing", "not_yet_valid", "quarantine"];
    if (!allowed.includes(validity)) fail("Geldigheidsfilter is ongeldig.");
    serializedEmployees = serializedEmployees.filter((employee) => visibleDefinitions.some((definition) => {
      const code = employee.cells[definition.id].code;
      if (validity === "expiring") return code.indexOf("expiring") === 0;
      if (validity === "missing") return ["missing", "evidence_missing"].includes(code);
      return code === validity;
    }));
  }
  return { definitions: visibleDefinitions, employees: serializedEmployees };
}

async function directory(prisma, workType, plannedDate) {
  await ensureDefaults(prisma);
  const employees = await prisma.employee.findMany({ where: { status: "active" }, select: { id: true, firstName: true, lastName: true, jobTitle: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
  return Promise.all(employees.map(async (employee) => {
    const check = await checkEmployeeQualifications(prisma, employee.id, workType || "other", plannedDate || utcToday(), true);
    return { id: employee.id, displayName: `${employee.firstName} ${employee.lastName}`.trim(), jobTitle: employee.jobTitle, active: true, qualified: check.qualified, warnings: check.warnings.map(({ code, label, minimumLevel }) => ({ code, label, minimumLevel })) };
  }));
}

async function saveTemplate(prisma, type, input) {
  type = enumValue(type, CHECKLIST_TYPES, "onboarding", "Checklisttype");
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length || items.length > 50) fail("Een template moet 1 tot 50 taken bevatten.");
  return prisma.$transaction(async (tx) => {
    const current = await tx.checklistTemplate.findUnique({ where: { type } });
    const template = await tx.checklistTemplate.upsert({
      where: { type }, update: { name: cleanText(input.name, "Templatenaam", 120, true), active: booleanValue(input.active), version: { increment: 1 } },
      create: { type, name: cleanText(input.name, "Templatenaam", 120, true), active: booleanValue(input.active) }
    });
    await tx.checklistTemplateItem.deleteMany({ where: { templateId: template.id } });
    await tx.checklistTemplateItem.createMany({ data: items.map((item, index) => {
      const offset = Number(item.dueOffsetDays || 0);
      if (!Number.isInteger(offset) || offset < -365 || offset > 365) fail("Deadline-offset is ongeldig.");
      return { templateId: template.id, title: cleanText(item.title, "Taaktitel", 180, true), description: cleanText(item.description, "Taakomschrijving", 1000), dueOffsetDays: offset, required: booleanValue(item.required), sortOrder: index, defaultAssigneeId: item.defaultAssigneeId || null };
    }) });
    return { ...template, previousVersion: current ? current.version : 0 };
  });
}

async function listTemplates(prisma) {
  await ensureDefaults(prisma);
  return prisma.checklistTemplate.findMany({ include: { items: { orderBy: { sortOrder: "asc" } } }, orderBy: { type: "asc" } });
}

async function instantiateChecklist(prisma, employeeId, type, anchorDate, sourceKey) {
  await ensureDefaults(prisma);
  type = enumValue(type, CHECKLIST_TYPES, "onboarding", "Checklisttype");
  anchorDate = dateValue(anchorDate, "Ankerdatum", true);
  const template = await prisma.checklistTemplate.findUnique({ where: { type }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!template || !template.active) fail("Checklisttemplate is niet actief.", 409);
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) fail("Werknemer niet gevonden.", 404);
  try {
    return await prisma.employeeChecklist.create({ data: {
      employeeId, templateId: template.id, type, templateVersion: template.version, anchorDate,
      sourceKey: sourceKey || `manual:${employeeId}:${type}:${Date.now()}`,
      items: { create: template.items.map((item) => ({ title: item.title, description: item.description, dueDate: addDays(anchorDate, item.dueOffsetDays), required: item.required, sortOrder: item.sortOrder, assignedToId: item.defaultAssigneeId || null })) }
    }, include: { items: { include: { assignedTo: { select: { username: true } }, completedBy: { select: { username: true } } }, orderBy: { sortOrder: "asc" } } } });
  } catch (error) {
    if (error.code === "P2002") return prisma.employeeChecklist.findUnique({ where: { sourceKey }, include: { items: { include: { assignedTo: { select: { username: true } }, completedBy: { select: { username: true } } }, orderBy: { sortOrder: "asc" } } } });
    throw error;
  }
}

async function ensureAutomaticChecklists(prisma, employee, previousStatus) {
  if (!previousStatus) await instantiateChecklist(prisma, employee.id, "onboarding", employee.startDate, `auto:onboarding:${employee.id}`);
  if (previousStatus && !["ended", "archived"].includes(previousStatus) && ["ended", "archived"].includes(employee.status)) {
    await instantiateChecklist(prisma, employee.id, "offboarding", employee.endDate || utcToday(), `auto:offboarding:${employee.id}`);
  }
}

function serializeTask(config, item) {
  let note = "";
  if (item.noteCipher) note = security.decrypt(config, item.noteCipher, item.noteIv, item.noteTag, item.keyVersion).toString("utf8");
  return { id: item.id, title: item.title, description: item.description, dueDate: item.dueDate, required: item.required, sortOrder: item.sortOrder, status: item.status, note, assignedToId: item.assignedToId, assignedTo: item.assignedTo ? item.assignedTo.username : "", completedBy: item.completedBy ? item.completedBy.username : "", completedAt: item.completedAt };
}

async function listEmployeeChecklists(prisma, config, employeeId) {
  const rows = await prisma.employeeChecklist.findMany({ where: { employeeId }, include: { items: { include: { assignedTo: { select: { username: true } }, completedBy: { select: { username: true } } }, orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "desc" } });
  return rows.map((row) => ({ id: row.id, type: row.type, templateVersion: row.templateVersion, anchorDate: row.anchorDate, status: row.status, createdAt: row.createdAt, completedAt: row.completedAt, items: row.items.map((item) => serializeTask(config, item)) }));
}

async function updateChecklistTask(prisma, config, actorId, checklistId, itemId, input) {
  const item = await prisma.employeeChecklistItem.findFirst({ where: { id: itemId, checklistId }, include: { checklist: true } });
  if (!item) fail("Checklisttaak niet gevonden.", 404);
  const status = enumValue(input.status, TASK_STATUSES, item.status, "Taakstatus");
  const dueDate = dateValue(input.dueDate || item.dueDate, "Deadline", true);
  let assignedToId = input.assignedToId || null;
  if (assignedToId) {
    const assignee = await prisma.user.findFirst({ where: { id: assignedToId, role: "admin", active: true }, select: { id: true } });
    if (!assignee) fail("Alleen een actieve beheerder kan verantwoordelijk zijn.");
  }
  const note = cleanText(input.note, "Notitie", 4000);
  const encrypted = note ? security.encrypt(config, note) : null;
  const data = {
    status, dueDate, assignedToId,
    noteCipher: encrypted ? encrypted.cipher : null, noteIv: encrypted ? encrypted.iv : null, noteTag: encrypted ? encrypted.tag : null,
    keyVersion: encrypted ? encrypted.keyVersion : item.keyVersion,
    completedAt: status === "completed" ? (item.completedAt || new Date()) : null,
    completedById: status === "completed" ? actorId : null
  };
  await prisma.employeeChecklistItem.update({ where: { id: item.id }, data });
  const openRequired = await prisma.employeeChecklistItem.count({ where: { checklistId, required: true, status: "open" } });
  await prisma.employeeChecklist.update({ where: { id: checklistId }, data: { status: openRequired === 0 ? "completed" : "open", completedAt: openRequired === 0 ? new Date() : null } });
  return { employeeId: item.checklist.employeeId, itemId: item.id, status };
}

async function dashboardStats(prisma) {
  await ensureDefaults(prisma);
  const today = utcToday();
  const in90 = addDays(today, 90);
  const [qualifications, openTasks, activeEmployees, requirements] = await Promise.all([
    prisma.employeeQualification.findMany({ where: { archivedAt: null, expiryDate: { not: "", lte: in90 } }, select: { expiryDate: true } }),
    prisma.employeeChecklistItem.findMany({ where: { status: "open" }, select: { id: true, title: true, dueDate: true, assignedTo: { select: { username: true } }, checklist: { select: { employeeId: true, type: true, employee: { select: { firstName: true, lastName: true, employeeNumber: true } } } } }, orderBy: { dueDate: "asc" }, take: 100 }),
    prisma.employee.findMany({ where: { status: "active" }, select: { id: true, qualifications: { where: { archivedAt: null }, include: { definition: true } } } }),
    prisma.qualificationRequirement.findMany({ where: { active: true, definition: { active: true } }, include: { definition: true } })
  ]);
  const uniqueRequirements = Array.from(new Map(requirements.map((item) => [item.definitionId, item])).values());
  const qualificationMissing = activeEmployees.filter((employee) => uniqueRequirements.some((requirement) => {
    const candidates = employee.qualifications.filter((item) => item.definitionId === requirement.definitionId);
    return !candidates.some((record) => evaluateRecord(record, requirement.definition, today, requirement.minimumLevel) === "valid");
  })).length;
  const within = (days) => qualifications.filter((item) => item.expiryDate >= today && item.expiryDate <= addDays(today, days)).length;
  return {
    qualificationExpired: qualifications.filter((item) => item.expiryDate < today).length,
    qualificationExpiring30: within(30), qualificationExpiring60: within(60), qualificationExpiring90: within(90),
    qualificationMissing,
    checklistOverdue: openTasks.filter((item) => item.dueDate < today).length,
    checklistToday: openTasks.filter((item) => item.dueDate === today).length,
    checklistUpcoming: openTasks.filter((item) => item.dueDate > today && item.dueDate <= addDays(today, 14)).length,
    checklistTasks: openTasks.filter((item) => item.dueDate <= addDays(today, 14)).slice(0, 25).map((item) => ({ id: item.id, title: item.title, dueDate: item.dueDate, type: item.checklist.type, assignedTo: item.assignedTo ? item.assignedTo.username : "", employee: { id: item.checklist.employeeId, employeeNumber: item.checklist.employee.employeeNumber, displayName: `${item.checklist.employee.firstName} ${item.checklist.employee.lastName}`.trim() } }))
  };
}

module.exports = {
  WORK_TYPES, SKILL_LEVELS, ensureDefaults, listDefinitions, saveDefinition, listRequirements, saveRequirement, deleteRequirement,
  listEmployeeQualifications, saveEmployeeQualification, archiveQualification, rescanQualification, qualificationFile,
  checkEmployeeQualifications, qualificationMatrix, directory, listTemplates, saveTemplate, instantiateChecklist,
  ensureAutomaticChecklists, listEmployeeChecklists, updateChecklistTask, dashboardStats
};
