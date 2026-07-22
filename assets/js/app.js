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
  var renderSequence = 0;
  var searchTimer = null;
  var dirtyForm = null;
  var dirtyRoute = "";
  var hashGuard = false;
  var menuReturnFocus = null;
  var energyPricePollTimer = null;

  var routeMeta = {
    portals: ["Werkruimte", "Kies een portaal"],
    "crm-portal": ["CRM", "CRM-overzicht"],
    "sales-portal": ["Sales", "Salesoverzicht"],
    "execution-portal": ["Uitvoering", "Uitvoeringsoverzicht"],
    "finance-portal": ["Financiën", "Financieel overzicht"],
    "wasco-portal": ["Inkoop", "Wasco koppeling"],
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
    inventory: ["Uitvoering", "Voorraadbeheer"],
    service: ["Service", "Service & onderhoud"],
    invoices: ["Financiën", "Facturen"],
    payments: ["Financiën", "Betalingen & kassa"],
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

  function confirmDialog(options) {
    options = typeof options === "string" ? { message: options } : (options || {});
    var dialog = document.getElementById("app-dialog");
    if (!dialog || typeof dialog.showModal !== "function") return Promise.resolve(window.confirm(options.message || "Weet u het zeker?"));
    var title = document.getElementById("app-dialog-title");
    var message = document.getElementById("app-dialog-message");
    var inputLabel = dialog.querySelector(".dialog-input");
    var input = document.getElementById("app-dialog-input");
    var confirmButton = document.getElementById("app-dialog-confirm");
    title.textContent = options.title || "Actie bevestigen";
    message.textContent = options.message || "Weet u het zeker?";
    confirmButton.textContent = options.confirmLabel || "Bevestigen";
    confirmButton.className = options.danger === false ? "primary-button" : "danger-button";
    inputLabel.hidden = !options.input;
    input.value = options.value || "";
    inputLabel.firstChild.textContent = options.inputLabel || "Invoer";
    return new Promise(function (resolve) {
      function closed() {
        dialog.removeEventListener("close", closed);
        resolve(dialog.returnValue === "confirm" ? (options.input ? input.value : true) : (options.input ? null : false));
      }
      dialog.addEventListener("close", closed);
      dialog.showModal();
      window.setTimeout(function () { (options.input ? input : dialog.querySelector('[value="cancel"]')).focus(); }, 0);
    });
  }

  function setSidebar(open, restoreFocus) {
    var button = document.querySelector('[data-action="toggle-sidebar"]');
    var sidebar = document.getElementById("main-navigation");
    document.body.classList.toggle("sidebar-open", Boolean(open));
    if (button) { button.setAttribute("aria-expanded", open ? "true" : "false"); button.setAttribute("aria-label", open ? "Menu sluiten" : "Menu openen"); }
    if (open) {
      menuReturnFocus = document.activeElement;
      var close = sidebar && sidebar.querySelector(".sidebar-close");
      if (close) close.focus();
    } else if (restoreFocus && menuReturnFocus && menuReturnFocus.focus) {
      menuReturnFocus.focus();
    }
  }

  function markDirty(form) {
    if (!form || ["login", "user-update", "user-create", "account"].indexOf(form.dataset.form) >= 0) return;
    dirtyForm = form;
    dirtyRoute = route();
  }

  function clearDirty(form) {
    if (!form || dirtyForm === form) { dirtyForm = null; dirtyRoute = ""; }
  }

  function requestNavigation(nextRoute) {
    if (!dirtyForm || nextRoute === route()) { window.location.hash = "#" + nextRoute; return Promise.resolve(true); }
    return confirmDialog({ title: "Niet-opgeslagen wijzigingen", message: "Uw wijzigingen zijn nog niet opgeslagen. Wilt u deze pagina toch verlaten?", confirmLabel: "Pagina verlaten" }).then(function (confirmed) {
      if (!confirmed) return false;
      clearDirty();
      window.location.hash = "#" + nextRoute;
      return true;
    });
  }

  function navigate(route) {
    return requestNavigation(route);
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
    if (["execution-portal", "projects", "installations", "inventory"].indexOf(baseRoute) >= 0) return "execution";
    if (["finance-portal", "invoices", "payments", "reports"].indexOf(baseRoute) >= 0) return "finance";
    if (baseRoute === "wasco-portal") return "wasco";
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
      if (visible && link.dataset.routeLink === baseRoute) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
    });
    var hrLink = document.getElementById("hr-portal-link");
    if (hrLink) hrLink.hidden = !(S.isAdmin() && S.isHrPortalEnabled());
    Array.from(document.querySelectorAll("[data-nav-group]")).forEach(function (group) {
      var belongsToPortal = group.dataset.portal === "global" || group.dataset.portal === activePortal;
      group.hidden = !belongsToPortal || !group.querySelector("a:not([hidden])");
    });
    actionsEl.innerHTML = topActions(baseRoute) + (baseRoute === "portals" ? "" : '<button class="ghost-button" data-action="portal-switch">Portalen</button>') + '<button class="ghost-button" data-action="account">Mijn account</button><button class="ghost-button" data-action="logout">Uitloggen</button>';
    setSidebar(false, false);
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
    if (portal === "wasco") return S.hasRole("execution");
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

  function currentQuery(current) {
    return new URLSearchParams(String(current || route()).split("?")[1] || "");
  }

  function listParams(current, extra) {
    var params = currentQuery(current);
    return Object.assign({
      page: Number(params.get("page") || 1),
      pageSize: 25,
      search: params.get("search") || "",
      view: "summary"
    }, extra || {});
  }

  function loadCollection(collection, params) {
    if (S.isLegacyMode && S.isLegacyMode()) return Promise.resolve();
    return S.query(collection, params || { page: 1, pageSize: 25 });
  }

  function loadCustomerFor(item) {
    if (!item || !item.customerId || S.getAll("customers").some(function (customer) { return customer.id === item.customerId; })) return Promise.resolve();
    return S.getDetail("customers", item.customerId).then(function () {});
  }

  function prepareRoute(current) {
    if (S.isLegacyMode && S.isLegacyMode()) return Promise.resolve();
    var path = current.split("?")[0];
    var params = currentQuery(current);
    var id;
    if (path === "crm-portal") return S.dashboard("crm");
    if (path === "sales-portal") return S.dashboard("sales");
    if (path === "execution-portal") return S.dashboard("execution");
    if (path === "finance-portal") return S.dashboard("finance");
    if (path === "management-portal") return Promise.all([
      S.dashboard("management"),
      S.loadEnergyPrices().catch(function () { return null; })
    ]);
    if (path === "wasco-portal") return C.wasco.load(current);
    if (path === "customers") return loadCollection("customers", listParams(current, { sortBy: "createdAt", sortOrder: "desc" }));
    if (path === "quotes" || path === "quote-studio") return loadCollection("quotes", listParams(current, { sortBy: "createdAt", sortOrder: "desc" }));
    if (path === "invoices") return loadCollection("invoices", listParams(current, { sortBy: "createdAt", sortOrder: "desc" }));
    if (path === "payments") return Promise.all([loadCollection("invoices", { page: 1, pageSize: 100, view: "summary" }), C.payments.load(current)]);
    if (path === "payment-new") return Promise.all([loadCollection("invoices", { page: 1, pageSize: 100, view: "summary" }), C.payments.load("payments")]);
    if (path.indexOf("payment:") === 0) return C.payments.load(current);
    if (path === "installations") return Promise.all([loadCollection("installations", listParams(current, { sortBy: "plannedDate", sortOrder: "asc" })), loadCollection("customers", { page: 1, pageSize: 100, view: "summary" })]);
    if (path === "inventory" || path.indexOf("inventory-edit:") === 0) return C.inventory.load(current);
    if (path === "products") return S.loadProductCatalog();
    if (path === "sales-funnel") return Promise.all([loadCollection("salesOpportunities", { page: 1, pageSize: 100 }), loadCollection("customers", { page: 1, pageSize: 100, view: "summary" }), loadCollection("quotes", { page: 1, pageSize: 100, view: "summary" })]);
    if (path === "sales-agenda") return Promise.all([loadCollection("salesAppointments", { page: 1, pageSize: 100 }), loadCollection("salesOpportunities", { page: 1, pageSize: 100 }), loadCollection("customers", { page: 1, pageSize: 100, view: "summary" })]);
    if (path === "messages") return loadCollection("customers", { page: 1, pageSize: 100, view: "summary" });
    if (path === "advice" || path.indexOf("advice:") === 0 || path === "advice-v2" || path.indexOf("advice-v2:") === 0) return Promise.all([loadCollection("customers", { page: 1, pageSize: 100, view: "summary" }), S.loadProductCatalog()]);
    if (path === "customer-new" || path === "customer-import") return Promise.resolve();
    if (path.indexOf("customer:") === 0 || path.indexOf("customer-edit:") === 0) {
      id = path.split(":")[1];
      return S.getDetail("customers", id).then(function () {
        if (path.indexOf("customer-edit:") === 0) return null;
        return Promise.all([
          loadCollection("customerNotes", { page: 1, pageSize: 100, customerId: id }),
          loadCollection("customerDocuments", { page: 1, pageSize: 100, customerId: id }),
          loadCollection("quotes", { page: 1, pageSize: 100, customerId: id }),
          loadCollection("invoices", { page: 1, pageSize: 100, customerId: id }),
          loadCollection("installations", { page: 1, pageSize: 100, customerId: id }),
          loadCollection("advices", { page: 1, pageSize: 100, customerId: id })
        ]);
      });
    }
    if (path === "quote-new") return Promise.all([loadCollection("customers", { page: 1, pageSize: 20, search: params.get("customerSearch") || "", view: "summary" }), S.loadProductCatalog()]);
    if (path.indexOf("quote:") === 0 || path.indexOf("quote-edit:") === 0) { id = path.split(":")[1]; return Promise.all([S.getDetail("quotes", id).then(loadCustomerFor), S.loadProductCatalog()]); }
    if (path === "invoice-new" || path.indexOf("invoice-from-quote:") === 0) return Promise.all([loadCollection("customers", { page: 1, pageSize: 20, view: "summary" }), loadCollection("quotes", { page: 1, pageSize: 100, view: "summary" })]);
    if (path.indexOf("invoice:") === 0 || path.indexOf("invoice-edit:") === 0) { id = path.split(":")[1]; return Promise.all([S.getDetail("invoices", id).then(loadCustomerFor), loadCollection("quotes", { page: 1, pageSize: 100, view: "summary" })]); }
    if (path === "installation-new" || path.indexOf("installation-from-quote:") === 0) return Promise.all([loadCollection("customers", { page: 1, pageSize: 20, view: "summary" }), loadCollection("quotes", { page: 1, pageSize: 100, view: "summary" })]);
    if (path.indexOf("installation:") === 0 || path.indexOf("installation-edit:") === 0) { id = path.split(":")[1]; return S.getDetail("installations", id).then(loadCustomerFor); }
    if (path === "reports" && C.reports && C.reports.currentRange) { var reportRange = C.reports.currentRange(); return S.reportSummary({ from: reportRange.from, to: reportRange.to }); }
    return Promise.resolve();
  }

  function routeBase(current) {
    var path = current.split("?")[0], base = path.split(":")[0];
    if (base.indexOf("customer") === 0) return "customers";
    if (base.indexOf("quote") === 0 && base !== "quote-studio") return "quotes";
    if (base.indexOf("invoice") === 0) return "invoices";
    if (base.indexOf("payment") === 0) return "payments";
    if (base.indexOf("installation") === 0) return "installations";
    if (base.indexOf("inventory") === 0) return "inventory";
    return base;
  }

  function guardedRender() {
    if (!isAuthenticated()) {
      showLogin();
      return Promise.resolve();
    }
    showApp();
    var current = route();
    var currentPath = current.split("?")[0];
    if (!(currentPath === "quote-new" || currentPath.indexOf("quote-edit:") === 0)) delete C.app.state.quoteDraftOverride;
    var sequence = ++renderSequence;
    setMeta(routeBase(current));
    appEl.setAttribute("aria-busy", "true");
    if (!(current === "portals" || current === "dashboard")) appEl.innerHTML = '<section class="panel section loading-state" role="status"><div class="loading-spinner" aria-hidden="true"></div><p>Gegevens worden geladen…</p></section>';
    return Promise.resolve(prepareRoute(current)).then(function () {
      if (sequence !== renderSequence || current !== route()) return;
      render();
    }).catch(function (error) {
      if (error && error.name === "AbortError") return;
      if (sequence !== renderSequence) return;
      appEl.setAttribute("aria-busy", "false");
      appEl.innerHTML = '<section class="panel section error-state" role="alert"><h2>Dit onderdeel kon niet worden geladen</h2><p>' + S.escapeHtml(error.message || "Onbekende fout") + '</p>' + (error.requestId ? '<p class="muted">Referentie: ' + S.escapeHtml(error.requestId) + '</p>' : '') + '<button class="primary-button" data-action="route-retry">Opnieuw proberen</button></section>';
    });
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
    if (baseRoute === "payments" && S.canManage("finance")) return '<button class="primary-button" data-action="payment-new">Betaling registreren</button>';
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
    if (path !== "management-portal") stopEnergyPricePolling();
    var base = path.split(":")[0];
    if (base === "customer") base = "customers";
    if (base === "customer-new" || base === "customer-edit" || base === "customer-import") base = "customers";
    if (base === "quote") base = "quotes";
    if (base === "quote-new" || base === "quote-edit") base = "quotes";
    if (base === "sales-opportunity" || base === "sales-opportunity-new" || base === "sales-opportunity-edit") base = "sales-funnel";
    if (base === "sales-appointment" || base === "sales-appointment-new" || base === "sales-appointment-edit") base = "sales-agenda";
    if (base === "invoice") base = "invoices";
    if (base === "invoice-new" || base === "invoice-edit" || base === "invoice-from-quote") base = "invoices";
    if (base === "payment" || base === "payment-new") base = "payments";
    if (base === "installation") base = "installations";
    if (base === "installation-new" || base === "installation-edit" || base === "installation-from-quote") base = "installations";
    if (base === "inventory-edit") base = "inventory";
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
    else if (path === "wasco-portal") appEl.innerHTML = C.wasco.render();
    else if (path === "dashboard") appEl.innerHTML = portalSelector();
    else if (path === "customers") appEl.innerHTML = C.customers.renderList(new URLSearchParams(current.split("?")[1] || "").get("search") || "");
    else if (path === "customer-new") appEl.innerHTML = C.customers.renderForm();
    else if (path === "customer-import") appEl.innerHTML = C.customers.renderImport();
    else if (path.indexOf("customer-edit:") === 0) appEl.innerHTML = C.customers.renderForm(findByRoute("customers", path));
    else if (path.indexOf("customer:") === 0) appEl.innerHTML = C.customers.renderDetail(path.split(":")[1]);
    else if (path === "quotes") appEl.innerHTML = C.quotes.renderList(new URLSearchParams(current.split("?")[1] || "").get("search") || "");
    else if (path === "quote-studio") appEl.innerHTML = C.quotes.renderList(new URLSearchParams(current.split("?")[1] || "").get("search") || "");
    else if (path === "quote-new") appEl.innerHTML = C.quotes.renderForm(C.app.state.quoteDraftOverride || customerSeed());
    else if (path.indexOf("quote-edit:") === 0) appEl.innerHTML = C.quotes.renderForm(C.app.state.quoteDraftOverride || findByRoute("quotes", path));
    else if (path.indexOf("quote:") === 0) appEl.innerHTML = C.quotes.renderDetail(path.split(":")[1]);
    else if (path === "sales-funnel") appEl.innerHTML = C.salesFunnel.render();
    else if (path === "sales-opportunity-new") appEl.innerHTML = C.salesFunnel.renderForm();
    else if (path.indexOf("sales-opportunity-edit:") === 0) appEl.innerHTML = C.salesFunnel.renderForm(findByRoute("salesOpportunities", path));
    else if (path.indexOf("sales-opportunity:") === 0) appEl.innerHTML = C.salesFunnel.renderDetail(path.split(":")[1]);
    else if (path === "sales-agenda") appEl.innerHTML = C.salesAgenda.render();
    else if (path === "sales-appointment-new") appEl.innerHTML = C.salesAgenda.renderForm();
    else if (path.indexOf("sales-appointment-edit:") === 0) appEl.innerHTML = C.salesAgenda.renderForm(findByRoute("salesAppointments", path));
    else if (path.indexOf("sales-appointment:") === 0) appEl.innerHTML = C.salesAgenda.renderDetail(path.split(":")[1]);
    else if (path === "invoices") appEl.innerHTML = C.invoices.renderList(new URLSearchParams(current.split("?")[1] || "").get("search") || "");
    else if (path === "invoice-new") appEl.innerHTML = C.invoices.renderForm(customerSeed());
    else if (path.indexOf("invoice-from-quote:") === 0) appEl.innerHTML = C.invoices.renderForm(C.invoices.createFromQuote(path.split(":")[1]));
    else if (path.indexOf("invoice-edit:") === 0) appEl.innerHTML = C.invoices.renderForm(findByRoute("invoices", path));
    else if (path.indexOf("invoice:") === 0) appEl.innerHTML = C.invoices.renderDetail(path.split(":")[1]);
    else if (path === "payments") appEl.innerHTML = C.payments.renderList();
    else if (path === "payment-new") appEl.innerHTML = C.payments.renderCreate(current);
    else if (path.indexOf("payment:") === 0) appEl.innerHTML = C.payments.renderDetail();
    else if (path === "reports") appEl.innerHTML = C.reports.render();
    else if (path === "installations") appEl.innerHTML = C.installations.renderList(new URLSearchParams(current.split("?")[1] || "").get("search") || "");
    else if (path === "installation-new") appEl.innerHTML = C.installations.renderForm(customerSeed());
    else if (path.indexOf("installation-from-quote:") === 0) appEl.innerHTML = C.installations.renderForm(C.installations.createFromQuote(path.split(":")[1]));
    else if (path.indexOf("installation-edit:") === 0) appEl.innerHTML = C.installations.renderForm(findByRoute("installations", path));
    else if (path.indexOf("installation:") === 0) appEl.innerHTML = C.installations.renderDetail(path.split(":")[1]);
    else if (path === "inventory") appEl.innerHTML = C.inventory.render();
    else if (path.indexOf("inventory-edit:") === 0) appEl.innerHTML = C.inventory.renderEdit(path.split(":")[1]);
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
    else if (path === "product-new") appEl.innerHTML = productForm(C.app.state.productSeed);
    else if (path.indexOf("product-edit:") === 0) appEl.innerHTML = productForm(findByRoute("products", path));
    else if (path === "messages") appEl.innerHTML = messages();
    else if (path === "settings") appEl.innerHTML = settings();
    else if (path === "account") appEl.innerHTML = account();
    else appEl.innerHTML = dashboard();

    afterRender();
    appEl.setAttribute("aria-busy", "false");
    appEl.focus({ preventScroll: true });
    titleEl.setAttribute("tabindex", "-1");
    titleEl.focus({ preventScroll: true });
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
    var counts = S.portalCounts ? S.portalCounts() : {};
    var cards = [
      S.hasRole("admin", "crm", "installer") ? portalCard("crm-portal", "CRM", "Klanten en relatiehistorie", "Open het klantenbestand en alle gekoppelde dossiers.", Number(counts.customers != null ? counts.customers : S.getAll("customers").length) + " klanten") : "",
      S.hasRole("admin", "sales") ? portalCard("sales-portal", "Sales", "Van lead naar opdracht", "Werk met de funnel, agenda, adviezen en offertes.", Number(counts.openOpportunities != null ? counts.openOpportunities : S.getAll("salesOpportunities").length) + " open kansen") : "",
      S.hasRole("admin", "execution", "installer") ? portalCard("execution-portal", "Uitvoering", "Projecten en installaties", "Plan werk, bereid projecten voor en rond werkbonnen af.", Number(counts.scheduledInstallations != null ? counts.scheduledInstallations : S.getAll("installations").length) + " ingepland") : "",
      S.hasRole("admin", "finance") ? portalCard("finance-portal", "Financiën", "Facturen en rapportage", "Volg openstaande bedragen, betalingen en omzet.", Number(counts.openInvoices != null ? counts.openInvoices : S.getAll("invoices").length) + " open facturen") : "",
      S.hasRole("admin", "execution") ? portalCard("wasco-portal", "Inkoop · Wasco", "Materialen en bestellijsten", "Zoek Wasco-artikelen, bekijk beschikbaarheid en bereid bestellingen voor.", (C.wasco ? C.wasco.cartCount() : 0) + " in bestellijst") : "",
      S.isAdmin() ? portalCard("management-portal", "Beheer", "Instellingen en hulpmiddelen", "Beheer producten, accounts, communicatie en HR.", Number(counts.products != null ? counts.products : S.getAll("products").length) + " producten") : ""
    ].join("");
    return '<section class="portal-hero section"><p class="eyebrow">Climature werkruimtes</p><h2>Waar wilt u werken?</h2><p class="muted">Elk portaal bevat alleen de functies die bij dat werkproces horen.</p></section><section class="portal-grid section">' + cards + "</section>";
  }

  function portalCard(routeName, title, subtitle, description, metricText) {
    return '<a class="portal-card" href="#' + S.escapeHtml(routeName) + '"><span class="portal-card-arrow">→</span><p class="eyebrow">' + S.escapeHtml(title) + '</p><h2>' + S.escapeHtml(subtitle) + '</h2><p>' + S.escapeHtml(description) + '</p><strong>' + S.escapeHtml(metricText) + "</strong></a>";
  }

  function crmPortal() {
    var dashboardState = S.dashboardState && S.dashboardState("crm");
    if (dashboardState) {
      var crmMetrics = dashboardState.metrics || {}, crmItems = dashboardState.items || {};
      return portalOverview("CRM", "Relaties centraal beheren", "Van eerste contact tot compleet klantdossier.", [
        metric("Totaal klanten", crmMetrics.totalCustomers || 0), metric("Nieuw deze maand", crmMetrics.newThisMonth || 0), metric("Contact aanvullen", crmMetrics.incompleteContact || 0)
      ], [portalAction("customer-new", "Nieuwe klant", "Leg een nieuwe relatie vast."), portalLink("customers", "Klantenbestand", "Zoek en open een bestaand dossier.")]) + portalItemPanel("Recent toegevoegd", (crmItems.recentCustomers || []).map(function (item) { return { title: S.customerName(item), meta: item.email || item.phone || "Contactgegevens aanvullen", route: "customer:" + item.id }; }), "Nog geen klanten toegevoegd.");
    }
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
    var dashboardState = S.dashboardState && S.dashboardState("sales");
    if (dashboardState) {
      var salesMetrics = dashboardState.metrics || {}, salesItems = dashboardState.items || {};
      return portalOverview("Sales", "Van lead naar opdracht", "Alle commerciële opvolging in één afgeschermde werkruimte.", [
        metric("Open kansen", salesMetrics.openOpportunities || 0), metric("Opvolging nodig", salesMetrics.dueFollowUps || 0), metric("Komende afspraken", salesMetrics.upcomingAppointments || 0), metric("Actieve offertes", salesMetrics.activeQuotes || 0)
      ], [portalAction("sales-opportunity-new", "Nieuwe lead", "Start een nieuwe saleskans."), portalAction("sales-appointment-new", "Plan afspraak", "Zet de volgende actie vast."), portalLink("sales-funnel", "Open funnel", "Bekijk alle fasen en waarden."), portalLink("quotes", "Open offertes", "Werk concepten en reacties bij.")]) + portalItemPanel("Eerstvolgende afspraken", (salesItems.upcomingAppointments || []).map(function (item) { return { title: item.title, meta: S.formatDate(item.date) + " · " + item.startTime, route: "sales-appointment:" + item.id }; }), "Geen komende salesafspraken.");
    }
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
    var dashboardState = S.dashboardState && S.dashboardState("execution");
    if (dashboardState) {
      var executionMetrics = dashboardState.metrics || {}, executionItems = dashboardState.items || {};
      return portalOverview("Uitvoering", "Van voorbereiding naar oplevering", "Projecttaken, materialen, bezetting en installatieplanning bij elkaar.", [
        metric("Vandaag", executionMetrics.todayInstallations || 0), metric("Ingepland", executionMetrics.scheduledInstallations || 0), metric("Uitgevoerd", executionMetrics.completedInstallations || 0)
      ], [S.canManage("execution") ? portalAction("installation-new", "Nieuwe installatie", "Plan een nieuwe opdracht in.") : "", portalLink("projects", "Projecten", "Controleer voorbereiding en acties."), portalLink("installations", "Installatieplanning", "Bekijk week, maand en werkbonnen.")]) + portalItemPanel("Projectacties", (executionItems.projectActions || []).map(function (item) { return { title: item.title, meta: item.customerName + " · " + S.formatDate(item.dueDate), route: "project:" + item.projectId }; }), "Alle projecten liggen op schema.") + portalItemPanel("Eerstvolgende installaties", (executionItems.upcomingInstallations || []).map(function (item) { return { title: S.customerName(item.customer), meta: S.formatDate(item.plannedDate) + " · " + item.startTime, route: "installation:" + item.id }; }), "Geen installaties ingepland.");
    }
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
    var dashboardState = S.dashboardState && S.dashboardState("finance");
    if (dashboardState) {
      var financeMetrics = dashboardState.metrics || {}, financeItems = dashboardState.items || {};
      return portalOverview("Financiën", "Geldstromen onder controle", "Facturen, vervaldata, betalingen en rapportages gescheiden van sales en uitvoering.", [
        metric("Openstaand", S.money(financeMetrics.outstandingAmount || 0)), metric("Verlopen", financeMetrics.overdueInvoices || 0), metric("Omzet deze maand", S.money(financeMetrics.revenueThisMonth || 0))
      ], [portalAction("payment-new", "Betaling registreren", "Verwerk een betaling of deelbetaling."), portalLink("invoices", "Facturen", "Volg factuurstatussen."), portalLink("payments", "Betalingen & kassa", "Beheer betaalmiddelen, refunds en diensten."), portalLink("reports", "Rapportage", "Analyseer omzet en exporteer CSV.")]) + portalItemPanel("Aandacht nodig", (financeItems.urgentInvoices || []).map(function (item) { return { title: item.invoiceNumber + " · " + S.customerName(item.customer), meta: S.formatDate(item.dueDate) + " · " + S.money(item.total || 0), route: "invoice:" + item.id }; }), "Geen verlopen facturen.");
    }
    var invoices = S.getAll("invoices");
    var today = S.today();
    var open = invoices.filter(function (item) { return item.status === "verzonden" || item.status === "verlopen"; });
    var overdue = open.filter(function (item) { return item.status === "verlopen" || item.dueDate < today; });
    var paidMonth = invoices.filter(function (item) { return item.status === "betaald" && String(item.paidAt || item.statusUpdatedAt || "").slice(0, 7) === today.slice(0, 7); });
    return portalOverview("Financiën", "Geldstromen onder controle", "Facturen, vervaldata, betalingen en rapportages gescheiden van sales en uitvoering.", [
      metric("Openstaand", S.money(sumTotals(open))), metric("Verlopen", S.money(sumTotals(overdue))), metric("Betaald deze maand", S.money(sumTotals(paidMonth)))
    ], [
      portalAction("payment-new", "Betaling registreren", "Verwerk een betaling of deelbetaling."), portalLink("invoices", "Facturen", "Volg factuurstatussen."), portalLink("payments", "Betalingen & kassa", "Beheer betaalmiddelen, refunds en diensten."), portalLink("reports", "Rapportage", "Analyseer omzet en exporteer CSV.")
    ]) + revenueChartPanel(invoices) + portalItemPanel("Aandacht nodig", overdue.slice(0, 6).map(function (item) { return { title: item.invoiceNumber, meta: S.formatDate(item.dueDate) + " · " + S.money(item.total || 0), route: "invoice:" + item.id }; }), "Geen verlopen facturen.");
  }

  function managementPortal() {
    var managementState = S.dashboardState && S.dashboardState("management");
    var productCount = managementState && managementState.metrics ? managementState.metrics.productCount : S.getAll("products").length;
    return portalOverview("Beheer", "Applicatie en stamdata beheren", "Configuratie en hulpmiddelen staan los van de dagelijkse werkprocessen.", [
      metric("Producten", productCount || 0), metric("Betaaltermijn", Number(S.settings().paymentDays || 14) + " dagen"), metric("HR-portaal", S.isHrPortalEnabled() ? "Actief" : "Uit")
    ], [
      portalLink("quote-studio", "Offertebouwer", "Ontwerp offertes met producttemplates en regelingen."), portalLink("products", "Producten", "Beheer catalogus en prijzen."), portalLink("messages", "Tekstgenerator", "Maak klantcommunicatie."), portalLink("google-business", "Google Bedrijfsprofiel", "Werk profielgegevens, foto's en beoordelingen bij."), portalLink("settings", "Instellingen", "Bedrijf, accounts en aannames.")
    ]) + energyPriceDashboard() + '<section class="section portal-management-grid"><a class="panel portal-management-card" href="#google-business"><p class="eyebrow">Online vindbaarheid</p><h2>Google Bedrijfsprofiel</h2><p class="muted">Open het officiële Google-beheer en bewaar de profiel- en beoordelingslink.</p></a><a class="panel portal-management-card" href="#settings"><p class="eyebrow">Configuratie</p><h2>Instellingen en accounts</h2><p class="muted">Beheer bedrijfsgegevens, gebruikers, adviesaannames, digest en back-ups.</p></a>' + (S.isHrPortalEnabled() ? '<a class="panel portal-management-card" href="/medewerkers/"><p class="eyebrow">Beveiligd</p><h2>Werknemersportaal</h2><p class="muted">Open HR-dossiers, kwalificaties, roosters en checklists met extra verificatie.</p></a>' : "") + "</section>";
  }

  function energyPriceValue(value, unit) {
    var number = Number(value);
    if (!Number.isFinite(number)) return "Niet beschikbaar";
    var digits = unit === "EUR/kWh" ? 3 : 3;
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(number) + (unit === "EUR/kWh" ? "/kWh" : "/m³");
  }

  function energyDateKey(value) {
    var parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).map(function (part) { return [part.type, part.value]; }));
    return parts.year + "-" + parts.month + "-" + parts.day;
  }

  function livePoint(points) {
    var now = Date.now();
    return (points || []).find(function (point) { return Date.parse(point.start) <= now && now < Date.parse(point.end); }) || null;
  }

  function energyPointLabel(point, kind) {
    var date = new Date(point.start);
    var label = kind === "electricity"
      ? new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date)
      : new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short", day: "numeric", month: "short" }).format(date);
    return label + ": " + energyPriceValue(point.price, kind === "electricity" ? "EUR/kWh" : "EUR/m3");
  }

  function energyChart(data, kind) {
    var points = data.points || [];
    if (!points.length) return '<div class="empty-state">Geen prijsgegevens beschikbaar.</div>';
    var width = 760, height = 270, padL = 58, padR = 18, padT = 26, padB = 42;
    var plotW = width - padL - padR, plotH = height - padT - padB;
    var values = points.map(function (point) { return Number(point.price); });
    var minimum = Math.min.apply(null, values), maximum = Math.max.apply(null, values);
    var padding = Math.max((maximum - minimum) * 0.12, kind === "electricity" ? 0.01 : 0.03);
    var low = minimum - padding, high = maximum + padding;
    if (low === high) { low -= 1; high += 1; }
    function x(index) { return padL + (points.length === 1 ? plotW / 2 : plotW * index / (points.length - 1)); }
    function y(value) { return padT + (high - value) / (high - low) * plotH; }
    var path = points.map(function (point, index) { return (index ? "L" : "M") + x(index).toFixed(1) + " " + y(Number(point.price)).toFixed(1); }).join(" ");
    var today = energyDateKey(new Date());
    var forecastIndex = points.findIndex(function (point) { return point.forecast || energyDateKey(point.start) > today; });
    var forecast = "";
    if (forecastIndex >= 0) {
      var forecastX = Math.max(padL, x(forecastIndex) - (points.length > 1 ? plotW / (points.length - 1) / 2 : 0));
      forecast = '<rect class="energy-chart-forecast" x="' + forecastX.toFixed(1) + '" y="' + padT + '" width="' + (width - padR - forecastX).toFixed(1) + '" height="' + plotH + '"></rect><text class="energy-chart-forecast-label" x="' + (forecastX + 8).toFixed(1) + '" y="' + (padT + 16) + '">Morgen</text>';
    }
    var zero = low < 0 && high > 0 ? '<line class="energy-chart-zero" x1="' + padL + '" y1="' + y(0).toFixed(1) + '" x2="' + (width - padR) + '" y2="' + y(0).toFixed(1) + '"></line>' : "";
    var current = livePoint(points);
    var dots = points.map(function (point, index) {
      var label = energyPointLabel(point, kind);
      var currentClass = current && current.start === point.start ? " is-current" : "";
      return '<circle class="energy-chart-point' + currentClass + '" cx="' + x(index).toFixed(1) + '" cy="' + y(Number(point.price)).toFixed(1) + '" r="' + (currentClass ? 6 : 3.5) + '" tabindex="0" role="img" aria-label="' + S.escapeHtml(label) + '"><title>' + S.escapeHtml(label) + "</title></circle>";
    }).join("");
    var labelEvery = Math.max(1, Math.ceil(points.length / 7));
    var labels = points.map(function (point, index) {
      if (index % labelEvery !== 0 && index !== points.length - 1) return "";
      var text = kind === "electricity"
        ? new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" }).format(new Date(point.start))
        : new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short" }).format(new Date(point.start));
      return '<text class="energy-chart-axis-label" x="' + x(index).toFixed(1) + '" y="' + (height - 14) + '" text-anchor="middle">' + S.escapeHtml(text) + "</text>";
    }).join("");
    var aria = kind === "electricity" ? "Elektriciteitsprijzen per uur voor vandaag en morgen" : "Gasprijzen per dag voor de laatste dertig dagen";
    return '<div class="energy-chart-wrap"><svg class="energy-chart-svg" viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="' + aria + '" preserveAspectRatio="xMidYMid meet">' +
      forecast + zero +
      '<line class="energy-chart-baseline" x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (width - padR) + '" y2="' + (padT + plotH) + '"></line>' +
      '<text class="energy-chart-value-label" x="' + (padL - 8) + '" y="' + (padT + 4) + '" text-anchor="end">' + S.escapeHtml(maximum.toFixed(3)) + '</text>' +
      '<text class="energy-chart-value-label" x="' + (padL - 8) + '" y="' + (padT + plotH) + '" text-anchor="end">' + S.escapeHtml(minimum.toFixed(3)) + '</text>' +
      '<path class="energy-chart-line ' + kind + '" d="' + path + '"></path>' + dots + labels + "</svg></div>";
  }

  function energyPriceCard(data, kind) {
    var points = data.points || [];
    var current = livePoint(points) || data.current;
    var values = points.map(function (point) { return Number(point.price); }).filter(Number.isFinite);
    var minimum = values.length ? Math.min.apply(null, values) : null;
    var maximum = values.length ? Math.max.apply(null, values) : null;
    var electricity = kind === "electricity";
    var tomorrowAvailable = !electricity || points.some(function (point) { return point.forecast; });
    return '<article class="panel energy-price-card ' + kind + '"><div class="panel-head"><div><p class="eyebrow">' + (electricity ? "Elektriciteit · per uur" : "Gas · per dag") + '</p><h3>' + (electricity ? "Vandaag en morgen" : "Laatste 30 dagen") + '</h3></div><strong class="energy-current-price">' + energyPriceValue(current && current.price, data.unit) + '</strong></div><div class="energy-price-stats"><span>Laagste<strong>' + energyPriceValue(minimum, data.unit) + '</strong></span><span>Hoogste<strong>' + energyPriceValue(maximum, data.unit) + '</strong></span></div>' + energyChart(data, kind) + (!tomorrowAvailable ? '<p class="energy-price-note">De stroomprijzen voor morgen zijn nog niet gepubliceerd.</p>' : "") + "</article>";
  }

  function energyPriceDashboard() {
    var state = S.energyPriceState ? S.energyPriceState() : { status: "idle" };
    var data = state.data;
    if (!data) {
      var message = state.status === "error" ? (state.error && state.error.message || "Actuele energieprijzen konden niet worden geladen.") : "Actuele energieprijzen worden geladen…";
      return '<section class="section panel energy-price-dashboard" data-energy-price-dashboard><div class="panel-head"><div><p class="eyebrow">Live energiemarkt</p><h2>Gas- en elektriciteitsprijzen</h2></div><button class="ghost-button" data-action="energy-prices-refresh">Opnieuw proberen</button></div><div class="empty-state" role="status">' + S.escapeHtml(message) + "</div></section>";
    }
    var source = data.source || {};
    var fetchedAt = source.fetchedAt ? new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "medium", timeStyle: "short" }).format(new Date(source.fetchedAt)) : "onbekend";
    var stale = source.status === "stale" || state.status === "error";
    var offline = S.isOnline && !S.isOnline();
    var status = offline ? "Offline · laatst geladen " + fetchedAt : stale ? "Verouderde gegevens · bijgewerkt " + fetchedAt : "Live bijgewerkt " + fetchedAt;
    var warning = source.warning || (state.status === "error" ? "Vernieuwen is mislukt; de laatst geladen prijzen blijven zichtbaar." : "");
    var sourceUrl = safeHttpsUrl(source.url) || "https://docs.api.energyzero.nl/";
    return '<section class="section energy-price-dashboard" data-energy-price-dashboard><div class="panel energy-price-header"><div><p class="eyebrow">Live energiemarkt</p><h2>Gas- en elektriciteitsprijzen</h2><p class="muted">Dynamische energiecomponent inclusief energiebelasting en btw; exclusief vaste kosten.</p></div><div class="energy-price-controls"><span class="energy-price-status' + (stale || offline ? " is-stale" : "") + '">' + S.escapeHtml(status) + '</span><button class="ghost-button" data-action="energy-prices-refresh"' + (state.status === "loading" ? " disabled" : "") + '>Nu verversen</button></div></div>' + (warning ? '<div class="notice warning" role="status">' + S.escapeHtml(warning) + "</div>" : "") + '<div class="energy-price-grid">' + energyPriceCard(data.electricity || { points: [], unit: "EUR/kWh" }, "electricity") + energyPriceCard(data.gas || { points: [], unit: "EUR/m3" }, "gas") + '</div><p class="energy-price-source">Bron: <a href="' + S.escapeHtml(sourceUrl) + '" target="_blank" rel="noopener noreferrer">EnergyZero ↗</a>. Indicatief; leveranciersopslagen, vaste leveringskosten en netbeheerkosten zijn niet inbegrepen.</p></section>';
  }

  function replaceEnergyPriceDashboard() {
    var current = document.querySelector("[data-energy-price-dashboard]");
    if (current && route().split("?")[0] === "management-portal") current.outerHTML = energyPriceDashboard();
  }

  function refreshEnergyPriceDashboard(forceUpstream) {
    if (route().split("?")[0] !== "management-portal") return Promise.resolve();
    replaceEnergyPriceDashboard();
    return S.loadEnergyPrices({ reload: true, refresh: Boolean(forceUpstream) }).then(function () {
      replaceEnergyPriceDashboard();
      if (forceUpstream) toast("Energieprijzen bijgewerkt.");
    }).catch(function (error) {
      replaceEnergyPriceDashboard();
      if (forceUpstream) toast(error.message || "Energieprijzen vernieuwen mislukt.");
    });
  }

  function stopEnergyPricePolling() {
    window.clearInterval(energyPricePollTimer);
    energyPricePollTimer = null;
  }

  function startEnergyPricePolling() {
    stopEnergyPricePolling();
    if (route().split("?")[0] !== "management-portal" || document.hidden) return;
    energyPricePollTimer = window.setInterval(function () { refreshEnergyPriceDashboard(false); }, 5 * 60 * 1000);
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
      grouped[product.category] = grouped[product.category] || {};
      grouped[product.category][product.brand] = grouped[product.category][product.brand] || [];
      grouped[product.category][product.brand].push(product);
    });
    var cards = Object.keys(grouped).sort(function (a, b) { return a.localeCompare(b, "nl"); }).map(function (category) {
      var brands = Object.keys(grouped[category]).sort(function (a, b) { return a.localeCompare(b, "nl"); }).map(function (brand) {
        return '<section class="product-brand-group"><div class="product-brand-head"><div><p class="eyebrow">Merk</p><h3>' + S.escapeHtml(brand) + '</h3></div><button class="small-button" data-action="product-new" data-category="' + S.escapeHtml(category) + '" data-brand="' + S.escapeHtml(brand) + '">Model toevoegen</button></div><div class="product-grid">' + grouped[category][brand].map(productCard).join("") + '</div></section>';
      }).join("");
      return '<section class="panel section product-category-group"><div class="panel-head"><div><p class="eyebrow">Categorie</p><h2>' + S.escapeHtml(category) + '</h2></div><button class="small-button" data-action="product-new" data-category="' + S.escapeHtml(category) + '">Merk/model toevoegen</button></div>' + brands + "</section>";
    }).join("");
    return cards || '<section class="panel"><div class="panel-head"><div><p class="eyebrow">Producten</p><h2>Productbeheer</h2></div><button class="primary-button" data-action="product-new">Nieuw product</button></div><div class="empty-state">Geen producten gevonden.</div></section>';
  }

  function productCard(product) {
    return [
      '<article class="product-card">',
      '<span class="category-pill">Model</span>',
      "<h3>" + S.escapeHtml(product.name) + "</h3>",
      product.sku ? '<p class="muted">Artikelnummer: ' + S.escapeHtml(product.sku) + '</p>' : "",
      '<p class="muted">' + S.escapeHtml(product.specs) + "</p>",
      "<p>" + S.escapeHtml(product.description) + "</p>",
      productAdviceSummary(product),
      "<strong>" + S.money(product.priceExVat) + " excl. BTW</strong>",
      '<div class="button-row"><button class="small-button" data-action="product-edit" data-id="' + S.escapeHtml(product.id) + '">Bewerk</button><button class="small-button" data-action="product-delete" data-id="' + S.escapeHtml(product.id) + '">Verwijder</button></div>',
      "</article>"
    ].join("");
  }

  function emptyProduct() {
    return {
      category: "warmtepomp",
      sku: "",
      brand: "",
      name: "",
      specs: "",
      priceExVat: 0,
      vatRate: 21,
      description: "",
      adviceType: "allelectric",
      capacityKw: 0,
      capacityKwh: 0,
      connection: "1fase",
      subsidy: 0
    };
  }

  function normalizedProductCategory(category) {
    return String(category || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function productAdviceSummary(product) {
    var category = normalizedProductCategory(product.category);
    if (category.indexOf("warmtepomp") >= 0 && Number(product.capacityKw || 0) > 0) {
      return '<span class="product-advice-meta">Advies-tool · ' + S.escapeHtml(product.adviceType === "hybride" ? "hybride" : "all-electric") + ' · ' + S.escapeHtml(product.capacityKw) + ' kW</span>';
    }
    if ((category.indexOf("thuisbatterij") >= 0 || category === "batterij") && Number(product.capacityKwh || 0) > 0) {
      return '<span class="product-advice-meta">Advies-tool · ' + S.escapeHtml(product.capacityKwh) + ' kWh · ' + S.escapeHtml(product.connection === "3fase" ? "3-fase" : "1-fase") + '</span>';
    }
    return "";
  }

  function productOptions(values) {
    return values.filter(function (value, index) { return value && values.indexOf(value) === index; }).sort(function (a, b) { return a.localeCompare(b, "nl"); }).map(function (value) {
      return '<option value="' + S.escapeHtml(value) + '"></option>';
    }).join("");
  }

  function productForm(product) {
    var p = Object.assign(emptyProduct(), product || {});
    var category = normalizedProductCategory(p.category);
    var isHeatPump = category.indexOf("warmtepomp") >= 0;
    var isBattery = category.indexOf("thuisbatterij") >= 0 || category === "batterij";
    var catalog = S.getAll("products");
    return [
      '<form class="panel" data-form="product" data-id="' + S.escapeHtml(p.id || "") + '">',
      '<div class="panel-head"><div><p class="eyebrow">Productbeheer</p><h2>' + (p.id ? "Product bewerken" : "Nieuw product") + '</h2></div><div class="button-row"><button class="ghost-button" type="button" data-action="products">Annuleren</button><button class="primary-button" type="submit">Opslaan</button></div></div>',
      '<div class="field-grid">',
      '<label class="field">Artikelnummer<input name="sku" maxlength="80" value="' + S.escapeHtml(p.sku || "") + '" placeholder="Bijvoorbeeld WP-001"></label>',
      '<label class="field">Categorie<input name="category" list="product-categories" required value="' + S.escapeHtml(p.category || "") + '" placeholder="warmtepomp"><span class="hint">Kies een bestaande categorie of typ een nieuwe.</span></label>',
      '<label class="field">Merk<input name="brand" list="product-brands" required value="' + S.escapeHtml(p.brand || "") + '"><span class="hint">Kies een bestaand merk of typ een nieuw merk.</span></label>',
      '<label class="field">Model<input name="name" required value="' + S.escapeHtml(p.name || "") + '"></label>',
      '<label class="field">Specificaties<input name="specs" value="' + S.escapeHtml(p.specs || "") + '"></label>',
      '<label class="field">Prijs excl. BTW<input name="priceExVat" type="number" min="0" step="0.01" required value="' + S.escapeHtml(p.priceExVat || 0) + '"></label>',
      '<label class="field">BTW<select name="vatRate">' + productVatOptions(p.vatRate) + '</select></label>',
      '<label class="field full">Omschrijving<textarea name="description" rows="5">' + S.escapeHtml(p.description || "") + "</textarea></label>",
      '<fieldset class="product-advice-fields full" data-product-advice-fields="warmtepomp"' + (isHeatPump ? "" : " hidden disabled") + '><legend>Gebruik in de advies-tool</legend><div class="field-grid"><label class="field">Type warmtepomp<select name="adviceType"><option value="allelectric"' + (p.adviceType === "allelectric" ? " selected" : "") + '>All-electric</option><option value="hybride"' + (p.adviceType === "hybride" ? " selected" : "") + '>Hybride</option></select></label><label class="field">Vermogen (kW)<input name="capacityKw" type="number" min="0.1" step="0.1" value="' + S.escapeHtml(p.capacityKw || 0) + '"></label><label class="field">ISDE-subsidie<input name="subsidy" type="number" min="0" step="0.01" value="' + S.escapeHtml(p.subsidy || 0) + '"></label></div><p class="hint">Dit model wordt hiermee automatisch meegenomen in warmtepompadviezen.</p></fieldset>',
      '<fieldset class="product-advice-fields full" data-product-advice-fields="thuisbatterij"' + (isBattery ? "" : " hidden disabled") + '><legend>Gebruik in de advies-tool</legend><div class="field-grid"><label class="field">Capaciteit (kWh)<input name="capacityKwh" type="number" min="0.1" step="0.1" value="' + S.escapeHtml(p.capacityKwh || 0) + '"></label><label class="field">Aansluiting<select name="connection"><option value="1fase"' + (p.connection === "1fase" ? " selected" : "") + '>1-fase</option><option value="3fase"' + (p.connection === "3fase" ? " selected" : "") + '>3-fase</option></select></label></div><p class="hint">Dit model wordt hiermee automatisch meegenomen in batterijadviezen.</p></fieldset>',
      "</div>",
      '<datalist id="product-categories">' + productOptions(catalog.map(function (item) { return item.category; }).concat(["warmtepomp", "thuisbatterij", "airco", "cv-ketel"])) + '</datalist>',
      '<datalist id="product-brands">' + productOptions(catalog.map(function (item) { return item.brand; })) + '</datalist>',
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
    data.capacityKw = S.parseNumber(data.capacityKw);
    data.capacityKwh = S.parseNumber(data.capacityKwh);
    data.subsidy = S.parseNumber(data.subsidy);
    var category = normalizedProductCategory(data.category);
    if (category.indexOf("warmtepomp") >= 0 && data.capacityKw <= 0) {
      toast("Vul het vermogen van het warmtepompmodel in.");
      return;
    }
    if ((category.indexOf("thuisbatterij") >= 0 || category === "batterij") && data.capacityKwh <= 0) {
      toast("Vul de capaciteit van het batterijmodel in.");
      return;
    }
    return S.upsert("products", data).then(function (saved) {
      C.app.state.productSeed = null;
      toast("Product opgeslagen.");
      navigate("products");
      return saved;
    });
  }

  function removeProduct(id) {
    return confirmDialog({ title: "Product verwijderen", message: "Het product wordt verwijderd. Bestaande offertes en facturen blijven ongewijzigd.", confirmLabel: "Product verwijderen" }).then(function (confirmed) {
      if (!confirmed) return;
      return S.remove("products", id).then(function () { toast("Product verwijderd."); render(); });
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
      '<h3>Productassortiment</h3>',
      '<div class="notice"><strong>Productbeheer is de centrale bron.</strong> Merken, modellen, prijzen, vermogens, capaciteiten en subsidies die u daar vastlegt worden automatisch gebruikt in de adviestools en offertebouwer. <button class="small-button" type="button" data-action="products">Open productbeheer</button></div>',
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
        var payload = JSON.parse(reader.result);
        confirmDialog({ title: "Back-up importeren", message: "Dit vervangt alle huidige lokale data.", confirmLabel: "Back-up importeren" }).then(function (confirmed) {
          if (!confirmed) return;
          return S.importData(payload).then(function () { toast("Back-up geimporteerd."); guardedRender(); });
        }).catch(function (error) {
          toast(error.message || "Importeren mislukt." + (error.requestId ? " Referentie: " + error.requestId : ""));
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
    return confirmDialog({ title: "Lokale data resetten", message: "Maak eerst een back-up als u deze data wilt bewaren.", confirmLabel: "Verder" }).then(function (confirmed) {
      if (!confirmed) return false;
      return confirmDialog({ title: "Definitief wissen", message: "Klanten, offertes, facturen en installaties worden gewist.", confirmLabel: "Definitief wissen" });
    }).then(function (confirmed) {
      if (!confirmed) return;
      return S.resetData().then(function () { toast("Data gereset."); navigate("dashboard"); guardedRender(); });
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
    if (route().split("?")[0] === "management-portal") startEnergyPricePolling();
    var quoteForm = document.querySelector('[data-form="quote"]');
    if (quoteForm) { C.quotes.recalc(quoteForm); if (C.quotes.initDraft) C.quotes.initDraft(quoteForm); }
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
    if (action === "logout") {
      if (!dirtyForm) return logout();
      return confirmDialog({ title: "Uitloggen met niet-opgeslagen wijzigingen", message: "Uw wijzigingen gaan verloren als u nu uitlogt.", confirmLabel: "Toch uitloggen" }).then(function (confirmed) { if (!confirmed) return; clearDirty(); return logout(); });
    }
    if (action === "route-retry") return guardedRender();
    if (action === "energy-prices-refresh") return refreshEnergyPriceDashboard(true);
    if (action === "collection-page") {
      var pageParams = currentQuery();
      pageParams.set("page", target.dataset.page || "1");
      return navigate(route().split("?")[0] + "?" + pageParams.toString());
    }
    if (action === "portal-switch") navigate("portals");
    if (action === "account") navigate("account");
    if (action === "toggle-sidebar") setSidebar(!document.body.classList.contains("sidebar-open"), true);
    if (action === "close-sidebar") setSidebar(false, true);
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
    if (action === "quote-draft-restore") return C.quotes.restoreDraft(target.closest("form"));
    if (action === "quote-draft-discard") return C.quotes.discardDraft(target.closest("form"));
    if (action === "quote-section-toggle") return C.quotes.toggleSection(target);
    if (action === "quote-mobile-view") return C.quotes.mobileView(target.closest("form"), target.dataset.view);
    if (action === "invoice-new") navigate(target.dataset.customerId ? "invoice-new?customerId=" + target.dataset.customerId : "invoice-new");
    if (action === "invoices") navigate("invoices");
    if (action === "invoice-detail") navigate("invoice:" + target.dataset.id);
    if (action === "invoice-edit") navigate("invoice-edit:" + target.dataset.id);
    if (action === "invoice-delete") return C.invoices.remove(target.dataset.id);
    if (action === "invoice-status") return C.invoices.updateStatus(target.dataset.id, target.dataset.status);
    if (action === "invoice-reminder") C.invoices.sendReminder(target.dataset.id);
    if (action === "payment-from-invoice") return navigate("payment-new?invoiceId=" + target.dataset.id);
    if ((action.indexOf("payment-") === 0 || action.indexOf("cash-") === 0 || action === "payments") && C.payments) return C.payments.action(target);
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
    if (action === "inventory") navigate("inventory");
    if (action === "inventory-edit") navigate("inventory-edit:" + target.dataset.id);
    if (action.indexOf("project-") === 0 && C.projects) return C.projects.handleAction(target);
    if (action.indexOf("service-") === 0 && C.service) {
      if (action === "service-visit-new") return navigate("service-visit-new");
      return C.service.action(target);
    }
    if (action === "product-new") {
      C.app.state.productSeed = target.dataset.category || target.dataset.brand ? { category: target.dataset.category || "warmtepomp", brand: target.dataset.brand || "" } : null;
      navigate("product-new");
    }
    if (action === "products") { C.app.state.productSeed = null; navigate("products"); }
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
    if (action.indexOf("wasco-") === 0 && C.wasco) return C.wasco.action(target);
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
    if (event.target.dataset.action === "form-customer-search") {
      window.clearTimeout(searchTimer);
      var customerSearch = event.target.value;
      searchTimer = window.setTimeout(function () {
        S.query("customers", { page: 1, pageSize: 20, search: customerSearch, view: "summary" }, { force: true }).then(function (page) {
          if (!document.documentElement.contains(form)) return;
          var select = form.elements.customerId;
          if (!select) return;
          var selected = select.value;
          var selectedLabel = select.selectedOptions[0] && select.selectedOptions[0].textContent;
          var items = page.items || [];
          var options = ['<option value="">Kies een klant</option>'];
          if (selected && !items.some(function (customer) { return customer.id === selected; })) options.push('<option value="' + S.escapeHtml(selected) + '" selected>' + S.escapeHtml(selectedLabel || "Geselecteerde klant") + '</option>');
          items.forEach(function (customer) { options.push('<option value="' + S.escapeHtml(customer.id) + '"' + (customer.id === selected ? ' selected' : '') + '>' + S.escapeHtml(S.customerName(customer)) + '</option>'); });
          select.innerHTML = options.join("");
        }).catch(function (error) { if (error.name !== "AbortError") toast(error.message || "Klanten zoeken mislukt."); });
      }, 300);
      return;
    }
    markDirty(form);
    if (form.dataset.form === "quote" && C.quotes && C.quotes.scheduleDraft) C.quotes.scheduleDraft(form);
    if (form.dataset.form === "quote") {
      C.quotes.syncLegacyContent(form, event.target);
      C.quotes.recalc(form);
    }
    if (form.dataset.form === "invoice") C.invoices.recalc(form);
    if (form.dataset.form === "message") updateMessage(form);
  }

  function handleChange(event) {
    var form = event.target.closest("form");
    if (form) markDirty(form);
    var action = event.target.dataset.action;
    if (form && form.dataset.form === "product" && event.target.name === "category") updateProductAdviceFields(form);
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

  function updateProductAdviceFields(form) {
    var category = normalizedProductCategory(form.elements.category && form.elements.category.value);
    var heatPump = category.indexOf("warmtepomp") >= 0;
    var battery = category.indexOf("thuisbatterij") >= 0 || category === "batterij";
    Array.from(form.querySelectorAll("[data-product-advice-fields]")).forEach(function (section) {
      var enabled = section.dataset.productAdviceFields === "warmtepomp" ? heatPump : battery;
      section.hidden = !enabled;
      section.disabled = !enabled;
    });
    if (form.elements.capacityKw) form.elements.capacityKw.required = heatPump;
    if (form.elements.capacityKwh) form.elements.capacityKwh.required = battery;
  }

  function handleSubmit(event) {
    var form = event.target.closest("form");
    if (!form) return;
    if (form.closest("#app-dialog")) return;
    event.preventDefault();
    var submitter = form.querySelector('[type="submit"]');
    if (submitter) submitter.disabled = true;
    var done = function () {
      if (submitter) submitter.disabled = false;
    };
    if (form.dataset.form === "login") {
      return login(form).then(done, done);
    }
    if (form.dataset.form === "wasco-search") return Promise.resolve(C.wasco.search(form)).then(done, done);
    clearDirty(form);
    var work = Promise.resolve();
    if (form.dataset.form === "customer") work = C.customers.saveFromForm(form);
    if (form.dataset.form === "customer-import") work = C.customers.saveImportFromForm(form);
    if (form.dataset.form === "customer-note") work = C.customers.saveNoteFromForm(form);
    if (form.dataset.form === "customer-document") work = C.customers.saveDocumentFromForm(form);
    if (form.dataset.form === "quote") work = C.quotes.saveFromForm(form);
    if (form.dataset.form === "sales-opportunity") work = C.salesFunnel.saveFromForm(form);
    if (form.dataset.form === "sales-appointment") work = C.salesAgenda.saveFromForm(form);
    if (form.dataset.form === "invoice") work = C.invoices.saveFromForm(form);
    if (form.dataset.form.indexOf("payment-") === 0 || form.dataset.form.indexOf("cash-") === 0) work = C.payments.submit(form);
    if (form.dataset.form === "installation") work = C.installations.saveFromForm(form);
    if (form.dataset.form === "workorder") work = C.installations.saveWorkOrderFromForm(form);
    if (form.dataset.form === "inventory-adjust") work = C.inventory.submitAdjustment(form);
    if (form.dataset.form === "inventory-import") work = C.inventory.submitImport(form);
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
    if (form.dataset.form === "wasco-order") work = C.wasco.submitOrder(form);
    if (form.dataset.form === "advice-wp" || form.dataset.form === "advice-bat") C.advice.submit(form);
    return Promise.resolve(work).then(function (value) {
      if (form.dataset.form === "quote" && C.quotes && C.quotes.clearDraft) C.quotes.clearDraft(form);
      return value;
    }).catch(function (error) {
      markDirty(form);
      showFormError(form, error);
    }).then(done);
  }

  function showFormError(form, error) {
    Array.from(form.querySelectorAll(".field-error")).forEach(function (node) { node.remove(); });
    (error.details || []).forEach(function (detail) {
      var name = String(detail.path || "").split(".").filter(Boolean).pop();
      var field = name && form.elements[name];
      if (!field || !field.insertAdjacentElement) return;
      var message = document.createElement("span");
      message.className = "field-error";
      message.setAttribute("role", "alert");
      message.textContent = detail.message;
      field.setAttribute("aria-invalid", "true");
      field.insertAdjacentElement("afterend", message);
    });
    var suffix = error.requestId ? " Referentie: " + error.requestId + "." : "";
    toast((error.message || "Opslaan mislukt.") + suffix);
    var invalid = form.querySelector('[aria-invalid="true"]');
    if (invalid) invalid.focus();
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
    return confirmDialog({ title: "Beoordelingslink kopiëren", message: "Selecteer en kopieer de onderstaande link.", input: true, inputLabel: "Beoordelingslink", value: url, confirmLabel: "Sluiten", danger: false });
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
    var routes = { "customer-search": "customers", "quote-search": route().split("?")[0] === "quote-studio" ? "quote-studio" : "quotes", "invoice-search": "invoices", "installation-search": "installations", "inventory-search": "inventory" };
    if (!routes[action]) return;
    var value = event.target.value;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(function () {
      var params = currentQuery();
      if (value) params.set("search", value); else params.delete("search");
      params.set("page", "1");
      navigate(routes[action] + (params.toString() ? "?" + params.toString() : ""));
    }, 300);
  }

  function handleHashChange() {
    if (hashGuard) { hashGuard = false; return; }
    var targetRoute = route();
    if (dirtyForm && dirtyRoute && targetRoute !== dirtyRoute) {
      hashGuard = true;
      window.location.hash = "#" + dirtyRoute;
      confirmDialog({ title: "Niet-opgeslagen wijzigingen", message: "Uw wijzigingen zijn nog niet opgeslagen. Wilt u deze pagina toch verlaten?", confirmLabel: "Pagina verlaten" }).then(function (confirmed) {
        if (!confirmed) return;
        clearDirty();
        window.location.hash = "#" + targetRoute;
      });
      return;
    }
    guardedRender();
  }

  function handleGlobalKeydown(event) {
    if (event.key === "Escape" && document.body.classList.contains("sidebar-open")) { setSidebar(false, true); return; }
    if (event.key !== "Tab" || !document.body.classList.contains("sidebar-open")) return;
    var sidebar = document.getElementById("main-navigation");
    var focusable = Array.from(sidebar.querySelectorAll('a:not([hidden]), button:not([disabled])')).filter(function (node) { return node.offsetParent !== null; });
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function init() {
    C.app = { navigate: navigate, toast: toast, render: guardedRender, confirm: confirmDialog, prompt: function (options) { return confirmDialog(Object.assign({}, options, { input: true })); }, markDirty: markDirty, clearDirty: clearDirty, state: {} };
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("service-worker.js").catch(function () {});
      });
    }
    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("beforeunload", function (event) { if (!dirtyForm) return; event.preventDefault(); event.returnValue = ""; });
    window.addEventListener("climature:connection", function (event) {
      var status = document.getElementById("connection-status");
      if (!status) return;
      status.hidden = event.detail.online;
      status.textContent = event.detail.online ? "Verbinding hersteld." : "Geen verbinding. Bekijken blijft mogelijk; wijzigingen zijn tijdelijk geblokkeerd.";
      if (event.detail.online) { status.hidden = false; window.setTimeout(function () { status.hidden = true; }, 2400); }
      if (route().split("?")[0] === "management-portal") {
        if (event.detail.online) refreshEnergyPriceDashboard(false);
        else replaceEnergyPriceDashboard();
      }
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stopEnergyPricePolling();
      else if (route().split("?")[0] === "management-portal") {
        startEnergyPricePolling();
        refreshEnergyPriceDashboard(false);
      }
    });
    document.addEventListener("keydown", handleGlobalKeydown);
    document.addEventListener("click", function (event) {
      var anchor = event.target.closest('a[href^="#"]');
      if (anchor && dirtyForm) {
        event.preventDefault();
        requestNavigation(anchor.getAttribute("href").slice(1));
        return;
      }
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
      guardedRender();
    }).catch(function (error) {
      showLogin();
      toast(error.message || "Server niet bereikbaar.");
    });
  }

  init();
}());
