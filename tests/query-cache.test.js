"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function response(payload, status = 200, requestId = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === "x-request-id" ? requestId : null },
    text: async () => JSON.stringify(payload)
  };
}

function storageWith(fetchImpl) {
  const listeners = {};
  const window = {
    Climature: {},
    addEventListener(type, listener) { listeners[type] = listener; },
    dispatchEvent() {}
  };
  const context = {
    window,
    navigator: { onLine: true },
    fetch: fetchImpl,
    FormData,
    File,
    URLSearchParams,
    AbortController,
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    Intl,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Object,
    Array,
    JSON,
    Promise,
    Error,
    setTimeout,
    clearTimeout,
    encodeURIComponent
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "assets", "js", "storage.js"), "utf8"), context, { filename: "storage.js" });
  return window.Climature.storage;
}

describe("client query cache", () => {
  it("deduplicates identical requests and reports query status", async () => {
    let resolveRequest;
    const fetchMock = vi.fn(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const storage = storageWith(fetchMock);
    const params = { page: 1, pageSize: 25, view: "summary" };
    const first = storage.query("customers", params);
    const second = storage.query("customers", params);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storage.queryState("customers", params).status).toBe("loading");
    resolveRequest(response({ items: [{ id: "c1" }], page: 1, pageSize: 25, totalItems: 1, totalPages: 1 }));
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(storage.queryState("customers", params).status).toBe("success");
    expect(storage.pageInfo("customers").totalItems).toBe(1);
  });

  it("aborts a stale page request and keeps the newest page", async () => {
    const pending = [];
    const storage = storageWith(vi.fn((_url, options) => new Promise((resolve, reject) => {
      const request = { resolve, reject };
      pending.push(request);
      if (options.signal) options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })));
    const stale = storage.query("customers", { page: 1, pageSize: 25 });
    const latest = storage.query("customers", { page: 2, pageSize: 25 });
    await expect(stale).rejects.toMatchObject({ name: "AbortError" });
    pending[1].resolve(response({ items: [{ id: "c26" }], page: 2, pageSize: 25, totalItems: 30, totalPages: 2 }));
    await latest;
    expect(storage.pageInfo("customers")).toMatchObject({ page: 2, totalItems: 30 });
    expect(storage.getAll("customers")[0].id).toBe("c26");
  });

  it("parses validation metadata and request IDs", async () => {
    const storage = storageWith(vi.fn(async () => response({ error: "Controleer de invoer.", code: "VALIDATION_ERROR", details: [{ path: ["email"], message: "Ongeldig" }], requestId: "req-123" }, 400)));
    await expect(storage.request("/api/customers")).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR", requestId: "req-123", details: [{ path: ["email"] }] });
  });

  it("invalidates only the requested collection cache", async () => {
    const fetchMock = vi.fn(async () => response({ items: [], page: 1, pageSize: 25, totalItems: 0, totalPages: 0 }));
    const storage = storageWith(fetchMock);
    await storage.query("customers", { page: 1, pageSize: 25 });
    await storage.query("customers", { page: 1, pageSize: 25 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    storage.invalidate("customers");
    await storage.query("customers", { page: 1, pageSize: 25 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("quote draft expiry", () => {
  it("accepts drafts for 24 hours and rejects older or malformed drafts", () => {
    const window = { Climature: { storage: {} } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "assets", "js", "quotes.js"), "utf8"), { window, Date, Number, setTimeout, clearTimeout }, { filename: "quotes.js" });
    const now = Date.parse("2026-07-19T12:00:00.000Z");
    expect(window.Climature.quotes.isDraftValid({ version: 1, updatedAt: "2026-07-18T12:00:01.000Z" }, now)).toBe(true);
    expect(window.Climature.quotes.isDraftValid({ version: 1, updatedAt: "2026-07-18T11:59:59.000Z" }, now)).toBe(false);
    expect(window.Climature.quotes.isDraftValid({ version: 2, updatedAt: "2026-07-19T11:00:00.000Z" }, now)).toBe(false);
  });
});
