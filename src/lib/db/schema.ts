import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  timestamp,
  varchar,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * COMMODITIES
 * Anagrafica delle materie prime globali (petrolio, oro, grano...).
 * Una riga per ogni materia prima che tracciamo, non per ogni prezzo:
 * i prezzi nel tempo vivono nella tabella `priceHistory` qui sotto.
 */
export const commodities = pgTable("commodities", {
  id: serial("id").primaryKey(),
  // Simbolo usato dalla fonte dati (es. "WTI", "BRENT", "WHEAT")
  symbol: varchar("symbol", { length: 32 }).notNull().unique(),
  name: text("name").notNull(), // es. "West Texas Intermediate"
  category: varchar("category", { length: 32 }).notNull(), // "energy" | "metal" | "agricultural"
  unit: varchar("unit", { length: 32 }).notNull(), // es. "USD per barrel"
});

/**
 * PRICE_HISTORY
 * Storico dei prezzi di mercato globali. Una riga per ogni rilevazione
 * nel tempo, collegata a una materia prima tramite commodityId.
 */
export const priceHistory = pgTable(
  "price_history",
  {
    id: serial("id").primaryKey(),
    // `integer` e non `serial`: è una chiave esterna, il valore lo fornisce
    // sempre il codice (l'id della commodity). `serial` le darebbe una
    // sequence e un DEFAULT nextval() inutili e potenzialmente fuorvianti.
    commodityId: integer("commodity_id")
      .notNull()
      .references(() => commodities.id),
    // `numeric` invece di `float`: evita errori di arrotondamento sui prezzi
    price: numeric("price", { precision: 12, scale: 4 }).notNull(),
    // `recorded_at` è la data DEL DATO (a quale giornata si riferisce il
    // prezzo). `retrieved_at` è quando il nostro fetcher l'ha acquisito:
    // due cose diverse, es. un prezzo mensile datato 01/07 acquisito il
    // 20/07. Serve a distinguere "fonte ferma" da "fonte che non ha
    // ancora pubblicato". Nullable: le righe salvate prima di questa
    // colonna hanno acquisizione non tracciata.
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
    retrievedAt: timestamp("retrieved_at"),
    source: varchar("source", { length: 64 }).notNull(), // es. "alpha_vantage"
  },
  (table) => ({
    // Indice: le query più comuni filtrano per materia prima + data,
    // questo indice le rende molto più veloci man mano che la tabella cresce
    commodityDateIdx: index("price_history_commodity_date_idx").on(
      table.commodityId,
      table.recordedAt
    ),
    // Vincolo di unicità: una sola rilevazione per (materia prima, data).
    // Serve da bersaglio all'upsert in savePricePoints: se la fonte
    // ricalcola/corregge un valore già salvato lo AGGIORNIAMO, invece di
    // accumulare righe duplicate a ogni run del cron.
    commodityRecordedUnique: uniqueIndex(
      "price_history_commodity_recorded_at_unique"
    ).on(table.commodityId, table.recordedAt),
  })
);

/**
 * REGIONS
 * Aree geografiche per cui tracciamo prezzi al consumo (non di mercato).
 * Un continente può avere più country_code null (es. "European Union"
 * come aggregato), oppure un paese specifico (es. "Germany", countryCode "DE").
 */
export const regions = pgTable("regions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // es. "Germany", "United States"
  countryCode: varchar("country_code", { length: 2 }), // ISO 3166-1 alpha-2, nullable per aggregati
  continent: varchar("continent", { length: 32 }).notNull(), // "europe" | "north_america" | "oceania" | "latam"
});

/**
 * RETAIL_FUEL_PRICES
 * Prezzi medi al consumo dei carburanti per regione (benzina, diesel...).
 * Concettualmente separata da priceHistory perché la fonte, la valuta
 * e la frequenza di aggiornamento sono diverse dai prezzi di mercato globali.
 */
export const retailFuelPrices = pgTable(
  "retail_fuel_prices",
  {
    id: serial("id").primaryKey(),
    // FK: `integer`, non `serial` (vedi price_history.commodityId).
    regionId: integer("region_id")
      .notNull()
      .references(() => regions.id),
    fuelType: varchar("fuel_type", { length: 32 }).notNull(), // "petrol" | "diesel"
    price: numeric("price", { precision: 10, scale: 4 }).notNull(),
    // Prezzo AL NETTO delle imposte, stessa unità e valuta di `price`.
    // La differenza `price - price_net` è il carico fiscale: accisa, IVA e
    // altre imposte indirette messe insieme.
    //
    // Nullable, e non con default 0, per due ragioni. La prima è storica:
    // le righe salvate prima di questa colonna non hanno il netto e non lo
    // avranno mai — uno zero le farebbe leggere come "100% tasse". La
    // seconda è che la Commissione non pubblica il netto per ogni paese e
    // ogni settimana: dove manca, il carico fiscale NON si calcola e la
    // pagina deve dirlo, non stimarlo per differenza da una media.
    //
    // Solo la fonte `eu_weekly_oil_bulletin` la valorizza: l'EIA pubblica
    // il prezzo alla pompa e basta.
    priceNet: numeric("price_net", { precision: 10, scale: 4 }),
    // Accisa, in euro al litro — Fase 3 della roadmap. Dal foglio "Excise
    // duties" del file storico UE, già convertita da valuta nazionale a
    // euro dal fetcher (vedi euOilBulletinHistory.ts). Nullable come
    // priceNet: solo `eu_weekly_oil_bulletin` la valorizza, e non per ogni
    // paese/settimana (il foglio delle accise non copre sempre tutto lo
    // storico dal 2005).
    exciseEur: numeric("excise_eur", { precision: 10, scale: 4 }),
    // Aliquota IVA in percentuale (es. 22.000), dal foglio "VAT". Si salva
    // l'ALIQUOTA e non l'importo in euro: l'importo si deriva a valle come
    // (price_net + excise_eur) * vat_rate_percent / 100 — così se la
    // formula di derivazione cambia un giorno non serve ricalcolare e
    // riscrivere ogni riga già salvata.
    vatRatePercent: numeric("vat_rate_percent", { precision: 6, scale: 3 }),
    currency: varchar("currency", { length: 3 }).notNull(), // ISO 4217, es. "EUR", "USD"
    unit: varchar("unit", { length: 16 }).notNull().default("liter"), // "liter" | "gallon"
    // Vedi price_history.retrievedAt: data del dato vs data di acquisizione.
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
    retrievedAt: timestamp("retrieved_at"),
    source: varchar("source", { length: 64 }).notNull(), // es. "eu_weekly_oil_bulletin", "eia_us"
  },
  (table) => ({
    regionDateIdx: index("retail_fuel_region_date_idx").on(
      table.regionId,
      table.recordedAt
    ),
    // Stessa logica di price_history: una sola rilevazione per
    // (regione, tipo carburante, data). Bersaglio dell'upsert nei
    // fetcher EU/US. Il fuel_type entra nella chiave perché per la
    // stessa regione e data salviamo sia benzina che diesel.
    regionFuelRecordedUnique: uniqueIndex(
      "retail_fuel_region_fuel_recorded_at_unique"
    ).on(table.regionId, table.fuelType, table.recordedAt),
  })
);

/**
 * FETCH_RUNS
 * Un record per ogni esecuzione di un cron di acquisizione: quando è
 * partita, se è riuscita, quanti punti ha salvato, l'errore se c'è stato.
 *
 * Perché serve: oggi i fetcher fanno try/catch e loggano su console, ma
 * non resta traccia strutturata. Senza questo non si può costruire una
 * pagina "Stato dei dati" né una freshness che distingua "fonte rotta"
 * da "fonte che non ha ancora pubblicato". È il posto dove intercettare
 * anche i fallimenti silenziosi (Alpha Vantage risponde HTTP 200 con un
 * rate limit al posto dei dati: `pointsSaved` a 0 quando ne attendevamo
 * di più è il segnale).
 */
export const fetchRuns = pgTable(
  "fetch_runs",
  {
    id: serial("id").primaryKey(),
    source: varchar("source", { length: 64 }).notNull(), // "alpha_vantage" | "eu_weekly_oil_bulletin" | "eia_us"
    job: varchar("job", { length: 64 }).notNull(), // es. "fetch-market-prices-3"
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"), // null = run ancora in corso o interrotta
    ok: boolean("ok"), // null finché non finita
    pointsSaved: integer("points_saved"),
    errorText: text("error_text"),
  },
  (table) => ({
    sourceStartedIdx: index("fetch_runs_source_started_idx").on(
      table.source,
      table.startedAt
    ),
  })
);

/**
 * WEEKLY_NARRATIVES
 * Le 2-3 righe "cosa è cambiato questa settimana" mostrate in home,
 * generate dal cron carburanti UE confrontando la settimana appena
 * arrivata con quella precedente (vedi generateWeeklyNarrative.ts).
 *
 * ARCHIVIATE, non ricalcolate a ogni richiesta: sono una dichiarazione
 * fatta in un momento preciso ("questa settimana il diesel è salito di
 * 3 centesimi"), non una vista live sui dati attuali. Se un domani un
 * valore storico venisse corretto, la narrazione di una settimana passata
 * non deve cambiare sotto i piedi di chi l'ha già letta.
 */
export const weeklyNarratives = pgTable(
  "weekly_narratives",
  {
    id: serial("id").primaryKey(),
    // Data della rilevazione più recente confrontata — la settimana
    // "nuova" del confronto, non il momento in cui la riga è stata
    // generata (quello è `createdAt`).
    weekOf: timestamp("week_of").notNull(),
    // "it_petrol" | "it_diesel" | "eu_mover" — vedi NarrativeEntry in
    // generateWeeklyNarrative.ts.
    kind: varchar("kind", { length: 32 }).notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    // Bersaglio dell'upsert: se il cron rigira sulla stessa settimana
    // (prima che ne arrivi una nuova) aggiorna la riga invece di duplicarla.
    weekKindUnique: uniqueIndex("weekly_narratives_week_kind_unique").on(
      table.weekOf,
      table.kind
    ),
    weekOfIdx: index("weekly_narratives_week_of_idx").on(table.weekOf),
  })
);
