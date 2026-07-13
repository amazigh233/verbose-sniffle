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

const INSTALLER_COLLECTIONS = ["customers", "customerNotes", "customerDocuments", "installations"];
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
  return user.role === "admin" || (user.role === "installer" && INSTALLER_COLLECTIONS.includes(collection));
}

function installerBootstrap(fullData) {
  return {
    customers: fullData.customers || [],
    customerNotes: fullData.customerNotes || [],
    customerDocuments: fullData.customerDocuments || [],
    installations: (fullData.installations || []).map(({ employeeId: _employeeId, ...installation }) => installation)
  };
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
    const current = await prisma.user.findUnique({ where: { id: req.session.user.id }, select: { id: true, username: true, role: true, active: true } });
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
    res.json(await hr.dashboard(prisma));
  }));

  app.get("/api/hr/employees", ...hrProtected, asyncHandler(async (req, res) => {
    res.json(await hr.listEmployees(prisma, req.query || {}));
  }));

  app.post("/api/hr/employees", ...hrProtected, asyncHandler(async (req, res) => {
    const saved = await hr.saveEmployee(prisma, config, null, req.body || {});
    await hrSecurity.audit(prisma, config, req, "employee.created", "employee", saved.id, { employeeNumber: saved.employeeNumber });
    res.status(201).json({ item: await hr.getEmployee(prisma, config, saved.id) });
  }));

  app.get("/api/hr/employees/:id", ...hrProtected, asyncHandler(async (req, res) => {
    res.json({ item: await hr.getEmployee(prisma, config, req.params.id) });
  }));

  app.put("/api/hr/employees/:id", ...hrProtected, asyncHandler(async (req, res) => {
    const saved = await hr.saveEmployee(prisma, config, req.params.id, req.body || {});
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

  app.get("/api/admin/employee-directory", hrEnabled, requireRole("admin"), asyncHandler(async (_req, res) => {
    const rows = await prisma.employee.findMany({ where: { status: "active" }, select: { id: true, firstName: true, lastName: true, jobTitle: true, status: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
    res.json({ items: rows.map((item) => ({ id: item.id, displayName: `${item.firstName} ${item.lastName}`.trim(), jobTitle: item.jobTitle, active: true })) });
  }));

  app.get("/api/bootstrap", requireAuth, asyncHandler(async (req, res) => {
    const payload = await data.bootstrap(prisma);
    res.json({ data: req.session.user.role === "installer" ? installerBootstrap(payload) : payload });
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

  app.post("/api/counters/:type/next", requireRole("admin"), asyncHandler(async (req, res) => {
    res.json({ value: await data.nextNumber(prisma, req.params.type) });
  }));

  app.get("/api/counters/:type/peek", requireRole("admin"), asyncHandler(async (req, res) => {
    res.json({ value: await data.peekNumber(prisma, req.params.type) });
  }));

  app.get("/api/collections/:collection", requireAuth, asyncHandler(async (req, res) => {
    const collection = requireCollection(req);
    if (!canReadCollection(req.session.user, collection)) {
      res.status(403).json({ error: "Geen toegang." });
      return;
    }
    res.json({ items: await data.listCollection(prisma, collection) });
  }));

  app.post("/api/collections/:collection", requireRole("admin"), asyncHandler(async (req, res) => {
    const collection = requireCollection(req);
    res.json({ item: await data.upsert(prisma, collection, req.body || {}) });
  }));

  app.put("/api/collections/:collection", requireRole("admin"), asyncHandler(async (req, res) => {
    const collection = requireCollection(req);
    res.json({ data: await data.replaceCollection(prisma, collection, req.body.items || []) });
  }));

  app.delete("/api/collections/:collection/:id", requireRole("admin"), asyncHandler(async (req, res) => {
    const collection = requireCollection(req);
    await data.remove(prisma, collection, req.params.id);
    res.json({ ok: true });
  }));

  app.put("/api/installations/:id/workorder", requireRole("admin", "installer"), asyncHandler(async (req, res) => {
    res.json({ item: await data.saveInstallationWorkOrder(prisma, req.params.id, req.body || {}) });
  }));

  app.get("/api/backup/export", requireRole("admin"), asyncHandler(async (_req, res) => {
    res.json(await data.exportData(prisma));
  }));

  app.post("/api/backup/import", requireRole("admin"), asyncHandler(async (req, res) => {
    res.json({ data: await data.importData(prisma, req.body) });
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
