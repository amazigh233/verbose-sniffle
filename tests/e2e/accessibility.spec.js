"use strict";

const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

async function expectNoSeriousViolations(page, label) {
  const result = await new AxeBuilder({ page }).exclude("#print-document").analyze();
  const violations = result.violations.filter((violation) => ["critical", "serious"].includes(violation.impact));
  expect(violations, `${label}: ${violations.map((item) => `${item.id} (${item.nodes.length})`).join(", ")}`).toEqual([]);
}

async function login(page) {
  await page.goto("/");
  await page.locator('input[name="username"]').fill(process.env.E2E_ADMIN_USERNAME || "admin");
  await page.locator('input[name="password"]').fill(process.env.E2E_ADMIN_PASSWORD || "test-password");
  await page.getByRole("button", { name: "Inloggen" }).click();
  await expect(page.getByRole("heading", { name: "Waar wilt u werken?" })).toBeVisible();
}

test("login en hoofdportalen hebben geen ernstige axe-overtredingen", async ({ page }) => {
  await page.goto("/");
  await expectNoSeriousViolations(page, "login");
  await login(page);
  await expectNoSeriousViolations(page, "portaalkeuze");
  await page.goto("/#customers");
  await expect(page.getByRole("heading", { name: "Klantenbestand" })).toBeVisible();
  await expectNoSeriousViolations(page, "klantenlijst");
});

test("offertebouwer is automatisch toegankelijk gecontroleerd", async ({ page }) => {
  await login(page);
  await page.goto("/#quote-new");
  await expect(page.locator('form[data-form="quote"]')).toBeVisible();
  await expectNoSeriousViolations(page, "offertebouwer");
});

test("mobiel menu houdt focus en heeft geldige toegankelijkheidsstatus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const menu = page.locator('[data-action="toggle-sidebar"]');
  await expect(menu).toHaveAccessibleName("Menu openen");
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toHaveAccessibleName("Menu sluiten");
  await expect(page.locator(".sidebar-close")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toHaveAccessibleName("Menu openen");
  await expect(menu).toBeFocused();
  await expectNoSeriousViolations(page, "mobiel portaal");
});
