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

  function checkbox(label) {
    return '<span class="workorder-check"><i></i>' + S.escapeHtml(label) + "</span>";
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
          checkbox("Warmtepomp") +
          checkbox("Thuisbatterij") +
          checkbox("Airconditioning") +
          checkbox("CV-ketel") +
          checkbox("Overig") +
        "</div>"
      ].join("")),
      workOrderSection("Installatienotities", workOrderNotes(installation)),
      workOrderSection("Uitgevoerde werkzaamheden", '<div class="workorder-textarea"></div>'),
      workOrderSection("Oplevercontrole", '<div class="workorder-check-grid">' +
        checkbox("Installatie geplaatst en getest") +
        checkbox("Uitleg aan klant gegeven") +
        checkbox("Veiligheidscontrole uitgevoerd") +
        checkbox("Documentatie overhandigd") +
        checkbox("Systeem correct ingesteld") +
        checkbox("Werkplek schoon opgeleverd") +
      "</div>"),
      workOrderSection("Opmerkingen / meerwerk", '<div class="workorder-textarea small"></div>'),
      workOrderSection("Akkoord oplevering", '<p class="workorder-agreement">De ondergetekende verklaart dat de werkzaamheden door Climature naar tevredenheid zijn uitgevoerd en dat de installatie werkend is opgeleverd. De klant heeft uitleg ontvangen over bediening, onderhoud en veiligheidsaspecten. Eventuele opmerkingen of meerwerk zijn in dit document vastgelegd.</p>'),
      workOrderSection("Handtekeningen", [
        '<div class="workorder-signatures">',
        '<div><h3>Monteur (Climature)</h3>' + fieldLine("Handtekening", "") + fieldLine("Naam", installation && installation.installer) + fieldLine("Datum", "") + "</div>",
        '<div><h3>Klant voor akkoord</h3>' + fieldLine("Handtekening", "") + fieldLine("Naam", S.customerName(customer)) + fieldLine("Datum", "") + "</div>",
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
      '<div class="print-page">',
      '<header class="print-header">',
      '<div class="print-brand">' + logoSvg + '<span>CLIMATURE</span></div>',
      '<div><strong>' + title + " " + S.escapeHtml(number) + '</strong><br>Datum: ' + S.escapeHtml(S.formatDate(date)) + '<br>' + S.escapeHtml(secondary) + (doc.quoteNumber && type === "invoice" ? "<br>Offerte: " + S.escapeHtml(doc.quoteNumber) : "") + "</div>",
      "</header>",
      '<section class="print-grid">',
      '<div class="print-box"><h2>Klant</h2>' + linesHtml(customerLines(customer)) + "</div>",
      '<div class="print-box"><h2>Climature</h2>' + linesHtml(companyLines(settings)) + "</div>",
      "</section>",
      '<section class="print-box"><h2>Specificatie</h2><table class="print-table"><thead><tr><th>Omschrijving</th><th class="num">Aantal</th><th>Eenheid</th><th class="num">Prijs excl.</th><th class="num">BTW</th><th class="num">Totaal incl.</th></tr></thead><tbody>',
      lineRows(totals.lines),
      '<tr><td colspan="3"></td><td class="num"><strong>' + S.money(totals.subtotal) + '</strong></td><td class="num"><strong>' + S.money(totals.vat) + '</strong></td><td class="num"><strong>' + S.money(totals.total) + "</strong></td></tr>",
      "</tbody></table></section>",
      '<section class="print-grid">',
      '<div class="print-box"><h2>Totalen</h2>' + linesHtml(["Subtotaal: " + S.money(totals.subtotal), "BTW: " + S.money(totals.vat), "Totaal incl. BTW: " + S.money(totals.total), type === "invoice" && settings.companyIban ? "IBAN: " + settings.companyIban : ""]) + "</div>",
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
    printQuote: function (quote) { print("quote", quote); },
    printInvoice: function (invoice) { print("invoice", invoice); },
    printWorkOrder: printWorkOrder,
    downloadQuote: function (quote) { drawPdf("quote", quote); },
    downloadInvoice: function (invoice) { drawPdf("invoice", invoice); }
  };
}());
