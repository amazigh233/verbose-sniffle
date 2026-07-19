"use strict";
const { createController } = require("./controller");
const validation = require("./validation");
function registerInstallationRoutes(deps) { const controller = createController(deps); deps.app.get("/api/installations", deps.requireAuth, validation.list, deps.asyncHandler(controller.list)); deps.app.get("/api/installations/:id", deps.requireAuth, deps.asyncHandler(controller.get)); }
module.exports = { registerInstallationRoutes };
