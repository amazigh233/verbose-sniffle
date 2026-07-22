"use strict";

const roles = require("./authorization");
const { createInventoryController } = require("./controller");

function registerInventoryRoutes({ app, asyncHandler, config, prisma, requireRole, scanFile, upload }) {
  const controller = createInventoryController({ prisma, scanFile, config });
  app.get("/api/inventory", requireRole(...roles.READ_ROLES), asyncHandler(controller.list));
  app.get("/api/inventory/template", requireRole(...roles.WRITE_ROLES), controller.template);
  app.put("/api/inventory/:id", requireRole(...roles.WRITE_ROLES), asyncHandler(controller.adjust));
  app.post("/api/inventory/import", requireRole(...roles.WRITE_ROLES), upload.single("file"), asyncHandler(controller.importWorkbook));
}

module.exports = { registerInventoryRoutes };
