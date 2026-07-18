# Uitgevoerde verkoopklaar-fasen

Dit log hoort bij `IMPLEMENTATION_PLAN.md`. Bestaande productfunctionaliteit is behouden; zichtbare gedragswijzigingen staan per fase vermeld.

## Fase 1 — autorisatie en datavolume

- Bestanden: `src/middleware/authorization.js`, `src/server.js`, `src/data.js`, `src/shared/pagination.js`, `assets/js/storage.js`, `tests/backend.test.js`.
- Opgelost: installer-IDOR, server-side scopes, minimale bootstrap en allowlisted paginering/zoeken/filteren/sorteren.
- Beveiligingsimpact: een installateur krijgt alleen klanten, documenten, projecten, installaties en werkbonnen uit de eigen toewijzingsketen.
- Tests: twee monteurs/twee klanten en directe document-/werkbonpogingen; responsevorm en bootstrapinhoud.
- Gedragswijziging: domeindata wordt na login via losse endpoints geladen; bootstrap bevat geen collecties meer.
- Restrisico: oude `/api/collections/*`-compatibiliteitsroutes blijven tijdelijk bestaan voor de browserclient en moeten bij een toekomstige major API-versie verdwijnen.

## Fase 2 — documenten en sleutelrotatie

- Bestanden: `src/infrastructure/object-storage/*`, HR/service/data-modules, Prisma-migraties `20260718180000` t/m `20260718193000`, migratie- en rotatiescripts.
- Opgelost: database-BLOBs/base64, onveilige downloadcontext en niet-roteerbare encryptie.
- Beveiligingsimpact: alle uploads worden op type/extensie/magic/omvang gecontroleerd, verplicht gescand en met checksum opgeslagen; HR-bestanden zijn AES-256-GCM-enveloppen met sleutelversie.
- Tests: upload/download/checksum, verboden installerdownload, HR-versleuteling en historische sleuteldecryptie.
- Gedragswijziging: documentupload gebruikt multipart en object storage; generieke base64-upload wordt geweigerd.
- Restrisico: multer buffert maximaal 8 MB in geheugen; streaming multipart kan later nodig zijn bij veel gelijktijdige grote uploads.

## Fase 3 — financiële precisie

- Bestanden: `prisma/schema.prisma`, migratie `20260718200000_use_decimal_money`, `src/numbers.js`, `src/data.js`, `src/service-data.js`, tests.
- Opgelost: binaire Float-afwijkingen in geldbedragen.
- Beveiligingsimpact: server blijft leidend en gemanipuleerde frontendtotalen worden opnieuw berekend.
- Tests: half-upgrenzen, btw, korting, sommen en offerte-naar-factuur.
- Gedragswijziging: bestaande waarden zijn tijdens migratie commercieel op centen afgerond; API houdt numerieke JSON voor clientcompatibiliteit.
- Restrisico: adviesaannames en technische meetwaarden blijven bewust Float/JSON omdat dit geen boekhoudkundige bedragen zijn.

## Fase 4 — validatie, schaalbaarheid en operability

- Bestanden: `src/shared/validation.js`, `src/modules/*`, Redis-coördinatie, logger, config, indexmigratie, CI en operationele documentatie.
- Opgelost: inconsistente invoergrenzen, proceslokale securitycounters, monolithische routes voor projecten, service, klanten, offertes, facturen en installaties, en ongestructureerde logging.
- Beveiligingsimpact: Zod-fouten zijn consistente 4xx zonder internals; productie vereist Redis; logs redigeren geheimen en bevatten request-ID, user-ID, route, status, tijd en foutcategorie.
- Tests: 52 integratie/unit-tests, 22 Playwrighttests waarvan echte login/bootstrap/paginering ongemockt; CI gebruikt echte PostgreSQL en Redis.
- Gedragswijziging: productie start niet zonder Redis en ClamAV; `/api/health` controleert PostgreSQL plus Redis.
- Restrisico: verdere opsplitsing van de oude CRM-datalaag naar afzonderlijke repositories is onderhoudswerk, maar de routegrenzen voor projecten, service, klanten, offertes, facturen en installaties zijn modulair en nieuwe code hoort het modulepatroon te volgen.
