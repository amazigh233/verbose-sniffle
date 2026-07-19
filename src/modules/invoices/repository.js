"use strict";
const data = require("../../data");
function list(prisma, query, where) { return data.listCollectionPage(prisma, "invoices", query, where); }
function get(prisma, id, where) { return data.getCollectionItem(prisma, "invoices", id, where); }
module.exports = { list, get };
