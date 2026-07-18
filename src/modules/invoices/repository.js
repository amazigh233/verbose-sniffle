"use strict";
const data = require("../../data");
function list(prisma, query, where) { return data.listCollectionPage(prisma, "invoices", query, where); }
module.exports = { list };
