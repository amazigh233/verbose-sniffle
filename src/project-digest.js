"use strict";

const { prisma } = require("./prisma");
const { loadConfig } = require("./config");
const projects = require("./project-data");
const data = require("./data");

function localParts(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${value.year}-${value.month}-${value.day}`, hour: Number(value.hour) };
}

function escapeHtml(value) { return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

async function recipients(prismaClient, settings) {
  const configured = String(settings.projectDigest && settings.projectDigest.recipients || "").split(/[;,\s]+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  const admins = await prismaClient.user.findMany({ where: { role: "admin", active: true, email: { not: "" } }, select: { email: true } });
  const owners = await prismaClient.customerProject.findMany({ where: { status: { notIn: ["completed", "cancelled"] }, owner: { active: true, email: { not: "" } } }, select: { owner: { select: { email: true } } }, distinct: ["ownerUserId"] });
  return Array.from(new Set(configured.concat(admins.map((item) => item.email.toLowerCase()), owners.map((item) => item.owner.email.toLowerCase()))));
}

async function digestItems(prismaClient) {
  const systemAdmin = await prismaClient.user.findFirst({ where: { role: "admin", active: true }, select: { id: true, role: true } });
  if (!systemAdmin) return [];
  return projects.actionCenter(prismaClient, systemAdmin, { window: "all" });
}

function renderDigest(items, baseUrl) {
  const selected = items.slice(0, 50);
  const text = ["Climature projectacties", "", ...selected.map((item) => `${item.dueDate} — ${item.customerName} — ${item.title} — ${baseUrl}/#project:${item.projectId}`)].join("\n");
  const html = `<h1>Projectacties</h1><p>${selected.length} actie(s) vragen aandacht.</p><table cellpadding="8" cellspacing="0" border="1"><thead><tr><th>Deadline</th><th>Klant</th><th>Actie</th><th>Project</th></tr></thead><tbody>${selected.map((item) => `<tr><td>${escapeHtml(item.dueDate)}</td><td>${escapeHtml(item.customerName)}</td><td>${escapeHtml(item.title)}</td><td><a href="${escapeHtml(baseUrl)}/#project:${encodeURIComponent(item.projectId)}">${escapeHtml(item.projectNumber)}</a></td></tr>`).join("")}</tbody></table>`;
  return { text, html };
}

async function sendResend(config, recipient, content) {
  if (!config.resendApiKey || !config.projectMailFrom) throw new Error("Resend is nog niet geconfigureerd.");
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: config.projectMailFrom, to: [recipient], subject: "Climature — dagelijkse projectacties", text: content.text, html: content.html }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Mailprovider weigerde de verzending (${response.status}).`);
  return payload.id || "";
}

async function runDigest({ prismaClient = prisma, config = loadConfig(), now = new Date(), force = false } = {}) {
  const settings = await data.getSettings(prismaClient);
  const digest = settings.projectDigest || { enabled: true, hour: 7, timezone: "Europe/Amsterdam", recipients: "" };
  const local = localParts(digest.timezone || "Europe/Amsterdam", now);
  if (!force && (!digest.enabled || local.hour !== Number(digest.hour == null ? 7 : digest.hour))) return { skipped: true, reason: "outside_window", local };
  const items = await digestItems(prismaClient);
  const addresses = await recipients(prismaClient, settings);
  const content = renderDigest(items, config.appBaseUrl.replace(/\/$/, ""));
  const results = [];
  for (const recipient of addresses) {
    const run = await prismaClient.projectDigestRun.upsert({ where: { digestDate_recipient: { digestDate: local.date, recipient } }, update: {}, create: { digestDate: local.date, recipient } });
    if (run.status === "sent") { results.push({ recipient, status: "already_sent" }); continue; }
    try {
      const providerId = await sendResend(config, recipient, content);
      await prismaClient.projectDigestRun.update({ where: { id: run.id }, data: { status: "sent", sentAt: new Date(), providerId, attemptCount: { increment: 1 }, lastError: "" } });
      results.push({ recipient, status: "sent" });
    } catch (error) {
      await prismaClient.projectDigestRun.update({ where: { id: run.id }, data: { status: "failed", attemptCount: { increment: 1 }, lastError: String(error.message || "Verzending mislukt").slice(0, 300) } });
      results.push({ recipient, status: "failed" });
    }
  }
  return { skipped: false, date: local.date, itemCount: items.length, results };
}

if (require.main === module) runDigest().then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());

module.exports = { localParts, renderDigest, runDigest };
