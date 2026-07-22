(function () {
  "use strict";

  var store = window.Climature = window.Climature || {};
  var EURO = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  var COLLECTIONS = ["customers", "customerNotes", "customerDocuments", "products", "quotes", "invoices", "installations", "advices", "salesOpportunities", "salesAppointments"];
  var COLLECTION_ENDPOINTS = {
    customers: "/api/customers",
    customerNotes: "/api/notes",
    customerDocuments: "/api/documents",
    products: "/api/products",
    quotes: "/api/quotes",
    invoices: "/api/invoices",
    installations: "/api/installations",
    advices: "/api/advices",
    salesOpportunities: "/api/sales-opportunities",
    salesAppointments: "/api/sales-appointments"
  };

  var DEFAULT_SETTINGS = {
    companyName: "Climature",
    companyAddress: "Nevadadreef 17J",
    companyCity: "3565 CA Utrecht",
    companyPhone: "085 060 3664",
    companyEmail: "info@climature.nl",
    companySite: "www.climature.nl",
    companyKvk: "",
    companyVat: "",
    companyIban: "",
    paymentDays: 14,
    defaultInvoiceNote: "Gelieve het openstaande bedrag te voldoen binnen de betaaltermijn onder vermelding van het factuurnummer.",
    defaultQuoteTerms: "Deze offerte is vrijblijvend en geldig tot de genoemde datum. Genoemde prijzen zijn gebaseerd op de nu bekende situatie. Eventueel meerwerk, aanpassingen aan meterkast, leidingwerk, bouwkundige delen of bestaande installaties worden vooraf besproken. Planning vindt plaats in overleg na akkoord.",
    googleBusinessProfile: { profileUrl: "", reviewUrl: "" },
    serviceReminders: { enabled: true, daysBefore: 30 },
    adviceAssumptions: {
      energy: { gasPrice: 1.45, electricityPrice: 0.30, dynamicElectricityPrice: 0.26, gasAnnualIncrease: 5, electricityAnnualIncrease: 2, priceHistory: [] },
      battery: { feedInCost: 0.15, epexMargin: 0.22, imbalancePerKwh: 250, aggregatorFeeExternal: 25, aggregatorFeeClimature: 15 },
      warmtepompProducts: {
        allelectric: [
          { name: "TC Swiss Ecoline 8KW All Electric", kw: 8, priceIncl: 13189, subsidy: 3750, rvoSearch: "TC Swiss Ecoline 8KW All Electric", meldcode: "" },
          { name: "TC Swiss Ecoline 12KW All Electric", kw: 12, priceIncl: 14549, subsidy: 4650, rvoSearch: "TC Swiss Ecoline 12KW All Electric", meldcode: "" }
        ],
        hybride: [
          { name: "TC Swiss Ecoline 8KW Hybride", kw: 8, priceIncl: 11835, subsidy: 3025, rvoSearch: "TC Swiss Ecoline 8KW Hybride", meldcode: "" },
          { name: "TC Swiss Ecoline 12KW Hybride", kw: 12, priceIncl: 14940, subsidy: 3700, rvoSearch: "TC Swiss Ecoline 12KW Hybride", meldcode: "" }
        ]
      },
      batteryProducts: {
        "1fase": [
          { id: "climature-a10", name: "Climature A10", kwh: 10, priceExVat: 12094 },
          { id: "climature-a21", name: "Climature A21", kwh: 21, priceExVat: 14594 }
        ],
        "3fase": [
          { id: "climature-t10", name: "Climature T10", kwh: 10, priceExVat: 12094 },
          { id: "climature-t15", name: "Climature T15", kwh: 15, priceExVat: 13594 },
          { id: "climature-t21", name: "Climature T21", kwh: 21, priceExVat: 14594 },
          { id: "climature-t30", name: "Climature T30", kwh: 30, priceExVat: 20094 },
          { id: "climature-t40", name: "Climature T40", kwh: 40, priceExVat: 24549 }
        ]
      },
      sources: {
        energy: { label: "Handmatige fallback", period: "", refreshedAt: "", url: "https://www.cbs.nl/nl-nl/cijfers/detail/85592NED" },
        subsidies: { label: "Handmatige fallback", period: "", refreshedAt: "", url: "https://www.rvo.nl/subsidies-financiering/isde/meldcodelijsten" },
        market: { label: "Handmatige aannames", period: "", refreshedAt: "" }
      }
    }
  };

  var cache = {
    customers: [],
    customerNotes: [],
    customerDocuments: [],
    products: [],
    quotes: [],
    invoices: [],
    installations: [],
    advices: [],
    salesOpportunities: [],
    salesAppointments: [],
    settings: Object.assign({}, DEFAULT_SETTINGS),
    counters: {},
    users: [],
    employeeDirectory: [],
    dashboard: { portalCounts: {} }
  };
  var loadedCollections = {};
  var queryPages = {};
  var queryEntries = {};
  var querySequence = {};
  var dashboardEntries = {};
  var energyPriceEntry = { status: "idle", data: null, error: null, promise: null };
  var productCatalogPromise = null;
  var connectionOnline = navigator.onLine !== false;
  var legacyMode = false;
  window.addEventListener("online", function () { setConnectionState(true); });
  window.addEventListener("offline", function () { setConnectionState(false); });
  var authenticated = false;
  var currentUser = null;
  var currentCsrfToken = "";
  var features = {};

  function api(path, options) {
    options = options || {};
    var method = String(options.method || "GET").toUpperCase();
    if (!connectionOnline && ["POST", "PUT", "PATCH", "DELETE"].indexOf(method) >= 0) {
      var offlineError = new Error("Geen verbinding. Wijzigingen zijn tijdelijk geblokkeerd.");
      offlineError.code = "OFFLINE";
      return Promise.reject(offlineError);
    }
    var headers = Object.assign(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }, options.headers || {});
    if (["POST", "PUT", "PATCH", "DELETE"].indexOf(String(options.method || "GET").toUpperCase()) >= 0 && currentCsrfToken) {
      headers["X-CSRF-Token"] = currentCsrfToken;
    }
    return fetch(path, Object.assign({
      credentials: "same-origin",
      headers: headers
    }, options, { headers: headers })).then(function (response) {
      return response.text().then(function (text) {
        var payload = {};
        try { payload = text ? JSON.parse(text) : {}; } catch (_error) { payload = text || {}; }
        setConnectionState(true);
        if (!response.ok) {
          var error = new Error(payload && payload.error || "Serververzoek mislukt.");
          error.status = response.status;
          error.code = payload && payload.code || "REQUEST_FAILED";
          error.details = payload && payload.details || [];
          error.requestId = payload && payload.requestId || response.headers.get("X-Request-ID") || "";
          throw error;
        }
        return payload;
      });
    }).catch(function (error) {
      if (error && (error.name === "AbortError" || error.status)) throw error;
      setConnectionState(false);
      var networkError = new Error("Kan geen verbinding maken met de server.");
      networkError.code = "OFFLINE";
      networkError.cause = error;
      throw networkError;
    });
  }

  function setConnectionState(online) {
    if (connectionOnline === online) return;
    connectionOnline = online;
    window.dispatchEvent(new CustomEvent("climature:connection", { detail: { online: online } }));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function deepMerge(base, extra) {
    var output = clone(base || {});
    Object.keys(extra || {}).forEach(function (key) {
      var value = extra[key];
      if (Array.isArray(value)) output[key] = clone(value);
      else if (isPlainObject(value) && isPlainObject(output[key])) output[key] = deepMerge(output[key], value);
      else if (value !== undefined) output[key] = value;
    });
    return output;
  }

  function mergedSettings(settings) {
    return deepMerge(DEFAULT_SETTINGS, settings || {});
  }

  function applyData(data) {
    data = data || {};
    COLLECTIONS.forEach(function (collection) {
      if (Array.isArray(data[collection])) {
        cache[collection] = data[collection];
        loadedCollections[collection] = true;
      }
    });
    cache.settings = mergedSettings(data.settings);
    cache.counters = data.counters || {};
    cache.dashboard = data.dashboard || cache.dashboard || { portalCounts: {} };
  }

  function clearData() {
    COLLECTIONS.forEach(function (collection) { cache[collection] = []; });
    cache.settings = mergedSettings({});
    cache.counters = {};
    cache.users = [];
    cache.employeeDirectory = [];
    cache.dashboard = { portalCounts: {} };
    energyPriceEntry = { status: "idle", data: null, error: null, promise: null };
  }

  function currentYearKey(type) {
    return type + "-" + new Date().getFullYear();
  }

  function updateCounterFromNumber(type, value) {
    var match = String(value || "").match(/-(\d{4})-(\d+)$/);
    if (!match) return;
    cache.counters[type + "-" + match[1]] = parseInt(match[2], 10) || 0;
  }

  function init() {
    return api("/api/auth/session").then(function (session) {
      authenticated = Boolean(session.authenticated);
      currentUser = session.user || null;
      currentCsrfToken = session.csrfToken || "";
      features = session.features || {};
      if (!authenticated) return false;
      return refresh().then(function () { return true; });
    }).catch(function () {
      authenticated = false;
      currentUser = null;
      throw new Error("Kan geen verbinding maken met de server.");
    });
  }

  function refresh() {
    return api("/api/bootstrap").then(function (payload) {
      var bootstrap = payload.data || {};
      applyData(bootstrap);
      if (bootstrap.user) currentUser = bootstrap.user;
      var legacyPayload = COLLECTIONS.some(function (collection) { return Array.isArray(bootstrap[collection]); });
      legacyMode = legacyPayload;
      if (legacyPayload) {
        authenticated = true;
        return cache;
      }
      authenticated = true;
      return cache;
    });
  }

  function loadAllPages(endpoint, page, items) {
    return api(endpoint + "?page=" + page + "&pageSize=100").then(function (payload) {
      var combined = items.concat(payload.items || []);
      if (payload.totalPages && page < payload.totalPages) return loadAllPages(endpoint, page + 1, combined);
      return combined;
    });
  }

  function queryKey(collection, params) {
    var query = new URLSearchParams(params || {});
    query.sort();
    return collection + "?" + query.toString();
  }

  function query(collection, params, options) {
    options = options || {};
    params = Object.assign({ page: 1, pageSize: 25 }, params || {});
    var endpoint = COLLECTION_ENDPOINTS[collection];
    if (!endpoint) return Promise.reject(new Error("Onbekende gegevensverzameling."));
    var key = queryKey(collection, params);
    var existing = queryEntries[key];
    if (existing && existing.promise && !options.force) return existing.promise;
    if (existing && existing.status === "success" && !options.force) {
      cache[collection] = existing.data.items.slice();
      queryPages[collection] = existing.data;
      loadedCollections[collection] = true;
      return Promise.resolve(existing.data);
    }
    if (options.cancelStale !== false) {
      Object.keys(queryEntries).filter(function (entryKey) { return entryKey !== key && entryKey.indexOf(collection + "?") === 0; }).forEach(function (entryKey) {
        var stale = queryEntries[entryKey];
        if (stale && stale.status === "loading" && stale.controller) stale.controller.abort();
      });
    }
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var sequence = (querySequence[collection] || 0) + 1;
    querySequence[collection] = sequence;
    var entry = queryEntries[key] = { status: "loading", error: null, controller: controller, promise: null };
    var url = endpoint + "?" + new URLSearchParams(params).toString();
    entry.promise = api(url, controller ? { signal: controller.signal } : {}).then(function (page) {
      entry.status = "success"; entry.data = page; entry.error = null; entry.promise = null;
      if (querySequence[collection] === sequence) {
        cache[collection] = (page.items || []).slice();
        queryPages[collection] = page;
        loadedCollections[collection] = true;
      }
      return page;
    }).catch(function (error) {
      if (error.name === "AbortError") { entry.status = "idle"; entry.promise = null; return Promise.reject(error); }
      entry.status = "error"; entry.error = error; entry.promise = null;
      throw error;
    });
    return entry.promise;
  }

  function loadProductCatalog(options) {
    options = options || {};
    if (loadedCollections.products && !options.force) return Promise.resolve(getAll("products"));
    if (productCatalogPromise && !options.force) return productCatalogPromise;
    function page(number) {
      return api("/api/products?" + new URLSearchParams({ page: number, pageSize: 100, sortBy: "category", sortOrder: "asc" }).toString());
    }
    productCatalogPromise = page(1).then(function (first) {
      var requests = [];
      for (var number = 2; number <= first.totalPages; number += 1) requests.push(page(number));
      return Promise.all(requests).then(function (rest) {
        var items = (first.items || []).concat.apply(first.items || [], rest.map(function (result) { return result.items || []; }));
        cache.products = items;
        queryPages.products = { items: items, page: 1, pageSize: items.length || 100, totalItems: first.totalItems, totalPages: first.totalPages };
        loadedCollections.products = true;
        return items;
      });
    }).finally(function () { productCatalogPromise = null; });
    return productCatalogPromise;
  }

  function abortCollection(collection) {
    Object.keys(queryEntries).filter(function (key) { return key.indexOf(collection + "?") === 0; }).forEach(function (key) {
      var entry = queryEntries[key];
      if (entry && entry.controller && entry.status === "loading") entry.controller.abort();
    });
  }

  function getDetail(collection, id, options) {
    var key = collection + ":" + id;
    if (queryEntries[key] && queryEntries[key].status === "success" && !(options && options.force)) return Promise.resolve(queryEntries[key].data.item);
    var endpoint = COLLECTION_ENDPOINTS[collection];
    var entry = queryEntries[key] = { status: "loading", error: null, promise: null };
    entry.promise = api(endpoint + "/" + encodeURIComponent(id)).then(function (payload) {
      entry.status = "success"; entry.data = payload; entry.promise = null;
      var items = cache[collection].slice();
      var index = items.findIndex(function (item) { return item.id === payload.item.id; });
      if (index >= 0) items[index] = payload.item; else items.unshift(payload.item);
      cache[collection] = items; loadedCollections[collection] = true;
      return payload.item;
    }).catch(function (error) { entry.status = "error"; entry.error = error; entry.promise = null; throw error; });
    return entry.promise;
  }

  function invalidate(collection, id) {
    Object.keys(queryEntries).forEach(function (key) {
      if (key.indexOf(collection + "?") === 0 || key === collection + ":" + id) delete queryEntries[key];
    });
    if (collection) loadedCollections[collection] = false;
    if (collection === "products") productCatalogPromise = null;
    dashboardEntries = {};
  }

  function pageInfo(collection) { return queryPages[collection] || { page: 1, pageSize: 25, totalItems: cache[collection].length, totalPages: cache[collection].length ? 1 : 0 }; }
  function queryState(collection, params) {
    var entry = queryEntries[queryKey(collection, Object.assign({ page: 1, pageSize: 25 }, params || {}))];
    return entry ? { status: entry.status, data: entry.data || null, error: entry.error || null } : { status: "idle", data: null, error: null };
  }
  function isCollectionLoaded(collection) { return Boolean(loadedCollections[collection]); }

  function paginationControls(collection) {
    var page = pageInfo(collection);
    if (!page.totalItems) return "";
    return '<nav class="pagination" aria-label="Paginering"><span>' + page.totalItems + ' resultaat' + (page.totalItems === 1 ? '' : 'en') + '</span><div class="button-row"><button class="small-button" type="button" data-action="collection-page" data-collection="' + escapeHtml(collection) + '" data-page="' + Math.max(1, page.page - 1) + '"' + (page.page <= 1 ? ' disabled' : '') + '>Vorige</button><strong>Pagina ' + page.page + ' van ' + Math.max(1, page.totalPages) + '</strong><button class="small-button" type="button" data-action="collection-page" data-collection="' + escapeHtml(collection) + '" data-page="' + Math.min(Math.max(1, page.totalPages), page.page + 1) + '"' + (page.page >= page.totalPages ? ' disabled' : '') + '>Volgende</button></div></nav>';
  }

  function dashboard(portal, options) {
    options = options || {};
    var existing = dashboardEntries[portal];
    if (existing && existing.status === "success" && !options.force) return Promise.resolve(existing.data);
    if (existing && existing.promise && !options.force) return existing.promise;
    var entry = dashboardEntries[portal] = { status: "loading", promise: null, data: null, error: null };
    entry.promise = api("/api/dashboard/" + encodeURIComponent(portal)).then(function (payload) { entry.status = "success"; entry.data = payload; entry.promise = null; return payload; }).catch(function (error) { entry.status = "error"; entry.error = error; entry.promise = null; throw error; });
    return entry.promise;
  }

  function dashboardState(portal) { return dashboardEntries[portal] && dashboardEntries[portal].data || null; }
  function portalCounts() { return cache.dashboard && cache.dashboard.portalCounts || {}; }

  function loadEnergyPrices(options) {
    options = options || {};
    if (energyPriceEntry.status === "success" && !options.reload) return Promise.resolve(energyPriceEntry.data);
    if (energyPriceEntry.promise) return energyPriceEntry.promise;
    var previous = energyPriceEntry.data;
    energyPriceEntry = { status: "loading", data: previous, error: null, promise: null };
    var path = "/api/energy-prices" + (options.refresh ? "?refresh=1" : "");
    energyPriceEntry.promise = api(path).then(function (payload) {
      energyPriceEntry.status = "success";
      energyPriceEntry.data = payload;
      energyPriceEntry.error = null;
      energyPriceEntry.promise = null;
      return payload;
    }).catch(function (error) {
      energyPriceEntry.status = "error";
      energyPriceEntry.error = error;
      energyPriceEntry.promise = null;
      throw error;
    });
    return energyPriceEntry.promise;
  }

  function energyPriceState() {
    return { status: energyPriceEntry.status, data: energyPriceEntry.data, error: energyPriceEntry.error };
  }

  function reportSummary(params, options) {
    var key = "reports?" + new URLSearchParams(params || {}).toString();
    if (queryEntries[key] && queryEntries[key].status === "success" && !(options && options.force)) return Promise.resolve(queryEntries[key].data);
    var entry = queryEntries[key] = { status: "loading", promise: null };
    entry.promise = api("/api/reports/summary?" + new URLSearchParams(params || {}).toString()).then(function (payload) { entry.status = "success"; entry.data = payload; entry.promise = null; return payload; }).catch(function (error) { entry.status = "error"; entry.error = error; entry.promise = null; throw error; });
    return entry.promise;
  }

  function reportState(params) { var entry = queryEntries["reports?" + new URLSearchParams(params || {}).toString()]; return entry && entry.data || null; }

  function login(username, password) {
    return api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: username, password: password })
    }).then(function (session) {
      authenticated = true;
      currentUser = session.user || null;
      currentCsrfToken = session.csrfToken || "";
      features = session.features || {};
      return refresh();
    });
  }

  function logout() {
    return api("/api/auth/logout", { method: "POST" }).catch(function () {
      return null;
    }).then(function () {
      authenticated = false;
      currentUser = null;
      currentCsrfToken = "";
      clearData();
      loadedCollections = {}; queryPages = {}; queryEntries = {}; dashboardEntries = {};
      legacyMode = false;
    });
  }

  function isAuthenticated() {
    return authenticated;
  }

  function user() {
    return currentUser;
  }

  function isAdmin() {
    return currentUser && currentUser.role === "admin";
  }

  function isInstaller() {
    return currentUser && currentUser.role === "installer";
  }

  function hasRole() {
    if (!currentUser) return false;
    return Array.prototype.slice.call(arguments).indexOf(currentUser.role) >= 0;
  }

  function canManage(portal) {
    if (isAdmin()) return true;
    return (portal === "crm" && hasRole("crm")) ||
      (portal === "sales" && hasRole("sales")) ||
      (portal === "execution" && hasRole("execution")) ||
      (portal === "finance" && hasRole("finance"));
  }

  function isHrPortalEnabled() {
    return Boolean(features.hrPortalEnabled);
  }

  function read(key, fallback) {
    return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : fallback;
  }

  function write(key, value) {
    cache[key] = value;
    return value;
  }

  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDays(dateValue, days) {
    var date = new Date(dateValue || today());
    date.setDate(date.getDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }

  function money(value) {
    return EURO.format(parseNumber(value));
  }

  function parseNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (value == null || value === "") return 0;
    var normalized = String(value).trim().replace(/[\s\u00a0€$£']/g, "").replace(/[^\d,\.\-+]/g, "");
    if (!normalized) return 0;
    var comma = normalized.lastIndexOf(",");
    var dot = normalized.lastIndexOf(".");
    if (comma >= 0 && dot >= 0) {
      var decimal = comma > dot ? "," : ".";
      normalized = normalized.replace(decimal === "," ? /\./g : /,/g, "").replace(decimal, ".");
    } else if (comma >= 0) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
    var parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function roundMoney(value) {
    var number = parseNumber(value);
    return Math.round((number + Math.sign(number) * Number.EPSILON) * 100) / 100;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(value) {
    if (!value) return "-";
    var parts = String(value).split("-");
    return parts.length === 3 ? parts[2] + "-" + parts[1] + "-" + parts[0] : value;
  }

  function customerName(customer) {
    if (!customer) return "Onbekende klant";
    var person = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
    return customer.companyName || person || "Naamloze klant";
  }

  function calculateTotals(lines) {
    var normalized = (lines || []).map(function (line) {
      var lineKind = line.lineKind === "discount" || parseNumber(line.priceExVat) < 0 ? "discount" : "item";
      var qty = Math.abs(parseNumber(line.qty));
      var rawPrice = parseNumber(line.priceExVat);
      var priceExVat = lineKind === "discount" ? -Math.abs(rawPrice) : Math.max(0, rawPrice);
      var vatRate = parseNumber(line.vatRate);
      var subtotal = roundMoney(qty * priceExVat);
      var vat = roundMoney(subtotal * (vatRate / 100));
      return {
        description: String(line.description || "").trim(),
        qty: qty,
        unit: String(line.unit || "stuk").trim(),
        priceExVat: priceExVat,
        vatRate: vatRate,
        subtotal: subtotal,
        vat: vat,
        total: roundMoney(subtotal + vat),
        productId: line.productId || "",
        componentKey: line.componentKey || "general",
        lineKind: lineKind,
        vatRefundEligible: Boolean(line.vatRefundEligible)
      };
    }).filter(function (line) {
      return line.description || line.qty || line.priceExVat;
    });
    var subtotal = roundMoney(normalized.reduce(function (sum, line) { return sum + line.subtotal; }, 0));
    var vat = roundMoney(normalized.reduce(function (sum, line) { return sum + line.vat; }, 0));
    return { lines: normalized, subtotal: subtotal, vat: vat, total: roundMoney(subtotal + vat) };
  }

  function getAll(collection) {
    return cache[collection] || [];
  }

  function saveAll(collection, items) {
    return api("/api/collections/" + encodeURIComponent(collection), {
      method: "PUT",
      body: JSON.stringify({ items: items })
    }).then(function (payload) {
      applyData(payload.data);
      return getAll(collection);
    });
  }

  function upsert(collection, item) {
    return api("/api/collections/" + encodeURIComponent(collection), {
      method: "POST",
      body: JSON.stringify(item || {})
    }).then(function (payload) {
      var saved = payload.item;
      var items = getAll(collection).slice();
      var index = items.findIndex(function (existing) { return existing.id === saved.id; });
      if (index >= 0) items[index] = saved; else items.unshift(saved);
      cache[collection] = items;
      invalidate(collection, saved.id);
      loadedCollections[collection] = true;
      return saved;
    });
  }

  function remove(collection, id) {
    return api("/api/collections/" + encodeURIComponent(collection) + "/" + encodeURIComponent(id), {
      method: "DELETE"
    }).then(function () {
      cache[collection] = getAll(collection).filter(function (item) { return item.id !== id; });
      invalidate(collection, id);
    });
  }

  function uploadCustomerDocument(customerId, file) {
    var form = new FormData();
    form.append("file", file);
    return api("/api/customers/" + encodeURIComponent(customerId) + "/documents", { method: "POST", body: form }).then(function (payload) {
      var items = getAll("customerDocuments").slice();
      items.unshift(payload.item);
      cache.customerDocuments = items;
      return payload.item;
    });
  }

  function exportData() {
    return api("/api/backup/export");
  }

  function importData(payload) {
    return api("/api/backup/import", {
      method: "POST",
      body: JSON.stringify(payload)
    }).then(function (response) {
      applyData(response.data);
    });
  }

  function resetData() {
    return api("/api/admin/reset", { method: "POST" }).then(function (response) {
      applyData(response.data);
    });
  }

  function nextNumber(type) {
    return api("/api/counters/" + encodeURIComponent(type) + "/next", { method: "POST" }).then(function (response) {
      updateCounterFromNumber(type, response.value);
      return response.value;
    });
  }

  function peekNumber(type) {
    var year = new Date().getFullYear();
    var key = currentYearKey(type);
    var next = (cache.counters[key] || 0) + 1;
    return (type === "quote" ? "CL-OFF-" : "CL-FAC-") + year + "-" + String(next).padStart(4, "0");
  }

  function settings() {
    return mergedSettings(cache.settings);
  }

  function saveSettings(data) {
    return api("/api/settings", {
      method: "PUT",
      body: JSON.stringify(data || {})
    }).then(function (payload) {
      cache.settings = mergedSettings(payload.item);
      return cache.settings;
    });
  }

  function refreshAdviceAssumptions() {
    return api("/api/advice-assumptions/refresh", { method: "POST" }).then(function (payload) {
      cache.settings = mergedSettings(payload.item);
      return cache.settings;
    });
  }

  function refreshOverdueInvoices() {
    return refresh();
  }

  function listUsers() {
    return api("/api/users").then(function (payload) {
      cache.users = payload.items || [];
      return cache.users;
    });
  }

  function listEmployeeDirectory(filters) {
    if (!isHrPortalEnabled() || !canManage("execution")) return Promise.resolve([]);
    var query = new URLSearchParams(filters || {}).toString();
    return api("/api/admin/employee-directory" + (query ? "?" + query : "")).then(function (payload) {
      cache.employeeDirectory = payload.items || [];
      return cache.employeeDirectory;
    });
  }

  function createUser(data) {
    return api("/api/users", {
      method: "POST",
      body: JSON.stringify(data || {})
    }).then(function (payload) {
      return listUsers().then(function () { return payload.item; });
    });
  }

  function updateUser(id, data) {
    return api("/api/users/" + encodeURIComponent(id), {
      method: "PUT",
      body: JSON.stringify(data || {})
    }).then(function (payload) {
      return listUsers().then(function () { return payload.item; });
    });
  }

  function updateMe(data) {
    return api("/api/auth/me", {
      method: "PUT",
      body: JSON.stringify(data || {})
    }).then(function (payload) {
      currentUser = payload.user || currentUser;
      return currentUser;
    });
  }

  function saveWorkOrder(id, data) {
    return api("/api/installations/" + encodeURIComponent(id) + "/workorder", {
      method: "PUT",
      body: JSON.stringify(data || {})
    }).then(function (payload) {
      var saved = payload.item;
      var items = getAll("installations").slice();
      var index = items.findIndex(function (existing) { return existing.id === saved.id; });
      if (index >= 0) items[index] = saved;
      else items.unshift(saved);
      cache.installations = items;
      return saved;
    });
  }

  store.storage = {
    request: api,
    init: init,
    refresh: refresh,
    query: query,
    loadProductCatalog: loadProductCatalog,
    abortCollection: abortCollection,
    getDetail: getDetail,
    invalidate: invalidate,
    pageInfo: pageInfo,
    queryState: queryState,
    paginationControls: paginationControls,
    isCollectionLoaded: isCollectionLoaded,
    isLegacyMode: function () { return legacyMode; },
    dashboard: dashboard,
    dashboardState: dashboardState,
    portalCounts: portalCounts,
    loadEnergyPrices: loadEnergyPrices,
    energyPriceState: energyPriceState,
    reportSummary: reportSummary,
    reportState: reportState,
    isOnline: function () { return connectionOnline; },
    login: login,
    logout: logout,
    isAuthenticated: isAuthenticated,
    user: user,
    isAdmin: isAdmin,
    isInstaller: isInstaller,
    hasRole: hasRole,
    canManage: canManage,
    isHrPortalEnabled: isHrPortalEnabled,
    getAll: getAll,
    saveAll: saveAll,
    exportData: exportData,
    importData: importData,
    resetData: resetData,
    upsert: upsert,
    remove: remove,
    uploadCustomerDocument: uploadCustomerDocument,
    read: read,
    write: write,
    nextNumber: nextNumber,
    peekNumber: peekNumber,
    settings: settings,
    saveSettings: saveSettings,
    refreshAdviceAssumptions: refreshAdviceAssumptions,
    refreshOverdueInvoices: refreshOverdueInvoices,
    listUsers: listUsers,
    listEmployeeDirectory: listEmployeeDirectory,
    createUser: createUser,
    updateUser: updateUser,
    updateMe: updateMe,
    saveWorkOrder: saveWorkOrder,
    calculateTotals: calculateTotals,
    customerName: customerName,
    uid: uid,
    today: today,
    addDays: addDays,
    money: money,
    parseNumber: parseNumber,
    escapeHtml: escapeHtml,
    formatDate: formatDate
  };
}());
