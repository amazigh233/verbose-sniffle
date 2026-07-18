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
    portals: ["Werkruimte", "Kies een portaal"],
    "crm-portal": ["CRM", "CRM-overzicht"],
    "sales-portal": ["Sales", "Salesoverzicht"],
    "execution-portal": ["Uitvoering", "Uitvoeringsoverzicht"],
    "finance-portal": ["Financiën", "Financieel overzicht"],
    "management-portal": ["Beheer", "Beheeromgeving"],
    dashboard: ["Overzicht", "Dashboard"],
    customers: ["CRM", "Klantenbestand"],
    quotes: ["Sales", "Offertes"],
    "sales-funnel": ["Sales", "Sales funnel"],
    "sales-agenda": ["Sales", "Sales agenda"],
    advice: ["Sales", "Advies-tool"],
    "advice-v2": ["Sales", "Advies Tool 2.0"],
    projects: ["Uitvoering", "Projectcockpits"],
    installations: ["Uitvoering", "Installaties"],
    service: ["Service", "Service & onderhoud"],
    invoices: ["Financiën", "Facturen"],
    reports: ["Financiën", "Rapportage"],
    products: ["Beheer & tools", "Producten"],
    "quote-studio": ["Beheer & tools", "Offertebouwer"],
    messages: ["Beheer & tools", "Tekstgenerator"],
    "google-business": ["Beheer & tools", "Google Bedrijfsprofiel"],
    settings: ["Beheer & tools", "Instellingen"],
    account: ["Account", "Mijn account"]
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
    return (window.location.hash || "#portals").slice(1);
  }

  function portalForBase(baseRoute) {
    if (baseRoute === "service") {
      if (S.hasRole("finance")) return "finance";
      if (S.hasRole("crm")) return "crm";
      return "execution";
    }
    if (baseRoute === "crm-portal" || baseRoute === "customers") return "crm";
    if (["sales-portal", "sales-funnel", "sales-agenda", "advice", "advice-v2", "quotes"].indexOf(baseRoute) >= 0) return "sales";
    if (["execution-portal", "projects", "installations"].indexOf(baseRoute) >= 0) return "execution";
    if (["finance-portal", "invoices", "reports"].indexOf(baseRoute) >= 0) return "finance";
    if (["management-portal", "quote-studio", "products", "messages", "google-business", "settings"].indexOf(baseRoute) >= 0) return "management";
    return "global";
  }

  function setMeta(baseRoute) {
    var meta = routeMeta[baseRoute] || routeMeta.dashboard;
    var activePortal = portalForBase(baseRoute);
    eyebrowEl.textContent = meta[0];
    titleEl.textContent = meta[1];
    Array.from(document.querySelectorAll("[data-route-link]")).forEach(function (link) {
      var visible = canAccessBase(link.dataset.routeLink);
      link.hidden = !visible;
      link.classList.toggle("is-active", visible && link.dataset.routeLink === baseRoute);
    });
    var hrLink = document.getElementById("hr-portal-link");
    if (hrLink) hrLink.hidden = !(S.isAdmin() && S.isHrPortalEnabled());
    Array.from(document.querySelectorAll("[data-nav-group]")).forEach(function (group) {
      var belongsToPortal = group.dataset.portal === "global" || group.dataset.portal === activePortal;
      group.hidden = !belongsToPortal || !group.querySelector("a:not([hidden])");
    });
    actionsEl.innerHTML = topActions(baseRoute) + (baseRoute === "portals" ? "" : '<button class="ghost-button" data-action="portal-switch">Portalen</button>') + '<button class="ghost-button" data-action="account">Mijn account</button><button class="ghost-button" data-action="logout">Uitloggen</button>';
    document.body.classList.remove("sidebar-open");
  }

  function canAccessBase(baseRoute) {
    if (baseRoute === "account" || baseRoute === "portals") return true;
    if (S.isAdmin()) return true;
    if (baseRoute === "service") return S.hasRole("execution", "installer", "finance", "crm");
    var portal = portalForBase(baseRoute);
    if (portal === "crm") return S.hasRole("crm", "installer");
    if (portal === "sales") return S.hasRole("sales");
    if (portal === "execution") return S.hasRole("execution", "installer");
    if (portal === "finance") return S.hasRole("finance");
    return false;
  }

  function canAccessPath(path) {
    if (S.isAdmin()) return true;
    if (!S.isInstaller()) return true;
    if (["account", "portals", "crm-portal", "execution-portal", "customers", "installations", "projects", "service"].indexOf(path) >= 0) return true;
    return path.indexOf("customer:") === 0 || path.indexOf("installation:") === 0 || path.indexOf("project:") === 0 || path.indexOf("service-visit:") === 0;
  }

  function defaultRouteForRole() {
    if (S.hasRole("crm")) return "crm-portal";
    if (S.hasRole("sales")) return "sales-portal";
    if (S.hasRole("execution", "installer")) return "execution-portal";
    if (S.hasRole("finance")) return "finance-portal";
    return "portals";
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
    if (baseRoute === "crm-portal" && S.canManage("crm")) return '<button class="primary-button" data-action="customer-new">Nieuwe klant</button>';
    if (baseRoute === "sales-portal" && S.canManage("sales")) return '<button class="primary-button" data-action="sales-opportunity-new">Nieuwe lead</button><button class="ghost-button" data-action="sales-appointment-new">Plan afspraak</button>';
    if (baseRoute === "execution-portal" && S.canManage("execution")) return '<button class="primary-button" data-action="installation-new">Nieuwe installatie</button>';
    if (baseRoute === "finance-portal" && S.canManage("finance")) return '<button class="primary-button" data-action="invoice-new">Nieuwe factuur</button>';
    if (baseRoute === "customers" && S.canManage("crm")) return '<button class="primary-button" data-action="customer-new">Nieuwe klant</button>';
    if (baseRoute === "quotes" && S.canManage("sales")) return '<button class="primary-button" data-action="quote-new">Nieuwe offerte</button>';
    if (baseRoute === "sales-funnel" && S.canManage("sales")) return '<button class="primary-button" data-action="sales-opportunity-new">Nieuwe lead</button>';
    if (baseRoute === "sales-agenda" && S.canManage("sales")) return '<button class="primary-button" data-action="sales-appointment-new">Nieuwe afspraak</button>';
    if (baseRoute === "invoices" && S.canManage("finance")) return '<button class="primary-button" data-action="invoice-new">Nieuwe factuur</button>';
    if (baseRoute === "installations" && S.canManage("execution")) return '<button class="primary-button" data-action="installation-new">Nieuwe installatie</button>';
    if (baseRoute === "service" && S.canManage("execution")) return '<button class="primary-button" data-action="service-visit-new">Bezoek plannen</button>';
    if (baseRoute === "products" && S.isAdmin()) return '<button class="primary-button" data-action="product-new">Nieuw product</button>';
    if (baseRoute === "quote-studio" && S.canManage("sales")) return '<button class="primary-button" data-action="quote-new">Nieuwe offerte op maat</button>';
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
    if (base === "sales-opportunity" || base === "sales-opportunity-new" || base === "sales-opportunity-edit") base = "sales-funnel";
    if (base === "sales-appointment" || base === "sales-appointment-new" || base === "sales-appointment-edit") base = "sales-agenda";
    if (base === "invoice") base = "invoices";
    if (base === "invoice-new" || base === "invoice-edit" || base === "invoice-from-quote") base = "invoices";
    if (base === "installation") base = "installations";
    if (base === "installation-new" || base === "installation-edit" || base === "installation-from-quote") base = "installations";
    if (base === "product-new" || base === "product-edit") base = "products";
    if (base === "project") base = "projects";
    if (base.indexOf("service-") === 0) base = "service";
    if (!canAccessBase(base) || !canAccessPath(path)) {
      navigate(defaultRouteForRole());
      return;
    }
    setMeta(base);

    if (path === "portals") appEl.innerHTML = portalSelector();
    else if (path === "crm-portal") appEl.innerHTML = crmPortal();
    else if (path === "sales-portal") appEl.innerHTML = salesPortal();
    else if (path === "execution-portal") appEl.innerHTML = executionPortal();
    else if (path === "finance-portal") appEl.innerHTML = financePortal();
    else if (path === "management-portal") appEl.innerHTML = managementPortal();
    else if (path === "dashboard") appEl.innerHTML = dashboard();
    else if (path === "customers") appEl.innerHTML = C.customers.renderList("");
    else if (path === "customer-new") appEl.innerHTML = C.customers.renderForm();
    else if (path === "customer-import") appEl.innerHTML = C.customers.renderImport();
    else if (path.indexOf("customer-edit:") === 0) appEl.innerHTML = C.customers.renderForm(findByRoute("customers", path));
    else if (path.indexOf("customer:") === 0) appEl.innerHTML = C.customers.renderDetail(path.split(":")[1]);
    else if (path === "quotes") appEl.innerHTML = C.quotes.renderList("");
    else if (path === "quote-studio") appEl.innerHTML = C.quotes.renderList("");
    else if (path === "quote-new") appEl.innerHTML = C.quotes.renderForm(customerSeed());
    else if (path.indexOf("quote-edit:") === 0) appEl.innerHTML = C.quotes.renderForm(findByRoute("quotes", path));
    else if (path.indexOf("quote:") === 0) appEl.innerHTML = C.quotes.renderDetail(path.split(":")[1]);
    else if (path === "sales-funnel") appEl.innerHTML = C.salesFunnel.render();
    else if (path === "sales-opportunity-new") appEl.innerHTML = C.salesFunnel.renderForm();
    else if (path.indexOf("sales-opportunity-edit:") === 0) appEl.innerHTML = C.salesFunnel.renderForm(findByRoute("salesOpportunities", path));
    else if (path.indexOf("sales-opportunity:") === 0) appEl.innerHTML = C.salesFunnel.renderDetail(path.split(":")[1]);
    else if (path === "sales-agenda") appEl.innerHTML = C.salesAgenda.render();
    else if (path === "sales-appointment-new") appEl.innerHTML = C.salesAgenda.renderForm();
    else if (path.indexOf("sales-appointment-edit:") === 0) appEl.innerHTML = C.salesAgenda.renderForm(findByRoute("salesAppointments", path));
    else if (path.indexOf("sales-appointment:") === 0) appEl.innerHTML = C.salesAgenda.renderDetail(path.split(":")[1]);
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
    else if (path === "projects") appEl.innerHTML = C.projects.renderList(new URLSearchParams(current.split("?")[1] || "").get("customerId") || "");
    else if (path.indexOf("project:") === 0) appEl.innerHTML = C.projects.renderDetail(path.split(":")[1]);
    else if (path === "service") appEl.innerHTML = C.service.render();
    else if (path === "service-equipment-new") appEl.innerHTML = C.service.equipmentForm();
    else if (path.indexOf("service-equipment-edit:") === 0) appEl.innerHTML = C.service.equipmentForm(path.split(":")[1]);
    else if (path === "service-contract-new") appEl.innerHTML = C.service.contractForm();
    else if (path.indexOf("service-contract-edit:") === 0) appEl.innerHTML = C.service.contractForm(path.split(":")[1]);
    else if (path === "service-request-new") appEl.innerHTML = C.service.requestForm();
    else if (path.indexOf("service-request-edit:") === 0) appEl.innerHTML = C.service.requestForm(path.split(":")[1]);
    else if (path === "service-visit-new") appEl.innerHTML = C.service.visitForm();
    else if (path.indexOf("service-visit-edit:") === 0) appEl.innerHTML = C.service.visitForm(path.split(":")[1]);
    else if (path.indexOf("service-visit:") === 0) appEl.innerHTML = C.service.visitDetail(path.split(":")[1]);
    else if (path === "advice") appEl.innerHTML = C.advice.render();
    else if (path.indexOf("advice:") === 0) appEl.innerHTML = C.advice.render(path.split(":")[1]);
    else if (path === "advice-v2") appEl.innerHTML = C.adviceV2.render("", true);
    else if (path.indexOf("advice-v2:") === 0) appEl.innerHTML = C.adviceV2.render(path.split(":")[1], true);
    else if (path === "products") appEl.innerHTML = products();
    else if (path === "google-business") appEl.innerHTML = googleBusinessProfile();
    else if (path === "product-new") appEl.innerHTML = productForm();
    else if (path.indexOf("product-edit:") === 0) appEl.innerHTML = productForm(findByRoute("products", path));
    else if (path === "messages") appEl.innerHTML = messages();
    else if (path === "settings") appEl.innerHTML = settings();
    else if (path === "account") appEl.innerHTML = account();
    else appEl.innerHTML = dashboard();

    afterRender();
    appEl.focus({ preventScroll: true });
  }

  function customerSeed() {
    var params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    var seed = params.get("customerId") ? { customerId: params.get("customerId") } : {};
    if (params.get("opportunityId") && C.salesFunnel && C.salesFunnel.quoteSeed) {
      seed = Object.assign(seed, C.salesFunnel.quoteSeed(params.get("opportunityId")));
    }
    return Object.keys(seed).length ? seed : undefined;
  }

  function findByRoute(collection, current) {
    var id = current.split(":")[1];
    return S.getAll(collection).find(function (item) { return item.id === id; });
  }

  function portalSelector() {
    var cards = [
      S.hasRole("admin", "crm", "installer") ? portalCard("crm-portal", "CRM", "Klanten en relatiehistorie", "Open het klantenbestand en alle gekoppelde dossiers.", S.getAll("customers").length + " klanten") : "",
      S.hasRole("admin", "sales") ? portalCard("sales-portal", "Sales", "Van lead naar opdracht", "Werk met de funnel, agenda, adviezen en offertes.", S.getAll("salesOpportunities").filter(function (item) { return item.stage !== "gewonnen" && item.stage !== "verloren"; }).length + " open kansen") : "",
      S.hasRole("admin", "execution", "installer") ? portalCard("execution-portal", "Uitvoering", "Projecten en installaties", "Plan werk, bereid projecten voor en rond werkbonnen af.", S.getAll("installations").filter(function (item) { return item.status === "ingepland"; }).length + " ingepland") : "",
      S.hasRole("admin", "finance") ? portalCard("finance-portal", "Financiën", "Facturen en rapportage", "Volg openstaande bedragen, betalingen en omzet.", S.getAll("invoices").filter(function (item) { return item.status !== "betaald"; }).length + " open facturen") : "",
      S.isAdmin() ? portalCard("management-portal", "Beheer", "Instellingen en hulpmiddelen", "Beheer producten, accounts, communicatie en HR.", S.getAll("products").length + " producten") : ""
    ].join("");
    return '<section class="portal-hero section"><p class="eyebrow">Climature werkruimtes</p><h2>Waar wilt u werken?</h2><p class="muted">Elk portaal bevat alleen de functies die bij dat werkproces horen.</p></section><section class="portal-grid section">' + cards + "</section>";
  }

  function portalCard(routeName, title, subtitle, description, metricText) {
    return '<a class="portal-card" href="#' + S.escapeHtml(routeName) + '"><span class="portal-card-arrow">→</span><p class="eyebrow">' + S.escapeHtml(title) + '</p><h2>' + S.escapeHtml(subtitle) + '</h2><p>' + S.escapeHtml(description) + '</p><strong>' + S.escapeHtml(metricText) + "</strong></a>";
  }

  function crmPortal() {
    var customers = S.getAll("customers");
    var month = S.today().slice(0, 7);
    var recent = customers.filter(function (item) { return String(item.createdAt || "").slice(0, 7) === month; });
    var incomplete = customers.filter(function (item) { return !item.email || !item.phone; });
    return portalOverview("CRM", "Relaties centraal beheren", "Van eerste contact tot compleet klantdossier.", [
      metric("Totaal klanten", customers.length), metric("Nieuw deze maand", recent.length), metric("Contact aanvullen", incomplete.length)
    ], [
      portalAction("customer-new", "Nieuwe klant", "Leg een nieuwe relatie vast."), portalLink("customers", "Klantenbestand", "Zoek en open een bestaand dossier.")
    ]) + portalItemPanel("Recent toegevoegd", customers.slice(0, 6).map(function (item) { return { title: S.customerName(item), meta: item.email || item.phone || "Contactgegevens aanvullen", route: "customer:" + item.id }; }), "Nog geen klanten toegevoegd.");
  }

  function salesPortal() {
    var opportunities = S.getAll("salesOpportunities");
    var appointments = S.getAll("salesAppointments");
    var quotes = S.getAll("quotes");
    var today = S.today();
    var open = opportunities.filter(function (item) { return item.stage !== "gewonnen" && item.stage !== "verloren"; });
    var due = open.filter(function (item) { return item.followUpDate && item.followUpDate <= today; });
    var planned = appointments.filter(function (item) { return item.status === "gepland" && item.date >= today; }).sort(function (a, b) { return (a.date + a.startTime).localeCompare(b.date + b.startTime); });
    var activeQuotes = quotes.filter(function (item) { return item.status === "concept" || item.status === "verstuurd"; });
    return portalOverview("Sales", "Van lead naar opdracht", "Alle commerciële opvolging in één afgeschermde werkruimte.", [
      metric("Open kansen", open.length), metric("Opvolging nodig", due.length), metric("Komende afspraken", planned.length), metric("Actieve offertes", activeQuotes.length)
    ], [
      portalAction("sales-opportunity-new", "Nieuwe lead", "Start een nieuwe saleskans."), portalAction("sales-appointment-new", "Plan afspraak", "Zet de volgende actie vast."), portalLink("sales-funnel", "Open funnel", "Bekijk alle fasen en waarden."), portalLink("quotes", "Open offertes", "Werk concepten en reacties bij.")
    ]) + portalItemPanel("Eerstvolgende afspraken", planned.slice(0, 6).map(function (item) { return { title: item.title, meta: S.formatDate(item.date) + " · " + item.startTime, route: "sales-appointment:" + item.id }; }), "Geen komende salesafspraken.");
  }

  function executionPortal() {
    var installations = S.getAll("installations");
    var today = S.today();
    var upcoming = installations.filter(function (item) { return item.status === "ingepland" && item.plannedDate >= today; }).sort(function (a, b) { return (a.plannedDate + a.startTime).localeCompare(b.plannedDate + b.startTime); });
    return portalOverview("Uitvoering", "Van voorbereiding naar oplevering", "Projecttaken, materialen, bezetting en installatieplanning bij elkaar.", [
      metric("Vandaag", upcoming.filter(function (item) { return item.plannedDate === today; }).length), metric("Ingepland", upcoming.length), metric("Uitgevoerd", installations.filter(function (item) { return item.status === "uitgevoerd"; }).length)
    ], [
      S.canManage("execution") ? portalAction("installation-new", "Nieuwe installatie", "Plan een nieuwe opdracht in.") : "", portalLink("projects", "Projecten", "Controleer voorbereiding en acties."), portalLink("installations", "Installatieplanning", "Bekijk week, maand en werkbonnen.")
    ]) + (S.canManage("execution") ? '<div data-project-dashboard-actions class="section panel"><div class="empty-state">Projectacties worden geladen…</div></div>' : "") + portalItemPanel("Eerstvolgende installaties", upcoming.slice(0, 6).map(function (item) { var customer = find("customers", item.customerId); return { title: customer ? S.customerName(customer) : "Onbekende klant", meta: S.formatDate(item.plannedDate) + " · " + item.startTime, route: "installation:" + item.id }; }), "Geen installaties ingepland.");
  }

  function financePortal() {
    var invoices = S.getAll("invoices");
    var today = S.today();
    var open = invoices.filter(function (item) { return item.status === "verzonden" || item.status === "verlopen"; });
    var overdue = open.filter(function (item) { return item.status === "verlopen" || item.dueDate < today; });
    var paidMonth = invoices.filter(function (item) { return item.status === "betaald" && String(item.paidAt || item.statusUpdatedAt || "").slice(0, 7) === today.slice(0, 7); });
    return portalOverview("Financiën", "Geldstromen onder controle", "Facturen, vervaldata, betalingen en rapportages gescheiden van sales en uitvoering.", [
      metric("Openstaand", S.money(sumTotals(open))), metric("Verlopen", S.money(sumTotals(overdue))), metric("Betaald deze maand", S.money(sumTotals(paidMonth)))
    ], [
      portalAction("invoice-new", "Nieuwe factuur", "Maak een handmatige factuur."), portalLink("invoices", "Facturen", "Volg statussen en betalingen."), portalLink("reports", "Rapportage", "Analyseer omzet en exporteer CSV.")
    ]) + revenueChartPanel(invoices) + portalItemPanel("Aandacht nodig", overdue.slice(0, 6).map(function (item) { return { title: item.invoiceNumber, meta: S.formatDate(item.dueDate) + " · " + S.money(item.total || 0), route: "invoice:" + item.id }; }), "Geen verlopen facturen.");
  }

  function managementPortal() {
    return portalOverview("Beheer", "Applicatie en stamdata beheren", "Configuratie en hulpmiddelen staan los van de dagelijkse werkprocessen.", [
      metric("Producten", S.getAll("products").length), metric("Betaaltermijn", Number(S.settings().paymentDays || 14) + " dagen"), metric("HR-portaal", S.isHrPortalEnabled() ? "Actief" : "Uit")
    ], [
      portalLink("quote-studio", "Offertebouwer", "Ontwerp offertes met producttemplates en regelingen."), portalLink("products", "Producten", "Beheer catalogus en prijzen."), portalLink("messages", "Tekstgenerator", "Maak klantcommunicatie."), portalLink("google-business", "Google Bedrijfsprofiel", "Werk profielgegevens, foto's en beoordelingen bij."), portalLink("settings", "Instellingen", "Bedrijf, accounts en aannames.")
    ]) + '<section class="section portal-management-grid"><a class="panel portal-management-card" href="#google-business"><p class="eyebrow">Online vindbaarheid</p><h2>Google Bedrijfsprofiel</h2><p class="muted">Open het officiële Google-beheer en bewaar de profiel- en beoordelingslink.</p></a><a class="panel portal-management-card" href="#settings"><p class="eyebrow">Configuratie</p><h2>Instellingen en accounts</h2><p class="muted">Beheer bedrijfsgegevens, gebruikers, adviesaannames, digest en back-ups.</p></a>' + (S.isHrPortalEnabled() ? '<a class="panel portal-management-card" href="/medewerkers/"><p class="eyebrow">Beveiligd</p><h2>Werknemersportaal</h2><p class="muted">Open HR-dossiers, kwalificaties, roosters en checklists met extra verificatie.</p></a>' : "") + "</section>";
  }

  function portalOverview(label, title, text, metrics, actions) {
    return '<section class="portal-hero section"><p class="eyebrow">' + S.escapeHtml(label) + '</p><h2>' + S.escapeHtml(title) + '</h2><p class="muted">' + S.escapeHtml(text) + '</p></section><section class="section grid ' + (metrics.length === 4 ? "four" : "three") + '">' + metrics.join("") + '</section><section class="portal-actions section">' + actions.join("") + "</section>";
  }

  function portalAction(action, title, text) {
    return '<button class="portal-action-card" data-action="' + S.escapeHtml(action) + '"><strong>' + S.escapeHtml(title) + '</strong><span>' + S.escapeHtml(text) + "</span></button>";
  }

  function portalLink(routeName, title, text) {
    return '<a class="portal-action-card" href="#' + S.escapeHtml(routeName) + '"><strong>' + S.escapeHtml(title) + '</strong><span>' + S.escapeHtml(text) + "</span></a>";
  }

  function portalItemPanel(title, items, emptyText) {
    var rows = items.map(function (item) { return '<a class="rank-item" href="#' + S.escapeHtml(item.route) + '"><span>→</span><strong>' + S.escapeHtml(item.title) + '</strong><small>' + S.escapeHtml(item.meta) + "</small></a>"; }).join("");
    return '<section class="section panel"><div class="panel-head"><div><p class="eyebrow">Werkvoorraad</p><h2>' + S.escapeHtml(title) + '</h2></div></div>' + (rows ? '<div class="rank-list">' + rows + "</div>" : '<div class="empty-state">' + S.escapeHtml(emptyText) + "</div>") + "</section>";
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
      S.isAdmin() ? '<div data-project-dashboard-actions class="section panel"><div class="empty-state">Projectacties worden geladen…</div></div>' : "",
      '<section class="section grid four">',
      metric("Klanten", customers.length),
      metric("Open offertes", activeQuotes.length),
      metric("Open facturen", openInvoices.length),
      metric("Te laat", overdueInvoices.length),
      "</section>",
      revenueChartPanel(invoices),
      '<section class="quick-actions section">',
      '<a href="#sales-opportunity-new">Nieuwe lead<span>Start in de sales funnel</span></a>',
      '<a href="#sales-appointment-new">Plan afspraak<span>Zet de volgende salesactie vast</span></a>',
      '<a href="#customer-new">Nieuwe klant<span>Relatie vastleggen in CRM</span></a>',
      '<a href="#quote-new">Nieuwe offerte<span>Van advies naar opdracht</span></a>',
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
      ["geaccepteerd/aanbetaling", "Geaccepteerd/aanbetaling"],
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

  function safeHttpsUrl(value) {
    try {
      var url = new URL(String(value || ""));
      return url.protocol === "https:" ? url.href : "";
    } catch (_error) {
      return "";
    }
  }

  function googleBusinessProfile() {
    var settings = S.settings();
    var profile = settings.googleBusinessProfile || {};
    var query = [settings.companyName, settings.companyCity].filter(Boolean).join(" ") || "Climature";
    var searchUrl = "https://www.google.com/search?q=" + encodeURIComponent(query);
    var mapsUrl = safeHttpsUrl(profile.profileUrl) || "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
    var reviewUrl = safeHttpsUrl(profile.reviewUrl);
    return [
      '<section class="portal-hero section"><p class="eyebrow">Online vindbaarheid</p><h2>Google Bedrijfsprofiel beheren</h2><p class="muted">Werk bedrijfsinformatie, openingstijden, foto\'s, berichten en beoordelingen bij via het officiële Google-beheer.</p><div class="button-row google-business-actions"><a class="primary-button" href="https://business.google.com/locations" target="_blank" rel="noopener noreferrer">Open Google-beheer ↗</a><a class="ghost-button" href="' + S.escapeHtml(searchUrl) + '" target="_blank" rel="noopener noreferrer">Zoek profiel op Google ↗</a></div></section>',
      '<section class="grid two section">',
      '<form class="panel" data-form="google-business-settings"><div class="panel-head"><div><p class="eyebrow">Koppelingen</p><h2>Profiel instellen</h2></div><button class="primary-button" type="submit">Opslaan</button></div><p class="panel-note">Plak hier de openbare Maps-link en de link waarmee klanten direct een beoordeling kunnen schrijven.</p><div class="field-grid"><label class="field full">Openbare Google Maps-profiel-link<input name="profileUrl" type="url" inputmode="url" placeholder="https://maps.app.goo.gl/…" value="' + S.escapeHtml(profile.profileUrl || "") + '"></label><label class="field full">Link voor nieuwe beoordeling<input name="reviewUrl" type="url" inputmode="url" placeholder="https://g.page/r/…/review" value="' + S.escapeHtml(profile.reviewUrl || "") + '"></label></div></form>',
      '<section class="panel"><div class="panel-head"><div><p class="eyebrow">Snel openen</p><h2>Profiel en beoordelingen</h2></div></div><div class="google-business-links"><a class="portal-action-card" href="' + S.escapeHtml(mapsUrl) + '" target="_blank" rel="noopener noreferrer"><strong>Bekijk openbaar profiel ↗</strong><span>Controleer wat klanten op Google Maps zien.</span></a>' + (reviewUrl ? '<a class="portal-action-card" href="' + S.escapeHtml(reviewUrl) + '" target="_blank" rel="noopener noreferrer"><strong>Open beoordelingslink ↗</strong><span>Test de link voordat je hem met klanten deelt.</span></a><button class="portal-action-card" data-action="google-review-copy" data-url="' + S.escapeHtml(reviewUrl) + '"><strong>Kopieer beoordelingslink</strong><span>Zet de link direct op het klembord.</span></button>' : '<div class="empty-state">Sla eerst een beoordelingslink op om hem hier te testen en te kopiëren.</div>') + '</div></section>',
      '</section>',
      '<section class="section panel"><div class="panel-head"><div><p class="eyebrow">Profielcontrole</p><h2>Handige beheerpunten</h2></div></div><div class="google-business-checklist"><span>✓ Bedrijfsnaam, categorie en contactgegevens</span><span>✓ Openingstijden en afwijkende feestdagen</span><span>✓ Diensten, werkgebied en actuele foto\'s</span><span>✓ Nieuwe beoordelingen beantwoorden</span><span>✓ Updates en aanbiedingen publiceren</span><span>✓ Prestaties en zoekopdrachten bekijken</span></div></section>'
    ].join("");
  }

  function settings() {
    var data = S.settings();
    return [
      '<section class="grid two section">',
      ownAccountPanel(),
      accountManagementPanel(),
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
      projectDigestPanel(data.projectDigest || {}),
      serviceReminderPanel(data.serviceReminders || {}),
      adviceAssumptionsPanel(data.adviceAssumptions || {}),
      backupPanel(),
      "</section>"
    ].join("");
  }

  function account() {
    return '<section class="grid two section">' + ownAccountPanel() + (S.isAdmin() ? accountManagementPanel() : "") + "</section>";
  }

  function ownAccountPanel() {
    var user = S.user() || {};
    return [
      '<form class="panel" data-form="account">',
      '<div class="panel-head"><div><p class="eyebrow">Account</p><h2>Mijn login</h2></div><button class="primary-button" type="submit">Opslaan</button></div>',
      '<div class="field-grid">',
      '<label class="field">Gebruikersnaam<input name="username" autocomplete="username" required value="' + S.escapeHtml(user.username || "") + '"></label>',
      '<label class="field">Rol<input readonly value="' + S.escapeHtml(roleLabel(user.role)) + '"></label>',
      '<label class="field">Huidig wachtwoord<input name="currentPassword" type="password" autocomplete="current-password" required></label>',
      '<label class="field">Nieuw wachtwoord<input name="newPassword" type="password" autocomplete="new-password" placeholder="Laat leeg om niet te wijzigen"></label>',
      '<label class="field">Herhaal nieuw wachtwoord<input name="confirmPassword" type="password" autocomplete="new-password"></label>',
      "</div>",
      "</form>"
    ].join("");
  }

  function accountManagementPanel() {
    var users = S.read("users", []);
    if (!C.app.state.usersReady) {
      return '<section class="panel" data-users-panel><div class="panel-head"><div><p class="eyebrow">Beheer</p><h2>Accountbeheer</h2></div></div><div class="empty-state">Accounts worden geladen…</div></section>';
    }
    var rows = users.length ? users.map(userRow).join("") : '<div class="empty-state">Accounts worden geladen.</div>';
    return [
      '<section class="panel" data-users-panel>',
      '<div class="panel-head"><div><p class="eyebrow">Beheer</p><h2>Accountbeheer</h2></div><button class="ghost-button" data-action="users-refresh">Ververs</button></div>',
      '<form class="account-create" data-form="user-create">',
      '<div class="field-grid">',
      '<label class="field">Gebruikersnaam<input name="username" required autocomplete="off"></label>',
      '<label class="field">E-mail<input name="email" type="email" autocomplete="off"></label>',
      '<label class="field">Wachtwoord<input name="password" type="password" required autocomplete="new-password"></label>',
      '<label class="field">Rol<select name="role" required><option value="" selected disabled>Kies een rol</option>' + roleOptions("") + '</select></label>',
      '<label class="field">Werknemerskoppeling<select name="employeeId"><option value="">Niet gekoppeld</option>' + employeeOptions("") + '</select></label>',
      '<div class="field"><span>Nieuw account</span><button class="primary-button" type="submit">Toevoegen</button></div>',
      "</div>",
      "</form>",
      '<div class="account-list">' + rows + "</div>",
      "</section>"
    ].join("");
  }

  function userRow(user) {
    return [
      '<form class="account-row" data-form="user-update" data-id="' + S.escapeHtml(user.id) + '">',
      '<label class="field">Gebruikersnaam<input name="username" required value="' + S.escapeHtml(user.username || "") + '"></label>',
      '<label class="field">E-mail<input name="email" type="email" value="' + S.escapeHtml(user.email || "") + '"></label>',
      '<label class="field">Rol<select name="role">' + roleOptions(user.role) + '</select></label>',
      '<label class="field">Werknemerskoppeling<select name="employeeId"><option value="">Niet gekoppeld</option>' + employeeOptions(user.employeeId) + '</select></label>',
      '<label class="field">Status<select name="active"><option value="true"' + (user.active ? " selected" : "") + '>Actief</option><option value="false"' + (!user.active ? " selected" : "") + '>Uitgeschakeld</option></select></label>',
      '<label class="field">Nieuw wachtwoord<input name="password" type="password" autocomplete="new-password" placeholder="Ongewijzigd"></label>',
      '<div class="field"><span>' + S.escapeHtml(roleLabel(user.role)) + '</span><button class="small-button" type="submit">Opslaan</button></div>',
      "</form>"
    ].join("");
  }

  function roleOptions(selected) {
    return [
      '<option value="admin"' + (selected === "admin" ? " selected" : "") + '>Beheerder — alle portalen</option>',
      '<option value="crm"' + (selected === "crm" ? " selected" : "") + '>CRM</option>',
      '<option value="sales"' + (selected === "sales" ? " selected" : "") + '>Sales</option>',
      '<option value="execution"' + (selected === "execution" ? " selected" : "") + '>Uitvoering</option>',
      '<option value="finance"' + (selected === "finance" ? " selected" : "") + '>Financiën</option>',
      '<option value="installer"' + (selected === "installer" ? " selected" : "") + '>Installateur — beperkt</option>'
    ].join("");
  }

  function employeeOptions(selected) {
    return S.read("employeeDirectory", []).map(function (employee) {
      return '<option value="' + S.escapeHtml(employee.id) + '"' + (employee.id === selected ? " selected" : "") + '>' + S.escapeHtml(employee.displayName || employee.workName || employee.name || employee.employeeNumber) + '</option>';
    }).join("");
  }

  function roleLabel(role) {
    if (role === "admin") return "Beheerder";
    if (role === "crm") return "CRM";
    if (role === "sales") return "Sales";
    if (role === "execution") return "Uitvoering";
    if (role === "finance") return "Financiën";
    if (role === "installer") return "Installateur";
    return "Onbekend";
  }

  function projectDigestPanel(digest) {
    return [
      '<form class="panel" data-form="settings">',
      '<div class="panel-head"><div><p class="eyebrow">Actiecentrum</p><h2>Dagelijkse projectmail</h2></div><button class="primary-button" type="submit">Opslaan</button></div>',
      '<p class="muted">De server verstuurt maximaal één minimale actiemail per ontvanger en dag. Klantcontactgegevens, notities en inkoopprijzen worden niet opgenomen.</p>',
      '<div class="field-grid">',
      '<label class="field">Dagmail<select name="projectDigestEnabled" data-project-digest="enabled"><option value="true"' + (digest.enabled !== false ? " selected" : "") + '>Actief</option><option value="false"' + (digest.enabled === false ? " selected" : "") + '>Uit</option></select></label>',
      '<label class="field">Verzenduur Europe/Amsterdam<input name="projectDigestHour" data-project-digest="hour" type="number" min="0" max="23" value="' + S.escapeHtml(digest.hour == null ? 7 : digest.hour) + '"></label>',
      '<label class="field full">Extra ontvangers<input name="projectDigestRecipients" data-project-digest="recipients" type="text" value="' + S.escapeHtml(digest.recipients || "") + '" placeholder="planning@bedrijf.nl, werkvoorbereiding@bedrijf.nl"></label>',
      '</div></form>'
    ].join("");
  }

  function serviceReminderPanel(reminders) {
    return [
      '<form class="panel" data-form="settings">',
      '<div class="panel-head"><div><p class="eyebrow">Service</p><h2>Onderhoudsherinneringen</h2></div><button class="primary-button" type="submit">Opslaan</button></div>',
      '<p class="muted">Bepaalt welke actieve contracten worden meegenomen wanneer de herinneringsactie wordt gestart.</p>',
      '<div class="field-grid">',
      '<label class="field">Herinneringen<select name="serviceRemindersEnabled" data-service-reminder="enabled"><option value="true"' + (reminders.enabled !== false ? " selected" : "") + '>Actief</option><option value="false"' + (reminders.enabled === false ? " selected" : "") + '>Uit</option></select></label>',
      '<label class="field">Dagen vóór onderhoud<input name="serviceRemindersDaysBefore" data-service-reminder="daysBefore" type="number" min="1" max="180" value="' + S.escapeHtml(reminders.daysBefore == null ? 30 : reminders.daysBefore) + '"></label>',
      '</div></form>'
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
      ["Saleskansen", S.getAll("salesOpportunities").length],
      ["Producten", S.getAll("products").length],
      ["Notities", S.getAll("customerNotes").length],
      ["PDF's", S.getAll("customerDocuments").length]
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
    if (document.querySelector("[data-users-panel]") && S.isAdmin() && !C.app.state.usersLoading && !C.app.state.usersReady) {
      C.app.state.usersLoading = true;
      S.listUsers().then(function () {
        C.app.state.usersReady = true;
        C.app.state.usersLoading = false;
        render();
      }).catch(function (error) {
        C.app.state.usersLoading = false;
        toast(error.message || "Accounts laden mislukt.");
      });
    }
    if (C.projects && C.projects.loadActionCenter) C.projects.loadActionCenter();
    if (C.service && C.service.afterRender) C.service.afterRender();
  }

  function handleClick(event) {
    var target = event.target.closest("[data-action]");
    if (!target) return;
    var action = target.dataset.action;
    if (action === "logout") return logout();
    if (action === "portal-switch") navigate("portals");
    if (action === "account") navigate("account");
    if (action === "toggle-sidebar") document.body.classList.toggle("sidebar-open");
    if (action === "customers") navigate("customers");
    if (action === "customer-new") navigate("customer-new");
    if (action === "customer-import") navigate("customer-import");
    if (action === "customer-edit") navigate("customer-edit:" + target.dataset.id);
    if (action === "customer-detail") navigate("customer:" + target.dataset.id);
    if (action === "customer-projects") navigate("projects?customerId=" + target.dataset.id);
    if (action === "customer-workorder-print") printCustomerWorkOrder(target.dataset.id);
    if (action === "customer-delete") return C.customers.remove(target.dataset.id);
    if (action === "customer-note-delete") return C.customers.removeNote(target.dataset.id);
    if (action === "customer-document-open") return C.customers.openDocument(target.dataset.id);
    if (action === "customer-document-download") return C.customers.openDocument(target.dataset.id, true);
    if (action === "customer-document-delete") return C.customers.removeDocument(target.dataset.id);
    if (action === "customer-advice") navigate("advice:" + target.dataset.id);
    if (action === "customer-advice-v2") navigate("advice-v2:" + target.dataset.id);
    if (action === "advice-quote") return C.advice.createQuoteFromAdvice(target.dataset.id);
    if (action === "advice-delete") return C.customers.removeAdvice(target.dataset.id);
    if (action === "quote-new") navigate(target.dataset.customerId ? "quote-new?customerId=" + target.dataset.customerId : "quote-new");
    if (action === "quotes") navigate("quotes");
    if (action === "quote-detail") navigate("quote:" + target.dataset.id);
    if (action === "quote-edit") navigate("quote-edit:" + target.dataset.id);
    if (action === "quote-delete") return C.quotes.remove(target.dataset.id);
    if (action === "quote-status") return C.quotes.updateStatus(target.dataset.id, target.dataset.status);
    if (action === "quote-to-invoice") return C.invoices.saveFromQuote(target.dataset.id, target);
    if (action === "quote-to-installation") navigate("installation-from-quote:" + target.dataset.id);
    if (action === "quote-pdf") return C.pdf.downloadQuote(find("quotes", target.dataset.id));
    if (action === "quote-print") return C.pdf.printQuote(find("quotes", target.dataset.id));
    if (action === "quote-add-line") addLine("quote");
    if (action === "quote-remove-line") removeLine(target, "quote");
    if (action === "quote-add-component") C.quotes.addComponent(target.closest("form"));
    if (action === "quote-remove-component") C.quotes.removeComponent(target);
    if (action === "quote-add-benefit") C.quotes.addBenefit(target.closest("form"));
    if (action === "quote-remove-benefit") C.quotes.removeBenefit(target);
    if (action === "quote-template") C.quotes.applyTemplate(target.closest("form"), target.dataset.template);
    if (action === "quote-page-move") C.quotes.movePage(target);
    if (action === "quote-library-image") C.quotes.chooseLibraryImage(target);
    if (action === "quote-component-image") C.quotes.chooseComponentImage(target);
    if (action === "quote-zoom") C.quotes.zoomPreview(target.closest("form"), target.dataset.delta);
    if (action === "quote-draft-pdf") return C.quotes.downloadDraft(target.closest("form"));
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
    if (action === "sales-funnel") navigate("sales-funnel");
    if (action === "sales-opportunity-new") navigate("sales-opportunity-new");
    if (action === "sales-opportunity-detail") navigate("sales-opportunity:" + target.dataset.id);
    if (action === "sales-opportunity-edit") navigate("sales-opportunity-edit:" + target.dataset.id);
    if (action === "sales-opportunity-delete") return C.salesFunnel.remove(target.dataset.id);
    if (action === "sales-opportunity-stage") return C.salesFunnel.updateStage(target.dataset.id, target.dataset.stage);
    if (action === "sales-opportunity-next") return C.salesFunnel.nextStage(target.dataset.id);
    if (action === "sales-opportunity-quote") return C.salesFunnel.createQuote(target.dataset.id);
    if (action === "sales-agenda") navigate("sales-agenda");
    if (action === "sales-agenda-view" || action === "sales-agenda-period") navigate("sales-agenda?view=" + target.dataset.view + "&date=" + target.dataset.date);
    if (action === "sales-agenda-today") navigate("sales-agenda?view=" + target.dataset.view + "&date=" + S.today());
    if (action === "sales-appointment-new") navigate("sales-appointment-new" + (target.dataset.date ? "?date=" + target.dataset.date : target.dataset.opportunityId ? "?opportunityId=" + target.dataset.opportunityId : ""));
    if (action === "sales-appointment-detail") navigate("sales-appointment:" + target.dataset.id);
    if (action === "sales-appointment-edit") navigate("sales-appointment-edit:" + target.dataset.id);
    if (action === "sales-appointment-complete") return C.salesAgenda.complete(target.dataset.id);
    if (action === "sales-appointment-delete") return C.salesAgenda.remove(target.dataset.id);
    if (action === "installation-new") navigate(target.dataset.customerId ? "installation-new?customerId=" + target.dataset.customerId : "installation-new");
    if (action === "installations") navigate("installations");
    if (action === "installation-detail") navigate("installation:" + target.dataset.id);
    if (action === "installation-edit") navigate("installation-edit:" + target.dataset.id);
    if (action === "installation-delete") return C.installations.remove(target.dataset.id);
    if (action === "installation-workorder-print") printInstallationWorkOrder(target.dataset.id);
    if (action === "installation-view") navigate("installations?view=" + target.dataset.view + "&date=" + target.dataset.date);
    if (action === "installation-period") navigate("installations?view=" + target.dataset.view + "&date=" + target.dataset.date);
    if (action === "installation-today") navigate("installations?view=" + target.dataset.view + "&date=" + S.today());
    if (action.indexOf("project-") === 0 && C.projects) return C.projects.handleAction(target);
    if (action.indexOf("service-") === 0 && C.service) {
      if (action === "service-visit-new") return navigate("service-visit-new");
      return C.service.action(target);
    }
    if (action === "product-new") navigate("product-new");
    if (action === "products") navigate("products");
    if (action === "product-edit") navigate("product-edit:" + target.dataset.id);
    if (action === "product-delete") return removeProduct(target.dataset.id);
    if (action === "report-period") navigate("reports?period=" + target.dataset.period);
    if (action === "report-range") C.reports.applyRange();
    if (action === "report-export-invoices") C.reports.exportCsv("invoices");
    if (action === "report-export-quotes") C.reports.exportCsv("quotes");
    if (action === "advice-assumptions-refresh") return refreshAdviceAssumptions();
    if (action === "google-review-copy") return copyGoogleReviewLink(target.dataset.url);
    if (action === "backup-export") return exportBackup();
    if (action === "backup-import") openBackupImport();
    if (action === "backup-reset") return resetBackupData();
    if (action === "users-refresh") return S.listUsers().then(function () {
      toast("Accounts bijgewerkt.");
      render();
    });
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
    if (form.dataset.form === "quote") {
      C.quotes.syncLegacyContent(form, event.target);
      C.quotes.recalc(form);
    }
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
    if (action === "quote-benefit-change") C.quotes.changeBenefit(form, event.target);
    if (action === "quote-page-jump") C.quotes.jumpPage(form, event.target.value);
    if (action === "quote-image-upload") return C.quotes.uploadImage(form, event.target.files && event.target.files[0]);
    if (action === "quote-component-image-upload") return C.quotes.uploadComponentImage(form, event.target.files && event.target.files[0], event.target.closest("[data-component]"));
    if (event.target.closest("[data-page-row]")) C.quotes.updatePreview(form);
    if (action === "invoice-load-quote") {
      C.invoices.applyQuote(form, event.target.value);
    }
    if (action === "sales-stage-select") {
      C.salesFunnel.applyStageDefault(event.target);
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
    if (form.dataset.form === "customer-document") work = C.customers.saveDocumentFromForm(form);
    if (form.dataset.form === "quote") work = C.quotes.saveFromForm(form);
    if (form.dataset.form === "sales-opportunity") work = C.salesFunnel.saveFromForm(form);
    if (form.dataset.form === "sales-appointment") work = C.salesAgenda.saveFromForm(form);
    if (form.dataset.form === "invoice") work = C.invoices.saveFromForm(form);
    if (form.dataset.form === "installation") work = C.installations.saveFromForm(form);
    if (form.dataset.form === "workorder") work = C.installations.saveWorkOrderFromForm(form);
    if (form.dataset.form.indexOf("project-") === 0) work = C.projects.submit(form);
    if (form.dataset.form.indexOf("service-") === 0) work = C.service.submit(form);
    if (form.dataset.form === "product") work = saveProductFromForm(form);
    if (form.dataset.form === "account") work = saveOwnAccount(form);
    if (form.dataset.form === "user-create") work = createUserFromForm(form);
    if (form.dataset.form === "user-update") work = updateUserFromForm(form);
    if (form.dataset.form === "google-business-settings") {
      var googleData = Object.fromEntries(new FormData(form).entries());
      work = S.saveSettings({ googleBusinessProfile: googleData }).then(function () {
        toast("Google Bedrijfsprofiel-links opgeslagen.");
        render();
      });
    }
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

  function saveOwnAccount(form) {
    var data = Object.fromEntries(new FormData(form).entries());
    if (data.newPassword && data.newPassword !== data.confirmPassword) {
      toast("Nieuwe wachtwoorden komen niet overeen.");
      return;
    }
    return S.updateMe({
      username: data.username,
      currentPassword: data.currentPassword,
      newPassword: data.newPassword
    }).then(function () {
      toast("Account bijgewerkt.");
      form.reset();
      navigate("account");
      render();
    });
  }

  function copyGoogleReviewLink(url) {
    if (!url) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(url).then(function () {
        toast("Beoordelingslink gekopieerd.");
      });
    }
    window.prompt("Kopieer de beoordelingslink:", url);
  }

  function createUserFromForm(form) {
    var data = Object.fromEntries(new FormData(form).entries());
    if (!data.role) throw new Error("Kies eerst een rol voor het nieuwe account.");
    return S.createUser(data).then(function (created) {
      C.app.state.usersReady = true;
      toast("Account " + created.username + " aangemaakt als " + roleLabel(created.role) + ".");
      render();
    });
  }

  function updateUserFromForm(form) {
    var data = Object.fromEntries(new FormData(form).entries());
    data.active = data.active === "true";
    if (!data.password) delete data.password;
    return S.updateUser(form.dataset.id, data).then(function () {
      C.app.state.usersReady = true;
      toast("Account opgeslagen.");
      render();
    });
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
    if (form.querySelector("[data-project-digest]")) {
      payload.projectDigest = Object.assign({}, settings.projectDigest || {});
      Array.from(form.querySelectorAll("[data-project-digest]")).forEach(function (field) {
        var value = field.dataset.projectDigest === "hour" ? Number(field.value) : field.dataset.projectDigest === "enabled" ? field.value === "true" : field.value;
        payload.projectDigest[field.dataset.projectDigest] = value;
        delete payload[field.name];
      });
    }
    if (form.querySelector("[data-service-reminder]")) {
      payload.serviceReminders = Object.assign({}, settings.serviceReminders || {});
      Array.from(form.querySelectorAll("[data-service-reminder]")).forEach(function (field) {
        payload.serviceReminders[field.dataset.serviceReminder] = field.dataset.serviceReminder === "daysBefore" ? Number(field.value) : field.value === "true";
        delete payload[field.name];
      });
    }
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
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("service-worker.js").catch(function () {});
      });
    }
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
    document.addEventListener("change", function (event) {
      Promise.resolve(handleChange(event)).catch(function (error) { toast(error.message || "Wijziging verwerken mislukt."); });
    });
    document.addEventListener("submit", function (event) {
      Promise.resolve(handleSubmit(event)).catch(function (error) {
        toast(error.message || "Opslaan mislukt.");
      });
    });
    S.init().then(function () {
      return S.listEmployeeDirectory().catch(function () { return []; });
    }).then(function () {
      guardedRender();
    }).catch(function (error) {
      showLogin();
      toast(error.message || "Server niet bereikbaar.");
    });
  }

  init();
}());
