"use strict";

const roles = require("./authorization");
const { createPaymentController } = require("./controller");
const validation = require("./validation");

function registerPaymentRoutes({ app, asyncHandler, prisma, requireRole }) {
  const controller = createPaymentController({ prisma });
  const reader = requireRole(...roles.READ_ROLES);
  const writer = requireRole(...roles.WRITE_ROLES);
  const route = (method, path, ...handlers) => app[method](path, ...handlers.slice(0, -1), asyncHandler(handlers.at(-1)));

  route("get", "/api/payments", reader, validation.list, controller.list);
  route("post", "/api/payments", writer, validation.create, controller.create);
  route("get", "/api/payments/receipts/:number", reader, controller.receipt);
  route("get", "/api/payments/:id", reader, controller.get);
  route("get", "/api/payments/:id/history", reader, controller.history);
  route("post", "/api/payments/:id/tenders", writer, validation.addTenders, controller.addTenders);
  route("post", "/api/payments/:id/refunds", writer, validation.refund, controller.refund);
  route("post", "/api/payments/:id/cancel", writer, validation.cancel, controller.cancel);

  route("get", "/api/cash-drawers", reader, controller.drawers);
  route("post", "/api/cash-drawers", writer, validation.createDrawer, controller.createDrawer);
  route("post", "/api/cash-drawers/:id/shifts", writer, validation.openShift, controller.openShift);
  route("get", "/api/cash-drawer-shifts", reader, controller.listShifts);
  route("get", "/api/cash-drawer-shifts/:id", reader, controller.getShift);
  route("post", "/api/cash-drawer-shifts/:id/close", writer, validation.closeShift, controller.closeShift);
}

module.exports = { registerPaymentRoutes };
