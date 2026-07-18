"use strict";

function publicError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function actorContext(prisma, sessionUser) {
  if (!sessionUser || !sessionUser.id) throw publicError("Niet ingelogd.", 401);
  const actor = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, role: true, active: true, employeeId: true }
  });
  if (!actor || !actor.active) throw publicError("Sessie is niet meer geldig.", 401);
  return actor;
}

function installerCustomerWhere(employeeId) {
  if (!employeeId) return { id: "__no_assigned_customer__" };
  return {
    OR: [
      { installations: { some: { employeeId } } },
      { projects: { some: { members: { some: { employeeId } } } } },
      { maintenanceVisits: { some: { assignedEmployeeId: employeeId } } }
    ]
  };
}

function installerCollectionWhere(collection, employeeId) {
  if (collection === "installations") return { employeeId: employeeId || "__no_assigned_installation__" };
  if (collection === "customers") return installerCustomerWhere(employeeId);
  if (["customerNotes", "customerDocuments"].includes(collection)) {
    return { customer: installerCustomerWhere(employeeId) };
  }
  return undefined;
}

async function collectionWhere(prisma, sessionUser, collection) {
  const actor = await actorContext(prisma, sessionUser);
  return actor.role === "installer" ? installerCollectionWhere(collection, actor.employeeId) : undefined;
}

async function assertInstallationAccess(prisma, sessionUser, installationId) {
  const actor = await actorContext(prisma, sessionUser);
  const where = actor.role === "installer"
    ? { id: installationId, employeeId: actor.employeeId || "__no_assigned_installation__" }
    : { id: installationId };
  const installation = await prisma.installation.findFirst({ where });
  if (!installation) throw publicError("Installatie niet gevonden.", 404);
  return { actor, installation };
}

module.exports = {
  actorContext,
  assertInstallationAccess,
  collectionWhere,
  installerCollectionWhere,
  installerCustomerWhere
};
