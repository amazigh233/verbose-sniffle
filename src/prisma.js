"use strict";

require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

// Expliciete pool-grootte: Prisma's default (cpu's * 2 + 1) is op kleine
// hosts te klein voor veel gelijktijdige gebruikers. Bestaande parameters in
// DATABASE_URL blijven leidend.
function withPoolParams(url) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set("connection_limit", String(Number(process.env.PRISMA_CONNECTION_LIMIT) || 20));
    }
    if (!parsed.searchParams.has("pool_timeout")) {
      parsed.searchParams.set("pool_timeout", "20");
    }
    return parsed.toString();
  } catch (_error) {
    return url;
  }
}

const prisma = new PrismaClient({ datasourceUrl: withPoolParams(process.env.DATABASE_URL) });

module.exports = { prisma };
