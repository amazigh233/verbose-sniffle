"use strict";

const { validate, z } = require("../../shared/validation");

function paginationValidation({ sorts, filters = [] }) {
  const shape = {
    page: z.coerce.number().int().min(1).max(1_000_000).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().trim().max(120).optional(),
    sortBy: z.enum(sorts).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional()
  };
  for (const filter of filters) shape[filter] = z.string().trim().max(200).optional();
  return validate({ query: z.object(shape).strict() });
}

module.exports = { paginationValidation };
