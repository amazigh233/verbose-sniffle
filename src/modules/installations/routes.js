"use strict";
const { createController } = require("./controller");
const validation = require("./validation");
function registerInstallationRoutes(deps) { const controller = createController(deps); deps.app.get("/api/installations", deps.requireAuth, validation.list, deps.asyncHandler(controller.list)); }
module.exports = { registerInstallationRoutes };
