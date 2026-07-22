"use strict";

const { createWascoIntegration, validateOrder } = require("../src/wasco-integration");

describe("Wasco integration", () => {
  it("starts safely in demo mode without credentials", async () => {
    const integration = createWascoIntegration({});
    expect(integration.status()).toMatchObject({ connected: false, mode: "demo", ordersEnabled: false });

    const result = await integration.searchProducts({ query: "warmtepomp" });
    expect(result.mode).toBe("demo");
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((item) => item.demo)).toBe(true);
  });

  it("filters demo products by category and text", async () => {
    const integration = createWascoIntegration({});
    const result = await integration.searchProducts({ query: "flamco", category: "Installatiemateriaal" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ brand: "Flamco", category: "Installatiemateriaal" });
  });

  it("rejects invalid order lines", () => {
    expect(() => validateOrder({ lines: [{ sku: "WAS-1", quantity: 0 }] })).toThrow("Controleer de artikelnummers en aantallen");
    expect(() => validateOrder({ lines: [] })).toThrow("minimaal één artikel");
  });

  it("creates a non-submitted concept in demo mode", async () => {
    const integration = createWascoIntegration({});
    const result = await integration.createOrder({ reference: "Project 42", lines: [{ sku: "WAS-100184", quantity: 2 }] });
    expect(result).toMatchObject({ mode: "demo", submitted: false, status: "concept" });
    expect(result.orderNumber).toMatch(/^DEMO-/);
  });

  it("normalizes products returned by a configured API", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ products: [{ articleNumber: "ABC-1", description: "Testartikel", netPrice: 12.5, availableQuantity: 3 }] })
    });
    const integration = createWascoIntegration({ wascoApiBaseUrl: "https://supplier.example", wascoApiKey: "secret", wascoTimeoutMs: 1000 }, fetchImpl);
    const result = await integration.searchProducts({ query: "test" });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][0]).toContain("/products?q=test");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer secret");
    expect(result.items[0]).toMatchObject({ sku: "ABC-1", name: "Testartikel", priceExVat: 12.5, stock: 3 });
  });

  it("keeps live order submission disabled unless explicitly enabled", async () => {
    const integration = createWascoIntegration({ wascoApiBaseUrl: "https://supplier.example", wascoApiKey: "secret", wascoOrdersEnabled: false });
    await expect(integration.createOrder({ lines: [{ sku: "ABC-1", quantity: 1 }] })).rejects.toMatchObject({ code: "WASCO_ORDERS_DISABLED", status: 409 });
  });
});
