(function () {
  "use strict";

  var C = window.Climature = window.Climature || {};
  var S = C.storage;

  function baseInvoice(seed) {
    var settings = S.settings();
    return Object.assign({
      invoiceNumber: S.peekNumber("invoice"),
      quoteNumber: "",
      customerId: seed && seed.customerId || "",
      invoiceDate: S.today(),
      dueDate: S.addDays(S.today(), settings.paymentDays),
      status: "concept",
      lines: [{ description: "Werkzaamheden conform afspraak", qty: 1, unit: "post", priceExVat: 0, vatRate: 21 }],
      paymentInstructions: settings.companyIban ? "Gelieve te betalen op " + settings.companyIban + " onder vermelding van het factuurnummer." : settings.defaultInvoiceNote,
      notes: settings.defaultInvoiceNote
    }, seed || {});
  }

  function statusClass(status) {
    if (status === "betaald") return "ok";
    if (status === "verlopen") return "danger";
    if (status === "verzonden") return "warn";
    return "";
  }

  function renderList(query) {
    var customers = S.getAll("customers");
    var q = (query || "").toLowerCase();
    var invoices = S.getAll("invoices").filter(function (invoice) {
      var customer = invoice.customer || customers.find(function (item) { return item.id === invoice.customerId; });
      return !q || [invoice.invoiceNumber, invoice.quoteNumber, S.customerName(customer), invoice.status].join(" ").toLowerCase().indexOf(q) >= 0;
    });
    var rows = invoices.map(function (invoice) {
      var customer = invoice.customer || customers.find(function (item) { return item.id === invoice.customerId; });
      return [
        "<tr>",
        "<td><strong>" + S.escapeHtml(invoice.invoiceNumber) + "</strong><br><span class=\"muted\">" + S.formatDate(invoice.invoiceDate) + "</span></td>",
        "<td>" + S.escapeHtml(S.customerName(customer)) + (invoice.quoteNumber ? '<br><span class="muted">' + S.escapeHtml(invoice.quoteNumber) + "</span>" : "") + "</td>",
        '<td><span class="status-pill ' + statusClass(invoice.status) + '">' + S.escapeHtml(invoice.status) + "</span></td>",
        "<td>" + S.money(invoice.total || 0) + "</td>",
        "<td>" + listActions(invoice) + "</td>",
        "</tr>"
      ].join("");
    }).join("");
    return [
      '<section class="section panel">',
      '<div class="panel-head"><div><p class="eyebrow">Facturen</p><h2>Facturen beheren</h2></div></div>',
      '<input class="search-input" type="search" placeholder="Zoeken op klantnaam, factuurnummer, offertenummer of status" value="' + S.escapeHtml(query || "") + '" data-action="invoice-search">',
      query ? '<div class="active-filters"><span>Zoekfilter: <strong>' + S.escapeHtml(query) + '</strong></span><a href="#invoices">Filter wissen</a></div>' : "",
      invoices.length ? '<div class="table-wrap" style="margin-top:14px;"><table class="data-table"><caption class="visually-hidden">Facturen</caption><thead><tr><th>Factuur</th><th>Klant / offerte</th><th>Status</th><th>Totaal</th><th>Acties</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty-state" style="margin-top:14px;">Geen facturen gevonden.</div>',
      S.paginationControls("invoices"),
      "</section>"
    ].join("");
  }

  function listActions(invoice) {
    return [
      '<div class="button-row">',
      '<button class="small-button" data-action="invoice-detail" data-id="' + S.escapeHtml(invoice.id) + '">Open</button>',
      '<button class="small-button" data-action="invoice-edit" data-id="' + S.escapeHtml(invoice.id) + '">Bewerk</button>',
      invoice.status === "concept" ? '<button class="small-button" data-action="invoice-status" data-status="verzonden" data-id="' + S.escapeHtml(invoice.id) + '">Markeer verzonden</button>' : "",
      (invoice.status === "verzonden" || invoice.status === "verlopen") ? '<button class="small-button" data-action="payment-from-invoice" data-id="' + S.escapeHtml(invoice.id) + '">Registreer betaling</button>' : "",
      "</div>"
    ].join("");
  }

  function customerOptions(selectedId) {
    return '<option value="">Kies klant</option>' + S.getAll("customers").map(function (customer) {
      return '<option value="' + customer.id + '"' + (customer.id === selectedId ? " selected" : "") + ">" + S.escapeHtml(S.customerName(customer)) + "</option>";
    }).join("");
  }

  function quoteOptions(selectedNumber) {
    return '<option value="">Geen offerte</option>' + S.getAll("quotes").map(function (quote) {
      return '<option value="' + quote.quoteNumber + '"' + (quote.quoteNumber === selectedNumber ? " selected" : "") + ">" + S.escapeHtml(quote.quoteNumber) + "</option>";
    }).join("");
  }

  function lineRow(line) {
    var l = Object.assign({ description: "", qty: 1, unit: "stuk", priceExVat: 0, vatRate: 21, productId: "" }, line || {});
    return [
      '<div class="line-row invoice-line">',
      '<input data-line="description" type="text" value="' + S.escapeHtml(l.description) + '" placeholder="Omschrijving">',
      '<input data-line="qty" type="number" min="0" step="0.01" value="' + S.escapeHtml(l.qty) + '">',
      '<input data-line="unit" type="text" value="' + S.escapeHtml(l.unit) + '">',
      '<input data-line="priceExVat" type="number" step="0.01" value="' + S.escapeHtml(l.priceExVat) + '">',
      '<select data-line="vatRate"><option value="21"' + (Number(l.vatRate) === 21 ? " selected" : "") + '>21%</option><option value="9"' + (Number(l.vatRate) === 9 ? " selected" : "") + '>9%</option><option value="0"' + (Number(l.vatRate) === 0 ? " selected" : "") + ">0%</option></select>",
      '<strong class="line-total">-</strong>',
      '<button class="small-button" type="button" data-action="invoice-remove-line">x</button>',
      "</div>"
    ].join("");
  }

  function renderForm(invoice) {
    var inv = baseInvoice(invoice || {});
    return [
      '<form class="grid" data-form="invoice" data-id="' + S.escapeHtml(inv.id || "") + '">',
      '<section class="panel">',
      '<div class="panel-head"><div><p class="eyebrow">Factuur</p><h2>' + (inv.id ? "Factuur bewerken" : "Nieuwe factuur") + '</h2></div><div class="button-row"><button class="ghost-button" type="button" data-action="invoices">Annuleren</button><button class="primary-button" type="submit">Opslaan</button></div></div>',
      '<div class="field-grid">',
      '<label class="field">Offerte<select name="quoteNumber" data-action="invoice-load-quote">' + quoteOptions(inv.quoteNumber) + '</select></label>',
      '<label class="field">Klant zoeken<input type="search" data-action="form-customer-search" autocomplete="off" placeholder="Naam, bedrijf of plaats"></label>',
      '<label class="field">Klant<select name="customerId" required>' + customerOptions(inv.customerId) + '</select></label>',
      '<label class="field">Factuurnummer<input name="invoiceNumber" required value="' + S.escapeHtml(inv.invoiceNumber) + '"></label>',
      '<label class="field">Factuurdatum<input name="invoiceDate" type="date" required value="' + S.escapeHtml(inv.invoiceDate) + '"></label>',
      '<label class="field">Vervaldatum<input name="dueDate" type="date" required value="' + S.escapeHtml(inv.dueDate) + '"></label>',
      '<label class="field">Betaalstatus<select name="status">' + statusOptions(inv.status) + '</select></label>',
      '<label class="field full">Betaalinstructies<textarea name="paymentInstructions" rows="3">' + S.escapeHtml(inv.paymentInstructions || "") + '</textarea></label>',
      '<label class="field full">Notities<textarea name="notes" rows="4">' + S.escapeHtml(inv.notes || "") + "</textarea></label>",
      "</div><div data-warning=\"invoice\"></div></section>",
      '<section class="panel">',
      '<div class="panel-head"><div><p class="eyebrow">Regels</p><h2>Factuurregels</h2></div><button class="small-button" type="button" data-action="invoice-add-line">Regel toevoegen</button></div>',
      '<div class="line-table"><div class="line-row line-header"><span>Omschrijving</span><span>Aantal</span><span>Eenheid</span><span>Prijs excl.</span><span>BTW</span><span>Totaal</span><span></span></div><div data-lines="invoice">' + (inv.lines || []).map(lineRow).join("") + "</div></div>",
      '<div class="summary-box" data-summary="invoice"></div>',
      "</section>",
      "</form>"
    ].join("");
  }

  function statusOptions(selected) {
    return ["concept", "verzonden", "betaald", "verlopen"].map(function (status) {
      return '<option value="' + status + '"' + (status === selected ? " selected" : "") + ">" + status + "</option>";
    }).join("");
  }

  function collectLines(form) {
    return Array.from(form.querySelectorAll(".invoice-line")).map(function (row) {
      var line = {};
      row.querySelectorAll("[data-line]").forEach(function (field) {
        line[field.dataset.line] = field.value;
      });
      return line;
    });
  }

  function recalc(form) {
    var totals = S.calculateTotals(collectLines(form));
    form.querySelectorAll(".invoice-line").forEach(function (row, index) {
      var total = totals.lines[index] ? totals.lines[index].total : 0;
      row.querySelector(".line-total").textContent = S.money(total);
    });
    form.querySelector('[data-summary="invoice"]').innerHTML = [
      "<div><span>Subtotaal excl. BTW</span><strong>" + S.money(totals.subtotal) + "</strong></div>",
      "<div><span>BTW</span><strong>" + S.money(totals.vat) + "</strong></div>",
      '<div class="total"><span>Totaal incl. BTW</span><strong>' + S.money(totals.total) + "</strong></div>"
    ].join("");
  }

  function applyQuote(form, quoteNumber) {
    var quote = S.getAll("quotes").find(function (item) { return item.quoteNumber === quoteNumber; });
    var warning = form.querySelector('[data-warning="invoice"]');
    warning.innerHTML = "";
    if (!quote) return;
    form.elements.customerId.value = quote.customerId;
    var container = form.querySelector('[data-lines="invoice"]');
    container.innerHTML = (quote.lines || []).map(lineRow).join("");
    form.elements.notes.value = quote.notes || form.elements.notes.value;
    var duplicate = S.getAll("invoices").find(function (invoice) {
      return invoice.quoteNumber === quote.quoteNumber && invoice.status !== "concept" && invoice.id !== form.dataset.id;
    });
    if (duplicate) {
      warning.innerHTML = '<div class="notice warn" style="margin-top:14px;">Deze offerte is al definitief gefactureerd via ' + S.escapeHtml(duplicate.invoiceNumber) + ". Opslaan als definitieve factuur wordt geblokkeerd.</div>";
    } else {
      warning.innerHTML = '<div class="notice ok" style="margin-top:14px;">Offertegegevens automatisch geladen.</div>';
    }
    recalc(form);
  }

  function duplicateFinalInvoice(form, quoteNumber, status) {
    if (!quoteNumber || status === "concept") return null;
    return S.getAll("invoices").find(function (invoice) {
      return invoice.quoteNumber === quoteNumber && invoice.status !== "concept" && invoice.id !== form.dataset.id;
    });
  }

  function saveFromForm(form) {
    var data = Object.fromEntries(new FormData(form).entries());
    var duplicate = duplicateFinalInvoice(form, data.quoteNumber, data.status);
    if (duplicate) {
      C.app.toast("Deze offerte is al definitief gefactureerd. Bewaar alleen als concept of kies een andere offerte.");
      return;
    }
    var totals = S.calculateTotals(collectLines(form));
    if (!data.customerId) {
      C.app.toast("Kies eerst een klant.");
      return;
    }
    if (!totals.lines.length) {
      C.app.toast("Voeg minimaal een factuurregel toe.");
      return;
    }
    var numberPromise = !form.dataset.id && data.invoiceNumber === S.peekNumber("invoice")
      ? S.nextNumber("invoice")
      : Promise.resolve(data.invoiceNumber);
    return numberPromise.then(function (invoiceNumber) {
      data.invoiceNumber = invoiceNumber;
      data.id = form.dataset.id || data.id;
      data.lines = totals.lines;
      data.subtotal = totals.subtotal;
      data.vat = totals.vat;
      data.total = totals.total;
      return S.upsert("invoices", data);
    }).then(function (saved) {
      C.app.toast("Factuur opgeslagen.");
      C.app.navigate("invoice:" + saved.id);
      return saved;
    });
  }

  function renderDetail(id) {
    var invoice = S.getAll("invoices").find(function (item) { return item.id === id; });
    if (!invoice) return renderList("");
    var customer = S.getAll("customers").find(function (item) { return item.id === invoice.customerId; });
    var rows = (invoice.lines || []).map(function (line) {
      return "<tr><td>" + S.escapeHtml(line.description) + "</td><td>" + S.escapeHtml(line.qty + " " + line.unit) + "</td><td>" + S.money(line.priceExVat) + "</td><td>" + line.vatRate + "%</td><td>" + S.money(line.total) + "</td></tr>";
    }).join("");
    return [
      '<section class="grid two section">',
      '<div class="panel"><div class="panel-head"><div><p class="eyebrow">Factuur</p><h2>' + S.escapeHtml(invoice.invoiceNumber) + '</h2></div><span class="status-pill ' + statusClass(invoice.status) + '">' + S.escapeHtml(invoice.status) + '</span></div>',
      '<div class="detail-list">' + detail("Klant", S.customerName(customer)) + detail("Offerte", invoice.quoteNumber || "-") + detail("Datum", S.formatDate(invoice.invoiceDate)) + detail("Vervaldatum", S.formatDate(invoice.dueDate)) + detail("Totaal", S.money(invoice.total || 0)) + "</div>",
      '<div class="button-row" style="margin-top:16px;">' + statusActions(invoice) + '<button class="ghost-button" data-action="invoice-edit" data-id="' + invoice.id + '">Bewerk</button><button class="ghost-button" data-action="invoice-pdf" data-id="' + invoice.id + '">Download PDF</button><button class="ghost-button" data-action="invoice-print" data-id="' + invoice.id + '">Print</button><button class="danger-button" data-action="invoice-delete" data-id="' + invoice.id + '">Verwijder</button></div>',
      "</div>",
      '<div class="panel"><div class="panel-head"><div><p class="eyebrow">Specificatie</p><h2>Regels</h2></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Omschrijving</th><th>Aantal</th><th>Prijs excl.</th><th>BTW</th><th>Totaal</th></tr></thead><tbody>' + rows + "</tbody></table></div></div>",
      "</section>"
    ].join("");
  }

  function detail(label, value) {
    return "<div><span>" + S.escapeHtml(label) + "</span><strong>" + S.escapeHtml(value || "-") + "</strong></div>";
  }

  function createFromQuote(quoteId) {
    var quote = S.getAll("quotes").find(function (item) { return item.id === quoteId; });
    if (!quote) return null;
    var totals = S.calculateTotals(quote.lines);
    return baseInvoice({
      quoteNumber: quote.quoteNumber,
      customerId: quote.customerId,
      lines: totals.lines,
      subtotal: totals.subtotal,
      vat: totals.vat,
      total: totals.total,
      notes: quote.notes || S.settings().defaultInvoiceNote
    });
  }

  function saveFromQuote(quoteId, button) {
    if (button) button.disabled = true;
    return S.request("/api/quotes/" + encodeURIComponent(quoteId) + "/invoice", { method: "POST" })
      .then(function (response) {
        S.invalidate("invoices", response.item.id);
        S.invalidate("quotes", quoteId);
        C.app.toast(response.created ? "Conceptfactuur aangemaakt vanuit de offerte." : "De factuur voor deze offerte bestond al.");
        C.app.navigate("invoice:" + response.item.id);
        return response.item;
      })
      .catch(function (error) {
        if (button) button.disabled = false;
        C.app.toast(error.message || "Factuur aanmaken mislukt.");
      });
  }

  function removeInvoice(id) {
    return C.app.confirm({ title: "Factuur verwijderen", message: "Deze factuur wordt definitief verwijderd.", confirmLabel: "Factuur verwijderen" }).then(function (confirmed) {
      if (!confirmed) return;
      return S.remove("invoices", id).then(function () { C.app.toast("Factuur verwijderd."); C.app.navigate("invoices"); });
    });
  }

  function statusActions(invoice) {
    var buttons = [];
    if (invoice.status === "concept") {
      buttons.push('<button class="primary-button" data-action="invoice-status" data-status="verzonden" data-id="' + S.escapeHtml(invoice.id) + '">Markeer verzonden</button>');
    }
    if (invoice.status === "verzonden" || invoice.status === "verlopen") {
      buttons.push('<button class="primary-button" data-action="payment-from-invoice" data-id="' + S.escapeHtml(invoice.id) + '">Registreer betaling</button>');
      buttons.push('<button class="ghost-button" data-action="invoice-reminder" data-id="' + S.escapeHtml(invoice.id) + '">Stuur herinnering</button>');
    }
    return buttons.join("");
  }

  function updateStatus(id, status) {
    var allowed = ["concept", "verzonden", "betaald", "verlopen"];
    var invoice = S.getAll("invoices").find(function (item) { return item.id === id; });
    if (!invoice || allowed.indexOf(status) < 0) return;
    var update = Object.assign({}, invoice, {
      status: status,
      statusUpdatedAt: new Date().toISOString()
    });
    if (status === "betaald" && !update.paidAt) update.paidAt = update.statusUpdatedAt;
    return S.upsert("invoices", update).then(function () {
      C.app.toast(status === "betaald" ? "Factuur op betaald gezet." : "Factuurstatus bijgewerkt.");
      C.app.render();
    });
  }

  function reminderText(invoice, customer, settings) {
    var name = customer && (customer.firstName || S.customerName(customer)) || "klant";
    var overdue = invoice.dueDate && invoice.dueDate < S.today();
    var lines = [
      "Beste " + name + ",",
      "",
      (overdue ? "Volgens onze administratie is factuur " : "Dit is een vriendelijke herinnering voor factuur ") +
        invoice.invoiceNumber + " van " + S.money(invoice.total || 0) +
        " met vervaldatum " + S.formatDate(invoice.dueDate) + " nog niet als betaald geregistreerd.",
      "",
      "Zou u het openstaande bedrag willen overmaken" +
        (settings.companyIban ? " op " + settings.companyIban : "") +
        " onder vermelding van het factuurnummer? Heeft u de betaling al gedaan, dan kunt u dit bericht als niet verzonden beschouwen.",
      "",
      "Met vriendelijke groet,",
      settings.companyName,
      settings.companyPhone
    ];
    return lines.filter(function (line) { return line !== undefined; }).join("\n");
  }

  function sendReminder(id) {
    var invoice = S.getAll("invoices").find(function (item) { return item.id === id; });
    if (!invoice) return;
    var customer = S.getAll("customers").find(function (item) { return item.id === invoice.customerId; });
    var settings = S.settings();
    var subject = "Herinnering factuur " + invoice.invoiceNumber + " - " + settings.companyName;
    var body = reminderText(invoice, customer, settings);
    var to = customer && customer.email ? customer.email : "";
    var mailto = "mailto:" + encodeURIComponent(to) +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);
    window.location.href = mailto;
    C.app.toast(to ? "E-mailherinnering geopend." : "Geen e-mailadres bekend; herinnering geopend zonder ontvanger.");
  }

  C.invoices = {
    renderList: renderList,
    renderForm: renderForm,
    renderDetail: renderDetail,
    saveFromForm: saveFromForm,
    recalc: recalc,
    lineRow: lineRow,
    applyQuote: applyQuote,
    createFromQuote: createFromQuote,
    saveFromQuote: saveFromQuote,
    updateStatus: updateStatus,
    sendReminder: sendReminder,
    remove: removeInvoice
  };
}());
