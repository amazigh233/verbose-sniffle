"use strict";

require("dotenv").config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function booleanEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function keyringEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("not an object");
    return Object.fromEntries(Object.entries(parsed).map(([version, key]) => [String(version), String(key)]));
  } catch (_error) {
    throw new Error(`${name} must be a JSON object mapping versions to keys`);
  }
}

function loadConfig() {
  const config = {
    databaseUrl: requireEnv("DATABASE_URL"),
    sessionSecret: requireEnv("SESSION_SECRET"),
    adminUsername: requireEnv("ADMIN_USERNAME"),
    adminPasswordHash: requireEnv("ADMIN_PASSWORD_HASH"),
    port: Number(process.env.PORT || 3000),
    nodeEnv: process.env.NODE_ENV || "development",
    isProduction: process.env.NODE_ENV === "production",
    hrPortalEnabled: booleanEnv("HR_PORTAL_ENABLED", false),
    hrEncryptionKey: String(process.env.HR_ENCRYPTION_KEY || ""),
    hrEncryptionKeys: keyringEnv("HR_ENCRYPTION_KEYS"),
    hrKeyVersion: String(process.env.HR_KEY_VERSION || "v1"),
    clamavHost: String(process.env.CLAMAV_HOST || ""),
    clamavPort: Number(process.env.CLAMAV_PORT || 3310),
    allowUnscannedHrFiles: booleanEnv("ALLOW_UNSCANNED_HR_FILES", false),
    projectEncryptionKey: String(process.env.PROJECT_ENCRYPTION_KEY || process.env.HR_ENCRYPTION_KEY || ""),
    projectEncryptionKeys: keyringEnv("PROJECT_ENCRYPTION_KEYS"),
    projectKeyVersion: String(process.env.PROJECT_KEY_VERSION || "v1"),
    resendApiKey: String(process.env.RESEND_API_KEY || ""),
    projectMailFrom: String(process.env.PROJECT_MAIL_FROM || ""),
    serviceMailFrom: String(process.env.SERVICE_MAIL_FROM || process.env.PROJECT_MAIL_FROM || ""),
    appBaseUrl: String(process.env.APP_BASE_URL || `http://localhost:${Number(process.env.PORT || 3000)}`),
    redisUrl: String(process.env.REDIS_URL || ""),
    objectStorageProvider: String(process.env.OBJECT_STORAGE_PROVIDER || "local").toLowerCase(),
    objectStorageRoot: String(process.env.OBJECT_STORAGE_ROOT || require("path").join(__dirname, "..", ".data", "objects")),
    objectStorageEndpoint: String(process.env.OBJECT_STORAGE_ENDPOINT || ""),
    objectStorageRegion: String(process.env.OBJECT_STORAGE_REGION || "eu-west-1"),
    objectStorageBucket: String(process.env.OBJECT_STORAGE_BUCKET || ""),
    objectStorageAccessKeyId: String(process.env.OBJECT_STORAGE_ACCESS_KEY_ID || ""),
    objectStorageSecretAccessKey: String(process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || ""),
    objectStorageForcePathStyle: booleanEnv("OBJECT_STORAGE_FORCE_PATH_STYLE", true)
  };
  if (String(config.sessionSecret).length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  if (config.hrPortalEnabled && !config.hrEncryptionKey && !config.hrEncryptionKeys[config.hrKeyVersion]) {
    throw new Error("Missing active HR encryption key");
  }
  if (config.isProduction && !config.clamavHost) {
    throw new Error("Missing required environment variable: CLAMAV_HOST");
  }
  if (config.isProduction && config.allowUnscannedHrFiles) {
    throw new Error("ALLOW_UNSCANNED_HR_FILES is not permitted in production");
  }
  if (config.isProduction && !config.redisUrl) throw new Error("Missing required environment variable: REDIS_URL");
  if (!["local", "s3"].includes(config.objectStorageProvider)) throw new Error("OBJECT_STORAGE_PROVIDER must be local or s3");
  if (config.objectStorageProvider === "s3" && !config.objectStorageBucket) throw new Error("Missing required environment variable: OBJECT_STORAGE_BUCKET");
  if (config.objectStorageAccessKeyId && !config.objectStorageSecretAccessKey) throw new Error("Missing required environment variable: OBJECT_STORAGE_SECRET_ACCESS_KEY");
  return config;
}

module.exports = { loadConfig };
