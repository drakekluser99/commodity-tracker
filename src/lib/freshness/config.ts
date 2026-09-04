export type FreshnessState = 'aggiornato' | 'in_attesa' | 'non_aggiornato';

export interface FreshnessConfig {
  expectedIntervalDays: number;
  graceDays: number;
  label: string; // solo per log/debug, non per la UI
}

export const FRESHNESS_CONFIG: Record<string, FreshnessConfig> = {
  // Energia: Alpha Vantage supporta davvero interval=daily per questi tre
  // (confermato dalla documentazione ufficiale). Grace di 3 giorni copre
  // un weekend di mercati chiusi più un margine per festività.
  'alpha_vantage:WTI': { expectedIntervalDays: 1, graceDays: 3, label: 'WTI (giornaliero)' },
  'alpha_vantage:BRENT': { expectedIntervalDays: 1, graceDays: 3, label: 'Brent (giornaliero)' },
  'alpha_vantage:NATURAL_GAS': { expectedIntervalDays: 1, graceDays: 3, label: 'Gas naturale (giornaliero)' },

  // Metalli e agricole: interval=daily richiesto dal fetcher ma ignorato
  // dall'API (questi endpoint supportano solo Monthly/Quarterly/Annual,
  // confermato dalla documentazione Alpha Vantage). Grace di 10 giorni:
  // le pubblicazioni mensili spesso slittano di settimane.
  'alpha_vantage:COPPER': { expectedIntervalDays: 30, graceDays: 10, label: 'Rame (mensile)' },
  'alpha_vantage:ALUMINUM': { expectedIntervalDays: 30, graceDays: 10, label: 'Alluminio (mensile)' },
  'alpha_vantage:WHEAT': { expectedIntervalDays: 30, graceDays: 10, label: 'Grano (mensile)' },
  'alpha_vantage:CORN': { expectedIntervalDays: 30, graceDays: 10, label: 'Mais (mensile)' },
  'alpha_vantage:COTTON': { expectedIntervalDays: 30, graceDays: 10, label: 'Cotone (mensile)' },
  'alpha_vantage:SUGAR': { expectedIntervalDays: 30, graceDays: 10, label: 'Zucchero (mensile)' },
  'alpha_vantage:COFFEE': { expectedIntervalDays: 30, graceDays: 10, label: 'Caffè (mensile)' },

  // Carburanti: pubblicazione settimanale su giorno fisso. Grace di 3
  // giorni copre un possibile ritardo occasionale della fonte.
  eu_weekly_oil_bulletin: { expectedIntervalDays: 7, graceDays: 3, label: 'Bollettino UE (settimanale)' },
  eia_us: { expectedIntervalDays: 7, graceDays: 3, label: 'EIA USA (settimanale)' },

  // MIMIT (Fase 4): il CSV si aggiorna ogni giorno (dato comunicato il
  // giorno prima). Grace di 2 giorni, più stretto delle fonti settimanali
  // sopra perché una cadenza giornaliera che salta un giorno è già un
  // segnale, non un weekend di mercati chiusi.
  mimit: { expectedIntervalDays: 1, graceDays: 2, label: 'MIMIT (giornaliero)' },
};
