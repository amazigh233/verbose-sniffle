"use strict";

const { loadConfig } = require("../src/config");
const { prisma } = require("../src/prisma");
const { createObjectStorage } = require("../src/infrastructure/object-storage");

async function main() {
  const config = loadConfig();
  const storage = createObjectStorage(config);
  try {
    const groups = await Promise.all([
      prisma.customerDocument.findMany({ select: { storageKey: true } }),
      prisma.quoteAsset.findMany({ select: { storageKey: true } }),
      prisma.serviceDocument.findMany({ select: { storageKey: true } }),
      prisma.employmentContract.findMany({ select: { storageKey: true } }),
      prisma.employeeQualification.findMany({ where: { evidenceStorageKey: { not: null } }, select: { evidenceStorageKey: true } })
    ]);
    const referenced = new Set(groups.flat().map((item) => item.storageKey || item.evidenceStorageKey).filter(Boolean));
    const orphaned = (await storage.list()).filter((key) => !referenced.has(key));
    process.stdout.write(`${orphaned.length} orphaned object(s) found.\n`);
    if (!process.argv.includes("--apply")) {
      process.stdout.write("Dry run; use --apply to delete these objects.\n");
      return;
    }
    for (const key of orphaned) await storage.delete(key);
    process.stdout.write(`${orphaned.length} orphaned object(s) deleted.\n`);
  } finally {
    await storage.close().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((error) => { process.stderr.write(`Object cleanup failed: ${String(error && error.message || error)}\n`); process.exitCode = 1; });
