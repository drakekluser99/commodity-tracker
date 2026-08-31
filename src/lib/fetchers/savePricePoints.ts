import { db } from "@/lib/db/client";
import { commodities, priceHistory } from "@/lib/db/schema";
import type { NormalizedPricePoint } from "./alphaVantage";

/**
 * Salva un elenco di prezzi normalizzati nel database.
 * Per ogni punto:
 *   1. assicura che la commodity esista in `commodities` (crea se manca)
 *   2. inserisce il prezzo in `price_history`
 *
 * Non è specifica di Alpha Vantage: qualunque fetcher futuro (EIA,
 * fonti europee...) che produce un NormalizedPricePoint può riusarla.
 */
export async function savePricePoints(
  points: NormalizedPricePoint[],
  source: string
) {
  // Un solo timestamp per l'intero batch: è un unico evento di
  // acquisizione. Distinto da `recordedAt` (la data del dato).
  const retrievedAt = new Date();
  let saved = 0;

  for (const point of points) {
    // `onConflictDoUpdate`: se il symbol esiste già (vincolo UNIQUE nello
    // schema), aggiorna nome/categoria/unità invece di fallire con un
    // errore di duplicato. Se non esiste, lo inserisce. Questo pattern
    // si chiama "upsert" (UPDATE + INSERT).
    const [commodity] = await db
      .insert(commodities)
      .values({
        symbol: point.symbol,
        name: point.name,
        category: point.category,
        unit: point.unit,
      })
      .onConflictDoUpdate({
        target: commodities.symbol,
        set: { name: point.name, category: point.category, unit: point.unit },
      })
      .returning();

    // Upsert sul vincolo unique (commodity_id, recorded_at): se il cron
    // rigira e la fonte ripropone la stessa data, aggiorniamo il prezzo
    // (magari ricalcolato dalla fonte) invece di inserire un duplicato.
    await db
      .insert(priceHistory)
      .values({
        commodityId: commodity.id,
        price: point.price.toString(), // `numeric` di Postgres si passa come stringa via Drizzle
        recordedAt: new Date(point.date),
        retrievedAt,
        source,
      })
      .onConflictDoUpdate({
        target: [priceHistory.commodityId, priceHistory.recordedAt],
        // Anche se il valore è identico, ri-vederlo dalla fonte è una
        // nuova acquisizione: aggiorniamo `retrievedAt`.
        set: { price: point.price.toString(), retrievedAt, source },
      });

    saved++;
  }

  return saved;
}
