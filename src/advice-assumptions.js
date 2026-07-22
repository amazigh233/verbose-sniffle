"use strict";

const readXlsxFile = require("read-excel-file/node");
const { DEFAULT_SETTINGS } = require("./defaults");
const { parseLocalizedNumber } = require("./numbers");

const CBS_URL = "https://opendata.cbs.nl/ODataApi/OData/85592NED/TypedDataSet?$filter=Btw%20eq%20%27A048944%27";
const CBS_SOURCE_URL = "https://www.cbs.nl/nl-nl/cijfers/detail/85592NED";
const RVO_LIST_URL = "https://www.rvo.nl/subsidies-financiering/isde/meldcodelijsten";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, extra) {
  const output = clone(base || {});
  Object.entries(extra || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) output[key] = clone(value);
    else if (isPlainObject(value) && isPlainObject(output[key])) output[key] = deepMerge(output[key], value);
    else if (value !== undefined) output[key] = value;
  });
  return output;
}

function number(value, fallback = 0) {
  return parseLocalizedNumber(value, fallback);
}

function moneyNumber(value) {
  return number(String(value || "").replace(/[^\d,.-]/g, ""));
}

function round(value, decimals = 4) {
  const factor = Math.pow(10, decimals);
  return Math.round(number(value) * factor) / factor;
}

function productId(product, connection, index) {
  const slug = String(product && product.name || "batterij")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return String(product && product.id || `${connection}-${slug || "batterij"}-${number(product && product.kwh)}-${index + 1}`);
}

function normalizeAssumptions(input) {
  const assumptions = deepMerge(DEFAULT_SETTINGS.adviceAssumptions, input || {});
  assumptions.energy = assumptions.energy || {};
  if (!Array.isArray(assumptions.energy.priceHistory)) assumptions.energy.priceHistory = [];
  assumptions.energy.priceHistory = assumptions.energy.priceHistory.slice(0, 12);
  assumptions.batteryProducts = assumptions.batteryProducts || {};
  ["1fase", "3fase"].forEach((connection) => {
    assumptions.batteryProducts[connection] = (assumptions.batteryProducts[connection] || []).map((product, index) => ({
      ...product,
      id: productId(product, connection, index)
    }));
  });
  return assumptions;
}

function periodLabel(period) {
  const match = String(period || "").match(/^(\d{4})MM(\d{2})$/);
  if (!match) return String(period || "");
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return date.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
}

function monthlyCbsRows(rows) {
  return (rows || [])
    .filter((row) => row && /^\d{4}MM(?:0[1-9]|1[0-2])$/.test(String(row.Perioden || "")))
    .sort((a, b) => String(b.Perioden).localeCompare(String(a.Perioden)))
    .slice(0, 12);
}

function priceHistoryFromCbsRows(rows, refreshedAt) {
  return monthlyCbsRows(rows).map((row) => {
    const gasPrice = round(number(row.VariabelLeveringstariefContractprijs_3) + number(row.OpslagDuurzameEnergieODE_5) + number(row.Energiebelasting_6), 4);
    const electricityPrice = round(number(row.VariabelLeveringstariefContractprijs_9) + number(row.OpslagDuurzameEnergieODE_13) + number(row.Energiebelasting_14), 4);
    const hasDynamicPrice = row.VariabelLeveringstariefDynamisch_12 !== null && row.VariabelLeveringstariefDynamisch_12 !== undefined && row.VariabelLeveringstariefDynamisch_12 !== "";
    const dynamicElectricityPrice = hasDynamicPrice
      ? round(number(row.VariabelLeveringstariefDynamisch_12) + number(row.OpslagDuurzameEnergieODE_13) + number(row.Energiebelasting_14), 4)
      : electricityPrice;
    return {
      periodKey: row.Perioden,
      periodLabel: periodLabel(row.Perioden),
      gasPrice,
      electricityPrice,
      dynamicElectricityPrice,
      dynamicPriceFallback: !hasDynamicPrice,
      vatIncluded: true,
      sourceUrl: CBS_SOURCE_URL,
      refreshedAt
    };
  });
}

function assumptionsFromCbsRows(rows, current = DEFAULT_SETTINGS.adviceAssumptions, refreshedAt = new Date().toISOString()) {
  const priceHistory = priceHistoryFromCbsRows(rows, refreshedAt);
  const latest = priceHistory[0];
  if (!latest) throw Object.assign(new Error("CBS gaf geen maandelijkse energietarieven terug."), { status: 502 });
  return deepMerge(current, {
    energy: {
      gasPrice: latest.gasPrice,
      electricityPrice: latest.electricityPrice,
      dynamicElectricityPrice: latest.dynamicElectricityPrice,
      priceHistory
    },
    sources: {
      energy: {
        label: "CBS gemiddelde energietarieven voor consumenten",
        period: latest.periodLabel,
        periodKey: latest.periodKey,
        refreshedAt,
        url: CBS_SOURCE_URL
      }
    }
  });
}

async function fetchCbsAssumptions(current, fetchImpl = fetch) {
  const response = await fetchImpl(CBS_URL);
  if (!response.ok) throw Object.assign(new Error("CBS-tarieven konden niet worden opgehaald."), { status: 502 });
  const payload = await response.json();
  return assumptionsFromCbsRows(payload.value || [], current);
}

function absolutize(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return new URL(url, RVO_LIST_URL).toString();
}

function findRvoWarmtepompXlsx(html) {
  const links = [...String(html || "").matchAll(/href="([^"]+\.xlsx[^"]*)"/gi)].map((match) => match[1].replace(/&amp;/g, "&"));
  return absolutize(links.find((link) => /warmtepomp/i.test(decodeURIComponent(link))) || links[0] || "");
}

function rowText(row) {
  return (row || []).join(" ").toLowerCase();
}

function headerIndex(headers, patterns) {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(String(header || "").toLowerCase())));
}

async function parseRvoWarmtepompWorkbook(buffer, assumptions) {
  const workbookRows = await readXlsxFile(buffer);
  const rawRows = workbookRows.flatMap((entry) => {
    if (Array.isArray(entry)) return [entry];
    if (entry && Array.isArray(entry.data)) return entry.data;
    return [];
  });
  const rows = rawRows.map((row) => row.map((cell) => cell == null ? "" : String(cell)));
  const headerRowIndex = rows.findIndex((row) => /meldcode/i.test(rowText(row)) && /subsid/i.test(rowText(row)));
  if (headerRowIndex < 0) return assumptions;
  const headers = rows[headerRowIndex];
  const meldcodeIndex = headerIndex(headers, [/meldcode/]);
  const subsidyIndex = headerIndex(headers, [/subsid/, /bedrag/]);
  const searchRows = rows.slice(headerRowIndex + 1);

  function updateProducts(products) {
    return (products || []).map((product) => {
      const needle = String(product.meldcode || product.rvoSearch || product.name || "").toLowerCase();
      if (!needle) return product;
      const row = searchRows.find((candidate) => rowText(candidate).includes(needle));
      if (!row) return product;
      const subsidy = subsidyIndex >= 0 ? moneyNumber(row[subsidyIndex]) : 0;
      return Object.assign({}, product, {
        subsidy: subsidy || product.subsidy,
        meldcode: meldcodeIndex >= 0 ? String(row[meldcodeIndex] || product.meldcode || "") : product.meldcode
      });
    });
  }

  return deepMerge(assumptions, {
    warmtepompProducts: {
      allelectric: updateProducts(assumptions.warmtepompProducts && assumptions.warmtepompProducts.allelectric),
      hybride: updateProducts(assumptions.warmtepompProducts && assumptions.warmtepompProducts.hybride)
    }
  });
}

async function fetchRvoAssumptions(current, fetchImpl = fetch) {
  const page = await fetchImpl(RVO_LIST_URL);
  if (!page.ok) throw Object.assign(new Error("RVO-meldcodelijstpagina kon niet worden opgehaald."), { status: 502 });
  const html = await page.text();
  const xlsxUrl = findRvoWarmtepompXlsx(html);
  if (!xlsxUrl) {
    return deepMerge(current, {
      sources: {
        subsidies: {
          label: "RVO meldcodelijst gevonden, Excel-download niet herkend",
          refreshedAt: new Date().toISOString(),
          url: RVO_LIST_URL
        }
      }
    });
  }
  const file = await fetchImpl(xlsxUrl);
  if (!file.ok) throw Object.assign(new Error("RVO-meldcodelijst kon niet worden gedownload."), { status: 502 });
  const parsed = await parseRvoWarmtepompWorkbook(Buffer.from(await file.arrayBuffer()), current);
  return deepMerge(parsed, {
    sources: {
      subsidies: {
        label: "RVO ISDE meldcodelijst warmtepompen",
        refreshedAt: new Date().toISOString(),
        url: xlsxUrl
      }
    }
  });
}

async function refreshAdviceAssumptions(current, options = {}) {
  const fetchImpl = options.fetch || fetch;
  let assumptions = normalizeAssumptions(current);
  const errors = [];
  try {
    assumptions = await fetchCbsAssumptions(assumptions, fetchImpl);
  } catch (error) {
    errors.push(error.message || "CBS-refresh mislukt.");
  }
  try {
    assumptions = await fetchRvoAssumptions(assumptions, fetchImpl);
  } catch (error) {
    errors.push(error.message || "RVO-refresh mislukt.");
  }
  assumptions.sources = assumptions.sources || {};
  assumptions.sources.lastRefresh = {
    refreshedAt: new Date().toISOString(),
    ok: errors.length === 0,
    errors
  };
  return assumptions;
}

async function refreshEnergyAssumptions(current, options = {}) {
  const refreshedAt = new Date().toISOString();
  let assumptions = normalizeAssumptions(current);
  let errorMessage = "";
  try {
    assumptions = await fetchCbsAssumptions(assumptions, options.fetch || fetch);
  } catch (error) {
    errorMessage = error.message || "CBS-refresh mislukt.";
  }
  assumptions.sources = assumptions.sources || {};
  assumptions.sources.lastEnergyRefresh = {
    refreshedAt,
    ok: !errorMessage,
    errors: errorMessage ? [errorMessage] : []
  };
  return assumptions;
}

module.exports = {
  assumptionsFromCbsRows,
  deepMerge,
  findRvoWarmtepompXlsx,
  normalizeAssumptions,
  parseRvoWarmtepompWorkbook,
  priceHistoryFromCbsRows,
  refreshEnergyAssumptions,
  refreshAdviceAssumptions
};
