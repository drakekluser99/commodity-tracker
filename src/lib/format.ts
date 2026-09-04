/**
 * Formattazione per la UI in italiano: numeri con separatori it-IT e
 * unità/valute abbreviate.
 *
 * Perché un layer dedicato: con l'aumentare delle fonti le conversioni e
 * la formattazione tendevano a sparpagliarsi nei componenti (ognuno con
 * il suo `toFixed`). Qui stanno in un posto solo. NON si tocca il dato
 * grezzo: `price_history`, `retail_fuel_prices` e `/api/data` restano
 * con valore e unità esatti della fonte. Questo modulo serve solo alla
 * leggibilità, e l'unità originale va comunque tenuta raggiungibile
 * dall'utente (es. nel `title` della cella).
 */

function nf(digits: number): Intl.NumberFormat {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    // `true` e non il default "auto": in italiano si raggruppa anche il
    // migliaio a 4 cifre ("3.158,27"), l'euristica "min2" di Intl lo
    // ometterebbe sotto le 10.000.
    useGrouping: true,
  });
}

/**
 * Prezzo materie prime: 2 decimali + separatore delle migliaia
 * (es. 13542.8209 -> "13.542,82"). La precisione piena resta nel dato
 * grezzo e nell'export/API.
 */
export function formatCommodityPrice(value: number): string {
  return nf(2).format(value);
}

/**
 * Prezzo carburante: 3 decimali. Al distributore i millesimi di
 * euro/litro sono significativi, quindi non li tronchiamo a 2.
 */
export function formatFuelPrice(value: number): string {
  return nf(3).format(value);
}

/**
 * Percentuale con segno esplicito e minus tipografico
 * (es. "+6,2%", "−1,4%"). Il segno "−" (U+2212) non "-": si allinea
 * meglio in `tabular-nums` ed è quello corretto per un numero negativo.
 */
export function formatPercent(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${nf(digits).format(Math.abs(value))}%`;
}

/**
 * Abbreviazione di un'unità così come la scrive la fonte. Le stringhe
 * possibili sono poche e note (vedi `TRACKED_COMMODITIES` e i fetcher
 * carburanti) — mappa esplicita. Se arriva un'unità non prevista si
 * ritorna la stringa originale: meglio "brutta ma completa" che
 * un'informazione persa in silenzio.
 */
const UNIT_LABELS: Record<string, string> = {
  "dollars per barrel": "$/barile",
  "dollars per million btu": "$/MMBtu",
  "dollar per metric ton": "$/t",
  "dollars per metric ton": "$/t",
  "cents per pound": "¢/lb",
  "cents per kg": "¢/kg",
  "eur/l": "€/L",
  "usd/l": "$/L",
};

export function shortUnit(unit: string): string {
  return UNIT_LABELS[unit.toLowerCase()] ?? unit;
}

/** "€/L" / "$/L" a partire dal codice ISO 4217 della valuta. */
export function fuelUnitFromCurrency(currency: string): string {
  const symbol =
    currency === "EUR" ? "€" : currency === "USD" ? "$" : currency;
  return `${symbol}/L`;
}

/** Solo il simbolo della valuta ("€" / "$"), per contesti dove l'unità
 *  "per litro" è già chiara dall'intestazione di colonna. */
export function currencySymbol(currency: string): string {
  return currency === "EUR" ? "€" : currency === "USD" ? "$" : currency;
}

/**
 * Importo in euro espresso in miliardi, con un decimale (es. 26700000000 ->
 * "26,7 miliardi di €"). Pensato per il "numero del giorno" (Fase 3):
 * una cifra istituzionale annuale, non un prezzo — non riusa `nf(2)` come
 * i prezzi perché un miliardo con 2 decimali ("26,70 miliardi") implica
 * una precisione che una cifra di bilancio dichiarata "circa" non ha.
 */
export function formatBillionsEur(valueEur: number): string {
  const billions = valueEur / 1_000_000_000;
  return `${nf(1).format(billions)} miliardi di €`;
}

/**
 * Data in formato it-IT (es. "03/09/2026"). Era definita solo dentro
 * page.tsx: spostata qui perché ora serve anche alle pagine /paese/[slug],
 * ed è comunque formattazione — lo stesso motivo per cui vive questo file.
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
