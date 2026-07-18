# Installatie, deployment, back-up en herstel

Laatst bijgewerkt: 18 juli 2026.

## Lokale installatie

Vereisten: Node.js 24 LTS, PostgreSQL 16+, Redis 7+ en ClamAV. Kopieer `.env.example` naar `.env`, genereer een sessiesecret en bcrypt-hash, en voer uit:

```bash
npm ci
npm run prisma:deploy
npm run seed
npm run dev
```

`ALLOW_UNSCANNED_HR_FILES=true` is uitsluitend voor lokale tests. Productie weigert deze instelling.

## Vereiste productievariabelen

| Variabele | Doel |
|---|---|
| `DATABASE_URL` | PostgreSQL TLS-connection string |
| `REDIS_URL` | Gedeelde rate limits en auth-cache |
| `SESSION_SECRET` | Minimaal 32 willekeurige tekens |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` | Eenmalige bootstrapadmin bij lege gebruikerstabel |
| `CLAMAV_HOST`, `CLAMAV_PORT` | Verplichte private malwarescanner |
| `OBJECT_STORAGE_PROVIDER` | `s3` voor multi-instance; `local` alleen met duurzaam volume |
| `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_REGION` | Vereist bij S3 |
| `OBJECT_STORAGE_ENDPOINT` | Optioneel voor MinIO/andere S3-compatible provider |
| `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY` | Alleen wanneer workload identity/instance role niet wordt gebruikt |
| `HR_ENCRYPTION_KEYS`, `HR_KEY_VERSION` | JSON-keyring en actieve versie voor HR/MFA |
| `PROJECT_ENCRYPTION_KEYS`, `PROJECT_KEY_VERSION` | JSON-keyring en actieve versie voor projectgeheimen |

Voorbeeld van een keyring (waarden horen in de secret store, niet in bestanden):

```text
HR_ENCRYPTION_KEYS={"v1":"<historische-32-byte-key>","v2":"<actieve-32-byte-key>"}
HR_KEY_VERSION=v2
```

## Deployment

1. Bouw exact vanuit `package-lock.json` met Node 24.
2. Voer `npm run prisma:deploy` uit vóór nieuwe applicatiecode verkeer krijgt.
3. Voer bij oude database-BLOBs eerst de gedocumenteerde expand/migrate/contract-stappen uit (`documents:migrate-storage` en `documents:migrate-hr-storage`). Nieuwe installaties krijgen alle migraties direct.
4. Start met `npm start` en wacht op `/api/health`; die controleert PostgreSQL, Redis en object storage.
5. Rol instances gefaseerd uit. Gebruik dezelfde secrets en object-storagebucket op elke instance.
6. Controleer JSON-logs op `server.started`, 5xx-categorieën en rate-limitpieken.

## Sleutelrotatie

1. Voeg een nieuwe versie toe aan de keyring; verwijder historische sleutels nog niet.
2. Zet `HR_KEY_VERSION` of `PROJECT_KEY_VERSION` op de nieuwe versie en deploy.
3. Draai `npm run keys:rotate -- --dry-run`, daarna `npm run keys:rotate`.
4. Test MFA, privédata, een contractdownload en kwalificatiebewijs.
5. Verwijder de oude sleutel pas na een succesvolle back-up én restoretest en nadat geen records de versie meer gebruiken.

## Back-up

Een herstelbare set bestaat uit twee delen met hetzelfde tijdstip:

- een PostgreSQL custom-format dump;
- alle objecten uit object storage.

`scripts/backup-to-s3.sh` uploadt beide naar een private, versioned back-upbucket. Bij lokale opslag moet `OBJECT_STORAGE_ROOT` in de back-upjob zijn gemount. Bewaar keyrings afzonderlijk in een wachtwoordkluis; zonder historische encryptiesleutels blijven HR-objecten onleesbaar.

## Hersteltest

1. Herstel de dump in een nieuwe, afgeschermde PostgreSQL-database met `pg_restore --clean --if-exists --no-owner`.
2. Herstel de objectset naar een nieuwe bucket/prefix of leeg duurzaam volume.
3. Configureer een tijdelijke app met de herstelde database, objectlocatie, Redis en volledige historische keyrings.
4. Controleer login, counters, gepagineerde aantallen, één klantdocument, offerte-afbeelding, servicebijlage, HR-contract en kwalificatiebewijs.
5. Controleer checksums en auditlogs en leg RPO, RTO, back-up-ID en uitvoerder vast.
6. Herhaal minimaal elk kwartaal en na een wijziging aan opslag, encryptie of migraties.

De zakelijke JSON-export is alleen voor functionele overdracht. Die is geen disaster-recoveryback-up.

## Distributiehygiëne

`.gitignore` en `.dockerignore` sluiten `.env`, `.git`, `node_modules`, lokale objecten, testsoutput en logs uit. Bouwcontainers moeten expliciete `COPY`-paden gebruiken; kopieer nooit de volledige werkdirectory inclusief verborgen bestanden vanuit een ongecontroleerde context.
