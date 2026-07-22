(function () {
  "use strict";

  var C = window.Climature = window.Climature || {};
  var E = window.ClimatureAdviceV2Engine;
  var Catalog = window.ClimatureProductCatalog;
  var S;
  var state = { step: 1, module: "combinatie", result: null, draftInput: null, pendingAction: "", customerId: "", savedAdviceId: "" };

  function esc(value) { return S.escapeHtml(value == null ? "" : String(value)); }
  function money(value) { return S.money(Number(value || 0)); }
  function decimal(value) { return Number(value || 0).toLocaleString("nl-NL", { maximumFractionDigits: 1 }); }
  function energyMoney(value) { return '€ ' + Number(value || 0).toLocaleString('nl-NL', { minimumFractionDigits: 4, maximumFractionDigits: 4 }); }
  function adviceAssumptions() { return Catalog.buildAssumptions(S.settings().adviceAssumptions || {}, S.getAll('products')); }
  function option(value, label, selected) { return '<option value="' + esc(value) + '"' + (value === selected ? " selected" : "") + '>' + esc(label) + '</option>'; }
  function selectField(label, name, options, selected, hint, attrs) {
    return '<label class="field">' + esc(label) + '<select name="' + esc(name) + '"' + (attrs || '') + '>' + options.map(function (item) { return option(item[0], item[1], selected); }).join("") + '</select>' + (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') + '</label>';
  }
  function numberField(label, name, value, min, max, step, hint) {
    return '<label class="field">' + esc(label) + '<input type="number" name="' + esc(name) + '" value="' + esc(value) + '" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" required>' + (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') + '</label>';
  }
  function textField(label, name, value, placeholder) { return '<label class="field">' + esc(label) + '<input name="' + esc(name) + '" value="' + esc(value) + '" placeholder="' + esc(placeholder || '') + '"></label>'; }
  function qualityField(name, selected) { return selectField('Kwaliteit invoer', name, [['bekend','Bekend / gecontroleerd'],['geschat','Geschat'],['onbekend','Onbekend']], selected || 'onbekend', 'Bepaalt de bandbreedte en zekerheid van het advies.'); }
  function scope(kind, html) { return '<div data-module-scope="' + kind + '"' + (kind.split(' ').indexOf(state.module) < 0 ? ' hidden' : '') + '>' + html + '</div>'; }

  function customerOptions(customerId) {
    return '<option value="">Kies een klant</option>' + S.getAll("customers").map(function (customer) { return option(customer.id, S.customerName(customer), customerId); }).join("");
  }

  function modulePicker() {
    var modules = [
      ['warmtepomp', 'Warmtepomp', 'Woning, warmteverlies en afgiftesysteem'],
      ['batterij', 'Thuisbatterij', 'Opwek, verbruik en verdienmodellen'],
      ['combinatie', 'Combinatieadvies', 'Beide technieken in één samenhangend advies']
    ];
    return '<section class="advice-v2-modules" aria-label="Kies adviesmodule"><div><p class="eyebrow">Kies de scan</p><h3>Waarover wilt u adviseren?</h3></div><div class="advice-v2-module-grid">' + modules.map(function (item) {
      return '<button type="button" data-action="advice-v2-module" data-module="' + item[0] + '" class="advice-v2-module' + (state.module === item[0] ? ' is-active' : '') + '"><strong>' + item[1] + '</strong><span>' + item[2] + '</span></button>';
    }).join('') + '</div><small data-advice-v2-draft-status>Concept wordt automatisch op dit apparaat bewaard.</small></section>';
  }

  function stepHeader() {
    var labels = ["Woning", "Installatie", "Verdieping", "Advies"];
    return '<div class="advice-v2-progress" aria-label="Voortgang">' + labels.map(function (label, index) {
      var step = index + 1;
      return '<button type="button" data-action="advice-v2-go" data-step="' + step + '" class="' + (step === state.step ? 'is-active' : step < state.step ? 'is-done' : '') + '"><span>' + step + '</span>' + label + '</button>';
    }).join('') + '</div>';
  }

  function stepOne(seed) {
    var insulation = seed.insulation || [];
    function check(value, label) { return '<label><input type="checkbox" name="insulation" value="' + value + '"' + (insulation.indexOf(value) >= 0 ? ' checked' : '') + '><span>' + label + '</span></label>'; }
    return '<section class="advice-v2-step' + (state.step === 1 ? '' : ' hidden') + '" data-advice-v2-step="1"><div class="panel-head"><div><p class="eyebrow">Stap 1</p><h3>Woningprofiel</h3><p>Alleen gegevens die de uitkomst aantoonbaar beïnvloeden.</p></div></div><div class="field-grid">' +
      textField('Straat en huisnummer', 'address', seed.address, 'Dorpsstraat 12') + textField('Plaats', 'city', seed.city, 'Utrecht') +
      selectField('Type woning', 'homeType', [['tussenwoning','Tussenwoning'],['hoekwoning','Hoekwoning'],['2onder1kap','2-onder-1-kap'],['vrijstaand','Vrijstaand'],['appartement','Appartement']], seed.homeType || 'tussenwoning') +
      numberField('Bouwjaar', 'buildYear', seed.buildYear || 1985, 1900, new Date().getFullYear(), 1) + numberField('Verwarmd oppervlak (m²)', 'area', seed.area || 130, 20, 1000, 1) + numberField('Personen', 'people', seed.people || 4, 1, 12, 1) +
      selectField('Energielabel', 'energyLabel', [['onbekend','Onbekend'],['A','A of beter'],['B','B'],['C','C'],['D','D'],['EFG','E, F of G']], seed.energyLabel || 'onbekend') + qualityField('energyLabelQuality', seed.energyLabelQuality) +
      '</div>' + scope('warmtepomp combinatie', '<div class="field"><span>Aanwezige isolatie</span><div class="advice-v2-checks">' + check('dak','Dakisolatie') + check('gevel','Gevel-/spouwisolatie') + check('vloer','Vloerisolatie') + check('glas','HR++ of triple glas') + '</div></div><div class="field-grid">' + qualityField('insulationQuality', seed.insulationQuality) + '</div>') + buttons(1) + '</section>';
  }

  function stepTwo(seed) {
    return '<section class="advice-v2-step' + (state.step === 2 ? '' : ' hidden') + '" data-advice-v2-step="2"><div class="panel-head"><div><p class="eyebrow">Stap 2</p><h3>Verbruik en bestaande installatie</h3></div></div><div class="field-grid">' +
      scope('warmtepomp combinatie', numberField('Gasverbruik (m³/jaar)', 'gasYear', seed.gasYear == null ? 1600 : seed.gasYear, 0, 10000, 1, 'Gebruik bij voorkeur de laatste jaarafrekening.') + qualityField('gasQuality', seed.gasQuality) + selectField('Koken op gas', 'cookingGas', [['nee','Nee'],['ja','Ja']], seed.cookingGas || 'nee') + selectField('Warm tapwater', 'hotWater', [['cv','Via cv-ketel'],['boiler','Elektrische boiler'],['zonneboiler','Zonneboiler']], seed.hotWater || 'cv') + selectField('Tapwaterbehoefte', 'tapWaterDemand', [['laag','Laag'],['gemiddeld','Gemiddeld'],['hoog','Hoog']], seed.tapWaterDemand || 'gemiddeld') + selectField('Afgiftesysteem', 'emitters', [['vloer','Volledige vloerverwarming'],['vloer_beneden','Vloerverwarming beneden'],['lt_radiatoren','LT-radiatoren'],['radiatoren','Standaard radiatoren'],['convectoren','Convectoren / oud systeem']], seed.emitters || 'radiatoren') + selectField('50°C-test', 'flowTempTest', [['onbekend','Niet uitgevoerd'],['geslaagd','Geslaagd'],['mislukt','Niet geslaagd']], seed.flowTempTest || 'onbekend') + numberField('Leeftijd cv-ketel (jaar)', 'cvAge', seed.cvAge || 8, 0, 40, 1)) +
      scope('batterij combinatie', numberField('Stroomverbruik (kWh/jaar)', 'electricityYear', seed.electricityYear || 3500, 500, 50000, 1) + qualityField('electricityQuality', seed.electricityQuality) + numberField('Aantal zonnepanelen', 'pvCount', seed.pvCount || 0, 0, 100, 1) + '<div data-advice-v2-conditional="pv"' + (!seed.pvCount ? ' hidden' : '') + '>' + numberField('Vermogen per paneel (Wp)', 'pvWp', seed.pvWp || 430, 200, 700, 10) + numberField('Omvormervermogen (kW, 0 = onbekend)', 'inverterKw', seed.inverterKw || 0, 0, 100, 0.1) + '</div>') +
      '</div>' + energyPricePicker(seed) + buttons(2) + '</section>';
  }

  function energyPricePicker(seed) {
    var assumptions = S.settings().adviceAssumptions || {}; var energy = assumptions.energy || {};
    var history = Array.isArray(energy.priceHistory) && energy.priceHistory.length ? energy.priceHistory.slice(0, 12) : [{ periodKey: 'fallback', periodLabel: 'Handmatig tarief', gasPrice: energy.gasPrice || 1.45, electricityPrice: energy.electricityPrice || 0.30, dynamicElectricityPrice: energy.dynamicElectricityPrice || energy.electricityPrice || 0.30, vatIncluded: true }];
    var selected = seed.energyPricePeriod && history.some(function (item) { return item.periodKey === seed.energyPricePeriod; }) ? seed.energyPricePeriod : history[0].periodKey;
    return '<fieldset class="advice-v2-energy-prices"><legend>Marktgemiddelde kiezen</legend><p class="hint">CBS-verbruikstarieven inclusief btw en belastingen, zonder vaste leverings- en netbeheerkosten. Het contracttype in stap 3 bepaalt welke stroomkolom wordt gebruikt.</p><div class="advice-v2-table-scroll"><table><thead><tr><th scope="col">Kies</th><th scope="col">Maand</th><th scope="col">Gas / m³</th><th scope="col">Stroom / kWh</th><th scope="col">Dynamisch / kWh</th></tr></thead><tbody>' + history.map(function (item, index) {
      var active = item.periodKey === selected;
      return '<tr class="' + (active ? 'is-selected' : '') + '"><td><input type="radio" name="energyPricePeriod" value="' + esc(item.periodKey) + '"' + (active ? ' checked' : '') + ' aria-label="Gebruik tarieven van ' + esc(item.periodLabel) + '"></td><th scope="row">' + esc(item.periodLabel) + (index === 0 ? '<span>Nieuwste</span>' : '') + '</th><td>' + energyMoney(item.gasPrice) + '</td><td>' + energyMoney(item.electricityPrice) + '</td><td>' + energyMoney(item.dynamicElectricityPrice) + (item.dynamicPriceFallback ? '<small>regulier tarief</small>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div></fieldset>';
  }

  function stepThree(seed) {
    return '<section class="advice-v2-step' + (state.step === 3 ? '' : ' hidden') + '" data-advice-v2-step="3"><div class="panel-head"><div><p class="eyebrow">Stap 3</p><h3>Technische verdieping</h3><p>Vragen verschijnen alleen binnen de gekozen module.</p></div></div><div class="field-grid">' +
      selectField('Meterkast gecontroleerd', 'meterCheck', [['onbekend','Nog niet'],['bevestigd','Ja, bevestigd'],['aanpassen','Aanpassing nodig']], seed.meterCheck || 'onbekend') +
      scope('warmtepomp combinatie', selectField('Plaats voor buitenunit', 'outdoorUnit', [['ja','Ja, bevestigd'],['twijfel','Nog controleren'],['nee','Nee']], seed.outdoorUnit || 'twijfel') + selectField('Binnenruimte boiler/buffervat', 'indoorSpace', [['ja','Ja, bevestigd'],['twijfel','Nog controleren'],['nee','Nee']], seed.indoorSpace || 'twijfel')) +
      scope('batterij combinatie', selectField('Elektrische aansluiting', 'connection', [['1fase','1-fase'],['3fase','3-fase']], seed.connection || '1fase') + selectField('Energiecontract', 'contract', [['vast','Vast/variabel'],['dynamic','Dynamisch']], seed.contract || 'vast') + selectField('EMS-aansturing', 'ems', [['nee','Nee'],['ja','Ja']], seed.ems || 'nee') + selectField('Onbalansdeelname', 'imbalance', [['nee','Nee / onbekend'],['ja','Ja']], seed.imbalance || 'nee') + selectField('Primair batterijdoel', 'batteryGoal', [['combinatie','Combinatie'],['eigenverbruik','Meer eigenverbruik'],['dynamic','Dynamische handel'],['onbalans','Onbalans']], seed.batteryGoal || 'combinatie') + selectField('Elektrische auto', 'ev', [['nee','Nee'],['ja','Ja']], seed.ev || 'nee') + '<div data-advice-v2-conditional="ev"' + (seed.ev !== 'ja' ? ' hidden' : '') + '>' + numberField('Thuis geladen EV-verbruik (kWh/jaar)', 'evKwh', seed.evKwh || 3500, 250, 20000, 50) + '</div>' + selectField('Bestaande warmtepomp', 'heatPumpPresent', [['nee','Nee'],['ja','Ja']], seed.heatPumpPresent || 'nee') + '<div data-advice-v2-conditional="heatpump"' + (seed.heatPumpPresent !== 'ja' ? ' hidden' : '') + '>' + numberField('Warmtepompverbruik (kWh/jaar)', 'heatPumpKwh', seed.heatPumpKwh || 2500, 100, 20000, 50) + '</div>' + selectField('Overdag thuis', 'homePattern', [['weinig','Weinig'],['gemiddeld','Wisselend'],['veel','Veel']], seed.homePattern || 'gemiddeld') + selectField('Btw-teruggave meenemen', 'vatRefund', [['ja','Ja, indicatief'],['nee','Nee']], seed.vatRefund || 'ja')) +
      '</div>' + buttons(3) + '</section>';
  }

  function buttons(step) {
    return '<div class="button-row advice-v2-nav">' + (step > 1 ? '<button type="button" class="ghost-button" data-action="advice-v2-prev">← Terug</button>' : '<span></span>') + (step < 3 ? '<button type="button" class="primary-button" data-action="advice-v2-next">Volgende →</button>' : '<button type="button" class="primary-button" data-action="advice-v2-calculate">Bereken scherp advies →</button>') + '</div>';
  }

  function metric(label, value) { return '<div class="advice-v2-metric"><span>' + esc(label) + '</span><strong>' + esc(value || '—') + '</strong></div>'; }
  function rangeText(item, moneyRange) {
    if (!item || (!item.low && !item.high)) return '—';
    return moneyRange ? money(item.low) + ' – ' + money(item.high) : decimal(item.low) + '–' + decimal(item.high) + (item.unit ? ' ' + item.unit : '');
  }
  function statusLabel(status) { return { 'installatieklaar':'Installatieklaar', 'technisch-kansrijk':'Technisch kansrijk · opname vereist', 'eerst-aanpassen':'Eerst aanpassen', 'onvoldoende-gegevens':'Onvoldoende gegevens', 'niet-rendabel':'Geen rendabel advies' }[status] || status || 'Voorlopig'; }

  function technologyCard(kind, result) {
    if (!result) return '';
    var product = result.product; var eligible = Boolean(product);
    var size = kind === 'warmtepomp' ? rangeText(result.requiredKwRange) : rangeText(result.ranges && result.ranges.capacity);
    return '<article class="advice-v2-tech ' + (eligible ? 'is-ready' : 'is-blocked') + '"><div class="advice-v2-tech-head"><div><p class="eyebrow">' + (kind === 'warmtepomp' ? 'Warmtepomp' : 'Thuisbatterij') + '</p><h3>' + esc(result.label) + '</h3></div><strong class="advice-v2-status">' + esc(statusLabel(result.status)) + '</strong></div>' +
      (eligible ? '<label class="advice-v2-offer"><input type="checkbox" data-advice-v2-product="' + kind + '" checked> Opnemen in voorstel</label>' : '') +
      '<div class="advice-v2-metrics">' + metric(kind === 'warmtepomp' ? 'Vermogensadvies' : 'Capaciteitsadvies', size) + metric('Investering bruto', result.investment ? money(result.investment) : 'Nog niet beschikbaar') + metric('Investering netto', result.netInvestment ? money(result.netInvestment) : 'Nog niet beschikbaar') + metric('Jaarlijks voordeel', rangeText(result.ranges && result.ranges.yearlySaving, true)) + metric('Terugverdientijd', rangeText(result.ranges && result.ranges.payback)) + '</div>' +
      (product ? '<p class="advice-v2-product"><strong>' + esc(product.name) + '</strong>' + (kind === 'warmtepomp' && result.subsidy ? '<span>Indicatieve ISDE: ' + money(result.subsidy) + '</span>' : '') + '</p>' : '') + batteryChoices(kind, result) +
      ((result.blockers || []).length ? '<div class="notice warning"><strong>Eerst oplossen</strong><ul>' + result.blockers.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<details><summary>Waarom dit advies?</summary><ul>' + (result.reasons || []).map(function (reason) { return '<li>' + esc(reason) + '</li>'; }).join('') + '</ul></details></article>';
  }

  function batteryChoices(kind, result) {
    if (kind !== 'batterij' || !(result.availableProducts || []).length) return '';
    return '<section class="advice-v2-battery-picker"><div><strong>Kies een passende thuisbatterij</strong><span>De financiële uitkomst wordt direct opnieuw berekend.</span></div><div class="advice-v2-battery-options">' + result.availableProducts.map(function (item) {
      var selected = item.id === result.selectedProductId;
      return '<button type="button" data-action="advice-v2-battery" data-product-id="' + esc(item.id) + '" class="advice-v2-battery-option' + (selected ? ' is-selected' : '') + '" aria-pressed="' + (selected ? 'true' : 'false') + '"><span>' + (item.recommended ? 'Aanbevolen' : 'Passend') + '</span><strong>' + esc(item.name) + '</strong><small>' + decimal(item.kwh) + ' kWh · ' + money(item.priceExVat) + ' excl. · ' + money(item.priceIncl) + ' incl. btw</small></button>';
    }).join('') + '</div></section>';
  }

  function alternativeHtml(alternative) {
    if (!alternative) return '';
    var product = alternative.product;
    return '<section class="panel advice-v2-alternative"><div><p class="eyebrow">Passend alternatief</p><h3>' + esc(alternative.title || alternative.name) + '</h3><p>' + esc(alternative.difference || (alternative.kind === 'hybride' ? 'Behoudt gas voor piekbelasting en tapwater.' : 'Maakt volledig gasloos verwarmen mogelijk als alle controles positief zijn.')) + '</p></div>' + (product ? '<div><strong>' + esc(product.name) + '</strong><span>' + money(alternative.netInvestment || product.priceExVat || product.priceIncl) + ' indicatief</span></div>' : '') + '</section>';
  }

  function scenariosHtml(result) {
    if (!result || !result.scenarios) return '';
    var keys = ['conservative','expected','favorable'];
    return '<section class="panel"><div class="panel-head"><div><p class="eyebrow">Financiële bandbreedte</p><h2>Drie opbrengstscenario’s</h2></div></div><div class="advice-v2-scenarios">' + keys.map(function (key) { var item = result.scenarios[key]; return '<article class="' + (key === 'expected' ? 'is-primary' : '') + '"><span>' + esc(item.label) + '</span><strong>' + money(item.yearlySaving) + '/jaar</strong><small>' + (item.paybackYears ? decimal(item.paybackYears) + ' jaar terugverdientijd' : 'Geen terugverdientijd') + '</small></article>'; }).join('') + '</div></section>';
  }

  function actionsHtml(items) {
    return '<section class="panel"><div class="panel-head"><div><p class="eyebrow">Afhankelijk actieplan</p><h2>Van advies naar definitieve offerte</h2></div></div><div class="advice-v2-action-list">' + (items || []).map(function (item) {
      return '<article><span class="advice-v2-action-number">' + item.order + '</span><div><strong>' + esc(item.title) + '</strong><p>' + esc(item.reason) + '</p></div><div class="advice-v2-action-meta"><span>' + esc(item.owner) + '</span><small>' + esc(item.stage.replace(/-/g, ' ')) + ' · ' + esc(item.status) + '</small></div></article>';
    }).join('') + '</div></section>';
  }

  function assumptionsHtml(result) {
    var a = result.assumptions || {}; var sources = a.sources || {}; var labels = Object.keys(sources).map(function (key) { var source = sources[key] || {}; return [source.label, source.period].filter(Boolean).join(' · '); }).filter(Boolean);
    var tariff = result.energyTariff || {};
    return '<details class="panel advice-v2-assumptions"><summary>Berekening, bronnen en voorbehoud</summary><span>' + esc(tariff.periodLabel || 'Actueel tarief') + ' · gas ' + energyMoney(a.gasPrice) + '/m³ · stroom ' + energyMoney(a.electricityPrice) + '/kWh · teruglevering ' + money(a.feedInCost) + '/kWh · EPEX-marge ' + money(a.epexMargin) + '/kWh</span><small>' + esc(labels.join(' · ') || 'Centrale portaalinstellingen') + '</small><small>Rekenversie ' + esc(result.engineVersion) + ' · ' + esc(new Date(result.calculatedAt).toLocaleString('nl-NL')) + '. Definitieve dimensionering volgt na technische opname.</small></details>';
  }

  function resultHtml(result) {
    if (!result || !result.recommendation) return '<div class="empty-state">Rond eerst de scan af.</div>';
    if ((result.errors || []).length) return '<div class="notice warning"><strong>Controleer de invoer</strong><ul>' + result.errors.map(function (error) { return '<li>' + esc(error) + '</li>'; }).join('') + '</ul></div><div class="button-row"><button type="button" class="ghost-button" data-action="advice-v2-edit">Scan aanpassen</button></div>';
    var checks = result.requiredChecks || [];
    return '<div class="advice-v2-result"><div class="result-hero advice-v2-hero"><div><p class="eyebrow">Uw verbeteradvies is klaar</p><h2>Ons advies: ' + esc(result.recommendation.title) + '</h2><p>' + esc(result.recommendation.rationale) + '</p></div><div class="advice-v2-confidence"><span>Zekerheid</span><strong>' + esc(result.inputQuality.label) + '</strong><small>' + (result.inputQuality.missing.length ? 'Nog te bevestigen: ' + esc(result.inputQuality.missing.join(', ')) : 'Belangrijkste invoer gecontroleerd') + '</small></div></div>' +
      '<div class="advice-v2-summary-metrics">' + metric('Status', statusLabel(result.status)) + metric('Investering netto', rangeText(result.ranges.investment, true)) + metric('Jaarlijks voordeel', rangeText(result.ranges.yearlySaving, true)) + metric('Terugverdientijd', rangeText(result.ranges.payback)) + '</div>' +
      ((result.warnings || []).length ? '<div class="notice warning"><strong>Tariefmelding</strong><ul>' + result.warnings.map(function (warning) { return '<li>' + esc(warning) + '</li>'; }).join('') + '</ul></div>' : '') +
      (checks.length ? '<section class="advice-v2-check-panel"><strong>Vóór definitieve offerte controleren</strong><ol>' + checks.map(function (check) { return '<li>' + esc(check) + '</li>'; }).join('') + '</ol></section>' : '') +
      '<div class="grid two advice-v2-technologies">' + technologyCard('warmtepomp', result.warmtepomp) + technologyCard('batterij', result.batterij) + '</div>' + alternativeHtml(result.alternative) + scenariosHtml(result.batterij) + actionsHtml(result.actions) + assumptionsHtml(result) +
      '<div class="button-row advice-v2-actions"><button type="button" class="ghost-button" data-action="advice-v2-edit">Scan aanpassen</button><button type="button" class="ghost-button" data-action="advice-v2-pdf">PDF opslaan</button><button type="button" class="primary-button" data-action="advice-v2-save">Opslaan bij klant</button><button type="button" class="primary-button" data-action="advice-v2-quote">Maak conceptofferte</button></div></div>';
  }

  function customerDialog() { return '<dialog id="advice-v2-customer-dialog" class="advice-v2-dialog"><form method="dialog"><div class="panel-head"><div><p class="eyebrow">Klant koppelen</p><h2>Kies een klant</h2></div><button value="cancel" class="icon-button" aria-label="Sluiten">×</button></div><label class="field">Klant<select id="advice-v2-customer-select" required>' + customerOptions(state.customerId) + '</select></label><div class="button-row"><button value="cancel" class="ghost-button">Annuleren</button><button type="button" class="primary-button" data-action="advice-v2-customer-confirm">Doorgaan</button></div></form></dialog>'; }
  function seedFor(customerId) { var customer = S.getAll('customers').find(function (item) { return item.id === customerId; }); return { customerId: customerId || '', address: customer && customer.address || '', city: customer && [customer.postalCode, customer.city].filter(Boolean).join(' ') || '' }; }
  function draftKey() { return 'climature-advice-v3-draft:' + (state.customerId || 'nieuw'); }
  function loadDraft() { try { var parsed = JSON.parse(localStorage.getItem(draftKey()) || 'null'); return parsed && parsed.input || null; } catch (_error) { return null; } }
  function saveDraft() { if (!form()) return; try { var input = E.normalize(collect()); localStorage.setItem(draftKey(), JSON.stringify({ input: input, savedAt: new Date().toISOString() })); state.draftInput = input; var status = document.querySelector('[data-advice-v2-draft-status]'); if (status) status.textContent = 'Concept automatisch bewaard om ' + new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) + '.'; } catch (_error) {} }

  function render(customerId, dedicated) {
    S = C.storage;
    if (customerId !== undefined && customerId !== state.customerId) state = { step: 1, module: 'combinatie', result: null, draftInput: null, pendingAction: '', customerId: customerId || '', savedAdviceId: '' };
    if (!state.draftInput && !state.result) state.draftInput = loadDraft();
    var seed = state.draftInput || (state.result && state.result.input) || seedFor(state.customerId || customerId);
    state.module = seed.module || state.module;
    window.setTimeout(bindRoot, 0);
    return '<section class="section advice-v2-shell' + (dedicated ? ' is-dedicated' : '') + '" data-advice-v2-root data-current-step="' + state.step + '" data-module="' + esc(state.module) + '"><div class="advice-v2-intro"><div><p class="eyebrow">Versie 3 rekenkern</p><h2>Advies Tool 2.0</h2><p>Een helder hoofdadvies, realistische bandbreedtes en concrete controles vóór offerte.</p></div><span class="category-pill">Modulaire scan</span></div><form data-form="advice-v2" novalidate><input type="hidden" name="customerId" value="' + esc(state.customerId || customerId || '') + '"><input type="hidden" name="module" value="' + esc(state.module) + '"><input type="hidden" name="batteryProductId" value="' + esc(seed.batteryProductId || '') + '">' + modulePicker() + stepHeader() + '<div class="panel advice-v2-form">' + stepOne(seed) + stepTwo(seed) + stepThree(seed) + '<section class="advice-v2-step' + (state.step === 4 ? '' : ' hidden') + '" data-advice-v2-step="4">' + resultHtml(state.result) + '</section></div></form>' + customerDialog() + '</section>';
  }

  function bindRoot() {
    var root = document.querySelector('[data-advice-v2-root]');
    if (!root) return;
    root.dataset.adviceV2Bound = 'true';
    bindActions(root);
  }

  function bindActions(container) {
    Array.from(container.querySelectorAll('[data-action^="advice-v2-"]')).forEach(function (target) {
      if (target.dataset.adviceV2ActionBound === 'true') return;
      target.dataset.adviceV2ActionBound = 'true';
      target.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        Promise.resolve(handleAction(target)).catch(function (error) { if (C.app) C.app.toast(error.message || 'Actie in Advies 2.0 mislukt.'); });
      });
    });
  }

  function form() { return document.querySelector('[data-form="advice-v2"]'); }
  function collect() { var current = form(); var fd = new FormData(current); var data = Object.fromEntries(fd.entries()); data.insulation = fd.getAll('insulation'); return data; }
  function toggleModule() {
    var root = document.querySelector('[data-advice-v2-root]'); if (!root) return; root.dataset.module = state.module;
    Array.from(root.querySelectorAll('[data-module-scope]')).forEach(function (element) { element.hidden = element.dataset.moduleScope.split(' ').indexOf(state.module) < 0; });
    Array.from(root.querySelectorAll('.advice-v2-module')).forEach(function (button) { button.classList.toggle('is-active', button.dataset.module === state.module); });
    updateConditionals();
  }
  function showStep(step) {
    var root = document.querySelector('[data-advice-v2-root]'); if (!root) return; root.dataset.currentStep = String(step);
    Array.from(root.querySelectorAll('[data-advice-v2-step]')).forEach(function (section) { section.classList.toggle('hidden', Number(section.dataset.adviceV2Step) !== step); });
    Array.from(root.querySelectorAll('.advice-v2-progress button')).forEach(function (button) { var buttonStep = Number(button.dataset.step); button.classList.toggle('is-active', buttonStep === step); button.classList.toggle('is-done', buttonStep < step); });
    root.scrollIntoView({ behavior: 'auto', block: 'start' });
  }
  function go(step) {
    if (step === 4 && !state.result) return;
    var root = document.querySelector('[data-advice-v2-root]');
    var currentStep = root ? Number(root.dataset.currentStep || state.step) : state.step;
    if (step > currentStep && step < 4) { var visible = document.querySelector('[data-advice-v2-step="' + currentStep + '"]'); var invalid = visible && visible.querySelector(':invalid'); if (invalid) { invalid.reportValidity(); return; } }
    saveDraft(); state.step = step; showStep(step);
  }
  function calculate() {
    saveDraft(); state.result = E.calculate(collect(), adviceAssumptions()); state.draftInput = state.result.input;
    if (form() && form().elements.batteryProductId) form().elements.batteryProductId.value = state.result.input.batteryProductId || '';
    var section = document.querySelector('[data-advice-v2-step="4"]'); if (section) { section.innerHTML = resultHtml(state.result); bindActions(section); }
    state.customerId = state.result.input.customerId || state.customerId; state.step = 4; saveDraft(); showStep(4);
  }
  function selectedKinds() { return Array.from(document.querySelectorAll('[data-advice-v2-product]:checked')).map(function (field) { return field.dataset.adviceV2Product; }); }
  function payload(selected) { return Object.assign({}, state.result, { selectedProducts: selected.slice() }); }
  function adviceRecord(selected) {
    var selectedResults = selected.map(function (kind) { return kind === 'warmtepomp' ? state.result.warmtepomp : state.result.batterij; }).filter(Boolean);
    var investment = selectedResults.reduce(function (sum, item) { return sum + Number(item.investment || 0); }, 0);
    var subsidy = selectedResults.reduce(function (sum, item) { return sum + Number(item.subsidy || 0); }, 0);
    var saving = selectedResults.reduce(function (sum, item) { return sum + Number(item.yearlySaving || 0); }, 0);
    return { id: state.savedAdviceId || undefined, customerId: state.customerId, kind: 'woningadvies-v3', title: 'Advies · ' + state.result.recommendation.title, summary: statusLabel(state.result.status) + '. Zekerheid: ' + state.result.inputQuality.label + '.', powerKw: state.result.warmtepomp && state.result.warmtepomp.requiredKw || 0, investment: investment, subsidy: subsidy, yearlySaving: saving, paybackYears: saving > 0 ? Math.round(Math.max(0, investment - subsidy) / saving * 10) / 10 : 0, productName: selectedResults.map(function (item) { return item.product && item.product.name; }).filter(Boolean).join(' + '), payload: payload(selected) };
  }
  function askCustomer(action) { state.pendingAction = action; var dialog = document.getElementById('advice-v2-customer-dialog'); if (dialog && dialog.showModal) dialog.showModal(); }
  function withCustomer(action) { if (!state.result || (state.result.errors || []).length) return; if (!state.customerId) return askCustomer(action); return action === 'save' ? save() : createQuote(); }
  function save() { var selected = selectedKinds(); return S.upsert('advices', adviceRecord(selected)).then(function (saved) { state.savedAdviceId = saved.id; C.app.toast('Advies 2.0 opgeslagen bij klant.'); return saved; }); }
  function quoteLines(selected) {
    var lines = []; var wp = state.result.warmtepomp; var bat = state.result.batterij;
    if (selected.indexOf('warmtepomp') >= 0 && wp && wp.product) lines.push({ productId: wp.product.catalogProductId || wp.product.id || '', description: wp.product.name + ' · advies ' + decimal(wp.requiredKwRange.low) + '–' + decimal(wp.requiredKwRange.high) + ' kW · inclusief installatie', qty: 1, unit: 'pakket', priceExVat: wp.investment / 1.21, vatRate: 21, componentKey: 'warmtepomp', lineKind: 'item', vatRefundEligible: false });
    if (selected.indexOf('batterij') >= 0 && bat && bat.product) lines.push({ productId: bat.product.catalogProductId || bat.product.id || '', description: bat.product.name + ' · ' + bat.recommendedKwh + ' kWh', qty: 1, unit: 'pakket', priceExVat: bat.investmentExVat, vatRate: 21, componentKey: 'thuisbatterij', lineKind: 'item', vatRefundEligible: true });
    return lines;
  }
  function quoteBenefits(selected) { var benefits = []; var wp = state.result.warmtepomp; if (selected.indexOf('batterij') >= 0 && state.result.input.vatRefund === 'ja') benefits.push({ id: 'btw-refund', type: 'btw_refund', label: 'Mogelijke btw-teruggave', amount: 0, componentKey: 'thuisbatterij', calculationMode: 'eligible_vat', reviewed: false }); if (selected.indexOf('warmtepomp') >= 0 && wp && Number(wp.subsidy || 0) > 0) benefits.push({ id: 'isde', type: 'isde', label: 'Verwachte ISDE-subsidie', amount: Number(wp.subsidy), componentKey: 'warmtepomp', calculationMode: 'advice', reviewed: false }); return benefits; }
  function createQuote() {
    var selected = selectedKinds(); if (!selected.length) { C.app.toast('Selecteer minimaal één offerteklaar product.'); return; }
    var lines = quoteLines(selected); if (!lines.length) { C.app.toast('Er is nog geen offerteklaar productadvies.'); return; }
    return S.upsert('advices', adviceRecord(selected)).then(function (saved) {
      state.savedAdviceId = saved.id; var templateType = selected.length > 1 ? 'combinatie' : selected[0] === 'batterij' ? 'thuisbatterij' : 'warmtepomp'; var config = C.quoteDocument.defaultConfig({ templateType: templateType, lines: lines });
      var yearly = selected.reduce(function (sum, kind) { var item = kind === 'warmtepomp' ? state.result.warmtepomp : state.result.batterij; return sum + Number(item && item.yearlySaving || 0); }, 0);
      config.financial.yearlySaving = yearly; config.financial.monthlySaving = yearly / 12; config.financial.tenYearSaving = yearly * 10; config.financial.paybackYears = state.result.ranges.payback.expected;
      return C.quotes.createFromAdvice({ customerId: state.customerId, sourceAdviceId: saved.id, templateType: templateType, benefits: quoteBenefits(selected), documentConfig: config, notes: state.result.inputQuality.label + '. Technische controles: ' + (state.result.requiredChecks.join(' ') || 'geen open punten') + '\n\n' + S.settings().defaultQuoteTerms, lines: lines });
    }).then(function (quote) { return S.upsert('advices', Object.assign({}, adviceRecord(selected), { id: state.savedAdviceId, sourceQuoteId: quote.id })).then(function () { C.app.toast('Conceptofferte vanuit Advies 2.0 aangemaakt.'); C.app.navigate('quote:' + quote.id); }); });
  }
  function confirmCustomer() { var select = document.getElementById('advice-v2-customer-select'); if (!select || !select.value) { if (select) select.reportValidity(); return; } state.customerId = select.value; state.result.input.customerId = select.value; var dialog = document.getElementById('advice-v2-customer-dialog'); if (dialog) dialog.close(); var action = state.pendingAction; state.pendingAction = ''; return action === 'save' ? save() : createQuote(); }
  function pdf() { if (!state.result) { C.app.toast('Rond eerst de scan af.'); return; } var customer = S.getAll('customers').find(function (item) { return item.id === state.customerId; }) || {}; C.pdf.printAdviceV2(state.result, customer); }
  function chooseBattery(productId) {
    var current = form(); if (!current || !state.result) return;
    current.elements.batteryProductId.value = productId;
    state.result = E.calculate(collect(), adviceAssumptions()); state.draftInput = state.result.input;
    current.elements.batteryProductId.value = state.result.input.batteryProductId || '';
    var section = document.querySelector('[data-advice-v2-step="4"]'); if (section) { section.innerHTML = resultHtml(state.result); bindActions(section); }
    saveDraft();
  }
  function updateConditionals() { var current = form(); if (!current) return; var pv = document.querySelector('[data-advice-v2-conditional="pv"]'); var ev = document.querySelector('[data-advice-v2-conditional="ev"]'); var hp = document.querySelector('[data-advice-v2-conditional="heatpump"]'); if (pv) pv.hidden = Number(current.elements.pvCount && current.elements.pvCount.value || 0) <= 0; if (ev) ev.hidden = !current.elements.ev || current.elements.ev.value !== 'ja'; if (hp) hp.hidden = !current.elements.heatPumpPresent || current.elements.heatPumpPresent.value !== 'ja'; Array.from(current.querySelectorAll('.advice-v2-energy-prices tbody tr')).forEach(function (row) { var radio = row.querySelector('input[type="radio"]'); row.classList.toggle('is-selected', Boolean(radio && radio.checked)); }); }
  function handleAction(target) {
    var action = target.dataset.action; if (!action || action.indexOf('advice-v2-') !== 0) return false;
    if (action === 'advice-v2-module') { state.module = target.dataset.module; form().elements.module.value = state.module; state.result = null; toggleModule(); saveDraft(); }
    else if (action === 'advice-v2-next') go(Math.min(3, Number(document.querySelector('[data-advice-v2-root]').dataset.currentStep || 1) + 1)); else if (action === 'advice-v2-prev') go(Math.max(1, Number(document.querySelector('[data-advice-v2-root]').dataset.currentStep || 1) - 1)); else if (action === 'advice-v2-go') go(Number(target.dataset.step)); else if (action === 'advice-v2-calculate') calculate(); else if (action === 'advice-v2-battery') chooseBattery(target.dataset.productId); else if (action === 'advice-v2-edit') go(1); else if (action === 'advice-v2-pdf') pdf(); else if (action === 'advice-v2-save') return withCustomer('save'); else if (action === 'advice-v2-quote') return withCustomer('quote'); else if (action === 'advice-v2-customer-confirm') return confirmCustomer(); return true;
  }
  function handleChange(target) { if (!target.closest('[data-form="advice-v2"]')) return; updateConditionals(); saveDraft(); }

  C.adviceV2 = { render: render, handleAction: handleAction, handleChange: handleChange, calculate: E.calculate };
  document.addEventListener('change', function (event) { handleChange(event.target); });
  document.addEventListener('input', function (event) { if (event.target.closest && event.target.closest('[data-form="advice-v2"]')) window.clearTimeout(state.autosaveTimer); state.autosaveTimer = window.setTimeout(saveDraft, 350); });
  document.addEventListener('DOMContentLoaded', toggleModule);
}());
