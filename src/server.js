"use strict";

const path = require("path");
const bcrypt = require("bcrypt");
const express = require("express");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const helmet = require("helmet");
const pg = require("pg");
const { loadConfig } = require("./config");
const { prisma } = require("./prisma");
const data = require("./data");

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: "Niet ingelogd." });
}

function requireCollection(req) {
  const collection = req.params.collection;
  if (!data.COLLECTIONS.includes(collection)) {
    throw Object.assign(new Error("Onbekende collectie."), { status: 404 });
  }
  return collection;
}

function createApp(config = loadConfig()) {
  const app = express();
  const pool = new pg.Pool({ connectionString: config.databaseUrl });

  if (config.isProduction) app.set("trust proxy", 1);

  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false, hsts: config.isProduction }));
  app.use(express.json({ limit: "2mb" }));
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
    name: "climature.sid",
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.isProduction,
      maxAge: 1000 * 60 * 60 * 10
    }
  }));

  app.get("/api/health", asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  }));

  app.get("/api/auth/session", (req, res) => {
    res.json({ authenticated: Boolean(req.session && req.session.user), user: req.session.user || null });
  });

  app.post("/api/auth/login", asyncHandler(async (req, res) => {
    const username = String(req.body.username || "");
    const password = String(req.body.password || "");
    const validUsername = username === config.adminUsername;
    const validPassword = await bcrypt.compare(password, config.adminPasswordHash);
    if (!validUsername || !validPassword) {
      res.status(401).json({ error: "Inlognaam of wachtwoord is onjuist." });
      return;
    }
    req.session.regenerate((error) => {
      if (error) {
        res.status(500).json({ error: "Sessie kon niet worden aangemaakt." });
        return;
      }
      req.session.user = { username };
      res.json({ authenticated: true, user: req.session.user });
    });
  }));

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    req.session.destroy((error) => {
      if (error) {
        res.status(500).json({ error: "Uitloggen mislukt." });
        return;
      }
      res.clearCookie("climature.sid");
      res.json({ authenticated: false });
    });
  });

  app.get("/api/bootstrap", requireAuth, asyncHandler(async (_req, res) => {
    res.json({ data: await data.bootstrap(prisma) });
  }));

  app.get("/api/settings", requireAuth, asyncHandler(async (_req, res) => {
    res.json({ item: await data.getSettings(prisma) });
  }));

  app.put("/api/settings", requireAuth, asyncHandler(async (req, res) => {
    res.json({ item: await data.saveSettings(prisma, req.body || {}) });
  }));

  app.post("/api/advice-assumptions/refresh", requireAuth, asyncHandler(async (_req, res) => {
    res.json({ item: await data.refreshAdviceAssumptions(prisma) });
  }));

  app.post("/api/counters/:type/next", requireAuth, asyncHandler(async (req, res) => {
    res.json({ value: await data.nextNumber(prisma, req.params.type) });
  }));

  app.get("/api/counters/:type/peek", requireAuth, asyncHandler(async (req, res) => {
    res.json({ value: await data.peekNumber(prisma, req.params.type) });
  }));

  app.get("/api/collections/:collection", requireAuth, asyncHandler(async (req, res) => {
    const collection = requireCollection(req);
    res.json({ items: await data.listCollection(prisma, collection) });
  }));

  app.post("/api/collections/:collection", requireAuth, asyncHandler(async (req, res) => {
    const collection = requireCollection(req);
    res.json({ item: await data.upsert(prisma, collection, req.body || {}) });
  }));

  app.put("/api/collections/:collection", requireAuth, asyncHandler(async (req, res) => {
    const collection = requireCollection(req);
    res.json({ data: await data.replaceCollection(prisma, collection, req.body.items || []) });
  }));

  app.delete("/api/collections/:collection/:id", requireAuth, asyncHandler(async (req, res) => {
    const collection = requireCollection(req);
    await data.remove(prisma, collection, req.params.id);
    res.json({ ok: true });
  }));

  app.get("/api/backup/export", requireAuth, asyncHandler(async (_req, res) => {
    res.json(await data.exportData(prisma));
  }));

  app.post("/api/backup/import", requireAuth, asyncHandler(async (req, res) => {
    res.json({ data: await data.importData(prisma, req.body) });
  }));

  app.post("/api/admin/reset", requireAuth, asyncHandler(async (_req, res) => {
    res.json({ data: await data.resetData(prisma) });
  }));

  app.use(express.static(path.join(__dirname, ".."), {
    extensions: ["html"],
    setHeaders(res, filePath) {
      if (filePath.endsWith("service-worker.js")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    }
  }));

  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "API-route niet gevonden." });
      return;
    }
    next();
  });

  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    const message = status >= 500 ? "Er ging iets mis op de server." : error.message;
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
