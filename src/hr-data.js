"use strict";

const crypto = require("crypto");
const security = require("./hr-security");

const EMPLOYEE_STATUSES = ["active", "leave", "ended", "archived"];
const EMPLOYMENT_TYPES = ["permanent", "temporary", "on_call", "contractor", "intern"];
const CONTRACT_STATUSES = ["active", "expired", "replaced", "archived"];
const NOTE_CATEGORIES = ["general", "performance", "agreement", "absence", "other"];

function text(value, name, max, required) {
  const normalized = String(value == null ? "" : value).trim();
  if (required && !normalized) throw security.publicError(`${name} is verplicht.`);
  if (normalized.length > max) throw security.publicError(`${name} is te lang.`);
  return normalized;
}

function enumValue(value, allowed, fallback, name) {
  const normalized = String(value || fallback);
  if (!allowed.includes(normalized)) throw security.publicError(`${name} is ongeldig.`);
  return normalized;
}

function dateValue(value, name, required) {
  const normalized = text(value, name, 10, required);
  if (normalized && !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw security.publicError(`${name} is ongeldig.`);
  return normalized;
}

function numberValue(value, name, max) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) throw security.publicError(`${name} is ongeldig.`);
  return parsed;
}

function employeePayload(config, input, current) {
  const startDate = dateValue(input.startDate, "Startdatum", true);
  const endDate = dateValue(input.endDate, "Einddatum", false);
  if (endDate && endDate < startDate) throw security.publicError("Einddatum mag niet vóór startdatum liggen.");
  const privateData = {
    privateEmail: text(input.privateEmail, "Privé-e-mail", 254, false),
    privatePhone: text(input.privatePhone, "Privételefoon", 40, false),
    address: text(input.address, "Adres", 200, false),
    postalCode: text(input.postalCode, "Postcode", 20, false),
    city: text(input.city, "Plaats", 100, false),
    birthDate: dateValue(input.birthDate, "Geboortedatum", false),
    emergencyContactName: text(input.emergencyContactName, "Naam noodcontact", 160, false),
    emergencyContactRelation: text(input.emergencyContactRelation, "Relatie noodcontact", 80, false),
    emergencyContactPhone: text(input.emergencyContactPhone, "Telefoon noodcontact", 40, false)
  };
  const encrypted = security.encryptJson(config, privateData);
  const status = enumValue(input.status, EMPLOYEE_STATUSES, "active", "Status");
  return {
    employeeNumber: text(input.employeeNumber, "Personeelsnummer", 40, true).toUpperCase(),
    firstName: text(input.firstName, "Voornaam", 100, true),
    lastName: text(input.lastName, "Achternaam", 120, true),
    workEmail: text(input.workEmail, "Werk-e-mail", 254, false),
    workPhone: text(input.workPhone, "Werktelefoon", 40, false),
    jobTitle: text(input.jobTitle, "Functie", 120, false),
    department: text(input.department, "Afdeling", 120, false),
    status,
    employmentType: enumValue(input.employmentType, EMPLOYMENT_TYPES, "permanent", "Dienstverband"),
    hoursPerWeek: numberValue(input.hoursPerWeek, "Uren per week", 80),
    startDate,
    endDate,
    privateDataCipher: encrypted.cipher,
    privateDataIv: encrypted.iv,
    privateDataTag: encrypted.tag,
    archivedAt: status === "archived" ? (current && current.archivedAt) || new Date() : null
  };
}

function employeeSummary(row) {
  return {
    id: row.id,
    employeeNumber: row.employeeNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: `${row.firstName} ${row.lastName}`.trim(),
    workEmail: row.workEmail,
    workPhone: row.workPhone,
    jobTitle: row.jobTitle,
    department: row.department,
    status: row.status,
    employmentType: row.employmentType,
    hoursPerWeek: row.hoursPerWeek,
    startDate: row.startDate,
    endDate: row.endDate,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    contractCount: row._count ? row._count.contracts : undefined
  };
}

function serializeContract(row) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    title: row.title,
    contractType: row.contractType,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    hoursPerWeek: row.hoursPerWeek,
    description: row.description,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    sha256: row.sha256,
    scanStatus: row.scanStatus,
    createdBy: row.createdBy ? row.createdBy.username : "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function serializeNote(config, row) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    category: row.category,
    body: security.decrypt(config, row.bodyCipher, row.bodyIv, row.bodyTag).toString("utf8"),
    createdBy: row.createdBy ? row.createdBy.username : "",
    updatedBy: row.updatedBy ? row.updatedBy.username : "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function listEmployees(prisma, query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(query.pageSize) || 25));
  const search = text(query.search, "Zoekterm", 120, false);
  const status = query.status && EMPLOYEE_STATUSES.includes(query.status) ? query.status : undefined;
  const department = text(query.department, "Afdeling", 120, false);
  const jobTitle = text(query.jobTitle, "Functie", 120, false);
  const contractEndBefore = dateValue(query.contractEndBefore, "Contracteinddatum", false);
  const where = {
    status,
    department: department ? { contains: department, mode: "insensitive" } : undefined,
    jobTitle: jobTitle ? { contains: jobTitle, mode: "insensitive" } : undefined,
    contracts: contractEndBefore ? { some: { endDate: { not: "", lte: contractEndBefore } } } : undefined,
    OR: search ? [
      { employeeNumber: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { jobTitle: { contains: search, mode: "insensitive" } }
    ] : undefined
  };
  const [total, rows] = await prisma.$transaction([
    prisma.employee.count({ where }),
    prisma.employee.findMany({ where, include: { _count: { select: { contracts: true } } }, orderBy: [{ status: "asc" }, { lastName: "asc" }, { firstName: "asc" }], skip: (page - 1) * pageSize, take: pageSize })
  ]);
  return { items: rows.map(employeeSummary), page, pageSize, total };
}

async function getEmployee(prisma, config, id) {
  const row = await prisma.employee.findUnique({
    where: { id },
    include: {
      contracts: { include: { createdBy: { select: { username: true } } }, orderBy: { createdAt: "desc" } },
      notes: { include: { createdBy: { select: { username: true } }, updatedBy: { select: { username: true } } }, orderBy: { createdAt: "desc" } }
    }
  });
  if (!row) throw security.publicError("Werknemer niet gevonden.", 404);
  return {
    ...employeeSummary(row),
    ...security.decryptJson(config, row, "privateData"),
    contracts: row.contracts.map(serializeContract),
    notes: row.notes.map((note) => serializeNote(config, note))
  };
}

async function saveEmployee(prisma, config, id, input) {
  const current = id ? await prisma.employee.findUnique({ where: { id } }) : null;
  if (id && !current) throw security.publicError("Werknemer niet gevonden.", 404);
  const data = employeePayload(config, input, current);
  try {
    return id ? prisma.employee.update({ where: { id }, data }) : prisma.employee.create({ data });
  } catch (error) {
    if (error.code === "P2002") throw security.publicError("Dit personeelsnummer bestaat al.", 409);
    throw error;
  }
}

function contractData(input) {
  const startDate = dateValue(input.startDate, "Startdatum", true);
  const endDate = dateValue(input.endDate, "Einddatum", false);
  if (endDate && endDate < startDate) throw security.publicError("Einddatum mag niet vóór startdatum liggen.");
  return {
    title: text(input.title, "Contracttitel", 160, true),
    contractType: enumValue(input.contractType, EMPLOYMENT_TYPES, "permanent", "Contracttype"),
    status: enumValue(input.status, CONTRACT_STATUSES, "active", "Contractstatus"),
    startDate,
    endDate,
    hoursPerWeek: numberValue(input.hoursPerWeek, "Uren per week", 80),
    description: text(input.description, "Omschrijving", 1000, false)
  };
}

function validatePdf(file) {
  if (!file || !file.buffer || !file.buffer.length) throw security.publicError("PDF-bestand ontbreekt.");
  if (file.size > 8 * 1024 * 1024) throw security.publicError("PDF is groter dan 8 MB.", 413);
  const name = text(file.originalname, "Bestandsnaam", 180, true).replace(/[\\/\0]/g, "_");
  if (!name.toLowerCase().endsWith(".pdf") || file.mimetype !== "application/pdf" || file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw security.publicError("Alleen geldige PDF-bestanden zijn toegestaan.");
  }
  return name;
}

async function createContract(prisma, config, actorId, employeeId, input, file) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) throw security.publicError("Werknemer niet gevonden.", 404);
  const fileName = validatePdf(file);
  const metadata = contractData(input);
  const scan = await security.scanWithClamav(config, file.buffer);
  const encrypted = security.encrypt(config, file.buffer);
  const row = await prisma.employmentContract.create({
    data: {
      ...metadata,
      employeeId,
      fileName,
      mimeType: "application/pdf",
      size: file.size,
      sha256: crypto.createHash("sha256").update(file.buffer).digest("hex"),
      scanStatus: scan.clean ? "clean" : "quarantine",
      scanMessage: scan.message || "",
      fileCipher: encrypted.cipher,
      fileIv: encrypted.iv,
      fileTag: encrypted.tag,
      keyVersion: encrypted.keyVersion,
      createdById: actorId
    },
    include: { createdBy: { select: { username: true } } }
  });
  return serializeContract(row);
}

async function rescanContract(prisma, config, id) {
  const row = await prisma.employmentContract.findUnique({ where: { id } });
  if (!row) throw security.publicError("Contract niet gevonden.", 404);
  const buffer = security.decrypt(config, row.fileCipher, row.fileIv, row.fileTag);
  const scan = await security.scanWithClamav(config, buffer);
  const saved = await prisma.employmentContract.update({ where: { id }, data: { scanStatus: scan.clean ? "clean" : "quarantine", scanMessage: scan.message || "" }, include: { createdBy: { select: { username: true } } } });
  return serializeContract(saved);
}

async function contractFile(prisma, config, employeeId, id) {
  const row = await prisma.employmentContract.findFirst({ where: { id, employeeId } });
  if (!row) throw security.publicError("Contract niet gevonden.", 404);
  if (row.scanStatus !== "clean") throw security.publicError("Contract is nog niet veilig vrijgegeven.", 423);
  const buffer = security.decrypt(config, row.fileCipher, row.fileIv, row.fileTag);
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  if (hash !== row.sha256) throw security.publicError("Integriteitscontrole van contract is mislukt.", 500);
  return { row, buffer };
}

async function saveNote(prisma, config, actorId, employeeId, id, input) {
  const body = text(input.body, "Notitie", 10000, true);
  const category = enumValue(input.category, NOTE_CATEGORIES, "general", "Categorie");
  const encrypted = security.encrypt(config, body);
  const data = { category, bodyCipher: encrypted.cipher, bodyIv: encrypted.iv, bodyTag: encrypted.tag, keyVersion: encrypted.keyVersion, updatedById: actorId };
  let row;
  if (id) {
    const existing = await prisma.employeeNote.findFirst({ where: { id, employeeId } });
    if (!existing) throw security.publicError("Notitie niet gevonden.", 404);
    row = await prisma.employeeNote.update({ where: { id }, data, include: { createdBy: { select: { username: true } }, updatedBy: { select: { username: true } } } });
  } else {
    row = await prisma.employeeNote.create({ data: { ...data, employeeId, createdById: actorId }, include: { createdBy: { select: { username: true } }, updatedBy: { select: { username: true } } } });
  }
  return serializeNote(config, row);
}

async function dashboard(prisma) {
  const today = new Date().toISOString().slice(0, 10);
  const plusDays = (days) => { const date = new Date(`${today}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
  const [active, archived, missingContracts, expiring] = await prisma.$transaction([
    prisma.employee.count({ where: { status: "active" } }),
    prisma.employee.count({ where: { status: { in: ["ended", "archived"] } } }),
    prisma.employee.count({ where: { status: "active", contracts: { none: { status: "active" } } } }),
    prisma.employmentContract.findMany({
      where: { status: "active", endDate: { gte: today, lte: plusDays(90), not: "" } },
      select: { id: true, title: true, endDate: true, employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
      orderBy: { endDate: "asc" }
    })
  ]);
  const countWithin = (days) => expiring.filter((item) => item.endDate <= plusDays(days)).length;
  return { active, archived, missingContracts, expiring30: countWithin(30), expiring60: countWithin(60), expiring90: expiring.length, expiring };
}

module.exports = {
  listEmployees,
  getEmployee,
  saveEmployee,
  createContract,
  rescanContract,
  contractFile,
  saveNote,
  serializeContract,
  dashboard,
  employeeSummary,
  EMPLOYEE_STATUSES
};
