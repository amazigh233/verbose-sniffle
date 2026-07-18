"use strict";

const roles = require("./authorization");
const { createServiceController } = require("./controller");

function registerServiceRoutes({ app, asyncHandler, config, objectStorage, prisma, requireRole, upload }) {
  const controller = createServiceController({ prisma, config, objectStorage });
  const reader = requireRole(...roles.READ_ROLES);
  const manager = requireRole(...roles.MANAGE_ROLES);
  const visitWriter = requireRole(...roles.VISIT_WRITE_ROLES);
  const invoiceWriter = requireRole(...roles.INVOICE_ROLES);
  const route = (method, path, ...handlers) => app[method](path, ...handlers.slice(0, -1), asyncHandler(handlers.at(-1)));

  route("get", "/api/service/dashboard", reader, controller.dashboard);
  route("get", "/api/service/bootstrap", reader, controller.bootstrap);
  route("post", "/api/service/equipment", manager, controller.createEquipment);
  route("put", "/api/service/equipment/:id", manager, controller.updateEquipment);
  route("post", "/api/service/contracts", manager, controller.createContract);
  route("put", "/api/service/contracts/:id", manager, controller.updateContract);
  route("post", "/api/service/requests", manager, controller.createRequest);
  route("put", "/api/service/requests/:id", manager, controller.updateRequest);
  route("get", "/api/service/availability", manager, controller.availability);
  route("post", "/api/service/visits", manager, controller.createVisit);
  route("put", "/api/service/visits/:id", visitWriter, controller.updateVisit);
  route("post", "/api/service/visits/:id/invoice", invoiceWriter, controller.createInvoice);
  route("post", "/api/service/visits/:id/confirmation", manager, controller.sendConfirmation);
  route("post", "/api/service/requests/:id/documents", manager, upload.single("file"), controller.uploadRequestDocument);
  route("post", "/api/service/visits/:id/documents", visitWriter, upload.single("file"), controller.uploadVisitDocument);
  route("get", "/api/service/documents/:id/download", visitWriter, controller.downloadDocument);
  route("post", "/api/service/reminders/run", manager, controller.reminders);
}

module.exports = { registerServiceRoutes };
