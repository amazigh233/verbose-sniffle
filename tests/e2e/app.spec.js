"use strict";

const { test, expect } = require("@playwright/test");

test("login page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Inloggen" })).toBeVisible();
});

test("customer dossier shows documents, installations and workorder actions", async ({ page }) => {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ json: { authenticated: true, user: { id: "u1", username: "admin", role: "admin" } } });
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
          customerDocuments: [{
            id: "doc1",
            customerId: "c1",
            fileName: "schouwrapport.pdf",
            mimeType: "application/pdf",
            size: 2048,
            content: "JVBERi0xLjQKJSVFT0Y=",
            createdAt: "2026-07-04T09:00:00.000Z"
          }],
          products: [],
          quotes: [{
            id: "q1",
            quoteNumber: "CL-OFF-2026-0001",
            customerId: "c1",
            quoteDate: "2026-07-02",
            validUntil: "2026-08-02",
            status: "geaccepteerd/aanbetaling",
            total: 1210,
            lines: []
          }],
          invoices: [{
            id: "i1",
            invoiceNumber: "CL-FAC-2026-0001",
            quoteNumber: "CL-OFF-2026-0001",
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
  await expect(page.getByRole("heading", { name: "PDF-documenten" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /schouwrapport\.pdf/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Installaties" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Sam/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print werkbon" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Installatie plannen" })).toBeVisible();
  await expect(page.locator(".timeline-item.installation")).toContainText("Installatie CL-OFF-2026-0001");

  await page.getByRole("button", { name: "Installatie plannen" }).click();
  await expect(page.locator('select[name="customerId"]')).toHaveValue("c1");

  await page.goto("/#quote:q1");
  await expect(page.locator(".status-pill").filter({ hasText: "geaccepteerd/aanbetaling" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Geaccepteerd/aanbetaling" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open factuur" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open installatie" })).toBeVisible();
});

test("installation detail has a fillable mechanic work order", async ({ page }) => {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ json: { authenticated: true, user: { id: "u1", username: "admin", role: "admin" } } });
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
          quotes: [],
          invoices: [],
          installations: [{
            id: "ins1",
            customerId: "c1",
            quoteId: "",
            quoteNumber: "CL-OFF-2026-0001",
            plannedDate: "2026-07-30",
            startTime: "09:00",
            durationHours: 4,
            status: "ingepland",
            installer: "Sam",
            notes: "",
            workOrder: {
              types: ["Warmtepomp"],
              workDone: "Buitenunit geplaatst.",
              remarks: "",
              mechanicName: "Sam",
              mechanicDate: "2026-07-30",
              customerName: "Test Klant",
              customerDate: "2026-07-30",
              agreement: true,
              checks: { installedTested: true, customerInstruction: true }
            }
          }],
          settings: { companyName: "Climature" },
          counters: {}
        }
      }
    });
  });

  await page.goto("/#installation:ins1");

  await expect(page.getByRole("heading", { name: "Werkbon invullen" })).toBeVisible();
  await expect(page.getByLabel("Warmtepomp")).toBeChecked();
  await expect(page.getByLabel("Installatie geplaatst en getest")).toBeChecked();
  await expect(page.getByLabel("Uitleg aan klant gegeven")).toBeChecked();
  await expect(page.locator('textarea[name="workDone"]')).toHaveValue("Buitenunit geplaatst.");
  await expect(page.getByRole("button", { name: "Print / PDF werkbon" })).toBeVisible();
});

test("settings shows advice assumptions and refresh action", async ({ page }) => {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ json: { authenticated: true, user: { id: "u1", username: "admin", role: "admin" } } });
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

test("installer sees only customers and installations and can save a work order", async ({ page }) => {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ json: { authenticated: true, user: { id: "u2", username: "monteur", role: "installer" } } });
  });
  await page.route("**/api/bootstrap", async (route) => {
    await route.fulfill({
      json: {
        data: {
          customers: [{
            id: "c1",
            firstName: "Installatie",
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
          customerDocuments: [],
          installations: [{
            id: "ins1",
            customerId: "c1",
            quoteId: "",
            quoteNumber: "CL-OFF-2026-0001",
            plannedDate: "2026-07-30",
            startTime: "09:00",
            durationHours: 4,
            status: "ingepland",
            installer: "Monteur",
            notes: ""
          }]
        }
      }
    });
  });
  await page.route("**/api/installations/ins1/workorder", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        item: {
          id: "ins1",
          customerId: "c1",
          plannedDate: "2026-07-30",
          startTime: "09:00",
          durationHours: 4,
          status: body.status,
          installer: "Monteur",
          notes: "",
          workOrder: body.workOrder
        }
      }
    });
  });

  await page.goto("/#dashboard");
  await expect(page).toHaveURL(/#customers$/);
  await expect(page.getByRole("link", { name: "Klantenbestand" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Installaties" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Offertes" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Nieuwe klant" })).toHaveCount(0);

  await page.goto("/#installation:ins1");
  await expect(page.getByRole("heading", { name: "Werkbon invullen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bewerk" })).toHaveCount(0);
  await page.locator('textarea[name="workDone"]').fill("Installatie getest.");
  await page.getByRole("button", { name: "Werkbon opslaan" }).click();
  await expect(page.locator(".toast")).toContainText("Werkbon opgeslagen.");
});

test("sales funnel creates leads, changes stage and starts a quote", async ({ page }) => {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ json: { authenticated: true, user: { id: "u1", username: "admin", role: "admin" } } });
  });
  await page.route("**/api/bootstrap", async (route) => {
    await route.fulfill({
      json: {
        data: {
          customers: [{
            id: "c1",
            firstName: "Sales",
            lastName: "Klant",
            companyName: "",
            email: "sales@example.com",
            phone: "0612345678",
            address: "Straat 1",
            postalCode: "1234 AB",
            city: "Utrecht",
            notes: "",
            createdAt: "2026-07-01T09:00:00.000Z"
          }],
          customerNotes: [],
          customerDocuments: [],
          products: [],
          quotes: [],
          invoices: [],
          installations: [],
          advices: [],
          salesOpportunities: [],
          settings: { companyName: "Climature" },
          counters: {}
        }
      }
    });
  });
  await page.route("**/api/collections/salesOpportunities", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        item: {
          id: body.id || "s1",
          title: body.title,
          stage: body.stage || "lead",
          customerId: body.customerId || "",
          quoteId: body.quoteId || "",
          contactName: body.contactName || "",
          companyName: body.companyName || "",
          email: body.email || "",
          phone: body.phone || "",
          source: body.source || "",
          expectedValue: Number(body.expectedValue || 0),
          probability: Number(body.probability || 10),
          expectedCloseDate: body.expectedCloseDate || "",
          followUpDate: body.followUpDate || "",
          notes: body.notes || "",
          lostReason: body.lostReason || "",
          createdAt: "2026-07-10T09:00:00.000Z",
          updatedAt: "2026-07-10T09:00:00.000Z"
        }
      }
    });
  });

  await page.goto("/#sales-funnel");
  await expect(page.getByRole("heading", { name: "Deals per fase" })).toBeVisible();

  await page.getByRole("button", { name: "Nieuwe lead" }).first().click();
  await page.getByLabel("Titel").fill("Warmtepomp lead");
  await page.getByLabel("Klant koppelen").selectOption("c1");
  await page.getByLabel("Contactnaam").fill("Sales Klant");
  await page.getByLabel("Verwachte waarde").fill("8500");
  await page.getByRole("button", { name: "Opslaan" }).click();

  await expect(page.getByRole("heading", { name: "Warmtepomp lead" })).toBeVisible();
  await page.getByRole("button", { name: "Contact" }).click();
  await expect(page.locator(".status-pill").filter({ hasText: "Contact" })).toBeVisible();

  await page.getByRole("button", { name: "Start offerte" }).click();
  await expect(page.getByRole("heading", { name: "Nieuwe offerte" })).toBeVisible();
  await expect(page.locator('select[name="customerId"]')).toHaveValue("c1");
  await expect(page.locator('[data-line="description"]')).toHaveValue("Warmtepomp lead");
});
