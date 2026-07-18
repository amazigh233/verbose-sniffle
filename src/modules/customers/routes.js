"use strict";
const { createController } = require("./controller");
const validation = require("./validation");
function registerCustomerRoutes(deps) { const controller = createController(deps); deps.app.get("/api/customers", deps.requireAuth, validation.list, deps.asyncHandler(controller.list)); }
module.exports = { registerCustomerRoutes };
