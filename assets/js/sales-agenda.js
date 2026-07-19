(function () {
  "use strict";

  var C = window.Climature = window.Climature || {};
  var S = C.storage;
  var TYPE_LABELS = { belafspraak: "Belafspraak", videogesprek: "Videogesprek", bezoek: "Klantbezoek", adviesgesprek: "Adviesgesprek", overig: "Overig" };
  var STATUS_LABELS = { gepland: "Gepland", afgerond: "Afgerond", geannuleerd: "Geannuleerd" };

  function parseDate(value) {
    var parts = String(value || S.today()).split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2], 12);
  }

  function dateValue(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function shiftDate(value, days) {
    var date = parseDate(value);
    date.setDate(date.getDate() + days);
    return dateValue(date);
  }

  function optionList(map, selected) {
    return Object.keys(map).map(function (key) {
      return '<option value="' + key + '"' + (key === selected ? " selected" : "") + ">" + S.escapeHtml(map[key]) + "</option>";
    }).join("");
  }

  function customerOptions(selected) {
    return '<option value="">Geen klant gekoppeld</option>' + S.getAll("customers").map(function (customer) {
      return '<option value="' + S.escapeHtml(customer.id) + '"' + (customer.id === selected ? " selected" : "") + ">" + S.escapeHtml(S.customerName(customer)) + "</option>";
    }).join("");
  }

  function opportunityOptions(selected) {
    return '<option value="">Geen saleskans gekoppeld</option>' + S.getAll("salesOpportunities").map(function (item) {
      return '<option value="' + S.escapeHtml(item.id) + '"' + (item.id === selected ? " selected" : "") + ">" + S.escapeHtml(item.title) + "</option>";
    }).join("");
  }

  function query() {
    return new URLSearchParams((window.location.hash.split("?")[1] || ""));
  }

  function baseAppointment(item) {
    var params = query();
    var opportunityId = params.get("opportunityId") || "";
    var opportunity = S.getAll("salesOpportunities").find(function (entry) { return entry.id === opportunityId; });
    return Object.assign({
      title: opportunity ? "Opvolging: " + opportunity.title : "",
      type: "belafspraak",
      status: "gepland",
      date: params.get("date") || S.today(),
      startTime: "09:00",
      endTime: "09:30",
      customerId: opportunity && opportunity.customerId || "",
      opportunityId: opportunityId,
      contactName: opportunity && opportunity.contactName || "",
      location: "",
      notes: ""
    }, item || {});
  }

  function render() {
    var params = query();
    var view = params.get("view") === "week" ? "week" : "month";
    var focus = params.get("date") || S.today();
    var appointments = S.getAll("salesAppointments");
    var today = S.today();
    var upcoming = appointments.filter(function (item) { return item.status === "gepland" && item.date >= today; });
    var todayItems = appointments.filter(function (item) { return item.status === "gepland" && item.date === today; });
    return [
      '<section class="section grid three">',
      metric("Vandaag", todayItems.length),
      metric("Komende afspraken", upcoming.length),
      metric("Nog af te ronden", appointments.filter(function (item) { return item.status === "gepland" && item.date < today; }).length),
      "</section>",
      '<section class="section panel">',
      '<div class="calendar-toolbar"><div><p class="eyebrow">Salesplanning</p><h2>Agenda</h2></div><div class="view-switch"><button class="small-button' + (view === "week" ? " is-active" : "") + '" data-action="sales-agenda-view" data-view="week" data-date="' + focus + '">Week</button><button class="small-button' + (view === "month" ? " is-active" : "") + '" data-action="sales-agenda-view" data-view="month" data-date="' + focus + '">Maand</button></div></div>',
      calendar(view, focus, appointments),
      "</section>",
      upcomingList(upcoming),
    ].join("");
  }

  function metric(label, value) {
    return '<div class="metric"><span>' + S.escapeHtml(label) + "</span><strong>" + value + "</strong></div>";
  }

  function calendar(view, focus, appointments) {
    var focused = parseDate(focus);
    var start;
    var days;
    if (view === "week") {
      start = new Date(focused);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      days = 7;
    } else {
      start = new Date(focused.getFullYear(), focused.getMonth(), 1, 12);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      days = 42;
    }
    var previous = view === "week" ? shiftDate(focus, -7) : dateValue(new Date(focused.getFullYear(), focused.getMonth() - 1, 1, 12));
    var next = view === "week" ? shiftDate(focus, 7) : dateValue(new Date(focused.getFullYear(), focused.getMonth() + 1, 1, 12));
    var title = view === "week"
      ? "Week van " + S.formatDate(dateValue(start))
      : focused.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
    var cells = [];
    for (var index = 0; index < days; index += 1) {
      var day = new Date(start);
      day.setDate(start.getDate() + index);
      cells.push(dayCell(day, focused.getMonth(), view, appointments));
    }
    return [
      '<div class="calendar-period"><button class="small-button" data-action="sales-agenda-period" data-view="' + view + '" data-date="' + previous + '">Vorige</button><button class="small-button" data-action="sales-agenda-today" data-view="' + view + '">Vandaag</button><strong>' + S.escapeHtml(title) + '</strong><button class="small-button" data-action="sales-agenda-period" data-view="' + view + '" data-date="' + next + '">Volgende</button></div>',
      '<div class="calendar-scroll"><div class="calendar-grid ' + view + '">' + cells.join("") + "</div></div>"
    ].join("");
  }

  function dayCell(day, focusMonth, view, appointments) {
    var value = dateValue(day);
    var items = appointments.filter(function (item) { return item.date === value; });
    var muted = view === "month" && day.getMonth() !== focusMonth ? " is-muted" : "";
    return [
      '<div class="calendar-day' + muted + '">',
      '<div class="calendar-day-head"><strong>' + S.escapeHtml(day.toLocaleDateString("nl-NL", { weekday: "short" })) + '</strong><button class="calendar-add" title="Afspraak toevoegen" aria-label="Afspraak toevoegen op ' + S.formatDate(value) + '" data-action="sales-appointment-new" data-date="' + value + '">' + day.getDate() + " +</button></div>",
      items.length ? items.map(appointmentCard).join("") : '<div class="calendar-empty">Geen afspraken</div>',
      "</div>"
    ].join("");
  }

  function appointmentCard(item) {
    var customer = S.getAll("customers").find(function (entry) { return entry.id === item.customerId; });
    return [
      '<button class="calendar-card sales-appointment-card status-' + S.escapeHtml(item.status) + '" data-action="sales-appointment-detail" data-id="' + S.escapeHtml(item.id) + '">',
      '<span class="appointment-time">' + S.escapeHtml(item.startTime + "–" + item.endTime) + "</span>",
      '<div><strong>' + S.escapeHtml(item.title) + "</strong><span>" + S.escapeHtml(TYPE_LABELS[item.type] || "Overig") + (customer ? " · " + S.escapeHtml(S.customerName(customer)) : "") + "</span></div>",
      "</button>"
    ].join("");
  }

  function upcomingList(items) {
    var rows = items.slice().sort(function (a, b) { return (a.date + a.startTime).localeCompare(b.date + b.startTime); }).slice(0, 8).map(function (item) {
      return '<button class="rank-item" data-action="sales-appointment-detail" data-id="' + S.escapeHtml(item.id) + '"><span>' + S.escapeHtml(item.startTime) + '</span><strong>' + S.escapeHtml(item.title) + '</strong><small>' + S.formatDate(item.date) + " · " + S.escapeHtml(TYPE_LABELS[item.type] || "Overig") + "</small></button>";
    }).join("");
    return '<section class="section panel"><div class="panel-head"><div><p class="eyebrow">Vooruitblik</p><h2>Eerstvolgende afspraken</h2></div></div>' + (rows ? '<div class="rank-list">' + rows + "</div>" : '<div class="empty-state">Geen komende afspraken.</div>') + "</section>";
  }

  function renderForm(appointment) {
    var item = baseAppointment(appointment);
    return [
      '<form class="panel" data-form="sales-appointment" data-id="' + S.escapeHtml(item.id || "") + '">',
      '<div class="panel-head"><div><p class="eyebrow">Salesagenda</p><h2>' + (item.id ? "Afspraak bewerken" : "Nieuwe afspraak") + '</h2></div><div class="button-row"><button class="ghost-button" type="button" data-action="sales-agenda">Annuleren</button><button class="primary-button" type="submit">Opslaan</button></div></div>',
      '<div class="field-grid">',
      field("Titel", "title", item.title, "text", true),
      '<label class="field">Type<select name="type">' + optionList(TYPE_LABELS, item.type) + "</select></label>",
      '<label class="field">Status<select name="status">' + optionList(STATUS_LABELS, item.status) + "</select></label>",
      field("Datum", "date", item.date, "date", true),
      field("Starttijd", "startTime", item.startTime, "time", true),
      field("Eindtijd", "endTime", item.endTime, "time", true),
      '<label class="field">Klant<select name="customerId">' + customerOptions(item.customerId) + "</select></label>",
      '<label class="field">Saleskans<select name="opportunityId">' + opportunityOptions(item.opportunityId) + "</select></label>",
      field("Contactpersoon", "contactName", item.contactName),
      field("Locatie / link", "location", item.location),
      '<label class="field full">Notities<textarea name="notes" rows="5">' + S.escapeHtml(item.notes) + "</textarea></label>",
      "</div></form>"
    ].join("");
  }

  function field(label, name, value, type, required) {
    return '<label class="field">' + label + '<input name="' + name + '" type="' + (type || "text") + '" value="' + S.escapeHtml(value || "") + '"' + (required ? " required" : "") + "></label>";
  }

  function renderDetail(id) {
    var item = S.getAll("salesAppointments").find(function (entry) { return entry.id === id; });
    if (!item) return render();
    var customer = S.getAll("customers").find(function (entry) { return entry.id === item.customerId; });
    var opportunity = S.getAll("salesOpportunities").find(function (entry) { return entry.id === item.opportunityId; });
    return '<section class="section panel"><div class="panel-head"><div><p class="eyebrow">' + S.escapeHtml(TYPE_LABELS[item.type] || "Afspraak") + '</p><h2>' + S.escapeHtml(item.title) + '</h2></div><span class="status-pill ' + (item.status === "afgerond" ? "ok" : item.status === "geannuleerd" ? "danger" : "") + '">' + S.escapeHtml(STATUS_LABELS[item.status]) + '</span></div><div class="detail-list">' + detail("Datum", S.formatDate(item.date)) + detail("Tijd", item.startTime + "–" + item.endTime) + detail("Klant", customer ? S.customerName(customer) : "-") + detail("Contact", item.contactName || "-") + detail("Locatie / link", item.location || "-") + detail("Saleskans", opportunity ? opportunity.title : "-") + '</div>' + (item.notes ? '<div class="notice" style="margin-top:16px;">' + S.escapeHtml(item.notes) + "</div>" : "") + '<div class="button-row" style="margin-top:16px;"><button class="primary-button" data-action="sales-appointment-complete" data-id="' + S.escapeHtml(item.id) + '">Markeer afgerond</button>' + (opportunity ? '<button class="ghost-button" data-action="sales-opportunity-detail" data-id="' + S.escapeHtml(opportunity.id) + '">Open saleskans</button>' : "") + '<button class="ghost-button" data-action="sales-appointment-edit" data-id="' + S.escapeHtml(item.id) + '">Bewerk</button><button class="danger-button" data-action="sales-appointment-delete" data-id="' + S.escapeHtml(item.id) + '">Verwijder</button></div></section>';
  }

  function detail(label, value) {
    return '<div><span>' + S.escapeHtml(label) + "</span><strong>" + S.escapeHtml(value) + "</strong></div>";
  }

  function saveFromForm(form) {
    var data = Object.fromEntries(new FormData(form).entries());
    if (form.dataset.id) data.id = form.dataset.id;
    if (data.endTime <= data.startTime) {
      C.app.toast("De eindtijd moet na de starttijd liggen.");
      return;
    }
    return S.upsert("salesAppointments", data).then(function (saved) {
      C.app.toast("Afspraak opgeslagen.");
      C.app.navigate("sales-appointment:" + saved.id);
    });
  }

  function complete(id) {
    var item = S.getAll("salesAppointments").find(function (entry) { return entry.id === id; });
    if (!item) return;
    return S.upsert("salesAppointments", Object.assign({}, item, { status: "afgerond" })).then(function () { C.app.toast("Afspraak afgerond."); C.app.render(); });
  }

  function remove(id) {
    return C.app.confirm({ title: "Afspraak verwijderen", message: "Deze afspraak wordt definitief verwijderd.", confirmLabel: "Afspraak verwijderen" }).then(function (confirmed) {
      if (!confirmed) return;
      return S.remove("salesAppointments", id).then(function () { C.app.toast("Afspraak verwijderd."); C.app.navigate("sales-agenda"); });
    });
  }

  C.salesAgenda = { render: render, renderForm: renderForm, renderDetail: renderDetail, saveFromForm: saveFromForm, complete: complete, remove: remove };
}());
