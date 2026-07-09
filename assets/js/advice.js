(function () {
  "use strict";

  var C = window.Climature = window.Climature || {};
  var S = C.storage;

  function render(customerId) {
    var src = "assets/adviestools.html";
    if (customerId) {
      var customer = S.getAll("customers").find(function (item) { return item.id === customerId; });
      var params = ["embed=1", "customer=" + encodeURIComponent(customerId)];
      if (customer) {
        params.push("adres=" + encodeURIComponent(customer.address || ""));
        params.push("plaats=" + encodeURIComponent([customer.postalCode, customer.city].filter(Boolean).join(" ")));
      }
      src += "?" + params.join("&");
    }
    return [
      '<section class="section advice-tool-embed">',
      '<iframe id="advice-tool-frame" class="advice-tool-frame" src="' + S.escapeHtml(src) + '" title="Climature adviestools"></iframe>',
      "</section>"
    ].join("");
  }

  function postAssumptions() {
    var frame = document.getElementById("advice-tool-frame");
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({
      source: "climature-advice-assumptions",
      adviceAssumptions: S.settings().adviceAssumptions || {}
    }, window.location.origin);
  }

  function handleAdviceMessage(event) {
    if (event.origin !== window.location.origin) return;
    var data = event.data || {};
    if (data.source !== "climature-advies" || !data.advies) return;
    var advies = data.advies;
    var customerId = data.customerId || advies.customerId;
    if (!customerId) {
      C.app.toast("Geen klant gekoppeld aan dit advies.");
      return;
    }
    S.upsert("advices", {
      customerId: customerId,
      kind: advies.kind || "",
      title: advies.title || "",
      summary: advies.summary || "",
      powerKw: advies.powerKw || 0,
      investment: advies.investment || 0,
      subsidy: advies.subsidy || 0,
      yearlySaving: advies.yearlySaving || 0,
      paybackYears: advies.paybackYears || 0,
      productName: advies.productName || "",
      payload: advies
    }).then(function () {
      C.app.toast("Advies opgeslagen bij klant.");
      C.app.navigate("customer:" + customerId);
    }).catch(function () {
      C.app.toast("Advies opslaan mislukt.");
    });
  }

  function createQuoteFromAdvice(adviceId) {
    var advice = S.getAll("advices").find(function (item) { return item.id === adviceId; });
    if (!advice) {
      C.app.toast("Advies niet gevonden.");
      return;
    }
    var exVat = S.parseNumber(advice.investment) / 1.21;
    return C.quotes.createFromAdvice({
      customerId: advice.customerId,
      sourceAdviceId: advice.id,
      notes: advice.summary + "\n\n" + S.settings().defaultQuoteTerms,
      lines: [{
        description: [advice.title, advice.productName].filter(Boolean).join(" – "),
        qty: 1,
        unit: "stuk",
        priceExVat: exVat,
        vatRate: 21
      }]
    }).then(function (quote) {
      return S.upsert("advices", Object.assign({}, advice, { sourceQuoteId: quote.id })).then(function () {
        C.app.toast("Conceptofferte aangemaakt vanuit advies.");
        C.app.navigate("quote:" + quote.id);
        return quote;
      });
    });
  }

  function warmtepompForm() {
    return [
      '<form data-form="advice-wp" class="grid">',
      '<div class="grid two">',
      '<div class="panel"><div class="panel-head"><div><p class="eyebrow">Woning</p><h2>Basisgegevens</h2></div></div><div class="field-grid">',
      field("Adres", "address", "", "text", false),
      field("Plaats", "city", "", "text", false),
      select("Woningtype", "woningtype", [["tussenwoning", "Tussenwoning"], ["hoekwoning", "Hoekwoning"], ["vrijstaand", "Vrijstaand"], ["appartement", "Appartement"]]),
      field("Bouwjaar", "bouwjaar", "1985", "number", true),
      field("Woonoppervlak m2", "oppervlak", "130", "number", true),
      field("Personen", "personen", "4", "number", true),
      select("Energielabel", "label", [["A", "A of beter"], ["B", "B"], ["C", "C"], ["D", "D"], ["EFG", "E/F/G"], ["onbekend", "Onbekend"]]),
      select("Afgiftesysteem", "afgifte", [["vloer", "Volledige vloerverwarming"], ["vloer_beneden", "Vloerverwarming beneden"], ["lt_radiatoren", "LT-radiatoren"], ["radiatoren", "Standaard radiatoren"], ["convectoren", "Convectoren"]]),
      "</div></div>",
      '<div class="panel"><div class="panel-head"><div><p class="eyebrow">Energie</p><h2>Verbruik en tarieven</h2></div></div><div class="field-grid">',
      field("Gasverbruik m3/jaar", "gas", "1600", "number", true),
      field("Gasprijs", "prijsGas", "1.45", "number", true),
      field("Stroomprijs", "prijsStroom", "0.30", "number", true),
      field("Aantal zonnepanelen", "pvAantal", "12", "number", false),
      field("Wp per paneel", "pvWp", "430", "number", false),
      select("Koken op gas", "kokenGas", [["nee", "Nee"], ["ja", "Ja"]]),
      select("Tapwater", "tapwater", [["cv", "Via cv-ketel"], ["boiler", "Elektrische boiler"], ["zonneboiler", "Zonneboiler"]]),
      select("Dynamic + EMS", "modern", [["ja", "Ja"], ["nee", "Nee"]]),
      "</div></div>",
      "</div>",
      '<div class="button-row"><button class="primary-button" type="submit">Bereken warmtepompadvies</button></div>',
      "</form>",
      '<div id="advice-result"></div>'
    ].join("");
  }

  function batterijForm() {
    return [
      '<form data-form="advice-bat" class="grid">',
      '<div class="grid two">',
      '<div class="panel"><div class="panel-head"><div><p class="eyebrow">Verbruik</p><h2>Klantprofiel</h2></div></div><div class="field-grid">',
      field("Jaarverbruik kWh", "stroomJaar", "3500", "number", true),
      select("Personen", "personen", [["2", "2"], ["3", "3"], ["4", "4"], ["5", "5+"]]),
      select("Thuispatroon", "patroon", [["weinig", "Overdag weinig thuis"], ["gemiddeld", "Wisselend"], ["veel", "Overdag veel thuis"]]),
      field("Aantal zonnepanelen", "pvAantal", "14", "number", true),
      field("Wp per paneel", "pvWp", "430", "number", true),
      select("EV thuis laden", "ev", [["nee", "Nee"], ["ja", "Ja"]]),
      field("EV kWh/jaar", "evKwh", "3500", "number", false),
      select("Warmtepomp aanwezig", "wp", [["nee", "Nee"], ["ja", "Ja"]]),
      "</div></div>",
      '<div class="panel"><div class="panel-head"><div><p class="eyebrow">Verdienmodel</p><h2>Contract en opbrengsten</h2></div></div><div class="field-grid">',
      select("Aansluiting", "fase", [["1fase", "1-fase"], ["3fase", "3-fase"]]),
      select("Dynamic contract", "contract", [["dynamic", "Ja"], ["vast", "Nee"]]),
      select("EMS", "ems", [["ja", "Ja"], ["nee", "Nee"]]),
      select("Onbalansvergoeding", "onbalans", [["ja", "Ja"], ["nee", "Nee"]]),
      field("Terugleverkosten per kWh", "teruglever", "0.15", "number", true),
      field("EPEX marge per kWh", "epex", "0.22", "number", true),
      field("Onbalans EUR/kWh/jaar", "onbalansWaarde", "250", "number", true),
      select("BTW terugvorderen", "btw", [["ja", "Ja"], ["nee", "Nee"]]),
      "</div></div>",
      "</div>",
      '<div class="button-row"><button class="primary-button" type="submit">Bereken batterijadvies</button></div>',
      "</form>",
      '<div id="advice-result"></div>'
    ].join("");
  }

  function field(label, name, value, type, required) {
    return '<label class="field">' + label + '<input name="' + name + '" type="' + (type || "text") + '" value="' + S.escapeHtml(value || "") + '"' + (required ? " required" : "") + "></label>";
  }

  function select(label, name, options) {
    return '<label class="field">' + label + '<select name="' + name + '">' + options.map(function (option) {
      return '<option value="' + option[0] + '">' + option[1] + "</option>";
    }).join("") + "</select></label>";
  }

  function productsBy(category) {
    return S.getAll("products").filter(function (product) { return product.category === category; });
  }

  function calculateWp(data) {
    var opp = S.parseNumber(data.oppervlak);
    var bouwjaar = S.parseNumber(data.bouwjaar);
    var gas = S.parseNumber(data.gas);
    var personen = S.parseNumber(data.personen) || 2;
    var label = data.label;
    var afgifte = data.afgifte;
    var gasVerwarm = Math.max(0, gas - (data.kokenGas === "ja" ? 50 : 0) - (data.tapwater === "cv" ? personen * 50 : 0));
    var isoScore = label === "A" ? 4 : label === "B" ? 3 : label === "C" ? 2 : label === "D" ? 1 : 0;
    var wPerM2 = isoScore >= 4 ? 35 : isoScore === 3 ? 45 : isoScore === 2 ? 60 : isoScore === 1 ? 75 : 100;
    if (bouwjaar >= 2010) wPerM2 = Math.min(wPerM2, 40);
    else if (bouwjaar >= 1992) wPerM2 = Math.min(wPerM2, 55);
    else if (bouwjaar >= 1975) wPerM2 = Math.min(wPerM2, 75);
    var kwViaOpp = opp * wPerM2 / 1000;
    var kwViaGas = gasVerwarm > 0 ? gasVerwarm * 0.005 : kwViaOpp;
    var kwBenodigd = Math.max(3, Math.round((((kwViaOpp * 0.6 + kwViaGas * 0.4) + 1.5) * 1.1 + 1.3) * 10) / 10);
    var afgifteScore = { vloer: 35, vloer_beneden: 30, lt_radiatoren: 32, radiatoren: 18, convectoren: 0 };
    var score = isoScore * 10 + (afgifteScore[afgifte] || 0) + (bouwjaar >= 2010 ? 15 : bouwjaar >= 1992 ? 10 : bouwjaar >= 1975 ? 5 : 0);
    if (data.modern === "ja") score += 12;
    var type = score >= 55 ? "all-electric" : "hybride";
    var targetKw = kwBenodigd <= 9 ? 8 : 12;
    var products = productsBy("warmtepomp").filter(function (product) {
      return product.name.toLowerCase().indexOf(type === "all-electric" ? "all electric" : "hybride") >= 0;
    });
    products = products.filter(function (product) { return product.specs.indexOf(String(targetKw)) >= 0; }).concat(products).slice(0, 2);
    var prijsGas = S.parseNumber(data.prijsGas);
    var prijsStroom = S.parseNumber(data.prijsStroom);
    var kwhExtra = gasVerwarm * 9.77 / (type === "all-electric" ? 3.7 : 4.2);
    var gasRest = type === "all-electric" ? 0 : Math.max(0, gas - gasVerwarm * 0.75);
    var besparing = gas * prijsGas - (gasRest * prijsGas + kwhExtra * prijsStroom) + (type === "all-electric" ? 240 : 0);
    return { kind: "warmtepomp", title: type === "all-electric" ? "All-electric warmtepomp" : "Hybride warmtepomp", subtitle: "Benodigd vermogen circa " + kwBenodigd.toFixed(1).replace(".", ",") + " kW.", products: products, saving: besparing, notes: "Advies: " + type + ". Vermogen: " + kwBenodigd.toFixed(1) + " kW. Indicatieve jaarlijkse besparing: " + S.money(besparing) + "." };
  }

  function calculateBat(data) {
    var stroom = S.parseNumber(data.stroomJaar);
    var ev = data.ev === "ja" ? S.parseNumber(data.evKwh) : 0;
    var pvProductie = S.parseNumber(data.pvAantal) * S.parseNumber(data.pvWp) / 1000 * 900;
    var directFrac = data.patroon === "veel" ? 0.4 : data.patroon === "gemiddeld" ? 0.3 : 0.22;
    var verbruik = stroom + ev;
    var overschot = Math.max(0, pvProductie - Math.min(pvProductie * directFrac, verbruik));
    var avondFrac = data.patroon === "veel" ? 0.8 : data.patroon === "gemiddeld" ? 0.65 : 0.5;
    var minimumKwh = Math.max(5, verbruik / 365 * avondFrac);
    var products = productsBy("thuisbatterij").filter(function (product) {
      return data.fase === "3fase" ? product.specs.indexOf("3-fase") >= 0 : product.specs.indexOf("1-fase") >= 0;
    }).map(function (product) {
      var kwh = S.parseNumber((product.specs.match(/(\d+) kWh/) || [0, 10])[1]);
      var epex = data.contract === "dynamic" && data.ems === "ja" ? kwh * 1.4 * S.parseNumber(data.epex) * 365 * 0.85 : 0;
      var teruglever = Math.min(kwh * 0.85, overschot / 200) * 200 * 0.7 * S.parseNumber(data.teruglever);
      var onbalans = data.onbalans === "ja" ? kwh * S.parseNumber(data.onbalansWaarde) * 0.75 : 0;
      return Object.assign({}, product, { suitability: kwh >= minimumKwh ? "Geschikt" : "Te klein", yearly: teruglever + epex + onbalans });
    });
    products.sort(function (a, b) { return (b.yearly || 0) - (a.yearly || 0); });
    return { kind: "thuisbatterij", title: "Thuisbatterij advies", subtitle: "Minimum aanbevolen capaciteit circa " + minimumKwh.toFixed(1).replace(".", ",") + " kWh.", products: products.slice(0, 3), saving: products[0] ? products[0].yearly : 0, notes: "Advies thuisbatterij. PV-opwek circa " + Math.round(pvProductie).toLocaleString("nl-NL") + " kWh/jaar. Minimum capaciteit " + minimumKwh.toFixed(1) + " kWh." };
  }

  function resultHtml(result) {
    var cards = result.products.map(function (product, index) {
      return [
        '<article class="product-card' + (index === 0 ? " is-selected" : "") + '" data-advice-product="' + product.id + '">',
        '<span class="category-pill">' + S.escapeHtml(product.category) + "</span>",
        "<h3>" + S.escapeHtml(product.brand + " " + product.name) + "</h3>",
        '<p class="muted">' + S.escapeHtml(product.specs) + "</p>",
        "<p>" + S.escapeHtml(product.description) + "</p>",
        "<strong>" + S.money(product.priceExVat) + " excl. BTW</strong>",
        product.yearly ? '<span class="muted">Indicatieve opbrengst: ' + S.money(product.yearly) + " / jaar</span>" : "",
        '<button class="small-button" data-action="advice-select-product" data-id="' + product.id + '">Kies</button>',
        "</article>"
      ].join("");
    }).join("");
    return [
      '<section class="grid section" style="margin-top:18px;">',
      '<div class="result-hero"><p class="eyebrow" style="color:#b6d72a;">Aanbeveling</p><h2>' + S.escapeHtml(result.title) + '</h2><p>' + S.escapeHtml(result.subtitle) + '</p><strong>' + S.money(result.saving || 0) + '</strong></div>',
      '<div class="panel"><div class="panel-head"><div><p class="eyebrow">Productkeuze</p><h2>Passende opties</h2></div><button class="primary-button" data-action="advice-create-quote">Maak conceptofferte</button></div><div class="advice-products">' + cards + "</div></div>",
      '<div class="notice">' + S.escapeHtml(result.notes) + "</div>",
      "</section>"
    ].join("");
  }

  function submit(form) {
    var data = Object.fromEntries(new FormData(form).entries());
    var result = form.dataset.form === "advice-wp" ? calculateWp(data) : calculateBat(data);
    C.app.state.adviceResult = result;
    C.app.state.selectedAdviceProduct = result.products[0] && result.products[0].id;
    document.getElementById("advice-result").innerHTML = resultHtml(result);
  }

  function createQuote() {
    var result = C.app.state.adviceResult;
    var productId = C.app.state.selectedAdviceProduct;
    var product = S.getAll("products").find(function (item) { return item.id === productId; });
    if (!result || !product) {
      C.app.toast("Kies eerst een product uit het advies.");
      return;
    }
    return C.quotes.createFromAdvice({
      sourceAdviceId: S.uid("advice"),
      notes: result.notes + "\n\n" + S.settings().defaultQuoteTerms,
      lines: [{
        productId: product.id,
        description: product.brand + " " + product.name + " - " + product.specs,
        qty: 1,
        unit: "stuk",
        priceExVat: product.priceExVat,
        vatRate: product.vatRate
      }, {
        description: "Installatie, montage en inbedrijfstelling",
        qty: 1,
        unit: "post",
        priceExVat: result.kind === "thuisbatterij" ? 1250 : 1750,
        vatRate: 21
      }]
    }).then(function (quote) {
      C.app.toast("Conceptofferte aangemaakt vanuit advies.");
      C.app.navigate("quote:" + quote.id);
      return quote;
    });
  }

  function setTab(tab) {
    document.getElementById("advice-body").innerHTML = tab === "batterij" ? batterijForm() : warmtepompForm();
    Array.from(document.querySelectorAll(".advice-tab")).forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.tab === tab);
    });
  }

  window.addEventListener("message", handleAdviceMessage);

  C.advice = {
    render: render,
    postAssumptions: postAssumptions,
    setTab: setTab,
    submit: submit,
    createQuote: createQuote,
    createQuoteFromAdvice: createQuoteFromAdvice
  };
}());
