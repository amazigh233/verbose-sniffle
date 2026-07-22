(function () {
  "use strict";

  var C = window.Climature = window.Climature || {};
  var S = C.storage;
  var CART_KEY = "climature-wasco-cart-v1";
  var state = { status: null, products: [], total: 0, query: "", category: "", loading: false, error: "", lastOrder: null };

  function readCart() {
    try {
      var value = JSON.parse(window.localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(value) ? value.filter(function (line) { return line && line.sku && Number(line.quantity) > 0; }) : [];
    } catch (_error) {
      return [];
    }
  }

  function writeCart(lines) {
    window.localStorage.setItem(CART_KEY, JSON.stringify(lines));
  }

  function product(sku) {
    return state.products.find(function (item) { return item.sku === sku; }) || readCart().find(function (item) { return item.sku === sku; });
  }

  function euro(value) {
    return S.money(Number(value) || 0);
  }

  function load(current) {
    var params = new URLSearchParams(String(current || "").split("?")[1] || "");
    state.query = params.get("q") || "";
    state.category = params.get("category") || "";
    state.loading = true;
    state.error = "";
    return Promise.all([
      S.request("/api/wasco/status"),
      S.request("/api/wasco/products?" + new URLSearchParams({ q: state.query, category: state.category, limit: "24" }).toString())
    ]).then(function (results) {
      state.status = results[0];
      state.products = results[1].items || [];
      state.total = Number(results[1].total || state.products.length);
      state.loading = false;
      return state;
    }).catch(function (error) {
      state.loading = false;
      state.error = error.message || "Wasco-artikelen laden mislukt.";
      throw error;
    });
  }

  function statusBadge() {
    var connected = state.status && state.status.connected;
    return '<span class="wasco-connection ' + (connected ? "is-live" : "is-demo") + '"><span aria-hidden="true"></span>' + (connected ? "Koppeling actief" : "Demomodus") + "</span>";
  }

  function render() {
    var cart = readCart();
    var quantity = cart.reduce(function (sum, line) { return sum + Number(line.quantity || 0); }, 0);
    var subtotal = cart.reduce(function (sum, line) { return sum + Number(line.priceExVat || 0) * Number(line.quantity || 0); }, 0);
    var connected = state.status && state.status.connected;
    return [
      '<section class="wasco-hero section">',
      '<div><div class="wasco-brandline"><span class="wasco-logo" aria-hidden="true">W</span><div><p class="eyebrow">Wasco inkoop</p><h2>Materialen vinden en klaarzetten</h2></div></div><p>Zoek artikelen, controleer beschikbaarheid en maak een bestellijst voor uw project. Alles vanuit Climature.</p></div>',
      '<div class="wasco-hero-status">' + statusBadge() + '<strong>' + (connected ? "Live assortiment" : "Veilige demonstratie") + '</strong><span>' + S.escapeHtml(state.status && state.status.message || "Koppeling controleren…") + '</span></div>',
      "</section>",
      !connected ? '<div class="notice warn section"><strong>Er wordt nog niets besteld.</strong> Producten en prijzen op dit scherm zijn demonstratiedata. Zodra Wasco de MessageService- of API-aansluitgegevens verstrekt, kan de serveradapter worden geactiveerd.</div>' : "",
      '<section class="wasco-layout section"><div class="wasco-catalog">',
      '<form class="panel wasco-search" data-form="wasco-search"><div><p class="eyebrow">Assortiment</p><h2>Wat heeft u nodig?</h2></div><label class="field wasco-search-field"><span class="sr-only">Zoek op artikel, merk of nummer</span><input type="search" name="q" value="' + S.escapeHtml(state.query) + '" placeholder="Zoek op artikel, merk of artikelnummer…" autocomplete="off"></label><label class="field"><span class="sr-only">Categorie</span><select name="category"><option value="">Alle categorieën</option>' + categoryOptions() + '</select></label><button class="primary-button" type="submit">Zoeken</button></form>',
      '<div class="wasco-result-head"><div><strong>' + state.total + '</strong> artikelen gevonden</div>' + (state.query || state.category ? '<button class="ghost-button" data-action="wasco-reset-search">Filters wissen</button>' : "") + "</div>",
      state.error ? '<div class="empty-state"><h3>Assortiment niet beschikbaar</h3><p>' + S.escapeHtml(state.error) + '</p><button class="primary-button" data-action="wasco-retry">Opnieuw proberen</button></div>' : productGrid(),
      '</div><aside class="panel wasco-cart" aria-label="Wasco bestellijst"><div class="panel-head"><div><p class="eyebrow">Bestellijst</p><h2>' + quantity + ' artikel' + (quantity === 1 ? "" : "en") + '</h2></div>' + (cart.length ? '<button class="small-button" data-action="wasco-clear-cart">Legen</button>' : "") + "</div>",
      cart.length ? cartLines(cart) : '<div class="wasco-empty-cart"><span aria-hidden="true">＋</span><strong>Nog geen materialen</strong><p>Voeg artikelen uit het assortiment toe.</p></div>',
      cart.length ? '<div class="wasco-cart-total"><span>Subtotaal excl. btw</span><strong>' + euro(subtotal) + '</strong><small>Definitieve prijs en leverbaarheid worden door Wasco bevestigd.</small></div>' : "",
      cart.length ? orderForm(connected) : "",
      state.lastOrder ? '<div class="wasco-order-result" role="status"><strong>' + S.escapeHtml(state.lastOrder.orderNumber || "Concept aangemaakt") + '</strong><span>' + S.escapeHtml(state.lastOrder.message || "Bestelling ontvangen door Wasco.") + "</span></div>" : "",
      "</aside></section>"
    ].join("");
  }

  function categoryOptions() {
    var categories = ["CV-ketels", "Warmtepompen", "Installatiemateriaal", "Pompen", "Leiding & koppelingen", "Regeltechniek", "Isolatie"];
    return categories.map(function (category) {
      return '<option value="' + S.escapeHtml(category) + '"' + (state.category === category ? " selected" : "") + ">" + S.escapeHtml(category) + "</option>";
    }).join("");
  }

  function productGrid() {
    if (!state.products.length) return '<div class="empty-state"><h3>Geen artikelen gevonden</h3><p>Probeer een ander merk, artikelnummer of een ruimere categorie.</p></div>';
    var cart = readCart();
    return '<div class="wasco-product-grid">' + state.products.map(function (item) {
      var line = cart.find(function (entry) { return entry.sku === item.sku; });
      var available = Number(item.stock) > 0;
      return '<article class="wasco-product-card"><div class="wasco-product-visual"><span>' + S.escapeHtml(String(item.brand || "W").slice(0, 1).toUpperCase()) + '</span><small>' + S.escapeHtml(item.category) + '</small></div><div class="wasco-product-body"><div class="wasco-product-meta"><span>' + S.escapeHtml(item.brand) + '</span><code>' + S.escapeHtml(item.sku) + '</code></div><h3>' + S.escapeHtml(item.name) + '</h3><div class="wasco-stock ' + (available ? "is-available" : "is-delayed") + '"><span aria-hidden="true"></span>' + (available ? item.stock + " beschikbaar" : S.escapeHtml(item.delivery)) + '</div><div class="wasco-product-footer"><div><strong>' + euro(item.priceExVat) + '</strong><small> per ' + S.escapeHtml(item.unit) + ' excl. btw</small></div><button class="' + (line ? "ghost-button" : "primary-button") + '" data-action="wasco-add" data-sku="' + S.escapeHtml(item.sku) + '">' + (line ? "Nog één" : "Toevoegen") + "</button></div></div></article>";
    }).join("") + "</div>";
  }

  function cartLines(cart) {
    return '<div class="wasco-cart-lines">' + cart.map(function (line) {
      return '<div class="wasco-cart-line"><div><strong>' + S.escapeHtml(line.name) + '</strong><small>' + S.escapeHtml(line.sku) + ' · ' + euro(line.priceExVat) + '</small></div><div class="wasco-quantity" aria-label="Aantal ' + S.escapeHtml(line.name) + '"><button type="button" data-action="wasco-decrease" data-sku="' + S.escapeHtml(line.sku) + '" aria-label="Eén minder">−</button><span>' + Number(line.quantity) + '</span><button type="button" data-action="wasco-increase" data-sku="' + S.escapeHtml(line.sku) + '" aria-label="Eén meer">+</button></div></div>';
    }).join("") + "</div>";
  }

  function orderForm(connected) {
    var canSubmit = connected && state.status.ordersEnabled;
    return '<form class="wasco-order-form" data-form="wasco-order"><label class="field">Project- of inkoopreferentie<input name="reference" maxlength="120" placeholder="Bijv. Project Van Dijk" required></label><label class="field">Levering<select name="deliveryMethod"><option value="delivery">Bezorgen</option><option value="pickup">Afhalen bij vestiging</option></select></label><label class="field">Locatie<input name="deliveryLocation" maxlength="200" placeholder="Projectadres of vestiging"></label><label class="field">Opmerking<textarea name="notes" rows="2" maxlength="1000" placeholder="Eventuele instructie voor de bestelling"></textarea></label><button class="primary-button" type="submit">' + (canSubmit ? "Bestelling naar Wasco" : "Conceptbestelling maken") + '</button><button class="ghost-button" type="button" data-action="wasco-export">Exporteer CSV</button></form>';
  }

  function redraw() {
    var app = document.getElementById("app");
    if (app) app.innerHTML = render();
  }

  function changeQuantity(sku, delta) {
    var cart = readCart();
    var line = cart.find(function (item) { return item.sku === sku; });
    if (!line && delta > 0) {
      var item = product(sku);
      if (!item) return;
      cart.push({ sku: item.sku, name: item.name, priceExVat: item.priceExVat, unit: item.unit, quantity: 1 });
    } else if (line) {
      line.quantity = Number(line.quantity) + delta;
      if (line.quantity <= 0) cart = cart.filter(function (item) { return item.sku !== sku; });
    }
    state.lastOrder = null;
    writeCart(cart);
    redraw();
  }

  function exportCsv() {
    var rows = [["Artikelnummer", "Omschrijving", "Aantal", "Eenheid", "Prijs excl. btw"]].concat(readCart().map(function (line) {
      return [line.sku, line.name, line.quantity, line.unit, Number(line.priceExVat).toFixed(2)];
    }));
    var csv = rows.map(function (row) { return row.map(function (cell) { return '"' + String(cell).replaceAll('"', '""') + '"'; }).join(";"); }).join("\n");
    var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    var link = document.createElement("a");
    var url = URL.createObjectURL(blob);
    link.href = url;
    link.download = "wasco-bestellijst-" + S.today() + ".csv";
    link.click();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    C.app.toast("Wasco-bestellijst geëxporteerd.");
  }

  function action(target) {
    var actionName = target.dataset.action;
    if (actionName === "wasco-add" || actionName === "wasco-increase") changeQuantity(target.dataset.sku, 1);
    if (actionName === "wasco-decrease") changeQuantity(target.dataset.sku, -1);
    if (actionName === "wasco-clear-cart") {
      return C.app.confirm({ title: "Bestellijst legen", message: "Alle Wasco-artikelen worden uit de bestellijst verwijderd.", confirmLabel: "Bestellijst legen" }).then(function (confirmed) {
        if (!confirmed) return;
        writeCart([]); state.lastOrder = null; redraw();
      });
    }
    if (actionName === "wasco-reset-search") C.app.navigate("wasco-portal");
    if (actionName === "wasco-retry") C.app.render();
    if (actionName === "wasco-export") exportCsv();
  }

  function search(form) {
    var data = Object.fromEntries(new FormData(form).entries());
    var params = new URLSearchParams();
    if (data.q) params.set("q", data.q);
    if (data.category) params.set("category", data.category);
    C.app.clearDirty(form);
    return C.app.navigate("wasco-portal" + (params.toString() ? "?" + params.toString() : ""));
  }

  function submitOrder(form) {
    var cart = readCart();
    var data = Object.fromEntries(new FormData(form).entries());
    return S.request("/api/wasco/orders", {
      method: "POST",
      body: JSON.stringify({
        reference: data.reference,
        deliveryMethod: data.deliveryMethod,
        deliveryLocation: data.deliveryLocation,
        notes: data.notes,
        lines: cart.map(function (line) { return { sku: line.sku, quantity: Number(line.quantity) }; })
      })
    }).then(function (result) {
      state.lastOrder = result;
      C.app.clearDirty(form);
      C.app.toast(result.submitted ? "Bestelling naar Wasco verzonden." : "Conceptbestelling aangemaakt; niets verzonden.");
      redraw();
      return result;
    });
  }

  C.wasco = { load: load, render: render, action: action, search: search, submitOrder: submitOrder, cartCount: function () { return readCart().reduce(function (sum, line) { return sum + Number(line.quantity || 0); }, 0); } };
}());
