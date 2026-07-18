"use strict";
const repository = require("./repository");
const authorization = require("./authorization");
async function list(prisma, user, query, project) { const page = await repository.list(prisma, query, await authorization.readScope(prisma, user)); page.items = project(page.items, user.role); return page; }
module.exports = { list };
