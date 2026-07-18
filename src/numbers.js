"use strict";

const { Prisma } = require("@prisma/client");

/**
 * Parse numbers coming from JSON, HTML number inputs or Dutch formatted text.
 * Numeric values must be returned directly: stringifying a decimal and then
 * stripping its dot was the cause of severely inflated financial amounts.
 */
function parseLocalizedNumber(value, fallback = 0) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (value == null || value === "") return fallback;

  let normalized = String(value)
    .trim()
    .replace(/[\s\u00a0€$£']/g, "")
    .replace(/[^\d,\.\-+]/g, "");
  if (!normalized) return fallback;

  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    // The last separator is the decimal separator; earlier separators group.
    const decimal = comma > dot ? "," : ".";
    const grouping = decimal === "," ? /\./g : /,/g;
    normalized = normalized.replace(grouping, "").replace(decimal, ".");
  } else if (comma >= 0) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    // A lone dot is the decimal separator used by JSON and <input type=number>.
    normalized = normalized.replace(/,/g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value) {
  const number = parseLocalizedNumber(value);
  return new Prisma.Decimal(String(number)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

function multiplyMoney(left, right) {
  return new Prisma.Decimal(String(parseLocalizedNumber(left))).mul(String(parseLocalizedNumber(right))).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

function percentageMoney(amount, percentage) {
  return new Prisma.Decimal(String(parseLocalizedNumber(amount))).mul(String(parseLocalizedNumber(percentage))).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

function sumMoney(values) {
  return (values || []).reduce((sum, value) => sum.plus(String(parseLocalizedNumber(value))), new Prisma.Decimal(0)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

module.exports = { multiplyMoney, parseLocalizedNumber, percentageMoney, roundMoney, sumMoney };
