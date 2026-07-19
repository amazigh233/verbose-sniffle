"use strict";

const crypto = require("crypto");
const { Prisma } = require("@prisma/client");
const repository = require("./repository");

const ZERO = new Prisma.Decimal(0);
const PAYMENT_STATUSES = new Set(["pending", "partially_paid", "paid", "partially_refunded", "refunded", "cancelled"]);

function publicError(message, status = 400, code) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

function decimal(value, field = "bedrag") {
  try {
    const normalized = String(value === undefined || value === null || value === "" ? 0 : value).replace(/[\s€]/g, "").replace(",", ".");
    return new Prisma.Decimal(normalized).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  } catch (_error) {
    throw publicError(`${field} is ongeldig.`);
  }
}

function money(value) {
  return decimal(value).toFixed(2);
}

function sum(values) {
  return (values || []).reduce((total, value) => total.plus(decimal(value)), ZERO);
}

function canonicalValue(value) {
  if (Prisma.Decimal.isDecimal(value) || value && value.constructor && value.constructor.name === "Decimal") return value.toFixed(2);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function requireIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
    throw publicError("Stuur een geldige Idempotency-Key mee.", 400, "IDEMPOTENCY_KEY_REQUIRED");
  }
  return key;
}

async function lock(tx, key) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key})) IS NULL AS locked`;
}

async function lockMany(tx, keys) {
  for (const key of [...new Set(keys)].sort()) await lock(tx, key);
}

function mapDatabaseError(error) {
  if (error && error.status) return error;
  if (error && error.code === "P2002") return publicError("Deze betalingsreferentie is al verwerkt.", 409, "DUPLICATE_PAYMENT_REFERENCE");
  return error;
}

async function serializable(prisma, work) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000
      });
    } catch (error) {
      if (error && error.code === "P2034" && attempt < 3) continue;
      throw mapDatabaseError(error);
    }
  }
  throw publicError("De betaling kon niet veilig worden verwerkt. Probeer opnieuw.", 409);
}

async function existingOperation(tx, key, type, body, actorId) {
  await lock(tx, `payment-operation:${key}`);
  const operation = await tx.paymentOperation.findUnique({ where: { idempotencyKey: key } });
  if (!operation) return null;
  const requestHash = sha256(canonicalJson(body));
  if (operation.type !== type || operation.actorId !== actorId || operation.requestHash !== requestHash) {
    throw publicError("Deze Idempotency-Key is al voor een andere bewerking gebruikt.", 409, "IDEMPOTENCY_CONFLICT");
  }
  return operation;
}

function operationData(key, paymentId, actorId, type, body) {
  return { idempotencyKey: key, paymentId, actorId, type, requestHash: sha256(canonicalJson(body)) };
}

function ledgerHash(entry) {
  return sha256(canonicalJson({
    aggregateType: entry.aggregateType,
    aggregateId: entry.aggregateId,
    sequence: entry.sequence,
    transactionId: entry.transactionId,
    actorId: entry.actorId,
    eventType: entry.eventType,
    tenderType: entry.tenderType || "",
    amount: money(entry.amount),
    currency: entry.currency || "EUR",
    payload: entry.payload || {},
    previousHash: entry.previousHash || "",
    createdAt: entry.createdAt
  }));
}

async function appendLedger(tx, input) {
  const previous = await tx.paymentLedgerEntry.findFirst({
    where: { aggregateType: input.aggregateType, aggregateId: input.aggregateId },
    orderBy: { sequence: "desc" }
  });
  const entry = {
    ...input,
    sequence: previous ? previous.sequence + 1 : 1,
    tenderType: input.tenderType || "",
    amount: decimal(input.amount || 0),
    currency: input.currency || "EUR",
    payload: canonicalValue(input.payload || {}),
    previousHash: previous ? previous.hash : "",
    createdAt: input.createdAt || new Date()
  };
  entry.hash = ledgerHash(entry);
  return tx.paymentLedgerEntry.create({ data: {
    paymentId: entry.aggregateType === "payment" ? entry.aggregateId : null,
    shiftId: entry.aggregateType === "shift" ? entry.aggregateId : null,
    aggregateType: entry.aggregateType,
    aggregateId: entry.aggregateId,
    sequence: entry.sequence,
    transactionId: entry.transactionId,
    actorId: entry.actorId,
    eventType: entry.eventType,
    tenderType: entry.tenderType,
    amount: entry.amount,
    currency: entry.currency,
    payload: entry.payload,
    previousHash: entry.previousHash,
    hash: entry.hash,
    createdAt: entry.createdAt
  } });
}

async function paymentOrThrow(prisma, id, include = repository.PAYMENT_INCLUDE) {
  const payment = await prisma.payment.findUnique({ where: { id }, include });
  if (!payment) throw publicError("Betaling niet gevonden.", 404);
  return payment;
}

function determineStatus(paidAmount, refundedAmount, totalAmount) {
  const net = paidAmount.minus(refundedAmount);
  if (net.eq(totalAmount)) return "paid";
  if (net.eq(0) && refundedAmount.gt(0)) return "refunded";
  if (refundedAmount.gt(0)) return "partially_refunded";
  if (net.gt(0)) return "partially_paid";
  return "pending";
}

function invoiceOpenStatus(invoice) {
  if (!invoice) return null;
  return invoice.dueDate < new Date().toISOString().slice(0, 10) ? "verlopen" : "verzonden";
}

async function synchronizeInvoice(tx, payment, status, now) {
  if (!payment.invoiceId) return;
  if (status === "paid") {
    await tx.invoice.update({ where: { id: payment.invoiceId }, data: { status: "betaald", paidAt: now, statusUpdatedAt: now } });
    return;
  }
  const invoice = await tx.invoice.findUnique({ where: { id: payment.invoiceId }, select: { status: true, dueDate: true } });
  if (invoice && invoice.status === "betaald") {
    await tx.invoice.update({ where: { id: payment.invoiceId }, data: { status: invoiceOpenStatus(invoice), paidAt: null, statusUpdatedAt: now } });
  }
}

async function refreshPaymentProjection(tx, paymentId, now = new Date()) {
  const payment = await paymentOrThrow(tx, paymentId, {
    invoice: { select: { status: true, dueDate: true } },
    tenders: { select: { amount: true, status: true } },
    refunds: { select: { amount: true } }
  });
  if (payment.status === "cancelled") return payment;
  const paidAmount = sum(payment.tenders.filter((item) => item.status === "captured").map((item) => item.amount));
  const refundedAmount = sum(payment.refunds.map((item) => item.amount));
  const net = paidAmount.minus(refundedAmount);
  if (net.lt(0) || net.gt(payment.totalAmount)) throw publicError("De betaling heeft een ongeldige saldopositie.", 409);
  const status = determineStatus(paidAmount, refundedAmount, payment.totalAmount);
  const updated = await tx.payment.update({ where: { id: paymentId }, data: {
    paidAmount,
    refundedAmount,
    status,
    completedAt: status === "paid" ? payment.completedAt || now : payment.completedAt
  } });
  await synchronizeInvoice(tx, updated, status, now);
  return updated;
}

async function assertOpenShifts(tx, shiftIds) {
  const ids = [...new Set(shiftIds.filter(Boolean))];
  await lockMany(tx, ids.map((id) => `cash-shift:${id}`));
  if (!ids.length) return new Map();
  const shifts = await tx.cashDrawerShift.findMany({ where: { id: { in: ids } }, include: { drawer: true } });
  const byId = new Map(shifts.map((item) => [item.id, item]));
  for (const id of ids) {
    const shift = byId.get(id);
    if (!shift || shift.status !== "open" || !shift.drawer.active) throw publicError("De kassalade-dienst is niet geopend.", 409, "CASH_SHIFT_NOT_OPEN");
  }
  return byId;
}

function normalizeTender(input) {
  const amount = decimal(input.amount, "Betaalbedrag");
  if (amount.lte(0)) throw publicError("Betaalbedrag moet groter zijn dan nul.");
  if (input.type === "cash") {
    if (!input.shiftId) throw publicError("Contante betaling vereist een geopende kassalade-dienst.");
    const amountReceived = decimal(input.amountReceived === undefined ? amount : input.amountReceived, "Ontvangen bedrag");
    if (amountReceived.lt(amount)) throw publicError("Het ontvangen contante bedrag is lager dan het betaalbedrag.");
    return { type: input.type, amount, amountReceived, changeAmount: amountReceived.minus(amount), shiftId: input.shiftId, provider: "", externalReference: "", cardBrand: "", cardLast4: "" };
  }
  const provider = String(input.provider || "").trim();
  const externalReference = String(input.externalReference || "").trim();
  if (!provider || !externalReference) throw publicError("Elektronische betalingen vereisen een provider en externe transactiereferentie.");
  if (input.amountReceived !== undefined && !decimal(input.amountReceived).eq(amount)) throw publicError("Bij elektronische betalingen moet het ontvangen bedrag gelijk zijn aan het betaalbedrag.");
  return {
    type: input.type,
    amount,
    amountReceived: amount,
    changeAmount: ZERO,
    shiftId: input.shiftId || null,
    provider,
    externalReference,
    cardBrand: String(input.cardBrand || "").trim(),
    cardLast4: String(input.cardLast4 || "").trim()
  };
}

async function captureTenders(tx, payment, tenderInputs, actorId, transactionId) {
  if (!tenderInputs.length) return [];
  if (["cancelled"].includes(payment.status)) throw publicError("Een geannuleerde betaling kan niet worden aangevuld.", 409);
  const tenders = tenderInputs.map(normalizeTender);
  await assertOpenShifts(tx, tenders.map((item) => item.shiftId));
  const netPaid = decimal(payment.paidAmount).minus(payment.refundedAmount);
  const remaining = decimal(payment.totalAmount).minus(netPaid);
  const tenderTotal = sum(tenders.map((item) => item.amount));
  if (tenderTotal.gt(remaining)) throw publicError("De betaalmiddelen overschrijden het openstaande bedrag.", 409, "PAYMENT_OVERPAYMENT");

  const created = [];
  for (const tender of tenders) {
    const saved = await tx.paymentTender.create({ data: { ...tender, paymentId: payment.id, createdById: actorId } });
    created.push(saved);
    await appendLedger(tx, {
      aggregateType: "payment",
      aggregateId: payment.id,
      transactionId,
      actorId,
      eventType: "tender.captured",
      tenderType: saved.type,
      amount: saved.amount,
      currency: payment.currency,
      payload: {
        tenderId: saved.id,
        shiftId: saved.shiftId,
        provider: saved.provider,
        externalReference: saved.externalReference,
        amountReceived: money(saved.amountReceived),
        changeAmount: money(saved.changeAmount)
      }
    });
    if (saved.shiftId) {
      await appendLedger(tx, {
        aggregateType: "shift",
        aggregateId: saved.shiftId,
        transactionId,
        actorId,
        eventType: "tender.captured",
        tenderType: saved.type,
        amount: saved.amount,
        currency: payment.currency,
        payload: { paymentId: payment.id, tenderId: saved.id, amountReceived: money(saved.amountReceived), changeAmount: money(saved.changeAmount) }
      });
    }
  }
  return created;
}

async function nextReceiptNumber(tx) {
  const year = new Date().getFullYear();
  const counter = await tx.paymentReceiptSequence.upsert({
    where: { year },
    update: { value: { increment: 1 } },
    create: { year, value: 1 }
  });
  return `CL-BON-${year}-${String(counter.value).padStart(6, "0")}`;
}

function customerName(customer) {
  if (!customer) return "";
  return customer.companyName || `${customer.firstName || ""} ${customer.lastName || ""}`.trim();
}

async function createReceipt(tx, paymentId, kind, actor, event = {}) {
  const payment = await paymentOrThrow(tx, paymentId);
  const setting = await tx.setting.findUnique({ where: { key: "settings" } });
  const settings = setting && setting.value && typeof setting.value === "object" ? setting.value : {};
  const number = await nextReceiptNumber(tx);
  const createdAt = new Date();
  const snapshot = canonicalValue({
    schemaVersion: 1,
    receipt: { number, kind, createdAt },
    merchant: {
      name: settings.companyName || "Climature",
      address: settings.companyAddress || "",
      city: settings.companyCity || "",
      kvk: settings.companyKvk || "",
      vat: settings.companyVat || ""
    },
    actor: { id: actor.id, username: actor.username || "" },
    customer: payment.customer ? { id: payment.customer.id, name: customerName(payment.customer), email: payment.customer.email || "" } : null,
    invoice: payment.invoice ? { id: payment.invoice.id, number: payment.invoice.invoiceNumber, date: payment.invoice.invoiceDate, total: money(payment.invoice.total) } : null,
    payment: {
      id: payment.id,
      status: payment.status,
      currency: payment.currency,
      subtotal: money(payment.subtotal),
      discountAmount: money(payment.discountAmount),
      discountReason: payment.discountReason,
      tipAmount: money(payment.tipAmount),
      totalAmount: money(payment.totalAmount),
      paidAmount: money(payment.paidAmount),
      refundedAmount: money(payment.refundedAmount)
    },
    tenders: payment.tenders.map((item) => ({
      id: item.id,
      type: item.type,
      status: item.status,
      amount: money(item.amount),
      amountReceived: money(item.amountReceived),
      changeAmount: money(item.changeAmount),
      provider: item.provider,
      externalReference: item.externalReference,
      cardBrand: item.cardBrand,
      cardLast4: item.cardLast4,
      createdAt: item.createdAt
    })),
    event
  });
  return tx.paymentReceipt.create({ data: {
    number,
    paymentId,
    refundId: event.refundId || null,
    kind,
    snapshot,
    createdAt
  } });
}

async function create(prisma, actor, body, idempotencyValue) {
  const key = requireIdempotencyKey(idempotencyValue);
  return serializable(prisma, async (tx) => {
    const duplicate = await existingOperation(tx, key, "payment.create", body, actor.id);
    if (duplicate) return paymentOrThrow(tx, duplicate.paymentId);

    let invoice = null;
    if (body.invoiceId) {
      await lock(tx, `invoice-payment:${body.invoiceId}`);
      invoice = await tx.invoice.findUnique({ where: { id: body.invoiceId }, include: { customer: true } });
      if (!invoice) throw publicError("Factuur niet gevonden.", 404);
      if (["concept", "geannuleerd"].includes(invoice.status)) throw publicError("Alleen een actieve factuur kan worden betaald.", 409);
      if (await tx.payment.findUnique({ where: { invoiceId: body.invoiceId } })) throw publicError("Voor deze factuur bestaat al een betaling.", 409);
      if (body.customerId && body.customerId !== invoice.customerId) throw publicError("De klant hoort niet bij de factuur.");
    }

    const subtotal = invoice ? decimal(invoice.total) : decimal(body.amount, "Betalingsbedrag");
    const discountAmount = decimal(body.discountAmount || 0, "Korting");
    const tipAmount = decimal(body.tipAmount || 0, "Fooi");
    if (subtotal.lte(0)) throw publicError("Betalingsbedrag moet groter zijn dan nul.");
    if (discountAmount.lt(0) || discountAmount.gt(subtotal)) throw publicError("Korting mag het basisbedrag niet overschrijden.");
    if (discountAmount.gt(0) && !String(body.discountReason || "").trim()) throw publicError("Een kortingsreden is verplicht.");
    const totalAmount = subtotal.minus(discountAmount).plus(tipAmount);
    if (totalAmount.lte(0)) throw publicError("Het te betalen totaal moet groter zijn dan nul.");

    const payment = await tx.payment.create({ data: {
      invoiceId: invoice ? invoice.id : null,
      customerId: invoice ? invoice.customerId : body.customerId || null,
      createdById: actor.id,
      currency: body.currency || "EUR",
      subtotal,
      discountAmount,
      discountReason: String(body.discountReason || "").trim(),
      tipAmount,
      totalAmount
    } });
    await lock(tx, `payment:${payment.id}`);
    const operation = await tx.paymentOperation.create({ data: operationData(key, payment.id, actor.id, "payment.create", body) });
    await appendLedger(tx, {
      aggregateType: "payment", aggregateId: payment.id, transactionId: operation.id, actorId: actor.id,
      eventType: "payment.created", amount: totalAmount, currency: payment.currency,
      payload: { invoiceId: payment.invoiceId, customerId: payment.customerId, subtotal: money(subtotal), discountAmount: money(discountAmount), discountReason: payment.discountReason, tipAmount: money(tipAmount) }
    });
    const createdTenders = await captureTenders(tx, payment, body.tenders || [], actor.id, operation.id);
    await refreshPaymentProjection(tx, payment.id);
    if (createdTenders.length) await createReceipt(tx, payment.id, "payment", actor, { tenderIds: createdTenders.map((item) => item.id) });
    return paymentOrThrow(tx, payment.id);
  });
}

async function addTenders(prisma, actor, paymentId, body, idempotencyValue) {
  const key = requireIdempotencyKey(idempotencyValue);
  return serializable(prisma, async (tx) => {
    const duplicate = await existingOperation(tx, key, "payment.tenders", { paymentId, ...body }, actor.id);
    if (duplicate) return paymentOrThrow(tx, duplicate.paymentId);
    await lock(tx, `payment:${paymentId}`);
    const payment = await paymentOrThrow(tx, paymentId);
    const operation = await tx.paymentOperation.create({ data: operationData(key, payment.id, actor.id, "payment.tenders", { paymentId, ...body }) });
    const created = await captureTenders(tx, payment, body.tenders, actor.id, operation.id);
    await refreshPaymentProjection(tx, payment.id);
    await createReceipt(tx, payment.id, "payment", actor, { tenderIds: created.map((item) => item.id) });
    return paymentOrThrow(tx, payment.id);
  });
}

function availableRefunds(payment) {
  return payment.tenders.filter((item) => item.status === "captured").map((tender) => ({
    tender,
    available: decimal(tender.amount).minus(sum(tender.refundAllocations.map((item) => item.amount)))
  })).filter((item) => item.available.gt(0));
}

function allocateRefund(payment, body, refundAmount) {
  const available = availableRefunds(payment);
  if (body.allocations) {
    const seen = new Set();
    const allocations = body.allocations.map((input) => {
      if (seen.has(input.tenderId)) throw publicError("Een betaalmiddel staat dubbel in de terugbetaling.");
      seen.add(input.tenderId);
      const source = available.find((item) => item.tender.id === input.tenderId);
      const amount = decimal(input.amount, "Terugbetalingsbedrag");
      if (!source || amount.lte(0) || amount.gt(source.available)) throw publicError("De terugbetaling overschrijdt het beschikbare bedrag van een betaalmiddel.", 409);
      return { tender: source.tender, amount, externalReference: String(input.externalReference || "").trim() };
    });
    if (!sum(allocations.map((item) => item.amount)).eq(refundAmount)) throw publicError("De verdeling van de terugbetaling sluit niet aan op het totaal.");
    return allocations;
  }
  let remaining = refundAmount;
  const allocations = [];
  for (const source of available) {
    if (remaining.lte(0)) break;
    const amount = Prisma.Decimal.min(source.available, remaining);
    allocations.push({ tender: source.tender, amount, externalReference: "" });
    remaining = remaining.minus(amount);
  }
  if (remaining.gt(0)) throw publicError("Onvoldoende terugbetaalbaar saldo.", 409);
  return allocations;
}

async function refund(prisma, actor, paymentId, body, idempotencyValue) {
  const key = requireIdempotencyKey(idempotencyValue);
  return serializable(prisma, async (tx) => {
    const duplicate = await existingOperation(tx, key, "payment.refund", { paymentId, ...body }, actor.id);
    if (duplicate) return paymentOrThrow(tx, duplicate.paymentId);
    await lock(tx, `payment:${paymentId}`);
    const payment = await paymentOrThrow(tx, paymentId, {
      tenders: { include: { refundAllocations: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      refunds: true
    });
    if (payment.status === "cancelled") throw publicError("Een geannuleerde betaling kan niet worden terugbetaald.", 409);
    const refundAmount = decimal(body.amount, "Terugbetalingsbedrag");
    const refundable = decimal(payment.paidAmount).minus(payment.refundedAmount);
    if (refundAmount.lte(0) || refundAmount.gt(refundable)) throw publicError("Terugbetaling overschrijdt het beschikbare betaalde saldo.", 409);
    const allocations = allocateRefund(payment, body, refundAmount);
    const cashAllocations = allocations.filter((item) => item.tender.type === "cash");
    if (cashAllocations.length && !body.cashShiftId) throw publicError("Een contante terugbetaling vereist een geopende kassalade-dienst.");
    if (body.cashShiftId) await assertOpenShifts(tx, [body.cashShiftId]);
    const electronicAllocationCount = allocations.filter((item) => item.tender.type !== "cash").length;
    for (const allocation of allocations) {
      if (allocation.tender.type !== "cash") {
        allocation.externalReference = allocation.externalReference || (electronicAllocationCount === 1 ? String(body.externalReference || "").trim() : "");
        if (!allocation.externalReference) throw publicError("Elektronische terugbetalingen vereisen per betaalmiddel een externe referentie.");
      }
    }

    const operation = await tx.paymentOperation.create({ data: operationData(key, payment.id, actor.id, "payment.refund", { paymentId, ...body }) });
    const savedRefund = await tx.paymentRefund.create({ data: { paymentId, createdById: actor.id, amount: refundAmount, reason: body.reason } });
    for (const allocation of allocations) {
      const saved = await tx.paymentRefundAllocation.create({ data: {
        refundId: savedRefund.id,
        tenderId: allocation.tender.id,
        shiftId: allocation.tender.type === "cash" ? body.cashShiftId : null,
        amount: allocation.amount,
        externalReference: allocation.externalReference
      } });
      await appendLedger(tx, {
        aggregateType: "payment", aggregateId: payment.id, transactionId: operation.id, actorId: actor.id,
        eventType: "refund.completed", tenderType: allocation.tender.type, amount: allocation.amount.negated(), currency: payment.currency,
        payload: { refundId: savedRefund.id, allocationId: saved.id, tenderId: allocation.tender.id, shiftId: saved.shiftId, reason: body.reason, externalReference: saved.externalReference }
      });
      if (saved.shiftId) {
        await appendLedger(tx, {
          aggregateType: "shift", aggregateId: saved.shiftId, transactionId: operation.id, actorId: actor.id,
          eventType: "refund.completed", tenderType: allocation.tender.type, amount: allocation.amount.negated(), currency: payment.currency,
          payload: { paymentId: payment.id, refundId: savedRefund.id, allocationId: saved.id, tenderId: allocation.tender.id, reason: body.reason }
        });
      }
    }
    await refreshPaymentProjection(tx, payment.id);
    await createReceipt(tx, payment.id, "refund", actor, { refundId: savedRefund.id, amount: money(refundAmount), reason: body.reason });
    return paymentOrThrow(tx, payment.id);
  });
}

async function cancel(prisma, actor, paymentId, body, idempotencyValue) {
  const key = requireIdempotencyKey(idempotencyValue);
  return serializable(prisma, async (tx) => {
    const duplicate = await existingOperation(tx, key, "payment.cancel", { paymentId, ...body }, actor.id);
    if (duplicate) return paymentOrThrow(tx, duplicate.paymentId);
    await lock(tx, `payment:${paymentId}`);
    const payment = await paymentOrThrow(tx, paymentId);
    if (payment.status === "cancelled") throw publicError("Betaling is al geannuleerd.", 409);
    if (payment.refunds.length) throw publicError("Een betaling met terugbetalingen kan niet worden geannuleerd.", 409);
    const captured = payment.tenders.filter((item) => item.status === "captured");
    await assertOpenShifts(tx, captured.filter((item) => item.type === "cash").map((item) => item.shiftId));
    const operation = await tx.paymentOperation.create({ data: operationData(key, payment.id, actor.id, "payment.cancel", { paymentId, ...body }) });
    const now = new Date();
    for (const tender of captured) {
      await tx.paymentTender.update({ where: { id: tender.id }, data: { status: "cancelled", cancelledAt: now } });
      await appendLedger(tx, {
        aggregateType: "payment", aggregateId: payment.id, transactionId: operation.id, actorId: actor.id,
        eventType: "tender.cancelled", tenderType: tender.type, amount: decimal(tender.amount).negated(), currency: payment.currency,
        payload: { tenderId: tender.id, shiftId: tender.shiftId, reason: body.reason }
      });
      if (tender.shiftId) {
        await appendLedger(tx, {
          aggregateType: "shift", aggregateId: tender.shiftId, transactionId: operation.id, actorId: actor.id,
          eventType: "tender.cancelled", tenderType: tender.type, amount: decimal(tender.amount).negated(), currency: payment.currency,
          payload: { paymentId: payment.id, tenderId: tender.id, reason: body.reason }
        });
      }
    }
    await tx.payment.update({ where: { id: payment.id }, data: {
      status: "cancelled", paidAmount: ZERO, refundedAmount: ZERO, cancelledById: actor.id,
      cancellationReason: body.reason, cancelledAt: now
    } });
    await synchronizeInvoice(tx, payment, "cancelled", now);
    await appendLedger(tx, {
      aggregateType: "payment", aggregateId: payment.id, transactionId: operation.id, actorId: actor.id,
      eventType: "payment.cancelled", amount: ZERO, currency: payment.currency, payload: { reason: body.reason }
    });
    await createReceipt(tx, payment.id, "cancellation", actor, { reason: body.reason, tenderIds: captured.map((item) => item.id) });
    return paymentOrThrow(tx, payment.id);
  });
}

function serializePayment(payment) {
  if (!payment) return payment;
  return { ...payment, remainingAmount: decimal(payment.totalAmount).minus(decimal(payment.paidAmount).minus(payment.refundedAmount)) };
}

async function get(prisma, id) {
  return serializePayment(await paymentOrThrow(prisma, id));
}

async function list(prisma, query) {
  const page = await repository.list(prisma, query);
  page.items = page.items.map(serializePayment);
  return page;
}

async function verifyLedgerEntries(entries) {
  let previousHash = "";
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.sequence !== index + 1 || entry.previousHash !== previousHash || ledgerHash(entry) !== entry.hash) {
      return { valid: false, entries: entries.length, failedSequence: entry.sequence };
    }
    previousHash = entry.hash;
  }
  return { valid: true, entries: entries.length, headHash: previousHash };
}

async function history(prisma, paymentId) {
  await paymentOrThrow(prisma, paymentId, {});
  const [ledger, receipts] = await Promise.all([
    prisma.paymentLedgerEntry.findMany({ where: { paymentId }, orderBy: { sequence: "asc" } }),
    prisma.paymentReceipt.findMany({ where: { paymentId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
  ]);
  return { ledger, receipts, verification: await verifyLedgerEntries(ledger) };
}

async function receipt(prisma, number) {
  if (!/^CL-BON-\d{4}-\d{6}$/.test(String(number || ""))) throw publicError("Bon niet gevonden.", 404);
  const item = await prisma.paymentReceipt.findUnique({ where: { number } });
  if (!item) throw publicError("Bon niet gevonden.", 404);
  return item;
}

async function createDrawer(prisma, body) {
  try {
    return await prisma.cashDrawer.create({ data: { name: body.name } });
  } catch (error) {
    if (error.code === "P2002") throw publicError("Er bestaat al een kassalade met deze naam.", 409);
    throw error;
  }
}

function drawerInclude() {
  return { shifts: { where: { status: "open" }, orderBy: { openedAt: "desc" }, take: 1 } };
}

function listDrawers(prisma) {
  return prisma.cashDrawer.findMany({ include: drawerInclude(), orderBy: [{ active: "desc" }, { name: "asc" }] });
}

async function openShift(prisma, actor, drawerId, body) {
  return serializable(prisma, async (tx) => {
    await lock(tx, `cash-drawer:${drawerId}`);
    const drawer = await tx.cashDrawer.findUnique({ where: { id: drawerId } });
    if (!drawer || !drawer.active) throw publicError("Kassalade niet gevonden of niet actief.", 404);
    if (await tx.cashDrawerShift.findFirst({ where: { drawerId, status: "open" } })) throw publicError("Deze kassalade heeft al een geopende dienst.", 409);
    const openingBalance = decimal(body.openingBalance, "Openingssaldo");
    const shift = await tx.cashDrawerShift.create({ data: { drawerId, openingBalance, openedById: actor.id } });
    await appendLedger(tx, {
      aggregateType: "shift", aggregateId: shift.id, transactionId: crypto.randomUUID(), actorId: actor.id,
      eventType: "shift.opened", tenderType: "cash", amount: openingBalance, payload: { drawerId, openingBalance: money(openingBalance) }
    });
    return tx.cashDrawerShift.findUnique({ where: { id: shift.id }, include: { drawer: true, openedBy: { select: { id: true, username: true } } } });
  });
}

function groupMoney(items, field) {
  const totals = {};
  for (const item of items) totals[item[field]] = money(decimal(totals[item[field]] || 0).plus(item.amount));
  return totals;
}

async function settlementSnapshot(tx, shift, closingBalance, closedAt) {
  const [tenders, refundAllocations] = await Promise.all([
    tx.paymentTender.findMany({ where: { shiftId: shift.id, status: "captured" }, orderBy: { createdAt: "asc" } }),
    tx.paymentRefundAllocation.findMany({ where: { shiftId: shift.id }, include: { tender: { select: { type: true } } }, orderBy: { createdAt: "asc" } })
  ]);
  const paymentIds = [...new Set(tenders.map((item) => item.paymentId))];
  const receipts = paymentIds.length ? await tx.paymentReceipt.findMany({
    where: { paymentId: { in: paymentIds }, createdAt: { gte: shift.openedAt, lte: closedAt } },
    orderBy: { createdAt: "asc" }, select: { number: true }
  }) : [];
  const cashPayments = sum(tenders.filter((item) => item.type === "cash").map((item) => item.amount));
  const cashRefunds = sum(refundAllocations.filter((item) => item.tender.type === "cash").map((item) => item.amount));
  const expectedClosingBalance = decimal(shift.openingBalance).plus(cashPayments).minus(cashRefunds);
  const actual = decimal(closingBalance);
  return canonicalValue({
    schemaVersion: 1,
    shiftId: shift.id,
    drawerId: shift.drawerId,
    openedAt: shift.openedAt,
    closedAt,
    openingBalance: money(shift.openingBalance),
    cashPayments: money(cashPayments),
    cashRefunds: money(cashRefunds),
    expectedClosingBalance: money(expectedClosingBalance),
    closingBalance: money(actual),
    variance: money(actual.minus(expectedClosingBalance)),
    tenderTotals: groupMoney(tenders, "type"),
    refundTotals: groupMoney(refundAllocations.map((item) => ({ ...item, type: item.tender.type })), "type"),
    transactionCount: paymentIds.length,
    receiptCount: receipts.length,
    firstReceiptNumber: receipts.length ? receipts[0].number : "",
    lastReceiptNumber: receipts.length ? receipts.at(-1).number : ""
  });
}

async function closeShift(prisma, actor, shiftId, body) {
  return serializable(prisma, async (tx) => {
    await lock(tx, `cash-shift:${shiftId}`);
    const shift = await tx.cashDrawerShift.findUnique({ where: { id: shiftId }, include: { drawer: true } });
    if (!shift) throw publicError("Kassalade-dienst niet gevonden.", 404);
    if (shift.status !== "open") throw publicError("Kassalade-dienst is al gesloten.", 409);
    const closedAt = new Date();
    const settlement = await settlementSnapshot(tx, shift, body.closingBalance, closedAt);
    const updated = await tx.cashDrawerShift.update({ where: { id: shift.id }, data: {
      status: "closed",
      expectedClosingBalance: settlement.expectedClosingBalance,
      closingBalance: settlement.closingBalance,
      variance: settlement.variance,
      settlement,
      notes: body.notes || "",
      closedById: actor.id,
      closedAt
    } });
    await appendLedger(tx, {
      aggregateType: "shift", aggregateId: shift.id, transactionId: crypto.randomUUID(), actorId: actor.id,
      eventType: "shift.closed", tenderType: "cash", amount: settlement.closingBalance, payload: settlement, createdAt: closedAt
    });
    return { ...updated, drawer: shift.drawer };
  });
}

async function currentSettlement(prisma, shift) {
  if (shift.status === "closed") return shift.settlement;
  return settlementSnapshot(prisma, shift, shift.openingBalance, new Date());
}

async function getShift(prisma, id) {
  const shift = await prisma.cashDrawerShift.findUnique({ where: { id }, include: {
    drawer: true,
    openedBy: { select: { id: true, username: true } },
    closedBy: { select: { id: true, username: true } },
    ledgerEntries: { orderBy: { sequence: "asc" } }
  } });
  if (!shift) throw publicError("Kassalade-dienst niet gevonden.", 404);
  return { ...shift, settlement: await currentSettlement(prisma, shift), ledgerVerification: await verifyLedgerEntries(shift.ledgerEntries) };
}

function listShifts(prisma, query) {
  const where = {};
  if (query.drawerId) where.drawerId = String(query.drawerId).slice(0, 200);
  if (["open", "closed"].includes(query.status)) where.status = query.status;
  return prisma.cashDrawerShift.findMany({ where, include: { drawer: true }, orderBy: { openedAt: "desc" }, take: 100 });
}

module.exports = {
  addTenders,
  cancel,
  closeShift,
  create,
  createDrawer,
  get,
  getShift,
  history,
  list,
  listDrawers,
  listShifts,
  openShift,
  receipt,
  refund,
  verifyLedgerEntries
};
