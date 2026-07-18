"use strict";
const { createController } = require("./controller");
const validation = require("./validation");
function registerQuoteRoutes(deps) { const controller = createController(deps); deps.app.get("/api/quotes", deps.requireAuth, validation.list, deps.asyncHandler(controller.list)); }
module.exports = { registerQuoteRoutes };
