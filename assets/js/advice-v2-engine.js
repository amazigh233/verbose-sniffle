(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ClimatureAdviceV2Engine = api;
}(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var ENGINE_VERSION = "3.1.0";

  function number(value, fallback) {
    var parsed = Number(String(value == null ? "" : value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : (fallback || 0);
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function round(value, precision) { var factor = Math.pow(10, precision || 0); return Math.round(value * factor) / factor; }
  function path(object, keys, fallback) {
    var value = keys.split(".").reduce(function (current, key) { return current && current[key] !== undefined ? current[key] : undefined; }, object || {});
    return value === undefined || value === null || value === "" ? fallback : value;
  }
  function range(low, expected, high, unit) { return { low: round(low, 1), expected: round(expected, 1), high: round(high, 1), unit: unit || "" }; }
  function unique(items) { return items.filter(function (item, index) { return item && items.indexOf(item) === index; }); }

  function normalize(input) {
    input = input || {};
    var module = ["warmtepomp", "batterij", "combinatie"].indexOf(input.module) >= 0 ? input.module : "combinatie";
    return {
      module: module,
      customerId: input.customerId || "", address: String(input.address || "").trim(), city: String(input.city || "").trim(),
      homeType: input.homeType || "tussenwoning", buildYear: number(input.buildYear), area: number(input.area), people: number(input.people),
      energyLabel: input.energyLabel || "onbekend", insulation: Array.isArray(input.insulation) ? input.insulation : [],
      energyLabelQuality: input.energyLabelQuality || (input.energyLabel && input.energyLabel !== "onbekend" ? "bekend" : "onbekend"),
      insulationQuality: input.insulationQuality || (Array.isArray(input.insulation) && input.insulation.length ? "bekend" : "onbekend"),
      gasYear: number(input.gasYear), gasQuality: input.gasQuality || (input.gasYear !== undefined && input.gasYear !== "" ? "bekend" : "onbekend"),
      electricityYear: number(input.electricityYear), electricityQuality: input.electricityQuality || (input.electricityYear !== undefined && input.electricityYear !== "" ? "bekend" : "onbekend"),
      cookingGas: input.cookingGas || "nee", hotWater: input.hotWater || "cv", tapWaterDemand: input.tapWaterDemand || "gemiddeld",
      emitters: input.emitters || "radiatoren", flowTempTest: input.flowTempTest || "onbekend", outdoorUnit: input.outdoorUnit || "twijfel",
      indoorSpace: input.indoorSpace || "twijfel", cvAge: number(input.cvAge), meterCheck: input.meterCheck || "onbekend",
      pvCount: number(input.pvCount), pvWp: number(input.pvWp), inverterKw: number(input.inverterKw), connection: input.connection || "1fase",
      contract: input.contract || "vast", energyPricePeriod: String(input.energyPricePeriod || ""), ems: input.ems || "nee", imbalance: input.imbalance || "nee", batteryGoal: input.batteryGoal || "combinatie",
      batteryProductId: String(input.batteryProductId || ""),
      ev: input.ev || "nee", evKwh: number(input.evKwh), heatPumpPresent: input.heatPumpPresent || "nee", heatPumpKwh: number(input.heatPumpKwh),
      homePattern: input.homePattern || "gemiddeld", vatRefund: input.vatRefund || "ja"
    };
  }

  function validate(raw) {
    var input = normalize(raw); var errors = [];
    if (input.buildYear < 1900 || input.buildYear > new Date().getFullYear()) errors.push("Vul een geldig bouwjaar in.");
    if (input.area < 20 || input.area > 1000) errors.push("Het woonoppervlak moet tussen 20 en 1.000 m² liggen.");
    if (input.people < 1 || input.people > 12) errors.push("Het aantal personen moet tussen 1 en 12 liggen.");
    if (input.gasYear < 0 || input.gasYear > 10000) errors.push("Het gasverbruik moet tussen 0 en 10.000 m³ liggen.");
    if (input.electricityYear < 500 || input.electricityYear > 50000) errors.push("Het stroomverbruik moet tussen 500 en 50.000 kWh liggen.");
    if (input.pvCount < 0 || input.pvCount > 100) errors.push("Het aantal zonnepanelen moet tussen 0 en 100 liggen.");
    if (input.pvCount > 0 && (input.pvWp < 200 || input.pvWp > 700)) errors.push("Vul bij zonnepanelen een vermogen tussen 200 en 700 Wp in.");
    if (input.ev === "ja" && (input.evKwh < 250 || input.evKwh > 20000)) errors.push("Vul voor de elektrische auto 250 tot 20.000 kWh per jaar in.");
    if (input.heatPumpPresent === "ja" && input.heatPumpKwh <= 0) errors.push("Vul het jaarlijkse warmtepompverbruik in.");
    if (input.gasYear === 0 && input.hotWater === "cv") errors.push("Tapwater kan niet via een cv-ketel lopen wanneer het gasverbruik 0 is.");
    return errors;
  }

  function findProduct(group, required, key, maximum) {
    if (!Array.isArray(group) || !group.length) return null;
    return group.slice().sort(function (a, b) { return number(a[key]) - number(b[key]); }).find(function (product) {
      var size = number(product[key]); return size >= required && (!maximum || size <= maximum);
    }) || null;
  }

  function batteryProductId(product, connection, index) {
    if (product && product.id) return String(product.id);
    var slug = String(product && product.name || "batterij").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return connection + "-" + (slug || "batterij") + "-" + number(product && product.kwh) + "-" + (index + 1);
  }

  function energyTariff(input, assumptions) {
    var energy = path(assumptions, "energy", {});
    var history = Array.isArray(energy.priceHistory) ? energy.priceHistory.slice(0, 12).map(function (item) { return Object.assign({}, item); }) : [];
    if (!history.length) {
      history = [{
        periodKey: "fallback", periodLabel: "Handmatig tarief", gasPrice: number(energy.gasPrice, 1.45),
        electricityPrice: number(energy.electricityPrice, 0.30), dynamicElectricityPrice: number(energy.dynamicElectricityPrice, number(energy.electricityPrice, 0.30)),
        dynamicPriceFallback: !energy.dynamicElectricityPrice, vatIncluded: true, sourceUrl: path(assumptions, "sources.energy.url", ""), refreshedAt: path(assumptions, "sources.energy.refreshedAt", "")
      }];
    }
    var requested = input.energyPricePeriod;
    var selected = history.find(function (item) { return String(item.periodKey) === requested; }) || history[0];
    var periodFallback = Boolean(requested && requested !== String(selected.periodKey));
    input.energyPricePeriod = String(selected.periodKey || "");
    var dynamic = input.contract === "dynamic";
    var dynamicFallback = dynamic && Boolean(selected.dynamicPriceFallback);
    return {
      periodKey: String(selected.periodKey || ""), periodLabel: selected.periodLabel || selected.periodKey || "Actueel tarief",
      gasPrice: number(selected.gasPrice, number(energy.gasPrice, 1.45)),
      electricityPrice: dynamic ? number(selected.dynamicElectricityPrice, number(selected.electricityPrice, 0.30)) : number(selected.electricityPrice, number(energy.electricityPrice, 0.30)),
      regularElectricityPrice: number(selected.electricityPrice, number(energy.electricityPrice, 0.30)),
      dynamicElectricityPrice: number(selected.dynamicElectricityPrice, number(selected.electricityPrice, 0.30)),
      contractType: dynamic ? "dynamic" : "vast-variabel", dynamicPriceFallback: dynamicFallback, periodFallback: periodFallback,
      vatIncluded: selected.vatIncluded !== false, sourceUrl: selected.sourceUrl || "", refreshedAt: selected.refreshedAt || "", priceHistory: history
    };
  }

  function heatPumpScenario(kind, requiredHigh, heatingGas, assumptions) {
    var group = path(assumptions, "warmtepompProducts." + (kind === "all-electric" ? "allelectric" : "hybride"), []);
    var product = findProduct(group, requiredHigh, "kw");
    var gasPrice = number(path(assumptions, "energy.gasPrice", 1.45));
    var electricityPrice = number(path(assumptions, "energy.electricityPrice", 0.30));
    var coverage = kind === "all-electric" ? 1 : 0.75;
    var shiftedGas = heatingGas * coverage;
    var extraElectricity = shiftedGas * 9.77 / (kind === "all-electric" ? 3.7 : 4.2);
    var saving = Math.max(0, shiftedGas * gasPrice - extraElectricity * electricityPrice + (kind === "all-electric" ? 240 : 0));
    var investment = product ? number(product.priceIncl) : 0;
    var subsidy = product ? number(product.subsidy) : 0;
    return {
      kind: kind, title: kind === "all-electric" ? "All-electric warmtepomp" : "Hybride warmtepomp", product: product,
      investment: round(investment), subsidy: round(subsidy), netInvestment: round(Math.max(0, investment - subsidy)),
      yearlySaving: round(saving), extraElectricity: round(extraElectricity), remainingGas: round(Math.max(0, heatingGas - shiftedGas)),
      paybackYears: saving > 0 && investment > subsidy ? round((investment - subsidy) / saving, 1) : 0
    };
  }

  function heatPump(input, assumptions) {
    var labelW = { A: 35, B: 45, C: 60, D: 78, EFG: 105, onbekend: 75 }[input.energyLabel] || 75;
    if (input.buildYear >= 2010) labelW = Math.min(labelW, 42); else if (input.buildYear >= 1992) labelW = Math.min(labelW, 58); else if (input.buildYear >= 1975) labelW = Math.min(labelW, 78);
    var homeFactor = { appartement: 0.82, tussenwoning: 0.92, hoekwoning: 1, "2onder1kap": 1.07, vrijstaand: 1.18 }[input.homeType] || 1;
    var insulationFactor = Math.max(0.82, 1 - input.insulation.length * 0.035);
    var cookingGas = input.cookingGas === "ja" ? 50 : 0;
    var hotWaterFactor = { laag: 38, gemiddeld: 50, hoog: 65 }[input.tapWaterDemand] || 50;
    var hotWaterGas = input.hotWater === "cv" ? input.people * hotWaterFactor : 0;
    var heatingGas = Math.max(0, input.gasYear - cookingGas - hotWaterGas);
    var viaArea = input.area * labelW * homeFactor * insulationFactor / 1000;
    var viaGas = heatingGas > 0 ? heatingGas * 0.005 : viaArea;
    var expectedKw = round(Math.max(3, viaArea * 0.65 + viaGas * 0.35 + (input.hotWater === "cv" ? 0.8 : 0)), 1);
    var uncertain = [input.energyLabelQuality, input.insulationQuality, input.gasQuality].reduce(function (sum, quality) { return sum + (quality === "onbekend" ? 0.08 : quality === "geschat" ? 0.04 : 0); }, 0);
    var spread = clamp(0.08 + uncertain, 0.08, 0.28);
    var powerRange = range(Math.max(3, expectedKw * (1 - spread)), expectedKw, expectedKw * (1 + spread), "kW");
    var blockers = [];
    if (input.outdoorUnit === "nee") blockers.push("Er is geen geschikte plek voor een buitenunit bevestigd.");
    if (input.energyLabel === "EFG" && input.insulation.length < 2) blockers.push("Beperk eerst het warmteverlies met isolatiemaatregelen.");
    if (input.emitters === "convectoren" || input.flowTempTest === "mislukt") blockers.push("Het afgiftesysteem is nog niet geschikt voor lage temperatuur.");
    var insufficient = input.energyLabel === "onbekend" && !input.insulation.length && input.gasQuality === "onbekend";
    var readiness = clamp(100 - blockers.length * 30 - uncertain * 100 - (input.outdoorUnit === "twijfel" ? 10 : 0) - (input.meterCheck === "onbekend" ? 5 : 0), 0, 100);
    var preferredKind = blockers.length ? "none" : (input.energyLabel === "A" || input.energyLabel === "B" || (input.insulation.length >= 3 && ["vloer", "lt_radiatoren"].indexOf(input.emitters) >= 0)) ? "all-electric" : "hybride";
    var primary = preferredKind === "none" ? null : heatPumpScenario(preferredKind, powerRange.high, heatingGas, assumptions);
    var alternative = preferredKind === "none" ? null : heatPumpScenario(preferredKind === "all-electric" ? "hybride" : "all-electric", powerRange.high, heatingGas, assumptions);
    if (primary && !primary.product) blockers.push("Geen product in het assortiment dekt de bovengrens van " + String(powerRange.high).replace(".", ",") + " kW.");
    var status = insufficient ? "onvoldoende-gegevens" : blockers.length ? "eerst-aanpassen" : (input.outdoorUnit === "ja" && input.meterCheck === "bevestigd" && (["vloer", "lt_radiatoren"].indexOf(input.emitters) >= 0 || input.flowTempTest === "geslaagd") ? "installatieklaar" : "technisch-kansrijk");
    var product = status === "eerst-aanpassen" || status === "onvoldoende-gegevens" || !primary || !primary.product ? null : primary.product;
    var saving = primary ? primary.yearlySaving : 0;
    var investment = product && primary ? primary.investment : 0;
    var subsidy = product && primary ? primary.subsidy : 0;
    var checks = [];
    if (input.flowTempTest === "onbekend" && ["radiatoren", "convectoren"].indexOf(input.emitters) >= 0) checks.push("Voer een 50°C-test uit.");
    if (input.outdoorUnit !== "ja") checks.push("Bevestig plaats, leidingroute en geluid van de buitenunit.");
    if (input.meterCheck !== "bevestigd" && preferredKind === "all-electric") checks.push("Controleer meterkast en beschikbare aansluiting.");
    if (input.indoorSpace !== "ja" && preferredKind === "all-electric") checks.push("Bevestig binnenruimte voor boiler en buffervat.");
    return {
      status: status, label: product && primary ? primary.title : status === "eerst-aanpassen" ? "Eerst woning aanpassen" : status === "onvoldoende-gegevens" ? "Onvoldoende gegevens" : "Nog geen passend product",
      readiness: readiness, requiredKw: expectedKw, requiredKwRange: powerRange, product: product, investment: investment, subsidy: subsidy,
      netInvestment: Math.max(0, investment - subsidy), yearlySaving: saving, paybackYears: primary && product ? primary.paybackYears : 0,
      ranges: { power: powerRange, investment: range(investment * 0.95, investment, investment * 1.10, "EUR"), yearlySaving: range(saving * 0.82, saving, saving * 1.12, "EUR/jaar"), payback: saving > 0 && investment > subsidy ? range((investment - subsidy) / (saving * 1.12), (investment - subsidy) / saving, (investment - subsidy) / (saving * 0.82), "jaar") : range(0, 0, 0, "jaar") },
      recommendation: primary ? Object.assign({}, primary, { product: product }) : null, alternative: alternative,
      blockers: unique(blockers), requiredChecks: unique(checks).slice(0, 3),
      reasons: ["Warmtevraag geraamd op " + String(powerRange.low).replace(".", ",") + "–" + String(powerRange.high).replace(".", ",") + " kW op basis van woningtype, bouwjaar, isolatie en verbruik.", preferredKind === "all-electric" ? "De woningkenmerken ondersteunen een volledig elektrisch uitgangspunt." : preferredKind === "hybride" ? "Hybride beperkt het technische risico in de huidige situatie." : "Los eerst de technische blokkades op."]
    };
  }

  function battery(input, assumptions) {
    var production = input.pvCount * input.pvWp * 0.9;
    var directFraction = input.homePattern === "veel" ? 0.42 : input.homePattern === "weinig" ? 0.22 : 0.31;
    var directUse = Math.min(production, input.electricityYear * directFraction);
    var surplus = Math.max(0, production - directUse);
    var eveningFraction = input.homePattern === "veel" ? 0.46 : input.homePattern === "weinig" ? 0.64 : 0.55;
    var shiftable = input.electricityYear * eveningFraction + (input.ev === "ja" ? input.evKwh * 0.25 : 0) + (input.heatPumpPresent === "ja" ? input.heatPumpKwh * 0.15 : 0);
    var usableDaily = shiftable / 365;
    var pvDaily = surplus > 0 ? surplus / 180 : 0;
    var dynamicEnabled = input.contract === "dynamic" && input.ems === "ja";
    var imbalanceEnabled = input.imbalance === "ja";
    var hasModel = surplus > 250 || dynamicEnabled || imbalanceEnabled;
    var target = Math.max(5, Math.min(40, (dynamicEnabled || imbalanceEnabled ? usableDaily : Math.min(usableDaily, pvDaily)) / 0.90));
    var technicalMax = input.connection === "1fase" ? 21 : 40;
    if (input.inverterKw > 0) technicalMax = Math.min(technicalMax, Math.max(5, input.inverterKw * 4));
    target = round(Math.min(target, technicalMax), 1);
    var group = path(assumptions, "batteryProducts." + input.connection, []).map(function (item, index) { return Object.assign({}, item, { id: batteryProductId(item, input.connection, index) }); });
    var availableProducts = hasModel ? group.filter(function (item) { var capacity = number(item.kwh); return capacity > 0 && capacity <= technicalMax; }).sort(function (a, b) { return number(a.kwh) - number(b.kwh); }) : [];
    var automaticProduct = hasModel ? findProduct(availableProducts, target, "kwh", technicalMax) : null;
    var manualProduct = input.batteryProductId ? availableProducts.find(function (item) { return item.id === input.batteryProductId; }) : null;
    var product = manualProduct || automaticProduct;
    var selectionMode = manualProduct ? "manual" : "automatic";
    input.batteryProductId = product ? product.id : "";
    var blockers = [];
    if (!hasModel) blockers.push("Zonder relevant PV-overschot, dynamische EMS-sturing of onbalansdeelname ontbreekt een verdienmodel.");
    if (target >= technicalMax && usableDaily / 0.9 > technicalMax) blockers.push("De technische grens van de aansluiting beperkt de gewenste capaciteit.");
    if (hasModel && !availableProducts.length) blockers.push("Geen batterij in het assortiment past binnen de technische grens van de aansluiting.");
    else if (hasModel && !product) blockers.push("Geen beschikbare batterij bereikt de berekende adviescapaciteit.");
    var kwh = product ? number(product.kwh) : target;
    var feedInCost = number(path(assumptions, "battery.feedInCost", 0.15));
    var epexMargin = number(path(assumptions, "battery.epexMargin", 0.22));
    var imbalancePerKwh = number(path(assumptions, "battery.imbalancePerKwh", 250));
    var fee = number(path(assumptions, "battery.aggregatorFeeClimature", 15)) / 100;
    var active = (surplus > 250 ? 1 : 0) + (dynamicEnabled ? 1 : 0) + (imbalanceEnabled ? 1 : 0);
    var weights = { self: surplus > 250 ? 1 : 0, dynamic: dynamicEnabled ? 1 : 0, imbalance: imbalanceEnabled ? 1 : 0 };
    if (input.batteryGoal === "eigenverbruik" && weights.self) weights.self = 2.5;
    if (input.batteryGoal === "dynamic" && weights.dynamic) weights.dynamic = 2.5;
    if (input.batteryGoal === "onbalans" && weights.imbalance) weights.imbalance = 2.5;
    var weightTotal = weights.self + weights.dynamic + weights.imbalance || 1;
    var selfValue = surplus > 250 ? Math.min(surplus, kwh * 0.9 * 180) * feedInCost * weights.self / weightTotal : 0;
    var dynamicValue = dynamicEnabled ? kwh * 0.9 * 140 * epexMargin * weights.dynamic / weightTotal : 0;
    var imbalanceValue = imbalanceEnabled ? kwh * imbalancePerKwh * (1 - fee) * weights.imbalance / weightTotal : 0;
    var grossValue = selfValue + dynamicValue + imbalanceValue;
    var degradationCost = grossValue * 0.04;
    var yearly = Math.max(0, grossValue - degradationCost);
    var investmentExVat = product ? number(product.priceExVat) : 0;
    var investment = investmentExVat * 1.21;
    var netInvestment = input.vatRefund === "ja" ? investmentExVat : investment;
    var scenario = function (factor, label) { var value = round(yearly * factor); return { label: label, yearlySaving: value, paybackYears: value > 0 && netInvestment > 0 ? round(netInvestment / value, 1) : 0 }; };
    var scenarios = { conservative: scenario(0.72, "Conservatief"), expected: scenario(1, "Verwacht"), favorable: scenario(1.25, "Gunstig") };
    var status = blockers.length ? "niet-rendabel" : input.meterCheck === "bevestigd" ? "installatieklaar" : "technisch-kansrijk";
    var checks = [];
    if (input.meterCheck !== "bevestigd") checks.push("Controleer meterkast, hoofdzekering en vrije groepen.");
    if (input.inverterKw <= 0 && input.pvCount > 0) checks.push("Bevestig omvormervermogen en compatibiliteit.");
    if (dynamicEnabled || imbalanceEnabled) checks.push("Bevestig EMS- en aggregatorvoorwaarden.");
    var alternative = null;
    if (product) {
      var sorted = availableProducts.slice();
      var index = sorted.indexOf(product); var altProduct = sorted[index + 1] || sorted[index - 1];
      if (altProduct) alternative = { title: altProduct.name, product: altProduct, difference: number(altProduct.kwh) > kwh ? "Meer handelsruimte, maar een hogere investering." : "Lagere investering, maar minder verschuifbare energie." };
    }
    return {
      status: status, label: product ? "Thuisbatterij van " + number(product.kwh) + " kWh" : "Momenteel geen batterijadvies", readiness: blockers.length ? 35 : 80,
      recommendedKwh: kwh, pvProduction: round(production), surplus: round(surplus), shiftableUse: round(shiftable), technicalMaxKwh: technicalMax,
      product: product, availableProducts: availableProducts.map(function (item) { return Object.assign({}, item, { priceIncl: round(number(item.priceExVat) * 1.21), recommended: Boolean(automaticProduct && item.id === automaticProduct.id), selected: Boolean(product && item.id === product.id) }); }),
      selectedProductId: product && product.id || "", selectionMode: selectionMode,
      investmentExVat: round(investmentExVat), investment: round(investment), netInvestment: round(netInvestment), subsidy: 0,
      yearlySaving: round(yearly), paybackYears: yearly > 0 && netInvestment > 0 ? round(netInvestment / yearly, 1) : 0,
      valueStreams: { selfConsumption: round(selfValue), dynamic: round(dynamicValue), imbalance: round(imbalanceValue), degradation: round(degradationCost) },
      scenarios: scenarios, ranges: { capacity: range(Math.max(5, target * 0.8), target, Math.min(technicalMax, target * 1.15), "kWh"), investment: range(netInvestment, netInvestment, investment, "EUR"), yearlySaving: range(scenarios.conservative.yearlySaving, scenarios.expected.yearlySaving, scenarios.favorable.yearlySaving, "EUR/jaar"), payback: range(scenarios.favorable.paybackYears, scenarios.expected.paybackYears, scenarios.conservative.paybackYears, "jaar") },
      recommendation: product ? { title: "Thuisbatterij van " + number(product.kwh) + " kWh", product: product, rationale: "Past bij verschuifbaar verbruik, PV-overschot en de technische aansluitgrens." } : null,
      alternative: alternative, blockers: unique(blockers), requiredChecks: unique(checks).slice(0, 3),
      reasons: ["Geschatte PV-opwek: " + Math.round(production).toLocaleString("nl-NL") + " kWh per jaar; overschot circa " + Math.round(surplus).toLocaleString("nl-NL") + " kWh.", "EV- en warmtepompverbruik tellen alleen mee voor het realistisch verschuifbare deel.", active > 1 ? "De beschikbare capaciteit is verdeeld over de actieve verdienmodellen om dubbeltelling te voorkomen." : "De opbrengst gebruikt alleen het actieve verdienmodel.", "Platformkosten en een degradatiereservering van " + round(degradationCost) + " euro per jaar zijn in het verwachte voordeel verwerkt."]
    };
  }

  function inputQuality(input, errors) {
    var fields = [
      { key: "energyLabel", label: "energielabel", quality: input.energyLabelQuality },
      { key: "insulation", label: "isolatie", quality: input.insulationQuality },
      { key: "gasYear", label: "gasverbruik", quality: input.gasQuality },
      { key: "electricityYear", label: "stroomverbruik", quality: input.electricityQuality },
      { key: "outdoorUnit", label: "plek buitenunit", quality: input.outdoorUnit === "ja" ? "bekend" : input.outdoorUnit === "nee" ? "bekend" : "onbekend" },
      { key: "meterCheck", label: "meterkast", quality: input.meterCheck === "bevestigd" ? "bekend" : "onbekend" }
    ];
    var relevant = input.module === "warmtepomp" ? fields.slice(0, 5) : input.module === "batterij" ? [fields[3], fields[5]] : fields;
    var penalty = relevant.reduce(function (sum, field) { return sum + (field.quality === "onbekend" ? 14 : field.quality === "geschat" ? 7 : 0); }, errors.length * 20);
    var score = clamp(100 - penalty, 20, 100);
    return { score: score, label: score >= 85 ? "Sterk onderbouwd" : score >= 65 ? "Redelijk onderbouwd" : "Voorlopige indicatie", fields: relevant, missing: relevant.filter(function (field) { return field.quality === "onbekend"; }).map(function (field) { return field.label; }) };
  }

  function actions(input, wp, bat) {
    var items = []; var order = 1;
    function add(stage, owner, title, reason) { items.push({ order: order++, stage: stage, owner: owner, status: "open", title: title, reason: reason, effect: reason }); }
    var blockers = [];
    if (wp && wp.blockers) blockers = blockers.concat(wp.blockers);
    if (bat && bat.blockers) blockers = blockers.concat(bat.blockers);
    unique(blockers).forEach(function (text) { add("eerst-oplossen", "klant", text, "Nodig voordat een betrouwbaar productvoorstel kan worden gemaakt."); });
    var checks = [];
    if (wp && wp.requiredChecks) checks = checks.concat(wp.requiredChecks);
    if (bat && bat.requiredChecks) checks = checks.concat(bat.requiredChecks);
    unique(checks).forEach(function (text) { add("technische-opname", "adviseur", text, "Wordt tijdens de technische opname bevestigd."); });
    if (!blockers.length) add("offerte", "adviseur", "Werk de definitieve offerte uit", "Gebruik de bevestigde opnamegegevens en actuele productprijzen.");
    var suggestions = { now: [], first: [], later: [] };
    items.forEach(function (item) { var target = item.stage === "eerst-oplossen" ? suggestions.first : item.stage === "technische-opname" ? suggestions.now : suggestions.later; target.push(item); });
    return { items: items, suggestions: suggestions };
  }

  function calculate(raw, assumptions) {
    assumptions = assumptions || {};
    var input = normalize(raw); var errors = validate(input);
    var tariff = energyTariff(input, assumptions);
    var calculationAssumptions = Object.assign({}, assumptions, { energy: Object.assign({}, path(assumptions, "energy", {}), { gasPrice: tariff.gasPrice, electricityPrice: tariff.electricityPrice }) });
    var wp = input.module === "batterij" ? null : heatPump(input, calculationAssumptions);
    var bat = input.module === "warmtepomp" ? null : battery(input, calculationAssumptions);
    var quality = inputQuality(input, errors); var plan = actions(input, wp, bat);
    var selected = [wp && wp.product && wp, bat && bat.product && bat].filter(Boolean);
    var title = selected.length ? selected.map(function (item) { return item.label; }).join(" + ") : "Eerst randvoorwaarden bevestigen";
    var totalInvestment = selected.reduce(function (sum, item) { return sum + number(item.netInvestment); }, 0);
    var totalSaving = selected.reduce(function (sum, item) { return sum + number(item.yearlySaving); }, 0);
    var checks = unique([].concat(wp ? wp.requiredChecks : [], bat ? bat.requiredChecks : [])).slice(0, 3);
    var status = selected.length ? (selected.every(function (item) { return item.status === "installatieklaar"; }) ? "installatieklaar" : "technisch-kansrijk") : (quality.score < 65 ? "onvoldoende-gegevens" : "eerst-aanpassen");
    return {
      version: 3, engineVersion: ENGINE_VERSION, calculatedAt: new Date().toISOString(), module: input.module, input: input, errors: errors,
      inputQuality: quality, confidence: quality, status: status,
      recommendation: { title: title, rationale: selected.length ? "Dit is de best passende combinatie binnen de bekende woning-, verbruiks- en aansluitgegevens." : "Bevestig eerst de genoemde gegevens en technische randvoorwaarden.", products: selected.map(function (item) { return item.product; }) },
      alternative: input.module === "warmtepomp" ? wp && wp.alternative : input.module === "batterij" ? bat && bat.alternative : { title: "Voer de modules afzonderlijk uit", difference: "Geeft per techniek een zelfstandig besluit wanneer de investeringen niet gelijktijdig worden uitgevoerd." },
      ranges: { investment: range(totalInvestment * 0.95, totalInvestment, totalInvestment * 1.10, "EUR"), yearlySaving: range(totalSaving * 0.78, totalSaving, totalSaving * 1.18, "EUR/jaar"), payback: totalSaving > 0 ? range(totalInvestment / (totalSaving * 1.18), totalInvestment / totalSaving, totalInvestment / (totalSaving * 0.78), "jaar") : range(0, 0, 0, "jaar") },
      requiredChecks: checks, scenarios: bat ? bat.scenarios : null, warmtepomp: wp, batterij: bat,
      actions: plan.items, suggestions: plan.suggestions,
      energyTariff: tariff,
      warnings: unique([tariff.periodFallback ? "De eerder gekozen tariefmaand is niet meer beschikbaar; de nieuwste maand is gebruikt." : "", tariff.dynamicPriceFallback ? "Voor deze maand ontbreekt een dynamisch stroomtarief; het reguliere stroomtarief is gebruikt." : ""]),
      assumptions: { gasPrice: tariff.gasPrice, electricityPrice: tariff.electricityPrice, regularElectricityPrice: tariff.regularElectricityPrice, dynamicElectricityPrice: tariff.dynamicElectricityPrice, energyPricePeriod: tariff.periodKey, priceHistory: tariff.priceHistory, feedInCost: number(path(assumptions, "battery.feedInCost", 0.15)), epexMargin: number(path(assumptions, "battery.epexMargin", 0.22)), sources: path(assumptions, "sources", {}) }
    };
  }

  return { ENGINE_VERSION: ENGINE_VERSION, normalize: normalize, validate: validate, calculate: calculate };
}));
