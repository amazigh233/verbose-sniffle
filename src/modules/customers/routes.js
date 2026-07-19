"use strict";
const { createController } = require("./controller");
const validation = require("./validation");
function registerCustomerRoutes(deps) { const controller = createController(deps); deps.app.get("/api/customers", deps.requireAuth, validation.list, deps.asyncHandler(controller.list)); deps.app.get("/api/customers/:id", deps.requireAuth, deps.asyncHandler(controller.get)); }
module.exports = { registerCustomerRoutes };
