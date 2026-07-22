"use strict";

const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

test("standalone HR portal shows no CRM navigation or CRM data", async ({ page }) => {
  const root = path.join(__dirname, "..", "..");
  await page.route("**/medewerkers/", (route) => route.fulfill({ contentType: "text/html", body: fs.readFileSync(path.join(root, "hr/index.html"), "utf8") }));
  await page.route("**/medewerkers/hr.css", (route) => route.fulfill({ contentType: "text/css", body: fs.readFileSync(path.join(root, "hr/hr.css"), "utf8") }));
  await page.route("**/medewerkers/hr.js", (route) => route.fulfill({ contentType: "application/javascript", body: fs.readFileSync(path.join(root, "hr/hr.js"), "utf8") }));
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, user: { id: "a1", username: "admin", role: "admin" }, csrfToken: "test-token", features: { hrPortalEnabled: true } } }));
  await page.route("**/api/hr/session", (route) => route.fulfill({ json: { mfaEnabled: true, elevated: true } }));
  await page.route("**/api/hr/dashboard", (route) => route.fulfill({ json: { active: 2, archived: 1, missingContracts: 1, expiring30: 0, expiring60: 0, expiring90: 0, expiring: [] } }));

  await page.goto("/medewerkers/#dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Actieve werknemers")).toBeVisible();
  await expect(page.getByRole("link", { name: "Werknemers", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Certificatenmatrix" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Checklisttemplates" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Klantenbestand" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Offertes" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Facturen" })).toHaveCount(0);
});

test("HR portal renders qualification matrix and configurable work requirements", async ({ page }) => {
  const root = path.join(__dirname, "..", "..");
  await page.route("**/medewerkers/", (route) => route.fulfill({ contentType: "text/html", body: fs.readFileSync(path.join(root, "hr/index.html"), "utf8") }));
  await page.route("**/medewerkers/hr.css", (route) => route.fulfill({ contentType: "text/css", body: fs.readFileSync(path.join(root, "hr/hr.css"), "utf8") }));
  await page.route("**/medewerkers/hr.js", (route) => route.fulfill({ contentType: "application/javascript", body: fs.readFileSync(path.join(root, "hr/hr.js"), "utf8") }));
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, user: { id: "a1", username: "admin", role: "admin" }, csrfToken: "test-token", features: { hrPortalEnabled: true } } }));
  await page.route("**/api/hr/session", (route) => route.fulfill({ json: { mfaEnabled: true, elevated: true } }));
  const definition = { id: "vca", code: "VCA", name: "VCA", kind: "certificate", evidencePolicy: "required", active: true, sortOrder: 10 };
  await page.route("**/api/hr/skills-matrix**", (route) => route.fulfill({ json: { definitions: [definition], employees: [{ id: "e1", employeeNumber: "CL-001", displayName: "Sam Monteur", department: "Uitvoering", status: "active", cells: { vca: { qualificationId: "q1", code: "expiring30", label: "Verloopt binnen 30 dagen", expiryDate: "2026-08-01", skillLevel: "" } } }] } }));
  await page.route("**/api/hr/qualification-definitions", (route) => route.fulfill({ json: { items: [definition] } }));
  await page.route("**/api/hr/qualification-requirements", (route) => route.fulfill({ json: { items: [{ id: "r1", workType: "air_conditioning", minimumLevel: "", active: true, definition }] } }));

  await page.goto("/medewerkers/#qualifications");
  await expect(page.getByRole("heading", { name: "Certificatenmatrix" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Sam Monteur/ })).toBeVisible();
  await expect(page.getByText("Verloopt binnen 30 dagen")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Eisen per werksoort" })).toBeVisible();
});

test("installation planning warns for missing qualifications", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, user: { id: "a1", username: "admin", role: "admin" }, csrfToken: "test-token", features: { hrPortalEnabled: true } } }));
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: { data: { customers: [{ id: "c1", firstName: "Test", lastName: "Klant", companyName: "" }], customerNotes: [], customerDocuments: [], products: [], quotes: [], invoices: [], installations: [], advices: [], salesOpportunities: [], settings: { companyName: "Climature" }, counters: {} } } }));
  await page.route("**/api/admin/employee-directory**", (route) => route.fulfill({ json: { items: [{ id: "e1", displayName: "Sam Monteur", jobTitle: "Installateur", active: true, qualified: false, warnings: [{ code: "missing", label: "F-gassen / BRL 200", minimumLevel: "" }] }] } }));

  await page.goto("/#installation-new");
  await page.locator('select[name="workType"]').selectOption("air_conditioning");
  await page.locator('select[name="employeeId"]').selectOption("e1");
  await expect(page.locator("[data-qualification-warning]")).toContainText("F-gassen / BRL 200");
});

test("login page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Inloggen" })).toBeVisible();
});

test("voorraadbeheer toont Excel-import, waarschuwingen en handmatige correcties", async ({ page }) => {
  let item = {
    id: "p1", sku: "WP-001", category: "warmtepomp", brand: "Climature", name: "Warmtepomp 8 kW",
    stockQuantity: 2, minimumStock: 3, stockUnit: "stuk", stockLocation: "Magazijn A"
  };
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, user: { id: "a1", username: "admin", role: "admin" }, csrfToken: "test-token", features: { hrPortalEnabled: false } } }));
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: { data: { user: { id: "a1", username: "admin", role: "admin" }, role: "admin", permissions: {}, settings: { companyName: "Climature" }, counters: {}, dashboard: { portalCounts: {} } } } }));
  await page.route("**/api/inventory**", async (route) => {
    if (route.request().method() === "PUT") {
      const input = route.request().postDataJSON();
      item = { ...item, stockQuantity: Number(String(input.quantity).replace(",", ".")), minimumStock: Number(input.minimumStock), stockUnit: input.stockUnit, stockLocation: input.stockLocation };
      return route.fulfill({ json: { item } });
    }
    return route.fulfill({ json: { items: [item], movements: [], stats: { productCount: 1, totalQuantity: item.stockQuantity, lowStockCount: item.stockQuantity <= item.minimumStock ? 1 : 0, outOfStockCount: 0 } } });
  });

  await page.goto("/#inventory");
  await expect(page.getByRole("heading", { name: "Actuele voorraad" })).toBeVisible();
  await expect(page.getByRole("table").getByText("Bijbestellen", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download Excel-sjabloon" })).toHaveAttribute("href", "/api/inventory/template");

  await page.getByRole("button", { name: "Aanpassen" }).click();
  await page.locator('input[name="quantity"]').fill("6");
  await page.locator('textarea[name="reason"]').fill("Nieuwe levering ontvangen");
  await page.getByRole("button", { name: "Voorraad opslaan" }).click();
  await expect(page.locator("#toast")).toContainText("Voorraad bijgewerkt");
  await expect(page.getByText("6 stuk", { exact: true })).toBeVisible();
});

test("advice v2 keeps draft state and renders after revisiting the advice route", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, user: { id: "a1", username: "admin", role: "admin" }, csrfToken: "test-token", features: { hrPortalEnabled: true } } }));
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: { data: {
    customers: [], customerNotes: [], customerDocuments: [], products: [], quotes: [], invoices: [], installations: [], advices: [], salesOpportunities: [], salesAppointments: [], settings: { companyName: "Climature" }, counters: {}
  } } }));
  await page.goto("/#advice-v2");
  await page.locator('[data-advice-v2-step="1"] [data-action="advice-v2-next"]').click();
  await expect(page.locator('[data-advice-v2-step="2"]')).toBeVisible();
  await page.evaluate(() => { window.location.hash = "#portals"; });
  await expect(page.getByRole("heading", { name: "Waar wilt u werken?" })).toBeVisible();
  await page.evaluate(() => { window.location.hash = "#advice-v2"; });
  await expect(page.locator('[data-advice-v2-step="2"]')).toBeVisible();
  await page.locator('[data-advice-v2-step="2"] [data-action="advice-v2-next"]').dispatchEvent('click');
  await page.locator('[data-advice-v2-step="3"] [data-action="advice-v2-calculate"]').dispatchEvent('click');
  await expect(page.getByRole("heading", { name: /Ons advies:/ })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("advice v2 creates a component-aware combination quote with VAT refund and ISDE", async ({ page }) => {
  let quotePayload;
  const pageErrors = [];
  const apiRequests = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => { if (request.url().includes("/api/")) apiRequests.push(request.method() + " " + request.url()); });
  const assumptions = {
    energy: { gasPrice: 1.45, electricityPrice: 0.30 },
    battery: { feedInCost: 0.15, epexMargin: 0.22, imbalancePerKwh: 250 },
    warmtepompProducts: {
      hybride: [{ name: "Hybride 8 kW", kw: 8, priceIncl: 12000, subsidy: 3025 }],
      allelectric: [{ name: "All-electric 10 kW", kw: 10, priceIncl: 18000, subsidy: 3500 }]
    },
    batteryProducts: {
      "1fase": [{ name: "Batterij 10 kWh", kwh: 10, priceExVat: 9000 }],
      "3fase": [{ name: "Batterij 15 kWh", kwh: 15, priceExVat: 12000 }]
    }
  };
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, user: { id: "a1", username: "admin", role: "admin" }, csrfToken: "test-token", features: { hrPortalEnabled: true } } }));
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: { data: {
    customers: [{ id: "c1", firstName: "Test", lastName: "Klant", address: "Dreef 1", postalCode: "1234 AB", city: "Utrecht" }],
    customerNotes: [], customerDocuments: [], products: [], quotes: [], invoices: [], installations: [], advices: [], salesOpportunities: [], salesAppointments: [], settings: { companyName: "Climature", adviceAssumptions: assumptions }, counters: {}
  } } }));
  await page.route("**/api/collections/advices", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { item: { ...body, id: body.id || "a1" } } });
  });
  await page.route("**/api/counters/quote/next", (route) => route.fulfill({ json: { value: "CL-OFF-2026-0099" } }));
  await page.route("**/api/collections/quotes", async (route) => {
    quotePayload = route.request().postDataJSON();
    await route.fulfill({ json: { item: { ...quotePayload, id: "q1" } } });
  });

  await page.goto("/#advice-v2:c1");
  await page.locator('select[name="energyLabel"]').selectOption("A");
  await page.locator('select[name="energyLabelQuality"]').selectOption("bekend");
  for (const value of ["dak", "gevel", "vloer", "glas"]) await page.locator(`input[name="insulation"][value="${value}"]`).check({ force: true });
  await page.locator('select[name="insulationQuality"]').selectOption("bekend");
  await page.locator('[data-advice-v2-step="1"] [data-action="advice-v2-next"]').click();
  await page.locator('select[name="gasQuality"]').selectOption("bekend");
  await page.locator('select[name="emitters"]').selectOption("vloer");
  await page.locator('input[name="pvCount"]').fill("12");
  await expect(page.locator('[data-advice-v2-step="2"] :invalid')).toHaveCount(0);
  await page.locator('[data-advice-v2-step="2"] [data-action="advice-v2-next"]').dispatchEvent('click');
  await expect(page.locator('[data-advice-v2-root]')).toHaveAttribute('data-current-step', '3');
  await page.getByRole("button", { name: "Bereken scherp advies →" }).click();
  await expect(page.locator('[data-advice-v2-product]:checked')).toHaveCount(2);
  await page.getByRole("button", { name: "Maak conceptofferte" }).click();
  await page.waitForTimeout(200);
  expect(pageErrors).toEqual([]);
  expect(apiRequests.some((url) => url.includes("/api/collections/advices"))).toBe(true);
  await expect(page.locator("#toast")).toContainText("Conceptofferte");
  await expect.poll(() => quotePayload).toBeTruthy();
  expect(quotePayload.templateType).toBe("combinatie");
  expect(quotePayload.lines.map((line) => line.componentKey)).toEqual(["warmtepomp", "thuisbatterij"]);
  expect(quotePayload.lines.find((line) => line.componentKey === "thuisbatterij").vatRefundEligible).toBe(true);
  expect(quotePayload.benefits.map((benefit) => benefit.type)).toEqual(["btw_refund", "isde"]);
  expect(quotePayload.documentConfig.version).toBe(3);
  expect(quotePayload.documentConfig.components).toHaveLength(2);
});

test("quote builder v3 renders stable pages and updates the canonical preview", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, user: { id: "a1", username: "admin", role: "admin" }, csrfToken: "test-token", features: { hrPortalEnabled: true } } }));
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: { data: {
    customers: [{ id: "c1", firstName: "Test", lastName: "Klant", address: "Dreef 1", postalCode: "1234 AB", city: "Utrecht" }],
    customerNotes: [], customerDocuments: [], products: [], quotes: [], invoices: [], installations: [], advices: [], salesOpportunities: [], salesAppointments: [], settings: { companyName: "Climature" }, counters: {}
  } } }));
  await page.goto("/#quote-new?customerId=c1");
  await expect(page.locator("[data-quote-page]")).toHaveCount(7);
  for (const name of ["Thuisbatterij", "Warmtepomp", "CV-ketel", "Airco"]) {
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await expect(page.locator("[data-quote-preview] h1").first()).not.toBeEmpty();
  }
  await page.locator('input[name="documentTitle"]').fill("Exact hetzelfde voorstel");
  await expect(page.locator("[data-quote-preview] h1").first()).toHaveText("Exact hetzelfde voorstel");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF voorbeeld" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Climature-offerte-.*\.pdf$/);
  expect(fs.statSync(await download.path()).size).toBeGreaterThan(100000);
  await page.locator('[data-page-id="intro"] input[type="checkbox"]').uncheck();
  await expect(page.locator("[data-quote-page]")).toHaveCount(6);
  await page.locator('textarea[name="includedText"]').fill(Array.from({ length: 11 }, (_, index) => `Leveringspunt ${index + 1}`).join("\n"));
  await expect(page.locator("[data-quote-page]")).toHaveCount(7);
  await expect(page.locator('[data-page-id="scope-2"]')).toContainText("Leveringspunt 11");
  await expect(page.locator("[data-preview-warning]")).toBeEmpty();
  await page.locator('textarea[name="installationText"]').fill("x".repeat(701));
  await expect(page.locator("[data-preview-warning]")).toContainText("installatietekst");
});

test("quote builder v3 combines product blocks, VAT refund and ISDE without changing the payable amount", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, user: { id: "a1", username: "admin", role: "admin" }, csrfToken: "test-token", features: { hrPortalEnabled: true } } }));
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: { data: {
    customers: [{ id: "c1", firstName: "Test", lastName: "Klant", address: "Dreef 1", postalCode: "1234 AB", city: "Utrecht" }],
    customerNotes: [], customerDocuments: [], products: [], quotes: [], invoices: [], installations: [], advices: [], salesOpportunities: [], salesAppointments: [], settings: { companyName: "Climature" }, counters: {}
  } } }));
  await page.goto("/#quote-new?customerId=c1");
  await page.locator('[data-template="combinatie"]').click();
  await expect(page.locator("[data-component]")).toHaveCount(2);
  await expect(page.locator("[data-benefit-row]")).toHaveCount(2);
  await expect(page.locator("[data-quote-page]")).toHaveCount(9);

  const battery = page.locator(".quote-line").first();
  await battery.locator('[data-line="description"]').fill("Thuisbatterij inclusief installatie");
  await battery.locator('[data-line="componentKey"]').selectOption("thuisbatterij");
  await battery.locator('[data-line="priceExVat"]').fill("10000");
  await battery.locator('[data-line="vatRefundEligible"]').check();

  const heatPump = page.locator(".quote-line").nth(1);
  await heatPump.locator('[data-line="description"]').fill("Warmtepomp inclusief installatie");
  await heatPump.locator('[data-line="componentKey"]').selectOption("warmtepomp");
  await heatPump.locator('[data-line="priceExVat"]').fill("8000");
  await page.locator('[data-benefit-row]').nth(1).locator('[data-benefit="amount"]').fill("3025");

  await expect(page.locator('[data-benefit-row]').first().locator('[data-benefit="amount"]')).toHaveValue("2100.00");
  await expect(page.locator('[data-summary="quote"]')).toContainText("€ 21.780,00");
  await expect(page.locator('[data-summary="quote"]')).toContainText("€ 5.125,00");
  await expect(page.locator('[data-summary="quote"]')).toContainText("€ 16.655,00");
  await expect(page.locator('[data-quote-preview] [data-page-id="investment"]')).toContainText("Mogelijke btw-teruggave");
  await expect(page.locator('[data-quote-preview] [data-page-id="investment"]')).toContainText("Verwachte ISDE-subsidie");
  await expect(page.locator('[data-quote-preview] [data-page-id="acceptance"]')).toContainText("€ 21.780,00");
  await expect(page.locator('[data-quote-preview] [data-page-id="acceptance"]')).not.toContainText("€ 16.655,00");
  await expect(page.locator("[data-preview-warning]")).toContainText("nog niet als gecontroleerd");
});

test("account form preserves the selected role and confirms the stored account", async ({ page }) => {
  const users = [{ id: "u1", username: "climature", email: "", role: "admin", active: true, employeeId: null }];
  let submitted;
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, user: users[0], csrfToken: "test-token", features: { hrPortalEnabled: true } } }));
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: { data: { customers: [], customerNotes: [], customerDocuments: [], products: [], quotes: [], invoices: [], installations: [], advices: [], salesOpportunities: [], salesAppointments: [], settings: { companyName: "Climature" }, counters: {} } } }));
  await page.route("**/api/admin/employee-directory**", (route) => route.fulfill({ json: { items: [] } }));
  await page.route("**/api/users", (route) => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON();
      const item = { id: "u2", username: submitted.username, email: submitted.email, role: submitted.role, active: true, employeeId: null };
      users.push(item);
      return route.fulfill({ json: { item } });
    }
    return route.fulfill({ json: { items: users } });
  });

  await page.goto("/#settings");
  const form = page.locator('form[data-form="user-create"]');
  await expect(form).toBeVisible();
  await expect(form.locator('select[name="role"]')).toHaveValue("");
  await form.locator('input[name="username"]').fill("nieuwe-sales");
  await form.locator('input[name="password"]').fill("veilig-wachtwoord");
  await form.locator('select[name="role"]').selectOption("sales");
  await form.getByRole("button", { name: "Toevoegen" }).click();

  await expect(page.locator(".toast")).toContainText("nieuwe-sales aangemaakt als Sales");
  expect(submitted.role).toBe("sales");
  await expect(page.locator('form[data-form="user-update"][data-id="u2"] select[name="role"]')).toHaveValue("sales");
  await expect(page.locator('form[data-form="user-create"] select[name="role"]')).toHaveValue("");
});

test("service portal renders contracts, requests and a mobile service work order", async ({ page }) => {
  const customer = { id: "c1", firstName: "Service", lastName: "Klant", companyName: "", email: "service@example.com", phone: "0612345678", address: "Straat 1", postalCode: "1234 AB", city: "Utrecht" };
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, user: { id: "u1", username: "admin", role: "admin" }, csrfToken: "test-token", features: { hrPortalEnabled: true } } }));
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: { data: { customers: [customer], customerNotes: [], customerDocuments: [], products: [], quotes: [], invoices: [], installations: [], advices: [], salesOpportunities: [], salesAppointments: [], settings: { companyName: "Climature" }, counters: {} } } }));
  await page.route("**/api/admin/employee-directory**", (route) => route.fulfill({ json: { items: [{ id: "e1", displayName: "Sam Service", jobTitle: "Monteur" }] } }));
  await page.route("**/api/service/bootstrap**", (route) => route.fulfill({ json: {
    dashboard: { openRequests: 1, urgentRequests: 1, upcomingVisits: 1, annualContractValue: 1800 },
    equipment: [{ id: "eq1", customerId: "c1", customer, type: "heat_pump", brand: "Test", model: "HP-1", serialNumber: "SN-1", warrantyUntil: "2031-01-01", nextMaintenanceDate: "2026-08-01", status: "active" }],
    contracts: [{ id: "co1", contractNumber: "CL-SVC-2026-0001", customerId: "c1", customer, title: "Jaarlijks onderhoud", price: 150, billingPeriod: "yearly", status: "active", nextMaintenanceDate: "2026-08-01" }],
    requests: [{ id: "sr1", requestNumber: "CL-MEL-2026-0001", customerId: "c1", customer, title: "Lage waterdruk", priority: "urgent", status: "planned" }],
    visits: [{ id: "v1", visitNumber: "CL-OND-2026-0001", customerId: "c1", customer, equipmentId: "eq1", equipment: { id: "eq1", brand: "Test", model: "HP-1" }, assignedEmployeeId: "e1", assignedEmployee: { id: "e1", firstName: "Sam", lastName: "Service" }, plannedDate: "2026-08-01", startTime: "09:00", durationHours: 2, type: "maintenance", workType: "heat_pump", status: "scheduled", diagnosis: "", workPerformed: "", materialsUsed: [], measurements: [], documents: [] }]
  } }));

  await page.goto("/#service");
  await expect(page.getByRole("heading", { name: "Nazorg onder controle" })).toBeVisible();
  await expect(page.getByText("CL-SVC-2026-0001")).toBeVisible();
  await expect(page.getByText("CL-MEL-2026-0001")).toBeVisible();
  await page.getByRole("button", { name: "Open werkbon" }).click();
  await expect(page.getByRole("heading", { name: "CL-OND-2026-0001" })).toBeVisible();
  await expect(page.locator('textarea[name="diagnosis"]')).toBeVisible();
  await expect(page.locator("[data-signature]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Afspraak bevestigen" })).toBeVisible();
  await expect(page.getByText("PDF, JPG of PNG")).toBeVisible();
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
  await expect(page).toHaveURL(/#execution-portal$/);
  await expect(page.getByRole("heading", { name: "Van voorbereiding naar oplevering" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Klantenbestand" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Installaties" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Alle portalen" })).toBeVisible();
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

test("sales agenda plans and completes a linked appointment", async ({ page }) => {
  const appointments = [];
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, user: { id: "u1", username: "admin", role: "admin" } } }));
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: { data: {
    customers: [{ id: "c1", firstName: "Agenda", lastName: "Klant", companyName: "" }],
    customerNotes: [], customerDocuments: [], products: [], quotes: [], invoices: [], installations: [], advices: [],
    salesOpportunities: [{ id: "s1", title: "Warmtepomp advies", stage: "advies", customerId: "c1", contactName: "Agenda Klant" }],
    salesAppointments: appointments, settings: { companyName: "Climature" }, counters: {}
  } } }));
  await page.route("**/api/collections/salesAppointments", async (route) => {
    const body = route.request().postDataJSON();
    const item = { ...body, id: body.id || "a1", createdAt: "2026-07-15T09:00:00.000Z", updatedAt: "2026-07-15T09:00:00.000Z" };
    const index = appointments.findIndex((entry) => entry.id === item.id);
    if (index >= 0) appointments[index] = item; else appointments.push(item);
    await route.fulfill({ json: { item } });
  });

  await page.goto("/#sales-opportunity:s1");
  await page.getByRole("button", { name: "Plan afspraak" }).click();
  await expect(page.getByRole("heading", { name: "Nieuwe afspraak" })).toBeVisible();
  await expect(page.locator('select[name="customerId"]')).toHaveValue("c1");
  await expect(page.locator('select[name="opportunityId"]')).toHaveValue("s1");
  await page.getByLabel("Datum").fill("2026-07-16");
  await page.getByLabel("Starttijd").fill("10:00");
  await page.getByLabel("Eindtijd").fill("10:45");
  await page.getByRole("button", { name: "Opslaan" }).click();

  await expect(page.getByRole("heading", { name: "Opvolging: Warmtepomp advies" })).toBeVisible();
  await page.getByRole("button", { name: "Markeer afgerond" }).click();
  await expect(page.locator(".status-pill")).toContainText("Afgerond");
});

test("admin works in separated CRM, sales, execution, finance and management portals", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, user: { id: "u1", username: "admin", role: "admin" }, features: { hrPortalEnabled: true } } }));
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: { data: {
    customers: [{ id: "c1", firstName: "Portaal", lastName: "Klant", companyName: "", email: "klant@example.com", phone: "0612345678" }],
    customerNotes: [], customerDocuments: [], products: [], quotes: [], invoices: [], installations: [], advices: [], salesOpportunities: [], salesAppointments: [], settings: { companyName: "Climature", paymentDays: 14 }, counters: {}
  } } }));
  await page.route("**/api/admin/employee-directory**", (route) => route.fulfill({ json: { items: [] } }));
  await page.route("**/api/projects/actions**", (route) => route.fulfill({ json: { items: [] } }));

  await page.goto("/#portals");
  await expect(page.getByRole("heading", { name: "Waar wilt u werken?" })).toBeVisible();
  await expect(page.locator(".portal-card")).toHaveCount(5);

  await page.locator('.portal-card[href="#sales-portal"]').click();
  await expect(page.getByRole("heading", { name: "Van lead naar opdracht" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sales funnel/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Klantenbestand" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Facturen" })).toBeHidden();

  await page.getByRole("button", { name: "Portalen" }).click();
  await page.locator('.portal-card[href="#finance-portal"]').click();
  await expect(page.getByRole("heading", { name: "Geldstromen onder controle" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Facturen", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sales funnel/ })).toBeHidden();
});

test("admin configures Google Business Profile from management", async ({ page }) => {
  let savedSettings;
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, user: { id: "u1", username: "admin", role: "admin" }, csrfToken: "test-token", features: { hrPortalEnabled: false } } }));
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: { data: {
    customers: [], customerNotes: [], customerDocuments: [], products: [], quotes: [], invoices: [], installations: [], advices: [], salesOpportunities: [], salesAppointments: [],
    settings: { companyName: "Climature", companyCity: "Utrecht", googleBusinessProfile: { profileUrl: "", reviewUrl: "" } }, counters: {}
  } } }));
  await page.route("**/api/admin/employee-directory**", (route) => route.fulfill({ json: { items: [] } }));
  await page.route("**/api/settings", async (route) => {
    savedSettings = route.request().postDataJSON();
    await route.fulfill({ json: { item: { companyName: "Climature", companyCity: "Utrecht", ...savedSettings } } });
  });

  await page.goto("/#management-portal");
  await page.getByRole("link", { name: /Google Bedrijfsprofiel/ }).first().click();
  await expect(page.getByRole("heading", { name: "Google Bedrijfsprofiel beheren" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open Google-beheer/ })).toHaveAttribute("href", "https://business.google.com/locations");

  const form = page.locator('form[data-form="google-business-settings"]');
  await form.locator('input[name="profileUrl"]').fill("https://maps.app.goo.gl/climature");
  await form.locator('input[name="reviewUrl"]').fill("https://g.page/r/climature/review");
  await form.getByRole("button", { name: "Opslaan" }).click();

  await expect(page.locator(".toast")).toContainText("Google Bedrijfsprofiel-links opgeslagen");
  expect(savedSettings).toEqual({ googleBusinessProfile: { profileUrl: "https://maps.app.goo.gl/climature", reviewUrl: "https://g.page/r/climature/review" } });
  await expect(page.getByRole("button", { name: /Kopieer beoordelingslink/ })).toBeVisible();
});

test("management shows live electricity and gas charts with refresh and offline states", async ({ page }) => {
  function pricePoint(start, hours, price, forecast) {
    return { start: new Date(start).toISOString(), end: new Date(start + hours * 60 * 60 * 1000).toISOString(), price, ...(forecast ? { forecast: true } : {}) };
  }
  const electricityStart = Date.parse("2026-07-19T22:00:00.000Z");
  const electricity = Array.from({ length: 24 }, (_, index) => pricePoint(electricityStart + index * 60 * 60 * 1000, 1, index === 5 ? -0.02 : 0.22 + index / 1000, false));
  const gasStart = Date.parse("2026-06-21T04:00:00.000Z");
  const gas = Array.from({ length: 30 }, (_, index) => pricePoint(gasStart + index * 24 * 60 * 60 * 1000, 24, 1.2 + index / 1000, false));
  let energyRequests = 0;

  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, user: { id: "u1", username: "admin", role: "admin" }, csrfToken: "test-token", features: { hrPortalEnabled: false } } }));
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: { data: {
    user: { id: "u1", username: "admin", role: "admin" }, role: "admin", permissions: {}, settings: { companyName: "Climature", paymentDays: 14 }, counters: {}, dashboard: { portalCounts: { products: 0 } }
  } } }));
  await page.route("**/api/dashboard/management", (route) => route.fulfill({ json: { metrics: { productCount: 0 }, items: {} } }));
  await page.route("**/api/energy-prices*", (route) => {
    energyRequests += 1;
    const stale = route.request().url().includes("refresh=1");
    return route.fulfill({ json: {
      source: { name: "EnergyZero", url: "https://docs.api.energyzero.nl/", fetchedAt: "2026-07-20T00:00:00.000Z", status: stale ? "stale" : "fresh", ...(stale ? { warning: "De live bron is tijdelijk niet bereikbaar. De laatst geldige prijzen worden getoond." } : {}) },
      electricity: { unit: "EUR/kWh", interval: "hour", current: electricity[2], points: electricity },
      gas: { unit: "EUR/m3", interval: "day", current: gas[28], points: gas }
    } });
  });

  await page.goto("/#management-portal");
  await expect(page.getByRole("heading", { name: "Gas- en elektriciteitsprijzen" })).toBeVisible();
  await expect(page.locator(".energy-price-card")).toHaveCount(2);
  await expect(page.locator(".energy-chart-svg")).toHaveCount(2);
  await expect(page.locator(".energy-current-price").first()).toContainText("/kWh");
  await expect(page.getByText("De stroomprijzen voor morgen zijn nog niet gepubliceerd.")).toBeVisible();
  await expect(page.locator(".energy-chart-zero")).toHaveCount(1);
  await page.locator(".energy-chart-point").first().focus();
  await expect(page.locator(".energy-chart-point").first()).toHaveAttribute("aria-label", /€/);

  await page.getByRole("button", { name: "Nu verversen" }).click();
  await expect(page.locator(".energy-price-status")).toContainText("Verouderde gegevens");
  await expect(page.getByText(/laatst geldige prijzen/)).toBeVisible();
  expect(energyRequests).toBe(2);

  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.locator(".energy-price-status")).toContainText("Offline");

  await page.setViewportSize({ width: 390, height: 844 });
  const cards = page.locator(".energy-price-card");
  const firstBox = await cards.nth(0).boundingBox();
  const secondBox = await cards.nth(1).boundingBox();
  expect(secondBox.y).toBeGreaterThan(firstBox.y + firstBox.height - 2);
});

test("sales role only sees and can enter the sales portal", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, user: { id: "s1", username: "sales", role: "sales" }, features: { hrPortalEnabled: true } } }));
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: { data: {
    customers: [{ id: "c1", firstName: "Sales", lastName: "Klant", companyName: "" }], products: [], quotes: [], advices: [], salesOpportunities: [], salesAppointments: [], settings: { companyName: "Climature" }, counters: {}
  } } }));

  await page.goto("/#portals");
  await expect(page.locator(".portal-card")).toHaveCount(1);
  await expect(page.locator('.portal-card[href="#sales-portal"]')).toBeVisible();

  await page.locator('.portal-card[href="#sales-portal"]').click();
  await expect(page.getByRole("heading", { name: "Van lead naar opdracht" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sales funnel/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Klantenbestand" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Installaties" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Facturen", exact: true })).toBeHidden();

  await page.goto("/#finance-portal");
  await expect(page).toHaveURL(/#sales-portal$/);
  await expect(page.getByRole("heading", { name: "Van lead naar opdracht" })).toBeVisible();
});

test("advice tool 2.0 renders below the legacy tool and completes a combined scan", async ({ page }) => {
  let savedAdvice;
  let savedQuote;
  await page.addInitScript(() => { window.print = () => { document.documentElement.dataset.printed = "true"; }; });
  const customer = { id: "c1", firstName: "Slimme", lastName: "Klant", companyName: "", address: "Groeneweg 12", postalCode: "1234 AB", city: "Utrecht" };
  const settings = {
    companyName: "Climature",
    adviceAssumptions: {
      energy: { gasPrice: 1.45, electricityPrice: 0.30, priceHistory: [
        { periodKey: "2026MM06", periodLabel: "juni 2026", gasPrice: 1.45, electricityPrice: 0.30, dynamicElectricityPrice: 0.26, vatIncluded: true },
        { periodKey: "2026MM05", periodLabel: "mei 2026", gasPrice: 1.40, electricityPrice: 0.28, dynamicElectricityPrice: 0.24, vatIncluded: true }
      ] },
      battery: { feedInCost: 0.15, epexMargin: 0.22, imbalancePerKwh: 250 },
      warmtepompProducts: {
        allelectric: [{ name: "Test All-electric 8", kw: 8, priceIncl: 13000, subsidy: 3500 }, { name: "Test All-electric 12", kw: 12, priceIncl: 15000, subsidy: 4500 }],
        hybride: [{ name: "Test Hybride 8", kw: 8, priceIncl: 11000, subsidy: 3000 }]
      },
      batteryProducts: { "1fase": [{ id: "test-10-1f", name: "Test Batterij 10", kwh: 10, priceExVat: 10000 }], "3fase": [{ id: "test-10-3f", name: "Test Batterij 10", kwh: 10, priceExVat: 10000 }, { id: "test-15-3f", name: "Test Batterij 15", kwh: 15, priceExVat: 12500 }, { id: "test-30-3f", name: "Test Batterij 30", kwh: 30, priceExVat: 19000 }] }
    }
  };
  const products = [
    { id: "catalog-wp-8", category: "warmtepomp", brand: "Catalog", name: "All-electric 8", priceExVat: 10743.80, vatRate: 21, adviceType: "allelectric", capacityKw: 8, subsidy: 3500 },
    { id: "catalog-wp-12", category: "warmtepomp", brand: "Catalog", name: "All-electric 12", priceExVat: 12396.69, vatRate: 21, adviceType: "allelectric", capacityKw: 12, subsidy: 4500 },
    { id: "catalog-hyb-8", category: "warmtepomp", brand: "Catalog", name: "Hybride 8", priceExVat: 9090.91, vatRate: 21, adviceType: "hybride", capacityKw: 8, subsidy: 3000 },
    { id: "test-10-1f", category: "thuisbatterij", brand: "Catalog", name: "Batterij 10", priceExVat: 10000, vatRate: 21, capacityKwh: 10, connection: "1fase" },
    { id: "test-10-3f", category: "thuisbatterij", brand: "Catalog", name: "Batterij 10", priceExVat: 10000, vatRate: 21, capacityKwh: 10, connection: "3fase" },
    { id: "test-15-3f", category: "thuisbatterij", brand: "Catalog", name: "Batterij 15", priceExVat: 12500, vatRate: 21, capacityKwh: 15, connection: "3fase" },
    { id: "test-30-3f", category: "thuisbatterij", brand: "Catalog", name: "Batterij 30", priceExVat: 19000, vatRate: 21, capacityKwh: 30, connection: "3fase" }
  ];
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, user: { id: "a1", username: "admin", role: "admin" }, csrfToken: "test-token", features: {} } }));
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: { data: { customers: [customer], customerNotes: [], customerDocuments: [], products, quotes: [], invoices: [], installations: [], advices: [], salesOpportunities: [], salesAppointments: [], settings, counters: {} } } }));
  await page.route("**/api/collections/advices", (route) => {
    savedAdvice = route.request().postDataJSON();
    return route.fulfill({ json: { item: { ...savedAdvice, id: savedAdvice.id || "a-v2", createdAt: new Date().toISOString() } } });
  });
  await page.route("**/api/counters/quote/next", (route) => route.fulfill({ json: { value: "CL-OFF-2026-0099" } }));
  await page.route("**/api/collections/quotes", (route) => {
    savedQuote = route.request().postDataJSON();
    return route.fulfill({ json: { item: { ...savedQuote, id: "q-v2", createdAt: new Date().toISOString() } } });
  });

  await page.goto("/#advice");
  await expect(page.locator("#advice-tool-frame")).toHaveCount(1);
  await expect(page.locator("[data-advice-v2-root]")).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Advies Tool 2.0/ })).toBeVisible();

  await page.goto("/#advice-v2:c1");
  await expect(page.locator("#app").getByRole("heading", { name: "Advies Tool 2.0" })).toBeVisible();
  await expect(page.locator('input[name="address"]')).toHaveValue("Groeneweg 12");
  await page.locator('select[name="energyLabel"]').selectOption("A");
  for (const value of ["dak", "gevel", "vloer", "glas"]) await page.locator(`input[name="insulation"][value="${value}"]`).check({ force: true });
  await expect(page.locator('[data-advice-v2-step="1"] :invalid')).toHaveCount(0);
  await page.locator('[data-advice-v2-step="1"] [data-action="advice-v2-next"]').dispatchEvent('click');
  await expect(page.locator('#toast')).toHaveText('');
  await expect(page.locator('[data-advice-v2-root]')).toHaveAttribute('data-current-step', '2');
  await expect(page.locator('[data-advice-v2-step="2"]')).toBeVisible();
  await expect(page.locator('.advice-v2-energy-prices tbody tr')).toHaveCount(2);
  await page.locator('input[name="energyPricePeriod"][value="2026MM05"]').check();
  await page.locator('select[name="emitters"]').selectOption("vloer");
  await page.locator('input[name="pvCount"]').fill("14");
  await page.locator('input[name="pvCount"]').dispatchEvent("change");
  await page.locator('input[name="inverterKw"]').fill("5");
  await page.locator('[data-advice-v2-step="2"] [data-action="advice-v2-next"]').dispatchEvent('click');
  await page.locator('select[name="outdoorUnit"]').selectOption("ja");
  await page.locator('select[name="connection"]').selectOption("3fase");
  await page.locator('select[name="contract"]').selectOption("dynamic");
  await page.locator('select[name="ems"]').selectOption("ja");
  await page.locator('[data-advice-v2-step="3"] [data-action="advice-v2-calculate"]').dispatchEvent('click');

  await expect(page.getByRole("heading", { name: /Ons advies:/ })).toBeVisible();
  await expect(page.getByText("All-electric warmtepomp", { exact: true })).toBeVisible();
  await expect(page.locator('[data-action="advice-v2-battery"]')).toHaveCount(2);
  await page.locator('[data-action="advice-v2-battery"][data-product-id="test-15-3f"]').click();
  await expect(page.locator('[data-action="advice-v2-battery"][data-product-id="test-15-3f"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Van advies naar definitieve offerte" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Opslaan bij klant" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Maak conceptofferte" })).toBeVisible();
  await page.getByRole("button", { name: "PDF opslaan" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-printed", "true");
  await expect(page.locator("#print-document")).toContainText("mei 2026");
  await expect(page.locator("#print-document")).toContainText("Catalog Batterij 15");
  await page.getByRole("button", { name: "Opslaan bij klant" }).click();
  await expect(page.locator(".toast")).toContainText("Advies 2.0 opgeslagen");
  expect(savedAdvice.customerId).toBe("c1");
  expect(savedAdvice.payload.version).toBe(3);
  expect(savedAdvice.payload.energyTariff.periodKey).toBe("2026MM05");
  expect(savedAdvice.payload.batterij.selectedProductId).toBe("test-15-3f");
  expect(savedAdvice.payload.actions.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Maak conceptofferte" }).click();
  await expect.poll(() => savedQuote && savedQuote.lines.length).toBe(2);
  expect(savedQuote.customerId).toBe("c1");
  expect(savedQuote.sourceAdviceId).toBe("a-v2");
  expect(savedQuote.lines.find((line) => line.componentKey === "thuisbatterij")).toMatchObject({ productId: "test-15-3f", priceExVat: 12500 });
});

test("productbeheer ordent categorie, merk en model en bewaart adviesgegevens", async ({ page }) => {
  let savedProduct;
  const products = [
    { id: "bat-10", category: "thuisbatterij", brand: "TestMerk", name: "Store 10", specs: "10 kWh, 3-fase", priceExVat: 8000, vatRate: 21, description: "Testmodel", capacityKwh: 10, connection: "3fase" }
  ];
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, user: { id: "a1", username: "admin", role: "admin" }, csrfToken: "test-token", features: {} } }));
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: { data: { customers: [], customerNotes: [], customerDocuments: [], products, quotes: [], invoices: [], installations: [], advices: [], salesOpportunities: [], salesAppointments: [], settings: { companyName: "Climature" }, counters: {} } } }));
  await page.route("**/api/collections/products", (route) => {
    savedProduct = route.request().postDataJSON();
    return route.fulfill({ json: { item: { ...savedProduct, id: "bat-15" } } });
  });

  await page.goto("/#products");
  const category = page.locator(".product-category-group", { hasText: "thuisbatterij" });
  await expect(category.getByRole("heading", { name: "TestMerk" })).toBeVisible();
  await expect(category.getByRole("heading", { name: "Store 10" })).toBeVisible();
  await expect(category.getByText("Advies-tool · 10 kWh · 3-fase")).toBeVisible();

  await category.getByRole("button", { name: "Model toevoegen", exact: true }).click();
  const form = page.locator('form[data-form="product"]');
  await expect(form.locator('input[name="category"]')).toHaveValue("thuisbatterij");
  await expect(form.locator('input[name="brand"]')).toHaveValue("TestMerk");
  await form.locator('input[name="name"]').fill("Store 15");
  await form.locator('input[name="priceExVat"]').fill("9500");
  await form.locator('input[name="capacityKwh"]').fill("15");
  await form.locator('select[name="connection"]').selectOption("3fase");
  await form.getByRole("button", { name: "Opslaan" }).click();

  await expect(page.locator(".toast")).toContainText("Product opgeslagen");
  expect(savedProduct).toMatchObject({ category: "thuisbatterij", brand: "TestMerk", name: "Store 15", capacityKwh: 15, connection: "3fase", priceExVat: 9500 });
});
