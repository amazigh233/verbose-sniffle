"use strict";
const { prisma } = require("../src/prisma");
const { runDigest } = require("../src/project-digest");
runDigest().then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
