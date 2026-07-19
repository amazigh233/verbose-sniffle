"use strict";
const repository = require("./repository");
const authorization = require("./authorization");
async function list(prisma, user, query, project) { const page = await repository.list(prisma, query, await authorization.readScope(prisma, user)); page.items = project(page.items, user.role); return page; }
async function get(prisma, user, id, project) { const item = await repository.get(prisma, id, await authorization.readScope(prisma, user)); if (!item) throw Object.assign(new Error("Offerte niet gevonden."), { status: 404 }); return project([item], user.role)[0]; }
module.exports = { list, get };
