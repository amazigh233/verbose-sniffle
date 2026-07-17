(function () {
  "use strict";

  var C = window.Climature = window.Climature || {};
  var S = C.storage;
  var state = { project: null, availability: [], items: [], customerId: "" };

  function e(value) { return S.escapeHtml(value == null ? "" : value); }
  function date(value) { return S.formatDate(value || ""); }
  function workType(value) { return ({ air_conditioning: "Airconditioning", heat_pump: "Warmtepomp", boiler: "Cv-ketel", home_battery: "Thuisbatterij", other: "Overig" })[value] || value; }
  function projectStatus(value) { return ({ preparation: "Voorbereiding", ready: "Gereed", in_progress: "In uitvoering", completed: "Afgerond", cancelled: "Geannuleerd" })[value] || value; }
  function materialStatus(value) { return ({ to_determine: "Te bepalen", to_order: "Bestellen", ordered: "Besteld", confirmed: "Bevestigd", partial: "Deels ontvangen", delivered: "Binnen", cancelled: "Geannuleerd" })[value] || value; }
  function tone(level) { return level === "green" ? "ok" : level === "red" ? "danger" : "warn"; }
  function options(items, selected) { return items.map(function (item) { return '<option value="' + e(item[0]) + '"' + (String(item[0]) === String(selected) ? " selected" : "") + '>' + e(item[1]) + '</option>'; }).join(""); }
  function field(label, name, value, type, extra) { return '<label class="field">' + e(label) + '<input name="' + e(name) + '" type="' + (type || "text") + '" value="' + e(value == null ? "" : value) + '"' + (extra || "") + '></label>'; }
  function loading(title) { return '<section class="section panel"><div class="panel-head"><div><p class="eyebrow">Projectcockpit</p><h2>' + e(title) + '</h2></div></div><div class="empty-state">Projectgegevens worden veilig geladen…</div></section>'; }
  function schedule(callback) { window.setTimeout(callback, 0); }
  function app() { return document.getElementById("app"); }

  function renderList(customerId) {
    state.customerId = customerId || "";
    schedule(function () { loadList().catch(showError); });
    return loading(customerId ? "Klantprojecten" : "Alle projecten");
  }

  function loadList() {
    var query = state.customerId ? "?customerId=" + encodeURIComponent(state.customerId) : "";
    return Promise.all([S.request("/api/projects" + query), S.canManage("execution") ? S.request("/api/projects/actions?window=all") : Promise.resolve({ items: [] })]).then(function (results) {
      state.items = results[0].items || [];
      app().innerHTML = listHtml(state.items, results[1].items || []);
    });
  }

  function listHtml(items, actions) {
    var rows = items.length ? items.map(function (project) {
      return '<tr data-project-open="' + e(project.id) + '"><td><strong>' + e(project.projectNumber) + '</strong><br><span class="muted">' + e(project.title) + '</span></td><td>' + e(project.customer.displayName || project.customer.companyName || [project.customer.firstName, project.customer.lastName].filter(Boolean).join(" ")) + '</td><td>' + e(workType(project.workType)) + '</td><td>' + date(project.plannedDate) + ' ' + e(project.startTime) + '</td><td><span class="status-pill ' + tone(project.readiness.level) + '">' + e(project.readiness.level === "green" ? "Op schema" : project.readiness.level === "red" ? "Actie nodig" : "Let op") + '</span></td><td><button class="small-button" data-action="project-open" data-id="' + e(project.id) + '">Open</button></td></tr>';
    }).join("") : '<tr><td colspan="6"><div class="empty-state">Nog geen projecten.</div></td></tr>';
    return [
      actionCenterHtml(actions, true),
      '<section class="section panel"><div class="panel-head"><div><p class="eyebrow">Interne werkvoorbereiding</p><h2>' + (state.customerId ? "Projecten voor deze klant" : "Projectcockpits") + '</h2></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Project</th><th>Klant</th><th>Werksoort</th><th>Installatie</th><th>Gereedheid</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></section>',
      S.canManage("execution") && state.customerId ? createProjectForm(state.customerId) : ""
    ].join("");
  }

  function createProjectForm(customerId) {
    return '<form class="section panel" data-form="project-create"><div class="panel-head"><div><p class="eyebrow">Handmatig</p><h2>Nieuw project zonder installatie</h2></div><button class="primary-button">Project maken</button></div><input type="hidden" name="customerId" value="' + e(customerId) + '"><div class="field-grid">' + field("Projecttitel", "title", "") + '<label class="field">Werksoort<select name="workType">' + options([["home_battery","Thuisbatterij"],["heat_pump","Warmtepomp"],["air_conditioning","Airconditioning"],["boiler","Cv-ketel"],["other","Overig"]], "other") + '</select></label>' + field("Installatiedatum", "plannedDate", S.addDays(S.today(), 28), "date", " required") + field("Starttijd", "startTime", "09:00", "time") + field("Duur", "durationHours", "4", "number", ' min="0.5" max="24" step="0.5"') + '</div></form>';
  }

  function actionCenterHtml(items, full) {
    if (!S.canManage("execution")) return "";
    var rows = actionRows(items, full);
    return '<section class="section panel project-actions"><div class="panel-head"><div><p class="eyebrow">Werkvoorraad</p><h2>Actiecentrum</h2></div>' + (full ? '<div class="button-row"><select data-project-action-filter="window">' + options([["all","Alles"],["overdue","Achterstallig"],["today","Vandaag"],["7","Komende 7 dagen"],["30","Komende 30 dagen"]],"all") + '</select><select data-project-action-filter="category">' + options([["all","Alle categorieën"],["materials","Materiaal"],["planning","Planning"],["administration","Administratie"],["preparation","Voorbereiding"]],"all") + '</select><button data-action="project-actions-filter">Filter</button></div>' : '<a class="small-button" href="#projects">Alles bekijken</a>') + '</div><div class="action-list" data-project-actions>' + rows + '</div></section>';
  }

  function actionRows(items, full) {
    return items.length ? items.slice(0, full ? 100 : 8).map(function (item) { return '<div class="action-item"><div><span class="status-pill ' + tone(item.severity) + '">' + e(item.category) + '</span><strong>' + e(item.title) + '</strong><small>' + e(item.customerName + " · " + date(item.dueDate) + " · " + item.projectNumber) + '</small></div><button class="small-button" data-action="project-open" data-id="' + e(item.projectId) + '">Open</button></div>'; }).join("") : '<div class="empty-state">Alle projecten liggen op schema.</div>';
  }

  function loadActionCenter() {
    var target = document.querySelector("[data-project-dashboard-actions]");
    if (!target || !S.canManage("execution")) return;
    S.request("/api/projects/actions?window=all").then(function (payload) { target.outerHTML = actionCenterHtml(payload.items || [], false); }).catch(function () { target.innerHTML = '<div class="empty-state">Projectacties konden niet worden geladen.</div>'; });
  }

  function renderDetail(id) {
    schedule(function () { loadDetail(id).catch(showError); });
    return loading("Project laden");
  }

  function loadDetail(id) {
    var projectRequest = S.request("/api/projects/" + encodeURIComponent(id));
    return projectRequest.then(function (payload) {
      state.project = payload.item;
      var availability = S.canManage("execution") ? S.request("/api/employee-availability?" + new URLSearchParams({ date: state.project.plannedDate, startTime: state.project.startTime, durationHours: state.project.durationHours, travelBufferMinutes: state.project.travelBufferMinutes, workType: state.project.workType, excludeInstallationId: state.project.installation && state.project.installation.id || "" })) : Promise.resolve({ items: [] });
      return availability;
    }).then(function (payload) { state.availability = payload.items || []; app().innerHTML = detailHtml(state.project); });
  }

  function readinessHtml(project) {
    var warnings = project.readiness.warnings || [];
    return '<div class="project-readiness ' + tone(project.readiness.level) + '"><div><span>Projectgereedheid</span><strong>' + e(project.readiness.level === "green" ? "Op schema" : project.readiness.level === "red" ? "Directe actie nodig" : "Aandacht nodig") + '</strong></div><span class="project-score">' + warnings.length + ' actie(s)</span></div>' + (warnings.length ? '<div class="project-warning-grid">' + warnings.map(function (warning) { return '<article><span class="status-pill ' + tone(warning.severity) + '">' + e(warning.category) + '</span><strong>' + e(warning.title) + '</strong><small>Deadline ' + date(warning.dueDate) + '</small></article>'; }).join("") + '</div>' : "");
  }

  function detailHtml(project) {
    return [
      '<section class="section panel"><div class="panel-head"><div><p class="eyebrow">' + e(project.projectNumber) + '</p><h2>' + e(project.title) + '</h2><p class="muted">' + e(workType(project.workType)) + ' · ' + date(project.plannedDate) + ' om ' + e(project.startTime) + '</p></div><div class="button-row">' + (S.hasRole("admin", "installer") ? '<button data-action="customer-detail" data-id="' + e(project.customer.id) + '">Klantdossier</button>' : "") + (project.installation ? '<button data-action="installation-detail" data-id="' + e(project.installation.id) + '">Installatie</button>' : "") + '</div></div>' + readinessHtml(project) + '</section>',
      S.canManage("execution") ? projectForm(project) : "",
      '<section class="section grid two"><div class="panel">' + tasksHtml(project) + '</div><div class="panel">' + teamHtml(project) + '</div></section>',
      '<section class="section panel">' + materialsHtml(project) + '</section>',
      '<section class="section grid two"><div class="panel">' + equipmentHtml(project) + '</div><div class="panel">' + auditHtml(project) + '</div></section>'
    ].join("");
  }

  function projectForm(project) {
    return '<form class="section panel" data-form="project-update" data-id="' + e(project.id) + '"><div class="panel-head"><div><p class="eyebrow">Projectinstellingen</p><h2>Planning en status</h2></div><button class="primary-button">Opslaan</button></div><div class="field-grid">' + field("Titel", "title", project.title, "text", " required") + '<label class="field">Status<select name="status">' + options([["preparation","Voorbereiding"],["ready","Gereed"],["in_progress","In uitvoering"],["completed","Afgerond"],["cancelled","Geannuleerd"]], project.status) + '</select></label>' + field("Installatiedatum", "plannedDate", project.plannedDate, "date", " required") + field("Starttijd", "startTime", project.startTime, "time", " required") + field("Duur in uren", "durationHours", project.durationHours, "number", ' min="0.5" max="24" step="0.5"') + field("Planningsbuffer in minuten", "travelBufferMinutes", project.travelBufferMinutes, "number", ' min="0" max="240"') + '<label class="field full">Interne projectnotities<textarea name="internalNotes" rows="4">' + e(project.internalNotes || "") + '</textarea></label></div></form>';
  }

  function tasksHtml(project) {
    var rows = project.tasks.length ? project.tasks.map(function (task) {
      if (!S.canManage("execution")) return '<form class="project-row" data-form="project-task" data-project="' + project.id + '" data-id="' + task.id + '"><div><strong>' + e(task.title) + '</strong><small>' + date(task.dueDate) + '</small></div><select name="status">' + options([["open","Open"],["completed","Afgerond"],["not_applicable","Niet van toepassing"]], task.status) + '</select><button>Bijwerken</button></form>';
      return '<form class="project-row task" data-form="project-task" data-project="' + project.id + '" data-id="' + task.id + '"><div><strong>' + e(task.title) + '</strong><small>' + e(task.category) + '</small></div>' + field("Deadline", "dueDate", task.dueDate, "date") + '<input type="hidden" name="title" value="' + e(task.title) + '"><input type="hidden" name="category" value="' + e(task.category) + '"><input type="hidden" name="description" value="' + e(task.description) + '"><input type="hidden" name="dueOffsetDays" value="' + e(task.dueOffsetDays) + '"><input type="hidden" name="required" value="' + e(task.required) + '"><input type="hidden" name="operational" value="' + e(task.operational) + '"><label class="field">Deadlinebeleid<select name="automaticDate">' + options([["true","Automatisch"],["false","Handmatig vergrendeld"]], String(task.automaticDate)) + '</select></label><label class="field">Status<select name="status">' + options([["open","Open"],["completed","Afgerond"],["not_applicable","N.v.t."]], task.status) + '</select></label><button>Opslaan</button></form>';
    }).join("") : '<div class="empty-state">Geen taken.</div>';
    return '<div class="panel-head"><div><p class="eyebrow">Voorbereiding</p><h2>Taken</h2></div></div><div class="project-list">' + rows + '</div>' + (S.canManage("execution") ? '<form class="project-add" data-form="project-task" data-project="' + project.id + '"><h3>Taak toevoegen</h3><div class="field-grid">' + field("Taak", "title", "", "text", " required") + field("Categorie", "category", "preparation") + field("Deadline", "dueDate", project.plannedDate, "date", " required") + field("Offset in dagen", "dueOffsetDays", "-7", "number") + '</div><input type="hidden" name="automaticDate" value="false"><input type="hidden" name="required" value="true"><input type="hidden" name="operational" value="true"><input type="hidden" name="status" value="open"><button>Toevoegen</button></form>' : "");
  }

  function materialsHtml(project) {
    var rows = project.materials.length ? project.materials.map(function (material) {
      if (!S.canManage("execution")) return '<tr><td><strong>' + e(material.name) + '</strong><br><span class="muted">' + e(material.quantity + " " + material.unit) + '</span></td><td>' + date(material.neededOnDate) + '</td><td>' + e(materialStatus(material.status)) + '</td></tr>';
      return '<tr><td><strong>' + e(material.name) + '</strong><br><span class="muted">' + e(material.sku || "Geen artikelnummer") + '</span></td><td>' + e(material.quantity + " " + material.unit) + '</td><td>' + e(material.supplier || "-") + '</td><td>' + date(material.orderByDate) + '<br><span class="muted">nodig ' + date(material.neededOnDate) + '</span></td><td>' + (material.expectedDeliveryDate ? date(material.expectedDeliveryDate) : "-") + '</td><td><span class="status-pill ' + (material.status === "delivered" ? "ok" : material.orderByDate <= S.today() ? "danger" : "warn") + '">' + e(materialStatus(material.status)) + '</span></td><td><button class="small-button" data-action="project-material-edit" data-id="' + material.id + '">Bewerk</button><button class="small-button" data-action="project-material-delete" data-id="' + material.id + '">Verwijder</button></td></tr>';
    }).join("") : '<tr><td colspan="7"><div class="empty-state">Geen materialen.</div></td></tr>';
    return '<div class="panel-head"><div><p class="eyebrow">Inkoop</p><h2>Materialen en besteldatums</h2></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Onderdeel</th><th>Aantal</th>' + (S.canManage("execution") ? '<th>Leverancier</th><th>Uiterlijk bestellen</th><th>Verwachte levering</th>' : '<th>Nodig op</th>') + '<th>Status</th>' + (S.canManage("execution") ? '<th></th>' : "") + '</tr></thead><tbody>' + rows + '</tbody></table></div><div data-material-editor>' + (S.canManage("execution") ? materialForm(project, null) : "") + '</div>';
  }

  function materialForm(project, material) {
    material = material || { automaticDates: true, leadTimeDays: 14, safetyMarginDays: 3, neededOffsetDays: 0, quantity: 1, unit: "stuk", status: "to_determine" };
    return '<form class="project-add" data-form="project-material" data-project="' + project.id + '" data-id="' + e(material.id || "") + '"><h3>' + (material.id ? "Onderdeel bewerken" : "Onderdeel toevoegen") + '</h3><div class="field-grid">' + field("Onderdeel", "name", material.name, "text", " required") + field("Artikelnummer", "sku", material.sku) + field("Aantal", "quantity", material.quantity, "number", ' min="0.01" step="0.01"') + field("Eenheid", "unit", material.unit) + field("Leverancier", "supplier", material.supplier) + field("Inkoopprijs", "purchasePrice", material.purchasePrice, "number", ' min="0" step="0.01"') + field("Levertijd dagen", "leadTimeDays", material.leadTimeDays, "number", ' min="0" max="365"') + field("Veiligheidsmarge", "safetyMarginDays", material.safetyMarginDays, "number", ' min="0" max="90"') + field("Benodigd-offset", "neededOffsetDays", material.neededOffsetDays, "number", ' min="-365" max="365"') + field("Verwachte levering", "expectedDeliveryDate", material.expectedDeliveryDate, "date") + '<label class="field">Status<select name="status">' + options([["to_determine","Te bepalen"],["to_order","Bestellen"],["ordered","Besteld"],["confirmed","Bevestigd"],["partial","Deels ontvangen"],["delivered","Binnen"],["cancelled","Geannuleerd"]], material.status) + '</select></label><label class="field">Datums<select name="automaticDates">' + options([["true","Automatisch terugrekenen"],["false","Handmatig vergrendeld"]], String(material.automaticDates)) + '</select></label>' + field("Benodigd op (handmatig)", "neededOnDate", material.neededOnDate, "date") + field("Uiterlijk bestellen (handmatig)", "orderByDate", material.orderByDate, "date") + '</div><button class="primary-button">Opslaan</button></form>';
  }

  function teamHtml(project) {
    var members = project.members.length ? project.members.map(function (member) { return '<div class="project-row"><div><strong>' + e(member.displayName) + '</strong><small>' + e(member.role + " · " + (member.jobTitle || "")) + '</small></div>' + (S.canManage("execution") ? '<button data-action="project-member-delete" data-id="' + member.id + '">Verwijder</button>' : "") + '</div>'; }).join("") : '<div class="empty-state">Geen monteurs toegewezen.</div>';
    var directory = state.availability.map(function (employee) { var label = employee.displayName + (employee.available ? " · ✓ beschikbaar" : " · ⚠ " + employee.reasons.map(reasonLabel).join(", ")); return [employee.id, label]; });
    return '<div class="panel-head"><div><p class="eyebrow">Capaciteit</p><h2>Projectteam</h2></div></div><div class="project-list">' + members + '</div>' + (S.canManage("execution") ? '<form class="project-add" data-form="project-member" data-project="' + project.id + '"><label class="field">Werknemer<select name="employeeId"><option value="">Kies monteur</option>' + options(directory, "") + '</select></label><label class="field">Rol<select name="role">' + options([["lead_installer","Hoofdmonteur"],["assistant","Assistent"],["project_owner","Projectverantwoordelijke"]],"assistant") + '</select></label><button>Toevoegen</button></form>' : "");
  }
  function reasonLabel(value) { return ({ inactive: "niet actief", outside_schedule: "buiten rooster", absent: "afwezig", overlap: "dubbel gepland", qualification: "certificaat ontbreekt" })[value] || value; }

  function equipmentHtml(project) {
    var items = project.equipment.length ? project.equipment.map(function (item) { return '<article class="equipment-card"><strong>' + e([item.brand, item.model].filter(Boolean).join(" ") || item.type) + '</strong><span>Serienummer: ' + e(item.serialNumber || "-") + '</span><span>Garantie: ' + date(item.warrantyUntil) + '</span><span class="status-pill">' + e(item.connectionStatus) + '</span></article>'; }).join("") : '<div class="empty-state">Nog geen apparatuur geregistreerd.</div>';
    return '<div class="panel-head"><div><p class="eyebrow">Oplevering</p><h2>Apparaatregister</h2></div></div><div class="equipment-grid">' + items + '</div><form class="project-add" data-form="project-equipment" data-project="' + project.id + '"><h3>Apparaat registreren</h3><div class="field-grid">' + field("Type", "type", project.workType === "home_battery" ? "battery" : "installation", "text", " required") + field("Merk", "brand", "") + field("Model", "model", "") + field("Serienummer", "serialNumber", "") + field("Geïnstalleerd op", "installedAt", project.plannedDate, "date") + field("Garantie tot", "warrantyUntil", "", "date") + (S.canManage("execution") ? field("Providercode", "providerCode", "") + field("Externe apparaat-ID", "externalDeviceId", "") + '<input type="hidden" name="connectionStatus" value="not_connected">' : "") + '</div><button>Registreren</button></form>';
  }

  function auditHtml(project) {
    if (!S.canManage("execution")) return '<div class="panel-head"><div><p class="eyebrow">Veilig</p><h2>Interne projectcockpit</h2></div></div><p class="muted">U ziet alleen operationele informatie voor projecten waaraan u bent toegewezen.</p>';
    var rows = (project.audit || []).length ? project.audit.map(function (item) { return '<div class="timeline-item"><strong>' + e(item.action) + '</strong><span>' + e(item.actor) + ' · ' + new Date(item.createdAt).toLocaleString("nl-NL") + '</span></div>'; }).join("") : '<div class="empty-state">Nog geen auditregels.</div>';
    return '<div class="panel-head"><div><p class="eyebrow">Historie</p><h2>Projectaudit</h2></div></div><div class="timeline">' + rows + '</div>';
  }

  function submit(form) {
    var data = Object.fromEntries(new FormData(form).entries()), projectId = form.dataset.project || form.dataset.id, id = form.dataset.id;
    var request;
    if (form.dataset.form === "project-create") request = S.request("/api/projects", { method: "POST", body: JSON.stringify(data) }).then(function (payload) { C.app.navigate("project:" + payload.item.id); });
    if (form.dataset.form === "project-update") {
      if (state.project.readiness.level === "red") {
        if (!window.confirm("Dit project heeft kritieke waarschuwingen. Wijziging toch opslaan?")) return Promise.resolve();
        data.warningOverrideReason = window.prompt("Leg kort vast waarom u ondanks de waarschuwing doorgaat:", "Planning bewust bevestigd") || "";
        if (!data.warningOverrideReason.trim()) return Promise.reject(new Error("Een auditreden is verplicht bij kritieke waarschuwingen."));
      }
      request = S.request("/api/projects/" + id, { method: "PUT", body: JSON.stringify(data) });
    }
    if (form.dataset.form === "project-material") request = S.request("/api/projects/" + projectId + "/materials" + (id ? "/" + id : ""), { method: id ? "PUT" : "POST", body: JSON.stringify(data) });
    if (form.dataset.form === "project-task") request = S.request("/api/projects/" + projectId + "/tasks" + (id ? "/" + id : ""), { method: id ? "PUT" : "POST", body: JSON.stringify(data) });
    if (form.dataset.form === "project-member") request = S.request("/api/projects/" + projectId + "/team", { method: "POST", body: JSON.stringify(data) });
    if (form.dataset.form === "project-equipment") request = S.request("/api/projects/" + projectId + "/equipment", { method: "POST", body: JSON.stringify(data) });
    return Promise.resolve(request).then(function () { if (projectId && form.dataset.form !== "project-create") return loadDetail(projectId); }).then(function () { C.app.toast("Project bijgewerkt."); });
  }

  function handleAction(target) {
    var action = target.dataset.action;
    if (action === "project-open") return C.app.navigate("project:" + target.dataset.id);
    if (action === "project-actions-filter") { var query = {}; document.querySelectorAll("[data-project-action-filter]").forEach(function (input) { query[input.dataset.projectActionFilter] = input.value; }); return S.request("/api/projects/actions?" + new URLSearchParams(query)).then(function (payload) { document.querySelector("[data-project-actions]").innerHTML = actionRows(payload.items || [], true); }); }
    if (action === "project-material-edit") { var material = state.project.materials.find(function (item) { return item.id === target.dataset.id; }); document.querySelector("[data-material-editor]").innerHTML = materialForm(state.project, material); return; }
    if (action === "project-material-delete") { if (!window.confirm("Onderdeel verwijderen?")) return; return S.request("/api/projects/" + state.project.id + "/materials/" + target.dataset.id, { method: "DELETE" }).then(function () { return loadDetail(state.project.id); }); }
    if (action === "project-member-delete") { if (!window.confirm("Projectlid verwijderen?")) return; return S.request("/api/projects/" + state.project.id + "/team/" + target.dataset.id, { method: "DELETE" }).then(function () { return loadDetail(state.project.id); }); }
  }

  function showError(error) { if (app()) app().innerHTML = '<section class="section panel"><div class="notice danger"><strong>Project kon niet worden geladen.</strong><br>' + e(error.message) + '</div></section>'; }

  C.projects = { renderList: renderList, renderDetail: renderDetail, loadActionCenter: loadActionCenter, submit: submit, handleAction: handleAction };
}());
