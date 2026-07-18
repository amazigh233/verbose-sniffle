"use strict";

const { z, ZodError } = require("zod");

const identifier = z.string().trim().min(1).max(200).regex(/^[\p{L}\p{N}_.:@-]+$/u, "Bevat ongeldige tekens.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Gebruik een datum als JJJJ-MM-DD.").refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, "Datum bestaat niet.");
const optionalDate = z.union([z.literal(""), date]);
const email = z.union([z.literal(""), z.email("Gebruik een geldig e-mailadres.").max(254)]);
const phone = z.string().trim().max(40).refine((value) => !value || /^[+()\d\s.-]{6,40}$/.test(value), "Gebruik een geldig telefoonnummer.");
const money = z.union([z.number(), z.string().trim().min(1)]).refine((value) => {
  const normalized = String(value).replace(/[\s€]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && Math.abs(parsed) <= 99_999_999_999.99;
}, "Gebruik een geldig geldbedrag.");

function validationError(error) {
  const issues = error instanceof ZodError ? error.issues : [];
  return Object.assign(new Error("De aanvraag bevat ongeldige gegevens."), {
    status: 400,
    code: "VALIDATION_ERROR",
    details: issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
  });
}

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

function validate(schemas) {
  return (req, _res, next) => {
    try {
      if (schemas.params) req.validatedParams = parse(schemas.params, req.params);
      if (schemas.query) req.validatedQuery = parse(schemas.query, req.query);
      if (schemas.body) req.body = parse(schemas.body, req.body);
      next();
    } catch (error) { next(error); }
  };
}

const mutationEnvelope = z.union([z.undefined(), z.record(z.string().max(100), z.unknown())]);
function validateMutationEnvelope(req, _res, next) {
  if (!req.path.startsWith("/api/") || !["POST", "PUT", "PATCH"].includes(req.method) || req.is("multipart/form-data")) return next();
  try { req.body = parse(mutationEnvelope, req.body); next(); }
  catch (error) { next(error); }
}

function validateParam(value, name) {
  try { parse(identifier, value); }
  catch (error) {
    error.details = (error.details || []).map((item) => ({ ...item, path: name }));
    throw error;
  }
}

module.exports = { date, email, identifier, money, optionalDate, phone, validate, validateMutationEnvelope, validateParam, validationError, z };
