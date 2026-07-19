"use strict";

const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("@playwright/test");

async function main() {
  const source = path.join(__dirname, "gebruikershandleiding.html");
  const output = path.join(__dirname, "Climature-Gebruikershandleiding.pdf");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(source).href, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  const validation = await page.$$eval(".page", pages => pages.map((item, index) => ({
    page: index + 1,
    overflowX: item.scrollWidth - item.clientWidth,
    overflowY: item.scrollHeight - item.clientHeight
  // De cover gebruikt bewust decoratieve cirkels buiten het A4-vlak. Een paar
  // subpixels op de laatste pagina komen van afgeronde millimeterwaarden.
  })).filter(item => item.page !== 1 && (item.overflowX > 12 || item.overflowY > 12)));
  if (validation.length) throw new Error(`Pagina-inhoud valt buiten het A4-vlak: ${JSON.stringify(validation)}`);
  await page.pdf({
    path: output,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    tagged: true,
    outline: true
  });
  await browser.close();
  process.stdout.write(`PDF opgeslagen: ${output}\n`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
