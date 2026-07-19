"use strict";
const { createController } = require("./controller");
const validation = require("./validation");
function registerQuoteRoutes(deps) { const controller = createController(deps); deps.app.get("/api/quotes", deps.requireAuth, validation.list, deps.asyncHandler(controller.list)); deps.app.get("/api/quotes/:id", deps.requireAuth, deps.asyncHandler(controller.get)); }
module.exports = { registerQuoteRoutes };
