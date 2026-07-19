"use strict";
const { paginationValidation } = require("../shared/pagination-validation");
module.exports = { list: paginationValidation({ sorts: ["createdAt", "updatedAt", "quoteDate", "validUntil", "quoteNumber", "status", "total"], filters: ["customerId", "status"], views: ["summary", "full"] }) };
