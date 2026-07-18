"use strict";
const { paginationValidation } = require("../shared/pagination-validation");
module.exports = { list: paginationValidation({ sorts: ["createdAt", "updatedAt", "plannedDate", "startTime", "status", "installer"], filters: ["customerId", "status", "employeeId", "workType"] }) };
