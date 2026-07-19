"use strict";

const { date, identifier, validate, z } = require("../../shared/validation");

const monetaryAmount = z.union([z.number(), z.string().trim().min(1).max(40)]).refine((value) => {
  const normalized = String(value).replace(/[\s€]/g, "").replace(",", ".");
  return /^\d{1,12}(?:\.\d{1,2})?$/.test(normalized) && Number(normalized) <= 99_999_999_999.99;
}, "Gebruik een positief geldbedrag met maximaal twee decimalen.");

const tender = z.object({
  type: z.enum(["cash", "pin", "credit_card", "apple_pay", "google_pay"]),
  amount: monetaryAmount,
  amountReceived: monetaryAmount.optional(),
  shiftId: identifier.optional(),
  provider: z.string().trim().max(80).optional(),
  externalReference: z.string().trim().max(200).optional(),
  cardBrand: z.string().trim().max(40).optional(),
  cardLast4: z.string().regex(/^\d{4}$/).optional()
}).strict();

const createBody = z.object({
  invoiceId: identifier.optional(),
  customerId: identifier.optional(),
  amount: monetaryAmount.optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional().default("EUR"),
  discountAmount: monetaryAmount.optional(),
  discountReason: z.string().trim().max(500).optional(),
  tipAmount: monetaryAmount.optional(),
  tenders: z.array(tender).max(20).optional().default([])
}).strict().refine((body) => body.invoiceId || body.amount !== undefined, {
  message: "Koppel een factuur of geef een bedrag op."
}).refine((body) => body.discountAmount === undefined || Number(String(body.discountAmount).replace(",", ".")) === 0 || Boolean(body.discountReason), {
  message: "Een kortingsreden is verplicht bij korting.", path: ["discountReason"]
});

const refundAllocation = z.object({
  tenderId: identifier,
  amount: monetaryAmount,
  externalReference: z.string().trim().max(200).optional()
}).strict();

const list = validate({ query: z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["pending", "partially_paid", "paid", "partially_refunded", "refunded", "cancelled"]).optional(),
  invoiceId: identifier.optional(),
  customerId: identifier.optional(),
  from: date.optional(),
  to: date.optional()
}).strict() });

module.exports = {
  addTenders: validate({ body: z.object({ tenders: z.array(tender).min(1).max(20) }).strict() }),
  cancel: validate({ body: z.object({ reason: z.string().trim().min(3).max(500) }).strict() }),
  closeShift: validate({ body: z.object({ closingBalance: monetaryAmount, notes: z.string().trim().max(2000).optional() }).strict() }),
  create: validate({ body: createBody }),
  createDrawer: validate({ body: z.object({ name: z.string().trim().min(1).max(120) }).strict() }),
  list,
  openShift: validate({ body: z.object({ openingBalance: monetaryAmount }).strict() }),
  refund: validate({ body: z.object({
    amount: monetaryAmount,
    reason: z.string().trim().min(3).max(500),
    cashShiftId: identifier.optional(),
    externalReference: z.string().trim().max(200).optional(),
    allocations: z.array(refundAllocation).min(1).max(20).optional()
  }).strict() })
};
