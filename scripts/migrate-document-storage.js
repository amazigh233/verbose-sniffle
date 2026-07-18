"use strict";

const crypto = require("crypto");
const { loadConfig } = require("../src/config");
const { prisma } = require("../src/prisma");
const { createObjectStorage } = require("../src/infrastructure/object-storage");
const { scanFile, storageKey } = require("../src/infrastructure/object-storage/file-policy");

const batchSize = Math.max(1, Math.min(250, Number((process.argv.find((item) => item.startsWith("--batch-size=")) || "").split("=")[1]) || 50));
const dryRun = process.argv.includes("--dry-run");

function contentFor(job, row) {
  if (job === "customer-documents") return Buffer.from(String(row.content || ""), "base64");
  return Buffer.from(row.content || []);
}

async function rowsFor(job) {
  if (job === "customer-documents") return prisma.$queryRaw`SELECT "id", "content", "mimeType" FROM "CustomerDocument" WHERE "storageKey" IS NULL AND "content" IS NOT NULL LIMIT ${batchSize}`;
  if (job === "quote-assets") return prisma.$queryRaw`SELECT "id", "content", "mimeType" FROM "QuoteAsset" WHERE "storageKey" IS NULL AND "content" IS NOT NULL LIMIT ${batchSize}`;
  return prisma.$queryRaw`SELECT "id", "content", "mimeType" FROM "ServiceDocument" WHERE "storageKey" IS NULL AND "content" IS NOT NULL LIMIT ${batchSize}`;
}

async function persist(job, row, key, sha256, scanMessage) {
  if (job === "customer-documents") return prisma.$executeRaw`UPDATE "CustomerDocument" SET "storageKey" = ${key}, "sha256" = ${sha256}, "scanStatus" = 'clean', "scanMessage" = ${scanMessage}, "content" = NULL WHERE "id" = ${row.id} AND "storageKey" IS NULL`;
  if (job === "quote-assets") return prisma.$executeRaw`UPDATE "QuoteAsset" SET "storageKey" = ${key}, "sha256" = ${sha256}, "scanStatus" = 'clean', "scanMessage" = ${scanMessage}, "content" = NULL WHERE "id" = ${row.id} AND "storageKey" IS NULL`;
  return prisma.$executeRaw`UPDATE "ServiceDocument" SET "storageKey" = ${key}, "sha256" = ${sha256}, "scanStatus" = 'clean', "scanMessage" = ${scanMessage}, "content" = NULL WHERE "id" = ${row.id} AND "storageKey" IS NULL`;
}

async function migrateJob(config, storage, job) {
  let migrated = 0;
  for (;;) {
    const rows = await rowsFor(job);
    if (!rows.length) break;
    if (dryRun) return rows.length;
    for (const row of rows) {
      const content = contentFor(job, row);
      if (!content.length) throw new Error(`${job} contains an empty legacy object`);
      const scan = await scanFile(config, content);
      const sha256 = crypto.createHash("sha256").update(content).digest("hex");
      const key = storageKey(job);
      await storage.put(key, content, { mimeType: row.mimeType, sha256 });
      try {
        const updated = await persist(job, row, key, sha256, scan.message || "");
        if (!updated) await storage.delete(key);
        else migrated += 1;
      } catch (error) { await storage.delete(key).catch(() => {}); throw error; }
    }
  }
  return migrated;
}

async function main() {
  const config = loadConfig();
  const storage = createObjectStorage(config);
  try {
    for (const job of ["customer-documents", "quote-assets", "service-documents"]) {
      const count = await migrateJob(config, storage, job);
      process.stdout.write(`${job}: ${count} record(s) ${dryRun ? "pending" : "migrated"}\n`);
    }
  } finally { await storage.close(); }
}

main().catch((error) => {
  process.stderr.write(`Document migration failed: ${String(error && error.message || error)}\n`);
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect().catch(() => {}); });
