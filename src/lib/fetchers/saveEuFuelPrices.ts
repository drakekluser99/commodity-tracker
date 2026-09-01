import { db } from "@/lib/db/client";
import { regions, retailFuelPrices } from "@/lib/db/schema";
import type { EuFuelPricePoint } from "./euOilBulletin";

/**
 * Come savePricePoints.ts ma per il dominio "regioni/carburanti al
 * consumo" invece che "commodities di mercato globali". Stesso pattern:
 * upsert dell'anagrafica (qui `regions`), poi insert dello storico.
 */
export async function saveEuFuelPrices(
  points: EuFuelPricePoint[],
  source: string
) {
  // Un solo timestamp di acquisizione per l'intero run (vedi
  // savePricePoints): distinto da `recordedAt`, la data del dato.
  const retrievedAt = new Date();
  let saved = 0;

  for (const point of points) {
    const [region] = await db
      .insert(regions)
      .values({
        name: point.countryName,
        countryCode: null, // potremmo mapparlo in futuro da un dizionario nome->ISO
        continent: "europe",
      })
      .onConflictDoNothing({ target: regions.name }) // se la regione esiste già, non serve aggiornarla (il nome non cambia)
      .returning();

    // Se onConflictDoNothing non ha inserito nulla (riga già esistente),
    // `region` è undefined: dobbiamo recuperare l'id esistente a parte.
    const regionId =
      region?.id ?? (await findRegionIdByName(point.countryName));

    if (!regionId) {
      console.error(`Impossibile risolvere la regione per ${point.countryName}`);
      continue;
    }

    // Upsert sul vincolo unique (region_id, fuel_type, recorded_at):
    // il bollettino settimanale può essere ripubblicato con valori
    // rivisti per la stessa settimana — in quel caso aggiorniamo.
    await db
      .insert(retailFuelPrices)
      .values({
        regionId,
        fuelType: point.fuelType,
        price: point.pricePerLiter.toString(),
        currency: point.currency,
        unit: "liter",
        recordedAt: new Date(point.date),
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

    saved++;
  }

  return saved;
}

async function findRegionIdByName(name: string): Promise<number | null> {
  const existing = await db.query.regions.findFirst({
    where: (r, { eq }) => eq(r.name, name),
  });
  return existing?.id ?? null;
}
