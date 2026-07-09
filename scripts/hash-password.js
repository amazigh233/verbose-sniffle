"use strict";

const bcrypt = require("bcrypt");

async function main() {
  const password = process.argv[2] || process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error("Usage: npm run hash-password -- \"your-password\"");
    process.exit(1);
  }
  console.log(await bcrypt.hash(password, 12));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
