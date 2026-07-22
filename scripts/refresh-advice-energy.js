"use strict";

const { prisma } = require("../src/prisma");
const data = require("../src/data");

async function main() {
  const settings = await data.refreshEnergyPrices(prisma);
  const assumptions = settings.adviceAssumptions || {};
  const history = assumptions.energy && assumptions.energy.priceHistory || [];
  const status = assumptions.sources && assumptions.sources.lastEnergyRefresh || {};
  process.stdout.write(`${JSON.stringify({
    ok: status.ok !== false,
    periods: history.length,
    latestPeriod: history[0] && history[0].periodKey || "",
    errors: status.errors || []
  })}\n`);
  if (status.ok === false) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message || "Energieprijzen verversen mislukt." })}\n`);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
