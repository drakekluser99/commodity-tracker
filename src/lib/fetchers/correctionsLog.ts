import { db } from "@/lib/db/client";
import { dataCorrections } from "@/lib/db/schema";

/**
 * Tolleranza sotto la quale due valori si considerano "lo stesso numero",
 * non una correzione. Serve perché in questo progetto un `numeric(_, 4)`
 * di Postgres torna da Drizzle come stringa, e passando per
 * `toFixed(4)`/conversioni valuta un valore può ripresentarsi con l'ultimo
 * decimale diverso di un'unità (es. "0.6730" vs "0.6731") senza che la
 * fonte abbia davvero rivisto nulla. 0.00005 è metà dell'ultimo decimale
 * tracciato ovunque in questo schema (4 cifre dopo la virgola).
 */
const EPSILON = 0.00005;

export interface CorrectionCandidate {
  tableName: string;
  entityLabel: string;
  field: string;
  oldValue: number | null;
  newValue: number | null;
  recordedAt: Date;
  source: string;
  runId: number | null;
}

/**
 * Confronta vecchio e nuovo valore per lo stesso campo della stessa riga e,
 * se sono davvero diversi, scrive una riga in `data_corrections`.
 *
 * Due casi in cui NON scrive nulla, entrambi deliberati:
 *   - `oldValue` è null: non è una correzione, è la prima volta che questo
 *     campo viene valorizzato (es. una riga di price_history salvata prima
 *     che esistesse la colonna, o una provincia MIMIT vista per la prima
 *     volta). Correggere il nulla non ha senso.
 *   - la differenza è sotto EPSILON: stesso valore, solo ri-scritto (il
 *     cron ha rigirato sulla stessa data e ha aggiornato `retrievedAt`).
 *
 * Come `fetch_runs` (vedi fetchRunLog.ts): il logging non deve MAI far
 * fallire il salvataggio vero. Se `data_corrections` non è scrivibile, si
 * logga su console e si prosegue — l'osservabilità è un di più.
 */
export async function logCorrectionIfChanged(
  candidate: CorrectionCandidate
): Promise<void> {
  const { oldValue, newValue } = candidate;
  if (oldValue === null || newValue === null) return;
  if (Math.abs(oldValue - newValue) < EPSILON) return;

  try {
    await db.insert(dataCorrections).values({
      tableName: candidate.tableName,
      entityLabel: candidate.entityLabel,
      field: candidate.field,
      oldValue: oldValue.toString(),
      newValue: newValue.toString(),
      recordedAt: candidate.recordedAt,
      source: candidate.source,
      runId: candidate.runId,
    });
  } catch (err) {
    console.error(
      "data_corrections: impossibile registrare la correzione:",
      err
    );
  }
}

/**
 * Converte in numero un valore `numeric` di Postgres letto via Drizzle
 * (arriva come stringa, o null se la colonna lo è). Helper piccolo ma
 * usato in ogni fetcher che confronta vecchio/nuovo valore — evita di
 * ripetere `x !== null ? Number(x) : null` in quattro file diversi.
 */
export function toNumberOrNull(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/** La più recente fra un elenco di date, o null se l'elenco è vuoto. */
export function latestOf(dates: Date[]): Date | null {
  if (dates.length === 0) return null;
  let max = dates[0];
  for (const d of dates) if (d.getTime() > max.getTime()) max = d;
  return max;
}
