(function () {
  "use strict";

  var C = window.Climature = window.Climature || {};
  var S = C.storage;
  var state = { payments: [], drawers: [], shifts: [], current: null };

  function request(path, options) { return S.request(path, options); }
  function post(path, body) {
    return request(path, { method: "POST", headers: { "Idempotency-Key": S.uid("payment") }, body: JSON.stringify(body || {}) });
  }
  function load(route) {
    var path = String(route || "payments").split("?")[0];
    if (path.indexOf("payment:") === 0) {
      return request("/api/payments/" + encodeURIComponent(path.split(":")[1])).then(function (payload) { state.current = payload.item; });
    }
    return Promise.all([
      request("/api/payments?page=1&pageSize=100"),
      request("/api/cash-drawers"),
      request("/api/cash-drawer-shifts")
    ]).then(function (values) {
      state.payments = values[0].items || [];
      state.drawers = values[1].items || [];
      state.shifts = values[2].items || [];
    });
  }
  function statusLabel(status) {
    return { pending: "Open", partially_paid: "Deels betaald", paid: "Betaald", partially_refunded: "Deels terugbetaald", refunded: "Terugbetaald", cancelled: "Geannuleerd" }[status] || status;
  }
  function statusClass(status) { return status === "paid" ? "ok" : status === "cancelled" || status === "refunded" ? "danger" : "warn"; }
  function invoiceOptions(selected) {
    return '<option value="">Losse betaling</option>' + S.getAll("invoices").filter(function (item) { return item.status !== "concept" && item.status !== "geannuleerd"; }).map(function (item) {
      return '<option value="' + S.escapeHtml(item.id) + '"' + (item.id === selected ? " selected" : "") + '>' + S.escapeHtml(item.invoiceNumber) + " · " + S.money(item.total) + "</option>";
    }).join("");
  }
  function shiftOptions(selected) {
    var open = state.shifts.filter(function (item) { return item.status === "open"; });
    return '<option value="">Geen dienst</option>' + open.map(function (item) { return '<option value="' + S.escapeHtml(item.id) + '"' + (item.id === selected ? " selected" : "") + '>' + S.escapeHtml(item.drawer && item.drawer.name || "Kassalade") + "</option>"; }).join("");
  }
  function tenderFields(prefix) {
    return [
      '<label class="field">Betaalmiddel<select name="type"><option value="cash">Contant</option><option value="pin">PIN</option><option value="credit_card">Creditcard</option><option value="apple_pay">Apple Pay</option><option value="google_pay">Google Pay</option></select></label>',
      '<label class="field">Bedrag<input name="amount" type="number" min="0.01" step="0.01" required></label>',
      '<label class="field">Ontvangen contant<input name="amountReceived" type="number" min="0" step="0.01"></label>',
      '<label class="field">Kassadienst<select name="shiftId">' + shiftOptions("") + "</select></label>",
      '<label class="field">Provider<input name="provider" placeholder="bijv. Adyen of Stripe"></label>',
      '<label class="field">Externe referentie<input name="externalReference" placeholder="Transactie-ID"></label>',
      prefix === "create" ? "" : '<p class="muted full">Voor contant zijn kassadienst en eventueel ontvangen bedrag nodig. Elektronisch vereist provider en transactiereferentie.</p>'
    ].join("");
  }
  function renderList() {
    var rows = state.payments.map(function (item) {
      return '<tr><td><strong>' + S.escapeHtml(item.invoice && item.invoice.invoiceNumber || "Losse betaling") + '</strong><br><span class="muted">' + S.formatDate(item.createdAt) + '</span></td><td><span class="status-pill ' + statusClass(item.status) + '">' + S.escapeHtml(statusLabel(item.status)) + '</span></td><td>' + S.money(item.totalAmount) + '</td><td>' + S.money(item.remainingAmount) + '</td><td><button class="small-button" data-action="payment-open" data-id="' + S.escapeHtml(item.id) + '">Open</button></td></tr>';
    }).join("");
    var openShifts = state.shifts.filter(function (item) { return item.status === "open"; });
    return [
      '<section class="grid two section"><section class="panel"><div class="panel-head"><div><p class="eyebrow">Betalingen</p><h2>Transactiehistorie</h2></div><button class="primary-button" data-action="payment-new">Betaling registreren</button></div>',
      state.payments.length ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Bron</th><th>Status</th><th>Totaal</th><th>Open</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty-state">Nog geen betalingen.</div>',
      '</section><section class="panel"><div class="panel-head"><div><p class="eyebrow">Kassalade</p><h2>Open diensten</h2></div></div>',
      openShifts.length ? openShifts.map(function (item) { return '<div class="list-card"><strong>' + S.escapeHtml(item.drawer && item.drawer.name || "Kassalade") + '</strong><span>Geopend met ' + S.money(item.openingBalance) + '</span><button class="small-button" data-action="cash-shift-open" data-id="' + S.escapeHtml(item.id) + '">Afrekenen</button></div>'; }).join("") : '<div class="empty-state">Geen geopende kassadienst.</div>',
      '<form data-form="cash-shift-start" class="field-grid" style="margin-top:16px"><label class="field">Kassalade<select name="drawerId" required><option value="">Kies</option>' + state.drawers.filter(function (item) { return item.active && !(item.shifts || []).length; }).map(function (item) { return '<option value="' + S.escapeHtml(item.id) + '">' + S.escapeHtml(item.name) + '</option>'; }).join("") + '</select></label><label class="field">Openingssaldo<input name="openingBalance" type="number" min="0" step="0.01" required></label><div class="field"><span>Dienst</span><button class="primary-button" type="submit">Openen</button></div></form>',
      '<form data-form="cash-drawer-create" class="field-grid" style="margin-top:16px"><label class="field">Nieuwe kassalade<input name="name" required></label><div class="field"><span>Beheer</span><button class="small-button" type="submit">Toevoegen</button></div></form>',
      '</section></section>'
    ].join("");
  }
  function renderCreate(route) {
    var invoiceId = new URLSearchParams(String(route || "").split("?")[1] || "").get("invoiceId") || "";
    return '<form class="grid two section" data-form="payment-create"><section class="panel"><div class="panel-head"><div><p class="eyebrow">Nieuwe betaling</p><h2>Bedrag en bron</h2></div></div><div class="field-grid"><label class="field full">Factuur<select name="invoiceId">' + invoiceOptions(invoiceId) + '</select></label><label class="field">Bedrag losse betaling<input name="baseAmount" type="number" min="0.01" step="0.01"></label><label class="field">Korting<input name="discountAmount" type="number" min="0" step="0.01" value="0"></label><label class="field full">Kortingsreden<input name="discountReason"></label><label class="field">Fooi<input name="tipAmount" type="number" min="0" step="0.01" value="0"></label></div></section><section class="panel"><div class="panel-head"><div><p class="eyebrow">Eerste betaalmiddel</p><h2>Volledig of gedeeltelijk</h2></div></div><div class="field-grid">' + tenderFields("create") + '</div><div class="button-row"><button class="ghost-button" type="button" data-action="payments">Annuleren</button><button class="primary-button" type="submit">Betaling opslaan</button></div></section></form>';
  }
  function renderDetail() {
    var item = state.current;
    if (!item) return '<section class="panel section"><div class="empty-state">Betaling niet gevonden.</div></section>';
    var tenders = item.tenders.map(function (t) { return '<tr><td>' + S.escapeHtml(t.type) + '</td><td>' + S.money(t.amount) + '</td><td>' + S.escapeHtml(t.provider || "-") + '</td><td>' + S.escapeHtml(t.externalReference || "-") + '</td></tr>'; }).join("");
    var receipts = item.receipts.map(function (r) { return '<button class="small-button" data-action="payment-receipt" data-number="' + S.escapeHtml(r.number) + '">' + S.escapeHtml(r.number) + '</button>'; }).join(" ");
    return '<section class="grid two section"><section class="panel"><div class="panel-head"><div><p class="eyebrow">Betaling</p><h2>' + S.escapeHtml(item.invoice && item.invoice.invoiceNumber || item.id) + '</h2></div><span class="status-pill ' + statusClass(item.status) + '">' + S.escapeHtml(statusLabel(item.status)) + '</span></div><div class="mini-metrics"><div><span>Totaal</span><strong>' + S.money(item.totalAmount) + '</strong></div><div><span>Betaald</span><strong>' + S.money(item.paidAmount) + '</strong></div><div><span>Terugbetaald</span><strong>' + S.money(item.refundedAmount) + '</strong></div><div><span>Open</span><strong>' + S.money(item.remainingAmount) + '</strong></div></div><div class="table-wrap" style="margin-top:16px"><table class="data-table"><thead><tr><th>Type</th><th>Bedrag</th><th>Provider</th><th>Referentie</th></tr></thead><tbody>' + tenders + '</tbody></table></div><div class="button-row" style="margin-top:16px">' + receipts + '<button class="danger-button" data-action="payment-cancel" data-id="' + S.escapeHtml(item.id) + '">Annuleren</button></div></section><section class="grid"><form class="panel" data-form="payment-tender" data-id="' + S.escapeHtml(item.id) + '"><h2>Betaalmiddel toevoegen</h2><div class="field-grid">' + tenderFields("add") + '</div><button class="primary-button" type="submit">Toevoegen</button></form><form class="panel" data-form="payment-refund" data-id="' + S.escapeHtml(item.id) + '"><h2>Terugbetalen</h2><div class="field-grid"><label class="field">Bedrag<input name="amount" type="number" min="0.01" step="0.01" required></label><label class="field">Reden<input name="reason" required minlength="3"></label><label class="field">Kassadienst contant<select name="cashShiftId">' + shiftOptions("") + '</select></label><label class="field">Externe refundreferentie<input name="externalReference"></label></div><button class="danger-button" type="submit">Terugbetaling vastleggen</button></form></section></section>';
  }
  function tenderFrom(data) { return { type: data.type, amount: data.amount, amountReceived: data.amountReceived || undefined, shiftId: data.shiftId || undefined, provider: data.provider || undefined, externalReference: data.externalReference || undefined }; }
  function submit(form) {
    var data = Object.fromEntries(new FormData(form).entries());
    if (form.dataset.form === "payment-create") return post("/api/payments", { invoiceId: data.invoiceId || undefined, amount: data.baseAmount || undefined, discountAmount: data.discountAmount || undefined, discountReason: data.discountReason || undefined, tipAmount: data.tipAmount || undefined, tenders: data.amount ? [tenderFrom(data)] : [] }).then(function (p) { C.app.toast("Betaling opgeslagen."); C.app.navigate("payment:" + p.item.id); });
    if (form.dataset.form === "payment-tender") return post("/api/payments/" + encodeURIComponent(form.dataset.id) + "/tenders", { tenders: [tenderFrom(data)] }).then(function () { C.app.toast("Betaalmiddel verwerkt."); return C.app.render(); });
    if (form.dataset.form === "payment-refund") return post("/api/payments/" + encodeURIComponent(form.dataset.id) + "/refunds", { amount: data.amount, reason: data.reason, cashShiftId: data.cashShiftId || undefined, externalReference: data.externalReference || undefined }).then(function () { C.app.toast("Terugbetaling verwerkt."); return C.app.render(); });
    if (form.dataset.form === "cash-drawer-create") return request("/api/cash-drawers", { method: "POST", body: JSON.stringify({ name: data.name }) }).then(function () { C.app.toast("Kassalade toegevoegd."); return C.app.render(); });
    if (form.dataset.form === "cash-shift-start") return request("/api/cash-drawers/" + encodeURIComponent(data.drawerId) + "/shifts", { method: "POST", body: JSON.stringify({ openingBalance: data.openingBalance }) }).then(function () { C.app.toast("Kassadienst geopend."); return C.app.render(); });
    if (form.dataset.form === "cash-shift-close") return request("/api/cash-drawer-shifts/" + encodeURIComponent(form.dataset.id) + "/close", { method: "POST", body: JSON.stringify({ closingBalance: data.closingBalance, notes: data.notes || "" }) }).then(function () { C.app.toast("Kassadienst afgerekend."); C.app.navigate("payments"); });
  }
  function action(target) {
    if (target.dataset.action === "payments") return C.app.navigate("payments");
    if (target.dataset.action === "payment-new") return C.app.navigate("payment-new");
    if (target.dataset.action === "payment-open") return C.app.navigate("payment:" + target.dataset.id);
    if (target.dataset.action === "payment-cancel") return C.app.prompt({ title: "Betaling annuleren", message: "Leg de reden vast.", inputLabel: "Reden", confirmLabel: "Annuleren" }).then(function (reason) { if (!reason) return; return post("/api/payments/" + encodeURIComponent(target.dataset.id) + "/cancel", { reason: reason }).then(function () { C.app.toast("Betaling geannuleerd."); return C.app.render(); }); });
    if (target.dataset.action === "cash-shift-open") { var shift = state.shifts.find(function (item) { return item.id === target.dataset.id; }); document.getElementById("app").innerHTML = '<form class="panel section" data-form="cash-shift-close" data-id="' + S.escapeHtml(target.dataset.id) + '"><div class="panel-head"><div><p class="eyebrow">Kasafrekening</p><h2>' + S.escapeHtml(shift && shift.drawer && shift.drawer.name || "Kassalade") + '</h2></div></div><div class="field-grid"><label class="field">Geteld eindsaldo<input name="closingBalance" type="number" min="0" step="0.01" required></label><label class="field full">Notitie<textarea name="notes"></textarea></label></div><button class="primary-button" type="submit">Dienst sluiten</button></form>'; }
    if (target.dataset.action === "payment-receipt") return request("/api/payments/receipts/" + encodeURIComponent(target.dataset.number)).then(function (payload) { var blob = new Blob([JSON.stringify(payload.item.snapshot, null, 2)], { type: "application/json" }); var link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = target.dataset.number + ".json"; link.click(); window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000); });
  }
  C.payments = { load: load, renderList: renderList, renderCreate: renderCreate, renderDetail: renderDetail, submit: submit, action: action };
}());
