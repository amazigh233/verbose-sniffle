(function () {
  "use strict";

  var C = window.Climature = window.Climature || {};
  var S = C.storage;

  var STAGES = [
    { key: "lead", label: "Lead", probability: 10 },
    { key: "contact", label: "Contact", probability: 25 },
    { key: "advies", label: "Advies", probability: 40 },
    { key: "offerte_maken", label: "Offerte maken", probability: 55 },
    { key: "offerte_verstuurd", label: "Offerte verstuurd", probability: 70 },
    { key: "gewonnen", label: "Gewonnen", probability: 100, tone: "ok" },
    { key: "verloren", label: "Verloren", probability: 0, tone: "danger" }
  ];

  function stageMeta(stage) {
    return STAGES.find(function (item) { return item.key === stage; }) || STAGES[0];
  }

  function stageOptions(selected) {
    return STAGES.map(function (stage) {
      return '<option value="' + stage.key + '"' + (stage.key === selected ? " selected" : "") + ">" + stage.label + "</option>";
    }).join("");
  }

  function customerOptions(selectedId) {
    return '<option value="">Geen klant gekoppeld</option>' + S.getAll("customers").map(function (customer) {
      return '<option value="' + S.escapeHtml(customer.id) + '"' + (customer.id === selectedId ? " selected" : "") + ">" + S.escapeHtml(S.customerName(customer)) + "</option>";
    }).join("");
  }

  function quoteOptions(selectedId, customerId) {
    var quotes = S.getAll("quotes").filter(function (quote) {
      return !customerId || quote.customerId === customerId;
    });
    return '<option value="">Geen offerte gekoppeld</option>' + quotes.map(function (quote) {
      return '<option value="' + S.escapeHtml(quote.id) + '"' + (quote.id === selectedId ? " selected" : "") + ">" + S.escapeHtml(quote.quoteNumber + " - " + S.money(quote.total || 0)) + "</option>";
    }).join("");
  }

  function baseOpportunity(item) {
    var stage = item && item.stage || "lead";
    return Object.assign({
      title: "",
      stage: stage,
      customerId: "",
      quoteId: "",
      contactName: "",
      companyName: "",
      email: "",
      phone: "",
      source: "",
      expectedValue: 0,
      probability: stageMeta(stage).probability,
      expectedCloseDate: "",
      followUpDate: S.addDays(S.today(), 2),
      notes: "",
      lostReason: ""
    }, item || {});
  }

  function contactLabel(opportunity) {
    var customer = S.getAll("customers").find(function (item) { return item.id === opportunity.customerId; });
    if (customer) return S.customerName(customer);
    return [opportunity.contactName, opportunity.companyName].filter(Boolean).join(" - ") || "Onbekend contact";
  }

  function linkedQuote(opportunity) {
    return S.getAll("quotes").find(function (quote) { return quote.id === opportunity.quoteId; });
  }

  function weightedValue(opportunity) {
    return Number(opportunity.expectedValue || 0) * (Number(opportunity.probability || 0) / 100);
  }

  function total(items, weighted) {
    return items.reduce(function (sum, item) {
      return sum + (weighted ? weightedValue(item) : Number(item.expectedValue || 0));
    }, 0);
  }

  function render() {
    var opportunities = S.getAll("salesOpportunities");
    var today = S.today();
    var open = opportunities.filter(function (item) { return item.stage !== "gewonnen" && item.stage !== "verloren"; });
    var due = open.filter(function (item) { return item.followUpDate && item.followUpDate <= today; });
    var unscheduled = open.filter(function (item) { return !item.followUpDate; });
    return [
      '<section class="section grid four">',
      metric("Open kansen", open.length),
      metric("Pipelinewaarde", S.money(total(open, false))),
      metric("Gewogen waarde", S.money(total(open, true))),
      metric("Vandaag opvolgen", due.length),
      "</section>",
      '<section class="section grid two">',
      followupPanel("Vandaag opvolgen", due, "Geen saleskansen die vandaag aandacht vragen."),
      followupPanel("Nog plannen", unscheduled, "Alle open saleskansen hebben een opvolgdatum."),
      "</section>",
      '<section class="section panel sales-funnel-panel">',
      '<div class="panel-head"><div><p class="eyebrow">Sales funnel</p><h2>Deals per fase</h2></div><button class="primary-button" data-action="sales-opportunity-new">Nieuwe lead</button></div>',
      '<div class="sales-board">' + STAGES.map(function (stage) { return stageColumn(stage, opportunities); }).join("") + "</div>",
      "</section>"
    ].join("");
  }

  function metric(label, value) {
    return '<div class="metric"><span>' + S.escapeHtml(label) + "</span><strong>" + S.escapeHtml(value) + "</strong></div>";
  }

  function followupPanel(title, items, emptyText) {
    var rows = items.slice(0, 5).map(function (item) {
      return [
        '<button class="rank-item" data-action="sales-opportunity-detail" data-id="' + S.escapeHtml(item.id) + '">',
        "<span>!</span><strong>" + S.escapeHtml(item.title) + "</strong>",
        "<small>" + S.escapeHtml(contactLabel(item)) + " - " + (item.followUpDate ? S.formatDate(item.followUpDate) : "Geen datum") + "</small>",
        "</button>"
      ].join("");
    }).join("");
    return '<div class="panel"><div class="panel-head"><div><p class="eyebrow">Opvolging</p><h2>' + S.escapeHtml(title) + '</h2></div></div>' + (items.length ? '<div class="rank-list">' + rows + "</div>" : '<div class="empty-state">' + S.escapeHtml(emptyText) + "</div>") + "</div>";
  }

  function stageColumn(stage, opportunities) {
    var items = opportunities.filter(function (item) { return item.stage === stage.key; });
    return [
      '<div class="sales-stage">',
      '<div class="sales-stage-head">',
      '<div><strong>' + S.escapeHtml(stage.label) + '</strong><span>' + items.length + ' deals</span></div>',
      '<span>' + S.money(total(items, false)) + "</span>",
      "</div>",
      '<div class="sales-card-list">' + (items.length ? items.map(card).join("") : '<div class="empty-state">Geen deals.</div>') + "</div>",
      "</div>"
    ].join("");
  }

  function card(opportunity) {
    var quote = linkedQuote(opportunity);
    return [
      '<article class="sales-card">',
      '<div class="sales-card-top">',
      '<h3>' + S.escapeHtml(opportunity.title) + "</h3>",
      '<span class="status-pill ' + S.escapeHtml(stageMeta(opportunity.stage).tone || "") + '">' + S.escapeHtml(stageMeta(opportunity.stage).label) + "</span>",
      "</div>",
      '<p>' + S.escapeHtml(contactLabel(opportunity)) + "</p>",
      '<div class="sales-card-meta">',
      '<span>' + S.money(opportunity.expectedValue || 0) + "</span>",
      '<span>' + S.escapeHtml(opportunity.probability || 0) + "% kans</span>",
      '<span>Opvolgen: ' + S.escapeHtml(opportunity.followUpDate ? S.formatDate(opportunity.followUpDate) : "nog plannen") + "</span>",
      quote ? '<span>Offerte: ' + S.escapeHtml(quote.quoteNumber) + "</span>" : "",
      "</div>",
      '<div class="button-row"><button class="small-button" data-action="sales-opportunity-detail" data-id="' + S.escapeHtml(opportunity.id) + '">Open</button><button class="small-button" data-action="sales-opportunity-next" data-id="' + S.escapeHtml(opportunity.id) + '">Volgende fase</button></div>',
      "</article>"
    ].join("");
  }

  function renderForm(opportunity) {
    var item = baseOpportunity(opportunity || {});
    return [
      '<form class="panel" data-form="sales-opportunity" data-id="' + S.escapeHtml(item.id || "") + '">',
      '<div class="panel-head"><div><p class="eyebrow">Sales funnel</p><h2>' + (item.id ? "Saleskans bewerken" : "Nieuwe lead") + '</h2></div><div class="button-row"><button class="ghost-button" type="button" data-action="sales-funnel">Annuleren</button><button class="primary-button" type="submit">Opslaan</button></div></div>',
      '<div class="field-grid">',
      field("Titel", "title", item.title, "text", true),
      '<label class="field">Fase<select name="stage" data-action="sales-stage-select">' + stageOptions(item.stage) + "</select></label>",
      '<label class="field">Klant koppelen<select name="customerId">' + customerOptions(item.customerId) + "</select></label>",
      field("Contactnaam", "contactName", item.contactName),
      field("Bedrijf", "companyName", item.companyName),
      field("E-mail", "email", item.email, "email"),
      field("Telefoon", "phone", item.phone),
      field("Bron", "source", item.source),
      field("Verwachte waarde", "expectedValue", item.expectedValue || "", "number"),
      field("Kanspercentage", "probability", item.probability, "number"),
      field("Verwachte sluitdatum", "expectedCloseDate", item.expectedCloseDate, "date"),
      field("Opvolgdatum", "followUpDate", item.followUpDate, "date"),
      '<label class="field">Offerte koppelen<select name="quoteId">' + quoteOptions(item.quoteId, item.customerId) + "</select></label>",
      '<label class="field full">Notities<textarea name="notes" rows="5">' + S.escapeHtml(item.notes || "") + "</textarea></label>",
      '<label class="field full">Reden verloren<textarea name="lostReason" rows="3">' + S.escapeHtml(item.lostReason || "") + "</textarea></label>",
      "</div>",
      "</form>"
    ].join("");
  }

  function field(label, name, value, type, required) {
    return '<label class="field">' + S.escapeHtml(label) + '<input name="' + S.escapeHtml(name) + '" type="' + S.escapeHtml(type || "text") + '"' + (required ? " required" : "") + ' value="' + S.escapeHtml(value == null ? "" : value) + '"></label>';
  }

  function renderDetail(id) {
    var opportunity = S.getAll("salesOpportunities").find(function (item) { return item.id === id; });
    if (!opportunity) return render();
    var quote = linkedQuote(opportunity);
    return [
      '<section class="grid two section">',
      '<div class="panel">',
      '<div class="panel-head"><div><p class="eyebrow">Saleskans</p><h2>' + S.escapeHtml(opportunity.title) + '</h2></div><span class="status-pill ' + S.escapeHtml(stageMeta(opportunity.stage).tone || "") + '">' + S.escapeHtml(stageMeta(opportunity.stage).label) + '</span></div>',
      '<div class="detail-list">',
      detail("Contact", contactLabel(opportunity)),
      detail("Bron", opportunity.source || "-"),
      detail("Waarde", S.money(opportunity.expectedValue || 0)),
      detail("Gewogen waarde", S.money(weightedValue(opportunity))),
      detail("Kans", (opportunity.probability || 0) + "%"),
      detail("Opvolgdatum", S.formatDate(opportunity.followUpDate)),
      detail("Sluitdatum", S.formatDate(opportunity.expectedCloseDate)),
      detail("Offerte", quote ? quote.quoteNumber : "-"),
      "</div>",
      stageFlow(opportunity),
      '<div class="button-row" style="margin-top:16px;">',
      '<button class="primary-button" data-action="sales-opportunity-quote" data-id="' + S.escapeHtml(opportunity.id) + '">Start offerte</button>',
      '<button class="ghost-button" data-action="sales-appointment-new" data-opportunity-id="' + S.escapeHtml(opportunity.id) + '">Plan afspraak</button>',
      quote ? '<button class="ghost-button" data-action="quote-detail" data-id="' + S.escapeHtml(quote.id) + '">Open offerte</button>' : "",
      '<button class="ghost-button" data-action="sales-opportunity-edit" data-id="' + S.escapeHtml(opportunity.id) + '">Bewerk</button>',
      '<button class="danger-button" data-action="sales-opportunity-delete" data-id="' + S.escapeHtml(opportunity.id) + '">Verwijder</button>',
      "</div>",
      "</div>",
      '<div class="panel"><div class="panel-head"><div><p class="eyebrow">Notities</p><h2>Context</h2></div></div>',
      opportunity.notes ? '<p class="muted">' + S.escapeHtml(opportunity.notes) + "</p>" : '<div class="empty-state">Geen notities.</div>',
      opportunity.lostReason ? '<div class="notice warn" style="margin-top:14px;">Reden verloren: ' + S.escapeHtml(opportunity.lostReason) + "</div>" : "",
      "</div>",
      "</section>"
    ].join("");
  }

  function detail(label, value) {
    return "<div><span>" + S.escapeHtml(label) + "</span><strong>" + S.escapeHtml(value || "-") + "</strong></div>";
  }

  function stageFlow(opportunity) {
    return [
      '<div class="quote-status-flow">',
      '<span>Fase</span>',
      '<div class="button-row">',
      STAGES.map(function (stage) {
        var active = opportunity.stage === stage.key ? " is-active" : "";
        return '<button class="small-button status-step' + active + '" data-action="sales-opportunity-stage" data-id="' + S.escapeHtml(opportunity.id) + '" data-stage="' + stage.key + '">' + S.escapeHtml(stage.label) + "</button>";
      }).join(""),
      "</div>",
      "</div>"
    ].join("");
  }

  function saveFromForm(form) {
    var data = Object.fromEntries(new FormData(form).entries());
    if (!data.title) {
      C.app.toast("Vul een titel in.");
      return;
    }
    if (!data.customerId && !data.contactName) {
      C.app.toast("Vul een contactnaam in of koppel een klant.");
      return;
    }
    if (form.dataset.id) data.id = form.dataset.id;
    data.expectedValue = S.parseNumber(data.expectedValue);
    data.probability = S.parseNumber(data.probability);
    return S.upsert("salesOpportunities", data).then(function (saved) {
      C.app.toast("Saleskans opgeslagen.");
      C.app.navigate("sales-opportunity:" + saved.id);
      return saved;
    });
  }

  function updateStage(id, stage) {
    var opportunity = S.getAll("salesOpportunities").find(function (item) { return item.id === id; });
    if (!opportunity) return;
    var update = Object.assign({}, opportunity, { stage: stage, probability: stageMeta(stage).probability });
    if (stage !== "verloren") update.lostReason = "";
    return S.upsert("salesOpportunities", update).then(function () {
      C.app.toast("Fase bijgewerkt.");
      C.app.render();
    });
  }

  function nextStage(id) {
    var opportunity = S.getAll("salesOpportunities").find(function (item) { return item.id === id; });
    if (!opportunity) return;
    var index = STAGES.findIndex(function (stage) { return stage.key === opportunity.stage; });
    if (index < 0 || index >= STAGES.length - 2) return updateStage(id, opportunity.stage);
    var next = STAGES[index + 1];
    return updateStage(id, next.key);
  }

  function remove(id) {
    return C.app.confirm({ title: "Saleskans verwijderen", message: "Deze saleskans wordt definitief verwijderd.", confirmLabel: "Saleskans verwijderen" }).then(function (confirmed) {
      if (!confirmed) return;
      return S.remove("salesOpportunities", id).then(function () { C.app.toast("Saleskans verwijderd."); C.app.navigate("sales-funnel"); });
    });
  }

  function createQuote(id) {
    var opportunity = S.getAll("salesOpportunities").find(function (item) { return item.id === id; });
    if (!opportunity) return;
    if (opportunity.quoteId) {
      C.app.navigate("quote:" + opportunity.quoteId);
      return;
    }
    if (!opportunity.customerId) {
      C.app.toast("Koppel eerst een klant voordat u een offerte start.");
      return;
    }
    C.app.navigate("quote-new?customerId=" + encodeURIComponent(opportunity.customerId) + "&opportunityId=" + encodeURIComponent(opportunity.id));
  }

  function quoteSeed(id) {
    var opportunity = S.getAll("salesOpportunities").find(function (item) { return item.id === id; });
    if (!opportunity) return {};
    return {
      salesOpportunityId: opportunity.id,
      customerId: opportunity.customerId,
      notes: (opportunity.notes || S.settings().defaultQuoteTerms),
      lines: [{
        description: opportunity.title,
        qty: 1,
        unit: "post",
        priceExVat: opportunity.expectedValue || 0,
        vatRate: 21
      }]
    };
  }

  function linkQuote(opportunityId, quote) {
    var opportunity = S.getAll("salesOpportunities").find(function (item) { return item.id === opportunityId; });
    if (!opportunity || !quote) return Promise.resolve();
    var accepted = quote.status === "geaccepteerd" || quote.status === "geaccepteerd/aanbetaling";
    return S.upsert("salesOpportunities", Object.assign({}, opportunity, {
      quoteId: quote.id,
      customerId: quote.customerId || opportunity.customerId,
      expectedValue: quote.total || opportunity.expectedValue,
      stage: quote.status === "verstuurd" ? "offerte_verstuurd" : accepted ? "gewonnen" : quote.status === "afgewezen" ? "verloren" : "offerte_maken",
      probability: accepted ? 100 : quote.status === "afgewezen" ? 0 : opportunity.probability
    }));
  }

  function applyStageDefault(select) {
    var form = select.closest("form");
    var field = form && form.querySelector('[name="probability"]');
    if (field) field.value = stageMeta(select.value).probability;
  }

  C.salesFunnel = {
    render: render,
    renderForm: renderForm,
    renderDetail: renderDetail,
    saveFromForm: saveFromForm,
    updateStage: updateStage,
    nextStage: nextStage,
    remove: remove,
    createQuote: createQuote,
    quoteSeed: quoteSeed,
    linkQuote: linkQuote,
    applyStageDefault: applyStageDefault
  };
}());
