"use strict";

const roles = require("./authorization");
const { createProjectController } = require("./controller");

function registerProjectRoutes({ app, asyncHandler, config, prisma, requireRole }) {
  const controller = createProjectController({ prisma, config });
  const read = requireRole(...roles.READ_ROLES);
  const manage = requireRole(...roles.MANAGE_ROLES);
  const field = requireRole(...roles.FIELD_WRITE_ROLES);
  const route = (method, path, ...handlers) => app[method](path, ...handlers.slice(0, -1), asyncHandler(handlers.at(-1)));
  route("get", "/api/projects/actions", manage, controller.actions);
  route("get", "/api/projects", read, controller.list);
  route("post", "/api/projects", manage, controller.create);
  route("get", "/api/projects/:id", read, controller.get);
  route("put", "/api/projects/:id", manage, controller.update);
  route("post", "/api/projects/:id/materials", manage, controller.createMaterial);
  route("put", "/api/projects/:id/materials/:materialId", manage, controller.updateMaterial);
  route("delete", "/api/projects/:id/materials/:materialId", manage, controller.deleteMaterial);
  route("post", "/api/projects/:id/tasks", manage, controller.createTask);
  route("put", "/api/projects/:id/tasks/:taskId", field, controller.updateTask);
  route("post", "/api/projects/:id/team", manage, controller.saveMember);
  route("delete", "/api/projects/:id/team/:memberId", manage, controller.deleteMember);
  route("post", "/api/projects/:id/equipment", field, controller.createEquipment);
  route("put", "/api/projects/:id/equipment/:equipmentId", field, controller.updateEquipment);
  route("get", "/api/project-templates", manage, controller.templates);
  route("get", "/api/employee-availability", manage, controller.availability);
}

module.exports = { registerProjectRoutes };
