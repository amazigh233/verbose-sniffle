"use strict";

const authorization = require("./middleware/authorization");
const projects = require("./project-data");

function andWhere(...parts) {
  const clauses = parts.filter((part) => part && Object.keys(part).length);
  if (!clauses.length) return undefined;
  return clauses.length === 1 ? clauses[0] : { AND: clauses };
}

function canUsePortal(role, portal) {
  if (role === "admin") return true;
  if (portal === "crm") return ["crm", "installer"].includes(role);
  if (portal === "sales") return role === "sales";
  if (portal === "execution") return ["execution", "installer"].includes(role);
  if (portal === "finance") return role === "finance";
  return false;
}

async function scoped(prisma, user, collection) {
  return authorization.collectionWhere(prisma, user, collection);
}

async function portalCounts(prisma, user) {
  const counts = {};
  const tasks = [];
  if (canUsePortal(user.role, "crm")) tasks.push(scoped(prisma, user, "customers").then((where) => prisma.customer.count({ where })).then((value) => { counts.customers = value; }));
  if (canUsePortal(user.role, "sales")) tasks.push(scoped(prisma, user, "salesOpportunities").then((where) => prisma.salesOpportunity.count({ where: andWhere(where, { stage: { notIn: ["gewonnen", "verloren"] } }) })).then((value) => { counts.openOpportunities = value; }));
  if (canUsePortal(user.role, "execution")) tasks.push(scoped(prisma, user, "installations").then((where) => prisma.installation.count({ where: andWhere(where, { status: "ingepland" }) })).then((value) => { counts.scheduledInstallations = value; }));
  if (canUsePortal(user.role, "finance")) tasks.push(scoped(prisma, user, "invoices").then((where) => prisma.invoice.count({ where: andWhere(where, { status: { in: ["verzonden", "verlopen"] } }) })).then((value) => { counts.openInvoices = value; }));
  if (user.role === "admin") tasks.push(prisma.product.count().then((value) => { counts.products = value; }));
  await Promise.all(tasks);
  return counts;
}

async function crm(prisma, user) {
  const where = await scoped(prisma, user, "customers");
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [totalCustomers, newThisMonth, incompleteContact, recentCustomers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.count({ where: andWhere(where, { createdAt: { gte: monthStart } }) }),
    prisma.customer.count({ where: andWhere(where, { OR: [{ email: "" }, { phone: "" }] }) }),
    prisma.customer.findMany({ where, select: { id: true, firstName: true, lastName: true, companyName: true, email: true, phone: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 6 })
  ]);
  return { metrics: { totalCustomers, newThisMonth, incompleteContact }, items: { recentCustomers } };
}

async function sales(prisma, user) {
  const opportunityWhere = await scoped(prisma, user, "salesOpportunities");
  const appointmentWhere = await scoped(prisma, user, "salesAppointments");
  const quoteWhere = await scoped(prisma, user, "quotes");
  const today = new Date().toISOString().slice(0, 10);
  const openWhere = andWhere(opportunityWhere, { stage: { notIn: ["gewonnen", "verloren"] } });
  const [openOpportunities, dueFollowUps, upcomingAppointments, activeQuotes, appointments] = await Promise.all([
    prisma.salesOpportunity.count({ where: openWhere }),
    prisma.salesOpportunity.count({ where: andWhere(openWhere, { followUpDate: { not: "", lte: today } }) }),
    prisma.salesAppointment.count({ where: andWhere(appointmentWhere, { status: "gepland", date: { gte: today } }) }),
    prisma.quote.count({ where: andWhere(quoteWhere, { status: { in: ["concept", "verstuurd"] } }) }),
    prisma.salesAppointment.findMany({ where: andWhere(appointmentWhere, { status: "gepland", date: { gte: today } }), select: { id: true, title: true, date: true, startTime: true, customerId: true }, orderBy: [{ date: "asc" }, { startTime: "asc" }, { id: "asc" }], take: 6 })
  ]);
  return { metrics: { openOpportunities, dueFollowUps, upcomingAppointments, activeQuotes }, items: { upcomingAppointments: appointments } };
}

async function execution(prisma, user) {
  const where = await scoped(prisma, user, "installations");
  const today = new Date().toISOString().slice(0, 10);
  const upcomingWhere = andWhere(where, { status: "ingepland", plannedDate: { gte: today } });
  const [todayInstallations, scheduledInstallations, completedInstallations, upcomingInstallations, projectActions] = await Promise.all([
    prisma.installation.count({ where: andWhere(where, { status: "ingepland", plannedDate: today }) }),
    prisma.installation.count({ where: upcomingWhere }),
    prisma.installation.count({ where: andWhere(where, { status: "uitgevoerd" }) }),
    prisma.installation.findMany({ where: upcomingWhere, select: { id: true, customerId: true, plannedDate: true, startTime: true, installer: true, customer: { select: { firstName: true, lastName: true, companyName: true } } }, orderBy: [{ plannedDate: "asc" }, { startTime: "asc" }, { id: "asc" }], take: 6 }),
    ["admin", "execution"].includes(user.role) ? projects.actionCenter(prisma, user, { window: "all" }).then((items) => items.slice(0, 8)) : Promise.resolve([])
  ]);
  return { metrics: { todayInstallations, scheduledInstallations, completedInstallations }, items: { upcomingInstallations, projectActions } };
}

async function finance(prisma, user) {
  const where = await scoped(prisma, user, "invoices");
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const openWhere = andWhere(where, { status: { in: ["verzonden", "verlopen"] } });
  const [openInvoices, overdueInvoices, outstanding, monthRevenue, urgentInvoices] = await Promise.all([
    prisma.invoice.count({ where: openWhere }),
    prisma.invoice.count({ where: andWhere(openWhere, { OR: [{ status: "verlopen" }, { dueDate: { lt: today } }] }) }),
    prisma.invoice.aggregate({ where: openWhere, _sum: { total: true } }),
    prisma.invoice.aggregate({ where: andWhere(where, { status: { not: "concept" }, invoiceDate: { startsWith: month } }), _sum: { total: true } }),
    prisma.invoice.findMany({ where: andWhere(openWhere, { OR: [{ status: "verlopen" }, { dueDate: { lt: today } }] }), select: { id: true, invoiceNumber: true, customerId: true, dueDate: true, total: true, customer: { select: { firstName: true, lastName: true, companyName: true } } }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 6 })
  ]);
  return { metrics: { openInvoices, overdueInvoices, outstandingAmount: outstanding._sum.total || 0, revenueThisMonth: monthRevenue._sum.total || 0 }, items: { urgentInvoices } };
}

async function management(prisma, user) {
  if (user.role !== "admin") throw Object.assign(new Error("Geen toegang."), { status: 403 });
  return { metrics: { productCount: await prisma.product.count() }, items: {} };
}

async function dashboard(prisma, user, portal) {
  if (!canUsePortal(user.role, portal) && !(portal === "management" && user.role === "admin")) throw Object.assign(new Error("Geen toegang."), { status: 403 });
  if (portal === "crm") return crm(prisma, user);
  if (portal === "sales") return sales(prisma, user);
  if (portal === "execution") return execution(prisma, user);
  if (portal === "finance") return finance(prisma, user);
  if (portal === "management") return management(prisma, user);
  throw Object.assign(new Error("Onbekend dashboard."), { status: 404 });
}

module.exports = { dashboard, portalCounts };
