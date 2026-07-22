"use strict";

const { strToU8, zipSync } = require("fflate");

function xmlCell(reference, value, style) {
  const styleAttribute = style === undefined ? "" : ` s="${style}"`;
  if (typeof value === "number") return `<c r="${reference}"${styleAttribute}><v>${value}</v></c>`;
  return `<c r="${reference}" t="inlineStr"${styleAttribute}><is><t>${String(value)}</t></is></c>`;
}

function inventoryTemplateBuffer() {
  const headers = ["Artikelnummer", "Categorie", "Merk", "Naam", "Prijs excl. btw", "BTW", "Specificaties", "Omschrijving", "Voorraad", "Minimumvoorraad", "Eenheid", "Locatie"];
  const example = ["VOORBEELD-001", "warmtepomp", "Voorbeeldmerk", "Voorbeeldmodel", 2500, 21, "8 kW", "Voorbeeldregel — vervangen of verwijderen", 0, 2, "stuk", "Magazijn A"];
  const columns = "ABCDEFGHIJKL";
  const headerRow = headers.map((value, index) => xmlCell(`${columns[index]}1`, value, 1)).join("");
  const exampleRow = example.map((value, index) => xmlCell(`${columns[index]}2`, value)).join("");
  const files = {
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Voorraad import" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF123C24"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>',
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:L2"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="20" customWidth="1"/><col min="2" max="4" width="20" customWidth="1"/><col min="5" max="6" width="16" customWidth="1"/><col min="7" max="8" width="34" customWidth="1"/><col min="9" max="10" width="18" customWidth="1"/><col min="11" max="12" width="18" customWidth="1"/></cols><sheetData><row r="1">${headerRow}</row><row r="2">${exampleRow}</row></sheetData><autoFilter ref="A1:L2"/></worksheet>`
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name, contents]) => [name, strToU8(contents)]))));
}

module.exports = { inventoryTemplateBuffer };
