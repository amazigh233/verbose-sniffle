# Wasco-koppeling

Het Wasco-portaal werkt standaard in een veilige demomodus. Medewerkers met de rol `admin` of `execution` kunnen producten zoeken, een bestellijst opbouwen, deze als CSV exporteren en een conceptbestelling maken. In deze modus wordt nooit iets naar Wasco verzonden.

## Officiële aansluitroute

Wasco beschrijft voor bedrijfssoftware vooral MessageService, gebaseerd op de DICO-standaard. Daarmee kunnen onder meer orders, orderbevestigingen, pakbonnen en facturen worden uitgewisseld. Wasco biedt daarnaast Webselectie en artikel-/conditiebestanden. Vraag de technische aansluitgegevens en activatie aan via [Wasco MessageService](https://www.wasco.nl/content/messageservice) of `etim@wasco.nl`.

Gebruik geen persoonlijk Wasco-webshopwachtwoord in Climature. Laat Wasco een zakelijke systeemkoppeling, API-token of DICO-adapter verstrekken.

## Configuratie

De server verwacht een genormaliseerde JSON-interface. Een rechtstreekse Wasco API kan hierop worden aangesloten; bij MessageService/DICO kan een kleine vertaaladapter dezelfde interface aanbieden.

```env
WASCO_API_BASE_URL="https://goedgekeurde-adapter.example/api"
WASCO_API_KEY="secret-uit-de-secret-manager"
WASCO_CUSTOMER_NUMBER="uw-wasco-klantnummer"
WASCO_ORDERS_ENABLED="false"
WASCO_TIMEOUT_MS="8000"
```

Verwachte upstream-routes:

- `GET /products?q=...&category=...&limit=...`
- `GET /availability?skus=ARTIKEL1,ARTIKEL2`
- `POST /orders`

Climature normaliseert productvelden zoals `articleNumber`, `description`, `netPrice` en `availableQuantity`. API-sleutels blijven uitsluitend op de server.

## Veilig live zetten

1. Vraag Wasco om MessageService/API-documentatie, testgegevens en een testomgeving.
2. Laat zoeken, klantprijzen, vestigingsvoorraad en levertermijnen tegen de testomgeving valideren.
3. Plaats een testorder met `WASCO_ORDERS_ENABLED=false`; controleer eerst de CSV/conceptinhoud.
4. Laat Wasco de volledige berichtenstroom accepteren, inclusief orderbevestiging en foutscenario's.
5. Zet pas daarna `WASCO_ORDERS_ENABLED=true` en herstart de applicatie.

De API-routes in Climature zijn afgeschermd voor `admin` en `execution`, gebruiken de bestaande sessie- en CSRF-beveiliging en loggen alleen orderreferentie/status, nooit de API-sleutel.
