"use strict";
const { createController } = require("./controller");
const validation = require("./validation");
function registerInvoiceRoutes(deps) { const controller = createController(deps); deps.app.get("/api/invoices", deps.requireAuth, validation.list, deps.asyncHandler(controller.list)); deps.app.get("/api/invoices/:id", deps.requireAuth, deps.asyncHandler(controller.get)); }
module.exports = { registerInvoiceRoutes };
