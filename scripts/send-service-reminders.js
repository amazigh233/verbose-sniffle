"use strict";

const { loadConfig } = require("../src/config");
const { prisma } = require("../src/prisma");
const service = require("../src/service-data");

async function main() {
  const results = await service.sendReminders(prisma, loadConfig(), null);
  const totals = results.reduce((summary, item) => {
    summary[item.status] = (summary[item.status] || 0) + 1;
    return summary;
  }, {});
  process.stdout.write(`${JSON.stringify({ ok: true, totals })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message || "Serviceherinneringen mislukt." })}\n`);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
