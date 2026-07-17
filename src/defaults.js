"use strict";

const DEFAULT_SETTINGS = {
  companyName: "Climature",
  companyAddress: "Nevadadreef 17J",
  companyCity: "3565 CA Utrecht",
  companyPhone: "085 060 3664",
  companyEmail: "info@climature.nl",
  companySite: "www.climature.nl",
  companyKvk: "",
  companyVat: "",
  companyIban: "",
  paymentDays: 14,
  defaultInvoiceNote: "Gelieve het openstaande bedrag te voldoen binnen de betaaltermijn onder vermelding van het factuurnummer.",
  defaultQuoteTerms: "Deze offerte is vrijblijvend en geldig tot de genoemde datum. Genoemde prijzen zijn gebaseerd op de nu bekende situatie. Eventueel meerwerk, aanpassingen aan meterkast, leidingwerk, bouwkundige delen of bestaande installaties worden vooraf besproken. Planning vindt plaats in overleg na akkoord.",
  googleBusinessProfile: { profileUrl: "", reviewUrl: "" },
  projectDigest: { enabled: true, hour: 7, timezone: "Europe/Amsterdam", recipients: "" },
  serviceReminders: { enabled: true, daysBefore: 30 },
  adviceAssumptions: {
    energy: {
      gasPrice: 1.45,
      electricityPrice: 0.30,
      dynamicElectricityPrice: 0.26,
      gasAnnualIncrease: 5,
      electricityAnnualIncrease: 2
    },
    battery: {
      feedInCost: 0.15,
      epexMargin: 0.22,
      imbalancePerKwh: 250,
      aggregatorFeeExternal: 25,
      aggregatorFeeClimature: 15
    },
    warmtepompProducts: {
      allelectric: [
        { name: "TC Swiss Ecoline 8KW All Electric", kw: 8, priceIncl: 13189, subsidy: 3750, rvoSearch: "TC Swiss Ecoline 8KW All Electric", meldcode: "" },
        { name: "TC Swiss Ecoline 12KW All Electric", kw: 12, priceIncl: 14549, subsidy: 4650, rvoSearch: "TC Swiss Ecoline 12KW All Electric", meldcode: "" }
      ],
      hybride: [
        { name: "TC Swiss Ecoline 8KW Hybride", kw: 8, priceIncl: 11835, subsidy: 3025, rvoSearch: "TC Swiss Ecoline 8KW Hybride", meldcode: "" },
        { name: "TC Swiss Ecoline 12KW Hybride", kw: 12, priceIncl: 14940, subsidy: 3700, rvoSearch: "TC Swiss Ecoline 12KW Hybride", meldcode: "" }
      ]
    },
    batteryProducts: {
      "1fase": [
        { name: "Climature A10", kwh: 10, priceExVat: 12094 },
        { name: "Climature A21", kwh: 21, priceExVat: 14594 }
      ],
      "3fase": [
        { name: "Climature T10", kwh: 10, priceExVat: 12094 },
        { name: "Climature T15", kwh: 15, priceExVat: 13594 },
        { name: "Climature T21", kwh: 21, priceExVat: 14594 },
        { name: "Climature T30", kwh: 30, priceExVat: 20094 },
        { name: "Climature T40", kwh: 40, priceExVat: 24549 }
      ]
    },
    sources: {
      energy: { label: "Handmatige fallback", period: "", refreshedAt: "", url: "https://www.cbs.nl/nl-nl/cijfers/detail/85592NED" },
      subsidies: { label: "Handmatige fallback", period: "", refreshedAt: "", url: "https://www.rvo.nl/subsidies-financiering/isde/meldcodelijsten" },
      market: { label: "Handmatige aannames", period: "", refreshedAt: "" }
    }
  }
};

const DEFAULT_PRODUCTS = [
  { id: "prod-wp-8-ae", category: "warmtepomp", brand: "TC Swiss", name: "Ecoline 8KW All Electric", specs: "8 kW, 200L boiler, 100L buffervat", priceExVat: 10899, vatRate: 21, description: "Compleet geinstalleerde all-electric warmtepomp voor goed geisoleerde woningen." },
  { id: "prod-wp-12-ae", category: "warmtepomp", brand: "TC Swiss", name: "Ecoline 12KW All Electric", specs: "12 kW, 200L boiler, 100L buffervat", priceExVat: 12024, vatRate: 21, description: "All-electric oplossing voor grotere woningen of hogere warmtevraag." },
  { id: "prod-wp-8-hyb", category: "warmtepomp", brand: "TC Swiss", name: "Ecoline 8KW Hybride", specs: "8 kW, 100L buffervat", priceExVat: 9781, vatRate: 21, description: "Hybride warmtepomp gekoppeld aan HR-ketel voor piekvraag en tapwater." },
  { id: "prod-wp-12-hyb", category: "warmtepomp", brand: "TC Swiss", name: "Ecoline 12KW Hybride", specs: "12 kW, 100L buffervat", priceExVat: 12347, vatRate: 21, description: "Hybride oplossing voor grotere woningen of hoger gasverbruik." },
  { id: "prod-bat-a10", category: "thuisbatterij", brand: "Climature", name: "A10", specs: "10 kWh, 1-fase", priceExVat: 12094, vatRate: 21, description: "Instapmodel voor gemiddeld huishouden met zonnepanelen." },
  { id: "prod-bat-a21", category: "thuisbatterij", brand: "Climature", name: "A21", specs: "21 kWh, 1-fase", priceExVat: 14594, vatRate: 21, description: "Maximale capaciteit op 1-fase aansluiting." },
  { id: "prod-bat-t10", category: "thuisbatterij", brand: "Climature", name: "T10", specs: "10 kWh, 3-fase", priceExVat: 12094, vatRate: 21, description: "3-fase instapper voor PV-opslag en arbitrage." },
  { id: "prod-bat-t15", category: "thuisbatterij", brand: "Climature", name: "T15", specs: "15 kWh, 3-fase", priceExVat: 13594, vatRate: 21, description: "Balans tussen investering en opbrengst." },
  { id: "prod-bat-t21", category: "thuisbatterij", brand: "Climature", name: "T21", specs: "21 kWh, 3-fase", priceExVat: 14594, vatRate: 21, description: "Populaire keuze voor EV of warmtepomp in huis." },
  { id: "prod-bat-t30", category: "thuisbatterij", brand: "Climature", name: "T30", specs: "30 kWh, 3-fase", priceExVat: 20094, vatRate: 21, description: "Grotere capaciteit voor arbitrage en onbalansvergoeding." },
  { id: "prod-bat-t40", category: "thuisbatterij", brand: "Climature", name: "T40", specs: "40 kWh, 3-fase", priceExVat: 24549, vatRate: 21, description: "Maximale capaciteit voor hoge flexibiliteitsopbrengst." },
  { id: "prod-ac-single", category: "airco", brand: "Mitsubishi Heavy", name: "Single split airco", specs: "3,5 kW, 1 binnenunit", priceExVat: 1850, vatRate: 21, description: "Koelen en verwarmen voor een enkele ruimte inclusief standaard montage." },
  { id: "prod-ac-multi", category: "airco", brand: "Mitsubishi Heavy", name: "Multi split airco", specs: "2 binnenunits, montagepakket", priceExVat: 3650, vatRate: 21, description: "Comfortoplossing voor meerdere ruimtes." },
  { id: "prod-cv-hr", category: "cv-ketel", brand: "Intergas", name: "HR cv-ketel CW5", specs: "CW5, inclusief standaard montage", priceExVat: 2250, vatRate: 21, description: "Vervanging van bestaande cv-ketel met standaard aansluitmateriaal." },
  { id: "prod-install", category: "cv-ketel", brand: "Climature", name: "Installatie en inbedrijfstelling", specs: "Arbeid, kleinmateriaal, controle", priceExVat: 750, vatRate: 21, description: "Installatiepost voor offertes waar arbeid apart gewenst is." }
];

module.exports = { DEFAULT_SETTINGS, DEFAULT_PRODUCTS };
