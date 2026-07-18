"use strict";

const pino = require("pino");

function createLogger(config) {
  return pino({
    level: config.nodeEnv === "test" || process.env.VITEST ? "silent" : (process.env.LOG_LEVEL || "info"),
    base: { service: "climature-bedrijfsportaal", environment: config.nodeEnv },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ["password", "currentPassword", "newPassword", "code", "token", "secret", "session", "document", "req.headers.cookie", "req.headers.authorization"],
      censor: "[REDACTED]"
    }
  });
}

module.exports = { createLogger };
