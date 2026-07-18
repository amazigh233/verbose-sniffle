# Technisch implementatieplan Climature Bedrijfsportaal

## Doel en uitgangspunten

Dit plan maakt het bestaande portaal technisch verkoopklaar als single-tenant bedrijfsapplicatie. Bestaande gebruikersstromen blijven werken tijdens de migratie. Autorisatie wordt altijd server-side afgedwongen; de frontend is nooit een beveiligingsgrens. De architectuur krijgt expliciete extensiepunten voor een later `organizationId`, maar multi-tenancy valt buiten deze uitvoering.

De huidige werkmap bevat al omvangrijke, niet-gecommitte wijzigingen in onder meer `src/server.js`, `src/data.js`, `prisma/schema.prisma`, frontendbestanden en tests. Die wijzigingen worden als gebruikersbaseline behandeld. Nieuwe commits bevatten uitsluitend aantoonbaar bij dit plan horende wijzigingen. Waar een schoon, afzonderlijk commit door overlappende regels niet veilig kan worden gemaakt, wordt eerst een patch/diff per fase opgeleverd en pas na scheiding gecommit.

## Auditbevindingen en belangrijkste risico's

- `src/server.js` combineert middleware, sessies, autorisatie en alle routes in circa 1.100 regels; `src/data.js` combineert repositories, serialisatie, validatie, bootstrap en back-up in circa 900 regels.
- `/api/bootstrap` leest nog alle kerncollecties en retourneert die per rol. De installerprojecties filteren velden, maar niet consequent records op toewijzing.
- `/api/collections/:collection` is een generiek lees-/schrijfpad. Roltoegang is op collectieniveau geregeld, terwijl objecttoegang en gekoppelde klanttoegang niet overal worden bewezen.
- Klantdocumenten bevatten base64 in een `String`-kolom; service- en quote-documenten bewaren bytes in PostgreSQL. Daardoor zijn bootstrap/back-up en databasevolume onnodig groot.
- Servicebezoeken hebben al een bruikbare installer-policy (`assignedEmployeeId`), maar klanten, installaties, documenten, werkbonnen en generieke collectieacties gebruiken die policy nog niet overal.
- Financiële kernvelden in producten, offertes, facturen en serviceregels gebruiken `Float`. Afrondhelpers beperken zichtbare fouten, maar opslag en herberekening zijn niet exact.
- Login-, MFA- en API-rate-limits, de auth-cache, touch-throttling en bootstrap-cache gebruiken procesgeheugen en zijn daarom niet consistent over meerdere instances.
- HR-records bevatten `keyVersion`, maar decryptie kiest nog één globale sleutel. MFA-secretvelden hebben nog geen eigen sleutelversie.
- Uploads valideren deels MIME/magic bytes en ClamAV fail-closed gedrag, maar dit is niet centraal, niet voor alle documenttypen gelijk en nog niet gekoppeld aan object storage.
- De E2E-suite mockt meerdere belangrijke bootstrapstromen. Er is nog geen CI-workflow of lintscript.

## Doelarchitectuur

```text
src/
  modules/
    auth/
    customers/
    installations/
    quotes/
    invoices/
    projects/
    service/
    hr/
    documents/
  middleware/
    authentication.js
    authorization.js
    error-handler.js
    request-context.js
    validation.js
  infrastructure/
    database/
    cache/
    object-storage/
    malware-scanner/
    logging/
  shared/
    errors.js
    money.js
    pagination.js
    schemas.js
```

Elk domein krijgt waar relevant `routes`, `controller`, `service`, `repository`, `validation` en `authorization`. Controllers vertalen HTTP naar domeinaanroepen; services bevatten transacties en businessregels; repositories zijn de enige laag met domeinspecifieke Prismaqueries.

## Fase 0 — Baseline, guardrails en meetpunten

### Werk

- Leg de huidige status vast met `git status`, Prisma-validatie, unit/integratietests en bestaande E2E-tests.
- Voeg een lintscript met ESLint toe zonder een brede automatische herformattering van bestaande code.
- Voeg centrale fouttypen en een consistente responsevorm toe: `{ error: { code, message, requestId, details? } }`; validatiedetails bevatten alleen veldinformatie.
- Voeg request-ID, gestructureerde JSON-logging en redactieregels toe. Log gebruiker-ID, routepatroon, status, duur en foutcategorie, nooit secrets, documentinhoud of volledige persoonsgegevens.
- Exporteer `createApp` en lifecyclefuncties afzonderlijk zodat integratietests de echte app gecontroleerd kunnen starten en stoppen.

### Verificatie

- Huidige tests zijn groen of bestaande afwijkingen zijn expliciet als baseline gedocumenteerd.
- Fouten bevatten geen stacktrace in responses.
- Logtests bewijzen redactie van wachtwoorden, tokens, MFA en uploadinhoud.

### Beoogde commit

`chore(platform): add baseline validation logging and test guardrails`

## Fase 1 — Centrale autorisatie en IDOR-sluiting

### Autorisatiemodel

- `admin`: volledige toegang.
- `installer`: toegang tot records als diens `User.employeeId` gelijk is aan de toegewezen `employeeId`/`assignedEmployeeId`, of als een projectlidmaatschap via dezelfde werknemer bestaat.
- Klanttoegang voor een installer bestaat alleen wanneer de klant gekoppeld is aan een toegankelijke installatie, project of onderhoudsbezoek.
- Document-, notitie- en werkbontoegang erft toegang van het bovenliggende record; losse ID's worden nooit zonder parent-scope opgehaald.
- Overige rollen houden hun functionele domeinrechten, aangevuld met objectchecks waar een gekoppelde record-ID wordt gebruikt.

### Werk

- Maak herbruikbare policies zoals `getActorContext`, `customerScope`, `installationScope`, `projectScope`, `serviceVisitScope`, `documentScope`, `assertCanRead` en `assertCanMutate`.
- Laat repositories toegangsfilters direct in Prisma `where`-clausules opnemen. Gebruik geen eerst-ophalen-dan-filteren voor gevoelige records.
- Controleer alle routes met `:id`, inclusief geneste IDs, quote-assets, downloads, workorders, servicebezoeken, projecttaken/materialen/team/equipment en generieke delete/updatepaden.
- Vervang voor kerncollecties het generieke collectiepad door domeinroutes. Houd alleen tijdelijk een compatibiliteitsadapter aan die dezelfde policies gebruikt.
- Geef bij niet-toegankelijke records standaard `404` terug om bestaan niet prijs te geven; gebruik `403` voor een bekende, toegestane actiecategorie zonder objectrecht.

### Verificatie

- Integratietests maken twee installers met afzonderlijke werknemers, klanten, installaties, projecten, servicebezoeken, documenten en werkbonnen.
- Installer A kan records van installer B niet lezen, wijzigen, verwijderen, downloaden of indirect benaderen via een gekoppelde ID.
- Tests omvatten zowel lijstqueries als directe/nested URL's en manipulatie van body-relaties.

### Beoogde commits

- `feat(authz): add reusable actor and record access policies`
- `fix(authz): enforce installer ownership across domain routes`
- `test(authz): prove cross-installer isolation`

## Fase 2 — Kleine bootstrap en gepagineerde domein-API's

### Bootstrapcontract

`/api/bootstrap` bevat uitsluitend:

- `user` en expliciete `roles`/`permissions`;
- kleine bedrijfsconfiguratie die de rol nodig heeft;
- noodzakelijke referentiedata;
- beperkte dashboardstatistieken;
- feature flags en API-contractversie.

Geen klanten, installaties, offertes, facturen, notities, documenten of medewerkers worden opgenomen.

### Werk

- Introduceer afzonderlijke endpoints voor `/api/customers`, `/api/installations`, `/api/quotes`, `/api/invoices`, `/api/projects`, `/api/notes`, `/api/documents` en `/api/employees`.
- Gebruik overal `page`, `pageSize` (standaard 25, maximum 100), `search`, toegestane filters en een allowlist voor `sortBy`/`sortOrder`.
- Retourneer `{ items, page, pageSize, totalItems, totalPages }` via één helper.
- Pas de frontenddatalaag aan om pagina's per module lazy te laden. Voeg tijdelijk een genormaliseerde clientcache toe zodat schermen niet tegelijk hoeven te worden omgebouwd.
- Verwijder de volledige-data bootstrap-cache. Cache alleen kleine, niet-gevoelige referentiedata via de gedeelde cache uit fase 7.

### Verificatie

- Contracttests bewijzen maximale paginagrootte, stabiele sortering, zoeken/filteren en rolscopes.
- Een bootstrapresponse bevat geen documentinhoud en blijft onder een vastgestelde grootte met een grote testdataset.
- Frontendtests bewijzen lazy loading, paginawisseling en zoekgedrag.

### Beoogde commits

- `feat(api): add validated paginated domain endpoints`
- `refactor(bootstrap): return only session config and dashboard data`
- `refactor(frontend): load domain data on demand`

## Fase 3 — Beveiligde documentopslag

### Werk

- Introduceer `ObjectStorage` met `put`, `get`, `delete` en optioneel signed/internal streaming. Lever een S3-compatible adapter en een lokale testadapter.
- PostgreSQL bewaart alleen metadata: eigenaar/parent, originele veilige bestandsnaam, MIME, grootte, SHA-256, scanstatus, storage key, storage provider en timestamps.
- Uploadflow: groottebegrenzing -> bestandsnaam/extensie-allowlist -> magic-byte/MIME-validatie -> quarantainestore -> ClamAV-scan -> promotie naar definitieve key -> metadata op `clean`.
- In productie en andere expliciet veilige omgevingen weigert een onbeschikbare scanner uploads met `503`. Alleen tests/ontwikkeling kunnen via een expliciete, standaard-uitgeschakelde flag een scannerstub gebruiken.
- Downloads streamen pas na parent-policy, `clean`-status en integriteitscontrole; headers voorkomen inline sniffing en caching.
- Migreer bestaande `CustomerDocument.content`, `ServiceDocument.content`, HR-bestanden en quote-assets gefaseerd naar storage keys. Het migratiescript is hervatbaar, checksum-gecontroleerd en verwijdert bronbytes pas na succesvolle verificatie.
- Back-ups exporteren metadata en een objectmanifest, niet inline base64.

### Verificatie

- Tests voor verkeerde extensie, MIME/magic mismatch, oversize, malware, scanner-onbeschikbaar, path-traversalbestandsnaam, ongeautoriseerde download en checksumfout.
- Productieconfiguratie kan niet starten of uploaden met een onveilige scanner/storagecombinatie.

### Beoogde commits

- `feat(documents): add scanned object storage pipeline`
- `migrate(documents): move database blobs to storage keys`
- `test(documents): cover upload and download security`

## Fase 4 — Exacte financiële opslag en berekeningen

### Scope

Geldvelden in `Product`, `Quote`, `QuoteLine`, `Invoice`, `InvoiceLine`, verkoopkansen, adviezen, projectmaterialen, servicecontracten en geprijsde servicematerialen worden beoordeeld. Alleen echte bedragen migreren naar `Decimal @db.Decimal(12, 2)`; hoeveelheden/uren/percentages krijgen passende Decimal-precisie of blijven niet-geldelijke numerieke typen.

### Werk

- Centraliseer geldrekenen op integer centen of Prisma `Decimal`; rond per regel en btw-regel volgens één gedocumenteerde strategie.
- Accepteer financiële input als decimale string of veilig getal, normaliseer naar een vaste precisie en serialiseer API-bedragen consequent als strings. Tijdens frontendmigratie kan een expliciete compatibiliteitsmapper weergavegetallen maken.
- Voeg eerst nieuwe Decimal-kolommen toe, vul ze met gecontroleerde SQL-casts, vergelijk tellingen/sommen, schakel code om en verwijder daarna Float-kolommen. Zo is rollback mogelijk en worden bestaande gegevens niet stil afgerond zonder rapportage.
- Laat offerte-naar-factuur exact dezelfde gecanonicaliseerde regels kopiëren; totalen worden server-side herberekend en nooit vertrouwd uit de requestbody.

### Verificatie

- Unit- en integratietests voor halve centen, meerdere btw-tarieven, negatieve korting, eligible VAT, grote aantallen, herberekening en offerte-naar-factuur.
- Migratiecontrole vergelijkt oude en nieuwe totalen en rapporteert afwijkingen groter dan één cent voordat destructieve stappen draaien.

### Beoogde commits

- `feat(finance): centralize decimal money calculations`
- `migrate(finance): replace monetary floats with decimals`
- `test(finance): cover rounding vat discounts and totals`

## Fase 5 — Centrale Zod-validatie

### Werk

- Voeg Zod toe en maak middleware voor `params`, `query` en `body`.
- Definieer gedeelde schema's voor cuid/ID, ISO-datum, tijd, e-mail, telefoon, enum, money, paginering en sortering.
- Elk create/update-endpoint gebruikt een strikt domeinschema; onbekende gevoelige velden worden geweigerd in plaats van genegeerd.
- Relatie-ID's worden na vormvalidatie ook domeinmatig gecontroleerd binnen dezelfde autorisatiescope.
- Normaliseer Prisma-, multer-, Zod- en domeinfouten naar consistente publieke foutcodes.

### Verificatie

- Route-inventarisatietest faalt wanneer een mutatieroute geen validatieschema declareert.
- Negatieve tests omvatten onbekende velden, ongeldige enums/datums/e-mails/telefoons/bedragen, te grote pagina's en relation swapping.

### Beoogde commit

`feat(validation): enforce zod schemas on all API inputs`

## Fase 6 — Domeinmodules en dunne controllers

### Werk

- Verplaats eerst customers/installations, daarna quotes/invoices, projects/service en ten slotte auth/HR.
- Houd routepaden tijdens de refactor gelijk waar compatibiliteit nodig is; nieuwe versieerbare routes worden vanuit één router gemount.
- Verwijder circulaire `require`-aanroepen door services via expliciete dependencies te maken.
- Splits back-up/import en counters naar infrastructuur/shared services.
- Leg per module exports en transactiegrenzen vast. Geen directe Prismaquery in controllers.

### Verificatie

- Architectuurtest controleert dat controllers geen `prisma` importeren.
- Bestaande integratietests blijven na iedere moduleverplaatsing groen.

### Beoogde commits

- `refactor(customers): extract domain module`
- `refactor(commercial): extract quote and invoice modules`
- `refactor(operations): extract project installation and service modules`
- `refactor(platform): extract auth hr and infrastructure modules`

## Fase 7 — Multi-instance schaalbaarheid

### Werk

- Voeg een gedeelde cache/rate-limitinterface toe met Redis-adapter. Productie vereist Redis; tests gebruiken een deterministische in-memory adapter.
- Verplaats API/login/MFA/wachtwoord-rate-limits, auth-hervalidatiecache en kleine referentiecaches naar namespaced keys met TTL.
- Verwijder proceslokale session-touchstatus of implementeer de optimalisatie zonder security-afhankelijkheid; sessies blijven in PostgreSQL of migreren expliciet naar Redis.
- Voeg samengestelde indexes toe op alle autorisatie-, parent-, datum/status- en zoekfilters die in de nieuwe repositories voorkomen. Controleer queryplannen op grote fixtures.

### Verificatie

- Integratietest met twee appinstances en één gedeelde datastore bewijst dat rate limits, logout/rolewijziging en cache-invalidatie instance-overstijgend werken.
- Geen beveiligingsbeslissing is afhankelijk van een lokale `Map`.

### Beoogde commits

- `feat(scale): add shared redis cache and rate limiting`
- `perf(database): add indexes for scoped paginated queries`

## Fase 8 — Encryptiesleutelrotatie

### Werk

- Parse een keyring uit environment/config: versienaam naar 32-byte sleutel, plus één `ACTIVE_ENCRYPTION_KEY_VERSION`.
- Encryptie gebruikt uitsluitend de actieve sleutel; decryptie vereist de opgeslagen `keyVersion` en faalt gesloten bij een onbekende versie.
- Voeg sleutelversievelden toe waar ze ontbreken, met name MFA-secrets en versleutelde private employee-data.
- Gebruik per gegevenssoort context/AAD zodat ciphertext niet tussen recordtypen kan worden verwisseld.
- Voeg een hervatbaar migratiescript toe met dry-run, batches, transacties per batch, tellingen en uitsluitend metadata in logs.

### Verificatie

- Tests decrypten historische versies, schrijven met de actieve versie, weigeren onbekende versies en roteren zonder plaintext in logs.

### Beoogde commits

- `feat(crypto): support versioned encryption keyrings`
- `feat(crypto): add resumable re-encryption command`

## Fase 9 — Graceful shutdown en operationele robuustheid

### Werk

- Houd HTTP-server, PostgreSQL-sessionpool, Prisma, Redis en storageclients expliciet bij.
- Op `SIGTERM`/`SIGINT`: stop nieuwe connecties, wacht begrensd op lopende requests/jobs, sluit clients en eindig met een passende exitcode.
- Voeg readiness en liveness apart toe; readiness wordt tijdens shutdown direct false.
- Voeg timeouts, bodylimieten en backpressure toe aan downloads/uploads en externe providers.

### Verificatie

- Procesintegratietest stuurt shutdown tijdens een lopend verzoek en bewijst gecontroleerde afronding en clientsluiting.

### Beoogde commit

`feat(platform): add graceful shutdown and health lifecycle`

## Fase 10 — Echte E2E, CI en distributiebeveiliging

### Werk

- Start in CI een tijdelijke PostgreSQL- en Redis-service, voer migraties/seed uit en start echte backend plus frontend.
- Laat Playwright echte login-, installer-isolatie-, documentupload/download- en offerte/factuurflows uitvoeren. Kernbeveiliging en factuurberekening worden niet via route mocks getest.
- Voeg GitHub Actions toe voor `npm ci`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm audit` en `npx prisma validate`.
- Voeg een distributiecontrole toe die faalt op `.env`, `.git`, secrets, `node_modules`, testresultaten en inline documentinhoud. Werk `.gitignore`, Dockerignore en release/package-script bij.
- Documenteer installatie, alle environmentvariabelen, deployment, database/object-storageback-up, restore, sleutelrotatie, ClamAV, Redis, migrations en incidentherstel.

### Verificatie

- CI draait op iedere pull request en is volledig groen.
- Een schone installatie kan met uitsluitend documentatie en `.env.example` worden gestart.
- Een back-up/restore smoke-test herstelt database én objecten en controleert checksums.

### Beoogde commits

- `test(e2e): run real authentication authorization and invoice flows`
- `ci: verify lint tests audit and prisma on pull requests`
- `docs: add deployment backup restore and environment runbook`

## Migratie- en compatibiliteitsstrategie

1. Voeg nieuwe schema's/endpoints naast bestaande contracten toe.
2. Schakel de frontend module voor module om en meet gebruik van compatibiliteitsroutes.
3. Verwijder pas daarna inline bootstrapdata en generieke kerncollectie-mutaties.
4. Gebruik expand/migrate/contract voor document- en Decimal-schemawijzigingen.
5. Maak database- en objectstoreback-ups voor iedere contractstap; migrationscripts ondersteunen dry-run en hervatten.
6. Iedere fase eindigt met lint, unit/integratie, relevante E2E en `prisma validate` voordat een commit wordt gemaakt.

## Definition-of-done-controle

- [ ] Alle bestaande functionele flows werken na frontend/API-migratie.
- [ ] Installers kunnen uitsluitend toegewezen klanten, projecten, installaties, documenten en werkbonnen benaderen.
- [ ] Bootstrap bevat geen grote datasets of documentinhoud.
- [ ] Alle kernlijsten ondersteunen server-side paginering, zoeken, filteren en sorteren.
- [ ] Upload/download is gescand, gevalideerd, geautoriseerd en object-storagegereed.
- [ ] PostgreSQL bevat voor documenten alleen metadata en storage keys.
- [ ] Alle geldbedragen gebruiken Decimal en exacte, geteste berekeningen.
- [ ] Backend is per domein gesplitst met dunne controllers.
- [ ] Alle create/update-input wordt centraal en server-side gevalideerd.
- [ ] Rate limiting en securitycaches werken over meerdere instances.
- [ ] Historische encryptiesleutels blijven leesbaar en data kan gecontroleerd worden geroteerd.
- [ ] Logging is gestructureerd en gevoelige data wordt nooit gelogd.
- [ ] Graceful shutdown sluit HTTP, Prisma, PostgreSQL/Redis en lopende requests gecontroleerd af.
- [ ] Integratie- en echte E2E-tests zijn groen; CI draait automatisch.
- [ ] Distributies bevatten geen `.env`, `.git`, secrets, `node_modules` of documentinhoud.
- [ ] Installatie-, deployment-, back-up-, restore- en environmentdocumentatie is compleet en getest.

## Rapportage per fase

Na iedere fase wordt vastgelegd:

- commit-ID en commitboodschap (of reden waarom alleen een afzonderlijke patch veilig was);
- aangepaste bestanden;
- opgelost probleem en resterend risico;
- uitgevoerde verificatie met resultaat;
- eventuele migratie- of rollbackinstructie.
