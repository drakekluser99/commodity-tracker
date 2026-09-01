import { FreshnessConfig, FreshnessState, FRESHNESS_CONFIG } from './config';

export function computeFreshness(
  recordedAt: Date,
  config: FreshnessConfig,
  now: Date = new Date() // parametro esplicito, non new Date() interno: rende la funzione testabile
): FreshnessState {
  const daysSinceRecorded =
    (now.getTime() - recordedAt.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceRecorded <= config.expectedIntervalDays) return 'aggiornato';
  if (daysSinceRecorded <= config.expectedIntervalDays + config.graceDays) return 'in_attesa';
  return 'non_aggiornato';
}

// Costruisce la chiave di lookup: prova prima "source:symbol" (per Alpha
// Vantage, dove ogni commodity ha una cadenza diversa), poi ripiega su
// "source" da solo (per EU/USA fuel, dove tutta la fonte condivide la
// stessa cadenza). Se nessuna delle due esiste, NON restituisce un default
// silenzioso: lancia un errore esplicito, coerente con la filosofia del
// progetto di non nascondere mai un caso non gestito (vedi bug Alpha
// Vantage risolto in precedenza, causato proprio da un fallimento silenzioso).
export function getFreshnessConfig(source: string, symbol?: string): FreshnessConfig {
  const compositeKey = symbol ? `${source}:${symbol}` : null;
  if (compositeKey && FRESHNESS_CONFIG[compositeKey]) {
    return FRESHNESS_CONFIG[compositeKey];
  }
  if (FRESHNESS_CONFIG[source]) {
    return FRESHNESS_CONFIG[source];
  }
  throw new Error(
    `Nessuna configurazione di freshness trovata per source="${source}"` +
    (symbol ? ` symbol="${symbol}"` : '') +
    ` — aggiungi una voce in FRESHNESS_CONFIG (src/lib/freshness/config.ts)`
  );
}
