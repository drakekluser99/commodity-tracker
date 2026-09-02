@AGENTS.md

# Prezzario — contesto del progetto

(Nome visualizzato del sito: "Prezzario". Il repository GitHub resta
`commodity-tracker`, così come i nomi di file e le variabili interne.)

Progetto open source che raccoglie e mostra prezzi di materie prime globali
e carburanti al consumo, ispirato nello spirito (non nei contenuti) a
progetti di trasparenza dati pubblici come DoveVannoINostriSoldi.it:
ogni dato deve avere fonte, data, e limiti dichiarati esplicitamente.

## Stack

- Next.js 16 (App Router), TypeScript, Tailwind CSS
- Drizzle ORM + Neon Postgres (serverless)
- Deploy: Vercel, collegato a GitHub (`drakekluser99/commodity-tracker`),
  deploy automatico ad ogni push su `main`
- Identità Git di questo repo: `drakekluser99@gmail.com` (NON l'account
  di lavoro dell'utente — non cambiare mai questa configurazione)

## Architettura

- `src/lib/db/schema.ts` — 5 tabelle: `commodities`, `price_history`
  (materie prime globali), `regions`, `retail_fuel_prices` (carburanti
  per regione), `fetch_runs` (esiti dei cron di acquisizione).
  `price_history` ha un `uniqueIndex` su `(commodity_id, recorded_at)` e
  `retail_fuel_prices` uno su `(region_id, fuel_type, recorded_at)`: sono
  il bersaglio dell'upsert nei fetcher, evitano righe duplicate a ogni
  run del cron. Le colonne FK (`commodity_id`, `region_id`) sono
  `integer`, non `serial` (erano `serial`: sequence + `DEFAULT nextval()`
  inutili su una FK — corretto in migrazione `0002`). `price_history` e
  `retail_fuel_prices` hanno sia `recorded_at` (data DEL DATO) sia
  `retrieved_at` (quando il fetcher l'ha acquisito, nullable): due cose
  diverse, servono per distinguere "fonte ferma" da "fonte che non ha
  ancora pubblicato". Migrazioni applicate al DB Neon fino alla `0005`
  (1 set 2026): `retrieved_at` è `NULL` per le righe salvate prima della
  `0004` e si popola dal primo run successivo di ogni cron; `fetch_runs`
  parte vuota e si riempie allo stesso modo. `regions.name` ha un vincolo
  `UNIQUE` (migrazione `0005` — vedi "Errori noti": prima non c'era, e i
  fetcher EU/US creavano una riga regione nuova ad ogni run)
- `src/lib/db/queries.ts` — query di lettura (ultimo prezzo per ogni
  commodity/regione). NON filtrano per data (vedi "Errori noti")
- `src/lib/freshness/` — modello di freshness a 3 stati (`aggiornato` /
  `in_attesa` / `non_aggiornato`), sostituisce `commodityFreshness.ts`
  (rimosso, faceva solo 1 soglia binaria). `config.ts` ha
  `FRESHNESS_CONFIG`: una entry per `source:symbol` (Alpha Vantage — ogni
  commodity ha una cadenza diversa, 1gg per energia/3gg grace, 30gg per
  metalli-agricole/10gg grace) o per `source` da solo (`eu_weekly_oil_bulletin`,
  `eia_us` — 7gg/3gg grace, condivisa da tutta la fonte). `compute.ts` ha
  `computeFreshness` (calcolo puro, `now` iniettabile) e
  `getFreshnessConfig` (lookup `source:symbol` → `source` → **lancia un
  errore esplicito** se manca una config, mai un default silenzioso —
  coerente col bug Alpha Vantage sotto). Oggi cablato solo sulla tabella
  materie prime in `page.tsx` (via `LatestCommodityPrice.source`,
  aggiunto a `queries.ts`); i carburanti non hanno ancora un badge
  freshness (vedi "Cosa manca")
- `src/lib/commodityDisplay.ts` — conversioni di SOLA visualizzazione
  (es. cotone da cents/pound a cents/kg); il dato grezzo salvato non si
  tocca mai
- `src/lib/format.ts` — formattazione per la UI italiana: numeri con
  separatori it-IT (`13.542,82`), unità/valute abbreviate (`$/barile`,
  `$/t`, `€/L`), percentuali col segno e minus tipografico. Mappa unità
  esplicita con fallback alla stringa originale (niente perdita
  silenziosa). Usato da tabella materie prime, `FuelPriceTable`, card
  "Maggiori variazioni", `FuelImpactCalculator`. Il dato grezzo NON si
  tocca (DB/export/API invariati); l'unità originale della fonte resta
  nel `title` della cella
- `src/lib/priceHistory.ts` — trasforma le righe grezze di storico in
  serie pronte per il grafico: `groupCommodityHistory` (una serie per
  simbolo), `groupFuelHistory` (continente × carburante, media UE sui
  paesi presenti in quella data). `priceMovers` calcola la variazione %
  tra primo e ultimo punto di ogni serie (salta serie con <2 punti o
  primo valore 0) e alimenta la sezione "Maggiori variazioni" della
  homepage. Logica separata da React apposta per testarla con Node
- `src/lib/fetchers/` — un fetcher per fonte dati + gli helper di salvataggio:
  - `alphaVantage.ts` — API REST, materie prime globali, 10 simboli
    divisi in 5 batch da 2 (`COMMODITY_BATCH_1`…`_5`). Le chiamate
    dentro un batch sono SEQUENZIALI con pausa di 2s: le richieste
    parallele sforavano il rate limit gratuito della API (anche sulle
    connessioni simultanee, non solo sul conteggio). `fetchOne` logga
    con `console.error` le risposte anomale (campo `Information`/`Note`/
    `Error Message` al posto di `data`) invece di ingoiarle
  - `euOilBulletin.ts` — scarica e parsa un file XLSX della Commissione
    Europea (bollettino settimanale carburanti), parsing DIFENSIVO per
    nome colonna (non posizione), validato contro dati reali
  - `eiaUs.ts` — API REST EIA (governo USA), carburanti settimanali
  - `savePricePoints.ts` / `saveEuFuelPrices.ts` / `saveUsFuelPrices.ts`
    — persistenza. Usano `onConflictDoUpdate` sul vincolo unique: se la
    fonte ripropone la stessa data aggiornano il prezzo, non duplicano.
    Valorizzano `retrieved_at` con un timestamp unico per run (aggiornato
    anche sul re-fetch dello stesso dato). `saveEuFuelPrices.ts` /
    `saveUsFuelPrices.ts` inseriscono anche in `regions` con
    `onConflictDoNothing({ target: regions.name })` — target esplicito,
    vedi "Errori noti" sul vincolo `UNIQUE` mancante
  - `fetchRunLog.ts` — `startFetchRun` / `finishFetchRun`: registrano
    l'esito di ogni run in `fetch_runs`. Regola: il logging NON fa mai
    fallire il fetch (try/catch interno; `startFetchRun` torna `null` se
    il DB è giù, `finishFetchRun` no-op su `null`)
- `src/app/api/cron/*/route.ts` — 7 route protette da `CRON_SECRET`
  (header `Authorization: Bearer`), schedulate in `vercel.json`:
  `fetch-market-prices-1`…`-5` (materie prime, ogni batch a un'ora
  diversa: 06/08/10/12/14 UTC — su Hobby i cron hanno precisione
  oraria ±59min, quindi vanno distanziati di ore non di minuti),
  `fetch-eu-fuel-prices` (giovedì), `fetch-us-fuel-prices` (lunedì).
  Il limite Hobby è 100 cron job/progetto, uno al giorno ciascuno.
  Ogni route (via `runMarketPriceCron` o direttamente) apre e chiude un
  record in `fetch_runs`. `ok: true` = "run finita senza eccezioni", NON
  "tutto salvato": `points_saved` sotto l'atteso (es. rate limit Alpha
  Vantage a HTTP 200) è il segnale da leggere a valle
- `src/app/api/data/route.ts` — endpoint pubblico `GET /api/data`: JSON
  con gli ultimi prezzi (stessi dati della homepage, da `queries.ts`).
  CORS aperto (`Access-Control-Allow-Origin: *`) + handler `OPTIONS`
  esplicito per il preflight (Next ne genera uno automatico ma senza gli
  header CORS). Valori GREZZI, nessuna conversione di visualizzazione
  (cotone in cents/pound). `force-dynamic`, nessuna cache
- `src/app/page.tsx` — homepage: dashboard con sezione "Maggiori
  variazioni" (in cima, senza numero d'indice: top 5 scostamenti da
  `priceMovers`, materie prime 90gg + carburanti 30gg con la finestra
  dichiarata per riga; ruggine = in salita, verde = in discesa) — copre
  nella sostanza il punto 15 del brief ("cosa è cambiato"), ma è una
  classifica dei 5 maggiori scostamenti assoluti tra TUTTE le serie, non
  una frase narrativa per singola voce: non garantisce che un indicatore
  specifico (es. Brent) compaia se non è tra i 5 (verificato 1 set 2026).
  Poi mappa Europa, calcolatore d'impatto, tabelle materie prime/carburanti. Ogni
  tabella ha i pulsanti "Scarica CSV/JSON" (`DownloadDataButtons`). Nav
  header = "tab bar" connessa (contenitore unico + `border-l` tra le
  voci). Contenuto a `max-w-7xl` (1280px). Footer piatto (bordo
  superiore, niente `rounded-t-*` né gradiente decorativo), divisori
  `border-l` tra le colonne (solo `lg`); colonna "Progetto" con
  Metodologia + Glossario. Tabella materie prime: badge a 3 stati nella
  colonna Data (da `src/lib/freshness/`) — nessun badge se `aggiornato`,
  `system-accent-wait` (ambra/ocra) se `in_attesa`, `system-accent-down`
  (ruggine, invariato) se `non_aggiornato`. `LinkedinGlyph` è una SVG
  inline (lucide non ha icone brand). Footer, colonna "Progetto": il link
  "Codice sorgente" (1 set 2026) riusa `Code2` di lucide — già usato per
  lo stesso `GITHUB_URL` nell'header — invece di una SVG brand dedicata,
  per coerenza col fatto che l'header stesso non tenta un logo GitHub
  reale (non esiste in lucide 1.34.0, vedi "Errori noti").

  **Header (1 set 2026, brief punti 17+25)**: "Prezzario" è ora il
  wordmark visivo dominante — icona `ProvenanceStamp` 36px + testo
  `text-4xl sm:text-5xl font-bold text-system-ink`, con la tagline
  "Progetto open source" sotto (`ml-[46px]`, valore tarato a video per
  cadere sotto la "P" del wordmark — non deducibile a mente da
  icona+gap, va riverificato a video se cambiano dimensioni/font).
  L'eyebrow piccolo che prima portava "Prezzario · Progetto open source"
  è sparito, assorbito nel wordmark (tenerlo insieme al wordmark grande
  avrebbe duplicato il nome due volte). L'h1 esistente ("Prezzi di
  materie prime e carburanti") resta l'elemento semantico h1 — per
  SEO/accessibilità: è il testo che descrive il CONTENUTO della pagina,
  il nome del prodotto da solo non porta segnale tematico — solo
  ristilizzato a sottotitolo (`text-lg sm:text-xl font-medium`). Sotto,
  la fascia sintetica a 4 valori (array `headerStats`, variabile locale
  in `Home()`) sostituisce il vecchio `StatusLabel` a valore singolo:
  Brent (da `commodityRows`, riga con `symbol === "BRENT"`), benzina e
  diesel media UE (`europeAverage.petrol`/`.diesel` — già calcolate per
  `EuropeFuelMap`/`FuelImpactCalculator`, nessuna nuova query), ultimo
  dato (`lastUpdated`, invariato). `StatusLabel` (pallino STATICO —
  niente animazione, i dati non sono uno stream) viene riusato 4 volte
  in serie invece di un componente nuovo, con lo stesso pattern di
  divisori `border-l` già visto nel footer: attivo solo da `lg` in su,
  sotto è `grid grid-cols-2` (un `border-l` cadrebbe a metà riga quando
  le tile vanno a capo — stesso motivo già documentato per il footer).
  Fallback `"n/d"` per singola tile se un valore manca (fonte non ancora
  pubblicata), mai l'omissione della tile: la griglia resta stabile a 4
  colonne
- `src/app/metodologia/page.tsx` — pagina trasparenza (fonti, limiti,
  frequenza aggiornamento, licenza MIT). Spiega anche il badge "non
  aggiornato" e documenta l'API pubblica `/api/data` (sezione 05, con
  esempio di risposta). **NON ancora aggiornata (1 set 2026) al modello
  di freshness a 3 stati**: descrive solo il badge binario di prima,
  non menziona lo stato `in_attesa` (`system-accent-wait`)
- `src/app/glossario/page.tsx` — pagina FAQ/glossario (WTI vs Brent,
  Weekly Oil Bulletin, EIA, cadenza giornaliera vs mensile, badge "non
  aggiornato" → rimanda a metodologia). Stesso pattern di
  `metodologia/page.tsx` (helper `Section`, header "torna alla dashboard").
  Stessa nota: prosa non aggiornata al modello a 3 stati
- `src/components/EuropeFuelMap.tsx` — mappa interattiva (react-simple-maps,
  atlante 50m — NON usare 110m, omette paesi piccoli come Malta/Lussemburgo).
  Inquadratura stretta sull'Europa con dati (`rotate: [-13,-50]`,
  `scale: 900`, viewBox 800×490): riduce il grigio a est. Cipro e Malta
  finiscono ai bordi sud-est. Scala colore divergente centrata sulla
  media UE (`euAveragePetrol`, 1 set 2026), non più rampa monocroma
  min/max — scarto firmato `(prezzo - media) /
  (max - min)`, clampato con fattore `*2`, verde (`system-accent`) sotto
  media / ruggine (`system-accent-down`) sopra, centro neutro
  `system-border` (NON `system-panel`, troppo simile al fill "nessun
  dato" `#eef0f3`). Box fissi "più economico/più caro" RIMOSSI (erano
  sovrapposti alla cartografia); sostituiti da una riga sotto la mappa
  `MINIMO | MEDIA UE | MASSIMO`. Il tooltip hover mostra comunque lo
  scostamento testuale (`± millesimi vs media UE`) — il colore non è
  l'unico veicolo dell'informazione. Header doc in testa al file (1 set
  2026, audit design system) spiega la formula della scala divergente
  direttamente nel codice, non solo qui
- `src/components/FuelImpactCalculator.tsx` — calcolatore costo
  pieno/trasporti, EU vs USA, senza conversione EUR/USD (valute
  originali fianco a fianco). Header doc in testa al file (1 set 2026,
  audit design system) — prima ne era privo
- `src/components/FuelPriceTable.tsx` — tabella carburanti con ricerca
  live e anteprima compressa (metà paesi più economici, metà più cari;
  ordinamento per prezzo medio benzina+diesel crescente). Header doc
  esistente ampliato (1 set 2026, audit design system) per coprire anche
  ricerca/ordinamento/modalità di visualizzazione, non solo il "perché"
  dell'anteprima
- `src/components/MobileNav.tsx` — menu hamburger mobile. Prop `items`
  (ancore alla dashboard, con icona) e `pageLinks` (link a pagine —
  Metodologia, Glossario — resi come `next/link`, senza icona). Stesso
  trattamento "tab bar" connessa del menu desktop, in verticale
- `src/components/DownloadDataButtons.tsx` — pulsanti "Scarica CSV/JSON"
  per una tabella. Costruisce il file nel browser (Blob + object URL),
  nessun endpoint dedicato. CSV con escaping RFC 4180 (campo quotato solo
  se contiene `,`/`"`/a-capo, virgolette raddoppiate). Usato dalla
  tabella materie prime in `page.tsx` e da `FuelPriceTable`
- `src/components/PriceHistoryChart.tsx` — grafico storico con selettore
  a chip (una serie alla volta — unità/valute incompatibili tra serie,
  vedi commento nel file). `AreaChart`/`Area` di recharts (1 set 2026,
  era `LineChart`/`Line`), `type="monotone"` invariato: sotto la linea
  c'è una `<linearGradient>` che sfuma da `system-accent` (opacità 0.25)
  a trasparente. L'`id` del gradiente viene da `useId()`, NON un id
  fisso in stringa — la homepage monta due istanze insieme (materie
  prime + carburanti) e un id fisso in `<defs>` farebbe collidere i due
  `<linearGradient>` nello stesso DOM (verificato: senza `useId()` i due
  `url(#id)` puntano entrambi alla prima `<defs>` trovata)
- `CONTRIBUTING.md` / `.github/ISSUE_TEMPLATE/segnala-dato-errato.yml`
  (1 set 2026) — convenzioni per contributor esterni (fonte/data/limiti
  sempre dichiarati, niente fallimenti silenziosi, vincoli `UNIQUE`
  prima di `onConflictDo*`) + template issue strutturato per segnalare
  un dato che non corrisponde alla fonte ufficiale, senza scrivere
  codice. `package.json` ha ora anche `description`/`repository`/
  `homepage`/`license` (mancavano; `private: true` resta invariato)

## Convenzioni di stile del codice

- Commenti in italiano, spiegano il "perché" non il "cosa" (il progetto
  serve anche per imparare, chi legge il codice vuole capire le scelte)
- Font: `body` usa Geist Sans (`var(--font-geist-sans)`, caricato in
  `layout.tsx`); `font-mono` (Geist Mono) per prezzi, date, unità, codici.
  NON rimettere `Arial` letterale sul body (vinceva su Geist).
- Il sito è **light-only** per scelta: `globals.css` ha `color-scheme:
  light` e nessun blocco `prefers-color-scheme: dark`. Non aggiungere un
  dark mode parziale (ribaltare `--background` senza ridefinire i token
  `system-*` lascia body scuro e pannelli chiari).
- Formattazione di numeri/unità/valute nella UI: sempre via
  `src/lib/format.ts` (separatori it-IT). Mai `toFixed` col punto nei
  componenti. Il dato grezzo (DB, `/api/data`, export CSV/JSON) NON si
  formatta; l'unità originale della fonte va tenuta nel `title`.
- Palette colori: token `system-*` definiti in `src/app/globals.css` dentro
  `@theme` (Tailwind v4, non `tailwind.config.ts`). Non scrivere più hex a
  mano nelle classi — usare sempre le utility generate:
  - `system-bg` (#fafafa) — sfondo pagina
  - `system-panel` (#f2f3f5) — sfondo pannelli secondari, PIATTO, stesso
    piano della pagina (es. hover di riga tabella)
  - `system-surface` (#ffffff, 1 set 2026) — sfondo di una card/pannello
    SOLLEVATO sopra `system-bg` (header, footer, tabelle, tooltip,
    dropdown, input di ricerca), sempre accoppiato a un bordo o un'ombra.
    Diverso da `system-panel` proprio per questo: non è piatto. Introdotto
    per dare un nome ai 15 usi ripetuti di `bg-white` sparsi nel sito
    (stesso ruolo, nessun token dedicato prima) — trovati durante l'audit
    design system sotto, migrati 1:1 (nessuna modifica visiva: bianco
    puro prima e dopo)
  - `system-ink` (#111318) — testo principale
  - `system-ink-secondary` (#5b6472) — testo secondario (paragrafi, nav)
  - `system-ink-muted` (#6b7280) — dettagli minori (text-xs, celle tabella)
  - `system-border` (#e2e4e9) — bordi standard
  - `system-border-subtle` (#eef0f3) — divisori più leggeri
  - `system-accent` (#0f6b66) — verde petrolio, invariato
  - `system-accent-down` (#b34324) — ruggine, per valori in salita
  - `system-accent-wait` (#9c8a5c) — ambra/ocra desaturata, stato
    "in_attesa" del modello di freshness a 3 stati (`src/lib/freshness/`).
    Saturazione/luminosità tarate per restare nella fascia sobria della
    palette (~26% sat, vicino a `system-ink-muted`), non un ambra
    "warning" acceso

  Eccezione voluta: i colori SVG grezzi dentro `EuropeFuelMap.tsx` (fill dei
  paesi senza dati, stroke dei confini) restano hex letterali perché sono
  attributi JS/SVG, non classi Tailwind — non vanno migrati.

  **Audit design system (1 set 2026)**: verifica manuale (grep su `src/`
  per hex/classi colore fuori palette e per spaziature arbitrarie, lettura
  dei componenti principali) — non l'esecuzione di uno strumento o una
  skill dedicata (nessuna skill con questo nome è installata in questo
  progetto). Ha prodotto il token `system-surface` sopra e ha aggiunto/
  ampliato la documentazione di intestazione di `EuropeFuelMap.tsx` e
  `FuelImpactCalculator.tsx` (mancava del tutto) e `FuelPriceTable.tsx`
  (esisteva già ma copriva solo il "perché" dell'anteprima compressa, non
  ricerca/ordinamento — vedi sotto). Nessun'altra criticità trovata:
  naming dei componenti coerente, `SystemCard`/`StatusLabel` ancora usati
  come documentato, nessuna spaziatura arbitraria oltre a quella già nota
  sul wordmark header.
- Font numeri: sempre `font-mono tabular-nums` per allineamento colonne
- Ogni sezione dati ha una nota "Fonte: ..." sotto (componente
  `SourceNote`) — non rimuoverle, è il principio cardine del progetto
- `SystemCard` (`src/components/SystemCard.tsx`) è deliberatamente
  riservato a contenuti "speciali" (oggi: solo `SourceItem` in
  `metodologia/page.tsx`, la scheda di ogni fonte dati) — verificato
  1 set 2026, un solo punto d'uso in tutto il codice. Non usarlo per
  card generiche di layout: se si diffonde perde il segnale "questo è
  un elemento particolare", che è il motivo per cui esiste

## Errori noti e già risolti (non ripeterli)

- `react-simple-maps` richiede `--legacy-peer-deps` (dichiara supporto
  solo fino a React 18, ma funziona bene con React 19) — c'è già un
  `.npmrc` con `legacy-peer-deps=true` che lo gestisce automaticamente
- **Server Component → Client Component**: mai passare funzioni (incluse
  icone lucide-react) come prop da `page.tsx` a un componente con
  `"use client"` — causa "Functions cannot be passed directly to Client
  Components" A RUNTIME (non lo cattura né `tsc` né `eslint`, solo
  visitando la pagina o con `npm run dev`). Se serve un'icona in un
  client component, definiscila lì dentro, non passarla come prop.
- **`lucide-react` (1.34.0) non ha icone di brand**: niente `Linkedin`,
  `Github`, `Twitter` ecc. (`typeof Linkedin === "undefined"`). Per un
  logo di brand serve una SVG inline — vedi `LinkedinGlyph` in
  `page.tsx` (`fill="currentColor"` per ereditare il colore del link)
- `drizzle-kit` non legge `.env.local` di default (è una convenzione
  solo di Next.js) — `drizzle.config.ts` lo carica esplicitamente con
  `dotenv`
- **Colonne FK: usare `integer`, non `serial`.** `serial` aggiunge una
  sequence e un `DEFAULT nextval()` che su una chiave esterna non
  servono e mascherano un INSERT senza valore. Inoltre `drizzle-kit
  generate` NON rileva il passaggio `serial`→`integer` (genera solo un
  `SET DATA TYPE` no-op): il `DROP DEFAULT` va aggiunto a mano alla
  migrazione (vedi `0002`)
- **Migrazioni non automatiche**: dopo aver toccato `schema.ts`,
  `npm run db:generate` crea il file SQL, `npm run db:migrate` lo applica
  al DB Neon. Il deploy su Vercel NON esegue le migrazioni. I save dei
  fetcher includono le colonne nuove nella query: se il DB è indietro
  rispetto allo schema, i cron falliscono
- Vulnerabilità dipendenze: quando `npm audit` segnala qualcosa,
  verificare se c'è un fix non-breaking prima di ignorarlo; se il fix
  richiede un downgrade breaking e il rischio non è applicabile al
  nostro uso, documentarlo nel commit invece di lasciarlo silenzioso
- **Alpha Vantage + parallelo = rate limit silenzioso**: chiamare più
  endpoint commodity in parallelo (`Promise.all`) fa tornare ad alcune
  richieste `{"Information": "..."}` con HTTP 200 al posto di `data`.
  Vanno fatte SEQUENZIALI con pausa. Il free tier è ~25 richieste/giorno
  + limite sulle connessioni simultanee. Bug originale: Aluminum/Sugar/
  Coffee mai salvate perché erano gli ultimi del batch parallelo
- **Cron su Vercel Hobby**: precisione solo oraria (±59 min) e massimo
  una esecuzione al giorno per cron. Per distanziare davvero due job
  servono ORE diverse nello `schedule`, non minuti. Espressioni
  sotto-giornaliere (`*/30 * * * *`, `0 * * * *`) fanno FALLIRE il deploy
- `getLatestCommodityPrices`/`getLatestFuelPrices` non filtrano per data:
  mostrano l'ultimo valore salvato "per sempre", anche se vecchio di
  mesi. Mitigazione PARZIALE: le materie prime hanno il badge freshness
  a 3 stati (`src/lib/freshness/`); i carburanti no. Se cambi la cadenza
  di una fonte, aggiorna anche `FRESHNESS_CONFIG` in
  `src/lib/freshness/config.ts`
- **`regions.name` senza vincolo `UNIQUE` (corretto in migrazione `0005`,
  1 set 2026).** Prima, `saveEuFuelPrices.ts`/`saveUsFuelPrices.ts`
  chiamavano `insert(regions).onConflictDoNothing()` senza un vincolo su
  cui appoggiarsi: Postgres non aveva modo di rilevare il conflitto, quindi
  INSERIVA sempre una riga regione nuova (una per ogni punto petrol/diesel
  processato, non una per country). A cascata, anche il vincolo unique su
  `retail_fuel_prices` (`region_id, fuel_type, recorded_at`) non scattava
  mai per lo stesso paese, perché `region_id` cambiava ad ogni run: ogni
  cron EU/US duplicava le righe-prezzo invece di aggiornarle. Bonificati
  81 duplicati in `regions` e 54 righe-prezzo duplicate in
  `retail_fuel_prices` (dati identici, solo `region_id`/`retrieved_at`
  diversi — verificato prezzo per prezzo prima della cancellazione). Ora
  `regions.name` ha `.unique()` in `schema.ts` e i due fetcher passano
  `onConflictDoNothing({ target: regions.name })` esplicito

## Workflow con l'utente

- L'utente alterna claude.ai (chat web, dove Claude prepara modifiche in
  un sandbox e le passa come prompt da incollare) e Claude Code (accesso
  diretto al repo locale). Quando lavori qui, hai accesso diretto: usa
  `git log --oneline` per vedere la cronologia reale invece di fidarti
  di quello che un prompt dice di aver già fatto.
- Verifica SEMPRE con `npx tsc --noEmit` e `npx eslint` prima di
  committare. Per modifiche che toccano il confine Server/Client
  Components, esegui anche `npm run dev` e visita la pagina prima del
  push (vedi errore noto sopra).
- Dopo il push, Vercel ridispiega automaticamente — non serve azione
  manuale su Vercel.

## Cosa manca / prossimi passi naturali

Direzione di fondo (brief di allineamento): Prezzario deve diventare un
"osservatorio aperto dei prezzi" — quanto costa, da dove viene il dato,
quanto è aggiornato, com'è rispetto al contesto, come sta cambiando.
Rafforzare il principio fonte/data/limiti, non diluirlo con funzioni
decorative. Escluso per ora: redesign totale, Oceania/LatAm, media UE
ponderata, import massivo storico, estrapolazioni causali.

- **Freshness a 3 stati — FATTO per le materie prime (1 set 2026),
  manca ancora per i carburanti.** `src/lib/freshness/` (config
  source/symbol-aware + calcolo con grace period) è cablato sulla
  tabella materie prime in `page.tsx`. Per estenderlo ai carburanti
  serve: aggiungere `source`/`fuelType` (o region) alle query di
  `LatestFuelPrice` (oggi non selezionano `source`, come per le
  commodity prima del fix), e wirare il badge nella tabella/mappa
  carburanti — la config `FRESHNESS_CONFIG` in `config.ts` ha già le
  entry `eu_weekly_oil_bulletin`/`eia_us` pronte, manca solo l'uso
- **Prosa metodologia/glossario da allineare al modello a 3 stati**:
  `metodologia/page.tsx` e `glossario/page.tsx` spiegano ancora solo il
  vecchio badge binario "non aggiornato", non menzionano `in_attesa` —
  scollamento introdotto dal fix di freshness (1 set 2026), non ancora
  richiuso
- **Pagina pubblica "Stato dei dati"**: modello dati pronto
  (`fetch_runs`), pagina da costruire (ultimo tentativo / ultimo
  successo / ultimo dato / errore recente per fonte)
- **Registro correzioni**: quando una fonte ripubblica un valore
  DIVERSO per la stessa data, oggi l'`onConflictDoUpdate` lo sovrascrive
  e la vecchia versione sparisce. Serve un upsert CONDIZIONALE (nuova
  riga solo se il valore differisce dall'ultimo salvato) — richiede di
  toccare il vincolo unique `(commodity_id, recorded_at)`, il tie-break
  di `getLatest*` e il dedup nello storico: va progettato a parte, NON
  con un insert puro (reintrodurrebbe il bug dei duplicati)
- **Localizzazione nomi paese** in italiano (oggi "Germany", "Poland"
  dal bollettino). Attenzione: `EuropeFuelMap` fa il join su
  `geo.properties.name` (inglese), serve un `displayName` separato dal
  nome-chiave
- **Calcolatore d'impatto — manca la dimensione temporale/comparativa**
  (brief punto 14, verificato 1 set 2026): `FuelImpactCalculator.tsx`
  mostra solo prezzi ATTUALI (benzina/diesel, costo pieno auto, costo
  carburante/100km camion) per EU vs USA. Nessun confronto "vs mese
  scorso", nessuna deviazione dalla media (quella esiste solo nel
  tooltip della mappa, `EuropeFuelMap.tsx`, non nel calcolatore)
- **Gerarchia fonti non visibile** (brief punto 12, verificato
  1 set 2026): `SourceNote` tratta Alpha Vantage (intermediario
  commerciale) e Commissione Europea/EIA (enti istituzionali primari)
  con lo stesso identico stile in tutti e 4 i punti d'uso in `page.tsx`.
  Stesso in `metodologia/page.tsx`: le 3 fonti sono nello stesso
  `SourceItem`, nessun raggruppamento/badge — solo un accenno nella
  prosa delle descrizioni, non una gerarchia strutturata
- **API v1 / permalink / "Carta del prezzo" / widget / citazioni** —
  visione a lungo termine del brief, tutto dipendente da metadati e
  freshness stabili. Non prima. `/api/data` attuale è provvisorio
- **MIMIT** (prezzi distributori italiani): dataset enorme, richiede un
  modello di regione GERARCHICO (oggi `regions` è piatto) + retention +
  tabelle dedicate. Progetto separato con la sua fase di design
- Il grafico storico prezzi esiste già (`PriceHistoryChart`, finestre
  90gg materie prime / 30gg carburanti). Manca semmai una finestra più
  lunga ora che `price_history` accumula più mesi
- **Prossimo checkpoint (giovedì 3 set 2026)**: verificare in `fetch_runs`
  il primo run automatico del cron `fetch-eu-fuel-prices` dopo le
  modifiche di oggi (wordmark + fascia sintetica, commit `270b23c` e
  `f266eb4`) — controllare che `ok: true` e che i valori di benzina/
  diesel UE nella fascia sintetica si aggiornino di conseguenza

## Skill: vercel-react-best-practices

Skill installata in .claude/skills/vercel-react-best-practices/.
Consultare per: eliminazione di waterfall async, ottimizzazione bundle
size (dynamic import, barrel imports), performance server-side (React.cache,
parallel fetching), re-render inutili, pattern di rendering.
Guida completa in AGENTS.md, regole singole in rules/*.md.
