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
    hrKeyVersion: String(process.env.HR_KEY_VERSION || "v1"),
    clamavHost: String(process.env.CLAMAV_HOST || ""),
    clamavPort: Number(process.env.CLAMAV_PORT || 3310),
    allowUnscannedHrFiles: booleanEnv("ALLOW_UNSCANNED_HR_FILES", false),
    projectEncryptionKey: String(process.env.PROJECT_ENCRYPTION_KEY || process.env.HR_ENCRYPTION_KEY || ""),
    projectKeyVersion: String(process.env.PROJECT_KEY_VERSION || "v1"),
    resendApiKey: String(process.env.RESEND_API_KEY || ""),
    projectMailFrom: String(process.env.PROJECT_MAIL_FROM || ""),
    serviceMailFrom: String(process.env.SERVICE_MAIL_FROM || process.env.PROJECT_MAIL_FROM || ""),
    appBaseUrl: String(process.env.APP_BASE_URL || `http://localhost:${Number(process.env.PORT || 3000)}`)
  };
  if (config.hrPortalEnabled && !config.hrEncryptionKey) {
    throw new Error("Missing required environment variable: HR_ENCRYPTION_KEY");
  }
  if (config.isProduction && config.hrPortalEnabled && !config.clamavHost) {
    throw new Error("Missing required environment variable: CLAMAV_HOST");
  }
  if (config.isProduction && config.allowUnscannedHrFiles) {
    throw new Error("ALLOW_UNSCANNED_HR_FILES is not permitted in production");
  }
  return config;
}

module.exports = { loadConfig };
