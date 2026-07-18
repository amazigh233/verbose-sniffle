# Schaalbaarheid — Climature Bedrijfsportaal

Laatst bijgewerkt: 18 juli 2026.

De applicatie is geoptimaliseerd om ~1000 gelijktijdige gebruikers aan te kunnen
op één instance. Dit document beschrijft wat er in de code zit, welke knoppen je
kunt draaien via omgevingsvariabelen, en wat er nodig is om verder op te schalen.

## Wat er in de code zit

| Optimalisatie | Waar | Effect |
| --- | --- | --- |
| Bootstrap-cache (10s TTL) | `src/bootstrap-cache.js`, `src/data.js` | `/api/bootstrap` leest niet meer bij elk verzoek de hele database; schrijfacties invalideren de cache direct |
| Parallelle collectie-loads | `src/data.js` (`loadBootstrap`) | Cache-miss laadt alle collecties tegelijk i.p.v. één voor één |
| Overdue-facturen-refresh gethrottled | `src/data.js` (`maybeRefreshOverdueInvoices`) | De database-write op het leespad draait max. 1x per 5 min (en bij datumwissel) |
| Gzip-compressie | `src/server.js` (`compression()`) | Bootstrap-payload van ~740 KB naar ~30 KB (−96%) |
| Prisma pool `connection_limit=20` | `src/prisma.js` | Voorspelbare poolgrootte i.p.v. cpu-afhankelijke default |
| Session-pool `max: 5` | `src/server.js` (`pg.Pool`) | Sessies claimen niet ongelimiteerd verbindingen |
| Session-touch throttle (5 min) | `src/server.js` (`ThrottledPgSession`) | Geen database-UPDATE meer per request; sliding expiry blijft werken |
| Auth-cache (30s TTL) | `src/server.js` | De user-hervalidatie per request raakt de database max. 1x per 30s per gebruiker |
| Gebatchte import | `src/data.js` (`replaceAll`) | Backup-import gebruikt `createMany` i.p.v. rij-voor-rij, met 60s transaction-timeout |

### Bewuste micro-gedragsveranderingen
- Een handmatig opgeslagen factuur met verleden vervaldatum kan max. 5 minuten
  als "verzonden" blijven staan voor die automatisch "verlopen" wordt.
- Sessies kunnen server-side 25–30 min na de laatste activiteit verlopen
  i.p.v. exact 30 (nooit later, alleen eerder).
- Een gebruiker die **rechtstreeks in de database** wordt gedeactiveerd blijft
  max. 30s geldig. Deactivering via de API (PUT `/api/users/:id`) werkt direct.
- Bootstrap-data kan voor andere gebruikers max. 10s oud zijn na een write die
  buiten de bekende paden om gaat; alle API-schrijfpaden invalideren direct.

## Omgevingsvariabelen

| Variabele | Default | Betekenis |
| --- | --- | --- |
| `PRISMA_CONNECTION_LIMIT` | 20 | Prisma-poolgrootte (genegeerd als `DATABASE_URL` al `connection_limit` bevat) |
| `BOOTSTRAP_CACHE_TTL_MS` | 10000 | TTL bootstrap-cache; `0` schakelt uit (automatisch uit bij `NODE_ENV=test`) |
| `AUTH_CACHE_TTL_MS` | 30000 | TTL auth-hervalidatiecache; `0` schakelt uit (automatisch uit in tests) |

## Verbindingsbudget Postgres

Render `basic-1gb` staat ~100 verbindingen toe. Huidig budget per web-instance:
Prisma 20 + sessie-pool 5 = 25, plus kortstondig de cronjobs
(service-reminders, backup) en `migrate deploy` bij een release. Ruim binnen
de limiet met marge voor één extra instance — maar zie hieronder voordat je
`numInstances` verhoogt.

## Render-instellingen om later te verhogen (kost geld, bewust nog niet gedaan)

1. **Web service plan**: `starter` → `standard` (of hoger). Gzip-compressie en
   bcrypt-logins zijn CPU-gebonden; de starter-CPU is de eerstvolgende
   bottleneck bij echte piekbelasting.
2. **Postgres**: `basic-1gb` volstaat voorlopig. Let op opslaggroei: geüploade
   documenten staan als bytes in de database.

## Vereisten vóór meerdere instances (`numInstances > 1`)

Deze onderdelen zijn nu per-proces in geheugen en moeten eerst naar een
gedeelde store (Redis of Postgres):

- Login/MFA rate limiters (`createFailureLimiter` in `src/server.js`)
- Bootstrap-cache (`src/bootstrap-cache.js`)
- Auth-cache en de touch-throttle-administratie (`src/server.js`)

Sessies staan al in Postgres en zijn multi-instance-veilig. Tot die tijd:
schaal verticaal (zwaarder plan), niet horizontaal.

## Bekende resterende beperkingen

- **Datavolume**: `/api/bootstrap` levert nog steeds de volledige dataset
  (gefilterd per rol). Met de cache en gzip is dat geen serverprobleem meer,
  maar bij tienduizenden records wordt de payload voor de browser groot. De
  structurele oplossing is per-module paginering/lazy-loading (grote
  frontend-refactor, bewust uitgesteld).
- **Export**: `/api/backup/export` bouwt alle servicedocumenten base64 in één
  JSON-string in geheugen. Bij veel/grote documenten moet dit streamend worden.
- **Bestanden**: uploads (max 8 MB) worden in geheugen gebufferd en in Postgres
  opgeslagen. Bij intensief bestandsgebruik is S3-achtige opslag met streaming
  de volgende stap.

## Load test herhalen

```bash
# Aparte testdatabase gebruiken, nooit productie!
npm start   # of: node src/server.js
# Log in en pak de cookie, dan:
npx autocannon -c 100 -d 20 -H "cookie: climature.sid=..." -H "accept-encoding: gzip" http://localhost:3000/api/bootstrap
```

Gemeten op 18-07-2026 (lokaal, 300 klanten/300 offertes/200 facturen/600
notities/150 installaties, 100 gelijktijdige verbindingen, 20s):

| | Zonder cache & gzip | Met cache & gzip |
| --- | --- | --- |
| Requests/sec | 370 | 410 |
| Latency p50 | 267 ms | 240 ms |
| Dataverkeer | 275 MB/s | 12,8 MB/s |
| DB-loads | 1 per request | ~1 per 10s |
| Fouten | 0 | 0 |

Lokaal is het verschil in req/s klein omdat een lokale Postgres snel is; op
gedeelde hosting maken de cache (database vrijwel ontlast) en compressie
(−96% verkeer) het verschil tussen omvallen en soepel draaien.
