/**
 * Quanto è "vecchio" l'ultimo prezzo di una materia prima, e se va
 * segnalato come non aggiornato.
 *
 * Perché serve: `getLatestCommodityPrices` restituisce sempre l'ultimo
 * valore salvato, senza filtro sulla data. Se una fonte smette di
 * aggiornare (endpoint rotto, cron che fallisce, Alpha Vantage che non
 * pubblica più un simbolo) il sito continuerebbe a mostrare un numero
 * vecchio di mesi come se fosse attuale. Questo modulo calcola l'età del
 * dato e la confronta con una soglia che dipende dalla cadenza della
 * fonte, così la UI può mostrare un badge "non aggiornato" quando serve.
 */

export type CommodityCadence = "daily" | "monthly";

/**
 * Cadenza con cui la fonte pubblica ogni categoria.
 * - `energy` (WTI, Brent, Natural Gas): Alpha Vantage li aggiorna ogni
 *   giorno di mercato.
 * - `metal` / `agricultural` (le serie "Global Price of ..."): solo
 *   mensili, e per giunta con ~2-3 settimane di ritardo di pubblicazione.
 * Vedi anche i commenti in `alphaVantage.ts` e in `page.tsx`.
 */
export function commodityCadence(category: string): CommodityCadence {
  return category === "energy" ? "daily" : "monthly";
}

/**
 * Oltre quanti giorni un dato è "vecchio". NON è l'intervallo di
 * aggiornamento: è quell'intervallo + il ritardo tipico della fonte +
 * margine per qualche esecuzione di cron saltata. Tenuta larga di
 * proposito, così il badge non grida "al lupo" quando la fonte
 * semplicemente non ha ancora pubblicato il punto successivo.
 *
 * - `daily` → 14 giorni: le serie energia arrivano da EIA/FRED con
 *   qualche giorno di ritardo anche quando tutto funziona; 14 giorni
 *   significa che abbiamo perso più di una settimana di aggiornamenti.
 * - `monthly` → 75 giorni: a fine mese il punto mensile più recente è
 *   tipicamente quello di ~2 mesi prima (mensile + ritardo di
 *   pubblicazione ≈ 60 giorni è normale); 75 giorni significa che manca
 *   almeno una pubblicazione mensile.
 */
const STALE_AFTER_DAYS: Record<CommodityCadence, number> = {
  daily: 14,
  monthly: 75,
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface CommodityFreshness {
  /** true se il dato ha superato la soglia per la sua cadenza */
  stale: boolean;
  /** età del dato in giorni interi (arrotondata per difetto) */
  ageDays: number;
  cadence: CommodityCadence;
}

/**
 * `now` è iniettabile per rendere la funzione pura e testabile; in
 * `page.tsx` gli si passa un unico timestamp calcolato a inizio render.
 */
export function commodityFreshness(
  recordedAt: Date,
  category: string,
  now: Date
): CommodityFreshness {
  const cadence = commodityCadence(category);
  const ageDays = Math.floor((now.getTime() - recordedAt.getTime()) / MS_PER_DAY);
  return {
    stale: ageDays > STALE_AFTER_DAYS[cadence],
    ageDays,
    cadence,
  };
}
