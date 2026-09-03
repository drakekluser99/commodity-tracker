import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { regions, retailFuelPrices } from "@/lib/db/schema";

/**
 * Salvataggio massivo dei prezzi al consumo, per il backfill dello storico.
 *
 * Sta in un file suo e non dentro saveUsFuelPrices/saveEuFuelPrices perché
 * non è specifico di nessuna delle due fonti: prende punti già normalizzati
 * con il nome della regione accanto, e li scrive. La differenza fra EU e USA
 * (nomi paese contro "United States", euro contro dollari, litri contro
 * galloni) è già stata risolta a monte dai rispettivi fetcher.
 *
 * Vedi savePricePointsBulk per il ragionamento sui blocchi da 500: con il
 * driver `neon-http` ogni query è una richiesta HTTP, e le funzioni scritte
 * per due punti a run diventano inservibili su tremila.
 */
const INSERT_CHUNK_SIZE = 500;

export interface RetailFuelBulkPoint {
  regionName: string;
  countryCode: string | null;
  continent: string;
  fuelType: "petrol" | "diesel";
  pricePerLiter: number;
  currency: string;
  date: string; // YYYY-MM-DD
}

export async function saveRetailFuelPricesBulk(
  points: RetailFuelBulkPoint[],
  source: string,
  onProgress?: (written: number, total: number) => void
) {
  if (points.length === 0) return 0;

  const retrievedAt = new Date();

  // Passo 1: le regioni. Come per le commodities, i punti sono migliaia ma
  // le regioni distinte sono al massimo 27: si deduplica in memoria prima
  // di toccare il database.
  const regionSeed = new Map<string, RetailFuelBulkPoint>();
  for (const point of points) {
    if (!regionSeed.has(point.regionName)) {
      regionSeed.set(point.regionName, point);
    }
  }

  const regionIdByName = new Map<string, number>();
  for (const point of regionSeed.values()) {
    // `onConflictDoUpdate` e non `DoNothing` come nei fetcher esistenti:
    // `DoNothing` non restituisce nulla quando la riga c'è già, costringendo
    // a una seconda query per recuperare l'id. Aggiornando (anche con gli
    // stessi valori) la RETURNING dà sempre l'id, in una query sola.
    const [row] = await db
      .insert(regions)
      .values({
        name: point.regionName,
        countryCode: point.countryCode,
        continent: point.continent,
      })
      .onConflictDoUpdate({
        target: regions.name,
        set: { countryCode: point.countryCode, continent: point.continent },
      })
      .returning();
    regionIdByName.set(point.regionName, row.id);
  }

  // Passo 2: lo storico. La deduplica sulla tripletta (regione, carburante,
  // data) è obbligatoria prima di un INSERT massivo: due righe uguali nello
  // stesso statement fanno fallire l'intero blocco con "ON CONFLICT DO
  // UPDATE command cannot affect row a second time".
  const seen = new Set<string>();
  const rows: Array<{
    regionId: number;
    fuelType: string;
    price: string;
    currency: string;
    unit: string;
    recordedAt: Date;
    retrievedAt: Date;
    source: string;
  }> = [];

  for (const point of points) {
    const regionId = regionIdByName.get(point.regionName);
    if (regionId === undefined) continue;
    const key = `${regionId}|${point.fuelType}|${point.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      regionId,
      fuelType: point.fuelType,
      price: point.pricePerLiter.toString(),
      currency: point.currency,
      unit: "liter",
      recordedAt: new Date(point.date),
      retrievedAt,
      source,
    });
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    await db
      .insert(retailFuelPrices)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          retailFuelPrices.regionId,
          retailFuelPrices.fuelType,
          retailFuelPrices.recordedAt,
        ],
        // `excluded` è la riga che Postgres stava per inserire quando ha
        // trovato il conflitto. Serve perché in un INSERT multi-riga ogni
        // riga ha un prezzo diverso: un valore costante li appiattirebbe
        // tutti sullo stesso numero.
        set: {
          price: sql`excluded.price`,
          currency: sql`excluded.currency`,
          retrievedAt,
          source,
        },
      });
    written += chunk.length;
    onProgress?.(written, rows.length);
  }

  return written;
}
