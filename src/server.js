"use strict";

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const compression = require("compression");
const PgSession = require("connect-pg-simple")(session);
const helmet = require("helmet");
const pg = require("pg");
const multer = require("multer");
const sharp = require("sharp");
const QRCode = require("qrcode");
const { loadConfig } = require("./config");
const { prisma } = require("./prisma");
const data = require("./data");
const users = require("./users");
const hr = require("./hr-data");
const hrSecurity = require("./hr-security");
const workforce = require("./hr-workforce");
const projects = require("./project-data");
const { registerProjectRoutes } = require("./modules/projects/routes");
const { registerServiceRoutes } = require("./modules/service/routes");
const { registerCustomerRoutes } = require("./modules/customers/routes");
const { registerQuoteRoutes } = require("./modules/quotes/routes");
const { registerInvoiceRoutes } = require("./modules/invoices/routes");
const { registerInstallationRoutes } = require("./modules/installations/routes");
const { registerPaymentRoutes } = require("./modules/payments/routes");
const { registerInventoryRoutes } = require("./modules/inventory/routes");
const authorization = require("./middleware/authorization");
const { createObjectStorage } = require("./infrastructure/object-storage");
const { createCoordinationStore } = require("./infrastructure/coordination");
const { createLogger } = require("./infrastructure/logger");
const { scanFile, storageKey, validateFile } = require("./infrastructure/object-storage/file-policy");
const { Prisma } = require("@prisma/client");
const authValidation = require("./modules/auth/validation");
const { validateCollectionWrite } = require("./modules/collections/validation");
const { validateMutationEnvelope, validateParam } = require("./shared/validation");
const dashboardData = require("./dashboard-data");
const reportData = require("./report-data");
const { createEnergyPriceService } = require("./energy-prices");
const { createWascoIntegration } = require("./wasco-integration");

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
const RESOURCE_COLLECTIONS = {
  notes: "customerNotes",
  documents: "customerDocuments",
  products: "products",
  advices: "advices",
  "sales-opportunities": "salesOpportunities",
  "sales-appointments": "salesAppointments"
};

function apiJsonValue(value) {
  if (Prisma.Decimal.isDecimal(value) || value && value.constructor && value.constructor.name === "Decimal") return value.toNumber();
  if (Array.isArray(value)) return value.map(apiJsonValue);
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, apiJsonValue(item)]));
  }
  return value;
}

function errorCodeForStatus(status) {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 423) return "LOCKED";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "DEPENDENCY_UNAVAILABLE";
  return status >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED";
}

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

function createFailureLimiter({ store, namespace, limit, windowMs }) {
  return {
    async check(key) { return Number(await store.getJson(`climature:fail:${namespace}:${key}`) || 0) < limit; },
    async fail(key) { await store.increment(`climature:fail:${namespace}:${key}`, windowMs); },
    async success(key) { await store.delete(`climature:fail:${namespace}:${key}`); }
  };
}

// Fixed-window teller per sleutel (IP). Bewust zonder timers: opruiming
// gebeurt lazy bij expiratie en via de size-cap, zodat de event loop
// (en de testsuite) niet opengehouden wordt.
function createRateLimiter({ store, namespace, limit, windowMs }) {
  return async function allow(key) { return await store.increment(`climature:rate:${namespace}:${key}`, windowMs) <= limit; };
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
  if (collection === "customerDocuments") {
    return (items || []).map(({ content: _content, storageKey: _storageKey, sha256: _sha256, scanMessage: _scanMessage, ...document }) => document);
  }
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

function permissionsForRole(role) {
  const readableCollections = role === "admin" ? data.COLLECTIONS.slice() : (ROLE_COLLECTIONS[role] || []).slice();
  const writableCollections = role === "admin" ? data.COLLECTIONS.slice() : (ROLE_WRITE_COLLECTIONS[role] || []).slice();
  return {
    readableCollections,
    writableCollections,
    manageUsers: role === "admin",
    manageSettings: role === "admin",
    exportBackup: role === "admin",
    manageProjects: ["admin", "execution"].includes(role),
    managePayments: ["admin", "finance"].includes(role),
    updateAssignedWork: role === "installer"
  };
}

function countersForRole(counters, role) {
  if (role === "admin") return counters;
  const allowed = role === "sales" ? "quote-" : role === "finance" ? "invoice-" : "__none__";
  return Object.fromEntries(Object.entries(counters || {}).filter(([key]) => key.startsWith(allowed)));
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
    allowUnscannedHrFiles: false,
    objectStorageProvider: "local",
    objectStorageRoot: path.join(__dirname, "..", ".data", "objects"),
    redisUrl: "",
    energyPriceApiUrl: "https://public.api.energyzero.nl",
    energyPriceCacheTtlMs: 5 * 60 * 1000,
    energyPriceStaleTtlMs: 24 * 60 * 60 * 1000,
    energyPriceTimeoutMs: 8000,
    wascoApiBaseUrl: "",
    wascoApiKey: "",
    wascoCustomerNumber: "",
    wascoOrdersEnabled: false,
    wascoTimeoutMs: 8000
  }, config);
  const app = express();
  app.use((req, res, next) => {
    const sendJson = res.json.bind(res);
    res.json = (body) => {
      const value = apiJsonValue(body);
      if (res.statusCode >= 400 && value && value.error) {
        if (!value.code) value.code = errorCodeForStatus(res.statusCode);
        if (!value.requestId) value.requestId = req.id;
      }
      return sendJson(value);
    };
    next();
  });
  const objectStorage = createObjectStorage(config);
  const coordination = createCoordinationStore(config);
  const logger = createLogger(config);
  const energyPriceService = createEnergyPriceService({
    store: coordination,
    config,
    logger,
    fetchImpl: config.energyPriceFetch || fetch,
    now: config.energyPriceNow || (() => new Date())
  });
  const wascoIntegration = createWascoIntegration(config, config.wascoFetch || fetch);
  const deleteStoredObjects = async (keys, requestId) => {
    const unique = [...new Set((keys || []).filter(Boolean))];
    const results = await Promise.allSettled(unique.map((key) => objectStorage.delete(key)));
    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed) logger.error({ requestId, errorCategory: "OBJECT_CLEANUP_FAILED", failedObjects: failed }, "storage.cleanup_failed");
  };
  const businessStorageKeys = async () => (await Promise.all([
    prisma.customerDocument.findMany({ select: { storageKey: true } }),
    prisma.quoteAsset.findMany({ select: { storageKey: true } }),
    prisma.serviceDocument.findMany({ select: { storageKey: true } })
  ])).flat().map((item) => item.storageKey).filter(Boolean);
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5, idleTimeoutMillis: 30000 });
  const loginLimiter = createFailureLimiter({ store: coordination, namespace: "login-account", limit: 5, windowMs: 15 * 60 * 1000 });
  const loginIpLimiter = createFailureLimiter({ store: coordination, namespace: "login-ip", limit: 20, windowMs: 15 * 60 * 1000 });
  const mfaLimiter = createFailureLimiter({ store: coordination, namespace: "mfa", limit: 5, windowMs: 10 * 60 * 1000 });
  const passwordChangeLimiter = createFailureLimiter({ store: coordination, namespace: "password", limit: 5, windowMs: 15 * 60 * 1000 });

  // Korte cache voor de per-request hervalidatie van de ingelogde gebruiker.
  // Uitgeschakeld in tests; wijzigingen via de API invalideren direct.
  const userCacheTtlMs = config.nodeEnv === "test" ? 0 : Number(process.env.AUTH_CACHE_TTL_MS || 30000);
  const getCachedUser = async (id) => userCacheTtlMs <= 0 ? null : coordination.getJson(`climature:auth-user:${id}`);
  const cacheUser = async (user) => {
    if (userCacheTtlMs <= 0 || !user) return;
    await coordination.setJson(`climature:auth-user:${user.id}`, user, userCacheTtlMs);
  };
  const invalidateUser = (id) => coordination.delete(`climature:auth-user:${id}`);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 12 } });

  if (config.isProduction) app.set("trust proxy", 1);

  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const supplied = String(req.get("x-request-id") || "");
    req.id = /^[a-zA-Z0-9_-]{8,100}$/.test(supplied) ? supplied : crypto.randomUUID();
    res.set("X-Request-ID", req.id);
    const startedAt = process.hrtime.bigint();
    res.once("finish", () => {
      logger.info({
        requestId: req.id,
        userId: req.session && req.session.user ? req.session.user.id : null,
        method: req.method,
        route: req.route && req.route.path ? req.route.path : req.path,
        statusCode: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6
      }, "request.completed");
    });
    next();
  });
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
  app.use(compression());
  const jsonSmall = express.json({ limit: "1mb" });
  const jsonLarge = express.json({ limit: "12mb" });
  // Alleen gecontroleerde beheerimport mag een grotere JSON-body sturen.
  const LARGE_JSON_PATHS = /^\/api\/backup\/import$/;
  app.use((req, res, next) => (LARGE_JSON_PATHS.test(req.path) ? jsonLarge : jsonSmall)(req, res, next));
  app.use(validateMutationEnvelope);
  ["id", "employeeId", "materialId", "taskId", "memberId", "equipmentId", "absenceId", "checklistId", "itemId", "collection", "type"].forEach((name) => {
    app.param(name, (req, _res, next, value) => {
      try { validateParam(value, name); next(); }
      catch (error) { next(error); }
    });
  });
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
    next();
  });

  // Globale per-IP limiter vóór de session-middleware, zodat misbruik geen
  // Postgres-sessiereads veroorzaakt. Uitgeschakeld in tests: de testsuite
  // vuurt honderden verzoeken vanaf één IP.
  const apiRateLimit = config.nodeEnv === "test" ? null : createRateLimiter({ store: coordination, namespace: "api", limit: Number(process.env.API_RATE_LIMIT || 600), windowMs: 60 * 1000 });
  const heavyRateLimit = config.nodeEnv === "test" ? null : createRateLimiter({ store: coordination, namespace: "heavy", limit: 5, windowMs: 60 * 1000 });
  const heavyLimitGuard = asyncHandler(async (req, res, next) => {
    if (heavyRateLimit && !await heavyRateLimit(`${req.ip}:${req.path}`)) return res.status(429).json({ error: "Te veel aanvragen. Probeer later opnieuw." });
    next();
  });
  app.use("/api", asyncHandler(async (req, res, next) => {
    if (apiRateLimit && !await apiRateLimit(req.ip)) return res.status(429).json({ error: "Te veel aanvragen. Probeer later opnieuw." });
    next();
  }));
  const sessionCookieName = config.isProduction ? "__Host-climature.sid" : "climature.sid";
  app.use(session({
    store: new PgSession({
      pool,
      tableName: "session",
      createTableIfMissing: false
    }),
    name: sessionCookieName,
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
      req.session.destroy(() => {
        res.clearCookie(sessionCookieName, { path: "/" });
        res.status(401).json({ error: "Sessie verlopen." });
      });
      return;
    }
    let current = await getCachedUser(req.session.user.id);
    if (!current) {
      current = await prisma.user.findUnique({ where: { id: req.session.user.id }, select: { id: true, username: true, role: true, active: true, employeeId: true } });
      await cacheUser(current);
    }
    if (!current || !current.active || current.role !== req.session.user.role) {
      req.session.destroy(() => {
        res.clearCookie(sessionCookieName, { path: "/" });
        res.status(401).json({ error: "Sessie is niet meer geldig." });
      });
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
    const testBypass = config.nodeEnv === "test" && !config.isProduction && !req.get("origin") && !supplied;
    if (testBypass || timingSafeEqual(supplied, csrfToken(req))) return next();
    res.status(403).json({ error: "Ongeldig beveiligingstoken." });
  });

  app.get("/api/health", asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    await Promise.all([coordination.health(), objectStorage.health()]);
    res.json({ ok: true, dependencies: { postgres: "ok", coordination: "ok", objectStorage: "ok" } });
  }));

  app.get("/api/auth/session", (req, res) => {
    // Geen token (en dus geen sessierij) voor anonieme bezoekers; het echte
    // token komt uit de login-respons en de login-POST is CSRF-exempt.
    const authenticated = Boolean(req.session && req.session.user);
    res.json({
      authenticated,
      user: authenticated ? req.session.user : null,
      csrfToken: authenticated ? csrfToken(req) : null,
      features: { hrPortalEnabled: Boolean(config.hrPortalEnabled) }
    });
  });

  app.post("/api/auth/login", authValidation.login, asyncHandler(async (req, res) => {
    const loginKey = `${req.ip}:${users.normalizeUsername(req.body.username)}`;
    if (!await loginLimiter.check(loginKey) || !await loginIpLimiter.check(req.ip)) {
      throw Object.assign(new Error("Te veel inlogpogingen. Probeer later opnieuw."), { status: 429 });
    }
    let user;
    try {
      user = await users.login(prisma, config, req.body.username, req.body.password);
      // Bewust geen loginIpLimiter.success: één geldige login mag het
      // per-IP spraybudget niet resetten.
      await loginLimiter.success(loginKey);
    } catch (error) {
      await loginLimiter.fail(loginKey);
      await loginIpLimiter.fail(req.ip);
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

  app.put("/api/auth/me", requireAuth, authValidation.updateProfile, asyncHandler(async (req, res) => {
    const key = req.session.user.id;
    if (!await passwordChangeLimiter.check(key)) throw Object.assign(new Error("Te veel pogingen. Probeer later opnieuw."), { status: 429 });
    let user;
    try {
      user = await users.updateMe(prisma, req.session.user, req.body || {});
      await passwordChangeLimiter.success(key);
    } catch (error) {
      if (error.status === 401) await passwordChangeLimiter.fail(key);
      throw error;
    }
    await invalidateUser(req.session.user.id);
    req.session.user = users.sessionUser(user);
    res.json({ user: req.session.user });
  }));

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    req.session.destroy((error) => {
      if (error) {
        res.status(500).json({ error: "Uitloggen mislukt." });
        return;
      }
      res.clearCookie(sessionCookieName, { path: "/" });
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
      keyVersion: encrypted.keyVersion,
      expiresAt: Date.now() + 10 * 60 * 1000
    };
    const uri = hrSecurity.authenticator.keyuri(user.username, "Climature HR", secret);
    res.json({ secret, qrCode: await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 240 }) });
  }));

  app.post("/api/hr/mfa/setup/confirm", ...hrAdmin, asyncHandler(async (req, res) => {
    const pending = req.session.pendingMfa;
    if (!pending || pending.expiresAt < Date.now()) throw Object.assign(new Error("MFA-inrichting is verlopen. Begin opnieuw."), { status: 400 });
    const secret = hrSecurity.decrypt(config, Buffer.from(pending.cipher, "base64"), Buffer.from(pending.iv, "base64"), Buffer.from(pending.tag, "base64"), pending.keyVersion || "v1").toString("utf8");
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
    if (!await mfaLimiter.check(key)) throw Object.assign(new Error("Te veel verificatiepogingen. Probeer later opnieuw."), { status: 429 });
    try {
      const user = await hrSecurity.verifyPassword(prisma, req.session.user, req.body.password);
      if (!user.mfaEnabledAt) throw Object.assign(new Error("Authenticator moet eerst worden ingesteld."), { status: 409 });
      const method = await hrSecurity.verifySecondFactor(prisma, config, user, req.body.code);
      req.session.hrAuthorizedAt = Date.now();
      req.session.hrLastActivityAt = Date.now();
      await mfaLimiter.success(key);
      await hrSecurity.audit(prisma, config, req, "session.elevated", "user", user.id, { method });
      res.json({ elevated: true });
    } catch (error) {
      await mfaLimiter.fail(key);
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
    const [contractObjects, qualificationObjects] = await Promise.all([
      prisma.employmentContract.findMany({ where: { employeeId: employee.id }, select: { storageKey: true } }),
      prisma.employeeQualification.findMany({ where: { employeeId: employee.id, evidenceStorageKey: { not: null } }, select: { evidenceStorageKey: true } })
    ]);
    await hrSecurity.audit(prisma, config, req, "employee.purged", "employee", employee.id, { employeeNumber: employee.employeeNumber });
    await prisma.employee.delete({ where: { id: employee.id } });
    await deleteStoredObjects(contractObjects.concat(qualificationObjects).map((item) => item.storageKey || item.evidenceStorageKey), req.id);
    res.json({ ok: true });
  }));

  app.post("/api/hr/employees/:id/contracts", ...hrProtected, upload.single("file"), asyncHandler(async (req, res) => {
    const item = await hr.createContract(prisma, config, objectStorage, req.session.user.id, req.params.id, req.body || {}, req.file);
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
    const item = await hr.rescanContract(prisma, config, objectStorage, existing.id);
    await hrSecurity.audit(prisma, config, req, "contract.rescanned", "employee", req.params.employeeId, { contractId: item.id, scanStatus: item.scanStatus });
    res.json({ item });
  }));

  app.get("/api/hr/employees/:employeeId/contracts/:id/download", ...hrProtected, asyncHandler(async (req, res) => {
    const file = await hr.contractFile(prisma, config, objectStorage, req.params.employeeId, req.params.id);
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
    const item = await workforce.saveEmployeeQualification(prisma, config, objectStorage, req.session.user.id, req.params.id, null, req.body || {}, req.file);
    await hrSecurity.audit(prisma, config, req, "qualification.created", "employee", req.params.id, { qualificationId: item.id, definitionCode: item.definition.code, scanStatus: item.evidenceScanStatus });
    res.status(201).json({ item });
  }));

  app.put("/api/hr/employees/:employeeId/qualifications/:id", ...hrProtected, upload.single("file"), asyncHandler(async (req, res) => {
    const item = await workforce.saveEmployeeQualification(prisma, config, objectStorage, req.session.user.id, req.params.employeeId, req.params.id, req.body || {}, req.file);
    await hrSecurity.audit(prisma, config, req, "qualification.updated", "employee", req.params.employeeId, { qualificationId: item.id, definitionCode: item.definition.code, scanStatus: item.evidenceScanStatus });
    res.json({ item });
  }));

  app.patch("/api/hr/employees/:employeeId/qualifications/:id/archive", ...hrProtected, asyncHandler(async (req, res) => {
    await workforce.archiveQualification(prisma, req.params.employeeId, req.params.id);
    await hrSecurity.audit(prisma, config, req, "qualification.archived", "employee", req.params.employeeId, { qualificationId: req.params.id });
    res.json({ ok: true });
  }));

  app.post("/api/hr/employees/:employeeId/qualifications/:id/rescan", ...hrProtected, asyncHandler(async (req, res) => {
    const item = await workforce.rescanQualification(prisma, config, objectStorage, req.params.employeeId, req.params.id);
    await hrSecurity.audit(prisma, config, req, "qualification.rescanned", "employee", req.params.employeeId, { qualificationId: item.id, scanStatus: item.evidenceScanStatus });
    res.json({ item });
  }));

  app.get("/api/hr/employees/:employeeId/qualifications/:id/download", ...hrProtected, asyncHandler(async (req, res) => {
    const file = await workforce.qualificationFile(prisma, config, objectStorage, req.params.employeeId, req.params.id);
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

  registerProjectRoutes({ app, asyncHandler, config, prisma, requireRole });

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
    const role = req.session.user.role;
    const [settings, counters, portalCounts] = await Promise.all([data.getSettings(prisma), data.getCounters(prisma), dashboardData.portalCounts(prisma, req.session.user)]);
    const roleSettings = role === "admin" ? settings : settingsForRole(settings, role);
    res.json({ data: {
      user: req.session.user,
      role,
      permissions: permissionsForRole(role),
      settings: roleSettings,
      counters: countersForRole(counters, role),
      dashboard: { portalCounts },
      references: { apiVersion: 2 }
    } });
  }));

  app.get("/api/dashboard/:type", requireAuth, asyncHandler(async (req, res) => {
    res.json(await dashboardData.dashboard(prisma, req.session.user, req.params.type));
  }));

  app.get("/api/energy-prices", requireRole("admin"), asyncHandler(async (req, res) => {
    try {
      res.json(await energyPriceService.get({ force: req.query.refresh === "1" }));
    } catch (error) {
      logger.warn({ requestId: req.id, errorCategory: error && (error.code || error.name) || "ENERGY_PRICE_ERROR", source: "EnergyZero" }, "energy_prices.unavailable");
      res.status(502).json({
        error: "Actuele energieprijzen zijn tijdelijk niet beschikbaar.",
        code: error && error.code || "ENERGY_PRICES_UNAVAILABLE"
      });
    }
  }));

  app.get("/api/wasco/status", requireRole("admin", "execution"), (_req, res) => {
    res.json(wascoIntegration.status());
  });

  app.get("/api/wasco/products", requireRole("admin", "execution"), asyncHandler(async (req, res) => {
    res.set("Cache-Control", "no-store, private");
    res.json(await wascoIntegration.searchProducts({ query: req.query.q, category: req.query.category, limit: req.query.limit }));
  }));

  app.post("/api/wasco/availability", requireRole("admin", "execution"), asyncHandler(async (req, res) => {
    res.json(await wascoIntegration.availability(req.body && req.body.skus));
  }));

  app.post("/api/wasco/orders", requireRole("admin", "execution"), asyncHandler(async (req, res) => {
    const result = await wascoIntegration.createOrder(req.body || {});
    logger.info({ requestId: req.id, userId: req.session.user.id, mode: result.mode, submitted: result.submitted, orderNumber: result.orderNumber }, "wasco.order_created");
    res.status(result.submitted ? 201 : 200).json(result);
  }));

  app.get("/api/reports/summary", requireRole("admin", "finance"), asyncHandler(async (req, res) => {
    res.json(await reportData.summary(prisma, req.session.user, req.query || {}));
  }));

  app.get("/api/reports/export", requireRole("admin", "finance"), asyncHandler(async (req, res) => {
    const csv = await reportData.exportCsv(prisma, req.session.user, req.query || {});
    const dataset = String(req.query.dataset || "export").replace(/[^a-z-]/g, "");
    res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="climature-${dataset}-${req.query.from}_${req.query.to}.csv"`, "Cache-Control": "no-store, private" });
    res.send(csv);
  }));

  registerPaymentRoutes({ app, asyncHandler, prisma, requireRole });

  registerInventoryRoutes({ app, asyncHandler, config, prisma, requireRole, scanFile, upload });

  registerServiceRoutes({ app, asyncHandler, config, objectStorage, prisma, requireRole, upload });

  app.get("/api/users", requireRole("admin"), asyncHandler(async (_req, res) => {
    res.json({ items: await users.listUsers(prisma) });
  }));

  app.post("/api/users", requireRole("admin"), asyncHandler(async (req, res) => {
    res.json({ item: await users.createUser(prisma, req.body || {}) });
  }));

  app.put("/api/users/:id", requireRole("admin"), asyncHandler(async (req, res) => {
    const item = await users.updateUser(prisma, req.params.id, req.body || {});
    await invalidateUser(req.params.id);
    res.json({ item });
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

  app.post("/api/quotes/:id/invoice", requireRole("admin", "finance"), asyncHandler(async (req, res) => {
    const result = await data.createInvoiceFromQuote(prisma, req.params.id);
    res.status(result.created ? 201 : 200).json(result);
  }));

  app.get("/api/collections/:collection", requireAuth, asyncHandler(async (req, res) => {
    const collection = requireCollection(req);
    if (!canReadCollection(req.session.user, collection)) {
      res.status(403).json({ error: "Geen toegang." });
      return;
    }
    const where = await authorization.collectionWhere(prisma, req.session.user, collection);
    const page = await data.listCollectionPage(prisma, collection, req.query || {}, where);
    page.items = collectionForRole(collection, page.items, req.session.user.role);
    res.json(page);
  }));

  const pagedDomainDependencies = { app, asyncHandler, prisma, requireAuth };
  registerCustomerRoutes({ ...pagedDomainDependencies, project: (items, role) => collectionForRole("customers", items, role) });
  registerQuoteRoutes({ ...pagedDomainDependencies, project: (items, role) => collectionForRole("quotes", items, role) });
  registerInvoiceRoutes({ ...pagedDomainDependencies, project: (items, role) => collectionForRole("invoices", items, role) });
  registerInstallationRoutes({ ...pagedDomainDependencies, project: (items, role) => collectionForRole("installations", items, role) });

  for (const [resource, collection] of Object.entries(RESOURCE_COLLECTIONS)) {
    app.get(`/api/${resource}`, requireAuth, asyncHandler(async (req, res) => {
      if (!canReadCollection(req.session.user, collection)) return res.status(403).json({ error: "Geen toegang." });
      const where = await authorization.collectionWhere(prisma, req.session.user, collection);
      const page = await data.listCollectionPage(prisma, collection, req.query || {}, where);
      page.items = collectionForRole(collection, page.items, req.session.user.role);
      res.json(page);
    }));
  }

  app.post("/api/customers/:id/documents", requireRole("admin", "crm"), upload.single("file"), asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!customer) throw Object.assign(new Error("Klant niet gevonden."), { status: 404 });
    const metadata = validateFile(req.file, ["pdf"]);
    const scan = await scanFile(config, req.file.buffer);
    const key = storageKey("customer-documents");
    await objectStorage.put(key, req.file.buffer, metadata);
    try {
      const item = await prisma.customerDocument.create({ data: { customerId: customer.id, fileName: metadata.fileName, mimeType: metadata.mimeType, size: metadata.size, sha256: metadata.sha256, scanStatus: "clean", scanMessage: scan.message || "", storageKey: key } });
      res.status(201).json({ item: { id: item.id, customerId: item.customerId, fileName: item.fileName, mimeType: item.mimeType, size: item.size, scanStatus: item.scanStatus, createdAt: item.createdAt, updatedAt: item.updatedAt } });
    } catch (error) {
      await objectStorage.delete(key).catch(() => {});
      throw error;
    }
  }));

  app.get("/api/documents/:id/download", requireRole("admin", "crm", "installer"), asyncHandler(async (req, res) => {
    const scope = await authorization.collectionWhere(prisma, req.session.user, "customerDocuments");
    const item = await prisma.customerDocument.findFirst({ where: scope ? { AND: [{ id: req.params.id }, scope] } : { id: req.params.id } });
    if (!item) throw Object.assign(new Error("Document niet gevonden."), { status: 404 });
    if (item.scanStatus !== "clean" && item.storageKey) throw Object.assign(new Error("Document is nog niet veilig vrijgegeven."), { status: 423 });
    const content = await objectStorage.get(item.storageKey);
    if (!content.length || content.subarray(0, 5).toString("ascii") !== "%PDF-") throw Object.assign(new Error("Document is beschadigd."), { status: 500 });
    const checksum = crypto.createHash("sha256").update(content).digest("hex");
    if (item.sha256 && checksum !== item.sha256) throw Object.assign(new Error("Integriteitscontrole van document is mislukt."), { status: 500 });
    const disposition = req.query.disposition === "inline" ? "inline" : "attachment";
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(item.fileName)}`, "Content-Length": String(content.length), "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" });
    res.send(content);
  }));

  const quoteAssetManager = requireRole("admin", "sales");
  app.get("/api/quotes/:id/assets", quoteAssetManager, asyncHandler(async (req, res) => {
    const quote = await prisma.quote.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!quote) throw Object.assign(new Error("Offerte niet gevonden."), { status: 404 });
    const items = await prisma.quoteAsset.findMany({
      where: { quoteId: quote.id },
      select: { id: true, quoteId: true, role: true, fileName: true, mimeType: true, size: true, width: true, height: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    });
    res.json({ items });
  }));

  app.post("/api/quotes/:id/assets", quoteAssetManager, upload.single("file"), asyncHandler(async (req, res) => {
    if (!req.file) throw Object.assign(new Error("Kies eerst een afbeelding."), { status: 400 });
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(req.file.mimetype)) throw Object.assign(new Error("Gebruik een JPG-, PNG- of WebP-afbeelding."), { status: 400 });
    validateFile(req.file, ["jpeg", "png", "webp"]);
    const scan = await scanFile(config, req.file.buffer);
    const quote = await prisma.quote.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!quote) throw Object.assign(new Error("Offerte niet gevonden."), { status: 404 });
    let content;
    try {
      content = await sharp(req.file.buffer, { failOn: "error", limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 88 })
        .toBuffer();
    } catch (_error) {
      throw Object.assign(new Error("De afbeelding is beschadigd of heeft een ongeldig formaat."), { status: 400 });
    }
    const metadata = await sharp(content).metadata();
    const key = storageKey("quote-assets");
    const sha256 = crypto.createHash("sha256").update(content).digest("hex");
    await objectStorage.put(key, content, { mimeType: "image/webp", sha256 });
    let item;
    try {
      item = await prisma.quoteAsset.create({ data: {
        quoteId: quote.id, role: "product", fileName: String(req.file.originalname || "offerte-afbeelding.webp").replace(/[\\/\0\r\n]/g, "_").slice(0, 240),
        mimeType: "image/webp", size: content.length, width: metadata.width || 0, height: metadata.height || 0,
        sha256, scanStatus: "clean", scanMessage: scan.message || "", storageKey: key
      }});
    } catch (error) { await objectStorage.delete(key).catch(() => {}); throw error; }
    res.status(201).json({ item: { id: item.id, quoteId: item.quoteId, role: item.role, fileName: item.fileName, mimeType: item.mimeType, size: item.size, width: item.width, height: item.height, createdAt: item.createdAt } });
  }));

  app.get("/api/quote-assets/:id/content", quoteAssetManager, asyncHandler(async (req, res) => {
    const item = await prisma.quoteAsset.findUnique({ where: { id: req.params.id } });
    if (!item || item.scanStatus !== "clean" && item.storageKey) throw Object.assign(new Error("Afbeelding niet gevonden."), { status: 404 });
    const content = await objectStorage.get(item.storageKey);
    if (item.sha256 && crypto.createHash("sha256").update(content).digest("hex") !== item.sha256) throw Object.assign(new Error("Integriteitscontrole van afbeelding is mislukt."), { status: 500 });
    res.set({ "Content-Type": item.mimeType, "Content-Length": String(content.length), "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" });
    res.send(content);
  }));

  app.delete("/api/quote-assets/:id", quoteAssetManager, asyncHandler(async (req, res) => {
    const item = await prisma.quoteAsset.delete({ where: { id: req.params.id } });
    await deleteStoredObjects([item.storageKey], req.id);
    res.json({ ok: true });
  }));

  app.post("/api/collections/:collection", requireAuth, (req, res, next) => {
    const collection = requireCollection(req);
    if (!canWriteCollection(req.session.user, collection)) return res.status(403).json({ error: "Geen toegang.", code: "FORBIDDEN" });
    next();
  }, validateCollectionWrite, asyncHandler(async (req, res) => {
    const collection = requireCollection(req);
    if (collection === "customerDocuments") throw Object.assign(new Error("Gebruik de beveiligde documentuploadroute."), { status: 400 });
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
    let storageKeysToDelete = [];
    if (collection === "customerDocuments") {
      const existing = await prisma.customerDocument.findUnique({ where: { id: req.params.id }, select: { storageKey: true } });
      storageKeysToDelete = existing && existing.storageKey ? [existing.storageKey] : [];
    } else if (collection === "customers") {
      storageKeysToDelete = (await prisma.customerDocument.findMany({ where: { customerId: req.params.id }, select: { storageKey: true } })).map((item) => item.storageKey);
    } else if (collection === "quotes") {
      storageKeysToDelete = (await prisma.quoteAsset.findMany({ where: { quoteId: req.params.id }, select: { storageKey: true } })).map((item) => item.storageKey);
    }
    await data.remove(prisma, collection, req.params.id);
    await deleteStoredObjects(storageKeysToDelete, req.id);
    res.json({ ok: true });
  }));

  app.put("/api/installations/:id/workorder", requireRole("admin", "execution", "installer"), asyncHandler(async (req, res) => {
    await authorization.assertInstallationAccess(prisma, req.session.user, req.params.id);
    res.json({ item: await data.saveInstallationWorkOrder(prisma, req.params.id, req.body || {}) });
  }));

  app.get("/api/backup/export", requireRole("admin"), heavyLimitGuard, asyncHandler(async (_req, res) => {
    res.json(await data.exportData(prisma));
  }));

  app.post("/api/backup/import", requireRole("admin"), heavyLimitGuard, asyncHandler(async (req, res) => {
    const previousKeys = await businessStorageKeys();
    await data.importData(prisma, req.body);
    await projects.ensureProjectsForExistingInstallations(prisma);
    const retainedKeys = new Set(await businessStorageKeys());
    await deleteStoredObjects(previousKeys.filter((key) => !retainedKeys.has(key)), req.id);
    res.json({ data: await data.bootstrap(prisma) });
  }));

  app.post("/api/admin/reset", requireRole("admin"), heavyLimitGuard, asyncHandler(async (req, res) => {
    const previousKeys = await businessStorageKeys();
    const reset = await data.resetData(prisma);
    await deleteStoredObjects(previousKeys, req.id);
    res.json({ data: reset });
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
    if (error && error.type === "entity.too.large") return res.status(413).json({ error: "De aanvraag is te groot." });
    const uploadTooLarge = error && error.code === "LIMIT_FILE_SIZE";
    const status = uploadTooLarge ? 413 : (error.status || 500);
    const message = uploadTooLarge ? "Bestand is groter dan 8 MB." : (status >= 500 ? "Er ging iets mis op de server." : error.message);
    // Alleen stack/melding loggen: Prisma-errors kunnen queryparameters
    // met persoonsgegevens bevatten.
    if (status >= 500) logger.error({ requestId: _req.id, userId: _req.session && _req.session.user ? _req.session.user.id : null, route: _req.path, statusCode: status, errorCategory: error && (error.code || error.name) || "Error" }, "request.failed");
    res.status(status).json({
      error: message,
      code: status >= 500 ? "INTERNAL_ERROR" : (error.code || errorCodeForStatus(status)),
      requestId: _req.id,
      ...(status < 500 && Array.isArray(error.details) ? { details: error.details } : {})
    });
  });

  app.locals.pool = pool;
  app.locals.objectStorage = objectStorage;
  app.locals.coordination = coordination;
  app.locals.energyPriceService = energyPriceService;
  app.locals.wascoIntegration = wascoIntegration;
  app.locals.logger = logger;
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
  await data.ensureDefaults(prisma);
  await workforce.ensureDefaults(prisma);
  await projects.ensureProjectsForExistingInstallations(prisma);
  const server = app.listen(config.port, () => {
    app.locals.logger.info({ port: config.port }, "server.started");
  });
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.locals.logger.info({ signal }, "server.shutdown_started");
    const forced = setTimeout(() => {
      app.locals.logger.error({ signal }, "server.shutdown_forced");
      if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    }, 25_000);
    forced.unref();
    await new Promise((resolve) => { server.close(resolve); });
    await Promise.allSettled([
      app.locals.coordination.close(),
      app.locals.objectStorage.close(),
      app.locals.pool.end(),
      prisma.$disconnect()
    ]);
    clearTimeout(forced);
    app.locals.logger.info({ signal }, "server.shutdown_complete");
  };
  process.once("SIGTERM", () => { shutdown("SIGTERM").catch(() => { process.exitCode = 1; }); });
  process.once("SIGINT", () => { shutdown("SIGINT").catch(() => { process.exitCode = 1; }); });
  return { app, server, shutdown };
}

if (require.main === module) {
  main().catch(async (error) => {
    process.stderr.write(`${error.message || error}\n`);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = { createApp };
