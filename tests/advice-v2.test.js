"use strict";

const engine = require("../assets/js/advice-v2-engine");

const assumptions = {
  energy: { gasPrice: 1.45, electricityPrice: 0.30 },
  battery: { feedInCost: 0.15, epexMargin: 0.22, imbalancePerKwh: 250, aggregatorFeeClimature: 15 },
  warmtepompProducts: {
    allelectric: [{ name: "All-electric 8", kw: 8, priceIncl: 13000, subsidy: 3500 }, { name: "All-electric 12", kw: 12, priceIncl: 15000, subsidy: 4500 }],
    hybride: [{ name: "Hybride 8", kw: 8, priceIncl: 11000, subsidy: 3000 }, { name: "Hybride 12", kw: 12, priceIncl: 14000, subsidy: 3500 }]
  },
  batteryProducts: {
    "1fase": [{ name: "Batterij 10", kwh: 10, priceExVat: 10000 }, { name: "Batterij 21", kwh: 21, priceExVat: 14000 }],
    "3fase": [{ name: "Batterij 10", kwh: 10, priceExVat: 10000 }, { name: "Batterij 15", kwh: 15, priceExVat: 12500 }, { name: "Batterij 30", kwh: 30, priceExVat: 19000 }]
  },
  sources: { energy: { label: "CBS", period: "juni 2026" }, subsidies: { label: "RVO" } }
};

function scan(overrides = {}) {
  return Object.assign({
    module: "combinatie", address: "Teststraat 1", buildYear: 2015, area: 120, people: 4, homeType: "tussenwoning",
    energyLabel: "A", energyLabelQuality: "bekend", insulation: ["dak", "gevel", "vloer", "glas"], insulationQuality: "bekend",
    gasYear: 1400, gasQuality: "bekend", electricityYear: 4000, electricityQuality: "bekend", cookingGas: "nee", hotWater: "cv",
    emitters: "vloer", flowTempTest: "geslaagd", outdoorUnit: "ja", indoorSpace: "ja", meterCheck: "bevestigd",
    pvCount: 14, pvWp: 430, inverterKw: 5, connection: "3fase", contract: "dynamic", ems: "ja", imbalance: "nee",
    ev: "nee", evKwh: 0, heatPumpPresent: "nee", heatPumpKwh: 0, homePattern: "gemiddeld", vatRefund: "ja"
  }, overrides);
}

describe("Advies Tool 2.0 engine v3", () => {
  it("returns the versioned public result contract", () => {
    const result = engine.calculate(scan(), assumptions);
    expect(result).toEqual(expect.objectContaining({
      version: 3, engineVersion: engine.ENGINE_VERSION, module: "combinatie",
      recommendation: expect.any(Object), alternative: expect.any(Object), status: "installatieklaar",
      ranges: expect.any(Object), requiredChecks: expect.any(Array), scenarios: expect.any(Object), inputQuality: expect.any(Object)
    }));
    expect(result.warmtepomp.recommendation.kind).toBe("all-electric");
    expect(result.warmtepomp.product.name).toContain("All-electric");
    expect(result.batterij.product).toBeTruthy();
  });

  it("uses a hybrid proposal for a valid but less suitable home", () => {
    const result = engine.calculate(scan({ module: "warmtepomp", buildYear: 1980, energyLabel: "C", insulation: ["dak", "glas"], emitters: "radiatoren", flowTempTest: "onbekend" }), assumptions);
    expect(result.warmtepomp.recommendation.kind).toBe("hybride");
    expect(result.warmtepomp.product.name).toContain("Hybride");
    expect(result.requiredChecks.some((item) => item.includes("50°C"))).toBe(true);
  });

  it("blocks an undersized heat-pump assortment instead of choosing the largest product", () => {
    const result = engine.calculate(scan({ module: "warmtepomp", homeType: "vrijstaand", area: 500, buildYear: 1960, energyLabel: "D", insulation: [], gasYear: 7000, emitters: "vloer" }), assumptions);
    expect(result.warmtepomp.requiredKwRange.high).toBeGreaterThan(12);
    expect(result.warmtepomp.product).toBeNull();
    expect(result.warmtepomp.blockers.some((item) => item.includes("Geen product"))).toBe(true);
  });

  it("does not offer a battery without a viable value model", () => {
    const result = engine.calculate(scan({ module: "batterij", pvCount: 0, pvWp: 0, contract: "vast", ems: "nee", imbalance: "nee" }), assumptions);
    expect(result.batterij.status).toBe("niet-rendabel");
    expect(result.batterij.product).toBeNull();
  });

  it("keeps battery capacity within connection and inverter limits", () => {
    const result = engine.calculate(scan({ module: "batterij", connection: "1fase", inverterKw: 3, electricityYear: 30000, ev: "ja", evKwh: 15000, heatPumpPresent: "ja", heatPumpKwh: 10000 }), assumptions);
    expect(result.batterij.recommendedKwh).toBeLessThanOrEqual(result.batterij.technicalMaxKwh);
    expect(result.batterij.technicalMaxKwh).toBe(12);
  });

  it("allocates capacity across value streams and applies fees and degradation", () => {
    const result = engine.calculate(scan({ module: "batterij", imbalance: "ja" }), assumptions).batterij;
    const gross = result.valueStreams.selfConsumption + result.valueStreams.dynamic + result.valueStreams.imbalance;
    expect(result.yearlySaving).toBeLessThan(gross);
    expect(result.valueStreams.degradation).toBeGreaterThan(0);
    expect(result.valueStreams.imbalance).toBeLessThan(result.recommendedKwh * assumptions.battery.imbalancePerKwh);
  });

  it("widens ranges and lowers certainty for estimated or unknown input", () => {
    const strong = engine.calculate(scan({ module: "warmtepomp" }), assumptions);
    const weak = engine.calculate(scan({ module: "warmtepomp", energyLabel: "onbekend", energyLabelQuality: "onbekend", insulation: [], insulationQuality: "onbekend", gasQuality: "geschat" }), assumptions);
    expect(weak.inputQuality.score).toBeLessThan(strong.inputQuality.score);
    expect(weak.warmtepomp.requiredKwRange.high - weak.warmtepomp.requiredKwRange.low).toBeGreaterThan(strong.warmtepomp.requiredKwRange.high - strong.warmtepomp.requiredKwRange.low);
  });

  it("reports invalid and contradictory inputs", () => {
    const errors = engine.validate(scan({ buildYear: 1800, area: 5, gasYear: 0, hotWater: "cv", pvCount: 12, pvWp: 100 }));
    expect(errors).toEqual(expect.arrayContaining(["Vul een geldig bouwjaar in.", "Het woonoppervlak moet tussen 20 en 1.000 m² liggen.", "Tapwater kan niet via een cv-ketel lopen wanneer het gasverbruik 0 is."]));
  });
});
