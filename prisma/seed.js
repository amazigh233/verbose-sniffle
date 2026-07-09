"use strict";

require("dotenv").config();

const { prisma } = require("../src/prisma");
const { DEFAULT_PRODUCTS, DEFAULT_SETTINGS } = require("../src/defaults");

async function main() {
  await prisma.setting.upsert({
    where: { key: "settings" },
    update: {},
    create: { key: "settings", value: DEFAULT_SETTINGS }
  });

  for (const product of DEFAULT_PRODUCTS) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: product,
      create: product
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
