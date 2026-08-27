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

    await db.insert(priceHistory).values({
      commodityId: commodity.id,
      price: point.price.toString(), // `numeric` di Postgres si passa come stringa via Drizzle
      recordedAt: new Date(point.date),
      source,
    });

    saved++;
  }

  return saved;
}
