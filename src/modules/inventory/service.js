"use strict";

const path = require("path");
const readXlsxFile = require("read-excel-file/node");
const { Prisma } = require("@prisma/client");
const bootstrapCache = require("../../bootstrap-cache");

const MAX_ROWS = 2_000;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const HEADER_ALIASES = {
  sku: ["artikelnummer", "artikel nummer", "sku", "productcode"],
  category: ["categorie", "category"],
  brand: ["merk", "brand"],
  name: ["naam", "productnaam", "product naam", "name"],
  specs: ["specificaties", "specificatie", "specs"],
  priceExVat: ["prijs excl btw", "prijs exclusief btw", "prijs ex btw", "price ex vat"],
  vatRate: ["btw", "btw percentage", "btw tarief", "vat"],
  description: ["omschrijving", "beschrijving", "description"],
  stockQuantity: ["voorraad", "aantal", "actuele voorraad", "stock"],
  minimumStock: ["minimumvoorraad", "minimum voorraad", "minimale voorraad", "minimum stock"],
  stockUnit: ["eenheid", "voorraadeenheid", "unit"],
  stockLocation: ["locatie", "voorraadlocatie", "magazijnlocatie", "location"]
};
const REQUIRED_HEADERS = ["sku", "category", "brand", "name", "priceExVat", "stockQuantity"];

function publicError(message, status = 400, code = "INVENTORY_ERROR", details) {
  return Object.assign(new Error(message), { status, code, ...(details ? { details } : {}) });
}

function normalizeHeader(value) {
  return String(value == null ? "" : value)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[%€]/g, "").replace(/[_./()-]+/g, " ").replace(/\s+/g, " ").trim();
}

function headerMap(headerRow) {
  const aliases = new Map();
  Object.entries(HEADER_ALIASES).forEach(([field, values]) => values.forEach((value) => aliases.set(normalizeHeader(value), field)));
  const mapped = {};
  (headerRow || []).forEach((value, index) => {
    const field = aliases.get(normalizeHeader(value));
    if (field && mapped[field] === undefined) mapped[field] = index;
  });
  return mapped;
}

function localizedNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (value === null || value === undefined || value === "") return NaN;
  let normalized = String(value).trim().replace(/[\s\u00a0€%']/g, "").replace(/[^\d,.+-]/g, "");
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimalMark = comma > dot ? "," : ".";
    normalized = normalized.replace(decimalMark === "," ? /\./g : /,/g, "").replace(decimalMark, ".");
  } else if (comma >= 0) normalized = normalized.replace(/\./g, "").replace(",", ".");
  else normalized = normalized.replace(/,/g, "");
  const result = Number(normalized);
  return Number.isFinite(result) ? result : NaN;
}

function text(value, maximum) {
  return String(value == null ? "" : value).trim().slice(0, maximum);
}

function normalizeRows(rows) {
  if (!Array.isArray(rows) || !rows.length) throw publicError("Het Excel-bestand bevat geen gegevens.", 400, "EMPTY_EXCEL_FILE");
  const columns = headerMap(rows[0]);
  const missing = REQUIRED_HEADERS.filter((field) => columns[field] === undefined);
  if (missing.length) {
    const labels = { sku: "Artikelnummer", category: "Categorie", brand: "Merk", name: "Naam", priceExVat: "Prijs excl. btw", stockQuantity: "Voorraad" };
    throw publicError(`Verplichte Excel-kolommen ontbreken: ${missing.map((field) => labels[field]).join(", ")}.`, 400, "MISSING_EXCEL_COLUMNS");
  }
  if (rows.length - 1 > MAX_ROWS) throw publicError(`Een Excel-import mag maximaal ${MAX_ROWS} productregels bevatten.`, 413, "TOO_MANY_EXCEL_ROWS");

  const errors = [];
  const seen = new Map();
  const items = [];
  rows.slice(1).forEach((row, offset) => {
    const rowNumber = offset + 2;
    if (!(row || []).some((value) => value !== null && String(value).trim() !== "")) return;
    const value = (field) => row[columns[field]];
    const sku = text(value("sku"), 80).toUpperCase();
    const category = text(value("category"), 100);
    const brand = text(value("brand"), 100);
    const name = text(value("name"), 180);
    const priceExVat = localizedNumber(value("priceExVat"));
    const stockQuantity = localizedNumber(value("stockQuantity"));
    const minimumRaw = columns.minimumStock === undefined ? 0 : value("minimumStock");
    const minimumStock = minimumRaw === null || minimumRaw === "" ? 0 : localizedNumber(minimumRaw);
    const vatRaw = columns.vatRate === undefined ? 21 : value("vatRate");
    const vatRate = vatRaw === null || vatRaw === "" ? 21 : localizedNumber(vatRaw);
    const rowErrors = [];
    if (!sku) rowErrors.push("artikelnummer ontbreekt");
    if (!category) rowErrors.push("categorie ontbreekt");
    if (!brand) rowErrors.push("merk ontbreekt");
    if (!name) rowErrors.push("naam ontbreekt");
    if (!Number.isFinite(priceExVat) || priceExVat < 0 || priceExVat > 99_999_999_999.99) rowErrors.push("prijs excl. btw is ongeldig");
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) rowErrors.push("btw-tarief is ongeldig");
    if (!Number.isFinite(stockQuantity) || stockQuantity < 0 || stockQuantity > 9_999_999_999.99) rowErrors.push("voorraad is ongeldig");
    if (!Number.isFinite(minimumStock) || minimumStock < 0 || minimumStock > 9_999_999_999.99) rowErrors.push("minimumvoorraad is ongeldig");
    if (sku && seen.has(sku)) rowErrors.push(`artikelnummer komt ook voor op rij ${seen.get(sku)}`);
    if (rowErrors.length) {
      errors.push({ path: `rij ${rowNumber}`, message: rowErrors.join("; ") });
      return;
    }
    seen.set(sku, rowNumber);
    items.push({
      rowNumber, sku, category, brand, name,
      specs: columns.specs === undefined ? "" : text(value("specs"), 1_000),
      priceExVat, vatRate,
      description: columns.description === undefined ? "" : text(value("description"), 4_000),
      stockQuantity, minimumStock,
      stockUnit: columns.stockUnit === undefined ? "stuk" : text(value("stockUnit"), 40) || "stuk",
      stockLocation: columns.stockLocation === undefined ? "" : text(value("stockLocation"), 120)
    });
  });
  if (errors.length) throw publicError("De Excel-import bevat ongeldige regels.", 400, "INVALID_EXCEL_ROWS", errors.slice(0, 100));
  if (!items.length) throw publicError("Het Excel-bestand bevat geen productregels.", 400, "EMPTY_EXCEL_FILE");
  return items;
}

function validateWorkbookFile(file) {
  if (!file || !file.buffer || !file.buffer.length) throw publicError("Kies een Excel-bestand.");
  const extension = path.extname(String(file.originalname || "")).toLowerCase();
  const zipSignature = file.buffer.length >= 4 && file.buffer[0] === 0x50 && file.buffer[1] === 0x4b && file.buffer[2] === 0x03 && file.buffer[3] === 0x04;
  if (extension !== ".xlsx" || file.mimetype !== XLSX_MIME || !zipSignature) {
    throw publicError("Gebruik een geldig Excel-bestand in .xlsx-formaat.", 400, "INVALID_EXCEL_FILE");
  }
}

async function parseWorkbook(file) {
  validateWorkbookFile(file);
  let workbook;
  try { workbook = await readXlsxFile(file.buffer); }
  catch (_error) { throw publicError("Het Excel-bestand kon niet worden gelezen. Controleer of het bestand niet beschadigd is.", 400, "INVALID_EXCEL_FILE"); }
  const rows = Array.isArray(workbook) && workbook[0] && Array.isArray(workbook[0].data) ? workbook[0].data : workbook;
  return normalizeRows(rows);
}

async function list(prisma, query = {}) {
  const search = text(query.search, 200);
  const where = search ? { OR: ["sku", "category", "brand", "name", "stockLocation"].map((field) => ({ [field]: { contains: search, mode: "insensitive" } })) } : undefined;
  const [items, movements] = await Promise.all([
    prisma.product.findMany({ where, orderBy: [{ category: "asc" }, { brand: "asc" }, { name: "asc" }], take: 1_000 }),
    prisma.inventoryMovement.findMany({ include: { product: { select: { sku: true, brand: true, name: true, stockUnit: true } }, createdBy: { select: { username: true } } }, orderBy: { createdAt: "desc" }, take: 12 })
  ]);
  const lowStock = items.filter((item) => Number(item.minimumStock) > 0 && Number(item.stockQuantity) <= Number(item.minimumStock));
  return {
    items,
    movements,
    stats: {
      productCount: items.length,
      totalQuantity: items.reduce((sum, item) => sum + Number(item.stockQuantity), 0),
      lowStockCount: lowStock.length,
      outOfStockCount: items.filter((item) => Number(item.stockQuantity) <= 0).length
    }
  };
}

function decimal(value, label) {
  const number = localizedNumber(value);
  if (!Number.isFinite(number) || number < 0 || number > 9_999_999_999.99) throw publicError(`${label} is ongeldig.`);
  return new Prisma.Decimal(number).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

async function adjust(prisma, user, productId, input) {
  const quantity = decimal(input.quantity, "Voorraad");
  const minimumStock = decimal(input.minimumStock === undefined ? 0 : input.minimumStock, "Minimumvoorraad");
  const reason = text(input.reason, 500);
  if (!reason) throw publicError("Vul een reden voor de voorraadwijziging in.");
  const now = new Date();
  const item = await prisma.$transaction(async (tx) => {
    const current = await tx.product.findUnique({ where: { id: productId } });
    if (!current) throw publicError("Product niet gevonden.", 404, "PRODUCT_NOT_FOUND");
    const before = new Prisma.Decimal(current.stockQuantity);
    const updated = await tx.product.update({ where: { id: productId }, data: {
      stockQuantity: quantity,
      minimumStock,
      stockUnit: text(input.stockUnit, 40) || "stuk",
      stockLocation: text(input.stockLocation, 120),
      inventoryUpdatedAt: now
    } });
    if (!before.equals(quantity)) await tx.inventoryMovement.create({ data: {
      productId, type: "adjustment", source: "manual", quantityBefore: before, quantityAfter: quantity,
      delta: quantity.minus(before), reason, createdById: user.id
    } });
    return updated;
  });
  bootstrapCache.invalidate();
  return item;
}

async function importWorkbook(prisma, user, file) {
  const items = await parseWorkbook(file);
  const now = new Date();
  const reference = text(file.originalname, 240);
  const summary = await prisma.$transaction(async (tx) => {
    let created = 0, updated = 0, unchanged = 0;
    const existingProducts = await tx.product.findMany({ where: { OR: [{ sku: { in: items.map((item) => item.sku) } }, { sku: null }] } });
    const bySku = new Map(existingProducts.filter((item) => item.sku).map((item) => [item.sku, item]));
    const identityKey = (item) => [item.category, item.brand, item.name].map((value) => String(value || "").trim().toLowerCase()).join("\u0000");
    const withoutSku = new Map(existingProducts.filter((item) => !item.sku).map((item) => [identityKey(item), item]));
    for (const input of items) {
      const fallbackKey = identityKey(input);
      const current = bySku.get(input.sku) || withoutSku.get(fallbackKey);
      if (current && !current.sku) withoutSku.delete(fallbackKey);
      const productData = {
        sku: input.sku, category: input.category, brand: input.brand, name: input.name, specs: input.specs,
        priceExVat: input.priceExVat, vatRate: input.vatRate, description: input.description,
        stockQuantity: input.stockQuantity, minimumStock: input.minimumStock, stockUnit: input.stockUnit,
        stockLocation: input.stockLocation, inventoryUpdatedAt: now
      };
      if (!current) {
        const product = await tx.product.create({ data: productData });
        bySku.set(input.sku, product);
        created += 1;
        if (input.stockQuantity !== 0) await tx.inventoryMovement.create({ data: {
          productId: product.id, type: "initial", source: "excel", quantityBefore: 0,
          quantityAfter: input.stockQuantity, delta: input.stockQuantity, reason: "Eerste voorraad uit Excel-import",
          reference, createdById: user.id
        } });
        continue;
      }
      const before = new Prisma.Decimal(current.stockQuantity);
      const after = new Prisma.Decimal(input.stockQuantity);
      await tx.product.update({ where: { id: current.id }, data: productData });
      bySku.set(input.sku, { ...current, ...productData });
      if (before.equals(after)) unchanged += 1;
      else {
        updated += 1;
        await tx.inventoryMovement.create({ data: {
          productId: current.id, type: "count", source: "excel", quantityBefore: before,
          quantityAfter: after, delta: after.minus(before), reason: "Voorraadtelling uit Excel-import",
          reference, createdById: user.id
        } });
      }
    }
    return { total: items.length, created, updated, unchanged };
  }, { maxWait: 5_000, timeout: 30_000 });
  bootstrapCache.invalidate();
  return summary;
}

module.exports = { adjust, importWorkbook, list, normalizeRows, parseWorkbook, validateWorkbookFile };
