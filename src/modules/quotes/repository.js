"use strict";
const data = require("../../data");
function list(prisma, query, where) { return data.listCollectionPage(prisma, "quotes", query, where); }
function get(prisma, id, where) { return data.getCollectionItem(prisma, "quotes", id, where); }
module.exports = { list, get };
