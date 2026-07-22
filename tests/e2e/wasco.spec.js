"use strict";

const { test, expect } = require("@playwright/test");

test("Wasco-portaal zoekt artikelen en maakt veilig een conceptbestelling", async ({ page }) => {
  const pageErrors = [];
  let orderPayload;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/auth/session", (route) => route.fulfill({
    json: { authenticated: true, user: { id: "a1", username: "admin", role: "admin" }, csrfToken: "test-token", features: {} }
  }));
  await page.route("**/api/bootstrap", (route) => route.fulfill({
    json: {
      data: {
        user: { id: "a1", username: "admin", role: "admin" },
        role: "admin",
        permissions: {},
        settings: {},
        counters: {},
        dashboard: { portalCounts: {} }
      }
    }
  }));
  await page.route("**/api/wasco/status", (route) => route.fulfill({
    json: { mode: "demo", connected: false, ordersEnabled: false, message: "Demomodus actief" }
  }));
  await page.route("**/api/wasco/products**", (route) => route.fulfill({
    json: { mode: "demo", total: 1, items: [{ sku: "WAS-42", name: "Test warmtepomp 8 kW", brand: "Wasco", category: "Warmtepompen", unit: "st", priceExVat: 2500, stock: 4, delivery: "Morgen geleverd", demo: true }] }
  }));
  await page.route("**/api/wasco/orders", async (route) => {
    orderPayload = route.request().postDataJSON();
    await route.fulfill({ json: { mode: "demo", submitted: false, orderNumber: "DEMO-20260721-4242", status: "concept", message: "Concept aangemaakt. Er is niets naar Wasco verzonden." } });
  });

  await page.goto("/#wasco-portal");
  await expect(page.getByRole("heading", { name: "Wasco koppeling" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Materialen vinden en klaarzetten" })).toBeVisible();
  await expect(page.getByText("Test warmtepomp 8 kW")).toBeVisible();
  await expect(page.getByText("Er wordt nog niets besteld.")).toBeVisible();

  await page.getByRole("button", { name: "Toevoegen" }).click();
  await expect(page.getByRole("heading", { name: "1 artikel" })).toBeVisible();
  await page.getByLabel("Project- of inkoopreferentie").fill("Project Utrecht");
  await page.getByRole("button", { name: "Conceptbestelling maken" }).click();

  await expect(page.getByText("DEMO-20260721-4242")).toBeVisible();
  expect(orderPayload.reference).toBe("Project Utrecht");
  expect(orderPayload.lines).toEqual([{ sku: "WAS-42", quantity: 1 }]);
  expect(pageErrors).toEqual([]);
});
