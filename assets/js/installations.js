(function () {
  "use strict";

  var C = window.Climature = window.Climature || {};
  var S = C.storage;

  function statusClass(status) {
    if (status === "uitgevoerd") return "ok";
    if (status === "geannuleerd") return "danger";
    return "warn";
  }

  function baseInstallation(seed) {
    return Object.assign({
      quoteId: "",
      quoteNumber: "",
      customerId: "",
      plannedDate: S.addDays(S.today(), 14),
      startTime: "09:00",
      durationHours: 4,
      installer: "",
      status: "ingepland",
      notes: ""
    }, seed || {});
  }

  function renderList(query) {
    var state = agendaState();
    var customers = S.getAll("customers");
    var q = (query || "").toLowerCase();
    var installations = sortedInstallations(S.getAll("installations").filter(function (installation) {
      var customer = customers.find(function (item) { return item.id === installation.customerId; });
      return !q || [installation.quoteNumber, installation.status, installation.installer, S.customerName(customer)].join(" ").toLowerCase().indexOf(q) >= 0;
    }));
    return [
      '<section class="section panel">',
      '<div class="panel-head"><div><p class="eyebrow">Planning</p><h2>Installaties beheren</h2></div><button class="primary-button" data-action="installation-new">Nieuwe installatie</button></div>',
      agendaControls(state),
      state.view === "list" ? listView(installations, customers, query) : "",
      state.view === "week" ? weekView(installations, customers, state) : "",
      state.view === "month" ? monthView(installations, customers, state) : "",
      "</section>"
    ].join("");
  }

  function agendaState() {
    var params = new URLSearchParams((window.location.hash.split("?")[1] || ""));
    var view = params.get("view") || "list";
    if (["list", "week", "month"].indexOf(view) < 0) view = "list";
    return { view: view, date: validDate(params.get("date") || S.today()) };
  }

  function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : S.today();
  }

  function localDate(value) {
    return new Date(validDate(value) + "T00:00:00");
  }

  function iso(date) {
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return date.getFullYear() + "-" + month + "-" + day;
  }

  function addDays(dateValue, days) {
    var date = localDate(dateValue);
    date.setDate(date.getDate() + days);
    return iso(date);
  }

  function addMonths(dateValue, months) {
    var date = localDate(dateValue);
    date.setMonth(date.getMonth() + months);
    return iso(date);
  }

  function startOfWeek(dateValue) {
    var date = localDate(dateValue);
    var day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
    return iso(date);
  }

  function startOfMonth(dateValue) {
    var date = localDate(dateValue);
    date.setDate(1);
    return iso(date);
  }

  function route(view, date) {
    return "installations?view=" + encodeURIComponent(view) + "&date=" + encodeURIComponent(validDate(date));
  }

  function periodLabel(state) {
    if (state.view === "week") {
      var start = startOfWeek(state.date);
      return S.formatDate(start) + " t/m " + S.formatDate(addDays(start, 6));
    }
    if (state.view === "month") {
      return localDate(state.date).toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
    }
    return "Alle installaties";
  }

  function agendaControls(state) {
    var prev = state.view === "month" ? addMonths(state.date, -1) : addDays(state.date, -7);
    var next = state.view === "month" ? addMonths(state.date, 1) : addDays(state.date, 7);
    return [
      '<div class="calendar-toolbar">',
      '<div class="view-switch">',
      viewButton("list", "Lijst", state),
      viewButton("week", "Week", state),
      viewButton("month", "Maand", state),
      "</div>",
      '<div class="calendar-period">',
      state.view === "list" ? "" : '<button class="small-button" data-action="installation-period" data-view="' + state.view + '" data-date="' + prev + '">Vorige</button>',
      '<strong>' + S.escapeHtml(periodLabel(state)) + "</strong>",
      state.view === "list" ? "" : '<button class="small-button" data-action="installation-today" data-view="' + state.view + '">Vandaag</button>',
      state.view === "list" ? "" : '<button class="small-button" data-action="installation-period" data-view="' + state.view + '" data-date="' + next + '">Volgende</button>',
      "</div>",
      "</div>"
    ].join("");
  }

  function viewButton(view, label, state) {
    return '<button class="small-button' + (state.view === view ? " is-active" : "") + '" data-action="installation-view" data-view="' + view + '" data-date="' + state.date + '">' + label + "</button>";
  }

  function listView(installations, customers, query) {
    var rows = installations.map(function (installation) {
      var customer = customers.find(function (item) { return item.id === installation.customerId; });
      return [
        "<tr>",
        "<td><strong>" + S.escapeHtml(S.formatDate(installation.plannedDate)) + "</strong><br><span class=\"muted\">" + S.escapeHtml(installation.startTime || "-") + "</span></td>",
        "<td>" + S.escapeHtml(S.customerName(customer)) + (installation.quoteNumber ? '<br><span class="muted">' + S.escapeHtml(installation.quoteNumber) + "</span>" : "") + "</td>",
        '<td><span class="status-pill ' + statusClass(installation.status) + '">' + S.escapeHtml(installation.status || "ingepland") + "</span></td>",
        "<td>" + S.escapeHtml(installation.installer || "-") + "</td>",
        '<td><div class="button-row"><button class="small-button" data-action="installation-detail" data-id="' + S.escapeHtml(installation.id) + '">Open</button><a class="small-button" target="_blank" rel="noopener" href="' + S.escapeHtml(googleCalendarUrl(installation, customer)) + '">Google Agenda</a><button class="small-button" data-action="installation-edit" data-id="' + S.escapeHtml(installation.id) + '">Bewerk</button></div></td>',
        "</tr>"
      ].join("");
    }).join("");
    return [
      '<input class="search-input" type="search" placeholder="Zoeken op klant, offerte, status of monteur" value="' + S.escapeHtml(query || "") + '" data-action="installation-search">',
      installations.length ? '<div class="table-wrap" style="margin-top:14px;"><table class="data-table"><thead><tr><th>Datum</th><th>Klant / offerte</th><th>Status</th><th>Monteur</th><th>Acties</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty-state" style="margin-top:14px;">Geen installaties gepland.</div>'
    ].join("");
  }

  function weekView(installations, customers, state) {
    var start = startOfWeek(state.date);
    var days = Array.from({ length: 7 }).map(function (_, index) { return addDays(start, index); });
    return '<div class="calendar-grid week">' + days.map(function (day) {
      var items = installations.filter(function (installation) { return installation.plannedDate === day; });
      return calendarDay(day, items, customers, false);
    }).join("") + "</div>";
  }

  function monthView(installations, customers, state) {
    var monthStart = startOfMonth(state.date);
    var gridStart = startOfWeek(monthStart);
    var currentMonth = monthStart.slice(0, 7);
    var days = Array.from({ length: 42 }).map(function (_, index) { return addDays(gridStart, index); });
    return '<div class="calendar-scroll"><div class="calendar-grid month">' + days.map(function (day) {
      var items = installations.filter(function (installation) { return installation.plannedDate === day; });
      return calendarDay(day, items, customers, day.slice(0, 7) !== currentMonth);
    }).join("") + "</div></div>";
  }

  function calendarDay(day, items, customers, outsideMonth) {
    var date = localDate(day);
    return [
      '<div class="calendar-day' + (outsideMonth ? " is-muted" : "") + '">',
      '<div class="calendar-day-head"><strong>' + date.toLocaleDateString("nl-NL", { weekday: "short" }) + '</strong><span>' + S.formatDate(day) + "</span></div>",
      items.length ? items.map(function (installation) { return installationCard(installation, customers); }).join("") : '<div class="calendar-empty">Geen planning</div>',
      "</div>"
    ].join("");
  }

  function installationCard(installation, customers) {
    var customer = customers.find(function (item) { return item.id === installation.customerId; });
    return [
      '<article class="calendar-card">',
      '<div><strong>' + S.escapeHtml(installation.startTime || "--:--") + " - " + S.escapeHtml(S.customerName(customer)) + '</strong><span>' + S.escapeHtml(installation.installer || "Geen monteur") + '</span></div>',
      '<span class="status-pill ' + statusClass(installation.status) + '">' + S.escapeHtml(installation.status || "ingepland") + "</span>",
      '<div class="button-row"><button class="small-button" data-action="installation-detail" data-id="' + S.escapeHtml(installation.id) + '">Open</button><a class="small-button" target="_blank" rel="noopener" href="' + S.escapeHtml(googleCalendarUrl(installation, customer)) + '">Google</a></div>',
      "</article>"
    ].join("");
  }

  function calendarDateTime(dateValue, timeValue, durationHours) {
    var parts = validDate(dateValue).split("-").map(Number);
    var timeParts = String(timeValue || "09:00").split(":").map(Number);
    var start = new Date(parts[0], parts[1] - 1, parts[2], timeParts[0] || 9, timeParts[1] || 0, 0);
    var end = new Date(start.getTime() + (S.parseNumber(durationHours) || 4) * 60 * 60 * 1000);
    return googleStamp(start) + "/" + googleStamp(end);
  }

  function googleStamp(date) {
    function pad(value) { return String(value).padStart(2, "0"); }
    return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) + "T" + pad(date.getHours()) + pad(date.getMinutes()) + "00";
  }

  function googleCalendarUrl(installation, customer) {
    var title = "Installatie Climature - " + S.customerName(customer);
    var details = [
      installation.quoteNumber ? "Offerte: " + installation.quoteNumber : "",
      installation.installer ? "Monteur: " + installation.installer : "",
      installation.status ? "Status: " + installation.status : "",
      installation.notes || ""
    ].filter(Boolean).join("\n");
    var params = new URLSearchParams({
      action: "TEMPLATE",
      text: title,
      dates: calendarDateTime(installation.plannedDate, installation.startTime, installation.durationHours),
      details: details,
      ctz: "Europe/Amsterdam"
    });
    return "https://calendar.google.com/calendar/render?" + params.toString();
  }

  function sortedInstallations(items) {
    return items.slice().sort(function (a, b) {
      return String(a.plannedDate || "").localeCompare(String(b.plannedDate || "")) || String(a.startTime || "").localeCompare(String(b.startTime || ""));
    });
  }

  function customerOptions(selectedId) {
    return '<option value="">Kies klant</option>' + S.getAll("customers").map(function (customer) {
      return '<option value="' + S.escapeHtml(customer.id) + '"' + (customer.id === selectedId ? " selected" : "") + ">" + S.escapeHtml(S.customerName(customer)) + "</option>";
    }).join("");
  }

  function statusOptions(selected) {
    return ["ingepland", "uitgevoerd", "geannuleerd"].map(function (status) {
      return '<option value="' + status + '"' + (status === selected ? " selected" : "") + ">" + status + "</option>";
    }).join("");
  }

  function renderForm(installation) {
    var data = baseInstallation(installation || {});
    return [
      '<form class="panel" data-form="installation" data-id="' + S.escapeHtml(data.id || "") + '">',
      '<div class="panel-head"><div><p class="eyebrow">Installatie</p><h2>' + (data.id ? "Installatie bewerken" : "Installatie plannen") + '</h2></div><div class="button-row"><button class="ghost-button" type="button" data-action="installations">Annuleren</button><button class="primary-button" type="submit">Opslaan</button></div></div>',
      '<div class="field-grid">',
      '<label class="field">Klant<select name="customerId" required>' + customerOptions(data.customerId) + '</select></label>',
      '<label class="field">Offertenummer<input name="quoteNumber" value="' + S.escapeHtml(data.quoteNumber || "") + '"></label>',
      '<label class="field">Datum<input name="plannedDate" type="date" required value="' + S.escapeHtml(data.plannedDate || S.today()) + '"></label>',
      '<label class="field">Starttijd<input name="startTime" type="time" value="' + S.escapeHtml(data.startTime || "09:00") + '"></label>',
      '<label class="field">Duur in uren<input name="durationHours" type="number" min="0.5" step="0.5" value="' + S.escapeHtml(data.durationHours || 4) + '"></label>',
      '<label class="field">Monteur<input name="installer" value="' + S.escapeHtml(data.installer || "") + '" placeholder="Naam monteur"></label>',
      '<label class="field">Status<select name="status">' + statusOptions(data.status || "ingepland") + '</select></label>',
      '<label class="field full">Notities<textarea name="notes" rows="5">' + S.escapeHtml(data.notes || "") + "</textarea></label>",
      '<input type="hidden" name="quoteId" value="' + S.escapeHtml(data.quoteId || "") + '">',
      "</div>",
      "</form>"
    ].join("");
  }

  function renderDetail(id) {
    var installation = S.getAll("installations").find(function (item) { return item.id === id; });
    if (!installation) return renderList("");
    var customer = S.getAll("customers").find(function (item) { return item.id === installation.customerId; });
    return [
      '<section class="grid two section">',
      '<div class="panel">',
      '<div class="panel-head"><div><p class="eyebrow">Installatie</p><h2>' + S.escapeHtml(S.formatDate(installation.plannedDate)) + '</h2></div><span class="status-pill ' + statusClass(installation.status) + '">' + S.escapeHtml(installation.status || "ingepland") + '</span></div>',
      '<div class="detail-list">' + detail("Klant", S.customerName(customer)) + detail("Offerte", installation.quoteNumber || "-") + detail("Starttijd", installation.startTime || "-") + detail("Duur", (installation.durationHours || 4) + " uur") + detail("Monteur", installation.installer || "-") + detail("Notities", installation.notes || "-") + "</div>",
      '<div class="button-row" style="margin-top:16px;"><a class="primary-button" target="_blank" rel="noopener" href="' + S.escapeHtml(googleCalendarUrl(installation, customer)) + '">Zet in Google Agenda</a><button class="ghost-button" data-action="installation-edit" data-id="' + S.escapeHtml(installation.id) + '">Bewerk</button>' + (installation.quoteId ? '<button class="ghost-button" data-action="quote-detail" data-id="' + S.escapeHtml(installation.quoteId) + '">Open offerte</button>' : "") + '<button class="danger-button" data-action="installation-delete" data-id="' + S.escapeHtml(installation.id) + '">Verwijder</button></div>',
      "</div>",
      "</section>"
    ].join("");
  }

  function detail(label, value) {
    return "<div><span>" + S.escapeHtml(label) + "</span><strong>" + S.escapeHtml(value || "-") + "</strong></div>";
  }

  function createFromQuote(quoteId) {
    var quote = S.getAll("quotes").find(function (item) { return item.id === quoteId; });
    if (!quote) return null;
    var existing = findByQuote(quote.id, quote.quoteNumber);
    if (existing) return existing;
    return baseInstallation({
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      customerId: quote.customerId,
      notes: "Installatie vanuit geaccepteerde offerte " + quote.quoteNumber + "."
    });
  }

  function findByQuote(quoteId, quoteNumber) {
    return S.getAll("installations").find(function (installation) {
      return (quoteId && installation.quoteId === quoteId) || (quoteNumber && installation.quoteNumber === quoteNumber);
    });
  }

  function saveFromForm(form) {
    var data = Object.fromEntries(new FormData(form).entries());
    if (!data.customerId || !data.plannedDate) {
      C.app.toast("Kies een klant en installatiedatum.");
      return;
    }
    if (form.dataset.id) data.id = form.dataset.id;
    data.durationHours = S.parseNumber(data.durationHours) || 4;
    return S.upsert("installations", data).then(function (saved) {
      C.app.toast("Installatie opgeslagen.");
      C.app.navigate("installation:" + saved.id);
      return saved;
    });
  }

  function removeInstallation(id) {
    if (!window.confirm("Installatie verwijderen?")) return;
    return S.remove("installations", id).then(function () {
      C.app.toast("Installatie verwijderd.");
      C.app.navigate("installations");
    });
  }

  C.installations = {
    renderList: renderList,
    renderForm: renderForm,
    renderDetail: renderDetail,
    createFromQuote: createFromQuote,
    findByQuote: findByQuote,
    saveFromForm: saveFromForm,
    remove: removeInstallation
  };
}());
