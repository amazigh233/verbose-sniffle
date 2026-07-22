"use strict";

const TIME_ZONE = "Europe/Amsterdam";
const SOURCE_NAME = "EnergyZero";
const SOURCE_URL = "https://docs.api.energyzero.nl/docs/api/rest/public/energy-market-service-get-prices";
const FRESH_CACHE_KEY = "climature:energy-prices:fresh:v1";
const LAST_GOOD_CACHE_KEY = "climature:energy-prices:last-good:v1";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function calendarParts(value) {
  const parts = Object.fromEntries(dayFormatter.formatToParts(value).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

function calendarKey(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function dateKey(value) {
  return calendarKey(calendarParts(value instanceof Date ? value : new Date(value)));
}

function addCalendarDays(parts, amount) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount, 12));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function previousMonth(parts) {
  const date = new Date(Date.UTC(parts.year, parts.month - 2, 1, 12));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function apiDate(parts) {
  return `${String(parts.day).padStart(2, "0")}-${String(parts.month).padStart(2, "0")}-${parts.year}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function publicError(message, code = "ENERGY_PRICES_UNAVAILABLE") {
  return Object.assign(new Error(message), { status: 502, code });
}

function seriesFromPayload(payload, label) {
  const values = payload && (payload.all_in_with_vat || payload.allInWithVat);
  if (!Array.isArray(values) || !values.length) throw publicError(`${label} bevat geen prijsgegevens.`, "ENERGY_PRICE_INVALID_RESPONSE");
  const points = values.map((entry) => {
    const start = String(entry && entry.start || "");
    const end = String(entry && entry.end || "");
    const price = Number(entry && entry.price && entry.price.value);
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || !Number.isFinite(price)) {
      throw publicError(`${label} bevat ongeldige prijsgegevens.`, "ENERGY_PRICE_INVALID_RESPONSE");
    }
    return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), price };
  });
  return points.sort((left, right) => left.start.localeCompare(right.start));
}

function uniquePoints(points) {
  const byStart = new Map();
  points.forEach((point) => byStart.set(point.start, point));
  return [...byStart.values()].sort((left, right) => left.start.localeCompare(right.start));
}

function currentPoint(points, now) {
  const timestamp = now.getTime();
  return points.find((point) => Date.parse(point.start) <= timestamp && timestamp < Date.parse(point.end)) || null;
}

function withCurrentPoints(value, now) {
  const result = clone(value);
  result.electricity.current = currentPoint(result.electricity.points || [], now);
  result.gas.current = currentPoint(result.gas.points || [], now);
  return result;
}

function normalizeEnergyPrices(electricityPayload, gasPayloads, now = new Date()) {
  const todayParts = calendarParts(now);
  const today = calendarKey(todayParts);
  const tomorrow = calendarKey(addCalendarDays(todayParts, 1));
  const gasStart = calendarKey(addCalendarDays(todayParts, -29));

  const electricity = seriesFromPayload(electricityPayload, "Elektriciteitsrespons")
    .filter((point) => {
      const key = dateKey(point.start);
      return key === today || key === tomorrow;
    })
    .map((point) => ({ ...point, forecast: dateKey(point.start) === tomorrow }));
  const gas = uniquePoints((gasPayloads || []).flatMap((payload) => seriesFromPayload(payload, "Gasrespons")))
    .filter((point) => {
      const key = dateKey(point.start);
      return key >= gasStart && key <= today;
    });

  if (!electricity.length || !gas.length) throw publicError("De energieprijsbron bevat geen bruikbare actuele periodes.", "ENERGY_PRICE_INVALID_RESPONSE");
  const fetchedAt = now.toISOString();
  return {
    source: { name: SOURCE_NAME, url: SOURCE_URL, fetchedAt, status: "fresh" },
    electricity: {
      unit: "EUR/kWh",
      interval: "hour",
      current: currentPoint(electricity, now),
      points: electricity
    },
    gas: {
      unit: "EUR/m3",
      interval: "day",
      current: currentPoint(gas, now),
      points: gas
    }
  };
}

function endpoint(baseUrl, path, params) {
  const url = new URL(path, String(baseUrl || "https://public.api.energyzero.nl").replace(/\/*$/, "/"));
  Object.entries(params || {}).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url;
}

async function responseJson(fetchImpl, url, signal) {
  const response = await fetchImpl(url, { headers: { Accept: "application/json" }, signal });
  if (!response || !response.ok) throw publicError("De live energieprijsbron is tijdelijk niet bereikbaar.");
  try {
    return await response.json();
  } catch (_error) {
    throw publicError("De live energieprijsbron gaf geen geldige JSON-respons.", "ENERGY_PRICE_INVALID_RESPONSE");
  }
}

async function fetchEnergyPrices(config, options = {}) {
  const fetchImpl = options.fetch || fetch;
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const parts = calendarParts(now);
  const prior = previousMonth(parts);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(config.energyPriceTimeoutMs || 8000));
  if (typeof timeout.unref === "function") timeout.unref();
  try {
    const requests = [
      responseJson(fetchImpl, endpoint(config.energyPriceApiUrl, "/public/v1/prices", {
        date: apiDate(parts),
        interval: "INTERVAL_HOUR",
        energyType: "ENERGY_TYPE_ELECTRICITY"
      }), controller.signal),
      responseJson(fetchImpl, endpoint(config.energyPriceApiUrl, "/public/v1/prices/month", {
        month: parts.month,
        year: parts.year,
        energyType: "ENERGY_TYPE_GAS"
      }), controller.signal),
      responseJson(fetchImpl, endpoint(config.energyPriceApiUrl, "/public/v1/prices/month", {
        month: prior.month,
        year: prior.year,
        energyType: "ENERGY_TYPE_GAS"
      }), controller.signal)
    ];
    const [electricity, ...gas] = await Promise.all(requests);
    return normalizeEnergyPrices(electricity, gas, now);
  } catch (error) {
    controller.abort();
    if (error && error.name === "AbortError") throw publicError("De live energieprijsbron reageerde niet op tijd.", "ENERGY_PRICE_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function createEnergyPriceService({ store, config, logger, fetchImpl, now = () => new Date() }) {
  let inFlight = null;
  const freshTtl = Math.max(1000, Number(config.energyPriceCacheTtlMs || 5 * 60 * 1000));
  const staleTtl = Math.max(freshTtl, Number(config.energyPriceStaleTtlMs || 24 * 60 * 60 * 1000));

  async function refresh() {
    try {
      const result = await fetchEnergyPrices(config, { fetch: fetchImpl, now: now() });
      await Promise.all([
        store.setJson(FRESH_CACHE_KEY, result, freshTtl),
        store.setJson(LAST_GOOD_CACHE_KEY, result, staleTtl)
      ]);
      return withCurrentPoints(result, now());
    } catch (error) {
      if (logger && typeof logger.warn === "function") {
        logger.warn({ errorCategory: error && (error.code || error.name) || "ENERGY_PRICE_ERROR", source: SOURCE_NAME }, "energy_prices.refresh_failed");
      }
      const fallback = await store.getJson(LAST_GOOD_CACHE_KEY);
      if (!fallback) throw error;
      const result = withCurrentPoints(fallback, now());
      result.source.status = "stale";
      result.source.warning = "De live bron is tijdelijk niet bereikbaar. De laatst geldige prijzen worden getoond.";
      result.source.staleAgeSeconds = Math.max(0, Math.floor((now().getTime() - Date.parse(result.source.fetchedAt)) / 1000));
      return result;
    }
  }

  return {
    async get(options = {}) {
      if (!options.force) {
        const cached = await store.getJson(FRESH_CACHE_KEY);
        if (cached) return withCurrentPoints(cached, now());
      }
      if (!inFlight) inFlight = refresh().finally(() => { inFlight = null; });
      return inFlight;
    }
  };
}

module.exports = {
  TIME_ZONE,
  calendarParts,
  dateKey,
  fetchEnergyPrices,
  normalizeEnergyPrices,
  seriesFromPayload,
  createEnergyPriceService
};
