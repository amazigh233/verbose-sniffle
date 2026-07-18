"use strict";
const policy = require("../../middleware/authorization");
async function readScope(prisma, user) { if (!["admin", "sales", "execution", "finance"].includes(user.role)) throw Object.assign(new Error("Geen toegang."), { status: 403 }); return policy.collectionWhere(prisma, user, "quotes"); }
module.exports = { readScope };
