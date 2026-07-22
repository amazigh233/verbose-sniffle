"use strict";

const catalog = require("../assets/js/product-catalog");

describe("centrale productcatalogus voor adviestools", () => {
  it("zet categorie, merk en model om naar geschikte adviesproducten", () => {
    const result = catalog.buildAssumptions({
      warmtepompProducts: { allelectric: [{ name: "Oud model", kw: 8, subsidy: 1000 }], hybride: [] },
      batteryProducts: { "1fase": [{ name: "Oude batterij", kwh: 10, priceExVat: 1 }], "3fase": [] }
    }, [
      { id: "wp-1", category: "warmtepomp", brand: "NieuwMerk", name: "Eco 9", adviceType: "allelectric", capacityKw: 9, priceExVat: 10000, vatRate: 21, subsidy: 3200 },
      { id: "bat-1", category: "thuisbatterij", brand: "NieuwMerk", name: "Store 15", capacityKwh: 15, connection: "3fase", priceExVat: 8000, vatRate: 21 }
    ]);

    expect(result.warmtepompProducts.allelectric).toEqual([expect.objectContaining({ id: "wp-1", catalogProductId: "wp-1", name: "NieuwMerk Eco 9", kw: 9, priceIncl: 12100, subsidy: 3200 })]);
    expect(result.warmtepompProducts.hybride).toEqual([]);
    expect(result.batteryProducts["1fase"]).toEqual([]);
    expect(result.batteryProducts["3fase"]).toEqual([expect.objectContaining({ id: "bat-1", name: "NieuwMerk Store 15", kwh: 15, priceExVat: 8000 })]);
  });

  it("houdt de ingestelde fallback wanneer de catalogus nog leeg is", () => {
    const fallback = { warmtepompProducts: { allelectric: [{ name: "Fallback", kw: 8 }], hybride: [] } };
    expect(catalog.buildAssumptions(fallback, [])).toEqual(fallback);
  });

  it("kan bestaande producten met gestructureerde specificatietekst blijven gebruiken", () => {
    const result = catalog.buildAssumptions({}, [
      { id: "legacy", category: "thuisbatterij", brand: "Climature", name: "T21", specs: "21 kWh, 3-fase", priceExVat: 14594, vatRate: 21 }
    ]);
    expect(result.batteryProducts["3fase"][0]).toMatchObject({ id: "legacy", kwh: 21, name: "Climature T21" });
  });
});
