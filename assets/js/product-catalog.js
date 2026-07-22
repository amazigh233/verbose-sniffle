(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ClimatureProductCatalog = api;
}(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
  function number(value) {
    var parsed = Number(String(value == null ? "" : value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function text(value) { return String(value || "").trim(); }
  function normalized(value) { return text(value).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, ""); }
  function categoryKind(product) {
    var category = normalized(product && product.category);
    if (category.indexOf("warmtepomp") >= 0) return "warmtepomp";
    if (category.indexOf("thuisbatterij") >= 0 || category === "batterij") return "thuisbatterij";
    return "";
  }
  function productName(product) {
    var brand = text(product.brand); var model = text(product.name);
    return normalized(model).indexOf(normalized(brand)) === 0 ? model : [brand, model].filter(Boolean).join(" ");
  }
  function capacityFrom(product, field, unit) {
    var explicit = number(product[field]);
    if (explicit > 0) return explicit;
    var source = [product.name, product.specs].filter(Boolean).join(" ");
    var match = source.match(new RegExp("(\\d+(?:[.,]\\d+)?)\\s*" + unit, "i"));
    return match ? number(match[1]) : 0;
  }
  function heatPumpType(product) {
    var type = normalized(product.adviceType);
    var source = normalized([product.name, product.specs].join(" "));
    if (type === "allelectric" || source.indexOf("allelectric") >= 0) return "allelectric";
    if (type === "hybride" || type === "hybrid" || source.indexOf("hybride") >= 0 || source.indexOf("hybrid") >= 0) return "hybride";
    return "";
  }
  function connection(product) {
    var value = normalized(product.connection);
    var source = normalized([product.name, product.specs].join(" "));
    if (value === "1fase" || source.indexOf("1fase") >= 0) return "1fase";
    if (value === "3fase" || source.indexOf("3fase") >= 0) return "3fase";
    return "";
  }
  function referenceFor(group, product) {
    var exactName = normalized(productName(product));
    return (group || []).find(function (item) { return normalized(item.name) === exactName; }) || {};
  }

  function buildAssumptions(settingsAssumptions, products) {
    var assumptions = clone(settingsAssumptions);
    products = Array.isArray(products) ? products : [];
    var heatPumps = products.filter(function (product) { return categoryKind(product) === "warmtepomp"; });
    var batteries = products.filter(function (product) { return categoryKind(product) === "thuisbatterij"; });

    if (heatPumps.length) {
      var previousHeatPumps = assumptions.warmtepompProducts || {};
      assumptions.warmtepompProducts = { allelectric: [], hybride: [] };
      heatPumps.forEach(function (product) {
        var type = heatPumpType(product); var kw = capacityFrom(product, "capacityKw", "kW");
        if (!type || kw <= 0) return;
        var reference = referenceFor(previousHeatPumps[type], product);
        var priceExVat = number(product.priceExVat); var vatRate = number(product.vatRate);
        assumptions.warmtepompProducts[type].push({
          id: product.id, catalogProductId: product.id, name: productName(product), kw: kw,
          priceIncl: Math.round(priceExVat * (1 + vatRate / 100) * 100) / 100,
          subsidy: number(product.subsidy) || number(reference.subsidy),
          meldcode: text(product.meldcode) || text(reference.meldcode), rvoSearch: text(reference.rvoSearch) || productName(product)
        });
      });
    }

    if (batteries.length) {
      assumptions.batteryProducts = { "1fase": [], "3fase": [] };
      batteries.forEach(function (product) {
        var phase = connection(product); var kwh = capacityFrom(product, "capacityKwh", "kWh");
        if (!phase || kwh <= 0) return;
        assumptions.batteryProducts[phase].push({
          id: product.id, catalogProductId: product.id, name: productName(product), kwh: kwh, priceExVat: number(product.priceExVat)
        });
      });
    }
    return assumptions;
  }

  return { buildAssumptions: buildAssumptions, categoryKind: categoryKind };
}));
