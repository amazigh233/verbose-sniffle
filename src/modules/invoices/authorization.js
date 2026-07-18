"use strict";
const policy = require("../../middleware/authorization");
async function readScope(prisma, user) { if (!["admin", "finance"].includes(user.role)) throw Object.assign(new Error("Geen toegang."), { status: 403 }); return policy.collectionWhere(prisma, user, "invoices"); }
module.exports = { readScope };
