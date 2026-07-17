(function () {
  "use strict";

  var C = window.Climature = window.Climature || {};
  var S = C.storage;
  var state = { loaded: false, loading: false, data: { dashboard: {}, equipment: [], contracts: [], requests: [], visits: [] }, customerId: "" };

  function e(value) { return S.escapeHtml(String(value == null ? "" : value)); }
  function option(value, label, selected) { return '<option value="' + e(value) + '"' + (String(value) === String(selected || "") ? " selected" : "") + '>' + e(label) + '</option>'; }
  function options(items, selected) { return items.map(function (item) { return option(item[0], item[1], selected); }).join(""); }
  function customerName(customer) { return customer ? S.customerName(customer) : "Onbekende klant"; }
  function customerOptions(selected) { return '<option value="">Kies klant</option>' + S.getAll("customers").map(function (item) { return option(item.id, customerName(item), selected); }).join(""); }
  function equipmentOptions(customerId, selected) { return '<option value="">Geen specifiek apparaat</option>' + state.data.equipment.filter(function (item) { return !customerId || item.customerId === customerId; }).map(function (item) { return option(item.id, [item.brand, item.model, item.serialNumber].filter(Boolean).join(" · ") || item.type, selected); }).join(""); }
  function employeeOptions(selected) { return '<option value="">Nog niet toegewezen</option>' + (S.read("employeeDirectory", []) || []).map(function (item) { return option(item.id, item.displayName, selected); }).join(""); }
  function field(label, name, value, type, attrs) { return '<label class="field"><span>' + e(label) + '</span><input name="' + e(name) + '" type="' + e(type || "text") + '" value="' + e(value || "") + '"' + (attrs || "") + '></label>'; }
  function select(label, name, html) { return '<label class="field"><span>' + e(label) + '</span><select name="' + e(name) + '">' + html + '</select></label>'; }
  function textarea(label, name, value, rows) { return '<label class="field full"><span>' + e(label) + '</span><textarea name="' + e(name) + '" rows="' + (rows || 4) + '">' + e(value || "") + '</textarea></label>'; }
  function panelHead(eyebrow, title, actions) { return '<div class="panel-head"><div><p class="eyebrow">' + e(eyebrow) + '</p><h2>' + e(title) + '</h2></div><div class="button-row">' + (actions || "") + '</div></div>'; }
  function status(value) {
    var labels = { active: "Actief", paused: "Gepauzeerd", ended: "Beëindigd", open: "Open", planned: "Ingepland", in_progress: "Bezig", resolved: "Opgelost", cancelled: "Geannuleerd", scheduled: "Ingepland", completed: "Afgerond", inactive: "Inactief", replaced: "Vervangen" };
    return labels[value] || value || "-";
  }

  function queryCustomerId() { return new URLSearchParams((window.location.hash.split("?")[1] || "")).get("customerId") || ""; }
  function load(force) {
    var customerId = queryCustomerId();
    if (state.loading || (!force && state.loaded && state.customerId === customerId)) return Promise.resolve(state.data);
    state.loading = true; state.customerId = customerId;
    return S.request("/api/service/bootstrap" + (customerId ? "?customerId=" + encodeURIComponent(customerId) : "")).then(function (data) {
      state.data = Object.assign({ dashboard: {}, equipment: [], contracts: [], requests: [], visits: [] }, data || {});
      state.loaded = true; state.loading = false;
      if (C.app && C.app.render) C.app.render();
      return state.data;
    }).catch(function (error) { state.loading = false; if (C.app) C.app.toast(error.message); throw error; });
  }
  function refresh() { state.loaded = false; return load(true); }

  function renderLoading() { setTimeout(function () { load(false); }, 0); return '<section class="panel section"><div class="empty-state">Servicegegevens worden geladen…</div></section>'; }
  function metric(label, value) { return '<div class="metric-card"><span>' + e(label) + '</span><strong>' + e(value) + '</strong></div>'; }

  function render() {
    if (!state.loaded || state.customerId !== queryCustomerId()) return renderLoading();
    var d = state.data.dashboard || {};
    var installer = S.isInstaller(), manager = S.canManage("execution"), finance = S.hasRole("finance"), crm = S.hasRole("crm");
    var metrics = finance
      ? [metric("Actieve contracten", d.activeContracts || 0), metric("Contractwaarde/jaar", S.money(d.annualContractValue || 0))]
      : crm ? [metric("Apparaten", state.data.equipment.length), metric("Contracten", state.data.contracts.length), metric("Meldingen", state.data.requests.length), metric("Bezoeken", state.data.visits.length)]
        : [metric("Open meldingen", d.openRequests || 0), metric("Urgent", d.urgentRequests || 0), metric("Komende 30 dagen", d.upcomingVisits || 0), metric(installer ? "Mijn bezoeken" : "Contractwaarde/jaar", installer ? state.data.visits.length : S.money(d.annualContractValue || 0))];
    return [
      '<section class="portal-hero section"><p class="eyebrow">Service & onderhoud</p><h2>Nazorg onder controle</h2><p class="muted">Contracten, apparatuur, storingen, planning en digitale servicebonnen in één werkruimte.</p></section>',
      '<section class="section grid ' + (metrics.length === 2 ? "two" : "four") + '">', metrics.join(""), '</section>',
      manager ? '<section class="quick-actions section"><a href="#service-equipment-new">Apparaat toevoegen<span>Leg serienummer, garantie en onderhoud vast</span></a><a href="#service-contract-new">Servicecontract<span>Start terugkerend onderhoud</span></a><a href="#service-request-new">Servicemelding<span>Registreer storing of garantievraag</span></a><a href="#service-visit-new">Bezoek plannen<span>Plan een gekwalificeerde monteur</span></a></section>' : "",
      renderRequests(), renderVisits(), installer ? "" : renderContracts(), installer ? "" : renderEquipment()
    ].join("");
  }

  function renderRequests() {
    var rows = state.data.requests.map(function (item) {
      return '<tr><td><strong>' + e(item.requestNumber) + '</strong><br><span class="muted">' + e(item.title) + '</span></td><td>' + e(customerName(item.customer || S.getAll("customers").find(function (c) { return c.id === item.customerId; }))) + '</td><td><span class="status-pill ' + (item.priority === "urgent" ? "danger" : item.priority === "high" ? "warn" : "") + '">' + e(item.priority) + '</span></td><td>' + e(status(item.status)) + '</td><td>' + (S.canManage("execution") ? '<button class="small-button" data-action="service-request-edit" data-id="' + e(item.id) + '">Open</button>' : "") + '</td></tr>';
    }).join("");
    return '<section class="panel section">' + panelHead("Werkvoorraad", "Servicemeldingen", "") + (rows ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Melding</th><th>Klant</th><th>Prioriteit</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty-state">Geen open servicemeldingen.</div>') + '</section>';
  }
  function renderVisits() {
    var rows = state.data.visits.map(function (item) {
      var employee = item.assignedEmployee ? [item.assignedEmployee.firstName, item.assignedEmployee.lastName].join(" ") : "Niet toegewezen";
      return '<tr><td><strong>' + e(item.visitNumber) + '</strong><br><span class="muted">' + e(S.formatDate(item.plannedDate)) + ' · ' + e(item.startTime) + '</span></td><td>' + e(customerName(item.customer || S.getAll("customers").find(function (c) { return c.id === item.customerId; }))) + '</td><td>' + e(employee) + '</td><td>' + e(status(item.status)) + '</td><td><button class="small-button" data-action="service-visit-open" data-id="' + e(item.id) + '">Open werkbon</button></td></tr>';
    }).join("");
    return '<section class="panel section">' + panelHead("Planning", "Onderhoudsbezoeken", "") + (rows ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Bezoek</th><th>Klant</th><th>Monteur</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty-state">Geen onderhoudsbezoeken.</div>') + '</section>';
  }
  function renderContracts() {
    var rows = state.data.contracts.map(function (item) { return '<tr><td><strong>' + e(item.contractNumber) + '</strong><br><span class="muted">' + e(item.title) + '</span></td><td>' + e(customerName(item.customer || S.getAll("customers").find(function (c) { return c.id === item.customerId; }))) + '</td><td>' + (item.price == null ? "-" : e(S.money(item.price)) + ' / ' + e(item.billingPeriod)) + '</td><td>' + e(status(item.status)) + '</td><td>' + e(S.formatDate(item.nextMaintenanceDate)) + '</td><td>' + (S.canManage("execution") ? '<button class="small-button" data-action="service-contract-edit" data-id="' + e(item.id) + '">Bewerk</button>' : "") + '</td></tr>'; }).join("");
    return '<section class="panel section">' + panelHead("Terugkerende omzet", "Servicecontracten", S.canManage("execution") ? '<button class="small-button" data-action="service-reminders">Verstuur herinneringen</button>' : "") + (rows ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Contract</th><th>Klant</th><th>Prijs</th><th>Status</th><th>Volgend onderhoud</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty-state">Nog geen servicecontracten.</div>') + '</section>';
  }
  function renderEquipment() {
    var rows = state.data.equipment.map(function (item) { return '<tr><td><strong>' + e([item.brand, item.model].filter(Boolean).join(" ") || item.type) + '</strong><br><span class="muted">' + e(item.serialNumber || "Geen serienummer") + '</span></td><td>' + e(customerName(item.customer || S.getAll("customers").find(function (c) { return c.id === item.customerId; }))) + '</td><td>' + e(S.formatDate(item.warrantyUntil)) + '</td><td>' + e(S.formatDate(item.nextMaintenanceDate)) + '</td><td>' + (S.canManage("execution") ? '<button class="small-button" data-action="service-equipment-edit" data-id="' + e(item.id) + '">Bewerk</button>' : "") + '</td></tr>'; }).join("");
    return '<section class="panel section">' + panelHead("Installatiepark", "Apparatenregister", "") + (rows ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Apparaat</th><th>Klant</th><th>Garantie tot</th><th>Onderhoud</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty-state">Nog geen apparaten geregistreerd.</div>') + '</section>';
  }

  function formShell(kind, id, title, body) { return '<form class="panel section" data-form="service-' + kind + '" data-id="' + e(id || "") + '">' + panelHead("Service & onderhoud", title, '<button class="ghost-button" type="button" data-action="service-back">Annuleren</button><button class="primary-button" type="submit">Opslaan</button>') + '<div class="field-grid">' + body + '</div></form>'; }
  function equipmentForm(id) {
    if (!state.loaded) return renderLoading(); var item = state.data.equipment.find(function (x) { return x.id === id; }) || { customerId: queryCustomerId(), maintenanceIntervalMonths: 12, status: "active" };
    return formShell("equipment", id, id ? "Apparaat bewerken" : "Apparaat toevoegen", select("Klant", "customerId", customerOptions(item.customerId)) + field("Apparaattype", "type", item.type, "text", " required") + field("Merk", "brand", item.brand) + field("Model", "model", item.model) + field("Serienummer", "serialNumber", item.serialNumber) + field("Installatiedatum", "installedAt", item.installedAt, "date") + field("Garantie tot", "warrantyUntil", item.warrantyUntil, "date") + field("Onderhoudsinterval (maanden)", "maintenanceIntervalMonths", item.maintenanceIntervalMonths, "number", ' min="1" max="120"') + field("Laatste onderhoud", "lastMaintenanceDate", item.lastMaintenanceDate, "date") + field("Volgend onderhoud", "nextMaintenanceDate", item.nextMaintenanceDate, "date") + select("Status", "status", options([["active","Actief"],["inactive","Inactief"],["replaced","Vervangen"]], item.status)) + textarea("Notities", "notes", item.notes));
  }
  function contractForm(id) {
    if (!state.loaded) return renderLoading(); var item = state.data.contracts.find(function (x) { return x.id === id; }) || { customerId: queryCustomerId(), status: "active", billingPeriod: "yearly", maintenanceFrequency: 12, startDate: S.today() };
    return formShell("contract", id, id ? "Servicecontract bewerken" : "Servicecontract toevoegen", select("Klant", "customerId", customerOptions(item.customerId)) + select("Apparaat", "equipmentId", equipmentOptions(item.customerId, item.equipmentId)) + field("Titel", "title", item.title, "text", " required") + field("Startdatum", "startDate", item.startDate, "date", " required") + field("Einddatum", "endDate", item.endDate, "date") + field("Prijs excl. btw", "price", item.price, "number", ' min="0" step="0.01"') + select("Facturatie", "billingPeriod", options([["monthly","Maandelijks"],["quarterly","Per kwartaal"],["yearly","Jaarlijks"],["once","Eenmalig"]], item.billingPeriod)) + field("Onderhoud elke (maanden)", "maintenanceFrequency", item.maintenanceFrequency, "number", ' min="1" max="120"') + field("Volgend onderhoud", "nextMaintenanceDate", item.nextMaintenanceDate, "date") + select("Status", "status", options([["active","Actief"],["paused","Gepauzeerd"],["ended","Beëindigd"]], item.status)) + textarea("Notities", "notes", item.notes));
  }
  function requestForm(id) {
    if (!state.loaded) return renderLoading(); var item = state.data.requests.find(function (x) { return x.id === id; }) || { customerId: queryCustomerId(), type: "malfunction", priority: "normal", status: "open" };
    return formShell("request", id, id ? "Servicemelding bewerken" : "Servicemelding toevoegen", select("Klant", "customerId", customerOptions(item.customerId)) + select("Apparaat", "equipmentId", equipmentOptions(item.customerId, item.equipmentId)) + field("Titel", "title", item.title, "text", " required") + select("Type", "type", options([["malfunction","Storing"],["maintenance","Onderhoud"],["warranty","Garantie"],["question","Vraag"],["other","Overig"]], item.type)) + select("Prioriteit", "priority", options([["low","Laag"],["normal","Normaal"],["high","Hoog"],["urgent","Urgent"]], item.priority)) + field("Voorkeursdatum", "preferredDate", item.preferredDate, "date") + select("Monteur", "assignedEmployeeId", employeeOptions(item.assignedEmployeeId)) + select("Status", "status", options([["open","Open"],["planned","Ingepland"],["in_progress","Bezig"],["resolved","Opgelost"],["cancelled","Geannuleerd"]], item.status)) + textarea("Omschrijving", "description", item.description, 7));
  }
  function visitForm(id) {
    if (!state.loaded) return renderLoading(); var item = state.data.visits.find(function (x) { return x.id === id; }) || { customerId: queryCustomerId(), type: "maintenance", status: "scheduled", plannedDate: S.today(), startTime: "09:00", durationHours: 2, workType: "other" };
    return formShell("visit", id, id ? "Onderhoudsbezoek bewerken" : "Onderhoudsbezoek plannen", select("Klant", "customerId", customerOptions(item.customerId)) + select("Apparaat", "equipmentId", equipmentOptions(item.customerId, item.equipmentId)) + select("Contract", "contractId", '<option value="">Geen contract</option>' + state.data.contracts.filter(function (x) { return !item.customerId || x.customerId === item.customerId; }).map(function (x) { return option(x.id, x.contractNumber + " · " + x.title, item.contractId); }).join("")) + select("Servicemelding", "serviceRequestId", '<option value="">Geen melding</option>' + state.data.requests.filter(function (x) { return !item.customerId || x.customerId === item.customerId; }).map(function (x) { return option(x.id, x.requestNumber + " · " + x.title, item.serviceRequestId); }).join("")) + select("Type", "type", options([["maintenance","Onderhoud"],["malfunction","Storing"],["warranty","Garantie"],["inspection","Inspectie"],["other","Overig"]], item.type)) + select("Werksoort", "workType", options([["air_conditioning","Airconditioning"],["heat_pump","Warmtepomp"],["boiler","Cv-ketel"],["home_battery","Thuisbatterij"],["other","Overig"]], item.workType)) + field("Datum", "plannedDate", item.plannedDate, "date", " required") + field("Starttijd", "startTime", item.startTime, "time", " required") + field("Duur (uur)", "durationHours", item.durationHours, "number", ' min="0.5" max="24" step="0.5"') + select("Monteur", "assignedEmployeeId", employeeOptions(item.assignedEmployeeId)) + select("Status", "status", options([["scheduled","Ingepland"],["in_progress","Bezig"],["completed","Afgerond"],["cancelled","Geannuleerd"]], item.status)) + textarea("Notities", "notes", item.notes));
  }

  function visitDetail(id) {
    if (!state.loaded) return renderLoading(); var item = state.data.visits.find(function (x) { return x.id === id; }); if (!item) return '<section class="panel section"><div class="empty-state">Onderhoudsbezoek niet gevonden.</div></section>';
    var measurements = (item.measurements || []).map(function (x) { return [x.name, x.value, x.unit, x.note].filter(function (v) { return v !== ""; }).join(" | "); }).join("\n");
    var materials = (item.materialsUsed || []).map(function (x) { return [x.description, x.quantity, x.unit, x.priceExVat || 0].join(" | "); }).join("\n");
    var docs = (item.documents || []).map(function (x) { return '<a class="small-button" href="/api/service/documents/' + e(x.id) + '/download">' + e(x.fileName) + '</a>'; }).join("") || '<span class="muted">Nog geen foto’s of documenten.</span>';
    return '<form class="panel section" data-form="service-workorder" data-id="' + e(item.id) + '">' + panelHead("Digitale servicebon", item.visitNumber, '<button class="ghost-button" type="button" data-action="service-back">Terug</button>' + (S.canManage("execution") ? '<button class="ghost-button" type="button" data-action="service-confirmation" data-id="' + e(item.id) + '">Afspraak bevestigen</button>' : '') + ((!item.invoiceId && item.status === "completed" && !S.isInstaller()) ? '<button class="ghost-button" type="button" data-action="service-invoice" data-id="' + e(item.id) + '">Maak conceptfactuur</button>' : '') + '<button class="primary-button" type="submit">Werkbon opslaan</button>') + '<div class="notice">' + e(customerName(item.customer)) + ' · ' + e(S.formatDate(item.plannedDate)) + ' om ' + e(item.startTime) + ' · ' + e(status(item.status)) + '</div><div class="field-grid">' + select("Status", "status", options([["scheduled","Ingepland"],["in_progress","Bezig"],["completed","Afgerond"]], item.status)) + textarea("Diagnose", "diagnosis", item.diagnosis, 5) + textarea("Uitgevoerde werkzaamheden", "workPerformed", item.workPerformed, 7) + textarea("Materialen (omschrijving | aantal | eenheid | prijs excl.)", "materialsText", materials, 5) + textarea("Meetwaarden (naam | waarde | eenheid | notitie)", "measurementsText", measurements, 5) + field("Naam klant", "customerName", item.customerName) + textarea("Notities", "notes", item.notes, 4) + '<label class="field full"><span>Handtekening klant</span><canvas class="signature-pad" data-signature width="760" height="180" aria-label="Handtekeningveld"></canvas><input type="hidden" name="customerSignature" value="' + e(item.customerSignature || "") + '"><button class="small-button" type="button" data-action="service-signature-clear">Wis handtekening</button></label></div></form><section class="panel section">' + panelHead("Bijlagen", "Foto’s en documenten", "") + '<div class="button-row">' + docs + '</div><form class="document-upload" data-form="service-document" data-id="' + e(item.id) + '"><label class="field">PDF, JPG of PNG<input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required></label><button class="primary-button">Upload</button></form></section>';
  }

  function parseRows(value, kind) {
    return String(value || "").split("\n").map(function (line) { return line.trim(); }).filter(Boolean).map(function (line) { var p = line.split("|").map(function (x) { return x.trim(); }); return kind === "measurements" ? { name: p[0], value: Number(String(p[1] || "0").replace(",", ".")), unit: p[2] || "", note: p[3] || "" } : { description: p[0], quantity: Number(String(p[1] || "1").replace(",", ".")), unit: p[2] || "stuk", priceExVat: Number(String(p[3] || "0").replace(",", ".")) }; });
  }
  function submit(form) {
    if (form.dataset.form === "service-document") { var fd = new FormData(form); return S.request("/api/service/visits/" + encodeURIComponent(form.dataset.id) + "/documents", { method: "POST", body: fd }).then(function () { C.app.toast("Bijlage opgeslagen."); return refresh(); }); }
    var kind = form.dataset.form.replace("service-", ""), id = form.dataset.id, data = Object.fromEntries(new FormData(form).entries());
    if (kind === "workorder") { kind = "visit"; data.materialsUsed = parseRows(data.materialsText, "materials"); data.measurements = parseRows(data.measurementsText, "measurements"); delete data.materialsText; delete data.measurementsText; }
    var paths = { equipment: "equipment", contract: "contracts", request: "requests", visit: "visits" };
    return S.request("/api/service/" + paths[kind] + (id ? "/" + encodeURIComponent(id) : ""), { method: id ? "PUT" : "POST", body: JSON.stringify(data) }).then(function (payload) { C.app.toast("Servicegegevens opgeslagen."); return refresh().then(function () { C.app.navigate(kind === "visit" && payload.item ? "service-visit:" + payload.item.id : "service"); }); });
  }
  function action(target) {
    var action = target.dataset.action, id = target.dataset.id;
    if (action === "service-back") return C.app.navigate("service");
    if (action === "service-equipment-edit") return C.app.navigate("service-equipment-edit:" + id);
    if (action === "service-contract-edit") return C.app.navigate("service-contract-edit:" + id);
    if (action === "service-request-edit") return C.app.navigate("service-request-edit:" + id);
    if (action === "service-visit-open") return C.app.navigate("service-visit:" + id);
    if (action === "service-signature-clear") { var canvas = document.querySelector("[data-signature]"); if (canvas) { canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height); canvas.dataset.dirty = "true"; } return; }
    if (action === "service-invoice") return S.request("/api/service/visits/" + encodeURIComponent(id) + "/invoice", { method: "POST", body: "{}" }).then(function (payload) { C.app.toast("Conceptfactuur aangemaakt."); return Promise.all([refresh(), S.refresh()]).then(function () { C.app.navigate("invoice:" + payload.item.id); }); });
    if (action === "service-confirmation") return S.request("/api/service/visits/" + encodeURIComponent(id) + "/confirmation", { method: "POST", body: "{}" }).then(function (payload) { C.app.toast(payload.status === "duplicate" ? "Afspraakbevestiging was al verstuurd." : "Afspraakbevestiging verstuurd."); });
    if (action === "service-reminders") return S.request("/api/service/reminders/run", { method: "POST", body: "{}" }).then(function (payload) { var sent = (payload.items || []).filter(function (x) { return x.status === "sent"; }).length; C.app.toast(sent + " onderhoudsherinneringen verstuurd."); });
  }
  function afterRender() {
    var canvas = document.querySelector("[data-signature]"); if (!canvas || canvas.dataset.ready) return; canvas.dataset.ready = "true";
    var ctx = canvas.getContext("2d"), hidden = canvas.parentNode.querySelector('input[name="customerSignature"]'); ctx.lineWidth = 2; ctx.lineCap = "round";
    if (hidden.value) { var image = new Image(); image.onload = function () { ctx.drawImage(image, 0, 0, canvas.width, canvas.height); }; image.src = hidden.value; }
    var drawing = false; function point(event) { var rect = canvas.getBoundingClientRect(), source = event.touches ? event.touches[0] : event; return { x: (source.clientX - rect.left) * canvas.width / rect.width, y: (source.clientY - rect.top) * canvas.height / rect.height }; }
    function start(event) { drawing = true; var p = point(event); ctx.beginPath(); ctx.moveTo(p.x, p.y); window.addEventListener("pointerup", stop, { once: true }); event.preventDefault(); }
    function move(event) { if (!drawing) return; var p = point(event); ctx.lineTo(p.x, p.y); ctx.stroke(); canvas.dataset.dirty = "true"; hidden.value = canvas.toDataURL("image/png"); event.preventDefault(); }
    function stop() { drawing = false; }
    canvas.addEventListener("pointerdown", start); canvas.addEventListener("pointermove", move);
  }

  C.service = { render: render, equipmentForm: equipmentForm, contractForm: contractForm, requestForm: requestForm, visitForm: visitForm, visitDetail: visitDetail, submit: submit, action: action, afterRender: afterRender, refresh: refresh };
}());
