# Productie-uitrol op Render

`render.yaml` maakt vier betaalde productieonderdelen in Frankfurt aan:

- de Node-webservice;
- een afgeschermde Render Postgres-database zonder publieke IP-toegang;
- een private ClamAV-service voor contractscans.
- een nachtelijke back-upcronjob voor versleutelde S3-exports.

Het werknemersportaal blijft na de eerste deployment bewust uitgeschakeld.

## 1. Voorbereiden

1. Gebruik een Render **Pro workspace** en koppel deze repository als Blueprint.
2. Genereer een sterk beheerderswachtwoord en maak lokaal de bcrypt-hash:

   ```bash
   source ~/.nvm/nvm.sh
   nvm use 24
   ADMIN_PASSWORD="een-uniek-wachtwoord-uit-een-wachtwoordmanager" npm run hash-password
   ```

3. Vul de hash bij `ADMIN_PASSWORD_HASH` in. Render genereert `SESSION_SECRET` en de 256-bit `HR_ENCRYPTION_KEY` zelf.
4. Exporteer en bewaar de waarde van `HR_ENCRYPTION_KEY` direct in de bedrijfswachtwoordkluis. Zonder deze sleutel zijn versleutelde HR-gegevens niet herstelbaar.

## 2. Eerste deployment en controle

De pre-deploystap voert Prisma-migraties uit voordat de nieuwe versie verkeer ontvangt. Controleer daarna:

```text
GET /api/health                         -> 200
GET /medewerkers/ zonder login          -> 401
GET /medewerkers/ als installateur      -> 403
```

Controleer in Render dat:

- Postgres point-in-time recovery actief is;
- de database een lege externe IP allowlist heeft;
- `climature-clamav` alleen als private service bestaat;
- er geen gevoelige waarden in buildlogs staan;
- de webservice via HTTPS bereikbaar is.

## 3. Back-up en herstel

1. Maak vooraf een private S3-bucket met versioning, block-public-access en een lifecycle van 30 dagen.
2. Vul tijdens de Blueprint-installatie `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` en `HR_BACKUP_BUCKET` in voor een IAM-account dat uitsluitend naar die bucketprefix mag schrijven. De meegeleverde `climature-nightly-backup` cronjob draait dagelijks om 02:00 UTC en uploadt een met AES-256 versleutelde `pg_dump`.
3. Maak vóór activering een logische back-up én een PITR-herstel naar een tijdelijke database.
4. Verbind een tijdelijke testservice met de herstelde database en controleer login, MFA en ontsleuteling van een fictief contract.
5. Documenteer datum, uitvoerder en resultaat. Herhaal deze hersteltest ieder kwartaal.

De CRM JSON-export bevat opzettelijk geen werknemers, privévelden, contracten, HR-notities of werknemer-ID’s.

## 4. HR-portaal activeren

1. Zet eerst één fictieve werknemer en fictief PDF-contract klaar.
2. Wijzig `HR_PORTAL_ENABLED` naar `true` en deploy opnieuw.
3. Log als beheerder in, open **Werknemersportaal** en stel de authenticator in.
4. Bewaar de tien eenmalige herstelcodes offline in de wachtwoordkluis.
5. Upload het fictieve contract en controleer dat de status **Veilig** wordt. Een scannerfout moet **Quarantaine** opleveren en downloaden blokkeren.
6. Controleer dat een installateursaccount zowel de pagina als alle `/api/hr/*`-routes wordt geweigerd.
7. Verwijder de fictieve gegevens en voer pas daarna echte personeelsgegevens in.

## 5. Beheer

- Roteer het beheerderswachtwoord direct bij vermoeden van misbruik.
- Deactiveer vertrokken gebruikersaccounts onmiddellijk; actieve sessies worden bij het volgende verzoek ingetrokken.
- Roteer de HR-sleutel alleen via een gecontroleerde herencryptiemigratie. Alleen `HR_KEY_VERSION` wijzigen is niet voldoende.
- Controleer maandelijks dependency-audits, mislukte loginpogingen, quarantaines en HR-auditregels.
- Bewaar geen BSN, salaris-, bank-, medische of identiteitsgegevens in dit portaal.
