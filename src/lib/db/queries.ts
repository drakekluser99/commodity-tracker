import { eq, desc, gte, and, inArray } from "drizzle-orm";
import { db } from "./client";
import {
  commodities,
  priceHistory,
  regions,
  retailFuelPrices,
  weeklyNarratives,
  provinces,
  retailFuelPricesIt,
  fetchRuns,
  dataCorrections,
} from "./schema";

export interface LatestCommodityPrice {
  symbol: string;
  name: string;
  category: string;
  unit: string;
  price: string;
  recordedAt: Date;
  source: string;
}

export interface LatestFuelPrice {
  regionName: string;
  continent: string;
  fuelType: string;
  price: string;
  /**
   * Prezzo al netto delle imposte, quando la fonte lo pubblica. `null` per
   * l'EIA (che dà solo il prezzo alla pompa) e per le righe UE salvate
   * prima che la colonna esistesse.
   *
   * Dove è null il carico fiscale NON si calcola: la pagina deve dirlo,
   * non stimarlo per differenza da una media.
   */
  priceNet: string | null;
  /**
   * Accisa (euro/litro) e aliquota IVA (%), Fase 3. Stesso significato di
   * `priceNet`: valorizzate solo da `eu_weekly_oil_bulletin`, e non per
   * ogni paese/settimana — `null` dove il foglio delle accise/IVA non
   * copre quella combinazione.
   */
  exciseEur: string | null;
  vatRatePercent: string | null;
  currency: string;
  recordedAt: Date;
}

/**
 * Prende l'ultimo prezzo registrato per ogni materia prima globale.
 *
 * Approccio: leggiamo tutto lo storico unito all'anagrafica, ordinato
 * dal più recente, poi teniamo solo la PRIMA occorrenza di ogni symbol
 * incontrata durante il ciclo (che, essendo l'array ordinato per data
 * decrescente, è per forza la più recente). Con poche centinaia di righe
 * come le nostre va benissimo; se il dataset crescesse molto, si
 * passerebbe a una query SQL con DISTINCT ON per farlo fare al database
 * invece che a JavaScript.
 */
export async function getLatestCommodityPrices(): Promise<
  LatestCommodityPrice[]
> {
  const rows = await db
    .select({
      symbol: commodities.symbol,
      name: commodities.name,
      category: commodities.category,
      unit: commodities.unit,
      price: priceHistory.price,
      recordedAt: priceHistory.recordedAt,
      source: priceHistory.source,
    })
    .from(priceHistory)
    .innerJoin(commodities, eq(priceHistory.commodityId, commodities.id))
    .orderBy(desc(priceHistory.recordedAt));

  const seen = new Set<string>();
  const latest: LatestCommodityPrice[] = [];
  for (const row of rows) {
    if (seen.has(row.symbol)) continue;
    seen.add(row.symbol);
    latest.push(row);
  }
  return latest;
}

/** Stessa logica di sopra, ma per i prezzi carburanti regionali. */
export async function getLatestFuelPrices(): Promise<LatestFuelPrice[]> {
  const rows = await db
    .select({
      regionName: regions.name,
      continent: regions.continent,
      fuelType: retailFuelPrices.fuelType,
      price: retailFuelPrices.price,
      priceNet: retailFuelPrices.priceNet,
      exciseEur: retailFuelPrices.exciseEur,
      vatRatePercent: retailFuelPrices.vatRatePercent,
      currency: retailFuelPrices.currency,
      recordedAt: retailFuelPrices.recordedAt,
    })
    .from(retailFuelPrices)
    .innerJoin(regions, eq(retailFuelPrices.regionId, regions.id))
    .orderBy(desc(retailFuelPrices.recordedAt));

  const seen = new Set<string>();
  const latest: LatestFuelPrice[] = [];
  for (const row of rows) {
    const key = `${row.regionName}:${row.fuelType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(row);
  }
  return latest;
}

export interface CommodityHistoryRow {
  symbol: string;
  name: string;
  unit: string;
  price: string;
  recordedAt: Date;
}

/**
 * Tutto lo storico prezzi materie prime a partire da una data (inclusa),
 * ordinato dal più vecchio al più recente per essere pronto da plottare.
 * A differenza di getLatestCommodityPrices non deduplichiamo: qui servono
 * proprio tutte le rilevazioni nel tempo.
 */
export async function getCommodityPriceHistory(
  sinceDate: Date
): Promise<CommodityHistoryRow[]> {
  return db
    .select({
      symbol: commodities.symbol,
      name: commodities.name,
      unit: commodities.unit,
      price: priceHistory.price,
      recordedAt: priceHistory.recordedAt,
    })
    .from(priceHistory)
    .innerJoin(commodities, eq(priceHistory.commodityId, commodities.id))
    .where(gte(priceHistory.recordedAt, sinceDate))
    .orderBy(priceHistory.recordedAt);
}

export interface FuelHistoryRow {
  regionName: string;
  continent: string;
  fuelType: string;
  price: string;
  currency: string;
  recordedAt: Date;
}

/** Stessa logica di getCommodityPriceHistory, per i carburanti regionali. */
export async function getFuelPriceHistory(
  sinceDate: Date
): Promise<FuelHistoryRow[]> {
  return db
    .select({
      regionName: regions.name,
      continent: regions.continent,
      fuelType: retailFuelPrices.fuelType,
      price: retailFuelPrices.price,
      currency: retailFuelPrices.currency,
      recordedAt: retailFuelPrices.recordedAt,
    })
    .from(retailFuelPrices)
    .innerJoin(regions, eq(retailFuelPrices.regionId, regions.id))
    .where(gte(retailFuelPrices.recordedAt, sinceDate))
    .orderBy(retailFuelPrices.recordedAt);
}

export interface WeekFuelPriceRow {
  regionName: string;
  fuelType: string;
  price: string;
  priceNet: string | null;
}

/**
 * Le righe carburante d'Europa delle DUE date di rilevazione più recenti
 * presenti in tabella — non "ultimi 14 giorni": se una settimana del
 * bollettino saltasse, questa funzione confronta comunque le due
 * rilevazioni vere più vicine, non un intervallo fisso che potrebbe non
 * contenerne nessuna. Sorgente per generateWeeklyNarrative.
 */
export async function getLastTwoEuropeFuelWeeks(): Promise<{
  current: WeekFuelPriceRow[];
  previous: WeekFuelPriceRow[];
  currentDate: Date | null;
}> {
  const dateRows = await db
    .selectDistinct({ recordedAt: retailFuelPrices.recordedAt })
    .from(retailFuelPrices)
    .innerJoin(regions, eq(retailFuelPrices.regionId, regions.id))
    .where(eq(regions.continent, "europe"))
    .orderBy(desc(retailFuelPrices.recordedAt))
    .limit(2);

  // Meno di due settimane in tabella: nessun confronto possibile ancora
  // (es. subito dopo il primo deploy). Nessuna narrazione, non un errore.
  if (dateRows.length < 2) {
    return { current: [], previous: [], currentDate: null };
  }
  const [currentDate, previousDate] = dateRows.map((r) => r.recordedAt);

  const rows = await db
    .select({
      regionName: regions.name,
      fuelType: retailFuelPrices.fuelType,
      price: retailFuelPrices.price,
      priceNet: retailFuelPrices.priceNet,
      recordedAt: retailFuelPrices.recordedAt,
    })
    .from(retailFuelPrices)
    .innerJoin(regions, eq(retailFuelPrices.regionId, regions.id))
    .where(
      and(
        eq(regions.continent, "europe"),
        inArray(retailFuelPrices.recordedAt, [currentDate, previousDate])
      )
    );

  return {
    current: rows.filter(
      (r) => r.recordedAt.getTime() === currentDate.getTime()
    ),
    previous: rows.filter(
      (r) => r.recordedAt.getTime() === previousDate.getTime()
    ),
    currentDate,
  };
}

export interface WeeklyNarrativeRow {
  weekOf: Date;
  kind: string;
  text: string;
}

/**
 * Le narrazioni dell'ULTIMA settimana generata, non l'intero archivio —
 * è quello che compare in home. L'archivio (una pagina che elenca tutte
 * le settimane passate) resta un possibile passo successivo: i dati sono
 * già lì, salvati settimana per settimana, pronti per quando servirà.
 */
export async function getLatestWeeklyNarratives(): Promise<
  WeeklyNarrativeRow[]
> {
  const [latest] = await db
    .select({ weekOf: weeklyNarratives.weekOf })
    .from(weeklyNarratives)
    .orderBy(desc(weeklyNarratives.weekOf))
    .limit(1);
  if (!latest) return [];

  return db
    .select({
      weekOf: weeklyNarratives.weekOf,
      kind: weeklyNarratives.kind,
      text: weeklyNarratives.text,
    })
    .from(weeklyNarratives)
    .where(eq(weeklyNarratives.weekOf, latest.weekOf))
    .orderBy(weeklyNarratives.kind);
}

export interface LatestProvinceFuelPrice {
  provinceCode: string;
  provinceName: string;
  fuelType: string;
  priceSelfAvg: string | null;
  priceServedAvg: string | null;
  selfStationCount: number | null;
  servedStationCount: number | null;
  recordedAt: Date;
}

/**
 * Prezzo carburante più recente per ogni (provincia, carburante) — Fase 4.
 * Stessa logica di dedup di getLatestFuelPrices: leggiamo ordinato dal più
 * recente e teniamo solo la prima occorrenza per chiave. Con 107 province
 * × 2 carburanti (214 righe attese per giorno) va benissimo in JavaScript,
 * stessa scala di retailFuelPrices.
 */
export async function getLatestItalianFuelPrices(): Promise<
  LatestProvinceFuelPrice[]
> {
  const rows = await db
    .select({
      provinceCode: provinces.code,
      provinceName: provinces.name,
      fuelType: retailFuelPricesIt.fuelType,
      priceSelfAvg: retailFuelPricesIt.priceSelfAvg,
      priceServedAvg: retailFuelPricesIt.priceServedAvg,
      selfStationCount: retailFuelPricesIt.selfStationCount,
      servedStationCount: retailFuelPricesIt.servedStationCount,
      recordedAt: retailFuelPricesIt.recordedAt,
    })
    .from(retailFuelPricesIt)
    .innerJoin(provinces, eq(retailFuelPricesIt.provinceId, provinces.id))
    .orderBy(desc(retailFuelPricesIt.recordedAt));

  const seen = new Set<string>();
  const latest: LatestProvinceFuelPrice[] = [];
  for (const row of rows) {
    const key = `${row.provinceCode}:${row.fuelType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(row);
  }
  return latest;
}

export interface FetchRunSummary {
  source: string;
  job: string;
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean | null;
  pointsSaved: number | null;
  latestRecordedAt: Date | null;
  errorText: string | null;
}

/**
 * L'ultima esecuzione registrata per ogni JOB (non per fonte: una fonte
 * come "alpha_vantage" ha 5 job distinti, uno per batch di commodity — vedi
 * runMarketPriceCron.ts). Risponde alla domanda "questa pipeline sta
 * girando?", diversa da "questo dato è fresco?" (quella la risponde già
 * ogni card della homepage con computeFreshness).
 *
 * Stessa logica di dedup delle altre getLatest* di questo file: si legge
 * tutto ordinato dal più recente e si tiene solo la prima occorrenza per
 * job, che essendo l'array ordinato è per forza la più recente.
 */
export async function getLatestFetchRuns(): Promise<FetchRunSummary[]> {
  const rows = await db
    .select({
      source: fetchRuns.source,
      job: fetchRuns.job,
      startedAt: fetchRuns.startedAt,
      finishedAt: fetchRuns.finishedAt,
      ok: fetchRuns.ok,
      pointsSaved: fetchRuns.pointsSaved,
      latestRecordedAt: fetchRuns.latestRecordedAt,
      errorText: fetchRuns.errorText,
    })
    .from(fetchRuns)
    .orderBy(desc(fetchRuns.startedAt));

  const seen = new Set<string>();
  const latest: FetchRunSummary[] = [];
  for (const row of rows) {
    if (seen.has(row.job)) continue;
    seen.add(row.job);
    latest.push(row);
  }
  return latest;
}

export interface DataCorrectionRow {
  tableName: string;
  entityLabel: string;
  field: string;
  oldValue: string;
  newValue: string;
  recordedAt: Date;
  detectedAt: Date;
  source: string;
}

/**
 * Le correzioni più recenti registrate in `data_corrections` (Fase 3),
 * dalla più recente per `detectedAt` (il momento in cui ce ne siamo
 * accorti, non la data del dato corretto — vedi schema.ts). `limit` di
 * default basso: questa è una pagina di stato, non un archivio — se un
 * giorno servirà sfogliare tutto lo storico è una paginazione da
 * aggiungere apposta, non il default di questa funzione.
 */
export async function getRecentCorrections(
  limit = 20
): Promise<DataCorrectionRow[]> {
  return db
    .select({
      tableName: dataCorrections.tableName,
      entityLabel: dataCorrections.entityLabel,
      field: dataCorrections.field,
      oldValue: dataCorrections.oldValue,
      newValue: dataCorrections.newValue,
      recordedAt: dataCorrections.recordedAt,
      detectedAt: dataCorrections.detectedAt,
      source: dataCorrections.source,
    })
    .from(dataCorrections)
    .orderBy(desc(dataCorrections.detectedAt))
    .limit(limit);
}
