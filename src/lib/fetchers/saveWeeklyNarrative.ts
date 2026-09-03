import { db } from "@/lib/db/client";
import { weeklyNarratives } from "@/lib/db/schema";
import type { NarrativeEntry } from "@/lib/narrative/generateWeeklyNarrative";

/**
 * Salva le righe generate da generateWeeklyNarrative per una settimana.
 * Upsert sul vincolo (week_of, kind): se il cron rigira sulla stessa
 * settimana (es. un retry, o il bollettino corretto lo stesso giorno)
 * aggiorna il testo invece di accumulare righe duplicate — stesso pattern
 * di saveEuFuelPrices.ts.
 */
export async function saveWeeklyNarrative(
  weekOf: Date,
  entries: NarrativeEntry[]
): Promise<number> {
  let saved = 0;
  for (const entry of entries) {
    await db
      .insert(weeklyNarratives)
      .values({ weekOf, kind: entry.kind, text: entry.text })
      .onConflictDoUpdate({
        target: [weeklyNarratives.weekOf, weeklyNarratives.kind],
        set: { text: entry.text },
      });
    saved++;
  }
  return saved;
}
