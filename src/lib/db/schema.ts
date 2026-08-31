import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  timestamp,
  varchar,
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
  name: text("name").notNull(), // es. "Germany", "United States"
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
