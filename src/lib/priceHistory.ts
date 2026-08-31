/**
 * Trasforma righe grezze di storico prezzi in serie pronte per il grafico.
 *
 * Perché queste funzioni sono separate dal componente React: la logica di
 * raggruppamento/media è la parte delicata (facile sbagliare un edge case
 * tipo "un solo punto dato" o "date duplicate"), e separandola da React
 * possiamo testarla con semplice codice Node, senza dover simulare un
 * rendering, allo stesso modo di come abbiamo già validato la logica di
 * FuelPriceTable prima di scrivere il componente.
 */

import { displayCommodityPrice } from "./commodityDisplay";

export type PricePoint = { date: string; value: number };
export type PriceSeries = { key: string; label: string; unit: string; points: PricePoint[] };

type CommodityHistoryRow = {
  symbol: string;
  name: string;
  unit: string;
  price: string;
  recordedAt: Date | string;
};

/** Una serie per ogni materia prima (symbol), punti ordinati per data. */
export function groupCommodityHistory(rows: CommodityHistoryRow[]): PriceSeries[] {
  const bySymbol = new Map<string, PriceSeries>();

  for (const row of rows) {
    // Stessa conversione di sola visualizzazione usata nella tabella
    // (src/lib/commodityDisplay.ts): il cotone va mostrato in cents/kg, non
    // in cents/pound. La applichiamo qui — nel layer che prepara i dati per
    // il grafico — e non sul dato salvato, così tabella e grafico nella
    // stessa sezione mostrano lo stesso valore e la stessa unità.
    const display = displayCommodityPrice(
      row.symbol,
      parseFloat(row.price),
      row.unit
    );
    let series = bySymbol.get(row.symbol);
    if (!series) {
      series = { key: row.symbol, label: row.name, unit: display.unit, points: [] };
      bySymbol.set(row.symbol, series);
    }
    series.points.push({
      date: formatIsoDate(row.recordedAt),
      value: display.price,
    });
  }

  return Array.from(bySymbol.values());
}

type FuelHistoryRow = {
  regionName: string;
  continent: string;
  fuelType: string;
  price: string;
  currency: string;
  recordedAt: Date | string;
};

/**
 * Quattro serie: {continente} × {benzina, diesel}. Per l'Europa la media
 * è calcolata sui paesi disponibili in quella data specifica — non tutti
 * i paesi hanno necessariamente un dato per ogni data, quindi la media si
 * fa sui presenti, non forzando un valore.
 *
 * Perché non mescoliamo EUR e USD sulla stessa serie: sarebbe un confronto
 * fuorviante senza tasso di cambio, come già notato altrove nel progetto
 * (calcolatore d'impatto). Qui restano 4 serie separate, ognuna con la sua
 * valuta esplicita nell'etichetta unit.
 */
export function groupFuelHistory(rows: FuelHistoryRow[]): PriceSeries[] {
  // Chiave intermedia: continente|tipoCarburante|dataISO → lista prezzi
  // da mediare. Raggruppiamo prima per data+continente+carburante, POI
  // facciamo la media, invece di accumulare un totale progressivo — così
  // è chiaro e verificabile un giorno alla volta.
  const buckets = new Map<string, { sum: number; count: number; currency: string }>();

  for (const row of rows) {
    const date = formatIsoDate(row.recordedAt);
    const bucketKey = `${row.continent}|${row.fuelType}|${date}`;
    const existing = buckets.get(bucketKey);
    if (existing) {
      existing.sum += parseFloat(row.price);
      existing.count += 1;
    } else {
      buckets.set(bucketKey, { sum: parseFloat(row.price), count: 1, currency: row.currency });
    }
  }

  const CONTINENT_LABELS: Record<string, string> = {
    europe: "Europa (media UE)",
    north_america: "USA",
    oceania: "Oceania",
    latam: "LatAm",
  };
  const FUEL_LABELS: Record<string, string> = {
    petrol: "Benzina",
    diesel: "Diesel",
  };

  const seriesMap = new Map<string, PriceSeries>();

  for (const [bucketKey, { sum, count, currency }] of buckets.entries()) {
    const [continent, fuelType, date] = bucketKey.split("|");
    const seriesKey = `${continent}|${fuelType}`;
    let series = seriesMap.get(seriesKey);
    if (!series) {
      const continentLabel = CONTINENT_LABELS[continent] ?? continent;
      const fuelLabel = FUEL_LABELS[fuelType] ?? fuelType;
      series = {
        key: seriesKey,
        label: `${continentLabel} · ${fuelLabel}`,
        unit: `${currency}/L`,
        points: [],
      };
      seriesMap.set(seriesKey, series);
    }
    series.points.push({ date, value: sum / count });
  }

  // Ogni serie va ordinata per data: i bucket sono stati popolati
  // nell'ordine di iterazione delle righe grezze, non necessariamente
  // cronologico.
  for (const series of seriesMap.values()) {
    series.points.sort((a, b) => a.date.localeCompare(b.date));
  }

  return Array.from(seriesMap.values());
}

function formatIsoDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toISOString().slice(0, 10); // "2026-08-24"
}

export type PriceMover = {
  key: string;
  label: string;
  unit: string;
  /** Primo valore disponibile nella finestra (punto più vecchio) */
  first: number;
  /** Ultimo valore disponibile nella finestra (punto più recente) */
  last: number;
  /** Variazione percentuale tra `first` e `last` (può essere negativa) */
  changePct: number;
  firstDate: string;
  lastDate: string;
  /** Rilevazioni nella finestra: utile per dire quanto è "solida" la variazione */
  points: number;
};

/**
 * Variazione percentuale tra la prima e l'ultima rilevazione di ogni
 * serie, per la sezione "Maggiori variazioni" in homepage.
 *
 * I `points` di ogni PriceSeries sono già ordinati per data crescente
 * (le query fanno `ORDER BY recorded_at`, e groupFuelHistory ri-ordina),
 * quindi `points[0]` è il più vecchio e l'ultimo è il più recente.
 *
 * Salta le serie con meno di 2 punti (nessuna variazione calcolabile —
 * capita spesso alle materie prime mensili, che in 90 giorni hanno a
 * volte una sola rilevazione) e quelle con primo valore 0 (divisione non
 * definita). NON ordina né taglia la lista: se ne occupa il chiamante,
 * che sa quante voci vuole e se mescolare più fonti.
 */
export function priceMovers(series: PriceSeries[]): PriceMover[] {
  const movers: PriceMover[] = [];
  for (const s of series) {
    if (s.points.length < 2) continue;
    const first = s.points[0];
    const last = s.points[s.points.length - 1];
    if (first.value === 0) continue;
    movers.push({
      key: s.key,
      label: s.label,
      unit: s.unit,
      first: first.value,
      last: last.value,
      changePct: ((last.value - first.value) / first.value) * 100,
      firstDate: first.date,
      lastDate: last.date,
      points: s.points.length,
    });
  }
  return movers;
}
