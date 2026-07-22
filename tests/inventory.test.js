"use strict";

const { normalizeRows } = require("../src/modules/inventory/service");
const { parseWorkbook } = require("../src/modules/inventory/service");
const { inventoryWorkbookBuffer } = require("./helpers/inventory-workbook");
const { inventoryTemplateBuffer } = require("../src/modules/inventory/workbook-template");

describe("Excel-voorraadimport", () => {
  it("leest Nederlandse kolommen en getalnotatie", () => {
    const items = normalizeRows([
      ["Artikelnummer", "Categorie", "Merk", "Naam", "Prijs excl. btw", "BTW", "Voorraad", "Minimumvoorraad", "Eenheid", "Locatie"],
      ["wp-001", "Warmtepomp", "Test", "Model 8", "1.234,56", "21%", "12,5", 3, "stuk", "Magazijn A"]
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sku: "WP-001",
      priceExVat: 1234.56,
      vatRate: 21,
      stockQuantity: 12.5,
      minimumStock: 3,
      stockLocation: "Magazijn A"
    });
  });

  it("leest een echt xlsx-bestand uit de uploadbuffer", async () => {
    const items = await parseWorkbook({
      originalname: "voorraad.xlsx",
      mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: inventoryWorkbookBuffer()
    });

    expect(items[0]).toMatchObject({ sku: "WP-100", name: "Model 100", priceExVat: 2500, stockQuantity: 8 });
  });

  it("levert een geldig en direct importeerbaar Excel-sjabloon", async () => {
    const items = await parseWorkbook({
      originalname: "climature-voorraad-import.xlsx",
      mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: inventoryTemplateBuffer()
    });

    expect(items[0]).toMatchObject({ sku: "VOORBEELD-001", stockQuantity: 0, minimumStock: 2, stockLocation: "Magazijn A" });
  });

  it("weigert het volledige bestand bij een ongeldige rij", () => {
    expect(() => normalizeRows([
      ["Artikelnummer", "Categorie", "Merk", "Naam", "Prijs excl. btw", "Voorraad"],
      ["WP-001", "Warmtepomp", "Test", "Model 8", 1200, -1]
    ])).toThrowError(expect.objectContaining({ code: "INVALID_EXCEL_ROWS" }));
  });

  it("weigert dubbele artikelnummers hoofdletterongevoelig", () => {
    expect(() => normalizeRows([
      ["SKU", "Categorie", "Merk", "Naam", "Prijs ex btw", "Voorraad"],
      ["bat-10", "Batterij", "Test", "A10", 1000, 2],
      ["BAT-10", "Batterij", "Test", "A10", 1000, 3]
    ])).toThrowError(expect.objectContaining({ code: "INVALID_EXCEL_ROWS" }));
  });

  it("meldt ontbrekende verplichte kolommen", () => {
    expect(() => normalizeRows([["Artikelnummer", "Naam"], ["WP-1", "Model"]]))
      .toThrowError(expect.objectContaining({ code: "MISSING_EXCEL_COLUMNS" }));
  });
});
