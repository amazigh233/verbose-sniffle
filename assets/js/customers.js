(function () {
  "use strict";

  var C = window.Climature = window.Climature || {};
  var S = C.storage;

  function emptyCustomer() {
    return {
      firstName: "",
      lastName: "",
      companyName: "",
      email: "",
      phone: "",
      address: "",
      postalCode: "",
      city: "",
      notes: ""
    };
  }

  function matches(customer, query) {
    if (!query) return true;
    var haystack = [
      customer.firstName,
      customer.lastName,
      customer.companyName,
      customer.email,
      customer.phone,
      customer.postalCode
    ].join(" ").toLowerCase();
    return haystack.indexOf(query.toLowerCase()) >= 0;
  }

  function renderList(query) {
    var customers = S.getAll("customers").filter(function (customer) { return matches(customer, query || ""); });
    var rows = customers.map(function (customer) {
      var actions = '<button class="small-button" data-action="customer-detail" data-id="' + customer.id + '">Open</button>' +
        (S.hasRole("admin", "installer") ? '<button class="small-button" data-action="customer-projects" data-id="' + customer.id + '">Projectcockpit</button>' : "") +
        (S.canManage("crm") ? '<button class="small-button" data-action="customer-edit" data-id="' + customer.id + '">Bewerk</button>' : "");
      return [
        "<tr>",
        "<td><strong>" + S.escapeHtml(S.customerName(customer)) + "</strong><br><span class=\"muted\">" + S.escapeHtml([customer.firstName, customer.lastName].filter(Boolean).join(" ")) + "</span></td>",
        "<td>" + S.escapeHtml(customer.email || "-") + "<br><span class=\"muted\">" + S.escapeHtml(customer.phone || "") + "</span></td>",
        "<td>" + S.escapeHtml(customer.address || "-") + "<br><span class=\"muted\">" + S.escapeHtml([customer.postalCode, customer.city].filter(Boolean).join(" ")) + "</span></td>",
        "<td>" + S.formatDate((customer.createdAt || "").slice(0, 10)) + "</td>",
        '<td><div class="button-row">' + actions + "</div></td>",
        "</tr>"
      ].join("");
    }).join("");
    var headActions = S.canManage("crm")
      ? '<div class="button-row"><button class="ghost-button" data-action="customer-import">Importeer aanvraag</button><button class="primary-button" data-action="customer-new">Nieuwe klant</button></div>'
      : "";

    return [
      '<section class="section panel">',
      '<div class="panel-head"><div><p class="eyebrow">Klantenbestand</p><h2>Klanten beheren</h2></div>' + headActions + "</div>",
      '<input class="search-input" type="search" placeholder="Zoeken op naam, bedrijf, e-mail, telefoon of postcode" value="' + S.escapeHtml(query || "") + '" data-action="customer-search">',
      customers.length ? '<div class="table-wrap" style="margin-top:14px;"><table class="data-table"><thead><tr><th>Klant</th><th>Contact</th><th>Adres</th><th>Aangemaakt</th><th>Acties</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty-state" style="margin-top:14px;">Geen klanten gevonden.</div>',
      "</section>"
    ].join("");
  }

  function renderImport() {
    return [
      '<section class="grid two section">',
      '<form class="panel" data-form="customer-import">',
      '<div class="panel-head"><div><p class="eyebrow">Website aanvraag</p><h2>E-mail importeren</h2></div><div class="button-row"><button class="ghost-button" type="button" data-action="customers">Annuleren</button><button class="primary-button" type="submit">Zet in klantenbestand</button></div></div>',
      '<label class="field full">Plak hier de volledige e-mail uit webmail<textarea name="raw" rows="16" required placeholder="Nieuwe aanvraag via Climature.nl&#10;&#10;Type formulier: offerte&#10;Naam: ...&#10;E-mailadres: ...&#10;Telefoon: ...&#10;Postcode: ...&#10;Scan samenvatting: ..."></textarea></label>',
      "</form>",
      '<div class="panel"><div class="panel-head"><div><p class="eyebrow">Werkwijze</p><h2>Wat wordt overgenomen?</h2></div></div><div class="detail-list">',
      detail("Naam", "Voornaam en achternaam"),
      detail("Contact", "E-mail en telefoon"),
      detail("Adres", "Postcode, adres/plaats blijven leeg als ze niet in de mail staan"),
      detail("Notitie", "Formuliertype, scan samenvatting, pagina en IP-adres"),
      "</div><div class=\"notice\" style=\"margin-top:14px;\">Bestaat het e-mailadres al? Dan vult de app ontbrekende klantgegevens aan en zet de aanvraag als contactnotitie op de klanttijdlijn.</div></div>",
      "</section>"
    ].join("");
  }

  function formHtml(customer) {
    var c = Object.assign(emptyCustomer(), customer || {});
    return [
      '<form class="panel" data-form="customer" data-id="' + S.escapeHtml(c.id || "") + '">',
      '<div class="panel-head"><div><p class="eyebrow">Klant</p><h2>' + (c.id ? "Klant bewerken" : "Nieuwe klant") + '</h2></div><div class="button-row"><button class="ghost-button" type="button" data-action="customers">Annuleren</button><button class="primary-button" type="submit">Opslaan</button></div></div>',
      '<div class="field-grid">',
      field("Voornaam", "firstName", c.firstName, "text", true),
      field("Achternaam", "lastName", c.lastName, "text", true),
      field("Bedrijfsnaam", "companyName", c.companyName),
      field("E-mailadres", "email", c.email, "email", true),
      field("Telefoonnummer", "phone", c.phone, "tel", true),
      field("Adres", "address", c.address, "text", true),
      field("Postcode", "postalCode", c.postalCode, "text", true),
      field("Plaats", "city", c.city, "text", true),
      '<label class="field full">Opmerkingen<textarea name="notes" rows="5">' + S.escapeHtml(c.notes || "") + "</textarea></label>",
      "</div>",
      "</form>"
    ].join("");
  }

  function field(label, name, value, type, required) {
    return '<label class="field">' + label + '<input name="' + name + '" type="' + (type || "text") + '" value="' + S.escapeHtml(value || "") + '"' + (required ? " required" : "") + "></label>";
  }

  function renderDetail(id) {
    var customer = S.getAll("customers").find(function (item) { return item.id === id; });
    if (!customer) return renderList("");
    var quotes = S.getAll("quotes").filter(function (quote) { return quote.customerId === id; });
    var invoices = S.getAll("invoices").filter(function (invoice) { return invoice.customerId === id; });
    var installations = S.getAll("installations").filter(function (installation) { return installation.customerId === id; });
    var advices = S.getAll("advices").filter(function (advice) { return advice.customerId === id; });
    var documents = S.getAll("customerDocuments").filter(function (document) { return document.customerId === id; });
    var adminActions = S.canManage("crm")
      ? '<div class="button-row"><button class="small-button" data-action="customer-edit" data-id="' + id + '">Bewerk</button>' + (S.isAdmin() ? '<button class="danger-button" data-action="customer-delete" data-id="' + id + '">Verwijder</button>' : "") + '</div>'
      : "";
    var quickActions = S.isAdmin()
      ? '<div class="button-row" style="margin-top:16px;"><button class="primary-button" data-action="customer-projects" data-id="' + id + '">Projectcockpit</button><a class="primary-button" href="#service?customerId=' + id + '">Servicehistorie</a><button class="primary-button" data-action="quote-new" data-customer-id="' + id + '">Nieuwe offerte</button><button class="ghost-button" data-action="customer-advice" data-id="' + id + '">Nieuw advies</button><button class="ghost-button" data-action="invoice-new" data-customer-id="' + id + '">Nieuwe factuur</button><button class="ghost-button" data-action="installation-new" data-customer-id="' + id + '">Installatie plannen</button><button class="ghost-button" data-action="customer-workorder-print" data-id="' + id + '">Print werkbon</button></div>'
      : S.isInstaller() ? '<div class="button-row" style="margin-top:16px;"><button class="primary-button" data-action="customer-projects" data-id="' + id + '">Projectcockpit</button><button class="ghost-button" data-action="customer-workorder-print" data-id="' + id + '">Print werkbon</button></div>' : S.canManage("crm") ? '<div class="button-row" style="margin-top:16px;"><a class="primary-button" href="#service?customerId=' + id + '">Servicehistorie</a></div>' : "";
    var dossier = S.isAdmin()
      ? documentUploadForm(customer) + '<h3>PDF-documenten</h3>' + linkedDocuments(documents) + '<h3>Adviezen</h3>' + linkedAdvices(advices) + '<h3>Offertes</h3>' + linkedQuotes(quotes) + '<h3>Facturen</h3>' + linkedInvoices(invoices) + '<h3>Installaties</h3>' + linkedInstallations(installations)
      : S.canManage("crm") ? documentUploadForm(customer) + '<h3>PDF-documenten</h3>' + linkedDocuments(documents) : '<h3>PDF-documenten</h3>' + linkedDocuments(documents) + '<h3>Installaties</h3>' + linkedInstallations(installations);
    return [
      '<section class="section grid two">',
      '<div class="panel">',
      '<div class="panel-head"><div><p class="eyebrow">Klantdetail</p><h2>' + S.escapeHtml(S.customerName(customer)) + '</h2></div>' + adminActions + "</div>",
      '<div class="detail-list">',
      detail("Naam", [customer.firstName, customer.lastName].filter(Boolean).join(" ")),
      detail("Bedrijf", customer.companyName),
      detail("E-mail", customer.email),
      detail("Telefoon", customer.phone),
      detail("Adres", [customer.address, customer.postalCode, customer.city].filter(Boolean).join(", ")),
      detail("Opmerkingen", customer.notes),
      "</div>",
      quickActions,
      "</div>",
      '<div class="panel"><div class="panel-head"><div><p class="eyebrow">Dossier</p><h2>Documenten en planning</h2></div></div>',
      dossier,
      "</div>",
      "</section>",
      S.canManage("crm") ? '<section class="section grid two">' + noteForm(customer) + timeline(customer, quotes, invoices, installations, documents) + "</section>" : ""
    ].join("");
  }

  function detail(label, value) {
    return "<div><span>" + S.escapeHtml(label) + "</span><strong>" + S.escapeHtml(value || "-") + "</strong></div>";
  }

  function linkedAdvices(advices) {
    if (!advices.length) return '<div class="empty-state">Nog geen adviezen.</div>';
    return '<div class="table-wrap"><table class="data-table"><tbody>' + advices.map(function (advice) {
      var kw = advice.powerKw ? S.escapeHtml(String(advice.powerKw).replace(".", ",")) + " kW" : "";
      var meta = [kw, advice.yearlySaving ? S.money(advice.yearlySaving) + "/jr" : "", advice.paybackYears ? "TVT " + S.escapeHtml(String(advice.paybackYears).replace(".", ",")) + " jr" : ""].filter(Boolean).join(" · ");
      var quoteBtn = advice.sourceQuoteId
        ? '<button class="small-button" data-action="quote-detail" data-id="' + S.escapeHtml(advice.sourceQuoteId) + '">Offerte</button>'
        : '<button class="small-button" data-action="advice-quote" data-id="' + S.escapeHtml(advice.id) + '">Maak offerte</button>';
      return '<tr><td><strong>' + S.escapeHtml(advice.title || advice.kind || "Advies") + '</strong><br><span class="muted">' + S.formatDate((advice.createdAt || "").slice(0, 10)) + (meta ? " · " + meta : "") + '</span></td><td><div class="button-row">' + quoteBtn + '<button class="small-button" data-action="advice-delete" data-id="' + S.escapeHtml(advice.id) + '">Verwijder</button></div></td></tr>';
    }).join("") + "</tbody></table></div>";
  }

  function documentUploadForm(customer) {
    return [
      '<form class="document-upload" data-form="customer-document" data-customer-id="' + S.escapeHtml(customer.id) + '">',
      '<label class="field">PDF toevoegen<input name="file" type="file" accept="application/pdf,.pdf" required></label>',
      '<button class="primary-button" type="submit">PDF toevoegen</button>',
      "</form>"
    ].join("");
  }

  function linkedDocuments(documents) {
    if (!documents.length) return '<div class="empty-state">Nog geen PDF-documenten toegevoegd.</div>';
    return '<div class="table-wrap"><table class="data-table"><tbody>' + documents.map(function (document) {
      var deleteButton = S.canManage("crm") ? '<button class="small-button" data-action="customer-document-delete" data-id="' + S.escapeHtml(document.id) + '">Verwijder</button>' : "";
      return [
        "<tr>",
        "<td><strong>" + S.escapeHtml(document.fileName || "PDF-document") + '</strong><br><span class="muted">' + S.formatDate(String(document.createdAt || "").slice(0, 10)) + " - " + S.escapeHtml(formatBytes(document.size || 0)) + "</span></td>",
        '<td><div class="button-row"><button class="small-button" data-action="customer-document-open" data-id="' + S.escapeHtml(document.id) + '">Open</button><button class="small-button" data-action="customer-document-download" data-id="' + S.escapeHtml(document.id) + '">Download</button>' + deleteButton + "</div></td>",
        "</tr>"
      ].join("");
    }).join("") + "</tbody></table></div>";
  }

  function formatBytes(bytes) {
    bytes = Number(bytes || 0);
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
    if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
    return bytes + " B";
  }

  function linkedQuotes(quotes) {
    if (!quotes.length) return '<div class="empty-state">Nog geen offertes.</div>';
    return '<div class="table-wrap"><table class="data-table"><tbody>' + quotes.map(function (quote) {
      return '<tr><td><strong>' + S.escapeHtml(quote.quoteNumber) + '</strong><br><span class="muted">' + S.formatDate(quote.quoteDate) + '</span></td><td><span class="status-pill">' + S.escapeHtml(quote.status) + '</span></td><td>' + S.money(quote.total || 0) + '</td><td><button class="small-button" data-action="quote-detail" data-id="' + quote.id + '">Open</button></td></tr>';
    }).join("") + "</tbody></table></div>";
  }

  function linkedInvoices(invoices) {
    if (!invoices.length) return '<div class="empty-state">Nog geen facturen.</div>';
    return '<div class="table-wrap"><table class="data-table"><tbody>' + invoices.map(function (invoice) {
      return '<tr><td><strong>' + S.escapeHtml(invoice.invoiceNumber) + '</strong><br><span class="muted">' + S.formatDate(invoice.invoiceDate) + '</span></td><td><span class="status-pill">' + S.escapeHtml(invoice.status) + '</span></td><td>' + S.money(invoice.total || 0) + '</td><td><button class="small-button" data-action="invoice-detail" data-id="' + invoice.id + '">Open</button></td></tr>';
    }).join("") + "</tbody></table></div>";
  }

  function linkedInstallations(installations) {
    if (!installations.length) return '<div class="empty-state">Nog geen installaties gepland.</div>';
    return '<div class="table-wrap"><table class="data-table"><tbody>' + installations.map(function (installation) {
      return '<tr><td><strong>' + S.escapeHtml(S.formatDate(installation.plannedDate)) + '</strong><br><span class="muted">' + S.escapeHtml(installation.startTime || "-") + '</span></td><td><span class="status-pill">' + S.escapeHtml(installation.status || "ingepland") + '</span></td><td>' + S.escapeHtml(installation.installer || "Geen monteur") + (installation.quoteNumber ? '<br><span class="muted">' + S.escapeHtml(installation.quoteNumber) + "</span>" : "") + '</td><td><div class="button-row"><button class="small-button" data-action="installation-detail" data-id="' + S.escapeHtml(installation.id) + '">Open</button><button class="small-button" data-action="installation-workorder-print" data-id="' + S.escapeHtml(installation.id) + '">Werkbon</button></div></td></tr>';
    }).join("") + "</tbody></table></div>";
  }

  function noteForm(customer) {
    return [
      '<form class="panel" data-form="customer-note" data-customer-id="' + S.escapeHtml(customer.id) + '">',
      '<div class="panel-head"><div><p class="eyebrow">Contact</p><h2>Notitie toevoegen</h2></div><button class="primary-button" type="submit">Opslaan</button></div>',
      '<div class="field-grid">',
      '<label class="field">Datum<input name="date" type="date" required value="' + S.today() + '"></label>',
      '<label class="field">Type<select name="type">' + noteTypeOptions() + '</select></label>',
      '<label class="field full">Opmerking<textarea name="body" rows="5" required placeholder="Wat is er besproken of afgesproken?"></textarea></label>',
      "</div>",
      "</form>"
    ].join("");
  }

  function noteTypeOptions() {
    return ["Belletje", "WhatsApp", "E-mail", "Afspraak", "Notitie"].map(function (type) {
      return '<option value="' + S.escapeHtml(type) + '">' + S.escapeHtml(type) + "</option>";
    }).join("");
  }

  function timeline(customer, quotes, invoices, installations, documents) {
    var items = timelineItems(customer, quotes, invoices, installations, documents);
    return [
      '<div class="panel">',
      '<div class="panel-head"><div><p class="eyebrow">Tijdlijn</p><h2>Klantgeschiedenis</h2></div></div>',
      items.length ? '<div class="timeline-list">' + items.map(timelineItem).join("") + "</div>" : '<div class="empty-state">Nog geen contactmomenten of documenten.</div>',
      "</div>"
    ].join("");
  }

  function timelineItems(customer, quotes, invoices, installations, documents) {
    var items = [];
    if (customer.createdAt) {
      items.push({
        kind: "customer",
        label: "Klant",
        title: "Klant aangemaakt",
        date: String(customer.createdAt).slice(0, 10),
        stamp: customer.createdAt,
        body: S.customerName(customer),
        tone: "ok"
      });
    }
    quotes.forEach(function (quote) {
      items.push({
        kind: "quote",
        label: "Offerte",
        title: quote.quoteNumber || "Offerte",
        date: quote.quoteDate || String(quote.createdAt || "").slice(0, 10),
        stamp: quote.updatedAt || quote.createdAt || quote.quoteDate || "",
        body: (quote.status || "concept") + " - " + S.money(quote.total || 0),
        action: "quote-detail",
        id: quote.id,
        tone: quote.status === "geaccepteerd" || quote.status === "geaccepteerd/aanbetaling" ? "ok" : quote.status === "afgewezen" ? "danger" : "warn"
      });
    });
    invoices.forEach(function (invoice) {
      items.push({
        kind: "invoice",
        label: "Factuur",
        title: invoice.invoiceNumber || "Factuur",
        date: invoice.invoiceDate || String(invoice.createdAt || "").slice(0, 10),
        stamp: invoice.updatedAt || invoice.createdAt || invoice.invoiceDate || "",
        body: (invoice.status || "concept") + " - " + S.money(invoice.total || 0),
        action: "invoice-detail",
        id: invoice.id,
        tone: invoice.status === "betaald" ? "ok" : invoice.status === "verlopen" ? "danger" : "warn"
      });
    });
    installations.forEach(function (installation) {
      items.push({
        kind: "installation",
        label: "Installatie",
        title: installation.quoteNumber ? "Installatie " + installation.quoteNumber : "Installatie",
        date: installation.plannedDate || String(installation.createdAt || "").slice(0, 10),
        stamp: installation.updatedAt || installation.createdAt || installation.plannedDate || "",
        body: [
          installation.status || "ingepland",
          installation.startTime ? "Start: " + installation.startTime : "",
          installation.durationHours ? "Duur: " + installation.durationHours + " uur" : "",
          installation.installer ? "Monteur: " + installation.installer : "",
          installation.notes || ""
        ].filter(Boolean).join("\n"),
        action: "installation-detail",
        id: installation.id,
        tone: installation.status === "uitgevoerd" ? "ok" : installation.status === "geannuleerd" ? "danger" : "warn"
      });
    });
    (documents || []).forEach(function (document) {
      items.push({
        kind: "document",
        label: "PDF",
        title: document.fileName || "PDF-document",
        date: String(document.createdAt || "").slice(0, 10),
        stamp: document.updatedAt || document.createdAt || "",
        body: formatBytes(document.size || 0),
        action: "customer-document-open",
        id: document.id,
        tone: "ok"
      });
    });
    S.getAll("customerNotes").filter(function (note) {
      return note.customerId === customer.id;
    }).forEach(function (note) {
      items.push({
        kind: "note",
        label: note.type || "Notitie",
        title: note.type || "Notitie",
        date: note.date || String(note.createdAt || "").slice(0, 10),
        stamp: note.updatedAt || note.createdAt || note.date || "",
        body: note.body || "",
        id: note.id
      });
    });
    return items.sort(function (a, b) {
      var dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
      if (dateCompare) return dateCompare;
      return String(b.stamp || "").localeCompare(String(a.stamp || ""));
    });
  }

  function timelineItem(item) {
    return [
      '<article class="timeline-item ' + S.escapeHtml(item.kind) + '">',
      '<div class="timeline-marker"></div>',
      '<div class="timeline-content">',
      '<div class="timeline-top"><span class="status-pill ' + S.escapeHtml(item.tone || "") + '">' + S.escapeHtml(item.label) + '</span><time>' + S.formatDate(item.date) + "</time></div>",
      '<strong>' + S.escapeHtml(item.title) + "</strong>",
      item.body ? '<p>' + S.escapeHtml(item.body).replace(/\n/g, "<br>") + "</p>" : "",
      '<div class="timeline-actions">' + timelineAction(item) + "</div>",
      "</div>",
      "</article>"
    ].join("");
  }

  function timelineAction(item) {
    if (item.action) return '<button class="small-button" data-action="' + S.escapeHtml(item.action) + '" data-id="' + S.escapeHtml(item.id) + '">Open</button>';
    if (item.kind === "note") return '<button class="small-button" data-action="customer-note-delete" data-id="' + S.escapeHtml(item.id) + '">Verwijder</button>';
    return "";
  }

  function saveFromForm(form) {
    var data = Object.fromEntries(new FormData(form).entries());
    if (!data.firstName || !data.lastName || !data.email || !data.phone || !data.address || !data.postalCode || !data.city) {
      C.app.toast("Vul alle verplichte klantvelden in.");
      return;
    }
    if (form.dataset.id) data.id = form.dataset.id;
    return S.upsert("customers", data).then(function (saved) {
      C.app.toast("Klant opgeslagen.");
      C.app.navigate("customer:" + saved.id);
      return saved;
    });
  }

  function fieldValue(raw, label) {
    var escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var match = String(raw || "").match(new RegExp("^\\s*" + escaped + "\\s*:\\s*(.+)$", "im"));
    return match ? match[1].trim() : "";
  }

  function splitName(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { firstName: "", lastName: "" };
    if (parts.length === 1) return { firstName: parts[0], lastName: "" };
    return { firstName: parts.slice(0, -1).join(" "), lastName: parts.slice(-1).join("") };
  }

  function parseImport(raw) {
    var name = fieldValue(raw, "Naam");
    var split = splitName(name);
    return {
      formType: fieldValue(raw, "Type formulier"),
      firstName: split.firstName,
      lastName: split.lastName,
      email: fieldValue(raw, "E-mailadres"),
      phone: fieldValue(raw, "Telefoon"),
      postalCode: fieldValue(raw, "Postcode"),
      scanSummary: fieldValue(raw, "Scan samenvatting"),
      page: fieldValue(raw, "Pagina"),
      ipAddress: fieldValue(raw, "IP-adres"),
      raw: String(raw || "").trim()
    };
  }

  function importNote(data) {
    return [
      "Nieuwe aanvraag via Climature.nl",
      data.formType ? "Type formulier: " + data.formType : "",
      data.scanSummary ? "Scan samenvatting: " + data.scanSummary : "",
      data.page ? "Pagina: " + data.page : "",
      data.ipAddress ? "IP-adres: " + data.ipAddress : ""
    ].filter(Boolean).join("\n");
  }

  function saveImportFromForm(form) {
    var raw = new FormData(form).get("raw") || "";
    var data = parseImport(raw);
    if (!data.email || !data.firstName) {
      C.app.toast("Kon naam of e-mailadres niet vinden in de aanvraag.");
      return;
    }
    var existing = S.getAll("customers").find(function (customer) {
      return String(customer.email || "").toLowerCase() === data.email.toLowerCase();
    });
    var customer = Object.assign({}, existing || {}, {
      firstName: existing && existing.firstName || data.firstName,
      lastName: existing && existing.lastName || data.lastName,
      email: data.email,
      phone: existing && existing.phone || data.phone,
      postalCode: existing && existing.postalCode || data.postalCode,
      address: existing && existing.address || "",
      city: existing && existing.city || "",
      notes: [existing && existing.notes, data.scanSummary ? "Laatste aanvraag: " + data.scanSummary : ""].filter(Boolean).join("\n\n")
    });
    return S.upsert("customers", customer).then(function (saved) {
      return S.upsert("customerNotes", {
        customerId: saved.id,
        date: S.today(),
        type: "E-mail",
        body: importNote(data)
      }).then(function () {
        C.app.toast(existing ? "Aanvraag toegevoegd aan bestaande klant." : "Klant aangemaakt vanuit aanvraag.");
        C.app.navigate("customer:" + saved.id);
        return saved;
      });
    });
  }

  function removeCustomer(id) {
    var hasQuotes = S.getAll("quotes").some(function (quote) { return quote.customerId === id; });
    var hasInvoices = S.getAll("invoices").some(function (invoice) { return invoice.customerId === id; });
    var hasInstallations = S.getAll("installations").some(function (installation) { return installation.customerId === id; });
    if (hasQuotes || hasInvoices || hasInstallations) {
      C.app.toast("Deze klant heeft gekoppelde documenten of installaties en kan niet veilig worden verwijderd.");
      return;
    }
    var message = "Klant verwijderen?";
    if (!window.confirm(message)) return;
    return S.remove("customers", id).then(function () {
      C.app.toast("Klant verwijderd.");
      C.app.navigate("customers");
    });
  }

  function saveNoteFromForm(form) {
    var data = Object.fromEntries(new FormData(form).entries());
    var customerId = form.dataset.customerId;
    if (!customerId || !data.date || !data.body.trim()) {
      C.app.toast("Vul een datum en notitie in.");
      return;
    }
    return S.upsert("customerNotes", {
      customerId: customerId,
      date: data.date,
      type: data.type || "Notitie",
      body: data.body.trim()
    }).then(function () {
      C.app.toast("Contactnotitie opgeslagen.");
      C.app.render();
    });
  }

  function saveDocumentFromForm(form) {
    var fileInput = form.querySelector('input[type="file"]');
    var file = fileInput && fileInput.files && fileInput.files[0];
    var customerId = form.dataset.customerId;
    if (!customerId || !file) {
      C.app.toast("Kies eerst een PDF-bestand.");
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      C.app.toast("Alleen PDF-bestanden kunnen worden toegevoegd.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      C.app.toast("PDF is groter dan 8 MB.");
      return;
    }
    return readFileAsBase64(file).then(function (content) {
      return S.upsert("customerDocuments", {
        customerId: customerId,
        fileName: file.name,
        mimeType: "application/pdf",
        size: file.size,
        content: content
      });
    }).then(function () {
      form.reset();
      C.app.toast("PDF toegevoegd aan klantdossier.");
      C.app.render();
    });
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || "").split(",")[1] || "");
      };
      reader.onerror = function () {
        reject(new Error("PDF kon niet worden gelezen."));
      };
      reader.readAsDataURL(file);
    });
  }

  function documentBlob(document) {
    var binary = window.atob(document.content || "");
    var chunks = [];
    for (var i = 0; i < binary.length; i += 8192) {
      var slice = binary.slice(i, i + 8192);
      var bytes = new Uint8Array(slice.length);
      for (var j = 0; j < slice.length; j++) bytes[j] = slice.charCodeAt(j);
      chunks.push(bytes);
    }
    return new Blob(chunks, { type: "application/pdf" });
  }

  function openDocument(id, download) {
    var document = S.getAll("customerDocuments").find(function (item) { return item.id === id; });
    if (!document) {
      C.app.toast("PDF niet gevonden.");
      return;
    }
    var url = URL.createObjectURL(documentBlob(document));
    if (download) {
      var link = window.document.createElement("a");
      link.href = url;
      link.download = document.fileName || "klantdocument.pdf";
      window.document.body.appendChild(link);
      link.click();
      link.remove();
    } else {
      window.open(url, "_blank", "noopener");
    }
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function removeDocument(id) {
    if (!window.confirm("PDF uit klantdossier verwijderen?")) return;
    return S.remove("customerDocuments", id).then(function () {
      C.app.toast("PDF verwijderd.");
      C.app.render();
    });
  }

  function removeNote(id) {
    if (!window.confirm("Contactnotitie verwijderen?")) return;
    return S.remove("customerNotes", id).then(function () {
      C.app.toast("Contactnotitie verwijderd.");
      C.app.render();
    });
  }

  function removeAdvice(id) {
    if (!window.confirm("Advies verwijderen?")) return;
    return S.remove("advices", id).then(function () {
      C.app.toast("Advies verwijderd.");
      C.app.render();
    });
  }

  C.customers = {
    renderList: renderList,
    renderForm: formHtml,
    renderImport: renderImport,
    renderDetail: renderDetail,
    saveFromForm: saveFromForm,
    saveImportFromForm: saveImportFromForm,
    remove: removeCustomer,
    saveNoteFromForm: saveNoteFromForm,
    saveDocumentFromForm: saveDocumentFromForm,
    openDocument: openDocument,
    removeDocument: removeDocument,
    removeNote: removeNote,
    removeAdvice: removeAdvice
  };
}());
