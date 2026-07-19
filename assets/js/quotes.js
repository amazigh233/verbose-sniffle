(function () {
  "use strict";

  var C = window.Climature = window.Climature || {};
  var S = C.storage;
  var draftTimer = null;
  var DRAFT_TTL = 24 * 60 * 60 * 1000;

  var TEMPLATES = {
    combinatie: {
      label: "Combinatie", icon: "＋", benefitType: "geen", benefitLabel: "",
      title: "Uw complete energieoplossing op maat",
      intro: "Dank voor uw aanvraag. In dit voorstel combineren wij slimme energieopslag met duurzaam verwarmen, afgestemd op uw woning en energiebehoefte.",
      included: "Technische schouw en voorbereiding\nProfessionele installatie\nConfiguratie en inbedrijfstelling\nUitleg en nazorg",
      advantages: "Eén geïntegreerde oplossing\nMeer grip op energiegebruik en kosten\nEén aanspreekpunt voor installatie en service"
    },
    maatwerk: {
      label: "Maatwerk", icon: "✦", benefitType: "geen", benefitLabel: "",
      title: "Uw energieoplossing op maat",
      intro: "Dank voor uw aanvraag. Op basis van uw situatie hebben wij deze oplossing zorgvuldig voor u samengesteld.",
      included: "Persoonlijk advies\nProfessionele installatie\nConfiguratie en inbedrijfstelling\nUitleg en nazorg",
      advantages: "Een oplossing afgestemd op uw woning\nTransparante prijsopbouw\nVakkundige installatie door Climature"
    },
    thuisbatterij: {
      label: "Thuisbatterij", icon: "⚡", benefitType: "btw", benefitLabel: "Mogelijke btw-teruggave",
      title: "Slimme energieopslag voor uw woning",
      intro: "Met een thuisbatterij gebruikt u meer van uw eigen zonnestroom en bent u minder afhankelijk van het elektriciteitsnet. De installatie wordt afgestemd op uw verbruik, aansluiting en bestaande zonnepanelen.",
      included: "Thuisbatterij en hybride omvormer\nSlimme aansturing via EMS\nTechnische schouw en installatie\nConfiguratie, systeemtest en uitleg\nOndersteuning bij de btw-teruggave",
      advantages: "Meer eigen zonnestroom gebruiken\nLagere energiekosten en meer onafhankelijkheid\nProfessionele installatie en monitoring"
    },
    warmtepomp: {
      label: "Warmtepomp", icon: "♨", benefitType: "subsidie", benefitLabel: "Verwachte ISDE-subsidie",
      title: "Comfortabel en energiezuinig verwarmen",
      intro: "Deze warmtepompoplossing wordt afgestemd op uw woning, afgiftesysteem en warmtevraag. Zo combineert u comfort met een lager gasverbruik en een toekomstbestendige installatie.",
      included: "Warmtepomp met binnen- en buitenunit\nAansluiting op de bestaande installatie\nMontage, vullen en inregelen\nInbedrijfstelling en gebruikersuitleg\nBenodigde documentatie voor subsidieaanvraag",
      advantages: "Minder gasverbruik\nStil en efficiënt verwarmen\nMogelijk recht op ISDE-subsidie"
    },
    cvketel: {
      label: "CV-ketel", icon: "◉", benefitType: "geen", benefitLabel: "",
      title: "Betrouwbaar warmtecomfort voor uw woning",
      intro: "Een efficiënte cv-ketel, professioneel geplaatst en zorgvuldig ingeregeld voor betrouwbaar warm water en comfortabel verwarmen.",
      included: "CV-ketel en standaard aansluitmaterialen\nDemontage bestaande ketel\nMontage en rookgasafvoer\nInregelen en systeemtest\nGebruikersuitleg",
      advantages: "Betrouwbaar warmtecomfort\nEfficiënte werking\nProfessioneel gemonteerd en opgeleverd"
    },
    airco: {
      label: "Airco", icon: "❄", benefitType: "geen", benefitLabel: "",
      title: "Een aangenaam binnenklimaat in elk seizoen",
      intro: "Koelen én verwarmen met een stille, energiezuinige airco-oplossing die past bij de ruimte en het gewenste comfort.",
      included: "Binnen- en buitenunit\nLeidingwerk en montagemateriaal\nElektrische aansluiting binnen standaard bereik\nMontage, vacumeren en inbedrijfstelling\nBedieningsuitleg",
      advantages: "Snel koelen en efficiënt bijverwarmen\nStille en comfortabele werking\nBediening via afstandsbediening of app"
    }
  };

  function statusClass(status) {
    if (isAcceptedStatus(status)) return "ok";
    if (status === "afgewezen") return "danger";
    if (status === "verstuurd") return "warn";
    return "";
  }

  function isAcceptedStatus(status) {
    return status === "geaccepteerd" || status === "geaccepteerd/aanbetaling";
  }

  function baseQuote(seed) {
    var settings = S.settings();
    return Object.assign({
      quoteNumber: S.peekNumber("quote"),
      customerId: seed && seed.customerId || "",
      quoteDate: S.today(),
      validUntil: S.addDays(S.today(), 30),
      status: "concept",
      templateType: "maatwerk",
      designStyle: "licht",
      documentTitle: TEMPLATES.maatwerk.title,
      introText: TEMPLATES.maatwerk.intro,
      includedText: TEMPLATES.maatwerk.included,
      advantagesText: TEMPLATES.maatwerk.advantages,
      benefitType: "geen",
      benefitLabel: "",
      benefitAmount: 0,
      benefits: [],
      lines: [{ description: "Levering en installatie", qty: 1, unit: "post", priceExVat: 0, vatRate: 21, componentKey: "general", lineKind: "item", vatRefundEligible: false }],
      notes: settings.defaultQuoteTerms,
      sourceAdviceId: ""
    }, seed || {});
  }

  function renderList(query) {
    var customers = S.getAll("customers");
    var q = (query || "").toLowerCase();
    var quotes = S.getAll("quotes").filter(function (quote) {
      var customer = quote.customer || customers.find(function (item) { return item.id === quote.customerId; });
      return !q || [quote.quoteNumber, S.customerName(customer), quote.status].join(" ").toLowerCase().indexOf(q) >= 0;
    });
    var rows = quotes.map(function (quote) {
      var customer = quote.customer || customers.find(function (item) { return item.id === quote.customerId; });
      return [
        "<tr>",
        "<td><strong>" + S.escapeHtml(quote.quoteNumber) + "</strong><br><span class=\"muted\">" + S.formatDate(quote.quoteDate) + "</span></td>",
        "<td>" + S.escapeHtml(S.customerName(customer)) + "</td>",
        '<td><span class="status-pill ' + statusClass(quote.status) + '">' + S.escapeHtml(quote.status) + "</span></td>",
        "<td><strong>" + S.money(quote.total || 0) + "</strong><br><span class=\"muted\">" + S.escapeHtml((TEMPLATES[quote.templateType] || TEMPLATES.maatwerk).label) + "</span></td>",
        "<td>" + listActions(quote) + "</td>",
        "</tr>"
      ].join("");
    }).join("");
    return [
      '<section class="section panel">',
      '<div class="panel-head"><div><p class="eyebrow">Offertes</p><h2>Offertes beheren</h2></div></div>',
      '<input class="search-input" type="search" placeholder="Zoeken op klantnaam, status of offertenummer" value="' + S.escapeHtml(query || "") + '" data-action="quote-search">',
      query ? '<div class="active-filters"><span>Zoekfilter: <strong>' + S.escapeHtml(query) + '</strong></span><a href="#quotes">Filter wissen</a></div>' : "",
      quotes.length ? '<div class="table-wrap" style="margin-top:14px;"><table class="data-table"><caption class="visually-hidden">Offertes</caption><thead><tr><th>Offerte</th><th>Klant</th><th>Status</th><th>Totaal</th><th>Acties</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty-state" style="margin-top:14px;">Geen offertes gevonden.</div>',
      S.paginationControls("quotes"),
      "</section>"
    ].join("");
  }

  function listActions(quote) {
    return [
      '<div class="button-row">',
      '<button class="small-button" data-action="quote-detail" data-id="' + S.escapeHtml(quote.id) + '">Open</button>',
      '<button class="small-button" data-action="quote-edit" data-id="' + S.escapeHtml(quote.id) + '">Bewerk</button>',
      S.isAdmin() && isAcceptedStatus(quote.status) ? '<button class="small-button" data-action="quote-to-invoice" data-id="' + S.escapeHtml(quote.id) + '">Factuur</button>' : "",
      S.isAdmin() && isAcceptedStatus(quote.status) ? '<button class="small-button" data-action="quote-to-installation" data-id="' + S.escapeHtml(quote.id) + '">Planning</button>' : "",
      !isAcceptedStatus(quote.status) && quote.status !== "afgewezen" ? '<button class="small-button" data-action="quote-status" data-status="geaccepteerd" data-id="' + S.escapeHtml(quote.id) + '">Accepteer</button>' : "",
      "</div>"
    ].join("");
  }

  function customerOptions(selectedId) {
    var customers = S.getAll("customers");
    return '<option value="">Kies klant</option>' + customers.map(function (customer) {
      return '<option value="' + customer.id + '"' + (customer.id === selectedId ? " selected" : "") + ">" + S.escapeHtml(S.customerName(customer)) + "</option>";
    }).join("");
  }

  function productOptions(selectedId) {
    return '<option value="">Vrije regel</option>' + S.getAll("products").map(function (product) {
      return '<option value="' + product.id + '"' + (product.id === selectedId ? " selected" : "") + ">" + S.escapeHtml(product.brand + " " + product.name) + "</option>";
    }).join("");
  }

  function componentLabel(key) {
    return key === "thuisbatterij" ? "Thuisbatterij" : key === "warmtepomp" ? "Warmtepomp" : key === "cvketel" ? "CV-ketel" : key === "airco" ? "Airco" : "Algemeen";
  }

  function componentOptions(selectedKey) {
    return ["general", "thuisbatterij", "warmtepomp", "cvketel", "airco"].map(function (key) {
      return '<option value="' + key + '"' + (key === selectedKey ? " selected" : "") + '>' + componentLabel(key) + '</option>';
    }).join("");
  }

  function lineRow(line) {
    var l = Object.assign({ description: "", qty: 1, unit: "stuk", priceExVat: 0, vatRate: 21, productId: "", componentKey: "general", lineKind: "item", vatRefundEligible: false }, line || {});
    return [
      '<div class="line-row quote-line">',
      '<select aria-label="Product kiezen" data-line="productId" data-action="quote-product-select">' + productOptions(l.productId) + "</select>",
      '<select aria-label="Productblok kiezen" data-line="componentKey">' + componentOptions(l.componentKey) + '</select>',
      '<select aria-label="Regelsoort kiezen" data-line="lineKind"><option value="item">Product/dienst</option><option value="discount"' + (l.lineKind === "discount" ? " selected" : "") + '>Korting</option></select>',
      '<input aria-label="Aantal" data-line="qty" type="number" min="0" step="0.01" value="' + S.escapeHtml(l.qty) + '">',
      '<input aria-label="Eenheid" data-line="unit" type="text" value="' + S.escapeHtml(l.unit) + '">',
      '<input aria-label="Prijs exclusief btw" data-line="priceExVat" type="number" min="0" step="0.01" value="' + S.escapeHtml(Math.abs(Number(l.priceExVat || 0))) + '">',
      '<select aria-label="Btw-tarief" data-line="vatRate"><option value="21"' + (Number(l.vatRate) === 21 ? " selected" : "") + '>21%</option><option value="9"' + (Number(l.vatRate) === 9 ? " selected" : "") + '>9%</option><option value="0"' + (Number(l.vatRate) === 0 ? " selected" : "") + ">0%</option></select>",
      '<label class="line-check"><input data-line="vatRefundEligible" type="checkbox" value="true"' + (l.vatRefundEligible ? " checked" : "") + '><span>BTW-teruggave</span></label>',
      '<strong class="line-total">-</strong>',
      '<button class="small-button" type="button" data-action="quote-remove-line" aria-label="Offertregel verwijderen">×</button>',
      '<input aria-label="Omschrijving" data-line="description" class="full-line-description" type="text" value="' + S.escapeHtml(l.description) + '" placeholder="Omschrijving" style="grid-column:1 / -1;">',
      "</div>"
    ].join("");
  }

  function quoteBenefits(quote) {
    if (Array.isArray(quote.benefits)) return quote.benefits;
    if (!quote.benefitType || quote.benefitType === "geen" || Number(quote.benefitAmount) <= 0) return [];
    return [{ id: "legacy-benefit", type: quote.benefitType === "btw" ? "btw_refund" : quote.benefitType === "subsidie" ? "isde" : "other", label: quote.benefitLabel || "Verwacht voordeel", amount: quote.benefitAmount, componentKey: quote.benefitType === "btw" ? "thuisbatterij" : quote.benefitType === "subsidie" ? "warmtepomp" : "general", calculationMode: "manual", reviewed: false }];
  }

  function benefitRow(benefit) {
    var b = Object.assign({ id: "benefit-" + Date.now(), type: "other", label: "Ander verwacht voordeel", amount: 0, componentKey: "general", calculationMode: "manual", reviewed: false }, benefit || {});
    return '<div class="quote-benefit-row" data-benefit-row data-benefit-id="' + S.escapeHtml(b.id) + '">' +
      '<select data-benefit="type" data-action="quote-benefit-change"><option value="btw_refund"' + (b.type === "btw_refund" ? " selected" : "") + '>BTW-teruggave</option><option value="isde"' + (b.type === "isde" ? " selected" : "") + '>ISDE</option><option value="other"' + (b.type === "other" ? " selected" : "") + '>Ander voordeel</option></select>' +
      '<input data-benefit="label" value="' + S.escapeHtml(b.label) + '" placeholder="Naam regeling">' +
      '<select data-benefit="componentKey">' + componentOptions(b.componentKey) + '</select>' +
      '<select data-benefit="calculationMode"><option value="manual">Handmatig</option><option value="eligible_vat"' + (b.calculationMode === "eligible_vat" ? " selected" : "") + '>Automatische BTW</option><option value="advice"' + (b.calculationMode === "advice" ? " selected" : "") + '>Uit advies</option></select>' +
      '<input data-benefit="amount" type="number" min="0" step="0.01" value="' + S.escapeHtml(b.amount || 0) + '">' +
      '<label class="benefit-reviewed"><input data-benefit="reviewed" type="checkbox" value="true"' + (b.reviewed ? " checked" : "") + '><span>Voorwaarden gecontroleerd</span></label>' +
      '<button class="small-button" type="button" data-action="quote-remove-benefit">×</button></div>';
  }

  function componentEditor(component) {
    var c = component || {};
    return '<article class="quote-component-card" data-component data-component-key="' + S.escapeHtml(c.key || c.type || "general") + '">' +
      '<div class="panel-head"><div><p class="eyebrow">Productblok</p><h3>' + S.escapeHtml(c.title || componentLabel(c.type)) + '</h3></div><button class="small-button" type="button" data-action="quote-remove-component">Verwijder</button></div>' +
      '<div class="field-grid"><label class="field">Type<select data-component-field="type">' + componentOptions(c.type || c.key) + '</select></label><label class="field">Titel<input data-component-field="title" value="' + S.escapeHtml(c.title || "") + '"></label>' +
      '<label class="field full">Ondertitel<input data-component-field="subtitle" value="' + S.escapeHtml(c.subtitle || "") + '"></label>' +
      '<label class="field full">Inbegrepen <small>Eén punt per regel</small><textarea data-component-field="includedText" rows="5">' + S.escapeHtml(c.includedText || "") + '</textarea></label>' +
      '<label class="field full">Voordelen <small>Eén punt per regel</small><textarea data-component-field="advantagesText" rows="4">' + S.escapeHtml(c.advantagesText || "") + '</textarea></label></div>' +
      '<div class="quote-component-images">' + ["thuisbatterij", "warmtepomp", "cvketel", "airco", "maatwerk"].map(function (key) { return '<button class="quote-image-choice' + (c.image && c.image.source === "library" && c.image.libraryKey === key ? " is-active" : "") + '" type="button" data-action="quote-component-image" data-image-key="' + key + '"><img src="' + C.quoteDocument.LIBRARY[key] + '" alt="' + key + '"></button>'; }).join("") + '</div>' +
      '<label class="field">Eigen afbeelding<input type="file" accept="image/jpeg,image/png,image/webp" data-action="quote-component-image-upload"></label>' +
      '<input type="hidden" data-component-field="imageSource" value="' + S.escapeHtml(c.image && c.image.source || "library") + '"><input type="hidden" data-component-field="imageLibraryKey" value="' + S.escapeHtml(c.image && c.image.libraryKey || c.type || "maatwerk") + '"><input type="hidden" data-component-field="imageAssetId" value="' + S.escapeHtml(c.image && c.image.assetId || "") + '"></article>';
  }

  function renderForm(quote) {
    var q = baseQuote(quote || {});
    var advice = S.getAll("advices").find(function (item) { return item.id === q.sourceAdviceId; });
    var config = C.quoteDocument.normalizeConfig(q, advice);
    q.documentConfig = config;
    q.benefits = quoteBenefits(q);
    var customer = S.getAll("customers").find(function (item) { return item.id === q.customerId; }) || {};
    return [
      '<form class="quote-builder" data-form="quote" data-id="' + S.escapeHtml(q.id || "") + '" data-sales-opportunity-id="' + S.escapeHtml(q.salesOpportunityId || "") + '" data-source-advice-id="' + S.escapeHtml(q.sourceAdviceId || "") + '">',
      '<div class="quote-builder-toolbar"><div><p class="eyebrow">Offertebouwer v3</p><h2>' + (q.id ? "Offerte vormgeven" : "Nieuwe offerte op maat") + '</h2><p class="muted">Productblokken, regelingen en het te betalen bedrag blijven duidelijk van elkaar gescheiden.</p><small class="quote-draft-status" data-quote-draft-status>Conceptbeveiliging is actief.</small></div><div class="button-row"><button class="ghost-button quote-mobile-toggle" type="button" data-action="quote-mobile-view" data-view="controls">Invoer</button><button class="ghost-button quote-mobile-toggle" type="button" data-action="quote-mobile-view" data-view="preview">Voorbeeld</button><button class="ghost-button" type="button" data-action="quotes">Annuleren</button><button class="ghost-button" type="button" data-action="quote-draft-pdf">PDF voorbeeld</button><button class="primary-button" type="submit">Offerte opslaan</button></div></div>',
      '<section class="quote-template-picker" aria-label="Offertetemplate">' + templateCards(q.templateType) + '</section>',
      '<div class="quote-builder-layout"><div class="quote-builder-controls">',
      '<section class="panel compact-panel"><div class="panel-head"><div><p class="eyebrow">1. Basisgegevens</p><h2>Klant en document</h2></div></div>',
      '<div class="field-grid">',
      '<label class="field">Klant zoeken<input type="search" data-action="form-customer-search" autocomplete="off" placeholder="Naam, bedrijf of plaats"></label>',
      '<label class="field">Klant<select name="customerId" required>' + customerOptions(q.customerId) + '</select></label>',
      '<label class="field">Offertenummer<input name="quoteNumber" required value="' + S.escapeHtml(q.quoteNumber) + '"></label>',
      '<label class="field">Offertedatum<input name="quoteDate" type="date" required value="' + S.escapeHtml(q.quoteDate) + '"></label>',
      '<label class="field">Geldig tot<input name="validUntil" type="date" required value="' + S.escapeHtml(q.validUntil) + '"></label>',
      '<label class="field">Status<select name="status">' + statusOptions(q.status) + '</select></label>',
      '<label class="field">Ontwerp<select name="designStyle" data-action="quote-preview-change"><option value="licht"' + (q.designStyle === "licht" ? " selected" : "") + '>Licht & zakelijk</option><option value="donker"' + (q.designStyle === "donker" ? " selected" : "") + '>Donkergroen premium</option></select></label>',
      "</div></section>",
      '<section class="panel compact-panel"><div class="panel-head"><div><p class="eyebrow">2. Inhoud</p><h2>Tekst en voordelen</h2></div></div><div class="field-grid">',
      '<label class="field full">Titel<input name="documentTitle" data-action="quote-preview-change" value="' + S.escapeHtml(q.documentTitle) + '"></label>',
      '<label class="field full">Introductie<textarea name="introText" data-action="quote-preview-change" rows="4">' + S.escapeHtml(q.introText) + '</textarea></label>',
      '<label class="field full">Wat is inbegrepen? <small>Eén punt per regel</small><textarea name="includedText" data-action="quote-preview-change" rows="6">' + S.escapeHtml(q.includedText) + '</textarea></label>',
      '<label class="field full">Belangrijkste voordelen <small>Eén punt per regel</small><textarea name="advantagesText" data-action="quote-preview-change" rows="5">' + S.escapeHtml(q.advantagesText) + '</textarea></label>',
      '<label class="field full">Productondertitel<input name="productSubtitle" value="' + S.escapeHtml(config.content.productSubtitle) + '"></label>',
      '<label class="field full">Installatietekst<textarea name="installationText" rows="3">' + S.escapeHtml(config.content.installationText) + '</textarea></label>',
      '<label class="field full">Nazorgtekst<textarea name="serviceText" rows="3">' + S.escapeHtml(config.content.serviceText) + '</textarea></label>',
      '</div></section>',
      '<section class="panel compact-panel"><div class="panel-head"><div><p class="eyebrow">3. Productblokken</p><h2>Oplossingen in deze offerte</h2></div><button class="small-button" type="button" data-action="quote-add-component">Productblok toevoegen</button></div><div class="quote-components" data-components>' + config.components.map(componentEditor).join("") + '</div></section>',
      '<section class="panel compact-panel"><div class="panel-head"><div><p class="eyebrow">4. Prijsopbouw</p><h2>Producten, diensten en kortingen</h2></div><button class="small-button" type="button" data-action="quote-add-line">Regel toevoegen</button></div>',
      '<div class="line-table"><div class="line-row line-header"><span>Product</span><span>Blok</span><span>Soort</span><span>Aantal</span><span>Eenheid</span><span>Prijs excl.</span><span>BTW</span><span>Regeling</span><span>Totaal</span><span></span></div><div data-lines="quote">' + (q.lines || []).map(lineRow).join("") + "</div></div>",
      '<div class="summary-box" data-summary="quote"></div>',
      "</section>",
      '<section class="panel compact-panel"><div class="panel-head"><div><p class="eyebrow">5. Regelingen</p><h2>Verwachte teruggaven</h2></div><button class="small-button" type="button" data-action="quote-add-benefit">Regeling toevoegen</button></div><div class="quote-benefits" data-benefits>' + q.benefits.map(benefitRow).join("") + '</div><div class="notice">Regelingen verlagen niet het te betalen bedrag. Ze worden apart opgeteld als indicatief voordeel na betaling.</div><div class="field-grid" style="margin-top:12px;">',
      '<label class="field">Besparing per maand<input name="monthlySaving" type="number" min="0" step="0.01" value="' + S.escapeHtml(config.financial.monthlySaving || 0) + '"></label>',
      '<label class="field">Besparing per jaar<input name="yearlySaving" type="number" min="0" step="0.01" value="' + S.escapeHtml(config.financial.yearlySaving || 0) + '"></label>',
      '<label class="field">Besparing over 10 jaar<input name="tenYearSaving" type="number" min="0" step="0.01" value="' + S.escapeHtml(config.financial.tenYearSaving || 0) + '"></label>',
      '<label class="field">Terugverdientijd (jaar)<input name="paybackYears" type="number" min="0" step="0.1" value="' + S.escapeHtml(config.financial.paybackYears || 0) + '"></label>',
      '</div></section>',
      '<section class="panel compact-panel"><div class="panel-head"><div><p class="eyebrow">6. Pagina’s</p><h2>Volgorde en zichtbaarheid</h2></div></div><div class="quote-page-manager" data-page-manager>' + pageManagerHtml(config) + '</div></section>',
      '<section class="panel compact-panel"><label class="field full">Voorwaarden<textarea name="notes" data-action="quote-preview-change" rows="6">' + S.escapeHtml(q.notes || "") + '</textarea></label></section>',
      '</div><aside class="quote-preview-wrap"><div class="quote-preview-label"><span>Live A4-voorbeeld</span><small>Exacte PDF-weergave</small></div><div class="quote-preview-tools"><div class="button-row"><button class="small-button" type="button" data-action="quote-zoom" data-delta="-0.08" aria-label="Voorbeeld verkleinen">−</button><button class="small-button" type="button" data-action="quote-zoom" data-delta="0.08" aria-label="Voorbeeld vergroten">+</button></div><select aria-label="Voorbeeldpagina kiezen" data-action="quote-page-jump">' + config.pages.filter(function (page) { return page.enabled; }).map(function (page) { var def = C.quoteDocument.PAGE_DEFS.find(function (item) { return item.id === page.id; }); return '<option value="' + page.id + '">' + S.escapeHtml(def.label) + '</option>'; }).join("") + '</select></div><div class="quote-preview-stage" data-quote-preview-stage role="region" aria-label="Scrollbaar offertevoorbeeld" tabindex="0"><div data-quote-preview>' + C.quoteDocument.render(q, customer, S.settings(), config) + '</div></div><div data-preview-warning></div></aside></div>',
      "</form>"
    ].join("");
  }

  function pageManagerHtml(config) {
    return config.pages.map(function (page, index) {
      var def = C.quoteDocument.PAGE_DEFS.find(function (item) { return item.id === page.id; });
      return '<div class="quote-page-row" data-page-row data-page-id="' + page.id + '"><span>' + (index + 1) + '</span><input type="checkbox" aria-label="Pagina tonen"' + (page.enabled ? " checked" : "") + '><strong>' + S.escapeHtml(def.label) + '</strong><button class="small-button" type="button" data-action="quote-page-move" data-direction="-1" aria-label="Omhoog">↑</button><button class="small-button" type="button" data-action="quote-page-move" data-direction="1" aria-label="Omlaag">↓</button></div>';
    }).join("");
  }

  function imagePickerHtml(config) {
    return '<div class="quote-image-picker">' + ["thuisbatterij", "warmtepomp", "cvketel", "airco"].map(function (key) {
      return '<button class="quote-image-choice' + (config.image.source === "library" && config.image.libraryKey === key ? " is-active" : "") + '" type="button" data-action="quote-library-image" data-image-key="' + key + '"><img src="' + C.quoteDocument.LIBRARY[key] + '" alt="' + key + '"></button>';
    }).join("") + "</div>";
  }

  function templateCards(selected) {
    return Object.keys(TEMPLATES).map(function (key) {
      var item = TEMPLATES[key];
      return '<button type="button" aria-pressed="' + (selected === key ? "true" : "false") + '" class="quote-template-card' + (selected === key ? " is-active" : "") + '" data-action="quote-template" data-template="' + key + '"><span aria-hidden="true">' + item.icon + '</span><strong>' + item.label + '</strong><small>Volledig aanpasbaar</small></button>';
    }).join("") + '<input type="hidden" name="templateType" value="' + S.escapeHtml(selected || "maatwerk") + '">';
  }

  function listItems(value) {
    return String(value || "").split(/\n+/).filter(Boolean).map(function (line) { return '<li>' + S.escapeHtml(line) + '</li>'; }).join("");
  }

  function previewHtml(data, totals) {
    totals = totals || S.calculateTotals(data.lines || []);
    var benefit = Math.max(0, Number(data.benefitAmount || 0));
    var dark = data.designStyle === "donker" ? " dark" : "";
    return '<article class="quote-preview' + dark + '"><header><div class="quote-preview-brand"><b>⌂</b><strong>CLIMATURE</strong></div><span>OFFERTE OP MAAT</span><h1>' + S.escapeHtml(data.documentTitle || "Uw energieoplossing op maat") + '</h1></header><div class="quote-preview-body"><p class="quote-preview-intro">' + S.escapeHtml(data.introText || "") + '</p><section><h3>Uw oplossing</h3><ul>' + listItems(data.includedText) + '</ul></section><section class="quote-preview-advantages"><h3>Waarom deze keuze?</h3><ul>' + listItems(data.advantagesText) + '</ul></section><section class="quote-preview-investment"><h3>Investeringsoverzicht</h3><div><span>Te betalen incl. btw</span><strong>' + S.money(totals.total) + '</strong></div>' + (data.benefitType && data.benefitType !== "geen" ? '<div class="benefit"><span>' + S.escapeHtml(data.benefitLabel || "Verwacht voordeel") + '</span><strong>− ' + S.money(benefit) + '</strong></div><div class="net"><span>Netto investering na verwacht voordeel</span><strong>' + S.money(Math.max(0, totals.total - benefit)) + '</strong></div>' : '') + '<small>Het genoemde voordeel is indicatief en afhankelijk van de geldende voorwaarden en goedkeuring.</small></section></div><footer>info@climature.nl · www.climature.nl</footer></article>';
  }

  function statusOptions(selected) {
    return ["concept", "verstuurd", "geaccepteerd", "geaccepteerd/aanbetaling", "afgewezen"].map(function (status) {
      return '<option value="' + status + '"' + (status === selected ? " selected" : "") + ">" + status + "</option>";
    }).join("");
  }

  function collectLines(form) {
    return Array.from(form.querySelectorAll(".quote-line")).map(function (row) {
      var line = {};
      row.querySelectorAll("[data-line]").forEach(function (field) {
        line[field.dataset.line] = field.type === "checkbox" ? field.checked : field.value;
      });
      return line;
    });
  }

  function collectBenefits(form, totals) {
    var eligibleVat = (totals && totals.lines || S.calculateTotals(collectLines(form)).lines).filter(function (line) { return line.vatRefundEligible; }).reduce(function (sum, line) { return sum + Number(line.vat || 0); }, 0);
    return Array.from(form.querySelectorAll("[data-benefit-row]")).map(function (row) {
      var benefit = { id: row.dataset.benefitId };
      row.querySelectorAll("[data-benefit]").forEach(function (field) { benefit[field.dataset.benefit] = field.type === "checkbox" ? field.checked : field.value; });
      benefit.amount = benefit.calculationMode === "eligible_vat" ? Math.max(0, eligibleVat) : Math.max(0, S.parseNumber(benefit.amount));
      var amount = row.querySelector('[data-benefit="amount"]');
      amount.value = benefit.amount.toFixed(2);
      amount.readOnly = benefit.calculationMode === "eligible_vat";
      return benefit;
    });
  }

  function collectComponents(form) {
    return Array.from(form.querySelectorAll("[data-component]")).map(function (card) {
      var fields = {};
      card.querySelectorAll("[data-component-field]").forEach(function (field) { fields[field.dataset.componentField] = field.value; });
      var key = fields.type || card.dataset.componentKey || "general";
      return { key: key, type: fields.type || key, title: fields.title || componentLabel(key), subtitle: fields.subtitle || "", includedText: fields.includedText || "", advantagesText: fields.advantagesText || "", image: { source: fields.imageSource || "library", libraryKey: fields.imageLibraryKey || key, assetId: fields.imageAssetId || "" } };
    });
  }

  function recalc(form) {
    var totals = S.calculateTotals(collectLines(form));
    form.querySelectorAll(".quote-line").forEach(function (row, index) {
      var total = totals.lines[index] ? totals.lines[index].total : 0;
      row.querySelector(".line-total").textContent = S.money(total);
    });
    var benefits = collectBenefits(form, totals);
    form.querySelector('[data-summary="quote"]').innerHTML = summaryHtml(totals, benefits);
    updatePreview(form, totals);
  }

  function syncLegacyContent(form, field) {
    if (!field || ["includedText", "advantagesText"].indexOf(field.name) < 0) return;
    var components = form.querySelectorAll("[data-component]");
    if (components.length !== 1) return;
    var target = components[0].querySelector('[data-component-field="' + field.name + '"]');
    if (target) target.value = field.value;
  }

  function collectConfig(form, draft) {
    var existing = draft && draft.documentConfig ? draft.documentConfig : {};
    var config = C.quoteDocument.normalizeConfig(Object.assign({}, draft || {}, { documentConfig: existing }));
    config.pages = Array.from(form.querySelectorAll("[data-page-row]")).map(function (row, index) {
      return { id: row.dataset.pageId, enabled: row.querySelector('input[type="checkbox"]').checked, order: index };
    });
    config.content.productSubtitle = form.elements.productSubtitle.value;
    config.content.installationText = form.elements.installationText.value;
    config.content.serviceText = form.elements.serviceText.value;
    config.financial.monthlySaving = S.parseNumber(form.elements.monthlySaving.value);
    config.financial.yearlySaving = S.parseNumber(form.elements.yearlySaving.value);
    config.financial.tenYearSaving = S.parseNumber(form.elements.tenYearSaving.value);
    config.financial.paybackYears = S.parseNumber(form.elements.paybackYears.value);
    config.components = collectComponents(form);
    config.image = config.components[0] ? config.components[0].image : config.image;
    config.version = 3;
    return config;
  }

  function formDraft(form) {
    var draft = Object.fromEntries(new FormData(form).entries());
    Object.keys(draft).forEach(function (key) { if (typeof File !== "undefined" && draft[key] instanceof File) delete draft[key]; });
    draft.lines = collectLines(form);
    draft.benefits = collectBenefits(form, S.calculateTotals(draft.lines));
    draft.id = form.dataset.id || "";
    draft.documentConfig = collectConfig(form, draft);
    return draft;
  }

  function draftKey(form) {
    if (form && form.dataset.draftStorageKey) return form.dataset.draftStorageKey;
    var user = S.user && S.user();
    var key = "climature-quote-draft:v1:" + (user && user.id || "anonymous") + ":" + (form.dataset.id || "new");
    if (form) form.dataset.draftStorageKey = key;
    return key;
  }

  function isDraftValid(stored, now) {
    if (!stored || stored.version !== 1 || !stored.updatedAt) return false;
    var updated = new Date(stored.updatedAt).getTime();
    return Number.isFinite(updated) && (now == null ? Date.now() : now) - updated <= DRAFT_TTL;
  }

  function readDraft(form) {
    try {
      var stored = JSON.parse(sessionStorage.getItem(draftKey(form)) || "null");
      if (!isDraftValid(stored)) { sessionStorage.removeItem(draftKey(form)); return null; }
      return stored;
    } catch (_error) { return null; }
  }

  function saveDraft(form) {
    if (!form || !document.documentElement.contains(form)) return;
    try {
      var payload = { version: 1, userId: S.user() && S.user().id, route: window.location.hash, updatedAt: new Date().toISOString(), quote: formDraft(form) };
      sessionStorage.setItem(draftKey(form), JSON.stringify(payload));
      var status = form.querySelector("[data-quote-draft-status]");
      if (status) status.textContent = "Concept tijdelijk bewaard om " + new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) + ".";
    } catch (_error) {
      var failed = form.querySelector("[data-quote-draft-status]");
      if (failed) failed.textContent = "Concept kon niet tijdelijk worden bewaard.";
    }
  }

  function scheduleDraft(form) {
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(function () { saveDraft(form); }, 350);
  }

  function clearDraft(form) {
    try { sessionStorage.removeItem(draftKey(form)); } catch (_error) {}
    if (C.app && C.app.state) delete C.app.state.quoteDraftOverride;
  }

  function enhanceSections(form) {
    Array.from(form.querySelectorAll(".quote-builder-controls > .panel")).forEach(function (panel, index) {
      var head = panel.querySelector(":scope > .panel-head");
      if (!head || head.querySelector('[data-action="quote-section-toggle"]')) return;
      var button = document.createElement("button");
      button.type = "button"; button.className = "small-button quote-section-toggle"; button.dataset.action = "quote-section-toggle"; button.setAttribute("aria-expanded", "true"); button.textContent = "Inklappen"; button.setAttribute("aria-label", "Sectie " + (index + 1) + " inklappen");
      head.appendChild(button);
    });
  }

  function initDraft(form) {
    if (!form) return;
    if (window.innerWidth <= 1080 && !form.classList.contains("quote-show-preview") && !form.classList.contains("quote-show-controls")) form.classList.add("quote-show-controls");
    enhanceSections(form);
    var saved = readDraft(form);
    if (!saved || C.app.state.quoteDraftOverride || form.querySelector(".quote-restore-banner")) return;
    var banner = document.createElement("div");
    banner.className = "notice warn quote-restore-banner";
    banner.innerHTML = '<span>Er staat een tijdelijk concept van ' + S.escapeHtml(new Date(saved.updatedAt).toLocaleString("nl-NL")) + ' klaar.</span><div class="button-row"><button class="small-button" type="button" data-action="quote-draft-restore">Herstellen</button><button class="small-button" type="button" data-action="quote-draft-discard">Verwijderen</button></div>';
    form.querySelector(".quote-builder-toolbar").insertAdjacentElement("afterend", banner);
  }

  function restoreDraft(form) {
    var saved = readDraft(form);
    if (!saved) return C.app.toast("Het tijdelijke concept is niet meer beschikbaar.");
    C.app.state.quoteDraftOverride = saved.quote;
    C.app.render();
    C.app.toast("Tijdelijk concept hersteld.");
  }

  function discardDraft(form) {
    clearDraft(form);
    var banner = form.querySelector(".quote-restore-banner");
    if (banner) banner.remove();
    C.app.toast("Tijdelijk concept verwijderd.");
  }

  function toggleSection(button) {
    var panel = button.closest(".panel");
    var collapsed = panel.classList.toggle("is-collapsed");
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    button.textContent = collapsed ? "Uitklappen" : "Inklappen";
  }

  function mobileView(form, view) {
    form.classList.toggle("quote-show-preview", view === "preview");
    form.classList.toggle("quote-show-controls", view !== "preview");
  }

  function updatePreview(form, totals) {
    if (!form) return;
    window.clearTimeout(form._previewTimer);
    form._previewTimer = window.setTimeout(function () {
      var target = form.querySelector("[data-quote-preview]");
      var stage = form.querySelector("[data-quote-preview-stage]");
      if (!target || !stage) return;
      var scrollTop = stage.scrollTop;
      var scrollLeft = stage.scrollLeft;
      var draft = formDraft(form);
      var customer = S.getAll("customers").find(function (item) { return item.id === draft.customerId; }) || {};
      target.innerHTML = C.quoteDocument.render(draft, customer, S.settings(), draft.documentConfig);
      stage.scrollTop = scrollTop;
      stage.scrollLeft = scrollLeft;
      var warnings = C.quoteDocument.contentWarnings(draft, draft.documentConfig).concat(C.quoteDocument.overflowWarnings(target));
      var regulationWarnings = C.quoteDocument.regulationWarnings(draft);
      var warning = form.querySelector("[data-preview-warning]");
      warning.innerHTML = warnings.concat(regulationWarnings).length ? '<div class="notice warn quote-overflow-warning">' + S.escapeHtml(warnings.concat(regulationWarnings).join(" ")) + '</div>' : "";
    }, 120);
  }

  function applyTemplate(form, key) {
    var template = TEMPLATES[key];
    if (!form || !template) return;
    form.querySelector('[name="templateType"]').value = key;
    form.querySelector('[name="documentTitle"]').value = template.title;
    form.querySelector('[name="introText"]').value = template.intro;
    form.querySelector('[name="includedText"]').value = template.included;
    form.querySelector('[name="advantagesText"]').value = template.advantages;
    var componentTypes = key === "combinatie" ? ["thuisbatterij", "warmtepomp"] : [key === "maatwerk" ? "general" : key];
    var seed = { templateType: key, includedText: template.included, advantagesText: template.advantages, lines: componentTypes.map(function (type) { return { componentKey: type }; }) };
    var nextConfig = C.quoteDocument.defaultConfig(seed);
    form.querySelector("[data-components]").innerHTML = nextConfig.components.map(componentEditor).join("");
    var existingLines = collectLines(form);
    if (existingLines.length === 1 && !S.parseNumber(existingLines[0].priceExVat) && (!existingLines[0].description || existingLines[0].description === "Levering en installatie")) {
      form.querySelector('[data-lines="quote"]').innerHTML = componentTypes.map(function (type) {
        return lineRow({ description: "Levering en installatie " + componentLabel(type).toLowerCase(), qty: 1, unit: "pakket", priceExVat: 0, vatRate: 21, componentKey: type, lineKind: "item", vatRefundEligible: type === "thuisbatterij" });
      }).join("");
    }
    var benefits = [];
    if (componentTypes.indexOf("thuisbatterij") >= 0) benefits.push({ id: "btw-" + Date.now(), type: "btw_refund", label: "Mogelijke btw-teruggave", amount: 0, componentKey: "thuisbatterij", calculationMode: "eligible_vat", reviewed: false });
    if (componentTypes.indexOf("warmtepomp") >= 0) benefits.push({ id: "isde-" + Date.now(), type: "isde", label: "Verwachte ISDE-subsidie", amount: 0, componentKey: "warmtepomp", calculationMode: "manual", reviewed: false });
    form.querySelector("[data-benefits]").innerHTML = benefits.map(benefitRow).join("");
    form.querySelectorAll(".quote-template-card").forEach(function (card) {
      card.classList.toggle("is-active", card.dataset.template === key);
    });
    recalc(form);
  }

  function changeBenefit(form, field) {
    var row = field && field.closest("[data-benefit-row]");
    if (row) {
      var type = row.querySelector('[data-benefit="type"]').value;
      var label = row.querySelector('[data-benefit="label"]');
      if (type === "btw_refund") { label.value = "Mogelijke btw-teruggave"; row.querySelector('[data-benefit="calculationMode"]').value = "eligible_vat"; }
      if (type === "isde" && !label.value) label.value = "Verwachte ISDE-subsidie";
    }
    recalc(form);
  }

  function addBenefit(form) {
    form.querySelector("[data-benefits]").insertAdjacentHTML("beforeend", benefitRow());
    recalc(form);
  }

  function removeBenefit(button) {
    var form = button.closest("form");
    button.closest("[data-benefit-row]").remove();
    recalc(form);
  }

  function addComponent(form) {
    var used = collectComponents(form).map(function (component) { return component.type; });
    var type = ["thuisbatterij", "warmtepomp", "cvketel", "airco", "general"].find(function (key) { return used.indexOf(key) < 0; }) || "general";
    var config = C.quoteDocument.defaultConfig({ templateType: type, lines: [{ componentKey: type }] });
    form.querySelector("[data-components]").insertAdjacentHTML("beforeend", componentEditor(config.components[0]));
    recalc(form);
  }

  function removeComponent(button) {
    var form = button.closest("form");
    if (form.querySelectorAll("[data-component]").length <= 1) { C.app.toast("Een offerte heeft minimaal één productblok nodig."); return; }
    button.closest("[data-component]").remove();
    recalc(form);
  }

  function chooseComponentImage(button) {
    var card = button.closest("[data-component]");
    card.querySelector('[data-component-field="imageSource"]').value = "library";
    card.querySelector('[data-component-field="imageLibraryKey"]').value = button.dataset.imageKey;
    card.querySelector('[data-component-field="imageAssetId"]').value = "";
    card.querySelectorAll(".quote-image-choice").forEach(function (choice) { choice.classList.toggle("is-active", choice === button); });
    updatePreview(button.closest("form"));
  }

  function uploadComponentImage(form, file, card) {
    if (!file || !card) return;
    var save = form.dataset.id ? Promise.resolve({ id: form.dataset.id }) : saveFromForm(form, { stay: true });
    return Promise.resolve(save).then(function (quote) {
      var body = new FormData();
      body.append("file", file);
      return S.request("/api/quotes/" + encodeURIComponent(quote.id) + "/assets", { method: "POST", body: body });
    }).then(function (payload) {
      card.querySelector('[data-component-field="imageSource"]').value = "upload";
      card.querySelector('[data-component-field="imageAssetId"]').value = payload.item.id;
      card.querySelectorAll(".quote-image-choice").forEach(function (choice) { choice.classList.remove("is-active"); });
      updatePreview(form);
      return saveFromForm(form, { stay: true });
    }).then(function () { C.app.toast("Afbeelding toegevoegd aan het productblok."); });
  }

  function summaryHtml(totals, benefits) {
    var benefitTotal = (benefits || []).reduce(function (sum, benefit) { return sum + Number(benefit.amount || 0); }, 0);
    return [
      "<div><span>Subtotaal excl. BTW</span><strong>" + S.money(totals.subtotal) + "</strong></div>",
      "<div><span>BTW</span><strong>" + S.money(totals.vat) + "</strong></div>",
      '<div class="total"><span>Te betalen incl. BTW</span><strong>' + S.money(totals.total) + "</strong></div>",
      benefitTotal > 0 ? '<div><span>Totaal verwacht voordeel</span><strong>− ' + S.money(benefitTotal) + '</strong></div><div class="total net"><span>Indicatieve netto-investering</span><strong>' + S.money(Math.max(0, totals.total - benefitTotal)) + '</strong></div>' : ""
    ].join("");
  }

  function saveFromForm(form, options) {
    options = options || {};
    var data = Object.fromEntries(new FormData(form).entries());
    var totals = S.calculateTotals(collectLines(form));
    if (!data.customerId) {
      C.app.toast("Kies eerst een klant.");
      return;
    }
    if (!totals.lines.length) {
      C.app.toast("Voeg minimaal een offerteregel toe.");
      return;
    }
    var numberPromise = !form.dataset.id && data.quoteNumber === S.peekNumber("quote")
      ? S.nextNumber("quote")
      : Promise.resolve(data.quoteNumber);
    return numberPromise.then(function (quoteNumber) {
      data.quoteNumber = quoteNumber;
      data.id = form.dataset.id || data.id;
      data.lines = totals.lines;
      data.benefits = collectBenefits(form, totals);
      data.documentConfig = collectConfig(form, data);
      data.subtotal = totals.subtotal;
      data.vat = totals.vat;
      data.total = totals.total;
      data.sourceAdviceId = form.dataset.sourceAdviceId || "";
      return S.upsert("quotes", data);
    }).then(function (saved) {
      if (form.dataset.salesOpportunityId && C.salesFunnel && C.salesFunnel.linkQuote) {
        return C.salesFunnel.linkQuote(form.dataset.salesOpportunityId, saved).then(function () { return saved; });
      }
      return saved;
    }).then(function (saved) {
      C.app.toast("Offerte opgeslagen.");
      form.dataset.id = saved.id;
      form.elements.quoteNumber.value = saved.quoteNumber;
      if (!options.stay) C.app.navigate("quote:" + saved.id);
      return saved;
    });
  }

  function movePage(button) {
    var row = button.closest("[data-page-row]");
    var manager = row && row.parentElement;
    var direction = Number(button.dataset.direction || 0);
    if (!row || !manager) return;
    var sibling = direction < 0 ? row.previousElementSibling : row.nextElementSibling;
    if (!sibling) return;
    if (direction < 0) manager.insertBefore(row, sibling); else manager.insertBefore(sibling, row);
    Array.from(manager.children).forEach(function (item, index) { item.firstElementChild.textContent = index + 1; });
    updatePreview(button.closest("form"));
  }

  function chooseLibraryImage(button) {
    var form = button.closest("form");
    form.elements.imageSource.value = "library";
    form.elements.imageLibraryKey.value = button.dataset.imageKey;
    form.elements.imageAssetId.value = "";
    form.querySelectorAll(".quote-image-choice").forEach(function (choice) { choice.classList.toggle("is-active", choice === button); });
    updatePreview(form);
  }

  function uploadImage(form, file) {
    if (!file) return;
    var save = form.dataset.id ? Promise.resolve({ id: form.dataset.id }) : saveFromForm(form, { stay: true });
    return Promise.resolve(save).then(function (quote) {
      var body = new FormData();
      body.append("file", file);
      return S.request("/api/quotes/" + encodeURIComponent(quote.id) + "/assets", { method: "POST", body: body });
    }).then(function (payload) {
      form.elements.imageSource.value = "upload";
      form.elements.imageAssetId.value = payload.item.id;
      form.querySelectorAll(".quote-image-choice").forEach(function (choice) { choice.classList.remove("is-active"); });
      updatePreview(form);
      return saveFromForm(form, { stay: true });
    }).then(function () { C.app.toast("Afbeelding toegevoegd aan de offerte."); });
  }

  function zoomPreview(form, delta) {
    var stage = form.querySelector("[data-quote-preview-stage]");
    var current = Number(stage.dataset.zoom || .48);
    var next = Math.max(.28, Math.min(.9, current + Number(delta || 0)));
    stage.dataset.zoom = next;
    stage.style.setProperty("--quote-zoom", next);
  }

  function jumpPage(form, id) {
    var page = form.querySelector('[data-quote-preview] [data-page-id="' + id + '"]');
    if (page) page.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function downloadDraft(form) {
    var draft = formDraft(form);
    var customer = S.getAll("customers").find(function (item) { return item.id === draft.customerId; }) || {};
    C.app.toast("PDF wordt opgebouwd…");
    return C.quoteDocument.downloadPdf(draft, customer, S.settings(), draft.documentConfig).then(function () { C.app.toast("PDF gedownload."); });
  }

  function renderDetail(id) {
    var quote = S.getAll("quotes").find(function (item) { return item.id === id; });
    if (!quote) return renderList("");
    var customer = S.getAll("customers").find(function (item) { return item.id === quote.customerId; });
    var invoice = S.getAll("invoices").find(function (item) { return item.quoteNumber === quote.quoteNumber; });
    var installation = C.installations && C.installations.findByQuote(quote.id, quote.quoteNumber);
    var rows = (quote.lines || []).map(function (line) {
      return "<tr><td>" + S.escapeHtml(line.description) + "</td><td>" + S.escapeHtml(line.qty + " " + line.unit) + "</td><td>" + S.money(line.priceExVat) + "</td><td>" + line.vatRate + "%</td><td>" + S.money(line.total) + "</td></tr>";
    }).join("");
    return [
      '<section class="grid two section">',
      '<div class="panel"><div class="panel-head"><div><p class="eyebrow">Offerte</p><h2>' + S.escapeHtml(quote.quoteNumber) + '</h2></div><span class="status-pill ' + statusClass(quote.status) + '">' + S.escapeHtml(quote.status) + '</span></div>',
      '<div class="detail-list">' + detail("Klant", S.customerName(customer)) + detail("Template", (TEMPLATES[quote.templateType] || TEMPLATES.maatwerk).label) + detail("Datum", S.formatDate(quote.quoteDate)) + detail("Geldig tot", S.formatDate(quote.validUntil)) + detail("Te betalen", S.money(quote.total || 0)) + quoteBenefits(quote).map(function (benefit) { return detail(benefit.label || "Verwacht voordeel", S.money(benefit.amount || 0)); }).join("") + (quoteBenefits(quote).length ? detail("Indicatieve netto-investering", S.money(Math.max(0, Number(quote.total || 0) - quoteBenefits(quote).reduce(function (sum, benefit) { return sum + Number(benefit.amount || 0); }, 0)))) : "") + "</div>",
      invoice ? '<div class="notice ' + (invoice.status === "concept" ? "ok" : "warn") + '" style="margin-top:14px;">Voor deze offerte bestaat ' + (invoice.status === "concept" ? "conceptfactuur " : "factuur ") + S.escapeHtml(invoice.invoiceNumber) + ".</div>" : "",
      installation ? '<div class="notice ok" style="margin-top:14px;">Installatie gepland op ' + S.escapeHtml(S.formatDate(installation.plannedDate)) + ".</div>" : "",
      statusFlow(quote),
      quoteActions(quote, invoice, installation),
      "</div>",
      '<div class="panel"><div class="panel-head"><div><p class="eyebrow">Specificatie</p><h2>Regels</h2></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Omschrijving</th><th>Aantal</th><th>Prijs excl.</th><th>BTW</th><th>Totaal</th></tr></thead><tbody>' + rows + "</tbody></table></div></div>",
      "</section>"
    ].join("");
  }

  function statusFlow(quote) {
    var statuses = [
      ["concept", "Concept"],
      ["verstuurd", "Verstuurd"],
      ["geaccepteerd", "Geaccepteerd"],
      ["geaccepteerd/aanbetaling", "Geaccepteerd/aanbetaling"],
      ["afgewezen", "Afgewezen"]
    ];
    return [
      '<div class="quote-status-flow">',
      '<span>Statusflow</span>',
      '<div class="button-row">',
      statuses.map(function (status) {
        var active = quote.status === status[0] ? " is-active" : "";
        return '<button class="small-button status-step' + active + '" data-action="quote-status" data-id="' + S.escapeHtml(quote.id) + '" data-status="' + status[0] + '">' + status[1] + "</button>";
      }).join(""),
      "</div>",
      "</div>"
    ].join("");
  }

  function quoteActions(quote, invoice, installation) {
    var accepted = isAcceptedStatus(quote.status);
    var canInvoice = S.hasRole("admin", "finance");
    return [
      '<div class="button-row" style="margin-top:16px;">',
      canInvoice && accepted && !invoice ? '<button class="primary-button" data-action="quote-to-invoice" data-id="' + S.escapeHtml(quote.id) + '">Maak factuur</button>' : "",
      canInvoice && accepted && invoice ? '<button class="ghost-button" data-action="invoice-detail" data-id="' + S.escapeHtml(invoice.id) + '">Open factuur</button>' : "",
      S.isAdmin() && accepted && !installation ? '<button class="primary-button" data-action="quote-to-installation" data-id="' + S.escapeHtml(quote.id) + '">Plan installatie</button>' : "",
      S.isAdmin() && accepted && installation ? '<button class="ghost-button" data-action="installation-detail" data-id="' + S.escapeHtml(installation.id) + '">Open installatie</button>' : "",
      !accepted ? '<button class="primary-button" data-action="quote-status" data-status="geaccepteerd" data-id="' + S.escapeHtml(quote.id) + '">Accepteer offerte</button>' : "",
      '<button class="ghost-button" data-action="quote-edit" data-id="' + S.escapeHtml(quote.id) + '">Bewerk</button>',
      '<button class="ghost-button" data-action="quote-pdf" data-id="' + S.escapeHtml(quote.id) + '">Download PDF</button>',
      '<button class="ghost-button" data-action="quote-print" data-id="' + S.escapeHtml(quote.id) + '">Print</button>',
      '<button class="danger-button" data-action="quote-delete" data-id="' + S.escapeHtml(quote.id) + '">Verwijder</button>',
      "</div>"
    ].join("");
  }

  function detail(label, value) {
    return "<div><span>" + S.escapeHtml(label) + "</span><strong>" + S.escapeHtml(value || "-") + "</strong></div>";
  }

  function fillProduct(select) {
    var product = S.getAll("products").find(function (item) { return item.id === select.value; });
    if (!product) return;
    var row = select.closest(".quote-line");
    row.querySelector('[data-line="description"]').value = product.brand + " " + product.name + " - " + product.specs;
    row.querySelector('[data-line="unit"]').value = "stuk";
    row.querySelector('[data-line="priceExVat"]').value = product.priceExVat;
    row.querySelector('[data-line="vatRate"]').value = product.vatRate;
    var category = String(product.category || "").toLowerCase();
    var componentKey = category.indexOf("batter") >= 0 ? "thuisbatterij" : category.indexOf("warmtepomp") >= 0 ? "warmtepomp" : category.indexOf("airco") >= 0 ? "airco" : category.indexOf("cv") >= 0 ? "cvketel" : "general";
    row.querySelector('[data-line="componentKey"]').value = componentKey;
    row.querySelector('[data-line="vatRefundEligible"]').checked = componentKey === "thuisbatterij";
  }

  function removeQuote(id) {
    return C.app.confirm({ title: "Offerte verwijderen", message: "De offerte wordt definitief verwijderd. Gekoppelde facturen blijven bestaan.", confirmLabel: "Offerte verwijderen" }).then(function (confirmed) { if (!confirmed) return; return S.remove("quotes", id); }).then(function (removed) {
      if (removed === undefined && S.getAll("quotes").some(function (quote) { return quote.id === id; })) return;
      C.app.toast("Offerte verwijderd.");
      C.app.navigate("quotes");
    });
  }

  function updateStatus(id, status) {
    var allowed = ["concept", "verstuurd", "geaccepteerd", "geaccepteerd/aanbetaling", "afgewezen"];
    var quote = S.getAll("quotes").find(function (item) { return item.id === id; });
    if (!quote || allowed.indexOf(status) < 0) return;
    var update = Object.assign({}, quote, {
      status: status,
      statusUpdatedAt: new Date().toISOString()
    });
    if (isAcceptedStatus(status) && !update.acceptedAt) update.acceptedAt = update.statusUpdatedAt;
    return S.upsert("quotes", update).then(function () {
      C.app.toast(isAcceptedStatus(status) ? "Offerte geaccepteerd. Maak een factuur of plan de installatie." : "Offertestatus bijgewerkt.");
      return C.app.render();
    });
  }

  function createFromAdvice(payload) {
    var totals = S.calculateTotals(payload.lines || []);
    return S.nextNumber("quote").then(function (quoteNumber) {
      return S.upsert("quotes", Object.assign(baseQuote({
        quoteNumber: quoteNumber,
        customerId: payload.customerId || "",
        status: "concept",
        lines: totals.lines,
        subtotal: totals.subtotal,
        vat: totals.vat,
        total: totals.total,
        templateType: payload.templateType || "maatwerk",
        benefits: payload.benefits || [],
        documentConfig: payload.documentConfig,
        notes: payload.notes || S.settings().defaultQuoteTerms,
        sourceAdviceId: payload.sourceAdviceId || S.uid("advice")
      }), { total: totals.total, subtotal: totals.subtotal, vat: totals.vat }));
    });
  }

  C.quotes = {
    renderList: renderList,
    renderForm: renderForm,
    renderDetail: renderDetail,
    saveFromForm: saveFromForm,
    recalc: recalc,
    syncLegacyContent: syncLegacyContent,
    lineRow: lineRow,
    fillProduct: fillProduct,
    applyTemplate: applyTemplate,
    updatePreview: updatePreview,
    changeBenefit: changeBenefit,
    addBenefit: addBenefit,
    removeBenefit: removeBenefit,
    addComponent: addComponent,
    removeComponent: removeComponent,
    chooseComponentImage: chooseComponentImage,
    uploadComponentImage: uploadComponentImage,
    movePage: movePage,
    chooseLibraryImage: chooseLibraryImage,
    uploadImage: uploadImage,
    zoomPreview: zoomPreview,
    jumpPage: jumpPage,
    downloadDraft: downloadDraft,
    scheduleDraft: scheduleDraft,
    clearDraft: clearDraft,
    isDraftValid: isDraftValid,
    initDraft: initDraft,
    restoreDraft: restoreDraft,
    discardDraft: discardDraft,
    toggleSection: toggleSection,
    mobileView: mobileView,
    remove: removeQuote,
    updateStatus: updateStatus,
    createFromAdvice: createFromAdvice
  };
}());
