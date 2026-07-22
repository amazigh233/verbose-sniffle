"use strict";

const crypto = require("crypto");

const DEMO_PRODUCTS = [
  { sku: "WAS-100184", name: "Remeha Tzerra Ace-Matic 28c CW4", brand: "Remeha", category: "CV-ketels", unit: "st", priceExVat: 1249, stock: 18, delivery: "Morgen geleverd", image: "", demo: true },
  { sku: "WAS-207431", name: "Intergas Xtend 5 hybride warmtepomp", brand: "Intergas", category: "Warmtepompen", unit: "st", priceExVat: 3895, stock: 7, delivery: "Morgen geleverd", image: "", demo: true },
  { sku: "WAS-319920", name: "Daikin Altherma 3 R 8 kW buitenunit", brand: "Daikin", category: "Warmtepompen", unit: "st", priceExVat: 2849, stock: 4, delivery: "Binnen 2 werkdagen", image: "", demo: true },
  { sku: "WAS-441092", name: "Comfort Line expansievat 18 liter", brand: "Comfort Line", category: "Installatiemateriaal", unit: "st", priceExVat: 42.5, stock: 36, delivery: "Morgen geleverd", image: "", demo: true },
  { sku: "WAS-552004", name: "Flamco Flexcon Premium expansievat 25 liter", brand: "Flamco", category: "Installatiemateriaal", unit: "st", priceExVat: 68.95, stock: 12, delivery: "Morgen geleverd", image: "", demo: true },
  { sku: "WAS-638115", name: "Grundfos Alpha2 circulatiepomp 25-60", brand: "Grundfos", category: "Pompen", unit: "st", priceExVat: 319, stock: 9, delivery: "Morgen geleverd", image: "", demo: true },
  { sku: "WAS-714228", name: "Uponor Uni Pipe Plus 16 x 2 mm, rol 100 m", brand: "Uponor", category: "Leiding & koppelingen", unit: "rol", priceExVat: 214.5, stock: 23, delivery: "Morgen geleverd", image: "", demo: true },
  { sku: "WAS-801774", name: "Honeywell Home T6 bedrade thermostaat", brand: "Resideo", category: "Regeltechniek", unit: "st", priceExVat: 174.95, stock: 14, delivery: "Morgen geleverd", image: "", demo: true },
  { sku: "WAS-923601", name: "Spirotech SpiroTrap vuilafscheider 22 mm", brand: "Spirotech", category: "Installatiemateriaal", unit: "st", priceExVat: 129.5, stock: 0, delivery: "Verwacht binnen 5 werkdagen", image: "", demo: true },
  { sku: "WAS-990215", name: "Armacell leidingisolatie 22 x 13 mm, 2 m", brand: "Armacell", category: "Isolatie", unit: "lengte", priceExVat: 8.75, stock: 74, delivery: "Morgen geleverd", image: "", demo: true }
];

function integrationError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

function normalizedProduct(item) {
  return {
    sku: String(item.sku || item.articleNumber || item.id || ""),
    name: String(item.name || item.description || "Onbekend artikel"),
    brand: String(item.brand || "Wasco"),
    category: String(item.category || "Overig"),
    unit: String(item.unit || "st"),
    priceExVat: Number(item.priceExVat != null ? item.priceExVat : item.netPrice || 0),
    stock: Math.max(0, Number(item.stock != null ? item.stock : item.availableQuantity || 0)),
    delivery: String(item.delivery || item.deliveryText || "Levertermijn op aanvraag"),
    image: String(item.image || item.imageUrl || ""),
    demo: Boolean(item.demo)
  };
}

function validateOrder(input) {
  const body = input && typeof input === "object" ? input : {};
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!lines.length) throw integrationError("Voeg minimaal één artikel toe aan de bestellijst.", 400, "WASCO_EMPTY_ORDER");
  if (lines.length > 100) throw integrationError("Een bestelling kan maximaal 100 regels bevatten.", 400, "WASCO_ORDER_TOO_LARGE");
  const normalizedLines = lines.map((line) => {
    const sku = String(line && line.sku || "").trim().slice(0, 80);
    const quantity = Number(line && line.quantity);
    if (!sku || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      throw integrationError("Controleer de artikelnummers en aantallen.", 400, "WASCO_INVALID_ORDER_LINE");
    }
    return { sku, quantity };
  });
  return {
    reference: String(body.reference || "").trim().slice(0, 120),
    deliveryMethod: ["delivery", "pickup"].includes(body.deliveryMethod) ? body.deliveryMethod : "delivery",
    deliveryLocation: String(body.deliveryLocation || "").trim().slice(0, 200),
    notes: String(body.notes || "").trim().slice(0, 1000),
    lines: normalizedLines
  };
}

function createWascoIntegration(config, fetchImpl = global.fetch) {
  const baseUrl = String(config.wascoApiBaseUrl || "").replace(/\/+$/, "");
  const connected = Boolean(baseUrl && config.wascoApiKey);
  const mode = connected ? "api" : "demo";

  async function request(path, options = {}) {
    if (!connected) throw integrationError("De Wasco API is nog niet geconfigureerd.", 503, "WASCO_NOT_CONFIGURED");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.wascoTimeoutMs || 8000);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.wascoApiKey}`,
          ...(config.wascoCustomerNumber ? { "X-Customer-Number": config.wascoCustomerNumber } : {}),
          ...(options.headers || {})
        }
      });
      const text = await response.text();
      let payload = {};
      try { payload = text ? JSON.parse(text) : {}; } catch (_error) { payload = {}; }
      if (!response.ok) throw integrationError("Wasco kon het verzoek niet verwerken.", 502, "WASCO_UPSTREAM_ERROR");
      return payload;
    } catch (error) {
      if (error && error.code) throw error;
      if (error && error.name === "AbortError") throw integrationError("De Wasco-koppeling reageert niet op tijd.", 504, "WASCO_TIMEOUT");
      throw integrationError("De Wasco-koppeling is tijdelijk niet bereikbaar.", 502, "WASCO_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
    }
  }

  function status() {
    return {
      mode,
      connected,
      ordersEnabled: connected && Boolean(config.wascoOrdersEnabled),
      customerNumber: connected && config.wascoCustomerNumber ? `••••${String(config.wascoCustomerNumber).slice(-4)}` : "",
      capabilities: connected ? ["products", "availability", ...(config.wascoOrdersEnabled ? ["orders"] : [])] : ["demo-products", "concept-order"],
      message: connected ? "API-configuratie actief" : "Demomodus — koppel Wasco zodra de technische aansluitgegevens beschikbaar zijn"
    };
  }

  async function searchProducts(input = {}) {
    const query = String(input.query || "").trim().slice(0, 120);
    const category = String(input.category || "").trim().slice(0, 80);
    const limit = Math.min(50, Math.max(1, Number(input.limit) || 24));
    if (connected) {
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      if (category) params.set("category", category);
      const payload = await request(`/products?${params.toString()}`);
      const raw = Array.isArray(payload) ? payload : payload.items || payload.products || [];
      return { items: raw.slice(0, limit).map(normalizedProduct), total: Number(payload.total || raw.length), mode };
    }
    const needle = query.toLocaleLowerCase("nl-NL");
    const items = DEMO_PRODUCTS.filter((item) => {
      const matchesText = !needle || [item.sku, item.name, item.brand, item.category].some((value) => value.toLocaleLowerCase("nl-NL").includes(needle));
      return matchesText && (!category || item.category === category);
    }).slice(0, limit).map(normalizedProduct);
    return { items, total: items.length, mode };
  }

  async function availability(skus) {
    const cleanSkus = Array.from(new Set((Array.isArray(skus) ? skus : []).map((sku) => String(sku).trim()).filter(Boolean))).slice(0, 100);
    if (!cleanSkus.length) return { items: [], mode };
    if (connected) {
      const payload = await request(`/availability?skus=${encodeURIComponent(cleanSkus.join(","))}`);
      return { items: Array.isArray(payload) ? payload : payload.items || [], mode };
    }
    return {
      items: cleanSkus.map((sku) => {
        const item = DEMO_PRODUCTS.find((product) => product.sku === sku);
        return { sku, stock: item ? item.stock : 0, delivery: item ? item.delivery : "Onbekend artikel" };
      }),
      mode
    };
  }

  async function createOrder(input) {
    const order = validateOrder(input);
    if (connected && !config.wascoOrdersEnabled) {
      throw integrationError("Bestellen via de API is nog niet geactiveerd. Exporteer deze bestellijst als concept.", 409, "WASCO_ORDERS_DISABLED");
    }
    if (connected) {
      const payload = await request("/orders", { method: "POST", body: JSON.stringify(order) });
      return { mode, submitted: true, orderNumber: String(payload.orderNumber || payload.id || ""), status: String(payload.status || "ontvangen") };
    }
    return {
      mode,
      submitted: false,
      orderNumber: `DEMO-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomInt(1000, 9999)}`,
      status: "concept",
      message: "Concept aangemaakt. Er is niets naar Wasco verzonden."
    };
  }

  return { status, searchProducts, availability, createOrder };
}

module.exports = { createWascoIntegration, normalizedProduct, validateOrder, DEMO_PRODUCTS };
