"use strict";

const adapters = new Map();

function registerAdapter(code, adapter) {
  if (!/^[a-z0-9_-]{2,40}$/.test(String(code || ""))) throw new Error("Ongeldige adaptercode.");
  if (!adapter || typeof adapter.fetchTelemetry !== "function") throw new Error("Adapter moet fetchTelemetry implementeren.");
  adapters.set(code, Object.freeze({ fetchTelemetry: adapter.fetchTelemetry, allowedHosts: Object.freeze([...(adapter.allowedHosts || [])]) }));
}

function getAdapter(code) { return adapters.get(String(code || "")) || null; }

// Leveranciers worden pas geregistreerd nadat API-documentatie, authenticatie en host-allowlist zijn beoordeeld.
module.exports = { registerAdapter, getAdapter };
