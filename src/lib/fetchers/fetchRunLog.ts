import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { fetchRuns } from "@/lib/db/schema";

/**
 * Registrazione degli esiti dei cron di acquisizione nella tabella
 * `fetch_runs`.
 *
 * Regola: il logging NON deve mai far fallire il fetch vero. Se scrivere
 * su `fetch_runs` va storto (DB irraggiungibile) lo si logga su console e
 * si prosegue — l'osservabilità è un di più, non parte della pipeline.
 * Per questo `startFetchRun` può tornare `null` e `finishFetchRun` non fa
 * nulla se l'id è `null`.
 */

export async function startFetchRun(
  source: string,
  job: string
): Promise<number | null> {
  try {
    const [row] = await db
      .insert(fetchRuns)
      .values({ source, job })
      .returning({ id: fetchRuns.id });
    return row?.id ?? null;
  } catch (err) {
    console.error("fetch_runs: impossibile registrare l'inizio del run:", err);
    return null;
  }
}

export async function finishFetchRun(
  id: number | null,
  result: {
    ok: boolean;
    pointsSaved?: number;
    // La recordedAt più recente fra i punti effettivamente salvati in
    // questo run — non "adesso". Opzionale: un run fallito prima di
    // salvare nulla, o un fetcher che non la calcola ancora, non ce l'ha.
    latestRecordedAt?: Date | null;
    errorText?: string;
  }
): Promise<void> {
  if (id === null) return;
  try {
    await db
      .update(fetchRuns)
      .set({
        finishedAt: new Date(),
        ok: result.ok,
        pointsSaved: result.pointsSaved ?? null,
        latestRecordedAt: result.latestRecordedAt ?? null,
        errorText: result.errorText ?? null,
      })
      .where(eq(fetchRuns.id, id));
  } catch (err) {
    console.error("fetch_runs: impossibile registrare la fine del run:", err);
  }
}

/** Estrae un messaggio leggibile da un errore di catch (`unknown`). */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
