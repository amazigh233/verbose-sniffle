(function () {
  "use strict";

  var store = window.Climature = window.Climature || {};
  var S = store.storage;

  var logoSvg = '<svg viewBox="0 0 110 110" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="110" height="110" rx="18" fill="#123C24"/><path d="M27 56 L27 90 L83 90 L83 56" stroke="#FAFBF7" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/><path d="M19 59 L55 30 L91 59" stroke="#FAFBF7" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/><path d="M61 40 C61 23 76 15 92 13 C88 28 77 38 61 40 Z" fill="#B6D72A"/><path d="M60 49 L42 73 L54 73 L48 92 L72 62 L59 62 L66 49 Z" fill="#B6D72A"/></svg>';

  function sanitizeFilePart(value, fallback) {
    return (value || fallback || "document")
      .toString()
      .trim()
      .replace(/[^\w\-.]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || fallback || "document";
  }

  function linesHtml(lines) {
    return (lines || []).filter(Boolean).map(function (line) {
      return "<div>" + S.escapeHtml(line) + "</div>";
    }).join("") || "-";
  }

  function companyLines(settings) {
    return [
      settings.companyName,
      settings.companyAddress,
      settings.companyCity,
      settings.companyPhone,
      settings.companyEmail,
      settings.companySite,
      settings.companyKvk ? "KvK: " + settings.companyKvk : "",
      settings.companyVat ? "BTW: " + settings.companyVat : "",
      settings.companyIban ? "IBAN: " + settings.companyIban : ""
    ];
  }

  function customerLines(customer) {
    return [
      S.customerName(customer),
      customer && customer.address,
      customer && [customer.postalCode, customer.city].filter(Boolean).join(" "),
      customer && customer.email,
      customer && customer.phone
    ];
  }

  function fieldLine(label, value) {
    return '<div class="workorder-line"><span>' + S.escapeHtml(label) + '</span><strong>' + S.escapeHtml(value || "") + '</strong></div>';
  }

  function checkbox(label, checked) {
    return '<span class="workorder-check' + (checked ? " is-checked" : "") + '"><i>' + (checked ? "✓" : "") + '</i>' + S.escapeHtml(label) + "</span>";
  }

  function workOrderHeader(settings) {
    return [
      '<header class="workorder-header">',
      '<div>',
      '<div class="print-brand">' + logoSvg + '<span>CLIMATURE</span></div>',
      '<h1>Installatie- en opleverformulier</h1>',
      '<p>Voor installatie, controle en klantakkoord</p>',
      "</div>",
      '<div class="workorder-company">' + linesHtml(companyLines(settings).slice(0, 6)) + "</div>",
      "</header>"
    ].join("");
  }

  function workOrderSection(title, body) {
    return '<section class="workorder-section"><h2>' + S.escapeHtml(title) + '</h2><div class="workorder-box">' + body + "</div></section>";
  }

  function workOrderNotes(installation) {
    var notes = installation && installation.notes;
    if (!notes) return '<div class="workorder-textarea small"></div>';
    return '<p class="workorder-agreement">' + S.escapeHtml(notes).replace(/\n/g, "<br>") + "</p>";
  }

  function workOrderValue(installation, key) {
    var workOrder = installation && installation.workOrder || {};
    return workOrder[key] || "";
  }

  function workOrderCheck(installation, key) {
    var checks = installation && installation.workOrder && installation.workOrder.checks || {};
    return Boolean(checks[key]);
  }

  function workOrderType(installation, value) {
    var types = installation && installation.workOrder && installation.workOrder.types || [];
    return Array.isArray(types) && types.indexOf(value) >= 0;
  }

  function buildWorkOrderHtml(customer, installation) {
    var settings = S.settings();
    var address = customer && [customer.address, customer.postalCode, customer.city].filter(Boolean).join(", ");
    var cityLine = customer && [customer.postalCode, customer.city].filter(Boolean).join(" ");
    var plannedDate = installation && installation.plannedDate ? installation.plannedDate : S.today();
    var duration = installation && installation.durationHours ? installation.durationHours + " uur" : "";
    return [
      '<div class="print-page workorder-page">',
      workOrderHeader(settings),
      workOrderSection("Klantgegevens", [
        fieldLine("Naam", S.customerName(customer)),
        fieldLine("Adres", customer && customer.address),
        fieldLine("Postcode en plaats", cityLine),
        fieldLine("Telefoon", customer && customer.phone),
        fieldLine("E-mail", customer && customer.email)
      ].join("")),
      workOrderSection("Werkgegevens", [
        '<div class="workorder-grid">',
        fieldLine("Geplande datum", S.formatDate(plannedDate)),
        fieldLine("Starttijd", installation && installation.startTime),
        fieldLine("Duur", duration),
        fieldLine("Monteur", installation && installation.installer),
        fieldLine("Offertenummer", installation && installation.quoteNumber),
        fieldLine("Status", installation && installation.status),
        "</div>",
        fieldLine("Installatieadres", address),
        '<div class="workorder-checks"><span>Type installatie</span>' +
          checkbox("Warmtepomp", workOrderType(installation, "Warmtepomp")) +
          checkbox("Thuisbatterij", workOrderType(installation, "Thuisbatterij")) +
          checkbox("Airconditioning", workOrderType(installation, "Airconditioning")) +
          checkbox("CV-ketel", workOrderType(installation, "CV-ketel")) +
          checkbox("Overig", workOrderType(installation, "Overig")) +
        "</div>"
      ].join("")),
      workOrderSection("Installatienotities", workOrderNotes(installation)),
      workOrderSection("Uitgevoerde werkzaamheden", '<div class="workorder-filled-text">' + S.escapeHtml(workOrderValue(installation, "workDone")).replace(/\n/g, "<br>") + "</div>"),
      workOrderSection("Oplevercontrole", '<div class="workorder-check-grid">' +
        checkbox("Installatie geplaatst en getest", workOrderCheck(installation, "installedTested")) +
        checkbox("Uitleg aan klant gegeven", workOrderCheck(installation, "customerInstruction")) +
        checkbox("Veiligheidscontrole uitgevoerd", workOrderCheck(installation, "safetyCheck")) +
        checkbox("Documentatie overhandigd", workOrderCheck(installation, "docsDelivered")) +
        checkbox("Systeem correct ingesteld", workOrderCheck(installation, "systemConfigured")) +
        checkbox("Werkplek schoon opgeleverd", workOrderCheck(installation, "workplaceClean")) +
      "</div>"),
      workOrderSection("Opmerkingen / meerwerk", '<div class="workorder-filled-text small">' + S.escapeHtml(workOrderValue(installation, "remarks")).replace(/\n/g, "<br>") + "</div>"),
      workOrderSection("Akkoord oplevering", '<p class="workorder-agreement">De ondergetekende verklaart dat de werkzaamheden door Climature naar tevredenheid zijn uitgevoerd en dat de installatie werkend is opgeleverd. De klant heeft uitleg ontvangen over bediening, onderhoud en veiligheidsaspecten. Eventuele opmerkingen of meerwerk zijn in dit document vastgelegd.</p>'),
      workOrderSection("Handtekeningen", [
        '<div class="workorder-signatures">',
        '<div><h3>Monteur (Climature)</h3>' + fieldLine("Handtekening", "") + fieldLine("Naam", workOrderValue(installation, "mechanicName") || installation && installation.installer) + fieldLine("Datum", S.formatDate(workOrderValue(installation, "mechanicDate"))) + "</div>",
        '<div><h3>Klant voor akkoord</h3>' + fieldLine("Handtekening", "") + fieldLine("Naam", workOrderValue(installation, "customerName") || S.customerName(customer)) + fieldLine("Datum", S.formatDate(workOrderValue(installation, "customerDate"))) + "</div>",
        "</div>",
        fieldLine("Plaats (optioneel)", customer && customer.city)
      ].join("")),
      '<footer class="workorder-footer">Climature Bedrijfsportaal</footer>',
      "</div>"
    ].join("");
  }

  function lineRows(lines) {
    return (lines || []).map(function (line) {
      return [
        "<tr>",
        "<td>" + S.escapeHtml(line.description || "-") + "</td>",
        '<td class="num">' + S.escapeHtml(line.qty) + "</td>",
        "<td>" + S.escapeHtml(line.unit || "-") + "</td>",
        '<td class="num">' + S.money(line.priceExVat) + "</td>",
        '<td class="num">' + S.escapeHtml(line.vatRate) + "%</td>",
        '<td class="num">' + S.money(line.total) + "</td>",
        "</tr>"
      ].join("");
    }).join("");
  }

  function bulletHtml(value) {
    var items = String(value || "").split(/\n+/).filter(Boolean);
    return items.length ? '<ul class="print-check-list">' + items.map(function (item) { return '<li>' + S.escapeHtml(item) + '</li>'; }).join("") + '</ul>' : "";
  }

  function buildHtml(type, doc) {
    var settings = S.settings();
    var customers = S.getAll("customers");
    var customer = customers.find(function (item) { return item.id === doc.customerId; }) || doc.customer || {};
    var number = type === "quote" ? doc.quoteNumber : doc.invoiceNumber;
    var title = type === "quote" ? "Offerte" : "Factuur";
    var date = type === "quote" ? doc.quoteDate : doc.invoiceDate;
    var secondary = type === "quote" ? "Geldig tot: " + S.formatDate(doc.validUntil) : "Vervaldatum: " + S.formatDate(doc.dueDate);
    var totals = S.calculateTotals(doc.lines);
    var note = type === "quote" ? (doc.notes || settings.defaultQuoteTerms) : (doc.notes || settings.defaultInvoiceNote);

    return [
      '<div class="print-page' + (type === "quote" && doc.designStyle === "donker" ? " quote-print-dark" : "") + '">',
      type === "quote" ? '<section class="quote-print-hero"><div class="print-brand">' + logoSvg + '<span>CLIMATURE</span></div><small>OFFERTE OP MAAT</small><h1>' + S.escapeHtml(doc.documentTitle || "Uw energieoplossing op maat") + '</h1></section>' : "",
      '<header class="print-header">',
      type === "quote" ? '<div><strong>' + S.escapeHtml(S.customerName(customer)) + '</strong><br>' + S.escapeHtml(customer.address || "") + '<br>' + S.escapeHtml([customer.postalCode, customer.city].filter(Boolean).join(" ")) + '</div>' : '<div class="print-brand">' + logoSvg + '<span>CLIMATURE</span></div>',
      '<div><strong>' + title + " " + S.escapeHtml(number) + '</strong><br>Datum: ' + S.escapeHtml(S.formatDate(date)) + '<br>' + S.escapeHtml(secondary) + (doc.quoteNumber && type === "invoice" ? "<br>Offerte: " + S.escapeHtml(doc.quoteNumber) : "") + "</div>",
      "</header>",
      type === "quote" && doc.introText ? '<section class="print-box quote-print-intro"><h2>Dank voor uw aanvraag</h2><p>' + S.escapeHtml(doc.introText).replace(/\n/g, "<br>") + '</p></section>' : "",
      '<section class="print-grid">',
      '<div class="print-box"><h2>Klant</h2>' + linesHtml(customerLines(customer)) + "</div>",
      '<div class="print-box"><h2>Climature</h2>' + linesHtml(companyLines(settings)) + "</div>",
      "</section>",
      type === "quote" && (doc.includedText || doc.advantagesText) ? '<section class="print-grid quote-print-content"><div class="print-box"><h2>Dit is inbegrepen</h2>' + bulletHtml(doc.includedText) + '</div><div class="print-box"><h2>Waarom deze keuze?</h2>' + bulletHtml(doc.advantagesText) + '</div></section>' : "",
      '<section class="print-box"><h2>Specificatie</h2><table class="print-table"><thead><tr><th>Omschrijving</th><th class="num">Aantal</th><th>Eenheid</th><th class="num">Prijs excl.</th><th class="num">BTW</th><th class="num">Totaal incl.</th></tr></thead><tbody>',
      lineRows(totals.lines),
      '<tr><td colspan="3"></td><td class="num"><strong>' + S.money(totals.subtotal) + '</strong></td><td class="num"><strong>' + S.money(totals.vat) + '</strong></td><td class="num"><strong>' + S.money(totals.total) + "</strong></td></tr>",
      "</tbody></table></section>",
      '<section class="print-grid">',
      '<div class="print-box"><h2>Investeringsoverzicht</h2>' + linesHtml(["Subtotaal: " + S.money(totals.subtotal), "BTW: " + S.money(totals.vat), "Totaal incl. BTW: " + S.money(totals.total), type === "quote" && doc.benefitType && doc.benefitType !== "geen" ? (doc.benefitLabel || "Verwacht voordeel") + ": - " + S.money(doc.benefitAmount || 0) : "", type === "quote" && doc.benefitType && doc.benefitType !== "geen" ? "Netto na verwacht voordeel: " + S.money(Math.max(0, totals.total - Number(doc.benefitAmount || 0))) : "", type === "invoice" && settings.companyIban ? "IBAN: " + settings.companyIban : ""]) + (type === "quote" && doc.benefitType && doc.benefitType !== "geen" ? '<p class="print-disclaimer">Indicatief; afhankelijk van actuele voorwaarden en goedkeuring.</p>' : "") + "</div>",
      '<div class="print-box"><h2>' + (type === "quote" ? "Voorwaarden" : "Betaling") + "</h2><p>" + S.escapeHtml(note).replace(/\n/g, "<br>") + "</p></div>",
      "</section>",
      "</div>"
    ].join("");
  }

  function print(type, doc) {
    document.getElementById("print-document").innerHTML = buildHtml(type, doc);
    window.setTimeout(function () { window.print(); }, 60);
  }

  function printWorkOrder(customer, installation) {
    if (!customer) return;
    document.getElementById("print-document").innerHTML = buildWorkOrderHtml(customer, installation);
    window.setTimeout(function () { window.print(); }, 60);
  }

  function adviceSuggestionHtml(title, items) {
    return '<div class="print-box"><h2>' + S.escapeHtml(title) + '</h2>' + ((items || []).length ? '<ul class="print-check-list">' + items.map(function (item) {
      return '<li><strong>' + S.escapeHtml(item.title) + '</strong><br>' + S.escapeHtml(item.reason) + '<br><small>' + S.escapeHtml(item.effect) + '</small></li>';
    }).join("") + '</ul>' : '<p>Geen acties in deze categorie.</p>') + '</div>';
  }

  function adviceTechnologyHtml(title, result) {
    if (!result) return "";
    var product = result.product && result.product.name || "Nog geen productselectie";
    var status = { "installatieklaar": "Installatieklaar", "technisch-kansrijk": "Technisch kansrijk · opname vereist", "eerst-aanpassen": "Eerst aanpassen", "onvoldoende-gegevens": "Onvoldoende gegevens", "niet-rendabel": "Geen rendabel advies" }[result.status];
    var sizeRange = title === "Warmtepomp" ? result.requiredKwRange : result.ranges && result.ranges.capacity;
    var size = sizeRange ? String(sizeRange.low).replace(".", ",") + "–" + String(sizeRange.high).replace(".", ",") + " " + sizeRange.unit : title === "Warmtepomp" ? String(result.requiredKw).replace(".", ",") + " kW" : result.recommendedKwh + " kWh";
    var savingRange = result.ranges && result.ranges.yearlySaving;
    var paybackRange = result.ranges && result.ranges.payback;
    return [
      '<div class="print-box">',
      '<h2>' + S.escapeHtml(title) + '</h2>',
      '<h3>' + S.escapeHtml(result.label) + '</h3>',
      '<p><strong>Status:</strong> ' + S.escapeHtml(status || (result.readiness + "/100")) + '<br>',
      '<strong>' + (title === "Warmtepomp" ? "Vermogen" : "Capaciteit") + ':</strong> ' + S.escapeHtml(size) + '<br>',
      '<strong>Product:</strong> ' + S.escapeHtml(product) + '<br>',
      '<strong>Investering netto:</strong> ' + S.money(result.netInvestment || result.investment || 0) + '<br>',
      result.subsidy ? '<strong>Indicatieve subsidie:</strong> ' + S.money(result.subsidy) + '<br>' : '',
      '<strong>Jaarlijks voordeel:</strong> ' + (savingRange ? S.money(savingRange.low) + "–" + S.money(savingRange.high) : S.money(result.yearlySaving || 0)) + '<br>',
      '<strong>Terugverdientijd:</strong> ' + (paybackRange && paybackRange.high ? S.escapeHtml(String(paybackRange.low).replace(".", ",") + "–" + String(paybackRange.high).replace(".", ",")) + ' jaar' : result.paybackYears ? S.escapeHtml(String(result.paybackYears).replace(".", ",")) + ' jaar' : '—') + '</p>',
      result.blockers && result.blockers.length ? '<p><strong>Aandachtspunten:</strong><br>' + result.blockers.map(S.escapeHtml).join('<br>') + '</p>' : '',
      '</div>'
    ].join("");
  }

  function adviceEnergyPrice(value) {
    return "€ " + Number(value || 0).toLocaleString("nl-NL", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }

  function adviceEnergyTableHtml(result) {
    var tariff = result.energyTariff || {};
    var history = tariff.priceHistory || result.assumptions && result.assumptions.priceHistory || [];
    if (!history.length) return "";
    var contractLabel = tariff.contractType === "dynamic" ? "dynamisch" : "vast/variabel";
    return [
      '<section class="print-box advice-price-print"><h2>Gekozen energietarieven</h2>',
      '<p><strong>' + S.escapeHtml(tariff.periodLabel || tariff.periodKey || "Actueel") + '</strong> · ' + S.escapeHtml(contractLabel) + '<br>Gas: ' + adviceEnergyPrice(tariff.gasPrice) + '/m³ · gebruikte stroomprijs: ' + adviceEnergyPrice(tariff.electricityPrice) + '/kWh</p>',
      '<table class="print-table"><thead><tr><th>Maand</th><th class="num">Gas / m³</th><th class="num">Stroom / kWh</th><th class="num">Dynamisch / kWh</th></tr></thead><tbody>',
      history.map(function (item) {
        var selected = String(item.periodKey) === String(tariff.periodKey);
        return '<tr class="' + (selected ? 'is-selected' : '') + '"><td>' + (selected ? '<strong>✓ ' : '') + S.escapeHtml(item.periodLabel || item.periodKey) + (selected ? '</strong>' : '') + '</td><td class="num">' + adviceEnergyPrice(item.gasPrice) + '</td><td class="num">' + adviceEnergyPrice(item.electricityPrice) + '</td><td class="num">' + adviceEnergyPrice(item.dynamicElectricityPrice) + '</td></tr>';
      }).join(''),
      '</tbody></table><p class="print-disclaimer">Bron: CBS, Gemiddelde energietarieven voor consumenten' + (tariff.refreshedAt ? ' · opgehaald ' + S.escapeHtml(S.formatDate(String(tariff.refreshedAt).slice(0, 10))) : '') + '. Inclusief btw en belastingen, exclusief vaste leverings- en netbeheerkosten. Bron en tarieven zijn vastgelegd bij het berekenen van dit advies.</p></section>'
    ].join("");
  }

  function buildAdviceV2Html(result, customer) {
    var settings = S.settings();
    var address = result.input && [result.input.address, result.input.city].filter(Boolean).join(", ");
    if (Number(result.version || 0) >= 3) {
      var moduleLabel = { warmtepomp: "Warmtepompadvies", batterij: "Thuisbatterijadvies", combinatie: "Combinatieadvies" }[result.module] || "Woningadvies";
      var checks = result.requiredChecks || [];
      var actions = result.actions || [];
      var sources = result.assumptions && result.assumptions.sources || {};
      var sourceText = Object.keys(sources).map(function (key) { var source = sources[key] || {}; return [source.label, source.period].filter(Boolean).join(" · "); }).filter(Boolean).join(" · ");
      return [
        '<div class="print-page advice-v2-print">',
        '<header class="print-header"><div class="print-brand">' + logoSvg + '<span>CLIMATURE</span></div><div><strong>' + S.escapeHtml(moduleLabel) + '</strong><br>Datum: ' + S.formatDate(S.today()) + '<br>Zekerheid: ' + S.escapeHtml(result.inputQuality.label) + '<br>Rekenversie: ' + S.escapeHtml(result.engineVersion) + '</div></header>',
        '<section class="print-box"><p><strong>ONS ADVIES</strong></p><h1>' + S.escapeHtml(result.recommendation.title) + '</h1><p>' + S.escapeHtml(result.recommendation.rationale) + '</p><p>' + S.escapeHtml(S.customerName(customer) || "Losse woningscan") + (address ? '<br>' + S.escapeHtml(address) : '') + '</p></section>',
        adviceEnergyTableHtml(result),
        checks.length ? '<section class="print-box"><h2>Vóór definitieve offerte controleren</h2><ol>' + checks.map(function (check) { return '<li>' + S.escapeHtml(check) + '</li>'; }).join('') + '</ol></section>' : '',
        '<section class="print-grid">' + adviceTechnologyHtml("Warmtepomp", result.warmtepomp) + adviceTechnologyHtml("Thuisbatterij", result.batterij) + '</section>',
        result.alternative ? '<section class="print-box"><h2>Passend alternatief</h2><h3>' + S.escapeHtml(result.alternative.title) + '</h3><p>' + S.escapeHtml(result.alternative.difference || "Alternatief scenario ter vergelijking.") + '</p></section>' : '',
        '<section class="print-box"><h2>Actieplan</h2><ol>' + actions.map(function (item) { return '<li><strong>' + S.escapeHtml(item.title) + '</strong> · ' + S.escapeHtml(item.owner) + '<br><small>' + S.escapeHtml(item.reason) + '</small></li>'; }).join('') + '</ol></section>',
        '<section class="print-box"><h2>Aannames, bronnen en voorbehoud</h2><p>Gas: ' + S.money(result.assumptions.gasPrice) + '/m³ · stroom: ' + S.money(result.assumptions.electricityPrice) + '/kWh · teruglevering: ' + S.money(result.assumptions.feedInCost) + '/kWh · EPEX-marge: ' + S.money(result.assumptions.epexMargin) + '/kWh.</p><p>' + S.escapeHtml(sourceText || "Centrale portaalinstellingen") + '</p><p>Bedragen, opbrengsten en dimensionering zijn indicatief. De definitieve offerte volgt na technische opname en controle van actuele voorwaarden.</p><p>' + S.escapeHtml(settings.companyName) + ' · ' + S.escapeHtml(settings.companyPhone) + ' · ' + S.escapeHtml(settings.companyEmail) + '</p></section>',
        '<footer class="workorder-footer">Climature · Advies Tool 2.0 · rekenversie ' + S.escapeHtml(result.engineVersion) + '</footer>',
        '</div>'
      ].join("");
    }
    return [
      '<div class="print-page advice-v2-print">',
      '<header class="print-header"><div class="print-brand">' + logoSvg + '<span>CLIMATURE</span></div><div><strong>Advies Tool 2.0</strong><br>Datum: ' + S.formatDate(S.today()) + '<br>Betrouwbaarheid: ' + S.escapeHtml(result.confidence.label) + ' (' + result.confidence.score + '/100)</div></header>',
      '<section class="print-box"><h1>Gecombineerd woningadvies</h1><p>' + S.escapeHtml(S.customerName(customer) || "Losse woningscan") + (address ? '<br>' + S.escapeHtml(address) : '') + '</p><p>Dit rapport combineert een warmtepomp- en thuisbatterijscan met een concreet prioriteitenplan.</p></section>',
      '<section class="print-grid">' + adviceTechnologyHtml("Warmtepomp", result.warmtepomp) + adviceTechnologyHtml("Thuisbatterij", result.batterij) + '</section>',
      '<h2>Prioriteitenplan</h2><section class="print-grid">' + adviceSuggestionHtml("Nu doen", result.suggestions.now) + adviceSuggestionHtml("Eerst verbeteren", result.suggestions.first) + '</section>',
      adviceSuggestionHtml("Later overwegen", result.suggestions.later),
      '<section class="print-box"><h2>Aannames en voorbehoud</h2><p>Gas: ' + S.money(result.assumptions.gasPrice) + '/m³ · stroom: ' + S.money(result.assumptions.electricityPrice) + '/kWh · teruglevering: ' + S.money(result.assumptions.feedInCost) + '/kWh · EPEX-marge: ' + S.money(result.assumptions.epexMargin) + '/kWh.</p><p>Alle bedragen en besparingen zijn indicatief. Definitieve dimensionering, subsidie en opbrengst volgen na technische opname en controle van actuele voorwaarden.</p><p>' + S.escapeHtml(settings.companyName) + ' · ' + S.escapeHtml(settings.companyPhone) + ' · ' + S.escapeHtml(settings.companyEmail) + '</p></section>',
      '<footer class="workorder-footer">Climature · Advies Tool 2.0</footer>',
      '</div>'
    ].join("");
  }

  function printAdviceV2(result, customer) {
    if (!result) return;
    document.getElementById("print-document").innerHTML = buildAdviceV2Html(result, customer || {});
    window.setTimeout(function () { window.print(); }, 60);
  }

  function drawPdf(type, doc) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      print(type, doc);
      return;
    }

    var settings = S.settings();
    var customer = S.getAll("customers").find(function (item) { return item.id === doc.customerId; }) || doc.customer || {};
    var totals = S.calculateTotals(doc.lines);
    var title = type === "quote" ? "Offerte" : "Factuur";
    var number = type === "quote" ? doc.quoteNumber : doc.invoiceNumber;
    var pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    var margin = 14;
    var y = 18;

    function text(value, x, yy, options) {
      pdf.text(String(value || "-"), x, yy, options || {});
    }

    function wrapped(value, x, yy, width, lineHeight) {
      var lines = pdf.splitTextToSize(String(value || "-"), width);
      pdf.text(lines, x, yy);
      return yy + lines.length * (lineHeight || 5);
    }

    function addPage(extra) {
      if (y + extra <= 282) return;
      pdf.addPage();
      y = 18;
    }

    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(18, 60, 36);
    pdf.setFontSize(18);
    text("CLIMATURE", margin, y);
    pdf.setFontSize(24);
    text(title, margin, y + 17);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(16, 32, 23);
    text(title + "nummer: " + (number || "-"), 128, y);
    text("Datum: " + S.formatDate(type === "quote" ? doc.quoteDate : doc.invoiceDate), 128, y + 6);
    text(type === "quote" ? "Geldig tot: " + S.formatDate(doc.validUntil) : "Vervaldatum: " + S.formatDate(doc.dueDate), 128, y + 12);
    if (type === "invoice" && doc.quoteNumber) text("Offerte: " + doc.quoteNumber, 128, y + 18);
    y += 34;

    pdf.setFillColor(246, 250, 244);
    pdf.roundedRect(margin, y, 182, 38, 2, 2, "F");
    pdf.setFont("helvetica", "bold");
    text("Klant", margin + 4, y + 7);
    text("Climature", 106, y + 7);
    pdf.setFont("helvetica", "normal");
    customerLines(customer).slice(0, 5).forEach(function (line, index) { if (line) text(line, margin + 4, y + 14 + index * 5); });
    companyLines(settings).slice(0, 5).forEach(function (line, index) { if (line) text(line, 106, y + 14 + index * 5); });
    y += 52;

    if (type === "quote" && (doc.documentTitle || doc.introText)) {
      addPage(32);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(18, 60, 36);
      pdf.setFontSize(16);
      y = wrapped(doc.documentTitle || "Uw energieoplossing op maat", margin, y, 182, 6) + 2;
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(16, 32, 23);
      pdf.setFontSize(9);
      y = wrapped(doc.introText || "", margin, y, 182, 4.5) + 7;
    }

    if (type === "quote" && (doc.includedText || doc.advantagesText)) {
      [{ title: "Dit is inbegrepen", value: doc.includedText }, { title: "Waarom deze keuze?", value: doc.advantagesText }].forEach(function (block) {
        if (!block.value) return;
        addPage(18);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(18, 60, 36);
        pdf.setFontSize(11);
        text(block.title, margin, y);
        y += 6;
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(16, 32, 23);
        pdf.setFontSize(9);
        String(block.value).split(/\n+/).filter(Boolean).forEach(function (item) {
          addPage(8);
          y = wrapped("✓  " + item, margin + 2, y, 178, 4.3) + 1;
        });
        y += 4;
      });
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    text("Omschrijving", margin, y);
    text("Aantal", 92, y, { align: "right" });
    text("Prijs excl.", 128, y, { align: "right" });
    text("BTW", 150, y, { align: "right" });
    text("Totaal", 196, y, { align: "right" });
    y += 5;
    pdf.setDrawColor(221, 232, 220);
    pdf.line(margin, y, 196, y);
    y += 6;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);

    totals.lines.forEach(function (line) {
      addPage(14);
      var descLines = pdf.splitTextToSize(line.description || "-", 72);
      pdf.text(descLines, margin, y);
      text(String(line.qty) + " " + (line.unit || ""), 92, y, { align: "right" });
      text(S.money(line.priceExVat), 128, y, { align: "right" });
      text(line.vatRate + "%", 150, y, { align: "right" });
      text(S.money(line.total), 196, y, { align: "right" });
      y += Math.max(7, descLines.length * 4);
    });

    y += 4;
    pdf.line(112, y, 196, y);
    y += 7;
    pdf.setFont("helvetica", "bold");
    text("Subtotaal excl. BTW", 142, y, { align: "right" });
    text(S.money(totals.subtotal), 196, y, { align: "right" });
    y += 6;
    text("BTW", 142, y, { align: "right" });
    text(S.money(totals.vat), 196, y, { align: "right" });
    y += 7;
    pdf.setFontSize(12);
    text("Totaal incl. BTW", 142, y, { align: "right" });
    text(S.money(totals.total), 196, y, { align: "right" });
    y += 14;

    if (type === "quote" && doc.benefitType && doc.benefitType !== "geen") {
      addPage(24);
      pdf.setFillColor(242, 247, 231);
      pdf.roundedRect(margin, y - 5, 182, 21, 2, 2, "F");
      pdf.setFontSize(10);
      pdf.setTextColor(31, 107, 58);
      text(doc.benefitLabel || "Verwacht voordeel", margin + 4, y + 2);
      text("- " + S.money(doc.benefitAmount || 0), 192, y + 2, { align: "right" });
      pdf.setFont("helvetica", "bold");
      text("Netto investering", margin + 4, y + 10);
      text(S.money(Math.max(0, totals.total - Number(doc.benefitAmount || 0))), 192, y + 10, { align: "right" });
      y += 25;
      pdf.setTextColor(16, 32, 23);
    }

    addPage(42);
    pdf.setFontSize(13);
    text(type === "quote" ? "Voorwaarden" : "Betaling", margin, y);
    y += 7;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    wrapped(type === "quote" ? (doc.notes || settings.defaultQuoteTerms) : (doc.paymentInstructions || doc.notes || settings.defaultInvoiceNote), margin, y, 182, 5);

    pdf.setDrawColor(221, 232, 220);
    pdf.line(margin, 288, 196, 288);
    pdf.setFontSize(8);
    pdf.setTextColor(95, 111, 99);
    text("Climature Bedrijfsportaal", margin, 293);
    text("Pagina " + pdf.getNumberOfPages(), 196, 293, { align: "right" });
    pdf.save("Climature-" + (type === "quote" ? "offerte" : "factuur") + "-" + sanitizeFilePart(number, "zonder-nummer") + "-" + sanitizeFilePart(S.customerName(customer), "klant") + ".pdf");
  }

  store.pdf = {
    printQuote: function (quote) {
      var customer = S.getAll("customers").find(function (item) { return item.id === quote.customerId; }) || {};
      return store.quoteDocument.print(quote, customer, S.settings(), store.quoteDocument.normalizeConfig(quote));
    },
    printInvoice: function (invoice) { print("invoice", invoice); },
    printWorkOrder: printWorkOrder,
    printAdviceV2: printAdviceV2,
    downloadQuote: function (quote) {
      var customer = S.getAll("customers").find(function (item) { return item.id === quote.customerId; }) || {};
      return store.quoteDocument.downloadPdf(quote, customer, S.settings(), store.quoteDocument.normalizeConfig(quote));
    },
    downloadInvoice: function (invoice) { drawPdf("invoice", invoice); }
  };
}());
