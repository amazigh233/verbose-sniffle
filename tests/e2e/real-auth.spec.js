"use strict";

const { test, expect } = require("@playwright/test");

test("real backend login serves a minimal bootstrap and paginated customers", async ({ page }) => {
  const bootstrapResponse = page.waitForResponse((response) => response.url().endsWith("/api/bootstrap") && response.request().method() === "GET");
  await page.goto("/");
  await page.locator('input[name="username"]').fill(process.env.E2E_ADMIN_USERNAME || "admin");
  await page.locator('input[name="password"]').fill(process.env.E2E_ADMIN_PASSWORD || "test-password");
  await page.getByRole("button", { name: "Inloggen" }).click();
  const bootstrap = await (await bootstrapResponse).json();
  expect(bootstrap.data).toMatchObject({ role: "admin", references: { apiVersion: 2 } });
  for (const collection of ["customers", "quotes", "invoices", "installations", "documents"]) expect(bootstrap.data[collection]).toBeUndefined();
  await expect(page.getByRole("heading", { name: "Waar wilt u werken?" })).toBeVisible();

  const pageResult = await page.evaluate(async () => {
    const response = await fetch("/api/customers?page=1&pageSize=25&sortBy=lastName&sortOrder=asc");
    return { status: response.status, body: await response.json() };
  });
  expect(pageResult.status).toBe(200);
  expect(pageResult.body).toEqual(expect.objectContaining({ items: expect.any(Array), page: 1, pageSize: 25, totalItems: expect.any(Number), totalPages: expect.any(Number) }));
});

test("real backend rejects an invalid login without leaking internals", async ({ request }) => {
  const response = await request.post("/api/auth/login", { data: { username: "admin", password: "definitely-wrong" } });
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.error).toBeTruthy();
  expect(JSON.stringify(body)).not.toContain("stack");
});

async function loginInBrowser(page) {
  await page.goto("/");
  await page.locator('input[name="username"]').fill(process.env.E2E_ADMIN_USERNAME || "admin");
  await page.locator('input[name="password"]').fill(process.env.E2E_ADMIN_PASSWORD || "test-password");
  await page.getByRole("button", { name: "Inloggen" }).click();
  await expect(page.getByRole("heading", { name: "Waar wilt u werken?" })).toBeVisible();
}

test("dirty-formbeveiliging bewaakt navigatie en herstelt de focus", async ({ page }) => {
  await loginInBrowser(page);
  await page.goto("/#customer-new");
  await page.locator('input[name="firstName"]').fill("Niet opgeslagen");
  await page.getByRole("button", { name: "Portalen" }).click();
  const dialog = page.locator("#app-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Annuleren" }).click();
  await expect(page).toHaveURL(/#customer-new$/);
  await expect(page.getByRole("button", { name: "Portalen" })).toBeFocused();
});

test("offerteconcept wordt binnen de sessie expliciet hersteld", async ({ page }) => {
  await loginInBrowser(page);
  await page.goto("/#quote-new");
  const title = page.locator('input[name="documentTitle"]');
  await title.fill("Tijdelijk herstelbaar voorstel");
  await page.waitForTimeout(450);
  await page.evaluate(() => window.Climature.app.clearDirty());
  await page.reload();
  await expect(page.getByText(/tijdelijk concept van/i)).toBeVisible();
  await page.getByRole("button", { name: "Herstellen" }).click();
  await expect(page.locator('input[name="documentTitle"]')).toHaveValue("Tijdelijk herstelbaar voorstel");
});
