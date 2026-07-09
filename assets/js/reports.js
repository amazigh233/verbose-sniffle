(function () {
  "use strict";

  var C = window.Climature = window.Climature || {};
  var S = C.storage;

  function params() {
    return new URLSearchParams(window.location.hash.split("?")[1] || "");
  }

  function lastDayOfMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  function iso(year, monthIndex, day) {
    return year + "-" + String(monthIndex + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  }

  // Bepaalt de actieve periode uit de hash. Default: dit jaar.
  function currentRange() {
    var p = params();
    var from = p.get("from");
    var to = p.get("to");
    if (from && to) {
      return { period: "custom", from: from, to: to, label: S.formatDate(from) + " t/m " + S.formatDate(to) };
    }
    var period = p.get("period") || "year";
    var now = S.today();
    var year = Number(now.slice(0, 4));
    var monthIndex = Number(now.slice(5, 7)) - 1;
    if (period === "month") {
      return {
        period: "month",
        from: iso(year, monthIndex, 1),
        to: iso(year, monthIndex, lastDayOfMonth(year, monthIndex)),
        label: new Date(year, monthIndex, 1).toLocaleDateString("nl-NL", { month: "long", year: "numeric" })
      };
    }
    if (period === "quarter") {
      var qStart = Math.floor(monthIndex / 3) * 3;
      return {
        period: "quarter",
        from: iso(year, qStart, 1),
        to: iso(year, qStart + 2, lastDayOfMonth(year, qStart + 2)),
        label: "Kwartaal " + (Math.floor(monthIndex / 3) + 1) + " " + year
      };
    }
    return { period: "year", from: iso(year, 0, 1), to: iso(year, 11, 31), label: "Jaar " + year };
  }

  function inRange(dateValue, range) {
    var date = String(dateValue || "").slice(0, 10);
    return date && date >= range.from && date <= range.to;
  }

  function invoicesInRange(range) {
    return S.getAll("invoices").filter(function (invoice) {
      return invoice.status !== "concept" && inRange(invoice.invoiceDate, range);
    });
  }

  function quotesInRange(range) {
    return S.getAll("quotes").filter(function (quote) {
      return inRange(quote.quoteDate, range);
    });
  }

  function aggregate(invoices) {
    var totals = { count: invoices.length, subtotal: 0, vat: 0, total: 0, paid: 0, outstanding: 0 };
    var byRate = {};
    invoices.forEach(function (invoice) {
      var computed = S.calculateTotals(invoice.lines);
      totals.subtotal += computed.subtotal;
      totals.vat += computed.vat;
      totals.total += computed.total;
      if (invoice.status === "betaald") totals.paid += computed.total;
      else totals.outstanding += computed.total;
      computed.lines.forEach(function (line) {
        var rate = String(line.vatRate);
        byRate[rate] = byRate[rate] || { rate: line.vatRate, base: 0, vat: 0 };
        byRate[rate].base += line.subtotal;
        byRate[rate].vat += line.vat;
      });
    });
    var rates = Object.keys(byRate).map(function (key) { return byRate[key]; }).sort(function (a, b) { return b.rate - a.rate; });
    return { totals: totals, rates: rates };
  }

  function periodButton(period, label, active) {
    return '<button class="small-button' + (active === period ? " is-active" : "") + '" data-action="report-period" data-period="' + period + '">' + label + "</button>";
  }

  function controls(range) {
    return [
      '<div class="calendar-toolbar report-toolbar">',
      '<div class="view-switch">',
      periodButton("month", "Deze maand", range.period),
      periodButton("quarter", "Dit kwartaal", range.period),
      periodButton("year", "Dit jaar", range.period),
      "</div>",
      '<div class="report-range">',
      '<label class="field">Van<input type="date" id="report-from" value="' + S.escapeHtml(range.from) + '"></label>',
      '<label class="field">Tot<input type="date" id="report-to" value="' + S.escapeHtml(range.to) + '"></label>',
      '<button class="small-button" data-action="report-range">Toon periode</button>',
      "</div>",
      "</div>"
    ].join("");
  }

  function metric(label, value) {
    return '<div class="metric"><span>' + S.escapeHtml(label) + "</span><strong>" + value + "</strong></div>";
  }

  function vatRows(rates) {
    if (!rates.length) return '<tr><td colspan="3"><span class="muted">Geen omzet in deze periode.</span></td></tr>';
    return rates.map(function (item) {
      return "<tr><td>" + S.escapeHtml(item.rate) + "%</td><td>" + S.money(item.base) + "</td><td>" + S.money(item.vat) + "</td></tr>";
    }).join("");
  }

  function render() {
    var range = currentRange();
    var invoices = invoicesInRange(range);
    var data = aggregate(invoices);
    var t = data.totals;
    return [
      '<section class="section panel">',
      '<div class="panel-head"><div><p class="eyebrow">Rapportage</p><h2>Omzet en BTW — ' + S.escapeHtml(range.label) + '</h2></div><div class="button-row"><button class="ghost-button" data-action="report-export-invoices">Export facturen CSV</button><button class="ghost-button" data-action="report-export-quotes">Export offertes CSV</button></div></div>',
      controls(range),
      '<section class="grid four section" style="margin-top:14px;">',
      metric("Facturen", t.count),
      metric("Omzet excl. BTW", S.money(t.subtotal)),
      metric("BTW", S.money(t.vat)),
      metric("Omzet incl. BTW", S.money(t.total)),
      "</section>",
      '<section class="grid two section">',
      metric("Betaald", S.money(t.paid)),
      metric("Openstaand", S.money(t.outstanding)),
      "</section>",
      "</section>",
      '<section class="panel section">',
      '<div class="panel-head"><div><p class="eyebrow">BTW-aangifte</p><h2>Uitsplitsing per tarief</h2></div></div>',
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Tarief</th><th>Grondslag (excl. BTW)</th><th>BTW-bedrag</th></tr></thead><tbody>',
      vatRows(data.rates),
      '<tr><td><strong>Totaal</strong></td><td><strong>' + S.money(t.subtotal) + '</strong></td><td><strong>' + S.money(t.vat) + "</strong></td></tr>",
      "</tbody></table></div>",
      "</section>"
    ].join("");
  }

  function applyRange() {
    var from = document.getElementById("report-from");
    var to = document.getElementById("report-to");
    if (!from || !to || !from.value || !to.value) {
      C.app.toast("Kies een begin- en einddatum.");
      return;
    }
    if (from.value > to.value) {
      C.app.toast("De begindatum ligt na de einddatum.");
      return;
    }
    C.app.navigate("reports?from=" + from.value + "&to=" + to.value);
  }

  function csvValue(value) {
    var str = String(value == null ? "" : value);
    if (/[";\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  // NL-notatie voor Excel: puntkomma-scheiding, komma als decimaalteken.
  function csvNumber(value) {
    return (Math.round(Number(value || 0) * 100) / 100).toFixed(2).replace(".", ",");
  }

  function buildCsv(type, range) {
    var customers = S.getAll("customers");
    var header = ["Nummer", "Datum", "Klant", "Status", "Subtotaal excl. BTW", "BTW", "Totaal incl. BTW"];
    var records = type === "quotes" ? quotesInRange(range) : invoicesInRange(range);
    var rows = records.map(function (record) {
      var customer = customers.find(function (item) { return item.id === record.customerId; });
      var computed = S.calculateTotals(record.lines);
      var number = type === "quotes" ? record.quoteNumber : record.invoiceNumber;
      var date = type === "quotes" ? record.quoteDate : record.invoiceDate;
      return [
        number,
        S.formatDate(date),
        S.customerName(customer),
        record.status || "",
        csvNumber(computed.subtotal),
        csvNumber(computed.vat),
        csvNumber(computed.total)
      ].map(csvValue).join(";");
    });
    return [header.map(csvValue).join(";")].concat(rows).join("\r\n");
  }

  function exportCsv(type) {
    var range = currentRange();
    var csv = buildCsv(type, range);
    // BOM zodat Excel de UTF-8 tekens (bijv. €) correct toont.
    var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    var link = document.createElement("a");
    var url = URL.createObjectURL(blob);
    link.href = url;
    link.download = "climature-" + (type === "quotes" ? "offertes" : "facturen") + "-" + range.from + "_" + range.to + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    C.app.toast("CSV gedownload.");
  }

  C.reports = {
    render: render,
    applyRange: applyRange,
    exportCsv: exportCsv
  };
}());
