"use strict";

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const helmet = require("helmet");
const pg = require("pg");
const multer = require("multer");
const QRCode = require("qrcode");
const { loadConfig } = require("./config");
const { prisma } = require("./prisma");
const data = require("./data");
const users = require("./users");
const hr = require("./hr-data");
const hrSecurity = require("./hr-security");
const workforce = require("./hr-workforce");
const projects = require("./project-data");
const service = require("./service-data");

const ROLE_COLLECTIONS = {
  crm: ["customers", "customerNotes", "customerDocuments"],
  sales: ["customers", "products", "quotes", "advices", "salesOpportunities", "salesAppointments"],
  execution: ["customers", "quotes", "installations"],
  finance: ["customers", "products", "quotes", "invoices"],
  installer: ["customers", "customerNotes", "customerDocuments", "installations"]
};
const ROLE_WRITE_COLLECTIONS = {
  crm: ["customers", "customerNotes", "customerDocuments"],
  sales: ["quotes", "advices", "salesOpportunities", "salesAppointments"],
  execution: ["installations"],
  finance: ["invoices"]
};
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function requestOrigin(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function sameOrigin(req) {
  const origin = req.get("origin");
  return !origin || origin === requestOrigin(req);
}

function csrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("base64url");
  return req.session.csrfToken;
}

function timingSafeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createFailureLimiter({ limit, windowMs }) {
  const attempts = new Map();
  return {
    check(key) {
      const now = Date.now();
      const item = attempts.get(key);
      if (!item || item.resetAt <= now) return true;
      return item.count < limit;
    },
    fail(key) {
      const now = Date.now();
      const item = attempts.get(key);
      if (!item || item.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + windowMs });
      else item.count += 1;
    },
    success(key) { attempts.delete(key); }
  };
}

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: "Niet ingelogd." });
}

function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.session || !req.session.user) {
      res.status(401).json({ error: "Niet ingelogd." });
      return;
    }
    if (roles.includes(req.session.user.role)) return next();
    res.status(403).json({ error: "Geen toegang." });
  };
}

function requireHrEnabled(config) {
  return function hrEnabledGuard(_req, res, next) {
    if (config.hrPortalEnabled) return next();
    res.status(404).json({ error: "Werknemersportaal is niet actief." });
  };
}

function isHrElevated(req) {
  const now = Date.now();
  const started = Number(req.session && req.session.hrAuthorizedAt || 0);
  const activity = Number(req.session && req.session.hrLastActivityAt || 0);
  return started > 0 && now - started <= 60 * 60 * 1000 && now - activity <= 15 * 60 * 1000;
}

function requireHrElevation(req, res, next) {
  if (!isHrElevated(req)) {
    if (req.session) {
      delete req.session.hrAuthorizedAt;
      delete req.session.hrLastActivityAt;
    }
    res.status(401).json({ error: "Extra HR-verificatie vereist.", code: "HR_ELEVATION_REQUIRED" });
    return;
  }
  req.session.hrLastActivityAt = Date.now();
  next();
}

function canReadCollection(user, collection) {
  return user.role === "admin" || Boolean(ROLE_COLLECTIONS[user.role] && ROLE_COLLECTIONS[user.role].includes(collection));
}

function canWriteCollection(user, collection) {
  return user.role === "admin" || Boolean(ROLE_WRITE_COLLECTIONS[user.role] && ROLE_WRITE_COLLECTIONS[user.role].includes(collection));
}

function channelCustomers(items) {
  return (items || []).map(({ notes: _notes, ...customer }) => customer);
}

function executionQuotes(items) {
  return (items || []).map((quote) => ({
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    customerId: quote.customerId,
    quoteDate: quote.quoteDate,
    status: quote.status
  }));
}

function collectionForRole(collection, items, role) {
  if (collection === "customers" && ["sales", "execution", "finance"].includes(role)) return channelCustomers(items);
  if (collection === "quotes" && role === "execution") return executionQuotes(items);
  if (collection === "installations" && role === "installer") {
    return (items || []).map(({ employeeId: _employeeId, qualificationCheck: _qualificationCheck, ...installation }) => installation);
  }
  return items || [];
}

function settingsForRole(settings, role) {
  const company = {
    companyName: settings.companyName,
    companyAddress: settings.companyAddress,
    companyCity: settings.companyCity,
    companyPhone: settings.companyPhone,
    companyEmail: settings.companyEmail,
    companySite: settings.companySite,
    companyKvk: settings.companyKvk,
    companyVat: settings.companyVat,
    companyIban: settings.companyIban
  };
  if (role === "sales") return { ...company, defaultQuoteTerms: settings.defaultQuoteTerms, adviceAssumptions: settings.adviceAssumptions };
  if (role === "finance") return { ...company, paymentDays: settings.paymentDays, defaultInvoiceNote: settings.defaultInvoiceNote };
  if (role === "execution") return company;
  return {};
}

function roleBootstrap(fullData, role) {
  if (role === "admin") return fullData;
  const payload = {};
  for (const collection of ROLE_COLLECTIONS[role] || []) payload[collection] = collectionForRole(collection, fullData[collection], role);
  if (["sales", "execution", "finance"].includes(role)) {
    payload.settings = settingsForRole(fullData.settings || {}, role);
  }
  if (["sales", "finance"].includes(role)) {
    const prefix = role === "sales" ? "quote-" : "invoice-";
    payload.counters = Object.fromEntries(Object.entries(fullData.counters || {}).filter(([key]) => key.startsWith(prefix)));
  }
  return payload;
}

function canUseCounter(user, type) {
  return user.role === "admin" || (type === "quote" && user.role === "sales") || (type === "invoice" && user.role === "finance");
}

function requireCollection(req) {
  const collection = req.params.collection;
  if (!data.COLLECTIONS.includes(collection)) {
    throw Object.assign(new Error("Onbekende collectie."), { status: 404 });
  }
  return collection;
}

function createApp(config = loadConfig()) {
  config = Object.assign({
    hrPortalEnabled: false,
    hrEncryptionKey: "",
    hrKeyVersion: "v1",
    clamavHost: "",
    clamavPort: 3310,
    allowUnscannedHrFiles: false
  }, config);
  const app = express();
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  const loginLimiter = createFailureLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });
  const mfaLimiter = createFailureLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 12 } });

  if (config.isProduction) app.set("trust proxy", 1);

  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false, hsts: config.isProduction }));
  app.use((req, res, next) => {
    const adviceTool = req.path.endsWith("/assets/adviestools.html");
    res.setHeader("Content-Security-Policy", [
      "default-src 'self'",
      `script-src 'self'${adviceTool ? " 'unsafe-inline'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-src 'self'",
      `frame-ancestors ${adviceTool ? "'self'" : "'none'"}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join("; "));
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.use(express.json({ limit: "12mb" }));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
    next();
  });
  app.use(session({
    store: new PgSession({
      pool,
      tableName: "session",
      createTableIfMissing: false
    }),
    name: config.isProduction ? "__Host-climature.sid" : "climature.sid",
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: config.isProduction,
      path: "/",
      maxAge: 1000 * 60 * 30
    }
  }));

  app.use(asyncHandler(async (req, res, next) => {
    if (!req.session || !req.session.user) return next();
    const protectedPath = req.path.startsWith("/api/") || req.path.startsWith("/medewerkers");
    if (!protectedPath) return next();
    const now = Date.now();
    if (req.session.loginAt && now - req.session.loginAt > 8 * 60 * 60 * 1000) {
      req.session.destroy(() => {});
      res.status(401).json({ error: "Sessie verlopen." });
      return;
    }
    const current = await prisma.user.findUnique({ where: { id: req.session.user.id }, select: { id: true, username: true, role: true, active: true, employeeId: true } });
    if (!current || !current.active || current.role !== req.session.user.role) {
      req.session.destroy(() => {});
      res.status(401).json({ error: "Sessie is niet meer geldig." });
      return;
    }
    req.session.user = users.sessionUser(current);
    next();
  }));

  app.use((req, res, next) => {
    if (!UNSAFE_METHODS.has(req.method)) return next();
    if (!sameOrigin(req)) return res.status(403).json({ error: "Ongeldige aanvraagbron." });
    if (req.path === "/api/auth/login") return next();
    if (!req.session || !req.session.user) return next();
    const supplied = req.get("x-csrf-token");
    const testBypass = config.nodeEnv === "test" && !req.get("origin") && !supplied;
    if (testBypass || timingSafeEqual(supplied, csrfToken(req))) return next();
    res.status(403).json({ error: "Ongeldig beveiligingstoken." });
  });

  app.get("/api/health", asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  }));

  app.get("/api/auth/session", (req, res) => {
    res.json({
      authenticated: Boolean(req.session && req.session.user),
      user: req.session.user || null,
      csrfToken: req.session ? csrfToken(req) : null,
      features: { hrPortalEnabled: Boolean(config.hrPortalEnabled) }
    });
  });

  app.post("/api/auth/login", asyncHandler(async (req, res) => {
    const loginKey = `${req.ip}:${users.normalizeUsername(req.body.username)}`;
    if (!loginLimiter.check(loginKey)) throw Object.assign(new Error("Te veel inlogpogingen. Probeer later opnieuw."), { status: 429 });
    let user;
    try {
      user = await users.login(prisma, config, req.body.username, req.body.password);
      loginLimiter.success(loginKey);
    } catch (error) {
      loginLimiter.fail(loginKey);
      throw error;
    }
    req.session.regenerate((error) => {
      if (error) {
        res.status(500).json({ error: "Sessie kon niet worden aangemaakt." });
        return;
      }
      req.session.user = user;
      req.session.loginAt = Date.now();
      res.json({ authenticated: true, user: req.session.user, csrfToken: csrfToken(req), features: { hrPortalEnabled: Boolean(config.hrPortalEnabled) } });
    });
  }));

  app.put("/api/auth/me", requireAuth, asyncHandler(async (req, res) => {
    const user = await users.updateMe(prisma, req.session.user, req.body || {});
    req.session.user = users.sessionUser(user);
    res.json({ user: req.session.user });
  }));

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    req.session.destroy((error) => {
      if (error) {
        res.status(500).json({ error: "Uitloggen mislukt." });
        return;
      }
      res.clearCookie(config.isProduction ? "__Host-climature.sid" : "climature.sid", { path: "/" });
      res.json({ authenticated: false });
    });
  });

  const hrEnabled = requireHrEnabled(config);
  const hrAdmin = [hrEnabled, requireRole("admin")];
  const hrProtected = [hrEnabled, requireRole("admin"), requireHrElevation];

  app.get("/api/hr/session", ...hrAdmin, asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.session.user.id }, select: { mfaEnabledAt: true } });
    res.json({ mfaEnabled: Boolean(user && user.mfaEnabledAt), elevated: isHrElevated(req) });
  }));

  app.post("/api/hr/mfa/setup/start", ...hrAdmin, asyncHandler(async (req, res) => {
    const user = await hrSecurity.verifyPassword(prisma, req.session.user, req.body.password);
    if (user.mfaEnabledAt) throw Object.assign(new Error("Authenticator is al ingesteld."), { status: 409 });
    const secret = hrSecurity.authenticator.generateSecret();
    const encrypted = hrSecurity.encrypt(config, secret);
    req.session.pendingMfa = {
      cipher: encrypted.cipher.toString("base64"),
      iv: encrypted.iv.toString("base64"),
      tag: encrypted.tag.toString("base64"),
      expiresAt: Date.now() + 10 * 60 * 1000
    };
    const uri = hrSecurity.authenticator.keyuri(user.username, "Climature HR", secret);
    res.json({ secret, qrCode: await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 240 }) });
  }));

  app.post("/api/hr/mfa/setup/confirm", ...hrAdmin, asyncHandler(async (req, res) => {
    const pending = req.session.pendingMfa;
    if (!pending || pending.expiresAt < Date.now()) throw Object.assign(new Error("MFA-inrichting is verlopen. Begin opnieuw."), { status: 400 });
    const secret = hrSecurity.decrypt(config, Buffer.from(pending.cipher, "base64"), Buffer.from(pending.iv, "base64"), Buffer.from(pending.tag, "base64")).toString("utf8");
    if (!hrSecurity.authenticator.check(String(req.body.code || ""), secret)) throw Object.assign(new Error("Authenticatorcode is onjuist."), { status: 401 });
    const codes = hrSecurity.recoveryCodes();
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: req.session.user.id }, data: { ...hrSecurity.secretRecord(config, secret), mfaEnabledAt: new Date(), mfaLastUsedStep: Math.floor(Date.now() / 30000) } });
      await tx.userMfaRecoveryCode.deleteMany({ where: { userId: req.session.user.id } });
      await tx.userMfaRecoveryCode.createMany({ data: codes.map((code) => ({ userId: req.session.user.id, codeHash: hrSecurity.recoveryHash(config, code) })) });
    });
    delete req.session.pendingMfa;
    req.session.hrAuthorizedAt = Date.now();
    req.session.hrLastActivityAt = Date.now();
    await hrSecurity.audit(prisma, config, req, "mfa.enabled", "user", req.session.user.id);
    res.json({ recoveryCodes: codes });
  }));

  app.post("/api/hr/elevate", ...hrAdmin, asyncHandler(async (req, res) => {
    const key = `${req.ip}:${req.session.user.id}`;
    if (!mfaLimiter.check(key)) throw Object.assign(new Error("Te veel verificatiepogingen. Probeer later opnieuw."), { status: 429 });
    try {
      const user = await hrSecurity.verifyPassword(prisma, req.session.user, req.body.password);
      if (!user.mfaEnabledAt) throw Object.assign(new Error("Authenticator moet eerst worden ingesteld."), { status: 409 });
      const method = await hrSecurity.verifySecondFactor(prisma, config, user, req.body.code);
      req.session.hrAuthorizedAt = Date.now();
      req.session.hrLastActivityAt = Date.now();
      mfaLimiter.success(key);
      await hrSecurity.audit(prisma, config, req, "session.elevated", "user", user.id, { method });
      res.json({ elevated: true });
    } catch (error) {
      mfaLimiter.fail(key);
      throw error;
    }
  }));

  app.post("/api/hr/lock", ...hrAdmin, (req, res) => {
    delete req.session.hrAuthorizedAt;
    delete req.session.hrLastActivityAt;
    res.json({ elevated: false });
  });

  app.get("/api/hr/dashboard", ...hrProtected, asyncHandler(async (_req, res) => {
    res.json({ ...(await hr.dashboard(prisma)), ...(await workforce.dashboardStats(prisma)) });
  }));

  app.get("/api/hr/employees", ...hrProtected, asyncHandler(async (req, res) => {
    res.json(await hr.listEmployees(prisma, req.query || {}));
  }));

  app.post("/api/hr/employees", ...hrProtected, asyncHandler(async (req, res) => {
    const saved = await hr.saveEmployee(prisma, config, null, req.body || {});
    await workforce.ensureAutomaticChecklists(prisma, saved, null);
    await hrSecurity.audit(prisma, config, req, "employee.created", "employee", saved.id, { employeeNumber: saved.employeeNumber });
    res.status(201).json({ item: await hr.getEmployee(prisma, config, saved.id) });
  }));

  app.get("/api/hr/employees/:id", ...hrProtected, asyncHandler(async (req, res) => {
    res.json({ item: await hr.getEmployee(prisma, config, req.params.id) });
  }));

  app.put("/api/hr/employees/:id", ...hrProtected, asyncHandler(async (req, res) => {
    const previous = await prisma.employee.findUnique({ where: { id: req.params.id }, select: { status: true } });
    const saved = await hr.saveEmployee(prisma, config, req.params.id, req.body || {});
    await workforce.ensureAutomaticChecklists(prisma, saved, previous && previous.status);
    await hrSecurity.audit(prisma, config, req, saved.status === "archived" ? "employee.archived" : "employee.updated", "employee", saved.id, { status: saved.status });
    res.json({ item: await hr.getEmployee(prisma, config, saved.id) });
  }));

  app.post("/api/hr/employees/:id/purge", ...hrProtected, asyncHandler(async (req, res) => {
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!employee) throw Object.assign(new Error("Werknemer niet gevonden."), { status: 404 });
    if (employee.status !== "archived") throw Object.assign(new Error("Archiveer de werknemer eerst."), { status: 409 });
    if (String(req.body.confirmEmployeeNumber || "").toUpperCase() !== employee.employeeNumber) throw Object.assign(new Error("Personeelsnummer ter bevestiging komt niet overeen."), { status: 400 });
    const user = await hrSecurity.verifyPassword(prisma, req.session.user, req.body.password);
    await hrSecurity.verifySecondFactor(prisma, config, user, req.body.code);
    await hrSecurity.audit(prisma, config, req, "employee.purged", "employee", employee.id, { employeeNumber: employee.employeeNumber });
    await prisma.employee.delete({ where: { id: employee.id } });
    res.json({ ok: true });
  }));

  app.post("/api/hr/employees/:id/contracts", ...hrProtected, upload.single("file"), asyncHandler(async (req, res) => {
    const item = await hr.createContract(prisma, config, req.session.user.id, req.params.id, req.body || {}, req.file);
    await hrSecurity.audit(prisma, config, req, "contract.uploaded", "employee", req.params.id, { contractId: item.id, scanStatus: item.scanStatus });
    res.status(201).json({ item });
  }));

  app.patch("/api/hr/employees/:employeeId/contracts/:id", ...hrProtected, asyncHandler(async (req, res) => {
    const allowed = ["active", "expired", "replaced", "archived"];
    if (!allowed.includes(req.body.status)) throw Object.assign(new Error("Contractstatus is ongeldig."), { status: 400 });
    const existing = await prisma.employmentContract.findFirst({ where: { id: req.params.id, employeeId: req.params.employeeId } });
    if (!existing) throw Object.assign(new Error("Contract niet gevonden."), { status: 404 });
    const saved = await prisma.employmentContract.update({ where: { id: existing.id }, data: { status: req.body.status }, include: { createdBy: { select: { username: true } } } });
    await hrSecurity.audit(prisma, config, req, "contract.status_changed", "employee", req.params.employeeId, { contractId: saved.id, status: saved.status });
    res.json({ item: hr.serializeContract(saved) });
  }));

  app.post("/api/hr/employees/:employeeId/contracts/:id/rescan", ...hrProtected, asyncHandler(async (req, res) => {
    const existing = await prisma.employmentContract.findFirst({ where: { id: req.params.id, employeeId: req.params.employeeId } });
    if (!existing) throw Object.assign(new Error("Contract niet gevonden."), { status: 404 });
    const item = await hr.rescanContract(prisma, config, existing.id);
    await hrSecurity.audit(prisma, config, req, "contract.rescanned", "employee", req.params.employeeId, { contractId: item.id, scanStatus: item.scanStatus });
    res.json({ item });
  }));

  app.get("/api/hr/employees/:employeeId/contracts/:id/download", ...hrProtected, asyncHandler(async (req, res) => {
    const file = await hr.contractFile(prisma, config, req.params.employeeId, req.params.id);
    await hrSecurity.audit(prisma, config, req, "contract.downloaded", "employee", req.params.employeeId, { contractId: file.row.id });
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.row.fileName)}`,
      "Content-Length": String(file.buffer.length),
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff"
    });
    res.send(file.buffer);
  }));

  app.post("/api/hr/employees/:employeeId/notes", ...hrProtected, asyncHandler(async (req, res) => {
    const item = await hr.saveNote(prisma, config, req.session.user.id, req.params.employeeId, null, req.body || {});
    await hrSecurity.audit(prisma, config, req, "note.created", "employee", req.params.employeeId, { noteId: item.id, category: item.category });
    res.status(201).json({ item });
  }));

  app.put("/api/hr/employees/:employeeId/notes/:id", ...hrProtected, asyncHandler(async (req, res) => {
    const item = await hr.saveNote(prisma, config, req.session.user.id, req.params.employeeId, req.params.id, req.body || {});
    await hrSecurity.audit(prisma, config, req, "note.updated", "employee", req.params.employeeId, { noteId: item.id, category: item.category });
    res.json({ item });
  }));

  app.delete("/api/hr/employees/:employeeId/notes/:id", ...hrProtected, asyncHandler(async (req, res) => {
    const existing = await prisma.employeeNote.findFirst({ where: { id: req.params.id, employeeId: req.params.employeeId } });
    if (!existing) throw Object.assign(new Error("Notitie niet gevonden."), { status: 404 });
    await prisma.employeeNote.delete({ where: { id: existing.id } });
    await hrSecurity.audit(prisma, config, req, "note.deleted", "employee", req.params.employeeId, { noteId: existing.id });
    res.json({ ok: true });
  }));

  app.get("/api/hr/employees/:id/audit", ...hrProtected, asyncHandler(async (req, res) => {
    const items = await prisma.hrAuditEvent.findMany({ where: { entityType: "employee", entityId: req.params.id }, include: { actor: { select: { username: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
    res.json({ items: items.map((item) => ({ id: item.id, action: item.action, metadata: item.metadata, actor: item.actor ? item.actor.username : "Verwijderde gebruiker", createdAt: item.createdAt })) });
  }));

  app.get("/api/hr/qualification-definitions", ...hrProtected, asyncHandler(async (_req, res) => {
    res.json({ items: await workforce.listDefinitions(prisma) });
  }));

  app.post("/api/hr/qualification-definitions", ...hrProtected, asyncHandler(async (req, res) => {
    const item = await workforce.saveDefinition(prisma, null, req.body || {});
    await hrSecurity.audit(prisma, config, req, "qualification_definition.created", "qualification_definition", item.id, { code: item.code });
    res.status(201).json({ item });
  }));

  app.put("/api/hr/qualification-definitions/:id", ...hrProtected, asyncHandler(async (req, res) => {
    const item = await workforce.saveDefinition(prisma, req.params.id, req.body || {});
    await hrSecurity.audit(prisma, config, req, "qualification_definition.updated", "qualification_definition", item.id, { code: item.code, active: item.active });
    res.json({ item });
  }));

  app.get("/api/hr/qualification-requirements", ...hrProtected, asyncHandler(async (_req, res) => {
    res.json({ items: await workforce.listRequirements(prisma) });
  }));

  app.post("/api/hr/qualification-requirements", ...hrProtected, asyncHandler(async (req, res) => {
    const item = await workforce.saveRequirement(prisma, req.body || {});
    await hrSecurity.audit(prisma, config, req, "qualification_requirement.saved", "qualification_requirement", item.id, { workType: item.workType, qualificationCode: item.definition.code });
    res.json({ item });
  }));

  app.delete("/api/hr/qualification-requirements/:id", ...hrProtected, asyncHandler(async (req, res) => {
    await workforce.deleteRequirement(prisma, req.params.id);
    await hrSecurity.audit(prisma, config, req, "qualification_requirement.deleted", "qualification_requirement", req.params.id);
    res.json({ ok: true });
  }));

  app.get("/api/hr/skills-matrix", ...hrProtected, asyncHandler(async (req, res) => {
    res.json(await workforce.qualificationMatrix(prisma, req.query || {}));
  }));

  app.get("/api/hr/employees/:id/qualifications", ...hrProtected, asyncHandler(async (req, res) => {
    res.json({ items: await workforce.listEmployeeQualifications(prisma, config, req.params.id, req.query.archived === "true") });
  }));

  app.post("/api/hr/employees/:id/qualifications", ...hrProtected, upload.single("file"), asyncHandler(async (req, res) => {
    const item = await workforce.saveEmployeeQualification(prisma, config, req.session.user.id, req.params.id, null, req.body || {}, req.file);
    await hrSecurity.audit(prisma, config, req, "qualification.created", "employee", req.params.id, { qualificationId: item.id, definitionCode: item.definition.code, scanStatus: item.evidenceScanStatus });
    res.status(201).json({ item });
  }));

  app.put("/api/hr/employees/:employeeId/qualifications/:id", ...hrProtected, upload.single("file"), asyncHandler(async (req, res) => {
    const item = await workforce.saveEmployeeQualification(prisma, config, req.session.user.id, req.params.employeeId, req.params.id, req.body || {}, req.file);
    await hrSecurity.audit(prisma, config, req, "qualification.updated", "employee", req.params.employeeId, { qualificationId: item.id, definitionCode: item.definition.code, scanStatus: item.evidenceScanStatus });
    res.json({ item });
  }));

  app.patch("/api/hr/employees/:employeeId/qualifications/:id/archive", ...hrProtected, asyncHandler(async (req, res) => {
    await workforce.archiveQualification(prisma, req.params.employeeId, req.params.id);
    await hrSecurity.audit(prisma, config, req, "qualification.archived", "employee", req.params.employeeId, { qualificationId: req.params.id });
    res.json({ ok: true });
  }));

  app.post("/api/hr/employees/:employeeId/qualifications/:id/rescan", ...hrProtected, asyncHandler(async (req, res) => {
    const item = await workforce.rescanQualification(prisma, config, req.params.employeeId, req.params.id);
    await hrSecurity.audit(prisma, config, req, "qualification.rescanned", "employee", req.params.employeeId, { qualificationId: item.id, scanStatus: item.evidenceScanStatus });
    res.json({ item });
  }));

  app.get("/api/hr/employees/:employeeId/qualifications/:id/download", ...hrProtected, asyncHandler(async (req, res) => {
    const file = await workforce.qualificationFile(prisma, config, req.params.employeeId, req.params.id);
    await hrSecurity.audit(prisma, config, req, "qualification.downloaded", "employee", req.params.employeeId, { qualificationId: file.row.id });
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.row.evidenceFileName)}`, "Content-Length": String(file.buffer.length), "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" });
    res.send(file.buffer);
  }));

  app.get("/api/hr/checklist-templates", ...hrProtected, asyncHandler(async (_req, res) => {
    res.json({ items: await workforce.listTemplates(prisma) });
  }));

  app.put("/api/hr/checklist-templates/:type", ...hrProtected, asyncHandler(async (req, res) => {
    const item = await workforce.saveTemplate(prisma, req.params.type, req.body || {});
    await hrSecurity.audit(prisma, config, req, "checklist_template.updated", "checklist_template", item.id, { type: item.type, version: item.version });
    res.json({ item });
  }));

  app.get("/api/hr/employees/:id/checklists", ...hrProtected, asyncHandler(async (req, res) => {
    res.json({ items: await workforce.listEmployeeChecklists(prisma, config, req.params.id) });
  }));

  app.post("/api/hr/employees/:id/checklists", ...hrProtected, asyncHandler(async (req, res) => {
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id }, select: { startDate: true, endDate: true } });
    if (!employee) throw Object.assign(new Error("Werknemer niet gevonden."), { status: 404 });
    const type = req.body.type;
    const item = await workforce.instantiateChecklist(prisma, req.params.id, type, req.body.anchorDate || (type === "offboarding" ? employee.endDate : employee.startDate) || new Date().toISOString().slice(0, 10));
    await hrSecurity.audit(prisma, config, req, "checklist.created", "employee", req.params.id, { checklistId: item.id, type: item.type });
    res.status(201).json({ item });
  }));

  app.put("/api/hr/checklists/:checklistId/items/:itemId", ...hrProtected, asyncHandler(async (req, res) => {
    const result = await workforce.updateChecklistTask(prisma, config, req.session.user.id, req.params.checklistId, req.params.itemId, req.body || {});
    await hrSecurity.audit(prisma, config, req, "checklist_task.updated", "employee", result.employeeId, { checklistId: req.params.checklistId, taskId: result.itemId, status: result.status });
    res.json({ item: result });
  }));

  app.get("/api/admin/employee-directory", hrEnabled, requireRole("admin", "execution"), asyncHandler(async (req, res) => {
    res.json({ items: await workforce.directory(prisma, req.query.workType, req.query.plannedDate) });
  }));

  app.get("/api/projects/actions", requireRole("admin", "execution"), asyncHandler(async (req, res) => {
    res.json({ items: await projects.actionCenter(prisma, req.session.user, req.query || {}) });
  }));

  app.get("/api/projects", requireRole("admin", "execution", "installer"), asyncHandler(async (req, res) => {
    res.json(await projects.listProjects(prisma, config, req.session.user, req.query || {}));
  }));

  app.post("/api/projects", requireRole("admin", "execution"), asyncHandler(async (req, res) => {
    const project = await projects.createProject(prisma, req.body || {}, req.session.user.id);
    res.status(201).json({ item: await projects.getProject(prisma, config, req.session.user, project.id) });
  }));

  app.get("/api/projects/:id", requireRole("admin", "execution", "installer"), asyncHandler(async (req, res) => {
    res.json({ item: await projects.getProject(prisma, config, req.session.user, req.params.id) });
  }));

  app.put("/api/projects/:id", requireRole("admin", "execution"), asyncHandler(async (req, res) => {
    await projects.updateProject(prisma, req.session.user, req.params.id, req.body || {});
    res.json({ item: await projects.getProject(prisma, config, req.session.user, req.params.id) });
  }));

  app.post("/api/projects/:id/materials", requireRole("admin", "execution"), asyncHandler(async (req, res) => {
    res.status(201).json({ item: await projects.saveMaterial(prisma, req.session.user, req.params.id, null, req.body || {}) });
  }));

  app.put("/api/projects/:id/materials/:materialId", requireRole("admin", "execution"), asyncHandler(async (req, res) => {
    res.json({ item: await projects.saveMaterial(prisma, req.session.user, req.params.id, req.params.materialId, req.body || {}) });
  }));

  app.delete("/api/projects/:id/materials/:materialId", requireRole("admin", "execution"), asyncHandler(async (req, res) => {
    await projects.removeMaterial(prisma, req.session.user, req.params.id, req.params.materialId);
    res.json({ ok: true });
  }));

  app.post("/api/projects/:id/tasks", requireRole("admin", "execution"), asyncHandler(async (req, res) => {
    res.status(201).json({ item: await projects.saveTask(prisma, req.session.user, req.params.id, null, req.body || {}) });
  }));

  app.put("/api/projects/:id/tasks/:taskId", requireRole("admin", "execution", "installer"), asyncHandler(async (req, res) => {
    res.json({ item: await projects.saveTask(prisma, req.session.user, req.params.id, req.params.taskId, req.body || {}) });
  }));

  app.post("/api/projects/:id/team", requireRole("admin", "execution"), asyncHandler(async (req, res) => {
    res.json({ item: await projects.saveMember(prisma, req.session.user, req.params.id, req.body || {}) });
  }));

  app.delete("/api/projects/:id/team/:memberId", requireRole("admin", "execution"), asyncHandler(async (req, res) => {
    await projects.removeMember(prisma, req.session.user, req.params.id, req.params.memberId);
    res.json({ ok: true });
  }));

  app.post("/api/projects/:id/equipment", requireRole("admin", "execution", "installer"), asyncHandler(async (req, res) => {
    res.status(201).json({ item: await projects.saveEquipment(prisma, config, req.session.user, req.params.id, null, req.body || {}) });
  }));

  app.put("/api/projects/:id/equipment/:equipmentId", requireRole("admin", "execution", "installer"), asyncHandler(async (req, res) => {
    res.json({ item: await projects.saveEquipment(prisma, config, req.session.user, req.params.id, req.params.equipmentId, req.body || {}) });
  }));

  app.get("/api/project-templates", requireRole("admin", "execution"), asyncHandler(async (_req, res) => {
    res.json({ items: await projects.listTemplates(prisma) });
  }));

  app.get("/api/employee-availability", requireRole("admin", "execution"), asyncHandler(async (req, res) => {
    res.json({ items: await projects.availabilityDirectory(prisma, req.query || {}) });
  }));

  app.get("/api/hr/employees/:id/work-schedule", ...hrProtected, asyncHandler(async (req, res) => {
    const items = await prisma.employeeWorkSchedule.findMany({ where: { employeeId: req.params.id }, orderBy: { weekday: "asc" } });
    const absences = await prisma.employeeAbsence.findMany({ where: { employeeId: req.params.id }, orderBy: { startDate: "desc" }, take: 100 });
    res.json({ items, absences });
  }));

  app.put("/api/hr/employees/:id/work-schedule", ...hrProtected, asyncHandler(async (req, res) => {
    const items = await projects.saveSchedule(prisma, req.params.id, req.body.items || []);
    await hrSecurity.audit(prisma, config, req, "employee.schedule_updated", "employee", req.params.id, { weekdays: items.map((item) => item.weekday) });
    res.json({ items });
  }));

  app.post("/api/hr/employees/:id/absences", ...hrProtected, asyncHandler(async (req, res) => {
    const item = await projects.saveAbsence(prisma, req.params.id, null, req.body || {});
    await hrSecurity.audit(prisma, config, req, "employee.absence_created", "employee", req.params.id, { absenceId: item.id, type: item.type, startDate: item.startDate, endDate: item.endDate });
    res.status(201).json({ item });
  }));

  app.put("/api/hr/employees/:id/absences/:absenceId", ...hrProtected, asyncHandler(async (req, res) => {
    const existing = await prisma.employeeAbsence.findFirst({ where: { id: req.params.absenceId, employeeId: req.params.id } });
    if (!existing) throw Object.assign(new Error("Afwezigheid niet gevonden."), { status: 404 });
    const item = await projects.saveAbsence(prisma, req.params.id, existing.id, req.body || {});
    await hrSecurity.audit(prisma, config, req, "employee.absence_updated", "employee", req.params.id, { absenceId: item.id, type: item.type, startDate: item.startDate, endDate: item.endDate });
    res.json({ item });
  }));

  app.delete("/api/hr/employees/:id/absences/:absenceId", ...hrProtected, asyncHandler(async (req, res) => {
    const existing = await prisma.employeeAbsence.findFirst({ where: { id: req.params.absenceId, employeeId: req.params.id } });
    if (!existing) throw Object.assign(new Error("Afwezigheid niet gevonden."), { status: 404 });
    await prisma.employeeAbsence.delete({ where: { id: existing.id } });
    await hrSecurity.audit(prisma, config, req, "employee.absence_deleted", "employee", req.params.id, { absenceId: existing.id });
    res.json({ ok: true });
  }));

  app.get("/api/bootstrap", requireAuth, asyncHandler(async (req, res) => {
    const payload = await data.bootstrap(prisma);
    res.json({ data: roleBootstrap(payload, req.session.user.role) });
  }));

  const serviceReader = requireRole("admin", "execution", "installer", "finance", "crm");
  const serviceManager = requireRole("admin", "execution");

  app.get("/api/service/dashboard", serviceReader, asyncHandler(async (req, res) => {
    res.json(await service.dashboard(prisma, req.session.user));
  }));

  app.get("/api/service/bootstrap", serviceReader, asyncHandler(async (req, res) => {
    res.json(await service.bootstrap(prisma, req.session.user, req.query || {}));
  }));

  app.post("/api/service/equipment", serviceManager, asyncHandler(async (req, res) => {
    res.status(201).json({ item: await service.saveEquipment(prisma, req.session.user, null, req.body || {}) });
  }));
  app.put("/api/service/equipment/:id", serviceManager, asyncHandler(async (req, res) => {
    res.json({ item: await service.saveEquipment(prisma, req.session.user, req.params.id, req.body || {}) });
  }));

  app.post("/api/service/contracts", serviceManager, asyncHandler(async (req, res) => {
    res.status(201).json({ item: await service.saveContract(prisma, req.session.user, null, req.body || {}) });
  }));
  app.put("/api/service/contracts/:id", serviceManager, asyncHandler(async (req, res) => {
    res.json({ item: await service.saveContract(prisma, req.session.user, req.params.id, req.body || {}) });
  }));

  app.post("/api/service/requests", serviceManager, asyncHandler(async (req, res) => {
    res.status(201).json({ item: await service.saveRequest(prisma, req.session.user, null, req.body || {}) });
  }));
  app.put("/api/service/requests/:id", serviceManager, asyncHandler(async (req, res) => {
    res.json({ item: await service.saveRequest(prisma, req.session.user, req.params.id, req.body || {}) });
  }));

  app.get("/api/service/availability", serviceManager, asyncHandler(async (req, res) => {
    res.json({ items: await service.availability(prisma, req.query || {}) });
  }));
  app.post("/api/service/visits", serviceManager, asyncHandler(async (req, res) => {
    res.status(201).json({ item: await service.saveVisit(prisma, req.session.user, null, req.body || {}) });
  }));
  app.put("/api/service/visits/:id", requireRole("admin", "execution", "installer"), asyncHandler(async (req, res) => {
    res.json({ item: await service.saveVisit(prisma, req.session.user, req.params.id, req.body || {}) });
  }));
  app.post("/api/service/visits/:id/invoice", requireRole("admin", "execution", "finance"), asyncHandler(async (req, res) => {
    res.status(201).json({ item: await service.createInvoice(prisma, req.session.user, req.params.id) });
  }));
  app.post("/api/service/visits/:id/confirmation", serviceManager, asyncHandler(async (req, res) => {
    res.json(await service.sendVisitConfirmation(prisma, config, req.session.user, req.params.id));
  }));

  app.post("/api/service/requests/:id/documents", serviceManager, upload.single("file"), asyncHandler(async (req, res) => {
    res.status(201).json({ item: await service.saveDocument(prisma, config, req.session.user, "request", req.params.id, req.file) });
  }));
  app.post("/api/service/visits/:id/documents", requireRole("admin", "execution", "installer"), upload.single("file"), asyncHandler(async (req, res) => {
    res.status(201).json({ item: await service.saveDocument(prisma, config, req.session.user, "visit", req.params.id, req.file) });
  }));
  app.get("/api/service/documents/:id/download", requireRole("admin", "execution", "installer"), asyncHandler(async (req, res) => {
    const item = await service.documentFile(prisma, req.session.user, req.params.id);
    res.set({ "Content-Type": item.mimeType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(item.fileName)}`, "Content-Length": String(item.content.length), "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" });
    res.send(item.content);
  }));
  app.post("/api/service/reminders/run", serviceManager, asyncHandler(async (req, res) => {
    res.json({ items: await service.sendReminders(prisma, config, req.session.user) });
  }));

  app.get("/api/users", requireRole("admin"), asyncHandler(async (_req, res) => {
    res.json({ items: await users.listUsers(prisma) });
  }));

  app.post("/api/users", requireRole("admin"), asyncHandler(async (req, res) => {
    res.json({ item: await users.createUser(prisma, req.body || {}) });
  }));

  app.put("/api/users/:id", requireRole("admin"), asyncHandler(async (req, res) => {
    res.json({ item: await users.updateUser(prisma, req.params.id, req.body || {}) });
  }));

  app.get("/api/settings", requireRole("admin"), asyncHandler(async (_req, res) => {
    res.json({ item: await data.getSettings(prisma) });
  }));

  app.put("/api/settings", requireRole("admin"), asyncHandler(async (req, res) => {
    res.json({ item: await data.saveSettings(prisma, req.body || {}) });
  }));

  app.post("/api/advice-assumptions/refresh", requireRole("admin"), asyncHandler(async (_req, res) => {
    res.json({ item: await data.refreshAdviceAssumptions(prisma) });
  }));

  app.post("/api/counters/:type/next", requireAuth, asyncHandler(async (req, res) => {
    if (!canUseCounter(req.session.user, req.params.type)) return res.status(403).json({ error: "Geen toegang." });
    res.json({ value: await data.nextNumber(prisma, req.params.type) });
  }));

  app.get("/api/counters/:type/peek", requireAuth, asyncHandler(async (req, res) => {
    if (!canUseCounter(req.session.user, req.params.type)) return res.status(403).json({ error: "Geen toegang." });
    res.json({ value: await data.peekNumber(prisma, req.params.type) });
  }));

  app.get("/api/collections/:collection", requireAuth, asyncHandler(async (req, res) => {
    const collection = requireCollection(req);
    if (!canReadCollection(req.session.user, collection)) {
      res.status(403).json({ error: "Geen toegang." });
      return;
    }
    const items = await data.listCollection(prisma, collection);
    res.json({ items: collectionForRole(collection, items, req.session.user.role) });
  }));

  app.post("/api/collections/:collection", requireAuth, asyncHandler(async (req, res) => {
    const collection = requireCollection(req);
    if (!canWriteCollection(req.session.user, collection)) return res.status(403).json({ error: "Geen toegang." });
    const input = { ...(req.body || {}) };
    if (collection === "installations") {
      input.qualificationCheck = input.employeeId ? await workforce.checkEmployeeQualifications(prisma, input.employeeId, input.workType, input.plannedDate) : null;
    }
    const item = await data.upsert(prisma, collection, input);
    if (collection === "installations") await projects.ensureProjectForInstallation(prisma, item.id, req.session.user.id);
    if (collection === "installations" && input.qualificationCheck && input.qualificationCheck.warnings.length) {
      await hrSecurity.audit(prisma, config, req, "installation.qualification_warning", "installation", item.id, { workType: input.qualificationCheck.workType, warningCodes: input.qualificationCheck.warnings.map((warning) => warning.code), qualificationCodes: input.qualificationCheck.warnings.map((warning) => warning.qualificationCode) });
    }
    res.json({ item });
  }));

  app.put("/api/collections/:collection", requireRole("admin"), asyncHandler(async (req, res) => {
    const collection = requireCollection(req);
    await data.replaceCollection(prisma, collection, req.body.items || []);
    await projects.ensureProjectsForExistingInstallations(prisma);
    res.json({ data: await data.bootstrap(prisma) });
  }));

  app.delete("/api/collections/:collection/:id", requireAuth, asyncHandler(async (req, res) => {
    const collection = requireCollection(req);
    if (!canWriteCollection(req.session.user, collection)) return res.status(403).json({ error: "Geen toegang." });
    await data.remove(prisma, collection, req.params.id);
    res.json({ ok: true });
  }));

  app.put("/api/installations/:id/workorder", requireRole("admin", "execution", "installer"), asyncHandler(async (req, res) => {
    res.json({ item: await data.saveInstallationWorkOrder(prisma, req.params.id, req.body || {}) });
  }));

  app.get("/api/backup/export", requireRole("admin"), asyncHandler(async (_req, res) => {
    res.json(await data.exportData(prisma));
  }));

  app.post("/api/backup/import", requireRole("admin"), asyncHandler(async (req, res) => {
    await data.importData(prisma, req.body);
    await projects.ensureProjectsForExistingInstallations(prisma);
    res.json({ data: await data.bootstrap(prisma) });
  }));

  app.post("/api/admin/reset", requireRole("admin"), asyncHandler(async (_req, res) => {
    res.json({ data: await data.resetData(prisma) });
  }));

  app.use("/medewerkers", hrEnabled, requireRole("admin"), (req, res, next) => {
    res.set("Cache-Control", "no-store, private");
    next();
  }, express.static(path.join(__dirname, "..", "hr"), { index: "index.html", extensions: ["html"] }));

  const publicRoot = path.join(__dirname, "..");
  app.use("/assets", express.static(path.join(publicRoot, "assets"), { fallthrough: false }));
  app.get(["/", "/index.html"], (_req, res) => res.sendFile(path.join(publicRoot, "index.html")));
  app.get("/manifest.webmanifest", (_req, res) => res.sendFile(path.join(publicRoot, "manifest.webmanifest")));
  app.get("/service-worker.js", (_req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(publicRoot, "service-worker.js"));
  });

  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "API-route niet gevonden." });
      return;
    }
    next();
  });

  app.use((error, _req, res, _next) => {
    const uploadTooLarge = error && error.code === "LIMIT_FILE_SIZE";
    const status = uploadTooLarge ? 413 : (error.status || 500);
    const message = uploadTooLarge ? "PDF is groter dan 8 MB." : (status >= 500 ? "Er ging iets mis op de server." : error.message);
    if (status >= 500) console.error(error);
    res.status(status).json({ error: message });
  });

  app.locals.pool = pool;
  return app;
}

async function main() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 24) {
    throw new Error(`Node ${process.versions.node} is te oud. Gebruik Node 24 LTS of nieuwer.`);
  }
  const config = loadConfig();
  const app = createApp(config);
  await users.ensureBootstrapAdmin(prisma, config);
  await data.bootstrap(prisma);
  await workforce.ensureDefaults(prisma);
  await projects.ensureProjectsForExistingInstallations(prisma);
  app.listen(config.port, () => {
    console.log(`Climature Bedrijfsportaal draait op http://localhost:${config.port}`);
  });
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error(error.message || error);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = { createApp };
