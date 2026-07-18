"use strict";

const { Pool } = require("pg");
const { loadConfig } = require("../src/config");
const security = require("../src/hr-security");
const { createObjectStorage } = require("../src/infrastructure/object-storage");
const { storageKey } = require("../src/infrastructure/object-storage/file-policy");

async function migrateRows(pool, objectStorage, config, options) {
  const result = await pool.query(options.selectSql);
  let migrated = 0;
  for (const row of result.rows) {
    const plaintext = security.decrypt(config, row.cipher, row.iv, row.tag, row.keyVersion);
    const scan = await security.scanWithClamav(config, plaintext);
    if (!scan.clean) throw new Error(`${options.label} ${row.id} is niet veilig bevonden: ${scan.message || "scan mislukt"}`);
    const encrypted = security.encryptFileEnvelope(config, plaintext);
    const key = storageKey(options.namespace(row));
    await objectStorage.put(key, encrypted.content, { mimeType: "application/octet-stream" });
    try {
      await pool.query(options.updateSql, [key, encrypted.keyVersion, row.id]);
    } catch (error) {
      await objectStorage.delete(key).catch(() => {});
      throw error;
    }
    migrated += 1;
  }
  process.stdout.write(`${options.label}: ${migrated} migrated\n`);
}

async function main() {
  const config = loadConfig();
  const pool = new Pool({ connectionString: config.databaseUrl });
  const objectStorage = createObjectStorage(config);
  try {
    await migrateRows(pool, objectStorage, config, {
      label: "employment contracts",
      selectSql: 'SELECT id, "employeeId", "fileCipher" AS cipher, "fileIv" AS iv, "fileTag" AS tag, "keyVersion" FROM "EmploymentContract" WHERE "storageKey" IS NULL ORDER BY id',
      updateSql: 'UPDATE "EmploymentContract" SET "storageKey" = $1, "keyVersion" = $2 WHERE id = $3 AND "storageKey" IS NULL',
      namespace: (row) => `hr/contracts/${row.employeeId}`
    });
    await migrateRows(pool, objectStorage, config, {
      label: "qualification evidence",
      selectSql: 'SELECT id, "employeeId", "evidenceCipher" AS cipher, "evidenceIv" AS iv, "evidenceTag" AS tag, "keyVersion" FROM "EmployeeQualification" WHERE "evidenceCipher" IS NOT NULL AND "evidenceStorageKey" IS NULL ORDER BY id',
      updateSql: 'UPDATE "EmployeeQualification" SET "evidenceStorageKey" = $1, "keyVersion" = $2 WHERE id = $3 AND "evidenceStorageKey" IS NULL',
      namespace: (row) => `hr/qualifications/${row.employeeId}`
    });
  } finally {
    await objectStorage.close().catch(() => {});
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  process.stderr.write(`HR document migration failed: ${String(error && error.message || error)}\n`);
  process.exitCode = 1;
});
