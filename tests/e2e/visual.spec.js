"use strict";

const { test, expect } = require("@playwright/test");

async function login(page) {
  await page.goto("/");
  await page.locator('input[name="username"]').fill(process.env.E2E_ADMIN_USERNAME || "admin");
  await page.locator('input[name="password"]').fill(process.env.E2E_ADMIN_PASSWORD || "test-password");
  await page.getByRole("button", { name: "Inloggen" }).click();
  await expect(page.getByRole("heading", { name: "Waar wilt u werken?" })).toBeVisible();
}

test("desktop portaalkeuze blijft visueel stabiel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await expect(page).toHaveScreenshot("portals-desktop.png", { fullPage: true, animations: "disabled", maxDiffPixelRatio: 0.02 });
});

test("mobiele klantenlijst blijft visueel stabiel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/#customers");
  await expect(page.getByRole("heading", { name: "Klantenbestand" })).toBeVisible();
  await expect(page).toHaveScreenshot("customers-mobile.png", { fullPage: true, animations: "disabled", maxDiffPixelRatio: 0.02 });
});
