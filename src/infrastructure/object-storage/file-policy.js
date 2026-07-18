"use strict";

const crypto = require("crypto");
const path = require("path");
const security = require("../../hr-security");

const TYPES = {
  pdf: { mimeType: "application/pdf", extensions: [".pdf"], matches: (head) => head.subarray(0, 5).toString("ascii") === "%PDF-" },
  jpeg: { mimeType: "image/jpeg", extensions: [".jpg", ".jpeg"], matches: (head) => head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff },
  png: { mimeType: "image/png", extensions: [".png"], matches: (head) => head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  webp: { mimeType: "image/webp", extensions: [".webp"], matches: (head) => head.subarray(0, 4).toString("ascii") === "RIFF" && head.subarray(8, 12).toString("ascii") === "WEBP" }
};

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }

function validateFile(file, allowedTypes, maximumSize = 8 * 1024 * 1024) {
  if (!file || !file.buffer || !file.buffer.length) fail("Kies een bestand.");
  if (file.buffer.length > maximumSize) fail("Bestand is groter dan toegestaan.", 413);
  const fileName = String(file.originalname || "bestand").replace(/[\\/\0\r\n]/g, "_").slice(0, 240);
  const extension = path.extname(fileName).toLowerCase();
  const type = allowedTypes.map((name) => TYPES[name]).find((candidate) => candidate && candidate.mimeType === file.mimetype && candidate.extensions.includes(extension) && candidate.matches(file.buffer));
  if (!type) fail("Bestandstype, extensie en inhoud komen niet overeen.");
  return { fileName, mimeType: type.mimeType, size: file.buffer.length, sha256: crypto.createHash("sha256").update(file.buffer).digest("hex") };
}

async function scanFile(config, buffer) {
  const scan = await security.scanWithClamav(config, buffer);
  if (!scan.clean) fail(scan.message || "Bestand is niet veilig bevonden.", scan.unavailable ? 503 : 422);
  return scan;
}

function storageKey(namespace) {
  return `${namespace}/${new Date().toISOString().slice(0, 10).replace(/-/g, "/")}/${crypto.randomUUID()}`;
}

module.exports = { scanFile, storageKey, validateFile };
