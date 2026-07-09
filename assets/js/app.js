(function () {
  "use strict";

  var C = window.Climature = window.Climature || {};
  var S = C.storage;
  var appEl = document.getElementById("app");
  var titleEl = document.getElementById("route-title");
  var eyebrowEl = document.getElementById("route-eyebrow");
  var actionsEl = document.getElementById("topbar-actions");
  var loginErrorEl = document.getElementById("login-error");
  var toastTimer = null;

  var routeMeta = {
    dashboard: ["Overzicht", "Dashboard"],
    customers: ["Relaties", "Klantenbestand"],
    quotes: ["Verkoop", "Offertes"],
    invoices: ["Administratie", "Facturen"],
    reports: ["Administratie", "Rapportage"],
    installations: ["Planning", "Installaties"],
    advice: ["Advies", "Advies-tool"],
    products: ["Configuratie", "Producten"],
    messages: ["Communicatie", "Tekstgenerator"],
    settings: ["Beheer", "Instellingen"]
  };

  function toast(message) {
    var toastEl = document.getElementById("toast");
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove("is-visible");
    }, 2400);
  }

  function navigate(route) {
    window.location.hash = "#" + route;
  }

  function route() {
    return (window.location.hash || "#dashboard").slice(1);
  }

  function setMeta(baseRoute) {
    var meta = routeMeta[baseRoute] || routeMeta.dashboard;
    eyebrowEl.textContent = meta[0];
    titleEl.textContent = meta[1];
    Array.from(document.querySelectorAll("[data-route-link]")).forEach(function (link) {
      link.classList.toggle("is-active", link.dataset.routeLink === baseRoute);
    });
    actionsEl.innerHTML = topActions(baseRoute) + '<button class="ghost-button" data-action="logout">Uitloggen</button>';
    document.body.classList.remove("sidebar-open");
  }

  function isAuthenticated() {
    return S.isAuthenticated();
  }

  function showLogin() {
    document.body.classList.add("auth-locked");
    if (loginErrorEl) loginErrorEl.textContent = "";
    window.setTimeout(function () {
      var field = document.querySelector('[data-form="login"] input[name="username"]');
      if (field) field.focus();
    }, 0);
  }

  function showApp() {
    document.body.classList.remove("auth-locked");
  }

  function guardedRender() {
    if (!isAuthenticated()) {
      showLogin();
      return;
    }
    showApp();
    render();
  }

  function login(form) {
    var data = Object.fromEntries(new FormData(form).entries());
    return S.login(data.username, data.password).then(function () {
      form.reset();
      showApp();
      render();
    }).catch(function (error) {
      if (loginErrorEl) loginErrorEl.textContent = error.message || "Inloggen mislukt.";
    });
  }

  function logout() {
    return S.logout().then(function () {
      showLogin();
    });
  }

  function topActions(baseRoute) {
    if (baseRoute === "customers") return '<button class="primary-button" data-action="customer-new">Nieuwe klant</button>';
    if (baseRoute === "quotes") return '<button class="primary-button" data-action="quote-new">Nieuwe offerte</button>';
    if (baseRoute === "invoices") return '<button class="primary-button" data-action="invoice-new">Nieuwe factuur</button>';
    if (baseRoute === "installations") return '<button class="primary-button" data-action="installation-new">Nieuwe installatie</button>';
    if (baseRoute === "products") return '<button class="primary-button" data-action="product-new">Nieuw product</button>';
    if (baseRoute === "advice") return "";
    return "";
  }

  function render() {
    var current = route();
    var path = current.split("?")[0];
    var base = path.split(":")[0];
    if (base === "customer") base = "customers";
    if (base === "customer-new" || base === "customer-edit" || base === "customer-import") base = "customers";
    if (base === "quote") base = "quotes";
    if (base === "quote-new" || base === "quote-edit") base = "quotes";
    if (base === "invoice") base = "invoices";
    if (base === "invoice-new" || base === "invoice-edit" || base === "invoice-from-quote") base = "invoices";
    if (base === "installation") base = "installations";
    if (base === "installation-new" || base === "installation-edit" || base === "installation-from-quote") base = "installations";
    if (base === "product-new" || base === "product-edit") base = "products";
    setMeta(base);

    if (path === "dashboard") appEl.innerHTML = dashboard();
    else if (path === "customers") appEl.innerHTML = C.customers.renderList("");
    else if (path === "customer-new") appEl.innerHTML = C.customers.renderForm();
    else if (path === "customer-import") appEl.innerHTML = C.customers.renderImport();
    else if (path.indexOf("customer-edit:") === 0) appEl.innerHTML = C.customers.renderForm(findByRoute("customers", path));
    else if (path.indexOf("customer:") === 0) appEl.innerHTML = C.customers.renderDetail(path.split(":")[1]);
    else if (path === "quotes") appEl.innerHTML = C.quotes.renderList("");
    else if (path === "quote-new") appEl.innerHTML = C.quotes.renderForm(customerSeed());
    else if (path.indexOf("quote-edit:") === 0) appEl.innerHTML = C.quotes.renderForm(findByRoute("quotes", path));
    else if (path.indexOf("quote:") === 0) appEl.innerHTML = C.quotes.renderDetail(path.split(":")[1]);
    else if (path === "invoices") appEl.innerHTML = C.invoices.renderList("");
    else if (path === "invoice-new") appEl.innerHTML = C.invoices.renderForm(customerSeed());
    else if (path.indexOf("invoice-from-quote:") === 0) appEl.innerHTML = C.invoices.renderForm(C.invoices.createFromQuote(path.split(":")[1]));
    else if (path.indexOf("invoice-edit:") === 0) appEl.innerHTML = C.invoices.renderForm(findByRoute("invoices", path));
    else if (path.indexOf("invoice:") === 0) appEl.innerHTML = C.invoices.renderDetail(path.split(":")[1]);
    else if (path === "reports") appEl.innerHTML = C.reports.render();
    else if (path === "installations") appEl.innerHTML = C.installations.renderList("");
    else if (path === "installation-new") appEl.innerHTML = C.installations.renderForm(customerSeed());
    else if (path.indexOf("installation-from-quote:") === 0) appEl.innerHTML = C.installations.renderForm(C.installations.createFromQuote(path.split(":")[1]));
    else if (path.indexOf("installation-edit:") === 0) appEl.innerHTML = C.installations.renderForm(findByRoute("installations", path));
    else if (path.indexOf("installation:") === 0) appEl.innerHTML = C.installations.renderDetail(path.split(":")[1]);
    else if (path === "advice") appEl.innerHTML = C.advice.render();
    else if (path.indexOf("advice:") === 0) appEl.innerHTML = C.advice.render(path.split(":")[1]);
    else if (path === "products") appEl.innerHTML = products();
    else if (path === "product-new") appEl.innerHTML = productForm();
    else if (path.indexOf("product-edit:") === 0) appEl.innerHTML = productForm(findByRoute("products", path));
    else if (path === "messages") appEl.innerHTML = messages();
    else if (path === "settings") appEl.innerHTML = settings();
    else appEl.innerHTML = dashboard();

    afterRender();
    appEl.focus({ preventScroll: true });
  }

  function customerSeed() {
    var params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    return params.get("customerId") ? { customerId: params.get("customerId") } : undefined;
  }

  function findByRoute(collection, current) {
    var id = current.split(":")[1];
    return S.getAll(collection).find(function (item) { return item.id === id; });
  }

  function dashboard() {
    var customers = S.getAll("customers");
    var quotes = S.getAll("quotes");
    var invoices = S.getAll("invoices");
    var today = S.today();
    var nextWeek = S.addDays(today, 7);
    var openInvoices = invoices.filter(function (invoice) { return invoice.status === "concept" || invoice.status === "verzonden" || invoice.status === "verlopen"; });
    var payableInvoices = invoices.filter(function (invoice) { return invoice.status === "verzonden" || invoice.status === "verlopen"; });
    var overdueInvoices = payableInvoices.filter(function (invoice) { return invoice.status === "verlopen" || (invoice.dueDate && invoice.dueDate < today); });
    var activeQuotes = quotes.filter(function (quote) { return quote.status === "concept" || quote.status === "verstuurd"; });
    var expiringQuotes = activeQuotes.filter(function (quote) { return quote.validUntil && quote.validUntil >= today && quote.validUntil <= nextWeek; });
    var staleQuotes = activeQuotes.filter(function (quote) { return quote.validUntil && quote.validUntil < today; });
    var outstandingTotal = sumTotals(payableInvoices);
    var overdueTotal = sumTotals(overdueInvoices);
    var openQuoteTotal = sumTotals(activeQuotes);
    var monthStats = dashboardMonthStats(customers, invoices);
    return [
      dashboardHero(outstandingTotal, overdueTotal, openQuoteTotal, monthStats),
      '<section class="section grid four">',
      metric("Klanten", customers.length),
      metric("Open offertes", activeQuotes.length),
      metric("Open facturen", openInvoices.length),
      metric("Te laat", overdueInvoices.length),
      "</section>",
      revenueChartPanel(invoices),
      '<section class="quick-actions section">',
      '<a href="#customer-new">Nieuwe klant<span>Relatie vastleggen</span></a>',
      '<a href="#quote-new">Nieuwe offerte<span>Concept maken</span></a>',
      '<a href="#invoice-new">Nieuwe factuur<span>Handmatig of uit offerte</span></a>',
      '<a href="#advice">Start advies-tool<span>Advies naar offerte</span></a>',
      "</section>",
      '<section class="grid two section">',
      actionPanel(expiringQuotes, staleQuotes, overdueInvoices),
      pipelinePanel(quotes),
      "</section>",
      '<section class="grid two section">',
      monthPanel(monthStats),
      topCustomersPanel(customers, invoices),
      "</section>",
      '<section class="grid two section">',
      recentPanel("Recente offertes", quotes.slice(0, 5), "quote"),
      recentPanel("Recente facturen", invoices.slice(0, 5), "invoice"),
      "</section>"
    ].join("");
  }

  function dashboardHero(outstandingTotal, overdueTotal, openQuoteTotal, monthStats) {
    return [
      '<section class="dashboard-hero section">',
      '<div><p class="eyebrow">Vandaag</p><h2>Werkvoorraad en geld in beeld</h2><p class="muted">Openstaande facturen, kansrijke offertes en maandcijfers op een plek.</p></div>',
      '<div class="hero-metrics">',
      '<div><span>Openstaand</span><strong>' + S.money(outstandingTotal) + "</strong></div>",
      '<div><span>Verlopen</span><strong>' + S.money(overdueTotal) + "</strong></div>",
      '<div><span>Offertekans</span><strong>' + S.money(openQuoteTotal) + "</strong></div>",
      '<div><span>Betaald deze maand</span><strong>' + S.money(monthStats.paidTotal) + "</strong></div>",
      "</div>",
      "</section>"
    ].join("");
  }

  function actionPanel(expiringQuotes, staleQuotes, overdueInvoices) {
    var items = [];
    overdueInvoices.slice(0, 4).forEach(function (invoice) {
      items.push({
        label: "Factuur verlopen",
        title: invoice.invoiceNumber,
        meta: S.formatDate(invoice.dueDate) + " - " + S.money(invoice.total || 0),
        action: "invoice-detail",
        id: invoice.id,
        tone: "danger"
      });
    });
    staleQuotes.slice(0, 3).forEach(function (quote) {
      items.push({
        label: "Offerte verlopen",
        title: quote.quoteNumber,
        meta: "Geldig tot " + S.formatDate(quote.validUntil) + " - " + S.money(quote.total || 0),
        action: "quote-detail",
        id: quote.id,
        tone: "warn"
      });
    });
    expiringQuotes.slice(0, 3).forEach(function (quote) {
      items.push({
        label: "Offerte bijna verlopen",
        title: quote.quoteNumber,
        meta: "Geldig tot " + S.formatDate(quote.validUntil) + " - " + S.money(quote.total || 0),
        action: "quote-detail",
        id: quote.id,
        tone: "warn"
      });
    });
    return [
      '<div class="panel action-panel">',
      '<div class="panel-head"><div><p class="eyebrow">Opvolgen</p><h2>Aandacht nodig</h2></div></div>',
      items.length ? '<div class="action-list">' + items.slice(0, 6).map(actionItem).join("") + "</div>" : '<div class="empty-state">Geen verlopen facturen of aflopende offertes.</div>',
      "</div>"
    ].join("");
  }

  function actionItem(item) {
    return [
      '<div class="action-item">',
      '<div><span class="status-pill ' + S.escapeHtml(item.tone) + '">' + S.escapeHtml(item.label) + '</span><strong>' + S.escapeHtml(item.title) + '</strong><small>' + S.escapeHtml(item.meta) + "</small></div>",
      '<button class="small-button" data-action="' + S.escapeHtml(item.action) + '" data-id="' + S.escapeHtml(item.id) + '">Open</button>',
      "</div>"
    ].join("");
  }

  function pipelinePanel(quotes) {
    var stages = [
      ["concept", "Concept"],
      ["verstuurd", "Verstuurd"],
      ["geaccepteerd", "Geaccepteerd"],
      ["afgewezen", "Afgewezen"]
    ];
    var max = Math.max.apply(null, stages.map(function (stage) {
      return sumTotals(quotes.filter(function (quote) { return quote.status === stage[0]; }));
    }).concat([1]));
    return [
      '<div class="panel">',
      '<div class="panel-head"><div><p class="eyebrow">Pipeline</p><h2>Offertewaarde</h2></div></div>',
      '<div class="pipeline-list">',
      stages.map(function (stage) {
        var items = quotes.filter(function (quote) { return quote.status === stage[0]; });
        var total = sumTotals(items);
        var width = Math.max(4, Math.round((total / max) * 100));
        return '<div class="pipeline-row"><div><strong>' + S.escapeHtml(stage[1]) + '</strong><span>' + items.length + ' stuks - ' + S.money(total) + '</span></div><div class="pipeline-track"><span style="width:' + width + '%;"></span></div></div>';
      }).join(""),
      "</div>",
      "</div>"
    ].join("");
  }

  function monthPanel(stats) {
    return [
      '<div class="panel">',
      '<div class="panel-head"><div><p class="eyebrow">Deze maand</p><h2>Resultaat</h2></div></div>',
      '<div class="mini-metrics">',
      '<div><span>Gefactureerd</span><strong>' + S.money(stats.invoicedTotal) + "</strong></div>",
      '<div><span>Betaald</span><strong>' + S.money(stats.paidTotal) + "</strong></div>",
      '<div><span>Nieuwe klanten</span><strong>' + stats.newCustomers + "</strong></div>",
      '<div><span>Gem. factuur</span><strong>' + S.money(stats.averageInvoice) + "</strong></div>",
      "</div>",
      "</div>"
    ].join("");
  }

  function topCustomersPanel(customers, invoices) {
    var totals = customers.map(function (customer) {
      var customerInvoices = invoices.filter(function (invoice) {
        return invoice.customerId === customer.id && invoice.status !== "concept";
      });
      return { customer: customer, total: sumTotals(customerInvoices), count: customerInvoices.length };
    }).filter(function (item) {
      return item.total > 0;
    }).sort(function (a, b) {
      return b.total - a.total;
    }).slice(0, 5);
    return [
      '<div class="panel">',
      '<div class="panel-head"><div><p class="eyebrow">Relaties</p><h2>Top klanten</h2></div></div>',
      totals.length ? '<div class="rank-list">' + totals.map(function (item, index) {
        return '<button class="rank-item" data-action="customer-detail" data-id="' + S.escapeHtml(item.customer.id) + '"><span>' + (index + 1) + '</span><strong>' + S.escapeHtml(S.customerName(item.customer)) + '</strong><small>' + item.count + ' facturen - ' + S.money(item.total) + "</small></button>";
      }).join("") + "</div>" : '<div class="empty-state">Nog geen omzet per klant.</div>',
      "</div>"
    ].join("");
  }

  function dashboardMonthStats(customers, invoices) {
    var currentMonth = S.today().slice(0, 7);
    var monthInvoices = invoices.filter(function (invoice) {
      return invoice.status !== "concept" && String(invoice.invoiceDate || "").slice(0, 7) === currentMonth;
    });
    var paidInvoices = monthInvoices.filter(function (invoice) { return invoice.status === "betaald"; });
    var newCustomers = customers.filter(function (customer) {
      return String(customer.createdAt || "").slice(0, 7) === currentMonth;
    }).length;
    return {
      invoicedTotal: sumTotals(monthInvoices),
      paidTotal: sumTotals(paidInvoices),
      newCustomers: newCustomers,
      averageInvoice: monthInvoices.length ? sumTotals(monthInvoices) / monthInvoices.length : 0
    };
  }

  function sumTotals(items) {
    return (items || []).reduce(function (sum, item) {
      return sum + Number(item.total || 0);
    }, 0);
  }

  var MONTH_LABELS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

  function monthlyRevenueSeries(invoices) {
    var now = S.today();
    var year = Number(now.slice(0, 4));
    var month = Number(now.slice(5, 7));
    var months = [];
    var index = {};
    for (var i = 11; i >= 0; i--) {
      var date = new Date(year, month - 1 - i, 1);
      var key = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
      var entry = { key: key, label: MONTH_LABELS[date.getMonth()], year: date.getFullYear(), total: 0 };
      months.push(entry);
      index[key] = entry;
    }
    (invoices || []).forEach(function (invoice) {
      if (invoice.status === "concept") return;
      var key = String(invoice.invoiceDate || "").slice(0, 7);
      if (index[key]) index[key].total += Number(invoice.total || 0);
    });
    return months;
  }

  function roundedTopBar(x, y, w, h, r, cls) {
    r = Math.min(r, w / 2, h);
    return '<path class="' + cls + '" d="M' + x + " " + (y + h) +
      " L" + x + " " + (y + r) +
      " Q" + x + " " + y + " " + (x + r) + " " + y +
      " L" + (x + w - r) + " " + y +
      " Q" + (x + w) + " " + y + " " + (x + w) + " " + (y + r) +
      " L" + (x + w) + " " + (y + h) + ' Z"/>';
  }

  function revenueChartPanel(invoices) {
    var series = monthlyRevenueSeries(invoices);
    var max = Math.max.apply(null, series.map(function (item) { return item.total; }).concat([0]));
    var total = sumTotals(series);
    var head = '<div class="panel-head"><div><p class="eyebrow">Omzet</p><h2>Gefactureerd per maand</h2></div><span class="chart-total">' + S.money(total) + ' laatste 12 mnd</span></div>';
    if (max <= 0) {
      return '<section class="panel section revenue-chart">' + head + '<div class="empty-state">Nog geen gefactureerde omzet om te tonen.</div></section>';
    }
    var width = 720, height = 240;
    var padL = 14, padR = 14, padT = 22, padB = 30;
    var plotW = width - padL - padR;
    var plotH = height - padT - padB;
    var baseline = padT + plotH;
    var band = plotW / series.length;
    var barW = Math.min(46, band - 12);
    var currentKey = S.today().slice(0, 7);
    var bars = series.map(function (item, i) {
      var cx = padL + band * i + band / 2;
      var x = cx - barW / 2;
      var h = item.total > 0 ? Math.max(3, Math.round((item.total / max) * plotH)) : 0;
      var y = baseline - h;
      var cls = item.key === currentKey ? "chart-bar is-current" : "chart-bar";
      var bar = h > 0 ? roundedTopBar(x, y, barW, h, 4, cls) : "";
      var hit = '<rect class="chart-hit" x="' + (padL + band * i) + '" y="' + padT + '" width="' + band + '" height="' + plotH + '"><title>' + S.escapeHtml(item.label + " " + item.year + ": " + S.money(item.total)) + "</title></rect>";
      var label = '<text class="chart-x-label" x="' + cx + '" y="' + (baseline + 18) + '" text-anchor="middle">' + S.escapeHtml(item.label) + "</text>";
      return "<g>" + hit + bar + label + "</g>";
    }).join("");
    var svg = '<svg class="chart-svg" viewBox="0 0 ' + width + " " + height + '" role="img" preserveAspectRatio="xMidYMid meet" aria-label="Gefactureerde omzet per maand, laatste 12 maanden">' +
      '<text class="chart-y-max" x="' + padL + '" y="' + (padT - 8) + '">Max ' + S.escapeHtml(S.money(max)) + "</text>" +
      '<line class="chart-baseline" x1="' + padL + '" y1="' + baseline + '" x2="' + (width - padR) + '" y2="' + baseline + '"></line>' +
      bars + "</svg>";
    return '<section class="panel section revenue-chart">' + head + '<div class="chart-wrap">' + svg + "</div></section>";
  }

  function metric(label, value) {
    return '<div class="metric"><span>' + S.escapeHtml(label) + "</span><strong>" + S.escapeHtml(value) + "</strong></div>";
  }

  function recentPanel(title, items, type) {
    var customers = S.getAll("customers");
    var rows = items.map(function (item) {
      var customer = customers.find(function (c) { return c.id === item.customerId; });
      var number = type === "quote" ? item.quoteNumber : item.invoiceNumber;
      var date = type === "quote" ? item.quoteDate : item.invoiceDate;
      return '<tr><td><strong>' + S.escapeHtml(number) + '</strong><br><span class="muted">' + S.formatDate(date) + '</span></td><td>' + S.escapeHtml(S.customerName(customer)) + '</td><td>' + S.money(item.total || 0) + '</td><td><button class="small-button" data-action="' + type + '-detail" data-id="' + item.id + '">Open</button></td></tr>';
    }).join("");
    return '<div class="panel"><div class="panel-head"><div><p class="eyebrow">Recent</p><h2>' + title + '</h2></div></div>' + (items.length ? '<div class="table-wrap"><table class="data-table"><tbody>' + rows + "</tbody></table></div>" : '<div class="empty-state">Nog niets aangemaakt.</div>') + "</div>";
  }

  function products() {
    var grouped = {};
    S.getAll("products").forEach(function (product) {
      grouped[product.category] = grouped[product.category] || [];
      grouped[product.category].push(product);
    });
    var cards = Object.keys(grouped).map(function (category) {
      return '<section class="panel section"><div class="panel-head"><div><p class="eyebrow">Categorie</p><h2>' + S.escapeHtml(category) + '</h2></div><button class="small-button" data-action="product-new">Nieuw product</button></div><div class="product-grid">' + grouped[category].map(productCard).join("") + "</div></section>";
    }).join("");
    return cards || '<section class="panel"><div class="panel-head"><div><p class="eyebrow">Producten</p><h2>Productbeheer</h2></div><button class="primary-button" data-action="product-new">Nieuw product</button></div><div class="empty-state">Geen producten gevonden.</div></section>';
  }

  function productCard(product) {
    return [
      '<article class="product-card">',
      '<span class="category-pill">' + S.escapeHtml(product.category) + "</span>",
      "<h3>" + S.escapeHtml(product.brand + " " + product.name) + "</h3>",
      '<p class="muted">' + S.escapeHtml(product.specs) + "</p>",
      "<p>" + S.escapeHtml(product.description) + "</p>",
      "<strong>" + S.money(product.priceExVat) + " excl. BTW</strong>",
      '<div class="button-row"><button class="small-button" data-action="product-edit" data-id="' + S.escapeHtml(product.id) + '">Bewerk</button><button class="small-button" data-action="product-delete" data-id="' + S.escapeHtml(product.id) + '">Verwijder</button></div>',
      "</article>"
    ].join("");
  }

  function emptyProduct() {
    return {
      category: "warmtepomp",
      brand: "",
      name: "",
      specs: "",
      priceExVat: 0,
      vatRate: 21,
      description: ""
    };
  }

  function productForm(product) {
    var p = Object.assign(emptyProduct(), product || {});
    return [
      '<form class="panel" data-form="product" data-id="' + S.escapeHtml(p.id || "") + '">',
      '<div class="panel-head"><div><p class="eyebrow">Productbeheer</p><h2>' + (p.id ? "Product bewerken" : "Nieuw product") + '</h2></div><div class="button-row"><button class="ghost-button" type="button" data-action="products">Annuleren</button><button class="primary-button" type="submit">Opslaan</button></div></div>',
      '<div class="field-grid">',
      '<label class="field">Categorie<input name="category" required value="' + S.escapeHtml(p.category || "") + '" placeholder="warmtepomp"></label>',
      '<label class="field">Merk<input name="brand" required value="' + S.escapeHtml(p.brand || "") + '"></label>',
      '<label class="field">Naam<input name="name" required value="' + S.escapeHtml(p.name || "") + '"></label>',
      '<label class="field">Specificaties<input name="specs" value="' + S.escapeHtml(p.specs || "") + '"></label>',
      '<label class="field">Prijs excl. BTW<input name="priceExVat" type="number" min="0" step="0.01" required value="' + S.escapeHtml(p.priceExVat || 0) + '"></label>',
      '<label class="field">BTW<select name="vatRate">' + productVatOptions(p.vatRate) + '</select></label>',
      '<label class="field full">Omschrijving<textarea name="description" rows="5">' + S.escapeHtml(p.description || "") + "</textarea></label>",
      "</div>",
      "</form>"
    ].join("");
  }

  function productVatOptions(selected) {
    return [21, 9, 0].map(function (rate) {
      return '<option value="' + rate + '"' + (Number(selected) === rate ? " selected" : "") + ">" + rate + "%</option>";
    }).join("");
  }

  function saveProductFromForm(form) {
    var data = Object.fromEntries(new FormData(form).entries());
    if (!data.category || !data.brand || !data.name) {
      toast("Vul categorie, merk en naam in.");
      return;
    }
    if (form.dataset.id) data.id = form.dataset.id;
    data.priceExVat = S.parseNumber(data.priceExVat);
    data.vatRate = S.parseNumber(data.vatRate);
    return S.upsert("products", data).then(function (saved) {
      toast("Product opgeslagen.");
      navigate("products");
      return saved;
    });
  }

  function removeProduct(id) {
    if (!window.confirm("Product verwijderen? Bestaande offertes en facturen blijven ongewijzigd.")) return;
    return S.remove("products", id).then(function () {
      toast("Product verwijderd.");
      render();
    });
  }

  function settings() {
    var data = S.settings();
    return [
      '<section class="grid two section">',
      '<form class="panel" data-form="settings">',
      '<div class="panel-head"><div><p class="eyebrow">Instellingen</p><h2>Bedrijfsgegevens en standaardteksten</h2></div><button class="primary-button" type="submit">Opslaan</button></div>',
      '<div class="field-grid">',
      settingField("Bedrijfsnaam", "companyName", data.companyName),
      settingField("Adres", "companyAddress", data.companyAddress),
      settingField("Postcode en plaats", "companyCity", data.companyCity),
      settingField("Telefoon", "companyPhone", data.companyPhone),
      settingField("E-mail", "companyEmail", data.companyEmail, "email"),
      settingField("Website", "companySite", data.companySite),
      settingField("KvK", "companyKvk", data.companyKvk),
      settingField("BTW", "companyVat", data.companyVat),
      settingField("IBAN", "companyIban", data.companyIban),
      settingField("Betaaltermijn dagen", "paymentDays", data.paymentDays, "number"),
      '<label class="field full">Standaard factuurtekst<textarea name="defaultInvoiceNote" rows="4">' + S.escapeHtml(data.defaultInvoiceNote) + '</textarea></label>',
      '<label class="field full">Standaard offertevoorwaarden<textarea name="defaultQuoteTerms" rows="5">' + S.escapeHtml(data.defaultQuoteTerms) + "</textarea></label>",
      "</div>",
      "</form>",
      adviceAssumptionsPanel(data.adviceAssumptions || {}),
      backupPanel(),
      "</section>"
    ].join("");
  }

  function adviceAssumptionsPanel(assumptions) {
    var energy = assumptions.energy || {};
    var battery = assumptions.battery || {};
    var sources = assumptions.sources || {};
    return [
      '<form class="panel" data-form="settings">',
      '<div class="panel-head"><div><p class="eyebrow">Advies-tool</p><h2>Advies-aannames</h2></div><div class="button-row"><button class="ghost-button" type="button" data-action="advice-assumptions-refresh">Cijfers verversen</button><button class="primary-button" type="submit">Opslaan</button></div></div>',
      '<div class="notice">' + assumptionSourceText(sources) + "</div>",
      '<h3>Energie</h3>',
      '<div class="field-grid">',
      assumptionField("Gasprijs EUR/m3", "energy.gasPrice", energy.gasPrice, "0.0001"),
      assumptionField("Stroomprijs EUR/kWh", "energy.electricityPrice", energy.electricityPrice, "0.0001"),
      assumptionField("Dynamische stroomprijs EUR/kWh", "energy.dynamicElectricityPrice", energy.dynamicElectricityPrice, "0.0001"),
      assumptionField("Jaarlijkse stijging gas (%)", "energy.gasAnnualIncrease", energy.gasAnnualIncrease, "0.1"),
      assumptionField("Jaarlijkse stijging stroom (%)", "energy.electricityAnnualIncrease", energy.electricityAnnualIncrease, "0.1"),
      "</div>",
      '<h3>Batterijmarkt</h3>',
      '<div class="field-grid">',
      assumptionField("Terugleverkosten EUR/kWh", "battery.feedInCost", battery.feedInCost, "0.01"),
      assumptionField("EPEX-marge EUR/kWh", "battery.epexMargin", battery.epexMargin, "0.01"),
      assumptionField("Onbalans EUR/kWh/jaar", "battery.imbalancePerKwh", battery.imbalancePerKwh, "10"),
      assumptionField("Aggregator-fee extern (%)", "battery.aggregatorFeeExternal", battery.aggregatorFeeExternal, "1"),
      assumptionField("Aggregator-fee Climature (%)", "battery.aggregatorFeeClimature", battery.aggregatorFeeClimature, "1"),
      "</div>",
      '<h3>Warmtepompen</h3>',
      productAssumptionRows("warmtepompProducts.allelectric", assumptions.warmtepompProducts && assumptions.warmtepompProducts.allelectric, "priceIncl", "subsidy"),
      productAssumptionRows("warmtepompProducts.hybride", assumptions.warmtepompProducts && assumptions.warmtepompProducts.hybride, "priceIncl", "subsidy"),
      '<h3>Thuisbatterijen</h3>',
      productAssumptionRows("batteryProducts.1fase", assumptions.batteryProducts && assumptions.batteryProducts["1fase"], "priceExVat"),
      productAssumptionRows("batteryProducts.3fase", assumptions.batteryProducts && assumptions.batteryProducts["3fase"], "priceExVat"),
      "</form>"
    ].join("");
  }

  function assumptionSourceText(sources) {
    var energy = sources.energy || {};
    var last = sources.lastRefresh || {};
    var age = energy.refreshedAt ? Math.floor((Date.now() - new Date(energy.refreshedAt).getTime()) / 86400000) : null;
    var stale = age !== null && age > 45;
    return [
      "Energiebron: " + S.escapeHtml(energy.label || "Handmatig"),
      energy.period ? "Peildatum: " + S.escapeHtml(energy.period) : "",
      energy.refreshedAt ? "Verversd: " + S.formatDate(String(energy.refreshedAt).slice(0, 10)) : "",
      stale ? "Let op: ouder dan 45 dagen." : "",
      last.errors && last.errors.length ? "Laatste refresh: " + S.escapeHtml(last.errors.join(" ")) : ""
    ].filter(Boolean).join(" · ");
  }

  function assumptionField(label, path, value, step) {
    return '<label class="field">' + S.escapeHtml(label) + '<input type="number" step="' + S.escapeHtml(step || "0.01") + '" value="' + S.escapeHtml(value == null ? "" : value) + '" data-advice-assumption="' + S.escapeHtml(path) + '"></label>';
  }

  function productAssumptionRows(prefix, products, priceKey, subsidyKey) {
    products = products || [];
    if (!products.length) return '<div class="empty-state">Geen producten ingesteld.</div>';
    return '<div class="table-wrap" style="margin-bottom:14px;"><table class="data-table"><tbody>' + products.map(function (product, index) {
      return [
        "<tr>",
        "<td><strong>" + S.escapeHtml(product.name || "-") + "</strong><br><span class=\"muted\">" + (product.kw ? S.escapeHtml(product.kw + " kW") : product.kwh ? S.escapeHtml(product.kwh + " kWh") : "") + "</span></td>",
        '<td>' + assumptionField(priceKey === "priceIncl" ? "Prijs incl. BTW" : "Prijs ex. BTW", prefix + "." + index + "." + priceKey, product[priceKey], "1") + "</td>",
        subsidyKey ? '<td>' + assumptionField("ISDE subsidie", prefix + "." + index + "." + subsidyKey, product[subsidyKey], "1") + "</td>" : "",
        '<td><label class="field">Meldcode / zoekterm<input value="' + S.escapeHtml(product.meldcode || product.rvoSearch || "") + '" data-advice-assumption="' + S.escapeHtml(prefix + "." + index + "." + (product.meldcode ? "meldcode" : "rvoSearch")) + '"></label></td>',
        "</tr>"
      ].join("");
    }).join("") + "</tbody></table></div>";
  }

  function backupPanel() {
    var stats = [
      ["Klanten", S.getAll("customers").length],
      ["Offertes", S.getAll("quotes").length],
      ["Facturen", S.getAll("invoices").length],
      ["Installaties", S.getAll("installations").length],
      ["Producten", S.getAll("products").length],
      ["Notities", S.getAll("customerNotes").length]
    ];
    return [
      '<section class="panel">',
      '<div class="panel-head"><div><p class="eyebrow">Back-up</p><h2>Data exporteren en herstellen</h2></div></div>',
      '<div class="mini-metrics backup-metrics">',
      stats.map(function (item) {
        return '<div><span>' + S.escapeHtml(item[0]) + '</span><strong>' + item[1] + "</strong></div>";
      }).join(""),
      "</div>",
      '<div class="notice" style="margin-top:14px;">Maak regelmatig een back-up. Alles staat lokaal in deze browser.</div>',
      '<div class="button-row" style="margin-top:16px;">',
      '<button class="primary-button" data-action="backup-export">Exporteer JSON</button>',
      '<button class="ghost-button" data-action="backup-import">Importeer back-up</button>',
      '<button class="danger-button" data-action="backup-reset">Reset data</button>',
      "</div>",
      '<input id="backup-import-file" type="file" accept="application/json,.json" hidden>',
      "</section>"
    ].join("");
  }

  function settingField(label, name, value, type) {
    return '<label class="field">' + label + '<input name="' + name + '" type="' + (type || "text") + '" value="' + S.escapeHtml(value || "") + '"></label>';
  }

  function backupFileName() {
    return "climature-backup-" + S.today() + ".json";
  }

  function exportBackup() {
    return S.exportData().then(function (payload) {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      var link = document.createElement("a");
      var url = URL.createObjectURL(blob);
      link.href = url;
      link.download = backupFileName();
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast("Back-up gedownload.");
    });
  }

  function importBackupFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        if (!window.confirm("Back-up importeren? Dit vervangt alle huidige lokale data.")) return;
        S.importData(JSON.parse(reader.result)).then(function () {
          toast("Back-up geimporteerd.");
          guardedRender();
        }).catch(function (error) {
          toast(error.message || "Importeren mislukt.");
        });
      } catch (error) {
        toast(error.message || "Importeren mislukt.");
      }
    };
    reader.readAsText(file);
  }

  function openBackupImport() {
    var input = document.getElementById("backup-import-file");
    if (!input) return;
    input.value = "";
    input.click();
  }

  function resetBackupData() {
    if (!window.confirm("Alle lokale Climature-data resetten? Maak eerst een back-up als u data wilt bewaren.")) return;
    if (!window.confirm("Weet u het zeker? Klanten, offertes, facturen en installaties worden gewist.")) return;
    return S.resetData().then(function () {
      toast("Data gereset.");
      navigate("dashboard");
      guardedRender();
    });
  }

  function messages() {
    return [
      '<section class="grid two section">',
      '<form class="panel" data-form="message"><div class="panel-head"><div><p class="eyebrow">Tekstgenerator</p><h2>Klantbericht</h2></div></div><div class="field-grid">',
      settingField("Klantnaam", "name", ""),
      '<label class="field">Dienst<select name="service"><option>Thuisbatterij</option><option>Warmtepomp</option><option>Airco</option><option>CV-ketel</option><option>Onderhoud</option></select></label>',
      '<label class="field">Template<select name="template"><option value="followup">Offerte opvolgen</option><option value="appointment">Afspraak bevestigen</option><option value="payment">Betaling herinneren</option><option value="thanks">Bedankt</option></select></label>',
      settingField("Bedrag", "amount", ""),
      '<label class="field full">Extra opmerking<textarea name="note" rows="4"></textarea></label>',
      "</div></form>",
      '<div class="panel"><div class="panel-head"><div><p class="eyebrow">Output</p><h2>WhatsApp en e-mail</h2></div><button class="small-button" data-action="copy-message">Kopieer WhatsApp</button></div><label class="field">WhatsApp<textarea id="message-whatsapp" rows="8" readonly></textarea></label><label class="field">E-mail<textarea id="message-email" rows="10" readonly></textarea></label></div>',
      "</section>"
    ].join("");
  }

  function updateMessage(form) {
    var data = Object.fromEntries(new FormData(form).entries());
    var settings = S.settings();
    var name = data.name || "klant";
    var amount = data.amount ? " Het offertebedrag is " + data.amount + "." : "";
    var note = data.note ? "\n\n" + data.note : "";
    var whatsapp = "";
    var email = "";
    if (data.template === "appointment") {
      whatsapp = "Goedemiddag " + name + ", hierbij bevestigen wij de afspraak voor " + data.service + ". Mocht er iets wijzigen, laat het gerust weten." + note;
      email = "Beste " + name + ",\n\nHierbij bevestigen wij de afspraak voor " + data.service + ".\n\nMet vriendelijke groet,\n" + settings.companyName + "\n" + settings.companyPhone;
    } else if (data.template === "payment") {
      whatsapp = "Goedemiddag " + name + ", volgens onze administratie staat er nog een betaling open voor " + data.service + "." + amount + " Zou u dit willen controleren? Alvast bedankt." + note;
      email = "Beste " + name + ",\n\nVolgens onze administratie staat er nog een betaling open voor " + data.service + "." + amount + "\n\nMet vriendelijke groet,\n" + settings.companyName;
    } else if (data.template === "thanks") {
      whatsapp = "Goedemiddag " + name + ", bedankt voor het vertrouwen in " + settings.companyName + ". Bij vragen kunt u ons altijd bereiken." + note;
      email = "Beste " + name + ",\n\nBedankt voor het vertrouwen in " + settings.companyName + ".\n\nMet vriendelijke groet,\n" + settings.companyName;
    } else {
      whatsapp = "Goedemiddag " + name + ", met " + settings.companyName + ". Ik wilde even vragen of u de offerte voor " + data.service + " goed heeft ontvangen." + amount + " Als u vragen heeft, denk ik graag met u mee." + note;
      email = "Beste " + name + ",\n\nIk wilde graag even navragen of u onze offerte voor " + data.service + " goed heeft ontvangen." + amount + "\n\nMet vriendelijke groet,\n" + settings.companyName + "\n" + settings.companyPhone;
    }
    document.getElementById("message-whatsapp").value = whatsapp;
    document.getElementById("message-email").value = email;
  }

  function afterRender() {
    var quoteForm = document.querySelector('[data-form="quote"]');
    if (quoteForm) C.quotes.recalc(quoteForm);
    var invoiceForm = document.querySelector('[data-form="invoice"]');
    if (invoiceForm) C.invoices.recalc(invoiceForm);
    var messageForm = document.querySelector('[data-form="message"]');
    if (messageForm) updateMessage(messageForm);
    var adviceFrame = document.getElementById("advice-tool-frame");
    if (adviceFrame && C.advice && C.advice.postAssumptions) {
      adviceFrame.addEventListener("load", C.advice.postAssumptions, { once: true });
      C.advice.postAssumptions();
    }
  }

  function handleClick(event) {
    var target = event.target.closest("[data-action]");
    if (!target) return;
    var action = target.dataset.action;
    if (action === "logout") return logout();
    if (action === "toggle-sidebar") document.body.classList.toggle("sidebar-open");
    if (action === "customers") navigate("customers");
    if (action === "customer-new") navigate("customer-new");
    if (action === "customer-import") navigate("customer-import");
    if (action === "customer-edit") navigate("customer-edit:" + target.dataset.id);
    if (action === "customer-detail") navigate("customer:" + target.dataset.id);
    if (action === "customer-workorder-print") printCustomerWorkOrder(target.dataset.id);
    if (action === "customer-delete") return C.customers.remove(target.dataset.id);
    if (action === "customer-note-delete") return C.customers.removeNote(target.dataset.id);
    if (action === "customer-advice") navigate("advice:" + target.dataset.id);
    if (action === "advice-quote") return C.advice.createQuoteFromAdvice(target.dataset.id);
    if (action === "advice-delete") return C.customers.removeAdvice(target.dataset.id);
    if (action === "quote-new") navigate(target.dataset.customerId ? "quote-new?customerId=" + target.dataset.customerId : "quote-new");
    if (action === "quotes") navigate("quotes");
    if (action === "quote-detail") navigate("quote:" + target.dataset.id);
    if (action === "quote-edit") navigate("quote-edit:" + target.dataset.id);
    if (action === "quote-delete") return C.quotes.remove(target.dataset.id);
    if (action === "quote-status") return C.quotes.updateStatus(target.dataset.id, target.dataset.status);
    if (action === "quote-to-invoice") navigate("invoice-from-quote:" + target.dataset.id);
    if (action === "quote-to-installation") navigate("installation-from-quote:" + target.dataset.id);
    if (action === "quote-pdf") C.pdf.downloadQuote(find("quotes", target.dataset.id));
    if (action === "quote-print") C.pdf.printQuote(find("quotes", target.dataset.id));
    if (action === "quote-add-line") addLine("quote");
    if (action === "quote-remove-line") removeLine(target, "quote");
    if (action === "invoice-new") navigate(target.dataset.customerId ? "invoice-new?customerId=" + target.dataset.customerId : "invoice-new");
    if (action === "invoices") navigate("invoices");
    if (action === "invoice-detail") navigate("invoice:" + target.dataset.id);
    if (action === "invoice-edit") navigate("invoice-edit:" + target.dataset.id);
    if (action === "invoice-delete") return C.invoices.remove(target.dataset.id);
    if (action === "invoice-status") return C.invoices.updateStatus(target.dataset.id, target.dataset.status);
    if (action === "invoice-reminder") C.invoices.sendReminder(target.dataset.id);
    if (action === "invoice-pdf") C.pdf.downloadInvoice(find("invoices", target.dataset.id));
    if (action === "invoice-print") C.pdf.printInvoice(find("invoices", target.dataset.id));
    if (action === "invoice-add-line") addLine("invoice");
    if (action === "invoice-remove-line") removeLine(target, "invoice");
    if (action === "installation-new") navigate(target.dataset.customerId ? "installation-new?customerId=" + target.dataset.customerId : "installation-new");
    if (action === "installations") navigate("installations");
    if (action === "installation-detail") navigate("installation:" + target.dataset.id);
    if (action === "installation-edit") navigate("installation-edit:" + target.dataset.id);
    if (action === "installation-delete") return C.installations.remove(target.dataset.id);
    if (action === "installation-workorder-print") printInstallationWorkOrder(target.dataset.id);
    if (action === "installation-view") navigate("installations?view=" + target.dataset.view + "&date=" + target.dataset.date);
    if (action === "installation-period") navigate("installations?view=" + target.dataset.view + "&date=" + target.dataset.date);
    if (action === "installation-today") navigate("installations?view=" + target.dataset.view + "&date=" + S.today());
    if (action === "product-new") navigate("product-new");
    if (action === "products") navigate("products");
    if (action === "product-edit") navigate("product-edit:" + target.dataset.id);
    if (action === "product-delete") return removeProduct(target.dataset.id);
    if (action === "report-period") navigate("reports?period=" + target.dataset.period);
    if (action === "report-range") C.reports.applyRange();
    if (action === "report-export-invoices") C.reports.exportCsv("invoices");
    if (action === "report-export-quotes") C.reports.exportCsv("quotes");
    if (action === "advice-assumptions-refresh") return refreshAdviceAssumptions();
    if (action === "backup-export") return exportBackup();
    if (action === "backup-import") openBackupImport();
    if (action === "backup-reset") return resetBackupData();
    if (action === "advice-tab") C.advice.setTab(target.dataset.tab);
    if (action === "advice-select-product") selectAdviceProduct(target.dataset.id);
    if (action === "advice-create-quote") return C.advice.createQuote();
    if (action === "copy-message") copyMessage();
  }

  function find(collection, id) {
    return S.getAll(collection).find(function (item) { return item.id === id; });
  }

  function printCustomerWorkOrder(customerId) {
    var customer = find("customers", customerId);
    var installation = nextCustomerInstallation(customerId);
    C.pdf.printWorkOrder(customer, installation);
  }

  function printInstallationWorkOrder(installationId) {
    var installation = find("installations", installationId);
    var customer = installation && find("customers", installation.customerId);
    C.pdf.printWorkOrder(customer, installation);
  }

  function nextCustomerInstallation(customerId) {
    var today = S.today();
    return S.getAll("installations").filter(function (installation) {
      return installation.customerId === customerId && installation.status !== "geannuleerd" && installation.status !== "uitgevoerd" && (!installation.plannedDate || installation.plannedDate >= today);
    }).sort(function (a, b) {
      return String(a.plannedDate || "").localeCompare(String(b.plannedDate || "")) || String(a.startTime || "").localeCompare(String(b.startTime || ""));
    })[0];
  }

  function addLine(type) {
    var form = document.querySelector('[data-form="' + type + '"]');
    var container = form.querySelector('[data-lines="' + type + '"]');
    container.insertAdjacentHTML("beforeend", type === "quote" ? C.quotes.lineRow() : C.invoices.lineRow());
    type === "quote" ? C.quotes.recalc(form) : C.invoices.recalc(form);
  }

  function removeLine(button, type) {
    var form = button.closest("form");
    var rows = form.querySelectorAll("." + type + "-line");
    if (rows.length <= 1) return;
    button.closest("." + type + "-line").remove();
    type === "quote" ? C.quotes.recalc(form) : C.invoices.recalc(form);
  }

  function selectAdviceProduct(id) {
    C.app.state.selectedAdviceProduct = id;
    Array.from(document.querySelectorAll("[data-advice-product]")).forEach(function (card) {
      card.classList.toggle("is-selected", card.dataset.adviceProduct === id);
    });
  }

  function copyMessage() {
    var field = document.getElementById("message-whatsapp");
    if (!field) return;
    navigator.clipboard && navigator.clipboard.writeText(field.value).then(function () {
      toast("WhatsApp-tekst gekopieerd.");
    }).catch(function () {
      field.select();
      document.execCommand("copy");
      toast("WhatsApp-tekst gekopieerd.");
    });
  }

  function handleInput(event) {
    var form = event.target.closest("form");
    if (!form) return;
    if (form.dataset.form === "quote") C.quotes.recalc(form);
    if (form.dataset.form === "invoice") C.invoices.recalc(form);
    if (form.dataset.form === "message") updateMessage(form);
  }

  function handleChange(event) {
    var form = event.target.closest("form");
    var action = event.target.dataset.action;
    if (action === "quote-product-select") {
      C.quotes.fillProduct(event.target);
      C.quotes.recalc(form);
    }
    if (action === "invoice-load-quote") {
      C.invoices.applyQuote(form, event.target.value);
    }
    if (event.target.id === "backup-import-file") {
      importBackupFile(event.target.files && event.target.files[0]);
    }
  }

  function handleSubmit(event) {
    var form = event.target.closest("form");
    if (!form) return;
    event.preventDefault();
    var submitter = form.querySelector('[type="submit"]');
    if (submitter) submitter.disabled = true;
    var done = function () {
      if (submitter) submitter.disabled = false;
    };
    if (form.dataset.form === "login") {
      return login(form).then(done, done);
    }
    var work = Promise.resolve();
    if (form.dataset.form === "customer") work = C.customers.saveFromForm(form);
    if (form.dataset.form === "customer-import") work = C.customers.saveImportFromForm(form);
    if (form.dataset.form === "customer-note") work = C.customers.saveNoteFromForm(form);
    if (form.dataset.form === "quote") work = C.quotes.saveFromForm(form);
    if (form.dataset.form === "invoice") work = C.invoices.saveFromForm(form);
    if (form.dataset.form === "installation") work = C.installations.saveFromForm(form);
    if (form.dataset.form === "workorder") work = C.installations.saveWorkOrderFromForm(form);
    if (form.dataset.form === "product") work = saveProductFromForm(form);
    if (form.dataset.form === "settings") {
      work = S.saveSettings(settingsPayloadFromForm(form)).then(function () {
        toast("Instellingen opgeslagen.");
        render();
      });
    }
    if (form.dataset.form === "advice-wp" || form.dataset.form === "advice-bat") C.advice.submit(form);
    return Promise.resolve(work).catch(function (error) {
      toast(error.message || "Opslaan mislukt.");
    }).then(done);
  }

  function setPath(object, path, value) {
    var parts = path.split(".");
    var cursor = object;
    parts.slice(0, -1).forEach(function (part) {
      if (cursor[part] == null) cursor[part] = /^\d+$/.test(part) ? [] : {};
      cursor = cursor[part];
    });
    cursor[parts[parts.length - 1]] = value;
  }

  function settingsPayloadFromForm(form) {
    var payload = Object.fromEntries(new FormData(form).entries());
    var settings = S.settings();
    var assumptions = JSON.parse(JSON.stringify(settings.adviceAssumptions || {}));
    Array.from(form.querySelectorAll("[data-advice-assumption]")).forEach(function (field) {
      var value = field.type === "number" ? S.parseNumber(field.value) : field.value;
      setPath(assumptions, field.dataset.adviceAssumption, value);
    });
    if (form.querySelector("[data-advice-assumption]")) payload.adviceAssumptions = assumptions;
    return payload;
  }

  function refreshAdviceAssumptions() {
    toast("Adviescijfers worden ververst...");
    return S.refreshAdviceAssumptions().then(function () {
      toast("Adviescijfers bijgewerkt.");
      render();
    });
  }

  function handleSearch(event) {
    var action = event.target.dataset.action;
    if (action === "customer-search") appEl.innerHTML = C.customers.renderList(event.target.value);
    if (action === "quote-search") appEl.innerHTML = C.quotes.renderList(event.target.value);
    if (action === "invoice-search") appEl.innerHTML = C.invoices.renderList(event.target.value);
    if (action === "installation-search") appEl.innerHTML = C.installations.renderList(event.target.value);
  }

  function init() {
    C.app = { navigate: navigate, toast: toast, render: guardedRender, state: {} };
    window.addEventListener("hashchange", guardedRender);
    document.addEventListener("click", function (event) {
      Promise.resolve(handleClick(event)).catch(function (error) {
        toast(error.message || "Actie mislukt.");
      });
    });
    document.addEventListener("input", function (event) {
      handleInput(event);
      handleSearch(event);
    });
    document.addEventListener("change", handleChange);
    document.addEventListener("submit", function (event) {
      Promise.resolve(handleSubmit(event)).catch(function (error) {
        toast(error.message || "Opslaan mislukt.");
      });
    });
    S.init().then(function () {
      guardedRender();
    }).catch(function (error) {
      showLogin();
      toast(error.message || "Server niet bereikbaar.");
    });
  }

  init();
}());
