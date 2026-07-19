"use strict";

const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("@playwright/test");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(__dirname, "gebruikershandleiding.html")).href, { waitUntil: "networkidle" });
  for (const number of [1, 3, 4, 10, 12, 17, 19, 20]) {
    await page.locator(".page").nth(number - 1).screenshot({ path: path.join(__dirname, `layout-page-${String(number).padStart(2, "0")}.png`) });
  }
  await page.addStyleTag({ content: `
    html,body{background:#bac5bb!important}
    body{display:grid!important;grid-template-columns:repeat(4,210mm);gap:12mm;padding:12mm;zoom:.34}
    .page{margin:0!important;box-shadow:0 5mm 16mm rgba(0,0,0,.18)!important}
  ` });
  await page.screenshot({ path: path.join(__dirname, "layout-preview.png"), fullPage: true });
  await browser.close();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
