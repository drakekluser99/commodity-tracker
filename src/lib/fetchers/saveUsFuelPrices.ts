import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { regions, retailFuelPrices } from "@/lib/db/schema";
import type { UsFuelPricePoint } from "./eiaUs";
import {
  logCorrectionIfChanged,
  toNumberOrNull,
  latestOf,
} from "./correctionsLog";

const US_REGION_NAME = "United States";

export async function saveUsFuelPrices(
  points: UsFuelPricePoint[],
  source: string,
  runId: number | null = null
) {
  const [region] = await db
    .insert(regions)
    .values({
      name: US_REGION_NAME,
      countryCode: "US",
      continent: "north_america",
    })
    .onConflictDoNothing({ target: regions.name })
    .returning();

  const regionId =
    region?.id ??
    (await db.query.regions.findFirst({
      where: (r, { eq }) => eq(r.name, US_REGION_NAME),
    }))?.id;

  if (!regionId) {
    throw new Error("Impossibile risolvere la regione United States");
  }

  // Timestamp di acquisizione unico per il run (vedi savePricePoints).
  const retrievedAt = new Date();
  let saved = 0;
  const recordedDates: Date[] = [];
  for (const point of points) {
    const recordedAt = new Date(point.date);

    // Letta prima dell'upsert — vedi savePricePoints per il perché. Solo
    // 2 punti a settimana (benzina, diesel): una SELECT in più è gratis.
    const existing = await db.query.retailFuelPrices.findFirst({
      where: and(
        eq(retailFuelPrices.regionId, regionId),
        eq(retailFuelPrices.fuelType, point.fuelType),
        eq(retailFuelPrices.recordedAt, recordedAt)
      ),
    });

    // Upsert sul vincolo unique (region_id, fuel_type, recorded_at):
    // se l'EIA rivede un valore settimanale già salvato lo aggiorniamo
    // invece di accumulare una riga in più.
    await db
      .insert(retailFuelPrices)
      .values({
        regionId,
        fuelType: point.fuelType,
        price: point.pricePerLiter.toString(),
        currency: point.currency,
        unit: "liter",
        recordedAt,
        retrievedAt,
        source,
      })
      .onConflictDoUpdate({
        target: [
          retailFuelPrices.regionId,
          retailFuelPrices.fuelType,
          retailFuelPrices.recordedAt,
        ],
        set: {
          price: point.pricePerLiter.toString(),
          currency: point.currency,
          retrievedAt,
          source,
        },
      });

    await logCorrectionIfChanged({
      tableName: "retail_fuel_prices",
      entityLabel: `United States ${point.fuelType}`,
      field: "price",
      oldValue: toNumberOrNull(existing?.price ?? null),
      newValue: point.pricePerLiter,
      recordedAt,
      source,
      runId,
    });

    recordedDates.push(recordedAt);
    saved++;
  }

  return { saved, latestRecordedAt: latestOf(recordedDates) };
}
