"use strict";

const { MemoryCoordinationStore } = require("../src/infrastructure/coordination");
const {
  dateKey,
  normalizeEnergyPrices,
  seriesFromPayload,
  createEnergyPriceService
} = require("../src/energy-prices");

function point(start, hours, price) {
  const startDate = new Date(start);
  return {
    start: startDate.toISOString(),
    end: new Date(startDate.getTime() + hours * 60 * 60 * 1000).toISOString(),
    price: { value: String(price) }
  };
}

function hourly(start, count, initial = 0.2) {
  const startMs = Date.parse(start);
  return Array.from({ length: count }, (_, index) => point(startMs + index * 60 * 60 * 1000, 1, initial + index / 1000));
}

function daily(start, count, initial = 1.1) {
  const startMs = Date.parse(start);
  return Array.from({ length: count }, (_, index) => point(startMs + index * 24 * 60 * 60 * 1000, 24, initial + index / 1000));
}

function payload(points, camelCase = false) {
  return camelCase ? { allInWithVat: points } : { all_in_with_vat: points };
}

function response(body, ok = true) {
  return { ok, json: async () => body };
}

describe("live energy prices", () => {
  it("accepts snake_case and camelCase responses and preserves negative prices", () => {
    expect(seriesFromPayload(payload([point("2026-07-20T08:00:00Z", 1, -0.031)]), "Stroom")[0].price).toBe(-0.031);
    expect(seriesFromPayload(payload([point("2026-07-20T08:00:00Z", 1, 0.2)], true), "Stroom")[0].price).toBe(0.2);
    expect(() => seriesFromPayload({ all_in_with_vat: [{ start: "bad" }] }, "Stroom")).toThrow(/ongeldige/i);
  });

  it("uses Amsterdam dates across daylight-saving transitions", () => {
    expect(dateKey("2026-03-28T23:30:00.000Z")).toBe("2026-03-29");
    expect(dateKey("2026-10-24T22:30:00.000Z")).toBe("2026-10-25");

    const electricity = payload(hourly("2026-03-28T23:00:00.000Z", 47));
    const gasCurrent = payload(daily("2026-03-01T05:00:00.000Z", 29));
    const gasPrevious = payload(daily("2026-02-01T05:00:00.000Z", 28));
    const result = normalizeEnergyPrices(electricity, [gasCurrent, gasPrevious], new Date("2026-03-29T10:30:00.000Z"));

    expect(result.electricity.points.filter((item) => !item.forecast)).toHaveLength(23);
    expect(result.electricity.points.filter((item) => item.forecast)).toHaveLength(24);
    expect(result.electricity.current).not.toBeNull();
  });

  it("keeps thirty gas days over a month boundary and marks tomorrow as forecast", () => {
    const electricity = payload(hourly("2026-07-19T22:00:00.000Z", 48));
    const gasJuly = payload(daily("2026-07-01T04:00:00.000Z", 20));
    const gasJune = payload(daily("2026-06-01T04:00:00.000Z", 30));
    const result = normalizeEnergyPrices(electricity, [gasJuly, gasJune], new Date("2026-07-20T10:30:00.000Z"));

    expect(result.gas.points).toHaveLength(30);
    expect(dateKey(result.gas.points[0].start)).toBe("2026-06-21");
    expect(result.electricity.points.some((item) => item.forecast)).toBe(true);
    expect(result.electricity.current).toMatchObject({ price: expect.any(Number) });
  });

  it("caches fresh data and returns a marked last-good response on an upstream failure", async () => {
    const now = new Date("2026-07-20T10:30:00.000Z");
    const electricity = payload(hourly("2026-07-19T22:00:00.000Z", 48));
    const gasJuly = payload(daily("2026-07-01T04:00:00.000Z", 20));
    const gasJune = payload(daily("2026-06-01T04:00:00.000Z", 30));
    let failing = false;
    const fetchMock = vi.fn(async (url) => {
      if (failing) throw new Error("offline");
      const href = String(url);
      if (href.includes("ENERGY_TYPE_ELECTRICITY")) return response(electricity);
      if (href.includes("month=7")) return response(gasJuly);
      return response(gasJune);
    });
    const service = createEnergyPriceService({
      store: new MemoryCoordinationStore(),
      config: { energyPriceApiUrl: "https://prices.test", energyPriceCacheTtlMs: 300000, energyPriceStaleTtlMs: 86400000, energyPriceTimeoutMs: 1000 },
      fetchImpl: fetchMock,
      now: () => now
    });

    const first = await service.get();
    const second = await service.get();
    expect(first.source.status).toBe("fresh");
    expect(second.source.status).toBe("fresh");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    failing = true;
    const stale = await service.get({ force: true });
    expect(stale.source.status).toBe("stale");
    expect(stale.source.warning).toMatch(/laatst geldige/i);
  });

  it("fails cleanly when the upstream and last-good cache are unavailable", async () => {
    const service = createEnergyPriceService({
      store: new MemoryCoordinationStore(),
      config: { energyPriceApiUrl: "https://prices.test", energyPriceTimeoutMs: 100 },
      fetchImpl: async () => { throw new Error("offline"); },
      now: () => new Date("2026-07-20T10:30:00.000Z")
    });
    await expect(service.get()).rejects.toThrow("offline");
  });

  it("aborts slow upstream requests at the configured timeout", async () => {
    const fetchMock = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    }));
    const service = createEnergyPriceService({
      store: new MemoryCoordinationStore(),
      config: { energyPriceApiUrl: "https://prices.test", energyPriceTimeoutMs: 5 },
      fetchImpl: fetchMock,
      now: () => new Date("2026-07-20T10:30:00.000Z")
    });
    await expect(service.get()).rejects.toMatchObject({ code: "ENERGY_PRICE_TIMEOUT", status: 502 });
  });
});
