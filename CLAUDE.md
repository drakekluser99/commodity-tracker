@AGENTS.md

# Mercuriale — contesto del progetto

(Nome visualizzato del sito: "Mercuriale" — dal nome storico italiano del
listino ufficiale dei prezzi all'ingrosso pubblicato dalle Camere di
Commercio. Rinominato il 3 set 2026, prima si chiamava "Prezzario": quel
nome è un termine tecnico già occupato — in Italia il *prezzario* è
l'elenco dei prezzi unitari per le opere pubbliche che ogni Regione
pubblica per legge — quindi prometteva un contenuto diverso da quello del
sito e metteva la ricerca organica in competizione con la pubblica
amministrazione. Il repository GitHub resta `commodity-tracker`, così come
i nomi di file e le variabili interne.)

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
  inutili su una FK — corretto in migrazione `0002`). `retail_fuel_prices` ha anche
  `price_net` (3 set 2026): il prezzo AL NETTO delle imposte, dalla
  Commissione — la differenza `price - price_net` è il carico fiscale.
  Nullable e senza default: uno zero avrebbe fatto leggere ogni riga
  precedente come "100% tasse", e dove la fonte non pubblica il netto il
  carico fiscale NON si calcola, non si stima per differenza da una media.
  Solo `eu_weekly_oil_bulletin` la valorizza, l'EIA dà il prezzo alla pompa
  e basta. `price_history` e
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
  - `euOilBulletinHistory.ts` (3 set 2026) — **il fetcher UE in uso dal
    cron del giovedì.** Scarica il file STORICO della Commissione ("Price
    developments 2005 onwards", ~4,3 MB): tutte le settimane dal 2005 e un
    secondo foglio coi prezzi AL NETTO delle imposte. Un file solo, un
    parser solo, e la scomposizione fiscale che si aggiorna da sé ogni
    settimana.
    Il parsing è per **chiave esatta** e non per somiglianza: la riga 1 di
    ogni foglio contiene chiavi macchina (`IT_price_with_tax_euro95`), così
    se la Commissione riordina le colonne il parser regge, e se ne rinomina
    una fallisce dicendo QUALE manca — non "12 colonne su 54", da cui non
    si diagnostica niente.
    Due fatti verificati sui dati veri e annotati nel file: i prezzi sono
    già in EURO e non in valuta nazionale (la Danimarca a 2524 per 1000 l è
    plausibile in euro; in corone sarebbe un decimo del reale), e la riga
    più recente coincide con quanto il bollettino settimanale aveva già
    salvato — il cambio di fonte non muove i numeri già in pagina.
    Trappole del formato, tutte osservate: colonne `CTR` di separazione,
    `XX_exchange_rate` intercalate SOLO per i 7 paesi fuori dall'euro,
    colonne `UK_*` presenti nell'intestazione ma senza dati (le righe
    recenti sono più corte dell'header — un parser posizionale ci
    sbatterebbe), righe di disclaimer in coda scartate perché la colonna 1
    non contiene una data, date in ordine DECRESCENTE.
    Il cron chiede `latestOnly`: senza, ogni giovedì riscriverebbe ~56.000
    righe per aggiornarne 54. `maxDuration` della rotta è passato da 10 a
    **60 s** — il file pesa 4,3 MB ed ExcelJS lo apre per intero (7 fogli,
    uno da 12.000 righe). Se la durata reale in `fetch_runs` si avvicina al
    limite, la strada è leggere in streaming invece di caricare in memoria.
    Verificato prima di spedirlo: 12 controlli contro una ricostruzione
    fedele del layout, compresi i valori reali dell'Italia e lo scatto
    della guardia quando una colonna sparisce
  - `euOilBulletin.ts` — **NON più collegato al cron** (3 set 2026). Resta
    perché lo usa `scripts/inspect-eu-bulletin.ts` ed è un parser validato
    che vale come ripiego. Non ricollegarlo senza motivo: perderebbe il
    prezzo netto, e con quello la scomposizione fiscale. Scarica e parsa il
    file XLSX settimanale della Commissione, parsing DIFENSIVO per nome
    colonna (non posizione), validato contro dati reali
  - `eiaUs.ts` — API REST EIA (governo USA), carburanti settimanali
  - `savePricePoints.ts` / `saveEuFuelPrices.ts` / `saveUsFuelPrices.ts`
    — persistenza. Usano `onConflictDoUpdate` sul vincolo unique: se la
    fonte ripropone la stessa data aggiornano il prezzo, non duplicano.
    Valorizzano `retrieved_at` con un timestamp unico per run (aggiornato
    anche sul re-fetch dello stesso dato). `saveEuFuelPrices.ts` /
    `saveUsFuelPrices.ts` inseriscono anche in `regions` con
    `onConflictDoNothing({ target: regions.name })` — target esplicito,
    vedi "Errori noti" sul vincolo `UNIQUE` mancante
  - `savePricePointsBulk` (`savePricePoints.ts`) / `saveRetailFuelPricesBulk`
    (`saveRetailFuelBulk.ts`) — scritture massive per `scripts/backfill.ts`,
    ACCANTO alle funzioni del cron, non al posto loro. Il driver è `neon-http`:
    ogni query è una richiesta HTTP, quindi due query per punto sono perfette
    su 2 punti e inservibili su 10.000. Qui: una query per l'anagrafica, poi
    `INSERT` a blocchi di 500 righe. La deduplica su `(commodity, data)` prima
    di scrivere NON è opzionale: due righe uguali nello stesso statement fanno
    fallire l'intero blocco con "ON CONFLICT DO UPDATE command cannot affect
    row a second time". `excluded.price` nel `set` perché in un INSERT
    multi-riga ogni riga ha un prezzo diverso: un valore costante li appiattirebbe
    tutti sullo stesso numero
  - `fetchRunLog.ts` — `startFetchRun` / `finishFetchRun`: registrano
    l'esito di ogni run in `fetch_runs`. Regola: il logging NON fa mai
    fallire il fetch (try/catch interno; `startFetchRun` torna `null` se
    il DB è giù, `finishFetchRun` no-op su `null`)
- `src/lib/cronAuth.ts` — `isAuthorizedCronRequest(request)`, l'unico
  punto in cui si verifica `CRON_SECRET` (3 set 2026). Prima il confronto
  era in linea in ogni route: **nega l'accesso se il segreto manca**
  (prima `Bearer ${undefined}` diventava la stringa "Bearer undefined" e
  chiunque la inviasse passava — vedi "Errori noti") e confronta gli
  SHA-256 con `timingSafeEqual`. Non reintrodurre il confronto in linea
- `src/app/api/cron/*/route.ts` — 7 route protette da `CRON_SECRET`
  (header `Authorization: Bearer`, via `isAuthorizedCronRequest`),
  schedulate in `vercel.json`:
  `fetch-market-prices-1`…`-5` (materie prime, ogni batch a un'ora
  diversa: 06/08/10/12/14 UTC — su Hobby i cron hanno precisione
  oraria ±59min, quindi vanno distanziati di ore non di minuti),
  `fetch-eu-fuel-prices` (giovedì), `fetch-us-fuel-prices` (lunedì).
  Il limite Hobby è 100 cron job/progetto, uno al giorno ciascuno.
  Ogni route (via `runMarketPriceCron` o direttamente) apre e chiude un
  record in `fetch_runs`. `ok: true` = "run finita senza eccezioni", NON
  "tutto salvato": `points_saved` sotto l'atteso (es. rate limit Alpha
  Vantage a HTTP 200) è il segnale da leggere a valle.
  **`points_saved` conta le righe TOCCATE, non le date nuove** (3 set
  2026): `savePricePoints` usa `onConflictDoUpdate`, quindi se la fonte
  ripropone la stessa `recorded_at` l'upsert aggiorna la riga esistente e
  la conta lo stesso. Un batch da 2 commodity riporta `points_saved: 2`
  sia quando arriva un prezzo nuovo sia quando riscrive per la
  centesima volta lo stesso. Non è una metrica di freschezza — per
  quella si guarda `max(recorded_at)` nelle tabelle dati (vedi
  "Diagnosi 3 set 2026" sotto)
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
  `system-signal-wait` (ocra) se `in_attesa`, `system-signal-up`
  (ruggine) se `non_aggiornato`. `LinkedinGlyph` è una SVG
  inline (lucide non ha icone brand). Footer, colonna "Progetto": il link
  "Codice sorgente" (1 set 2026) riusa `Code2` di lucide — già usato per
  lo stesso `GITHUB_URL` nell'header — invece di una SVG brand dedicata,
  per coerenza col fatto che l'header stesso non tenta un logo GitHub
  reale (non esiste in lucide 1.34.0, vedi "Errori noti").

  **Header e footer (3 set 2026, restyling "chrome scuro")**: header e
  footer stanno su `bg-system-chrome`, le sezioni in mezzo restano
  sull'avorio. L'header contiene, nell'ordine:
  1. `HeroBackdrop` (`src/components/HeroBackdrop.tsx`) — la curva reale
     del Brent a 90 giorni disegnata in filigrana dietro il wordmark,
     dalla serie `commoditySeries` già calcolata (nessuna nuova query).
     È in posizione assoluta e ritagliata dall'`overflow-hidden`
     dell'header; nascosta sotto `sm` (con `preserveAspectRatio="none"`
     su uno schermo stretto e alto diventa una montagna verticale che
     compete col wordmark). **Attenzione**: essendo posizionata, dipinge
     sopra il contenuto in flusso normale — per questo `TickerBand` e la
     `<nav>` hanno `relative`. Toglierlo fa riapparire la curva sopra la
     fascia.
  2. Wordmark "MERCURIALE" (`MercurialeMark` 38px + testo maiuscolo
     spaziato, `text-[30px]` su mobile → `sm:text-4xl` → `lg:text-5xl`:
     la scala mobile è tarata a video, a `text-4xl` il wordmark andava
     sotto l'hamburger a 390px). Resta un `<p>`, non un heading — l'h1
     vero è la riga sotto, che descrive il CONTENUTO della pagina
     (rilevante per SEO/accessibilità); il nome del prodotto da solo non
     porta segnale tematico. L'occhiello sotto ha un cursore lampeggiante
     (`animate-caret`), `aria-hidden` + `select-none`.
  3. `TickerBand` (`src/components/TickerBand.tsx`) — la fascia sintetica,
     ora a 5 valori: Brent, benzina UE, diesel UE, ultimo dato, e **fonti
     in linea** (nuova, 3 set 2026). Ogni valore ha sotto una riga di
     contesto: variazione percentuale nella finestra della serie (dai
     `priceMovers` già calcolati) per i primi tre, cadenza per gli ultimi
     due. Sostituisce la fila di 4 `StatusLabel` — componente RIMOSSO in
     questo commit, non più usato da nessuna parte.
     "Fonti in linea" (`sourcesOnline / sourcesTotal`) conta le fonti che
     hanno almeno una serie nello stato `aggiornato`: non è una lettura di
     `fetch_runs` (quella dice se il nostro cron è partito), dice se il
     DATO è arrivato. Per i carburanti la fonte si deduce dal continente
     via `CONTINENT_SOURCES` in `page.tsx` — mappa esplicita e NON
     esaustiva di proposito, perché `getFreshnessConfig` lancia un errore
     sulle fonti sconosciute: un continente non mappato resta fuori dal
     conteggio invece di far saltare la homepage.
  4. La `<nav>` a piena larghezza sul chrome, con Metodologia e Glossario
     spinti a destra da `ml-auto`.
  Il footer ha lo stesso trattamento più un filo ambra (`h-0.5
  bg-system-chrome-accent/50`) come segno di chiusura. `MobileNav`: il
  pulsante hamburger usa i token `system-chrome-*` (vive nell'header), il
  pannello a tendina resta chiaro come le sezioni dati.

- `src/app/metodologia/page.tsx` — pagina trasparenza (fonti, limiti,
  frequenza aggiornamento, licenza MIT). Spiega anche il badge "non
  aggiornato" e documenta l'API pubblica `/api/data` (sezione 05, con
  esempio di risposta). **NON ancora aggiornata (1 set 2026) al modello
  di freshness a 3 stati**: descrive solo il badge binario di prima,
  non menziona lo stato `in_attesa` (`system-signal-wait`)
- `src/app/glossario/page.tsx` — pagina FAQ/glossario (WTI vs Brent,
  Weekly Oil Bulletin, EIA, cadenza giornaliera vs mensile, badge "non
  aggiornato" → rimanda a metodologia). Stesso pattern di
  `metodologia/page.tsx` (helper `Section`, header "torna alla dashboard").
  Stessa nota: prosa non aggiornata al modello a 3 stati
- `src/components/MercurialeMark.tsx` (3 set 2026) — il marchio del
  progetto: due assi con i terminali a T e una stella a quattro punte
  nell'incrocio (un dato su un grafico). Componente React inline e non
  `<img>`: eredita il colore dai token via `currentColor`, quindi UN file
  serve sia l'ambra del chrome (`system-chrome-accent`) sia la ruggine
  dell'avorio (`system-accent`). Ha sostituito `ProvenanceStamp` in header
  (38px) e footer (28px). **`ProvenanceStamp` NON è stato rimosso** e resta
  nelle note "Fonte:": il marchio dice "questo sito è Mercuriale", il
  timbro dice "questo numero ha una fonte" — due messaggi diversi — e a
  14px i tratti sottili del marchio collassano mentre il timbro regge.
  L'SVG di partenza dell'utente era un bitmap ricalcato (39 path, 34 KB di
  coordinate decimali, sfondo opaco): ridisegnato a mano in sei path.
  L'estremità destra dell'asse del tempo è un disco pieno e non un
  terminale a T — è "l'ultima rilevazione", come il punto finale della
  curva di HeroBackdrop; nel disegno originale era un pallino rosso che
  fluttuava slegato e leggeva come un badge di notifica.
  **Nota**: la stella a lati concavi è il glifo diventato universale per
  "contenuto generato da AI", che su un sito la cui promessa è la
  verificabilità lavora contro. Sostituire le quattro `Q` con altrettante
  `L` dà un rombo a lati diritti e chiude la questione — deciso di restare
  fedeli al disegno originale, ma la manopola è lì.
- `src/app/icon.svg` / `apple-icon.svg` / `opengraph-image.tsx` (3 set
  2026) — convenzioni di nome dell'App Router: Next li trova da sé e
  genera i `<link>` e i meta tag, quindi in `layout.tsx` NON vanno
  dichiarate icone (sarebbe un doppione). La favicon non è il marchio
  rimpicciolito ma un secondo disegno (tratti da 3 a 4 unità, assi
  accorciati, disco tolto): a 16-32px i tratti sottili collassano —
  verificato rasterizzando. `opengraph-image.tsx` usa `ImageResponse`, che
  renderizza JSX con **Satori**, non con un browser: niente Tailwind (solo
  stili inline), `display: flex` esplicito su ogni contenitore con più di
  un figlio, e `currentColor` NON eredita nulla (non c'è albero CSS) — per
  questo il marchio è ridisegnato inline in quel file e va aggiornato in
  due posti se cambia. Il testo usa il font di sistema e non IBM Plex:
  caricarlo sarebbe una fetch di rete in build per un'immagine che si
  guarda a 200px in una timeline. `twitter.card` è passato a
  `summary_large_image`.
- `src/components/EuropeFuelMap.tsx` — mappa interattiva (react-simple-maps,
  atlante 50m — NON usare 110m, omette paesi piccoli come Malta/Lussemburgo).
  Inquadratura stretta sull'Europa con dati (`rotate: [-13,-50]`,
  `scale: 900`, viewBox 800×490): riduce il grigio a est. Cipro e Malta
  finiscono ai bordi sud-est. Scala colore divergente centrata sulla
  media UE (`euAveragePetrol`, 1 set 2026), non più rampa monocroma
  min/max — scarto firmato `(prezzo - media) /
  (max - min)`, clampato con fattore `*2`, verde (`system-signal-down`) sotto
  media / ruggine (`system-signal-up`) sopra, centro neutro
  `system-border` (NON `system-panel`, troppo simile al fill "nessun
  dato" `#f0ebe0`). Box fissi "più economico/più caro" RIMOSSI (erano
  sovrapposti alla cartografia).
  **Restyling e vista fiscale (3 set 2026)**. Tre aggiunte, tutte perché il
  colore da solo non si traduce in numeri senza passarci sopra il mouse:
  (a) **barra-legenda continua** costruita con la STESSA `divergingColor`
  dei paesi — una rampa ridisegnata a mano comincerebbe a mentire appena si
  ritocca la formula. La tacca della media sta alla sua posizione
  proporzionale REALE: sui dati del 31 ago cade al 55%, e disegnarla a metà
  racconterebbe una simmetria che non c'è;
  (b) **tre riquadri nominati** sotto la mappa — più economico, Italia, più
  caro — ciascuno col quadratino di colore dalla stessa funzione, che è il
  ponte per ritrovare quel paese sulla cartografia. L'Italia c'è SEMPRE,
  anche quando non è un estremo. Stanno sotto e non sopra: i box
  sovrapposti erano stati tolti apposta perché coprivano i paesi;
  (c) **due selettori**: `FUELS` (benzina/diesel) × `MEASURES` (prezzo/quota
  fiscale). Sono due DIMENSIONI, non quattro chip in fila — con quattro
  voci il lettore deve ricostruire da sé che sono assi incrociati. `unit` e
  `format` vivono in `MEASURES` perché sono ciò che distingue una misura
  dall'altra (tre decimali e "€/L" contro uno e "%"). Una terza misura — la
  sola accisa, dai fogli fiscali del file storico — sarebbe una voce in più
  lì dentro: il registro è nato per questo e ha già pagato una volta.
  Il centro della scala per la quota fiscale è la **quota della media**
  `(media pompa − media netto) / media pompa`, NON la media delle quote dei
  27: rispondono a domande diverse e sui dati veri differiscono di quasi
  due punti. Lo scostamento cambia unità con la misura — millesimi per i
  prezzi, punti percentuali per le quote.
  `euAveragePetrol` è diventato `euAverage` con quattro numeri (lordo e
  netto per entrambi i carburanti): ogni metrica ha bisogno della PROPRIA
  media come centro, e usare quella della benzina mentre si disegna il
  diesel colorerebbe mezza Europa dalla parte sbagliata. Resta un oggetto
  di soli numeri — è un Client Component.
  Corretto un difetto latente: con zero valori per la metrica attiva,
  `Math.min(...[])` vale `Infinity` e finiva stampato come "Infinity €/L".
  L'Italia ha un contorno ambra permanente, il paese in hover uno di
  inchiostro più spesso: due segnali distinti che non si confondono. Il
  tooltip mostra tutte e quattro le combinazioni con in evidenza quella
  attiva — sono già in memoria, e si legge "2,017 €/L di cui il 51,4% è
  tassa" senza cambiare vista.
  Il titolo della sezione è "Prezzo dei **carburanti** in Europa": con la
  mappa commutabile, "benzina" smentiva il grafico sotto. Statico e non
  legato alla metrica attiva, altrimenti sarebbe l'unica sezione con
  l'intestazione renderizzata lato client.
  Header doc in testa al file spiega la formula della scala divergente
  direttamente nel codice, non solo qui
- `src/components/FuelImpactCalculator.tsx` — calcolatore costo
  pieno/trasporti, EU vs USA, senza conversione EUR/USD (valute
  originali fianco a fianco). Header doc in testa al file (1 set 2026,
  audit design system) — prima ne era privo.
  **Due righe fiscali (3 set 2026)**: imposte sul pieno e quota fiscale del
  prezzo. È la sottrazione della mappa portata sulla cifra che una persona
  riconosce — "51,4%" è un'informazione, "di questi 100,84 € di pieno,
  51,83 sono imposte" è la stessa informazione dopo che ti ha toccato. Per
  gli USA mostrano "—": l'EIA non pubblica il netto, e il carico fiscale
  americano NON si stima applicando la percentuale europea
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
  c'è una `<linearGradient>` che sfuma da `system-accent` (ambra, opacità 0.25)
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

- `scripts/backfill.ts` (3 set 2026) — backfill dello storico prezzi:
  `npx tsx scripts/backfill.ts <commodities|us-fuel> [--from AAAA-MM-GG]
  [--only SIMBOLI] [--dry-run]`. NON costa richieste aggiuntive ad Alpha
  Vantage: ogni risposta conteneva GIÀ l'intera serie in `json.data` e il
  cron ne usava solo `data[0]`, scartando il resto — `fetchOne` è ora un
  involucro di `fetchCommoditySeries`, unica implementazione del parsing
  per cron e backfill. `intervalForCategory` dichiara che gli endpoint
  energia accettano `daily` e metalli/agricole solo `monthly`: non è una
  preferenza nostra, è un limite della fonte (per questo il rame si muove
  una volta al mese). Default a 10 anni — senza limite il WTI giornaliero
  risale al 1986 e scriverebbe decine di migliaia di righe che nessuna
  schermata mostra. Idempotente (stesse chiavi uniche del cron): si
  rilancia senza duplicare e riprende dopo un'interruzione.
  **Esito del primo lancio reale (3 set 2026)**: `commodities` 8013/8367
  righe — cotone, zucchero e caffè fuori per quota Alpha Vantage esaurita
  (~25 richieste/giorno, consumate anche dai batch del cron chiamati a
  mano nella stessa giornata); `us-fuel` 1044/1044 senza intoppi (quota
  EIA separata). `--only COTTON,SUGAR,COFFEE` esiste per riprendere i
  mancanti senza rilanciare tutti e dieci i simboli: su 25 richieste al
  giorno, sette sprecate per riscrivere righe identiche sono la
  differenza tra recuperarli oggi e rimandare. `selectCommodities`
  fallisce forte su un simbolo sconosciuto invece di filtrare a vuoto —
  stesso principio di `getFreshnessConfig`, mai un default silenzioso
  Dal 3 set 2026 c'è anche il target **`eu-fuel`**: un solo download da
  4,3 MB copre 27 paesi, due carburanti, tutte le settimane, con prezzo
  alla pompa E netto. Default a 10 anni anche qui (~28.000 righe).
- `scripts/inspect-eu-history.ts` (3 set 2026) — ispeziona il file
  STORICO del bollettino UE ("Price developments 2005 onwards", ~4,3 MB),
  diverso da quello settimanale usato in `euOilBulletin.ts`. Contiene i
  prezzi al netto delle imposte, l'IVA e le accise: **lo stesso download**
  serve sia il backfill europeo sia la scomposizione del prezzo alla
  pompa (vedi "Cosa manca"). Solo ispezione — il parser va scritto su un
  layout osservato, non ancora fatto

## Convenzioni di stile del codice

- Commenti in italiano, spiegano il "perché" non il "cosa" (il progetto
  serve anche per imparare, chi legge il codice vuole capire le scelte)
- Font: `body` usa IBM Plex Sans (`var(--font-plex-sans)`, caricato in
  `layout.tsx`); `font-mono` (IBM Plex Mono) per prezzi, date, unità,
  codici. Erano Geist Sans/Mono fino al 3 set 2026: Plex è una
  superfamiglia con Sans e Mono disegnati insieme, quindi le cifre in
  colonna e il testo che le descrive hanno lo stesso "colore" tipografico.
  I pesi vanno dichiarati esplicitamente in `layout.tsx` (Plex NON è una
  variable font su Google Fonts: senza `weight`, next/font non sa quali
  file scaricare). NON rimettere `Arial` letterale sul body.
- **Schema cromatico: chrome scuro + dati chiari** (restyling 3 set 2026).
  Header, fascia sintetica, barra di navigazione e footer sono su bruno
  scuro (token `system-chrome-*`); tutte le sezioni di dati — tabelle,
  mappa, grafici, calcolatore — restano su avorio chiaro. Non è un dark
  mode: non c'è nessun blocco `prefers-color-scheme: dark` e `globals.css`
  dichiara `color-scheme: light` (tutti gli input del sito vivono nelle
  sezioni chiare). Non aggiungere un dark mode parziale, e non spostare
  contenuto-dato sul chrome: la scelta è che i numeri si leggano scuri su
  chiaro, che è più riposante per la lettura estesa.
- Formattazione di numeri/unità/valute nella UI: sempre via
  `src/lib/format.ts` (separatori it-IT). Mai `toFixed` col punto nei
  componenti. Il dato grezzo (DB, `/api/data`, export CSV/JSON) NON si
  formatta; l'unità originale della fonte va tenuta nel `title`.
- Palette colori: token `system-*` definiti in `src/app/globals.css` dentro
  `@theme` (Tailwind v4, non `tailwind.config.ts`). Non scrivere più hex a
  mano nelle classi — usare sempre le utility generate:
  Rinnovata il 3 set 2026 (era verde petrolio su grigio freddo, ora ambra
  su avorio caldo — vedi il blocco di commento in testa a `globals.css`
  per il perché). **Attenzione a due separazioni che è facile ricompattare
  per sbaglio:**

  1. **Accento di marca ≠ colori di segnale.** Prima `system-accent`
     faceva entrambi i lavori (era il verde del brand E il colore di
     "prezzo in discesa"): funzionava per caso, perché verde = giù. Con
     l'ambra no — ambra e ruggine sono vicine e le due direzioni
     diventerebbero indistinguibili. Ora `system-accent` è SOLO marca, e
     il significato sta in `system-signal-*`. Se cambia il marchio, il
     significato dei numeri non deve cambiare.
  2. **Ogni colore ha una versione per fondo chiaro e una per fondo
     scuro.** `system-accent` (#8a5a10) è tarato per l'avorio,
     `system-chrome-accent` (#e8a33d) per il bruno; idem per i segnali
     (`system-signal-up` vs `system-chrome-signal-up`). Usare quello
     sbagliato dà testo illeggibile — la ruggine #b0461f sul bruno del
     chrome dà circa 2.3:1, sotto ogni soglia. Non "riusare lo stesso hex
     tanto si vede".

  - `system-bg` (#f8f5ee) — sfondo pagina
  - `system-panel` (#f0ebe0) — sfondo pannelli secondari, PIATTO, stesso
    piano della pagina (es. hover di riga tabella)
  - `system-surface` (#fffdf8, 1 set 2026) — sfondo di una card/pannello
    SOLLEVATO sopra `system-bg` (header, footer, tabelle, tooltip,
    dropdown, input di ricerca), sempre accoppiato a un bordo o un'ombra.
    Diverso da `system-panel` proprio per questo: non è piatto. Introdotto
    per dare un nome ai 15 usi ripetuti di `bg-white` sparsi nel sito
    (stesso ruolo, nessun token dedicato prima) — trovati durante l'audit
    design system sotto, migrati 1:1 (nessuna modifica visiva: bianco
    puro prima e dopo)
  - `system-ink` (#191509) — testo principale
  - `system-ink-secondary` (#57503f) — testo secondario (paragrafi, nav)
  - `system-ink-muted` (#8b8371) — dettagli minori (text-xs, celle tabella)
  - `system-border` (#e4dccb) — bordi standard
  - `system-border-subtle` (#f0ebe0) — divisori più leggeri
  - `system-accent` (#8a5a10) — ambra scura: SOLO marca (link, hover,
    wordmark, timbro), mai significato
  - `system-signal-up` (#b0461f) — ruggine: valore in salita / sopra media
  - `system-signal-down` (#3f6f4a) — verde bosco: in discesa / sotto media
  - `system-signal-wait` (#8a6f28) — ocra spento, stato "in_attesa" del
    modello di freshness a 3 stati (`src/lib/freshness/`). Tono neutro e
    non un ambra "warning" acceso: comunica "in attesa del prossimo dato",
    non un problema
  - `system-chrome` (#14110c) / `system-chrome-raised` (#1c1811) — fondo
    del chrome e strato sollevato sopra di esso (la fascia sintetica). La
    differenza è volutamente minima: deve leggersi come uno strato, non
    come un blocco diverso
  - `system-chrome-ink` (#efe7d8) / `system-chrome-ink-muted` (#9a8f7c) /
    `system-chrome-border` (#2c2519) — inchiostri e bordi sul chrome
  - `system-chrome-accent` (#e8a33d) — l'ambra sul fondo scuro
  - `system-chrome-signal-up` (#ef8a5a) / `system-chrome-signal-down`
    (#6fcf9a) — i due segnali schiariti per il fondo scuro

  I token rimossi il 3 set 2026: `system-accent-down` e
  `system-accent-wait` (diventati `system-signal-up`/`-wait`). Se trovi
  ancora un riferimento in una pagina o in un commento, è un residuo.

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
  naming dei componenti coerente, `SystemCard` ancora usato come
  documentato, nessuna spaziatura arbitraria oltre a quella già nota sul
  wordmark header. (`StatusLabel`, citato qui prima, è stato rimosso col
  restyling del 3 set 2026: lo sostituisce `TickerBand`.)
- **Animazioni**: si anima SOLO a partire da uno stato già visibile — mai
  `opacity: 0` in attesa di uno scroll o di un IntersectionObserver. Chi
  arriva con JS lento, chi ha le animazioni disattivate e il primo
  fotogramma catturato dai social devono vedere la pagina già leggibile.
  Le tre animazioni esistenti (`animate-scan-in` sulle celle della fascia,
  `animate-caret` sul cursore dell'occhiello, `animate-draw` sulla curva
  dell'hero) sono CSS pure, dichiarate in `globals.css`: nessun Client
  Component, nessun rischio di hydration mismatch, zero KB di bundle. Sono
  tutte azzerate dentro `@media (prefers-reduced-motion: reduce)` — non
  rallentate, TOLTE, portando ogni elemento allo stato finale. Niente GIF
  né immagini decorative: se serve movimento o texture, si generano dai
  dati (vedi `HeroBackdrop`).
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
- **Bypass di `CRON_SECRET` con il segreto mancante (corretto 3 set
  2026).** Il controllo era `authHeader !== \`Bearer ${process.env.CRON_SECRET}\``.
  In JavaScript `undefined` interpolato in un template literal diventa la
  STRINGA "undefined": senza la variabile d'ambiente (deploy di preview,
  variabile cancellata) il segreto atteso diventava letteralmente
  `Bearer undefined` e chiunque poteva far scattare i cron, bruciando il
  rate limit giornaliero di Alpha Vantage. Regola generale: un controllo
  di sicurezza che non può funzionare deve NEGARE, non aprire. Ora tutto
  passa da `src/lib/cronAuth.ts`
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

- **`.env.local` scritto con la codifica sbagliata** (3 set 2026). Un file
  creato con la redirezione di PowerShell (`"CHIAVE=x" > .env.local`) su
  Windows PowerShell 5.1 viene salvato in **UTF-16LE**, non UTF-8: `dotenv`
  non riconosce nessuna riga e `tsx` stampa `injected env (0)` senza alcun
  errore. Stesso effetto con un BOM davanti (`Set-Content -Encoding utf8`
  su PS 5.1 lo aggiunge). Scriverlo con
  `[System.IO.File]::WriteAllLines("$PWD\.env.local", $lines)`, che usa
  UTF-8 senza BOM. Verifica senza esporre i valori: il primo byte di
  `[System.IO.File]::ReadAllBytes(".env.local")` dev'essere la lettera
  iniziale della prima chiave (`0x44` per `DATABASE_URL`); `0xEF` è un BOM,
  `0xFF` è UTF-16
- **Le variabili `Secret` su Vercel sono write-only** (3 set 2026): una
  volta salvate non si rileggono e non si possono riconvertire in `Config`.
  Se il valore serve altrove va rigenerato dalla fonte. `vercel env pull`
  NON è la scorciatoia: collega la cartella a un progetto Vercel, e se
  l'account attivo è quello aziendale invece del personale si finisce con
  un `.vercel/project.json` che punta all'organizzazione sbagliata. Per tre
  variabili conviene copiarle a mano; per sistemare lo scope:
  `npx vercel whoami` / `teams ls` / `switch`
- **Due cloni locali diversi sul PC** (3 set 2026).
  `C:\Users\ammin\progetti\commodity-tracker` è il clone di lavoro vero.
  Esiste anche `C:\Users\ammin\Documents\commodity-tracker`, stesso
  remote ma fermo indietro nella cronologia: usarlo per errore è costato
  mezza sessione (il sito in locale non mostrava il restyling perché si
  lavorava, senza saperlo, nella cartella sbagliata). I due hanno anche
  `.env.local` DIVERSI. Prima di dare per scontato "a che punto siamo",
  controlla sempre il percorso e `git log --oneline -5`; prima di
  aggiungere una variabile d'ambiente, verifica con `Select-String` se
  esiste già — una riga duplicata produce 401 che sembrano casuali su
  chiamate identiche

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
- Claude su claude.ai lavora su un clone nel cloud e produce **patch git**
  (`mercuriale-NN.patch`), che l'utente applica con `git am` e pusha dal
  proprio PC: il container non ha credenziali per il repository e non può
  pushare. Verifiche obbligatorie fra `git am` e `git push`:
  `npx tsc --noEmit` e `npx eslint`.
- `git push` aggiorna SOLO il branch, e Vercel ne fa una **Preview**. La
  produzione cambia solo quando la pull request viene fusa in `main`
  (3 set 2026: mezz'ora persa a guardare l'URL di produzione aspettando
  modifiche che erano ferme sul branch). Tre livelli distinti: `commit` →
  `localhost:3000`, `push` → URL Preview, merge in `main` → produzione.

## Cosa manca / prossimi passi naturali

Direzione di fondo (brief di allineamento): Mercuriale deve diventare un
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
- **Localizzazione nomi paese — FATTO (2 set 2026)** per tabella
  carburanti e tooltip mappa. `src/lib/countryNames.ts`
  (`COUNTRY_NAMES_IT` + `localizedCountryName`, fallback esplicito al
  nome originale): mappa verificata contro i 28 valori distinti reali di
  `regions.name` (27 UE + `United States`). È SOLO presentazione — il
  nome inglese resta la chiave grezza per il join di `EuropeFuelMap`
  (`geo.properties.name`, righe ~109-110, non toccato) e per l'export
  CSV/JSON (`exportRows.paese` in `FuelPriceTable`, non toccato). La
  ricerca di `FuelPriceTable` matcha sia il nome inglese sia quello
  italiano (digitare "Germania" o "Germany" trova lo stesso paese).
  Manca ancora: nomi paese nella legenda/etichette estremi della mappa e
  nelle serie del grafico carburanti (oggi ancora "media UE" aggregata,
  non per-paese, quindi non urgente)
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
- **Scomposizione fiscale — FATTA** (3 set 2026), ed è il contenuto che
  differenzia il sito. Il numero, sui dati del 31 agosto: dei 177 millesimi
  che l'Italia paga sopra la media dei 27, **155 sono imposte e 22 sono il
  carburante**. In Italia il 51,4% del prezzo alla pompa è tassa (8ª in UE,
  media 48%); per prezzo NETTO l'Italia è 18ª su 27 — il carburante da noi
  non costa particolarmente tanto, costa tanto il litro finito. Estremi:
  Malta 56,3% (ma è la più economica alla pompa), Svezia 29,6%.
  Nessuno di questi è una stima: sono sottrazioni fra due colonne dello
  stesso file, ripetibili ogni settimana per 27 paesi.
- **DUE MEDIE UE DIVERSE — da sistemare.** Il file contiene le medie
  calcolate dalla Commissione (colonne `EU_`), che NON coincidono con le
  nostre: 1,950 €/L contro 1,840 sui dati del 31 agosto, **110 millesimi**.
  La nostra è una media semplice dei paesi (Malta pesa come la Germania),
  la loro è ponderata sui consumi. Con la loro, l'Italia è +67 e non +177.
  Nessuna delle due è sbagliata — rispondono a domande diverse — ma il sito
  ne mostra una e deve dire quale: le etichette ora dicono "media dei 27"
  invece di "media UE" (mappa fatta; **metodologia e glossario da
  allineare**).
  Per mostrare ANCHE la ponderata servirebbe salvare la riga aggregata
  `EU_`, e lì c'è un problema di modello: finirebbe in `regions` come se
  fosse un paese, comparirebbe nella tabella carburanti e verrebbe
  conteggiata dentro la nostra stessa media. Serve una colonna
  `regions.kind` ('country' | 'aggregate') e quindi un'altra migrazione. È
  il passo giusto ma è un passo suo — NON aggiungere `EU_` a `regions`
  senza quella colonna.
- **Fogli fiscali non ancora usati**: il file storico ha anche `VAT`,
  `Excise duties`, `Excise duties - components`, `Other Indirect Taxes`.
  Servirebbero a separare DENTRO le imposte quanto è accisa e quanto IVA —
  oggi il sito mostra il totale. Sarebbe una terza voce nel registro
  `MEASURES` della mappa. Struttura di quei fogli mai ispezionata.
- **Storico: sbloccato** (3 set 2026). Prima c'erano 2 rilevazioni per
  serie — le variazioni si calcolavano su due punti e `HeroBackdrop` si
  rifiutava di disegnare (soglia: 8 rilevazioni). Ora `price_history` ha
  ~8.000 righe su 10 anni. Manca solo completare cotone, zucchero e caffè
  con `--only` (quota Alpha Vantage esaurita al primo lancio). Prossimo
  passo naturale ora che i dati ci sono: una finestra più lunga dei 90/30
  giorni attuali in `PriceHistoryChart`
- **`EIA_API_KEY` su Vercel in `Production` — scadenza lunedì 18:00 UTC.**
  È l'unico guasto vero rimasto in agenda: vedi la correzione della
  correzione nella diagnosi sopra. In locale funziona già; su Production
  la variabile risultava solo su `Preview` e non è stato riverificato
- **Audit sicurezza (3 set 2026)**: fatto. Trovato e corretto il bypass
  di `CRON_SECRET` sopra; aggiunti header di sicurezza in
  `next.config.ts` (`X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`) — **attenzione**: se un giorno
  si fa il widget incorporabile del brief, `X-Frame-Options: DENY` va
  allentato in modo mirato sulla sola rotta del widget, non tolto.
  Nessuna CSP di proposito (va introdotta in `Report-Only` prima: i font
  di next/font e gli stili inline di recharts/react-simple-maps la
  romperebbero in silenzio). Verificato pulito: nessun
  `dangerouslySetInnerHTML`/`eval`, nessuna query SQL costruita a
  stringa, nessun segreto nel repo, `.env*` non tracciati. Le 6
  vulnerabilità `npm audit` restano: `esbuild` via `drizzle-kit` è
  dev-only, `uuid` via `exceljs` non è raggiungibile dal nostro uso
  (parsing in sola lettura di un file da fonte fissa) — entrambe
  fixabili solo con downgrade breaking
- **Audit ortografico (3 set 2026)**: fatto su tutto il testo visibile
  (homepage, metodologia, glossario, componenti, metadata, README,
  CONTRIBUTING). Nessun errore trovato
- **Diagnosi pipeline dati (3 set 2026, ~11:00 UTC).** Prima query reale
  su `fetch_runs` da quando la tabella esiste. Esito, fonte per fonte:
  - **Alpha Vantage: sana.** I batch 1-3 erano partiti quel giorno alle
    06:28 / 08:16 / 10:31 (orari `vercel.json` 06/08/10 UTC più il jitter
    di ±59min di Hobby), i batch 4-5 all'orario del giorno prima perché
    non era ancora il loro turno. Tutti `ok: true`, `points_saved: 2` =
    il numero atteso (2 commodity per batch). **Il dato in pagina era
    comunque vecchio**: metalli e agricole fermi al 1° luglio, energia
    al 1° settembre. Non è un guasto nostro — la fonte non pubblica
    (Alpha Vantage non aveva ancora rilasciato il mensile di agosto; le
    serie giornaliere hanno un ritardo fisiologico di un paio di
    giorni). `retrieved_at` avanzava ogni giorno, `recorded_at` no: è
    esattamente la distinzione per cui le due colonne esistono separate
  - **Carburanti UE: nessuna esecuzione automatica ancora osservata.**
    L'unica run in tabella era del 1 set alle 08:43 — ma era un martedì,
    e lo schedule è `0 12 * * 4` (giovedì 12:00 UTC). Era una chiamata
    MANUALE (lo conferma la run USA 15 secondi dopo, 08:43:56). Il primo
    giovedì utile da quando `fetch_runs` esiste era proprio il 3 set:
    verifica ancora da fare dopo le 12:00 UTC
  - **I cron su Vercel scattano da soli — RISPOSTA OTTENUTA per l'UE**
    (3 set 2026, ~15:30 UTC, verificato in Drizzle Studio). La riga 17 di
    `fetch_runs`: `eu_weekly_oil_bulletin` / `fetch-eu-fuel-prices`,
    `started_at` 2026-09-03 12:17:36 → `finished_at` 12:17:38, `ok: true`,
    **`points_saved: 54`** = 27 paesi × 2 carburanti, il numero esatto
    atteso. Nessuno l'ha lanciata a mano. La conferma è più larga di una
    riga sola: le run Alpha Vantage del 1, 2 e 3 settembre hanno tutte lo
    stesso ritmo 06:2x / 08:1x / 10:3x / 12:2x / 14:2x — è lo scheduler
    che funziona, non una coincidenza. Resta aperta SOLO la controparte
    USA: risposta lunedì dopo le 18:00 UTC
  - **Durata di una run non è un indicatore di salute, ma va guardata.**
    Stessa giornata, stesso file, stesso risultato: la run automatica su
    Vercel (12:17) è durata **1,7 s**, quella manuale dal PC dell'utente
    (13:50) **20,2 s** — dodici volte tanto, entrambe con `points_saved:
    54`. Era solo la rete (datacenter contro linea domestica). Ma 1,7 s
    per scaricare e parsare un XLSX è al limite del plausibile: se
    `points_saved` fosse stato basso, quella velocità sarebbe stata
    l'indizio che il download aveva restituito qualcosa di più piccolo
    del previsto. Si legge sempre insieme al conteggio, mai da sola
  - **Il fallimento silenzioso, conservato.** Riga 1 di `fetch_runs`
    (31 ago 19:19): `ok: TRUE` con **`points_saved: 0`**. Nessuna
    eccezione, nessun errore, zero righe salvate — Alpha Vantage che
    risponde HTTP 200 con un rate limit al posto dei dati. È esattamente
    il caso per cui `fetch_runs` esiste, e ora se ne ha la prova in
    tabella invece che a memoria
  - **Carburanti USA: nessun guasto in produzione.** La run in tabella
    riporta `ok: false` + `errorText: "EIA_API_KEY non configurata"`, ma
    su Vercel quella variabile ESISTE dal 27 ago in tutti e tre gli
    ambienti (Production, Preview, Development) — verificato a schermo.
    La conclusione corretta è che quella run **non girava su Vercel**:
    era la chiamata manuale delle 08:43 fatta in LOCALE, dove
    `.env.local` non ha `EIA_API_KEY`. Lo conferma la run UE 15 secondi
    prima, riuscita con 54 punti: il fetcher UE scarica un XLSX pubblico
    e non ha bisogno di chiavi, quindi in locale funziona lo stesso.
    **Lezione da non ripetere**: una riga di `fetch_runs` non dice DOVE
    ha girato il codice. Prima di dedurre un guasto in produzione da un
    errore di configurazione, va confrontato con le variabili
    effettivamente presenti su Vercel.
    **CORREZIONE della correzione (3 set 2026, pomeriggio)**: la frase
    "la variabile esiste su Vercel in tutti e tre gli ambienti,
    verificato a schermo" era FALSA. Uno screenshot di Settings →
    Environment Variables mostra `EIA_API_KEY` di tipo `Secret` presente
    solo sotto **`Preview`**, non sotto `Production`. La conclusione che
    non fosse un guasto in produzione resta corretta (quella run girava
    in locale), ma la prova addotta non lo era.
    Parte locale RISOLTA: `EIA_API_KEY` è ora in `.env.local` e la run
    manuale delle 13:50:29 del 3 set riporta `ok: true`, `points_saved:
    2`. **Ma funzionare in locale non dice nulla su Production** — è la
    stessa identica trappola di sopra, al contrario. Da fare PRIMA di
    lunedì 18:00 UTC: aggiungere `Production` agli Environments della
    variabile su Vercel. Se il valore non è più disponibile (è `Secret`,
    write-only) va rigenerato su eia.gov/opendata/register.php — arriva
    per email, non a schermo — e riscritto NELLO STESSO MOMENTO in
    `.env.local`, su Vercel (tutti gli ambienti) e in un gestore di
    password, altrimenti fra due mesi si è di nuovo qui
- **Colonna `latest_recorded_at` in `fetch_runs` — da fare.** Nasce dalla
  diagnosi sopra: siccome `points_saved` non distingue "dato nuovo" da
  "stesso dato riscritto", per capire se una fonte è ferma servono due
  query e un ragionamento. Salvando in ogni run la `recorded_at` più
  recente vista, la differenza tra "la fonte è ferma" e "noi non
  peschiamo" si legge in una riga sola. È anche il dato che serve alla
  pagina pubblica "Stato dei dati"

## Skill: vercel-react-best-practices

Skill installata in .claude/skills/vercel-react-best-practices/.
Consultare per: eliminazione di waterfall async, ottimizzazione bundle
size (dynamic import, barrel imports), performance server-side (React.cache,
parallel fetching), re-render inutili, pattern di rendering.
Guida completa in AGENTS.md, regole singole in rules/*.md.

## Skill: frontend-design

Skill installata in .claude/skills/frontend-design/.
Consultare per: direzione estetica quando si costruisce nuova UI o si
ridisegna quella esistente — scelte di palette, accoppiamento tipografico,
layout che non sembrino default templatizzati. Dettagli in SKILL.md.
