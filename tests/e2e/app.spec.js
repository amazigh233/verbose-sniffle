"use strict";

const { test, expect } = require("@playwright/test");

test("login page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Inloggen" })).toBeVisible();
});

test("customer dossier shows documents, installations and workorder actions", async ({ page }) => {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ json: { authenticated: true, user: { username: "admin" } } });
  });
  await page.route("**/api/bootstrap", async (route) => {
    await route.fulfill({
      json: {
        data: {
          customers: [{
            id: "c1",
            firstName: "Test",
            lastName: "Klant",
            companyName: "",
            email: "test@example.com",
            phone: "0612345678",
            address: "Straat 1",
            postalCode: "1234 AB",
            city: "Utrecht",
            notes: "",
            createdAt: "2026-07-01T09:00:00.000Z"
          }],
          customerNotes: [],
          products: [],
          quotes: [{
            id: "q1",
            quoteNumber: "CL-OFF-2026-0001",
            customerId: "c1",
            quoteDate: "2026-07-02",
            validUntil: "2026-08-02",
            status: "geaccepteerd",
            total: 1210,
            lines: []
          }],
          invoices: [{
            id: "i1",
            invoiceNumber: "CL-FAC-2026-0001",
            customerId: "c1",
            invoiceDate: "2026-07-03",
            dueDate: "2026-07-17",
            status: "verzonden",
            total: 1210,
            lines: []
          }],
          installations: [{
            id: "ins1",
            customerId: "c1",
            quoteId: "q1",
            quoteNumber: "CL-OFF-2026-0001",
            plannedDate: "2026-07-30",
            startTime: "09:00",
            durationHours: 4,
            status: "ingepland",
            installer: "Sam",
            notes: "Neem extra leidingwerk mee."
          }],
          settings: { companyName: "Climature" },
          counters: {}
        }
      }
    });
  });

  await page.goto("/#customer:c1");

  await expect(page.getByRole("heading", { name: "Documenten en planning" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Installaties" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Sam/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print werkbon" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Installatie plannen" })).toBeVisible();
  await expect(page.locator(".timeline-item.installation")).toContainText("Installatie CL-OFF-2026-0001");

  await page.getByRole("button", { name: "Installatie plannen" }).click();
  await expect(page.locator('select[name="customerId"]')).toHaveValue("c1");
});

test("settings shows advice assumptions and refresh action", async ({ page }) => {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ json: { authenticated: true, user: { username: "admin" } } });
  });
  await page.route("**/api/bootstrap", async (route) => {
    await route.fulfill({
      json: {
        data: {
          customers: [],
          customerNotes: [],
          products: [],
          quotes: [],
          invoices: [],
          installations: [],
          advices: [],
          settings: {
            companyName: "Climature",
            adviceAssumptions: {
              energy: {
                gasPrice: 1.37,
                electricityPrice: 0.29,
                dynamicElectricityPrice: 0.24,
                gasAnnualIncrease: 5,
                electricityAnnualIncrease: 2
              },
              sources: {
                energy: {
                  label: "CBS gemiddelde energietarieven voor consumenten",
                  period: "juni 2026",
                  refreshedAt: "2026-07-09T10:00:00.000Z"
                }
              }
            }
          },
          counters: {}
        }
      }
    });
  });

  await page.goto("/#settings");

  await expect(page.getByRole("heading", { name: "Advies-aannames" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cijfers verversen" })).toBeVisible();
  await expect(page.locator('[data-advice-assumption="energy.gasPrice"]')).toHaveValue("1.37");
  await expect(page.locator(".notice").filter({ hasText: "juni 2026" })).toBeVisible();
});
