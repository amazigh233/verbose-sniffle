"use strict";
const data = require("../../data");
function list(prisma, query, where) { return data.listCollectionPage(prisma, "customers", query, where); }
function get(prisma, id, where) { return data.getCollectionItem(prisma, "customers", id, where); }
module.exports = { list, get };
