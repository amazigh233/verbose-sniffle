# Deploy als gratis demo op Render

Deze app is klaar voor Render met `render.yaml`. Render maakt een gratis Node webservice en een gratis Postgres database aan.

## Voorbereiden

1. Zet deze projectmap in een GitHub-repository.
2. Maak een wachtwoordhash voor de demo-login:

   ```bash
   source ~/.nvm/nvm.sh
   nvm use 24
   ADMIN_PASSWORD="kies-een-sterk-demo-wachtwoord" npm run hash-password
   ```

3. Kopieer de bcrypt-hash uit de output. Deel het gewone wachtwoord alleen met demo-gebruikers die toegang mogen hebben.

## Deployen

1. Ga naar https://dashboard.render.com/blueprints.
2. Kies **New Blueprint Instance**.
3. Koppel de GitHub-repository met deze app.
4. Render leest `render.yaml` en vraagt alleen nog om `ADMIN_PASSWORD_HASH`.
5. Plak daar de hash uit stap 2 en klik **Approve**.

Na de build staat de app live op de `.onrender.com` URL van de webservice.

## Gratis demo-limieten

- De gratis webservice slaapt na 15 minuten zonder verkeer en start bij het eerste bezoek weer op.
- Render's gratis Postgres database verloopt na 30 dagen. Exporteer belangrijke demo-data via de back-upfunctie voordat die periode voorbij is.
- Gebruik dit niet voor productie of echte klantdata.
