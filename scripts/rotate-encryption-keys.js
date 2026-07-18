"use strict";

const { loadConfig } = require("../src/config");
const { prisma } = require("../src/prisma");
const security = require("../src/hr-security");
const { createObjectStorage } = require("../src/infrastructure/object-storage");
const { storageKey } = require("../src/infrastructure/object-storage/file-policy");

function argument(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function rotatedFields(config, row, fields, oldVersion) {
  const data = {};
  for (const prefix of fields) {
    const cipher = row[`${prefix}Cipher`];
    if (!cipher) continue;
    const plaintext = security.decrypt(config, cipher, row[`${prefix}Iv`], row[`${prefix}Tag`], oldVersion);
    const encrypted = security.encrypt(config, plaintext);
    data[`${prefix}Cipher`] = encrypted.cipher;
    data[`${prefix}Iv`] = encrypted.iv;
    data[`${prefix}Tag`] = encrypted.tag;
  }
  return data;
}

async function rotateModel(config, options) {
  let cursor;
  let count = 0;
  for (;;) {
    const rows = await prisma[options.model].findMany({
      where: options.where(config.hrKeyVersion),
      orderBy: { id: "asc" },
      take: options.batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;
    if (!options.dryRun) {
      await prisma.$transaction(rows.map((row) => {
        const oldVersion = String(row[options.versionField] || "v1");
        const data = rotatedFields(config, row, options.fields, oldVersion);
        data[options.versionField] = config.hrKeyVersion;
        return prisma[options.model].update({ where: { id: row.id }, data });
      }));
    }
    count += rows.length;
  }
  return count;
}

async function rotateStorageModel(config, objectStorage, options) {
  let cursor;
  let count = 0;
  for (;;) {
    const rows = await prisma[options.model].findMany({
      where: options.where(config.hrKeyVersion), orderBy: { id: "asc" }, take: options.batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;
    for (const row of rows) {
      if (!options.dryRun) {
        const data = rotatedFields(config, row, options.fields || [], String(row[options.versionField] || "v1"));
        let newKey = "";
        const oldKey = row[options.storageField];
        if (oldKey) {
          const plaintext = security.decryptFileEnvelope(config, await objectStorage.get(oldKey), row[options.versionField]);
          const encrypted = security.encryptFileEnvelope(config, plaintext);
          newKey = storageKey(options.namespace(row));
          await objectStorage.put(newKey, encrypted.content, { mimeType: "application/octet-stream" });
          data[options.storageField] = newKey;
        }
        data[options.versionField] = config.hrKeyVersion;
        try { await prisma[options.model].update({ where: { id: row.id }, data }); }
        catch (error) { if (newKey) await objectStorage.delete(newKey).catch(() => {}); throw error; }
        if (newKey) await objectStorage.delete(oldKey).catch(() => {});
      }
      count += 1;
    }
  }
  return count;
}

async function main() {
  const config = loadConfig();
  security.encryptionKey(config, config.hrKeyVersion);
  const dryRun = process.argv.includes("--dry-run");
  const batchSize = Math.max(1, Math.min(500, Number(argument("batch-size", 100)) || 100));
  const objectStorage = createObjectStorage(config);
  const jobs = [
    { label: "mfa", model: "user", versionField: "mfaKeyVersion", fields: ["mfaSecret"], where: (active) => ({ mfaSecretCipher: { not: null }, mfaKeyVersion: { not: active } }) },
    { label: "employee-private", model: "employee", versionField: "privateDataKeyVersion", fields: ["privateData"], where: (active) => ({ privateDataCipher: { not: null }, privateDataKeyVersion: { not: active } }) },
    { label: "employee-notes", model: "employeeNote", versionField: "keyVersion", fields: ["body"], where: (active) => ({ keyVersion: { not: active } }) },
    { label: "checklist-notes", model: "employeeChecklistItem", versionField: "keyVersion", fields: ["note"], where: (active) => ({ noteCipher: { not: null }, keyVersion: { not: active } }) }
  ];
  for (const job of jobs) {
    const count = await rotateModel(config, { ...job, dryRun, batchSize });
    process.stdout.write(`${job.label}: ${count} record(s) ${dryRun ? "would be rotated" : "rotated"}\n`);
  }
  const storageJobs = [
    { label: "contracts", model: "employmentContract", versionField: "keyVersion", storageField: "storageKey", fields: [], where: (active) => ({ keyVersion: { not: active } }), namespace: (row) => `hr/contracts/${row.employeeId}` },
    { label: "qualifications", model: "employeeQualification", versionField: "keyVersion", storageField: "evidenceStorageKey", fields: ["note"], where: (active) => ({ keyVersion: { not: active }, OR: [{ noteCipher: { not: null } }, { evidenceStorageKey: { not: null } }] }), namespace: (row) => `hr/qualifications/${row.employeeId}` }
  ];
  for (const job of storageJobs) {
    const count = await rotateStorageModel(config, objectStorage, { ...job, dryRun, batchSize });
    process.stdout.write(`${job.label}: ${count} record(s) ${dryRun ? "would be rotated" : "rotated"}\n`);
  }
  await objectStorage.close();
  process.stdout.write(`active key version: ${config.hrKeyVersion}\n`);
}

main().catch((error) => {
  process.stderr.write(`Key rotation failed: ${String(error && error.message || error)}\n`);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect().catch(() => {});
});
