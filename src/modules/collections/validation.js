"use strict";

const { date, email, identifier, money, optionalDate, phone, z, validationError } = require("../../shared/validation");

const base = z.object({ id: identifier.optional(), createdAt: z.union([z.string(), z.date()]).optional() });
const line = z.object({
  productId: z.string().max(200).optional(), componentKey: z.string().max(100).optional(),
  lineKind: z.enum(["item", "discount"]).optional(), vatRefundEligible: z.union([z.boolean(), z.literal("true"), z.literal("false")]).optional(),
  description: z.string().trim().min(1).max(500), qty: money, unit: z.string().trim().min(1).max(40), priceExVat: money, vatRate: money
}).passthrough();

const schemas = {
  customers: base.extend({ firstName: z.string().max(100).optional().default(""), lastName: z.string().max(120).optional().default(""), companyName: z.string().max(180).optional().default(""), email: email.optional().default(""), phone: phone.optional().default(""), address: z.string().max(200).optional(), postalCode: z.string().max(20).optional(), city: z.string().max(100).optional(), notes: z.string().max(10000).optional() }).passthrough().refine((item) => item.firstName || item.lastName || item.companyName, { message: "Vul een klantnaam of bedrijfsnaam in." }),
  customerNotes: base.extend({ customerId: identifier, date: date.optional(), type: z.string().max(80).optional(), body: z.string().trim().min(1).max(10000) }).passthrough(),
  products: base.extend({
    category: z.string().trim().min(1).max(100), brand: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(180),
    specs: z.string().max(1000).optional(), priceExVat: money, vatRate: money, description: z.string().max(4000).optional(),
    adviceType: z.enum(["", "allelectric", "hybride"]).optional(), capacityKw: money.optional(), capacityKwh: money.optional(),
    connection: z.enum(["", "1fase", "3fase"]).optional(), subsidy: money.optional(), sku: z.string().trim().max(80).optional(),
    stockQuantity: money.optional(), minimumStock: money.optional(), stockUnit: z.string().trim().max(40).optional(), stockLocation: z.string().trim().max(120).optional()
  }).passthrough(),
  quotes: base.extend({ quoteNumber: z.string().trim().min(1).max(80), customerId: identifier, quoteDate: date, validUntil: date, status: z.enum(["concept", "verstuurd", "geaccepteerd", "geaccepteerd/aanbetaling", "afgewezen"]).optional(), lines: z.array(line).min(1).max(200) }).passthrough(),
  invoices: base.extend({ invoiceNumber: z.string().trim().min(1).max(80), customerId: identifier, invoiceDate: date, dueDate: date, status: z.enum(["concept", "verzonden", "betaald", "verlopen", "geannuleerd"]).optional(), lines: z.array(line).min(1).max(200) }).passthrough(),
  installations: base.extend({ customerId: identifier, plannedDate: date, startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), durationHours: money.optional(), status: z.string().max(80).optional(), employeeId: z.union([identifier, z.null(), z.literal("")]).optional(), workType: z.enum(["air_conditioning", "heat_pump", "boiler", "home_battery", "other"]).optional() }).passthrough(),
  advices: base.extend({ customerId: identifier, kind: z.string().trim().min(1).max(100), title: z.string().max(200).optional(), investment: money.optional(), subsidy: money.optional(), yearlySaving: money.optional() }).passthrough(),
  salesOpportunities: base.extend({ title: z.string().trim().min(1).max(200), stage: z.enum(["lead", "contact", "advies", "offerte_maken", "offerte_verstuurd", "gewonnen", "verloren"]).optional(), customerId: z.union([identifier, z.null(), z.literal("")]).optional(), email: email.optional(), phone: phone.optional(), expectedValue: money.optional(), expectedCloseDate: optionalDate.optional(), followUpDate: optionalDate.optional() }).passthrough(),
  salesAppointments: base.extend({ title: z.string().trim().min(1).max(200), date, startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), type: z.enum(["belafspraak", "videogesprek", "bezoek", "adviesgesprek", "overig"]).optional(), status: z.enum(["gepland", "afgerond", "geannuleerd"]).optional() }).passthrough()
};

function validateCollectionWrite(req, _res, next) {
  const schema = schemas[req.params.collection];
  if (!schema) return next();
  const result = schema.safeParse(req.body);
  if (!result.success) return next(validationError(result.error));
  req.body = result.data;
  next();
}

module.exports = { schemas, validateCollectionWrite };
