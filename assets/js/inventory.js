(function () {
  "use strict";

  var C = window.Climature = window.Climature || {};
  var S = C.storage;
  var state = { items: [], movements: [], stats: {}, search: "", loaded: false };

  function load(current) {
    var query = new URLSearchParams(String(current || "").split("?")[1] || "");
    state.search = query.get("search") || "";
    return S.request("/api/inventory" + (state.search ? "?search=" + encodeURIComponent(state.search) : "")).then(function (payload) {
      state.items = payload.items || [];
      state.movements = payload.movements || [];
      state.stats = payload.stats || {};
      state.loaded = true;
      return state;
    });
  }

  function quantity(value) {
    return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(Number(value || 0));
  }

  function stockStatus(item) {
    var current = Number(item.stockQuantity || 0), minimum = Number(item.minimumStock || 0);
    if (current <= 0) return '<span class="status-pill danger">Niet op voorraad</span>';
    if (minimum > 0 && current <= minimum) return '<span class="status-pill warn">Bijbestellen</span>';
    return '<span class="status-pill ok">Op voorraad</span>';
  }

  function renderImport() {
    if (!S.isAdmin()) return "";
    return [
      '<section class="panel section inventory-import">',
      '<div class="panel-head"><div><p class="eyebrow">Excel-import</p><h2>Voorraad toevoegen of bijwerken</h2></div><a class="ghost-button" href="/api/inventory/template" download>Download Excel-sjabloon</a></div>',
      '<p class="panel-note">Gebruik een <strong>.xlsx</strong>-bestand. Bestaande producten worden herkend aan het artikelnummer; nieuwe artikelnummers worden als product toegevoegd.</p>',
      '<details><summary>Benodigde Excel-kolommen bekijken</summary><p class="muted">Verplicht: Artikelnummer, Categorie, Merk, Naam, Prijs excl. btw en Voorraad. Optioneel: BTW, Specificaties, Omschrijving, Minimumvoorraad, Eenheid en Locatie.</p></details>',
      '<form class="document-upload" data-form="inventory-import" enctype="multipart/form-data">',
      '<label class="field">Excel-bestand<input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required></label>',
      '<button class="primary-button" type="submit">Importeren uit Excel</button>',
      '</form>',
      '<div class="inventory-import-errors" data-import-errors role="alert" hidden></div>',
      '<p class="muted">Maximaal 2.000 productregels en 8 MB per import. Bij een fout wordt niets uit het bestand opgeslagen.</p>',
      '</section>'
    ].join("");
  }

  function renderMovements() {
    if (!state.movements.length) return "";
    var rows = state.movements.map(function (movement) {
      var product = movement.product || {};
      var delta = Number(movement.delta || 0);
      return '<tr><td><strong>' + S.escapeHtml(product.sku || "—") + '</strong><br><span class="muted">' + S.escapeHtml([product.brand, product.name].filter(Boolean).join(" ")) + '</span></td><td>' + S.escapeHtml(new Date(movement.createdAt).toLocaleString("nl-NL")) + '</td><td><strong class="' + (delta < 0 ? "inventory-negative" : "inventory-positive") + '">' + (delta > 0 ? "+" : "") + quantity(delta) + ' ' + S.escapeHtml(product.stockUnit || "stuk") + '</strong></td><td>' + S.escapeHtml(movement.reason || "Voorraadwijziging") + '<br><span class="muted">' + S.escapeHtml(movement.createdBy && movement.createdBy.username || "Systeem") + '</span></td></tr>';
    }).join("");
    return '<section class="panel section"><div class="panel-head"><div><p class="eyebrow">Controle</p><h2>Recente voorraadmutaties</h2></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Product</th><th>Moment</th><th>Mutatie</th><th>Reden</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
  }

  function render() {
    var canAdjust = S.hasRole("admin", "execution");
    var rows = state.items.map(function (item) {
      return '<tr><td><strong>' + S.escapeHtml(item.sku || "Geen artikelnummer") + '</strong></td><td><strong>' + S.escapeHtml([item.brand, item.name].filter(Boolean).join(" ")) + '</strong><br><span class="muted">' + S.escapeHtml(item.category || "") + '</span></td><td>' + stockStatus(item) + '</td><td><strong>' + quantity(item.stockQuantity) + ' ' + S.escapeHtml(item.stockUnit || "stuk") + '</strong><br><span class="muted">Minimum: ' + quantity(item.minimumStock) + '</span></td><td>' + S.escapeHtml(item.stockLocation || "—") + '</td><td>' + (canAdjust ? '<button class="small-button" data-action="inventory-edit" data-id="' + S.escapeHtml(item.id) + '">Aanpassen</button>' : "") + '</td></tr>';
    }).join("");
    return [
      '<section class="mini-metrics inventory-metrics section">',
      '<div><span>Producten</span><strong>' + quantity(state.stats.productCount) + '</strong></div>',
      '<div><span>Totale voorraad</span><strong>' + quantity(state.stats.totalQuantity) + '</strong></div>',
      '<div><span>Bijbestellen</span><strong>' + quantity(state.stats.lowStockCount) + '</strong></div>',
      '<div><span>Niet op voorraad</span><strong>' + quantity(state.stats.outOfStockCount) + '</strong></div>',
      '</section>',
      renderImport(),
      '<section class="panel section"><div class="panel-head"><div><p class="eyebrow">Magazijn</p><h2>Actuele voorraad</h2></div><input class="search-input" type="search" data-action="inventory-search" value="' + S.escapeHtml(state.search) + '" placeholder="Zoek op artikelnummer, product of locatie" aria-label="Voorraad zoeken"></div>',
      rows ? '<div class="table-wrap"><table class="data-table inventory-table"><thead><tr><th>Artikelnummer</th><th>Product</th><th>Status</th><th>Voorraad</th><th>Locatie</th><th>Actie</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty-state">Geen voorraadartikelen gevonden.</div>',
      '</section>',
      renderMovements()
    ].join("");
  }

  function renderEdit(id) {
    var item = state.items.find(function (candidate) { return candidate.id === id; });
    if (!item) return '<section class="panel"><div class="empty-state">Product niet gevonden.</div></section>';
    return [
      '<form class="panel" data-form="inventory-adjust" data-id="' + S.escapeHtml(item.id) + '">',
      '<div class="panel-head"><div><p class="eyebrow">Voorraadcorrectie</p><h2>' + S.escapeHtml([item.brand, item.name].filter(Boolean).join(" ")) + '</h2><p class="muted">Artikelnummer ' + S.escapeHtml(item.sku || "—") + '</p></div><div class="button-row"><button class="ghost-button" type="button" data-action="inventory">Annuleren</button><button class="primary-button" type="submit">Voorraad opslaan</button></div></div>',
      '<div class="field-grid">',
      '<label class="field">Actuele voorraad<input name="quantity" type="number" min="0" max="9999999999.99" step="0.01" required value="' + S.escapeHtml(item.stockQuantity || 0) + '"></label>',
      '<label class="field">Minimumvoorraad<input name="minimumStock" type="number" min="0" max="9999999999.99" step="0.01" required value="' + S.escapeHtml(item.minimumStock || 0) + '"></label>',
      '<label class="field">Eenheid<input name="stockUnit" maxlength="40" required value="' + S.escapeHtml(item.stockUnit || "stuk") + '" placeholder="stuk"></label>',
      '<label class="field">Locatie<input name="stockLocation" maxlength="120" value="' + S.escapeHtml(item.stockLocation || "") + '" placeholder="Magazijn A, vak 3"></label>',
      '<label class="field full">Reden van wijziging<textarea name="reason" maxlength="500" required placeholder="Bijvoorbeeld: voorraadtelling, levering ontvangen of materiaal gebruikt"></textarea></label>',
      '</div></form>'
    ].join("");
  }

  function submitAdjustment(form) {
    var data = Object.fromEntries(new FormData(form).entries());
    return S.request("/api/inventory/" + encodeURIComponent(form.dataset.id), { method: "PUT", body: JSON.stringify(data) }).then(function () {
      C.app.toast("Voorraad bijgewerkt.");
      return load("inventory").then(function () { return C.app.navigate("inventory"); });
    });
  }

  function submitImport(form) {
    var file = form.elements.file && form.elements.file.files && form.elements.file.files[0];
    if (!file) return Promise.reject(new Error("Kies eerst een Excel-bestand."));
    if (!/\.xlsx$/i.test(file.name)) return Promise.reject(new Error("Gebruik een Excel-bestand in .xlsx-formaat."));
    var body = new FormData();
    body.append("file", file);
    var errorPanel = form.parentElement && form.parentElement.querySelector("[data-import-errors]");
    if (errorPanel) { errorPanel.hidden = true; errorPanel.innerHTML = ""; }
    return S.request("/api/inventory/import", { method: "POST", body: body }).then(function (payload) {
      var summary = payload.summary || {};
      C.app.toast("Excel-import voltooid: " + Number(summary.created || 0) + " nieuw, " + Number(summary.updated || 0) + " bijgewerkt.");
      form.reset();
      return load("inventory").then(function () { return C.app.render(); });
    }).catch(function (error) {
      if (error.details && error.details.length) {
        if (errorPanel) {
          errorPanel.innerHTML = '<strong>Controleer de volgende Excel-regels:</strong><ul>' + error.details.slice(0, 10).map(function (detail) { return '<li>' + S.escapeHtml(detail.path + ": " + detail.message) + '</li>'; }).join("") + '</ul>';
          errorPanel.hidden = false;
        }
        error.message += " " + error.details.slice(0, 3).map(function (detail) { return detail.path + ": " + detail.message; }).join(" | ");
      }
      throw error;
    });
  }

  C.inventory = { load: load, render: render, renderEdit: renderEdit, submitAdjustment: submitAdjustment, submitImport: submitImport };
}());
