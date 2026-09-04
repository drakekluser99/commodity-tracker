import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { provinces, retailFuelPricesIt } from "@/lib/db/schema";
import { ALL_PROVINCES } from "@/lib/provinces";
import { averagePrice, type MimitFetchResult } from "./mimit";

/**
 * Salva il risultato già aggregato di fetchAndAggregateMimit(). Stesso
 * pattern in due passi di saveRetailFuelBulk.ts: prima l'anagrafica
 * (province), poi lo storico a blocchi.
 *
 * Le province NON si seminano dal CSV (a differenza di `regions` per
 * EU/US): sono un elenco chiuso e noto (le 107 di src/lib/provinces.ts),
 * quindi si upsertano tutte una volta, indipendentemente da quali sigle
 * compaiono nell'estrazione di oggi. Così una provincia temporaneamente
 * senza impianti in un CSV non sparisce dal registro.
 *
 * Non scrive in `data_corrections` (Fase 3, vedi schema.ts): ogni riga qui
 * è un'estrazione giornaliera indipendente, non la revisione di un dato già
 * pubblicato per la stessa data — a differenza del bollettino UE, che può
 * rivedere una settimana passata, il MIMIT non "corregge" il giorno prima,
 * pubblica il giorno dopo. Se questo cron girasse due volte nello stesso
 * giorno l'upsert aggiornerebbe comunque la media silenziosamente: è la
 * stessa estrazione vista due volte, non una correzione della fonte.
 */
export async function saveMimitPrices(result: MimitFetchResult, source: string) {
  const retrievedAt = new Date();

  // Passo 1: anagrafica province, tutte e 107, sempre.
  const provinceIdByCode = new Map<string, number>();
  for (const p of ALL_PROVINCES) {
    const [row] = await db
      .insert(provinces)
      .values({ code: p.code, name: p.name })
      .onConflictDoUpdate({
        target: provinces.code,
        set: { name: p.name },
      })
      .returning();
    provinceIdByCode.set(p.code, row.id);
  }

  // La data del dato è quella dell'estrazione MIMIT, non "adesso": se il
  // cron gira in ritardo o viene rilanciato a mano, `recordedAt` deve
  // restare la data che il file dichiara.
  const recordedAt = parseExtractedOn(result.extractedOn) ?? new Date();

  // Passo 2: unisce i bucket self/servito in una riga per (provincia,
  // carburante) — lo schema li vuole come due colonne della stessa riga,
  // non due righe separate (vedi retailFuelPricesIt in schema.ts).
  const merged = new Map<
    string,
    {
      provinceId: number;
      fuelType: string;
      priceSelfAvg: string | null;
      priceServedAvg: string | null;
      selfStationCount: number | null;
      servedStationCount: number | null;
    }
  >();

  for (const agg of result.aggregates) {
    const provinceId = provinceIdByCode.get(agg.provinceCode);
    if (provinceId === undefined) continue; // già segnalata in diagnostics.unknownProvinceCodes
    const key = `${provinceId}|${agg.fuelType}`;
    const existing = merged.get(key) ?? {
      provinceId,
      fuelType: agg.fuelType,
      priceSelfAvg: null,
      priceServedAvg: null,
      selfStationCount: null,
      servedStationCount: null,
    };
    const avg = averagePrice(agg).toFixed(4);
    if (agg.isSelf) {
      existing.priceSelfAvg = avg;
      existing.selfStationCount = agg.stationIds.size;
    } else {
      existing.priceServedAvg = avg;
      existing.servedStationCount = agg.stationIds.size;
    }
    merged.set(key, existing);
  }

  const rows = Array.from(merged.values()).map((r) => ({
    ...r,
    currency: "EUR",
    unit: "liter",
    recordedAt,
    retrievedAt,
    source,
  }));

  const CHUNK_SIZE = 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    await db
      .insert(retailFuelPricesIt)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          retailFuelPricesIt.provinceId,
          retailFuelPricesIt.fuelType,
          retailFuelPricesIt.recordedAt,
        ],
        set: {
          priceSelfAvg: sql`excluded.price_self_avg`,
          priceServedAvg: sql`excluded.price_served_avg`,
          selfStationCount: sql`excluded.self_station_count`,
          servedStationCount: sql`excluded.served_station_count`,
          retrievedAt,
          source,
        },
      });
    written += chunk.length;
  }

  return written;
}

/**
 * "Estrazione del gg/mm/aaaa" (o simile) -> Date. Ritorna `null` se il
 * formato non combacia — non ancora verificato contro una riga reale, vedi
 * il commento in mimit.ts. In quel caso il chiamante usa `new Date()`
 * (adesso) come ripiego, che è meglio di far fallire l'intero salvataggio
 * per una riga di metadata che non siamo riusciti a interpretare.
 */
function parseExtractedOn(line: string | null): Date | null {
  if (!line) return null;
  const match = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return Number.isNaN(date.getTime()) ? null : date;
}
