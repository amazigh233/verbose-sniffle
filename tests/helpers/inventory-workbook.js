"use strict";

const { strToU8, zipSync } = require("fflate");

function inventoryWorkbookBuffer() {
  const files = {
    "[Content_Types].xml": '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels": '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Voorraad" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:J2"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Artikelnummer</t></is></c><c r="B1" t="inlineStr"><is><t>Categorie</t></is></c><c r="C1" t="inlineStr"><is><t>Merk</t></is></c><c r="D1" t="inlineStr"><is><t>Naam</t></is></c><c r="E1" t="inlineStr"><is><t>Prijs excl. btw</t></is></c><c r="F1" t="inlineStr"><is><t>Voorraad</t></is></c><c r="G1" t="inlineStr"><is><t>Minimumvoorraad</t></is></c><c r="H1" t="inlineStr"><is><t>Eenheid</t></is></c><c r="I1" t="inlineStr"><is><t>Locatie</t></is></c><c r="J1" t="inlineStr"><is><t>BTW</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>WP-100</t></is></c><c r="B2" t="inlineStr"><is><t>Warmtepomp</t></is></c><c r="C2" t="inlineStr"><is><t>Climature</t></is></c><c r="D2" t="inlineStr"><is><t>Model 100</t></is></c><c r="E2"><v>2500</v></c><c r="F2"><v>8</v></c><c r="G2"><v>3</v></c><c r="H2" t="inlineStr"><is><t>stuk</t></is></c><c r="I2" t="inlineStr"><is><t>Magazijn A</t></is></c><c r="J2"><v>21</v></c></row></sheetData></worksheet>'
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name, contents]) => [name, strToU8(contents)]))));
}

module.exports = { inventoryWorkbookBuffer };
