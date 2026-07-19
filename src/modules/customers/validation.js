"use strict";
const { paginationValidation } = require("../shared/pagination-validation");
module.exports = { list: paginationValidation({ sorts: ["createdAt", "updatedAt", "lastName", "firstName", "companyName", "city"], filters: ["city", "postalCode"], views: ["summary", "full"] }) };
