(function () {
  "use strict";

  var C = window.Climature = window.Climature || {};
  var S = C.storage;
  var PAGE_DEFS = [
    { id: "cover", label: "Voorblad" },
    { id: "intro", label: "Persoonlijk voorstel" },
    { id: "product", label: "Product & specificaties" },
    { id: "scope", label: "Levering & installatie" },
    { id: "benefits", label: "Voordelen & rendement" },
    { id: "investment", label: "Investering & voorwaarden" },
    { id: "acceptance", label: "Akkoord" }
  ];
  var LIBRARY = {
    thuisbatterij: "assets/quote-library/thuisbatterij.webp",
    warmtepomp: "assets/quote-library/warmtepomp.webp",
    cvketel: "assets/quote-library/cv-ketel.webp",
    airco: "assets/quote-library/airco.webp",
    maatwerk: "assets/quote-library/maatwerk.webp"
  };
  var COMPONENT_DEFAULTS = {
    thuisbatterij: { title: "Thuisbatterij", subtitle: "Slimme energieopslag, afgestemd op uw woning", includedText: "Thuisbatterij en hybride omvormer\nSlimme aansturing via EMS\nTechnische schouw en installatie\nConfiguratie, systeemtest en uitleg\nGratis ondersteuning bij de btw-teruggave", advantagesText: "Meer eigen zonnestroom gebruiken\nLagere energiekosten en meer onafhankelijkheid\nProfessionele installatie en monitoring" },
    warmtepomp: { title: "Warmtepomp", subtitle: "Duurzaam en comfortabel verwarmen", includedText: "Warmtepomp met binnen- en buitenunit\nAansluiting op de bestaande installatie\nMontage, vullen en inregelen\nInbedrijfstelling en gebruikersuitleg\nBenodigde documentatie voor subsidieaanvraag", advantagesText: "Minder gasverbruik\nStil en efficiënt verwarmen\nMogelijk recht op ISDE-subsidie" },
    cvketel: { title: "CV-ketel", subtitle: "Betrouwbaar warmtecomfort", includedText: "CV-ketel en aansluitmaterialen\nMontage en rookgasafvoer\nInregelen en systeemtest", advantagesText: "Betrouwbare werking\nEfficiënt verwarmen\nProfessioneel opgeleverd" },
    airco: { title: "Airco", subtitle: "Koelen en verwarmen in elk seizoen", includedText: "Binnen- en buitenunit\nLeidingwerk en montagemateriaal\nMontage en inbedrijfstelling", advantagesText: "Stille werking\nEnergiezuinig comfort\nBediening via app of afstandsbediening" },
    general: { title: "Algemene werkzaamheden", subtitle: "Een complete oplossing van advies tot oplevering", includedText: "Persoonlijk advies\nProfessionele installatie\nConfiguratie en inbedrijfstelling\nUitleg en nazorg", advantagesText: "Maatwerk voor uw situatie\nTransparante prijsopbouw\nVakkundige oplevering" }
  };

  function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
  function lines(value) { return String(value || "").split(/\n+/).map(function (line) { return line.trim(); }).filter(Boolean); }
  function chunks(items, size) {
    var result = [];
    for (var index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
    return result.length ? result : [[]];
  }
  function e(value) { return S.escapeHtml(value == null ? "" : value); }

  function componentDefaults(type, quote) {
    var base = COMPONENT_DEFAULTS[type] || COMPONENT_DEFAULTS.general;
    return {
      key: type || "general",
      type: type || "general",
      title: base.title,
      subtitle: base.subtitle,
      includedText: quote && quote.includedText || base.includedText,
      advantagesText: quote && quote.advantagesText || base.advantagesText,
      image: { source: "library", libraryKey: type && LIBRARY[type] ? type : "maatwerk", assetId: "" }
    };
  }

  function defaultComponents(quote) {
    var keys = [];
    (quote.lines || []).forEach(function (line) {
      var key = line.componentKey || "general";
      if (keys.indexOf(key) < 0) keys.push(key);
    });
    if (!keys.length || (keys.length === 1 && keys[0] === "general")) keys = [quote.templateType && quote.templateType !== "maatwerk" ? quote.templateType : "general"];
    return keys.map(function (key) { return componentDefaults(key, quote); });
  }

  function defaultConfig(quote, advice) {
    var yearly = Number(advice && advice.yearlySaving || 0);
    var payback = Number(advice && advice.paybackYears || 0);
    var subsidy = Number(advice && advice.subsidy || quote.benefitAmount || 0);
    return {
      version: 3,
      pages: PAGE_DEFS.map(function (page, index) { return { id: page.id, enabled: true, order: index }; }),
      image: { source: "library", libraryKey: quote.templateType || "maatwerk", assetId: "" },
      components: defaultComponents(quote),
      content: {
        productSubtitle: quote.templateType === "thuisbatterij" ? "Slimme energieopslag, afgestemd op uw woning" : quote.templateType === "warmtepomp" ? "Duurzaam en comfortabel verwarmen" : "Een complete oplossing van advies tot oplevering",
        installationText: "Onze vakspecialisten verzorgen de technische voorbereiding, montage, inbedrijfstelling en duidelijke uitleg. De planning wordt na akkoord samen met u afgestemd.",
        serviceText: "Ook na de installatie kunt u rekenen op ondersteuning, garantie volgens de voorwaarden en deskundig advies van Climature.",
        closingText: "Wij kijken ernaar uit om deze oplossing voor u te realiseren. Onderteken deze pagina om akkoord te gaan met het voorstel."
      },
      financial: {
        yearlySaving: yearly,
        monthlySaving: yearly ? yearly / 12 : 0,
        tenYearSaving: yearly ? yearly * 10 : 0,
        paybackYears: payback,
        subsidy: subsidy
      }
    };
  }

  function normalizeConfig(quote, advice) {
    var base = defaultConfig(quote || {}, advice);
    var saved = quote && quote.documentConfig && typeof quote.documentConfig === "object" ? clone(quote.documentConfig) : {};
    var pages = Array.isArray(saved.pages) ? saved.pages : base.pages;
    var byId = {};
    pages.forEach(function (page, index) {
      if (PAGE_DEFS.some(function (def) { return def.id === page.id; })) byId[page.id] = { id: page.id, enabled: page.enabled !== false, order: Number.isFinite(Number(page.order)) ? Number(page.order) : index };
    });
    base.pages = PAGE_DEFS.map(function (page, index) { return byId[page.id] || { id: page.id, enabled: true, order: index }; });
    base.pages.sort(function (a, b) { return a.order - b.order; }).forEach(function (page, index) { page.order = index; });
    base.image = Object.assign(base.image, saved.image || {});
    var components = Array.isArray(saved.components) && saved.components.length ? saved.components : base.components;
    base.components = components.map(function (component, index) {
      var key = String(component.key || component.type || "component-" + (index + 1));
      var defaults = componentDefaults(component.type || key, quote);
      return Object.assign(defaults, component, { key: key, type: component.type || defaults.type, image: Object.assign(defaults.image, component.image || {}) });
    });
    base.content = Object.assign(base.content, saved.content || {});
    base.financial = Object.assign(base.financial, saved.financial || {});
    base.version = 3;
    return base;
  }

  function imageUrl(image) {
    if (image && image.source === "upload" && image.assetId) return "/api/quote-assets/" + encodeURIComponent(image.assetId) + "/content";
    return LIBRARY[image && image.libraryKey] || LIBRARY.maatwerk;
  }

  function customerAddress(customer) {
    return [customer && customer.address, customer && [customer.postalCode, customer.city].filter(Boolean).join(" ")]
      .filter(Boolean)
      .map(e)
      .join("<br>");
  }

  function brand() {
    return '<div class="qd-brand"><span class="qd-brand-mark">⌂</span><strong>CLIMATURE</strong></div>';
  }

  function pageShell(id, title, body, index, total, theme, extraClass) {
    return '<section class="quote-page qd-theme-' + e(theme || "licht") + (extraClass ? " " + extraClass : "") + '" data-quote-page data-page-id="' + id + '"><header class="qd-page-header">' + brand() + '<span>OFFERTE OP MAAT &nbsp; | &nbsp; PAGINA ' + index + " VAN " + total + '</span></header><main class="qd-page-main">' + (title ? '<div class="qd-page-title"><span>CLIMATURE VOORSTEL</span><h2>' + e(title) + '</h2></div>' : "") + body + '</main><footer class="qd-footer"><span>info@climature.nl</span><span>www.climature.nl</span><span>085 060 3664</span></footer></section>';
  }

  function bullets(items, className) {
    return '<ul class="qd-checks ' + (className || "") + '">' + items.map(function (item) { return '<li><i>✓</i><span>' + e(item) + '</span></li>'; }).join("") + "</ul>";
  }

  function coverPage(ctx) {
    return '<section class="quote-page qd-cover qd-theme-' + e(ctx.theme) + '" data-quote-page data-page-id="cover"><div class="qd-cover-shade"></div><img class="qd-cover-image" src="' + e(ctx.image) + '" alt=""><div class="qd-cover-content">' + brand() + '<span class="qd-kicker">OFFERTE OP MAAT</span><h1>' + e(ctx.quote.documentTitle || "Uw energieoplossing op maat") + '</h1><p>' + e(ctx.config.content.productSubtitle) + '</p><div class="qd-cover-customer"><span>Samengesteld voor</span><strong>' + e(S.customerName(ctx.customer)) + '</strong><small>' + customerAddress(ctx.customer) + '</small></div></div><footer class="qd-cover-footer"><span>' + e(ctx.quote.quoteNumber) + '</span><span>' + e(S.formatDate(ctx.quote.quoteDate)) + '</span></footer></section>';
  }

  function introPage(ctx) {
    var intro = '<div class="qd-copy"><h3>Dank voor uw aanvraag.</h3><p>' + e(ctx.quote.introText).replace(/\n/g, "<br>") + '</p><p>Ons doel is eenvoudig: een betrouwbare, efficiënte en duurzame installatie die aansluit op uw woning, wensen en energiebehoefte.</p></div>';
    var why = '<div class="qd-highlight"><div><span>WAAROM CLIMATURE?</span><h3>Persoonlijk advies,<br>professioneel uitgevoerd.</h3><p>Van het eerste advies tot de oplevering heeft u één deskundige partner.</p></div>' + bullets(["Maatwerk voor uw situatie", "Transparante prijsopbouw", "Gecertificeerde installatie", "Service en ondersteuning na oplevering"]) + '</div>';
    return intro + why;
  }

  function componentLines(ctx, component) {
    var selected = (ctx.quote.lines || []).filter(function (line) { return (line.componentKey || "general") === component.key; });
    if (!selected.length && ctx.config.components.length === 1) selected = ctx.quote.lines || [];
    return S.calculateTotals(selected);
  }

  function productPage(ctx, component) {
    var totals = componentLines(ctx, component);
    var first = (totals.lines || []).filter(function (line) { return line.lineKind !== "discount"; })[0] || {};
    return '<div class="qd-product-hero"><div><span class="qd-kicker">' + e((component.title || component.type || "oplossing").toUpperCase()) + '</span><h3>' + e(first.description || component.title || ctx.quote.documentTitle) + '</h3><p>' + e(component.subtitle || ctx.config.content.productSubtitle) + '</p></div><img src="' + e(imageUrl(component.image)) + '" alt="Productafbeelding"></div><div class="qd-product-grid"><div><h3>Uw oplossing</h3>' + bullets(lines(component.includedText).slice(0, 7)) + '</div><div class="qd-spec-card"><span>Investering incl. btw</span><strong>' + S.money(totals.total) + '</strong><small>' + (first.qty ? e(first.qty + " " + first.unit) : "Compleet geleverd en geïnstalleerd") + '</small></div></div>';
  }

  function scopePage(ctx, included, showDetails, component) {
    var steps = ["Technische voorbereiding en controle", "Planning in overleg", "Professionele montage", "Configuratie en systeemtest", "Uitleg en oplevering"];
    if (!showDetails) return '<div><h3>Vervolg leveringsomvang</h3>' + bullets(included, "qd-large-checks") + '</div>';
    return '<div class="qd-two-col"><div><h3>Dit is inbegrepen bij ' + e(component.title || "deze oplossing") + '</h3>' + bullets(included) + '</div><div class="qd-numbered"><h3>Van voorbereiding tot oplevering</h3>' + steps.map(function (step, index) { return '<div><b>' + (index + 1) + '</b><span>' + e(step) + '</span></div>'; }).join("") + '</div></div><div class="qd-note"><h3>Zorgeloos geïnstalleerd</h3><p>' + e(ctx.config.content.installationText) + '</p></div><div class="qd-service-strip"><strong>Nazorg en ondersteuning</strong><span>' + e(ctx.config.content.serviceText) + '</span></div>';
  }

  function benefitsPage(ctx, advantages, showReturn) {
    var f = ctx.config.financial;
    var values = [];
    if (Number(f.monthlySaving) > 0) values.push(["Per maand", S.money(Number(f.monthlySaving))]);
    if (Number(f.yearlySaving) > 0) values.push(["Per jaar", S.money(Number(f.yearlySaving))]);
    if (Number(f.tenYearSaving) > 0) values.push(["Over 10 jaar", S.money(Number(f.tenYearSaving))]);
    if (Number(f.paybackYears) > 0) values.push(["Terugverdientijd", Number(f.paybackYears).toLocaleString("nl-NL") + " jaar"]);
    var result = '<div class="qd-benefit-intro"><h3>Waarom deze oplossing?</h3>' + bullets(advantages, "qd-large-checks") + '</div>';
    if (!showReturn) return result;
    return result + '<div class="qd-return-card"><span>INDICATIEVE OPBRENGST EN BESPARING</span><div class="qd-metrics">' + (values.length ? values.map(function (value) { return '<div><small>' + e(value[0]) + '</small><strong>' + e(value[1]) + '</strong></div>'; }).join("") : '<p>Voeg financiële verwachtingen toe in de offertebouwer om hier een prognose te tonen.</p>') + '</div><p>Berekeningen zijn indicatief en gebaseerd op de opgegeven situatie en actuele aannames. Werkelijke resultaten kunnen afwijken door gebruik, tarieven, weersomstandigheden en marktontwikkelingen.</p></div>';
  }

  function lineRows(items) {
    return items.map(function (line) { return '<tr><td>' + e(line.description) + '</td><td>' + e(line.qty + " " + line.unit) + '</td><td>' + S.money(line.priceExVat) + '</td><td>' + e(line.vatRate) + '%</td><td>' + S.money(line.total) + '</td></tr>'; }).join("");
  }

  function quoteBenefits(quote) {
    if (Array.isArray(quote.benefits)) return quote.benefits.filter(function (benefit) { return Number(benefit.amount) > 0; });
    if (!quote.benefitType || quote.benefitType === "geen" || Number(quote.benefitAmount) <= 0) return [];
    return [{ type: quote.benefitType === "btw" ? "btw_refund" : quote.benefitType === "subsidie" ? "isde" : "other", label: quote.benefitLabel || "Verwacht voordeel", amount: quote.benefitAmount, reviewed: false }];
  }

  function benefitTotal(quote) {
    return quoteBenefits(quote).reduce(function (sum, benefit) { return sum + Math.max(0, Number(benefit.amount || 0)); }, 0);
  }

  function regulationDisclaimer(ctx) {
    var types = quoteBenefits(ctx.quote).map(function (benefit) { return benefit.type; });
    var notices = [];
    if (types.indexOf("btw_refund") >= 0) notices.push("Een mogelijke btw-teruggave voor een thuisbatterij is afhankelijk van onder meer stroomhandel, EMS, een dynamisch energiecontract, tenaamstelling en de KOR-situatie. Climature kan de uitkomst niet garanderen.");
    if (types.indexOf("isde") >= 0) notices.push("Een mogelijke ISDE-subsidie is afhankelijk van de actuele RVO-voorwaarden, product- en meldcodegegevens, installatie en goedkeuring. Climature kan de toekenning niet garanderen.");
    if (!notices.length) notices.push("Subsidies, belastingteruggaven en besparingen zijn indicatief en afhankelijk van actuele voorwaarden, persoonlijke omstandigheden en goedkeuring door de bevoegde instantie.");
    return notices.join(" ");
  }

  function investmentPage(ctx, items, showSummary) {
    var benefits = quoteBenefits(ctx.quote);
    var totalBenefits = benefitTotal(ctx.quote);
    var table = '<div class="qd-table-wrap"><table class="qd-price-table"><thead><tr><th>Omschrijving</th><th>Aantal</th><th>Prijs excl.</th><th>BTW</th><th>Subtotaal</th></tr></thead><tbody>' + lineRows(items) + '</tbody></table></div>';
    if (!showSummary) return table + '<div class="qd-note"><p>De prijsopbouw wordt op de volgende pagina vervolgd.</p></div>';
    var benefitRows = benefits.map(function (benefit) { return '<div class="qd-benefit-row"><span>' + e(benefit.label || "Verwacht voordeel") + '</span><strong>− ' + S.money(Number(benefit.amount || 0)) + '</strong></div>'; }).join("");
    var benefitSummary = benefits.length ? benefitRows + (benefits.length > 1 ? '<div class="qd-benefit-total"><span>Totaal verwacht voordeel</span><strong>− ' + S.money(totalBenefits) + '</strong></div>' : "") + '<div class="qd-net"><span>Indicatieve netto-investering</span><strong>' + S.money(Math.max(0, ctx.totals.total - totalBenefits)) + '</strong></div>' : "";
    return table + '<div class="qd-investment"><div><span>Subtotaal excl. btw</span><strong>' + S.money(ctx.totals.subtotal) + '</strong></div><div><span>BTW</span><strong>' + S.money(ctx.totals.vat) + '</strong></div><div class="qd-gross"><span>Te betalen incl. btw</span><strong>' + S.money(ctx.totals.total) + '</strong></div>' + benefitSummary + '</div><div class="qd-terms"><h3>Regelingen en voorwaarden</h3><p>' + e(ctx.quote.notes).replace(/\n/g, "<br>") + '</p><small>' + e(regulationDisclaimer(ctx)) + '</small></div>';
  }

  function acceptancePage(ctx) {
    return '<div class="qd-accept-intro"><span>AKKOORD MET DE OFFERTE</span><h3>Klaar voor de volgende stap?</h3><p>' + e(ctx.config.content.closingText) + '</p></div><div class="qd-accept-summary"><div><span>Offertenummer</span><strong>' + e(ctx.quote.quoteNumber) + '</strong></div><div><span>Klant</span><strong>' + e(S.customerName(ctx.customer)) + '</strong></div><div><span>Te betalen incl. btw</span><strong>' + S.money(ctx.totals.total) + '</strong></div><div><span>Geldig tot</span><strong>' + e(S.formatDate(ctx.quote.validUntil)) + '</strong></div></div>' + (benefitTotal(ctx.quote) > 0 ? '<div class="qd-note"><p>Verwachte teruggaven zijn indicatief en staan los van het bedrag waarvoor u met deze offerte opdracht geeft.</p></div>' : "") + '<div class="qd-sign"><div><span>Naam</span></div><div><span>Plaats en datum</span></div><div class="qd-signature"><span>Handtekening voor akkoord</span></div></div><div class="qd-contact-card">' + brand() + '<div><strong>Vragen over dit voorstel?</strong><span>info@climature.nl &nbsp; · &nbsp; 085 060 3664 &nbsp; · &nbsp; www.climature.nl</span></div></div>';
  }

  function render(quote, customer, settings, config) {
    config = config || normalizeConfig(quote);
    var enabled = config.pages.filter(function (page) { return page.enabled !== false; }).sort(function (a, b) { return a.order - b.order; });
    var ctx = { quote: quote, customer: customer || {}, settings: settings || {}, config: config, totals: S.calculateTotals(quote.lines || []), theme: quote.designStyle || "licht", image: imageUrl((config.components[0] && config.components[0].image) || config.image) };
    var rendered = [];
    enabled.forEach(function (page) {
      if (page.id === "cover") return rendered.push({ id: page.id, cover: true });
      if (page.id === "product") return config.components.forEach(function (component, componentIndex) {
        rendered.push({ id: config.components.length === 1 ? page.id : page.id + "-" + component.key, baseId: page.id, body: productPage(ctx, component), customTitle: component.title, continuation: componentIndex > 0 });
      });
      if (page.id === "scope") return config.components.forEach(function (component) { chunks(lines(component.includedText), 10).forEach(function (items, index) {
        var componentSuffix = config.components.length === 1 ? "" : "-" + component.key;
        rendered.push({ id: page.id + componentSuffix + (index ? "-" + (index + 1) : ""), baseId: page.id, body: scopePage(ctx, items, index === 0, component), customTitle: "Levering & installatie · " + component.title, continuation: index > 0 });
      }); });
      if (page.id === "benefits") return chunks(lines(config.components.map(function (component) { return component.advantagesText; }).filter(Boolean).join("\n") || ctx.quote.advantagesText), 8).forEach(function (items, index) {
        rendered.push({ id: page.id + (index ? "-" + (index + 1) : ""), baseId: page.id, body: benefitsPage(ctx, items, index === 0), continuation: index > 0 });
      });
      if (page.id === "investment") return chunks(ctx.totals.lines, 4).forEach(function (items, index, all) {
        rendered.push({ id: page.id + (index ? "-" + (index + 1) : ""), baseId: page.id, body: investmentPage(ctx, items, index === all.length - 1), continuation: index > 0 });
      });
      rendered.push({ id: page.id, baseId: page.id, body: page.id === "intro" ? introPage(ctx) : acceptancePage(ctx) });
    });
    return '<div class="quote-document" data-quote-document>' + rendered.map(function (page, index) {
      if (page.cover) return coverPage(ctx);
      var title = (page.customTitle || PAGE_DEFS.find(function (def) { return def.id === page.baseId; }).label) + (page.continuation && !page.customTitle ? " — vervolg" : "");
      return pageShell(page.id, title, page.body, index + 1, rendered.length, ctx.theme, "qd-page-" + page.baseId);
    }).join("") + "</div>";
  }

  function overflowWarnings(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll("[data-quote-page]")).filter(function (page) { return page.scrollHeight > page.clientHeight + 3; }).map(function (page) {
      var def = PAGE_DEFS.find(function (item) { return page.dataset.pageId === item.id || page.dataset.pageId.indexOf(item.id + "-") === 0; });
      return (def && def.label || page.dataset.pageId) + " bevat te veel inhoud.";
    });
  }

  function contentWarnings(quote, config) {
    var checks = [
      [quote.introText, 1200, "De introductietekst"],
      [config.content.productSubtitle, 220, "De productondertitel"],
      [config.content.installationText, 700, "De installatietekst"],
      [config.content.serviceText, 500, "De nazorgtekst"],
      [quote.notes, 1800, "De voorwaarden"]
    ];
    return checks.filter(function (check) { return String(check[0] || "").length > check[1]; }).map(function (check) {
      return check[2] + " is langer dan de aanbevolen " + check[1] + " tekens.";
    });
  }

  function regulationWarnings(quote) {
    return quoteBenefits(quote).some(function (benefit) { return !benefit.reviewed; })
      ? ["Minimaal één verwachte teruggave is nog niet als gecontroleerd gemarkeerd. Controleer de persoonlijke voorwaarden voordat u de offerte verstuurt."]
      : [];
  }

  function waitForAssets(root) {
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    var images = Array.from(root.querySelectorAll("img")).map(function (img) {
      if (img.complete) return img.decode ? img.decode().catch(function () {}) : Promise.resolve();
      return new Promise(function (resolve) { img.onload = img.onerror = resolve; });
    });
    return Promise.all([fonts].concat(images));
  }

  function downloadPdf(quote, customer, settings, config) {
    if (!window.html2canvas || !window.jspdf || !window.jspdf.jsPDF) return Promise.reject(new Error("PDF-module is niet beschikbaar."));
    var regulation = regulationWarnings(quote);
    if (regulation.length && !window.confirm(regulation[0] + " Toch doorgaan met exporteren?")) return Promise.resolve(false);
    var host = document.createElement("div");
    host.className = "quote-export-host";
    host.innerHTML = render(quote, customer, settings, config);
    document.body.appendChild(host);
    return waitForAssets(host).then(function () {
      var warnings = contentWarnings(quote, config || normalizeConfig(quote)).concat(overflowWarnings(host));
      if (warnings.length) throw new Error(warnings[0] + " Verkort de tekst voordat u exporteert.");
      var pages = Array.from(host.querySelectorAll("[data-quote-page]"));
      var pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
      return pages.reduce(function (promise, page, index) {
        return promise.then(function () {
          return window.html2canvas(page, { scale: 2, useCORS: true, backgroundColor: null, logging: false }).then(function (canvas) {
            if (index) pdf.addPage("a4", "portrait");
            pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, 210, 297, undefined, "FAST");
          });
        });
      }, Promise.resolve()).then(function () {
        pdf.save("Climature-offerte-" + String(quote.quoteNumber || "concept").replace(/[^a-z0-9-]+/gi, "-") + ".pdf");
      });
    }).finally(function () { host.remove(); });
  }

  function print(quote, customer, settings, config) {
    var regulation = regulationWarnings(quote);
    if (regulation.length && !window.confirm(regulation[0] + " Toch doorgaan met afdrukken?")) return Promise.resolve(false);
    var target = document.getElementById("print-document");
    target.innerHTML = render(quote, customer, settings, config);
    return waitForAssets(target).then(function () {
      var warnings = contentWarnings(quote, config || normalizeConfig(quote)).concat(overflowWarnings(target));
      if (warnings.length) throw new Error(warnings[0] + " Verkort de tekst voordat u afdrukt.");
      window.print();
    });
  }

  C.quoteDocument = { PAGE_DEFS: PAGE_DEFS, LIBRARY: LIBRARY, defaultConfig: defaultConfig, normalizeConfig: normalizeConfig, render: render, overflowWarnings: overflowWarnings, contentWarnings: contentWarnings, regulationWarnings: regulationWarnings, downloadPdf: downloadPdf, print: print };
}());
