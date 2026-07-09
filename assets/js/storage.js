(function () {
  "use strict";

  var store = window.Climature = window.Climature || {};
  var EURO = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  var COLLECTIONS = ["customers", "customerNotes", "products", "quotes", "invoices", "installations", "advices"];

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
    adviceAssumptions: {
      energy: { gasPrice: 1.45, electricityPrice: 0.30, dynamicElectricityPrice: 0.26, gasAnnualIncrease: 5, electricityAnnualIncrease: 2 },
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
          { name: "Climature A10", kwh: 10, priceExVat: 12094 },
          { name: "Climature A21", kwh: 21, priceExVat: 14594 }
        ],
        "3fase": [
          { name: "Climature T10", kwh: 10, priceExVat: 12094 },
          { name: "Climature T15", kwh: 15, priceExVat: 13594 },
          { name: "Climature T21", kwh: 21, priceExVat: 14594 },
          { name: "Climature T30", kwh: 30, priceExVat: 20094 },
          { name: "Climature T40", kwh: 40, priceExVat: 24549 }
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
    products: [],
    quotes: [],
    invoices: [],
    installations: [],
    advices: [],
    settings: Object.assign({}, DEFAULT_SETTINGS),
    counters: {}
  };
  var authenticated = false;

  function api(path, options) {
    return fetch(path, Object.assign({
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" }
    }, options || {})).then(function (response) {
      return response.text().then(function (text) {
        var payload = text ? JSON.parse(text) : {};
        if (!response.ok) throw new Error(payload.error || "Serververzoek mislukt.");
        return payload;
      });
    });
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
      cache[collection] = Array.isArray(data[collection]) ? data[collection] : [];
    });
    cache.settings = mergedSettings(data.settings);
    cache.counters = data.counters || {};
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
      if (!authenticated) return false;
      return refresh().then(function () { return true; });
    }).catch(function () {
      authenticated = false;
      throw new Error("Kan geen verbinding maken met de server.");
    });
  }

  function refresh() {
    return api("/api/bootstrap").then(function (payload) {
      applyData(payload.data);
      authenticated = true;
      return cache;
    });
  }

  function login(username, password) {
    return api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: username, password: password })
    }).then(function () {
      authenticated = true;
      return refresh();
    });
  }

  function logout() {
    return api("/api/auth/logout", { method: "POST" }).catch(function () {
      return null;
    }).then(function () {
      authenticated = false;
      applyData({});
    });
  }

  function isAuthenticated() {
    return authenticated;
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
    return EURO.format(Number.isFinite(value) ? value : 0);
  }

  function parseNumber(value) {
    var normalized = String(value || "").replace(/\./g, "").replace(",", ".");
    var parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
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
      var qty = parseNumber(line.qty);
      var priceExVat = parseNumber(line.priceExVat);
      var vatRate = parseNumber(line.vatRate);
      var subtotal = qty * priceExVat;
      var vat = subtotal * (vatRate / 100);
      return {
        description: String(line.description || "").trim(),
        qty: qty,
        unit: String(line.unit || "stuk").trim(),
        priceExVat: priceExVat,
        vatRate: vatRate,
        subtotal: subtotal,
        vat: vat,
        total: subtotal + vat,
        productId: line.productId || ""
      };
    }).filter(function (line) {
      return line.description || line.qty || line.priceExVat;
    });
    var subtotal = normalized.reduce(function (sum, line) { return sum + line.subtotal; }, 0);
    var vat = normalized.reduce(function (sum, line) { return sum + line.vat; }, 0);
    return { lines: normalized, subtotal: subtotal, vat: vat, total: subtotal + vat };
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
      return saved;
    });
  }

  function remove(collection, id) {
    return api("/api/collections/" + encodeURIComponent(collection) + "/" + encodeURIComponent(id), {
      method: "DELETE"
    }).then(function () {
      cache[collection] = getAll(collection).filter(function (item) { return item.id !== id; });
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

  store.storage = {
    init: init,
    refresh: refresh,
    login: login,
    logout: logout,
    isAuthenticated: isAuthenticated,
    getAll: getAll,
    saveAll: saveAll,
    exportData: exportData,
    importData: importData,
    resetData: resetData,
    upsert: upsert,
    remove: remove,
    read: read,
    write: write,
    nextNumber: nextNumber,
    peekNumber: peekNumber,
    settings: settings,
    saveSettings: saveSettings,
    refreshAdviceAssumptions: refreshAdviceAssumptions,
    refreshOverdueInvoices: refreshOverdueInvoices,
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
