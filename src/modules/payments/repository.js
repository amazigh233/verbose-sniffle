"use strict";

const PAYMENT_INCLUDE = {
  invoice: { select: { id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, status: true, total: true } },
  customer: { select: { id: true, firstName: true, lastName: true, companyName: true, email: true } },
  tenders: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  refunds: {
    include: { allocations: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  },
  receipts: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] }
};

function get(prisma, id) {
  return prisma.payment.findUnique({ where: { id }, include: PAYMENT_INCLUDE });
}

async function list(prisma, query) {
  const page = Number(query.page || 1);
  const pageSize = Number(query.pageSize || 25);
  const where = {
    status: query.status,
    invoiceId: query.invoiceId,
    customerId: query.customerId,
    createdAt: query.from || query.to ? {
      gte: query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined,
      lte: query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined
    } : undefined
  };
  const [totalItems, items] = await prisma.$transaction([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      include: PAYMENT_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);
  return { items, page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) };
}

module.exports = { PAYMENT_INCLUDE, get, list };
