"use strict";

const crypto = require("crypto");
const net = require("net");
const bcrypt = require("bcrypt");
const { generateSecret, generateSync, generateURI, verifySync } = require("otplib");

const authenticator = {
  generateSecret,
  generate(secret) { return generateSync({ secret }); },
  check(token, secret) { return Boolean(verifySync({ secret, token }).valid); },
  keyuri(label, issuer, secret) { return generateURI({ issuer, label, secret }); }
};

const ALGORITHM = "aes-256-gcm";
const FILE_ENVELOPE_MAGIC = Buffer.from("CLM1", "ascii");

function publicError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function decodeKey(value) {
  value = String(value || "").trim();
  let key;
  if (/^[a-f0-9]{64}$/i.test(value)) key = Buffer.from(value, "hex");
  else {
    try { key = Buffer.from(value, "base64"); } catch (_error) { key = Buffer.alloc(0); }
  }
  if (key.length !== 32) throw publicError("HR-versleutelingssleutel is ongeldig.", 503);
  return key;
}

function encryptionKeys(config) {
  const configured = config.hrEncryptionKeys && typeof config.hrEncryptionKeys === "object" ? config.hrEncryptionKeys : {};
  const values = { ...configured };
  const activeVersion = String(config.hrKeyVersion || "v1");
  if (!values[activeVersion] && config.hrEncryptionKey) values[activeVersion] = config.hrEncryptionKey;
  return Object.fromEntries(Object.entries(values).map(([version, value]) => [String(version), decodeKey(value)]));
}

function encryptionKey(config, version = config.hrKeyVersion || "v1") {
  const keys = encryptionKeys(config);
  const key = keys[String(version)];
  if (!key) throw publicError("Versleutelingssleutelversie is niet beschikbaar.", 503);
  return key;
}

function encrypt(config, input) {
  const keyVersion = String(config.hrKeyVersion || "v1");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(config, keyVersion), iv);
  const value = Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8");
  const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
  return { cipher: encrypted, iv, tag: cipher.getAuthTag(), keyVersion };
}

function decrypt(config, encrypted, iv, tag, keyVersion = config.hrKeyVersion || "v1") {
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(config, keyVersion), Buffer.from(iv));
    decipher.setAuthTag(Buffer.from(tag));
    return Buffer.concat([decipher.update(Buffer.from(encrypted)), decipher.final()]);
  } catch (error) {
    if (error && error.status === 503) throw error;
    throw publicError("Versleutelde HR-data kon niet veilig worden geopend.", 500);
  }
}

function encryptFileEnvelope(config, input) {
  const encrypted = encrypt(config, input);
  return {
    content: Buffer.concat([FILE_ENVELOPE_MAGIC, encrypted.iv, encrypted.tag, encrypted.cipher]),
    keyVersion: encrypted.keyVersion
  };
}

function decryptFileEnvelope(config, content, keyVersion) {
  const value = Buffer.from(content || []);
  if (value.length < FILE_ENVELOPE_MAGIC.length + 12 + 16 || !value.subarray(0, 4).equals(FILE_ENVELOPE_MAGIC)) {
    throw publicError("Versleuteld HR-bestand heeft een ongeldig formaat.", 500);
  }
  return decrypt(config, value.subarray(32), value.subarray(4, 16), value.subarray(16, 32), keyVersion);
}

function encryptJson(config, value) {
  return encrypt(config, JSON.stringify(value || {}));
}

function decryptJson(config, record, prefix) {
  const cipher = record[`${prefix}Cipher`];
  const iv = record[`${prefix}Iv`];
  const tag = record[`${prefix}Tag`];
  if (!cipher || !iv || !tag) return {};
  try {
    const keyVersion = record[`${prefix}KeyVersion`] || record.keyVersion || config.hrKeyVersion || "v1";
    return JSON.parse(decrypt(config, cipher, iv, tag, keyVersion).toString("utf8"));
  } catch (error) {
    if (error.status) throw error;
    throw publicError("Versleutelde HR-data heeft een ongeldig formaat.", 500);
  }
}

function secretRecord(config, secret) {
  const value = encrypt(config, secret);
  return { mfaSecretCipher: value.cipher, mfaSecretIv: value.iv, mfaSecretTag: value.tag, mfaKeyVersion: value.keyVersion };
}

function decryptSecret(config, user) {
  if (!user.mfaSecretCipher || !user.mfaSecretIv || !user.mfaSecretTag) return "";
  return decrypt(config, user.mfaSecretCipher, user.mfaSecretIv, user.mfaSecretTag, user.mfaKeyVersion || "v1").toString("utf8");
}

function recoveryHash(config, code) {
  return crypto.createHmac("sha256", encryptionKey(config)).update(String(code).replace(/\s|-/g, "").toUpperCase()).digest("hex");
}

function recoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const raw = crypto.randomBytes(6).toString("hex").toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
}

async function verifyPassword(prisma, sessionUser, password) {
  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  const valid = user && user.active && user.role === "admin" && await bcrypt.compare(String(password || ""), user.passwordHash);
  if (!valid) throw publicError("Verificatie mislukt.", 401);
  return user;
}

async function verifySecondFactor(prisma, config, user, tokenValue) {
  const token = String(tokenValue || "").trim();
  if (!token) throw publicError("Verificatie mislukt.", 401);
  if (/^\d{6}$/.test(token)) {
    const secret = decryptSecret(config, user);
    const result = verifySync({
      secret,
      token,
      epochTolerance: 30,
      afterTimeStep: user.mfaLastUsedStep == null ? undefined : user.mfaLastUsedStep
    });
    if (!result.valid) throw publicError("Verificatie mislukt.", 401);
    const step = result.timeStep;
    const updated = await prisma.user.updateMany({
      where: { id: user.id, OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }] },
      data: { mfaLastUsedStep: step }
    });
    if (!updated.count) throw publicError("Deze authenticatorcode is al gebruikt.", 401);
    return "totp";
  }
  const codeHashes = Object.keys(encryptionKeys(config)).map((version) => crypto.createHmac("sha256", encryptionKey(config, version)).update(token.replace(/\s|-/g, "").toUpperCase()).digest("hex"));
  const code = await prisma.userMfaRecoveryCode.findFirst({ where: { userId: user.id, codeHash: { in: codeHashes }, usedAt: null } });
  if (!code) throw publicError("Verificatie mislukt.", 401);
  const used = await prisma.userMfaRecoveryCode.updateMany({ where: { id: code.id, usedAt: null }, data: { usedAt: new Date() } });
  if (!used.count) throw publicError("Verificatie mislukt.", 401);
  return "recovery";
}

function ipHash(config, req) {
  return crypto.createHmac("sha256", encryptionKey(config)).update(String(req.ip || req.socket.remoteAddress || "unknown")).digest("hex").slice(0, 24);
}

async function audit(prisma, config, req, action, entityType, entityId, metadata) {
  return prisma.hrAuditEvent.create({
    data: {
      actorId: req.session && req.session.user ? req.session.user.id : null,
      action,
      entityType,
      entityId: String(entityId || ""),
      metadata: metadata || undefined,
      ipHash: ipHash(config, req)
    }
  });
}

function scanWithClamav(config, buffer) {
  if (!config.clamavHost) {
    if (config.allowUnscannedHrFiles && !config.isProduction) return Promise.resolve({ clean: true, message: "Development bypass" });
    return Promise.resolve({ clean: false, unavailable: true, message: "Malwarescanner niet beschikbaar." });
  }
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: config.clamavHost, port: config.clamavPort || 3310 });
    const responses = [];
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(30000, () => finish({ clean: false, unavailable: true, message: "Malwarescan timeout." }));
    socket.on("error", () => finish({ clean: false, unavailable: true, message: "Malwarescanner niet bereikbaar." }));
    socket.on("data", (chunk) => responses.push(chunk));
    socket.on("end", () => {
      const response = Buffer.concat(responses).toString("utf8").replace(/\0/g, "").trim();
      if (/\bOK$/i.test(response)) finish({ clean: true, message: "Clean" });
      else finish({ clean: false, message: response ? "Bestand afgekeurd door malwarescanner." : "Geen scannerantwoord." });
    });
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
        const chunk = buffer.subarray(offset, Math.min(offset + 64 * 1024, buffer.length));
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length, 0);
        socket.write(size);
        socket.write(chunk);
      }
      socket.end(Buffer.alloc(4));
    });
  });
}

module.exports = {
  publicError,
  encryptionKey,
  encryptionKeys,
  encrypt,
  decrypt,
  encryptFileEnvelope,
  decryptFileEnvelope,
  encryptJson,
  decryptJson,
  secretRecord,
  decryptSecret,
  recoveryHash,
  recoveryCodes,
  verifyPassword,
  verifySecondFactor,
  audit,
  scanWithClamav,
  authenticator
};
