import { db } from "@/lib/db/client";
import { regions, retailFuelPrices } from "@/lib/db/schema";
import type { UsFuelPricePoint } from "./eiaUs";

const US_REGION_NAME = "United States";

export async function saveUsFuelPrices(
  points: UsFuelPricePoint[],
  source: string
) {
  const [region] = await db
    .insert(regions)
    .values({
      name: US_REGION_NAME,
      countryCode: "US",
      continent: "north_america",
    })
    .onConflictDoNothing()
    .returning();

  const regionId =
    region?.id ??
    (await db.query.regions.findFirst({
      where: (r, { eq }) => eq(r.name, US_REGION_NAME),
    }))?.id;

  if (!regionId) {
    throw new Error("Impossibile risolvere la regione United States");
  }

  let saved = 0;
  for (const point of points) {
    await db.insert(retailFuelPrices).values({
      regionId,
      fuelType: point.fuelType,
      price: point.pricePerLiter.toString(),
      currency: point.currency,
      unit: "liter",
      recordedAt: new Date(point.date),
      source,
    });
    saved++;
  }

  return saved;
}
