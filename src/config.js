"use strict";

require("dotenv").config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function loadConfig() {
  return {
    databaseUrl: requireEnv("DATABASE_URL"),
    sessionSecret: requireEnv("SESSION_SECRET"),
    adminUsername: requireEnv("ADMIN_USERNAME"),
    adminPasswordHash: requireEnv("ADMIN_PASSWORD_HASH"),
    port: Number(process.env.PORT || 3000),
    nodeEnv: process.env.NODE_ENV || "development",
    isProduction: process.env.NODE_ENV === "production"
  };
}

module.exports = { loadConfig };
