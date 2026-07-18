"use strict";
const { createController } = require("./controller");
const validation = require("./validation");
function registerInvoiceRoutes(deps) { const controller = createController(deps); deps.app.get("/api/invoices", deps.requireAuth, validation.list, deps.asyncHandler(controller.list)); }
module.exports = { registerInvoiceRoutes };
