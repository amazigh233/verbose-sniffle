(function () {
  "use strict";

  var C = window.Climature = window.Climature || {};
  var S = C.storage;

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
      lines: [{ description: "Levering en installatie", qty: 1, unit: "post", priceExVat: 0, vatRate: 21 }],
      notes: settings.defaultQuoteTerms,
      sourceAdviceId: ""
    }, seed || {});
  }

  function renderList(query) {
    var customers = S.getAll("customers");
    var q = (query || "").toLowerCase();
    var quotes = S.getAll("quotes").filter(function (quote) {
      var customer = customers.find(function (item) { return item.id === quote.customerId; });
      return !q || [quote.quoteNumber, S.customerName(customer), quote.status].join(" ").toLowerCase().indexOf(q) >= 0;
    });
    var rows = quotes.map(function (quote) {
      var customer = customers.find(function (item) { return item.id === quote.customerId; });
      return [
        "<tr>",
        "<td><strong>" + S.escapeHtml(quote.quoteNumber) + "</strong><br><span class=\"muted\">" + S.formatDate(quote.quoteDate) + "</span></td>",
        "<td>" + S.escapeHtml(S.customerName(customer)) + "</td>",
        '<td><span class="status-pill ' + statusClass(quote.status) + '">' + S.escapeHtml(quote.status) + "</span></td>",
        "<td>" + S.money(quote.total || 0) + "</td>",
        "<td>" + listActions(quote) + "</td>",
        "</tr>"
      ].join("");
    }).join("");
    return [
      '<section class="section panel">',
      '<div class="panel-head"><div><p class="eyebrow">Offertes</p><h2>Offertes beheren</h2></div><button class="primary-button" data-action="quote-new">Nieuwe offerte</button></div>',
      '<input class="search-input" type="search" placeholder="Zoeken op klantnaam, status of offertenummer" value="' + S.escapeHtml(query || "") + '" data-action="quote-search">',
      quotes.length ? '<div class="table-wrap" style="margin-top:14px;"><table class="data-table"><thead><tr><th>Offerte</th><th>Klant</th><th>Status</th><th>Totaal</th><th>Acties</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty-state" style="margin-top:14px;">Geen offertes gevonden.</div>',
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

  function lineRow(line) {
    var l = Object.assign({ description: "", qty: 1, unit: "stuk", priceExVat: 0, vatRate: 21, productId: "" }, line || {});
    return [
      '<div class="line-row quote-line">',
      '<select data-line="productId" data-action="quote-product-select">' + productOptions(l.productId) + "</select>",
      '<input data-line="qty" type="number" min="0" step="0.01" value="' + S.escapeHtml(l.qty) + '">',
      '<input data-line="unit" type="text" value="' + S.escapeHtml(l.unit) + '">',
      '<input data-line="priceExVat" type="number" min="0" step="0.01" value="' + S.escapeHtml(l.priceExVat) + '">',
      '<select data-line="vatRate"><option value="21"' + (Number(l.vatRate) === 21 ? " selected" : "") + '>21%</option><option value="9"' + (Number(l.vatRate) === 9 ? " selected" : "") + '>9%</option><option value="0"' + (Number(l.vatRate) === 0 ? " selected" : "") + ">0%</option></select>",
      '<strong class="line-total">-</strong>',
      '<button class="small-button" type="button" data-action="quote-remove-line">x</button>',
      '<input data-line="description" class="full-line-description" type="text" value="' + S.escapeHtml(l.description) + '" placeholder="Omschrijving" style="grid-column:1 / -1;">',
      "</div>"
    ].join("");
  }

  function renderForm(quote) {
    var q = baseQuote(quote || {});
    return [
      '<form class="grid" data-form="quote" data-id="' + S.escapeHtml(q.id || "") + '" data-sales-opportunity-id="' + S.escapeHtml(q.salesOpportunityId || "") + '">',
      '<section class="panel">',
      '<div class="panel-head"><div><p class="eyebrow">Offerte</p><h2>' + (q.id ? "Offerte bewerken" : "Nieuwe offerte") + '</h2></div><div class="button-row"><button class="ghost-button" type="button" data-action="quotes">Annuleren</button><button class="primary-button" type="submit">Opslaan als concept</button></div></div>',
      '<div class="field-grid">',
      '<label class="field">Klant<select name="customerId" required>' + customerOptions(q.customerId) + '</select></label>',
      '<label class="field">Offertenummer<input name="quoteNumber" required value="' + S.escapeHtml(q.quoteNumber) + '"></label>',
      '<label class="field">Offertedatum<input name="quoteDate" type="date" required value="' + S.escapeHtml(q.quoteDate) + '"></label>',
      '<label class="field">Geldig tot<input name="validUntil" type="date" required value="' + S.escapeHtml(q.validUntil) + '"></label>',
      '<label class="field">Status<select name="status">' + statusOptions(q.status) + '</select></label>',
      '<label class="field full">Notities / voorwaarden<textarea name="notes" rows="5">' + S.escapeHtml(q.notes || "") + "</textarea></label>",
      "</div></section>",
      '<section class="panel">',
      '<div class="panel-head"><div><p class="eyebrow">Regels</p><h2>Producten en diensten</h2></div><button class="small-button" type="button" data-action="quote-add-line">Regel toevoegen</button></div>',
      '<div class="line-table"><div class="line-row line-header"><span>Product</span><span>Aantal</span><span>Eenheid</span><span>Prijs excl.</span><span>BTW</span><span>Totaal</span><span></span></div><div data-lines="quote">' + (q.lines || []).map(lineRow).join("") + "</div></div>",
      '<div class="summary-box" data-summary="quote"></div>',
      "</section>",
      "</form>"
    ].join("");
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
        line[field.dataset.line] = field.value;
      });
      return line;
    });
  }

  function recalc(form) {
    var totals = S.calculateTotals(collectLines(form));
    form.querySelectorAll(".quote-line").forEach(function (row, index) {
      var total = totals.lines[index] ? totals.lines[index].total : 0;
      row.querySelector(".line-total").textContent = S.money(total);
    });
    form.querySelector('[data-summary="quote"]').innerHTML = summaryHtml(totals);
  }

  function summaryHtml(totals) {
    return [
      "<div><span>Subtotaal excl. BTW</span><strong>" + S.money(totals.subtotal) + "</strong></div>",
      "<div><span>BTW</span><strong>" + S.money(totals.vat) + "</strong></div>",
      '<div class="total"><span>Totaal incl. BTW</span><strong>' + S.money(totals.total) + "</strong></div>"
    ].join("");
  }

  function saveFromForm(form) {
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
      C.app.navigate("quote:" + saved.id);
      return saved;
    });
  }

  function renderDetail(id) {
    var quote = S.getAll("quotes").find(function (item) { return item.id === id; });
    if (!quote) return renderList("");
    var customer = S.getAll("customers").find(function (item) { return item.id === quote.customerId; });
    var invoice = S.getAll("invoices").find(function (item) { return item.quoteNumber === quote.quoteNumber && item.status !== "concept"; });
    var installation = C.installations && C.installations.findByQuote(quote.id, quote.quoteNumber);
    var rows = (quote.lines || []).map(function (line) {
      return "<tr><td>" + S.escapeHtml(line.description) + "</td><td>" + S.escapeHtml(line.qty + " " + line.unit) + "</td><td>" + S.money(line.priceExVat) + "</td><td>" + line.vatRate + "%</td><td>" + S.money(line.total) + "</td></tr>";
    }).join("");
    return [
      '<section class="grid two section">',
      '<div class="panel"><div class="panel-head"><div><p class="eyebrow">Offerte</p><h2>' + S.escapeHtml(quote.quoteNumber) + '</h2></div><span class="status-pill ' + statusClass(quote.status) + '">' + S.escapeHtml(quote.status) + '</span></div>',
      '<div class="detail-list">' + detail("Klant", S.customerName(customer)) + detail("Datum", S.formatDate(quote.quoteDate)) + detail("Geldig tot", S.formatDate(quote.validUntil)) + detail("Totaal", S.money(quote.total || 0)) + "</div>",
      invoice ? '<div class="notice warn" style="margin-top:14px;">Deze offerte is al definitief gefactureerd via ' + S.escapeHtml(invoice.invoiceNumber) + ".</div>" : "",
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
    return [
      '<div class="button-row" style="margin-top:16px;">',
      S.isAdmin() && accepted && !invoice ? '<button class="primary-button" data-action="quote-to-invoice" data-id="' + S.escapeHtml(quote.id) + '">Maak factuur</button>' : "",
      S.isAdmin() && accepted && invoice ? '<button class="ghost-button" data-action="invoice-detail" data-id="' + S.escapeHtml(invoice.id) + '">Open factuur</button>' : "",
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
  }

  function removeQuote(id) {
    if (!window.confirm("Offerte verwijderen?")) return;
    return S.remove("quotes", id).then(function () {
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
      return S.refresh();
    }).then(function () {
      C.app.toast(isAcceptedStatus(status) ? "Offerte geaccepteerd. Maak een factuur of plan de installatie." : "Offertestatus bijgewerkt.");
      C.app.render();
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
    lineRow: lineRow,
    fillProduct: fillProduct,
    remove: removeQuote,
    updateStatus: updateStatus,
    createFromAdvice: createFromAdvice
  };
}());
