"use strict";

function validationError(message) {
  return Object.assign(new Error(message), { status: 400, code: "VALIDATION_ERROR" });
}

function integer(value, fallback, name, minimum, maximum) {
  if (value === undefined || value === null || value === "") return fallback;
  if (!/^\d+$/.test(String(value))) throw validationError(`${name} is ongeldig.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw validationError(`${name} is ongeldig.`);
  return parsed;
}

function parsePagination(query, allowedSorts, defaultSort) {
  const page = integer(query.page, 1, "Pagina", 1, 1_000_000);
  const pageSize = integer(query.pageSize, 25, "Paginagrootte", 1, 100);
  const sortBy = String(query.sortBy || defaultSort).trim();
  const sortOrder = String(query.sortOrder || "asc").trim().toLowerCase();
  if (!allowedSorts.includes(sortBy)) throw validationError("Sorteerveld is ongeldig.");
  if (!["asc", "desc"].includes(sortOrder)) throw validationError("Sorteervolgorde is ongeldig.");
  const search = String(query.search || "").trim();
  if (search.length > 200) throw validationError("Zoekterm is te lang.");
  return { page, pageSize, sortBy, sortOrder, search };
}

function pageResponse(items, page, pageSize, totalItems) {
  return { items, page, pageSize, totalItems, totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize) };
}

module.exports = { pageResponse, parsePagination, validationError };
