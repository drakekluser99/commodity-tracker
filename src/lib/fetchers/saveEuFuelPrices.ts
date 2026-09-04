import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { regions, retailFuelPrices } from "@/lib/db/schema";
import type { EuFuelHistoryPoint } from "./euOilBulletinHistory";
import {
  logCorrectionIfChanged,
  toNumberOrNull,
  latestOf,
} from "./correctionsLog";

/**
 * Come savePricePoints.ts ma per il dominio "regioni/carburanti al
 * consumo" invece che "commodities di mercato globali". Stesso pattern:
 * upsert dell'anagrafica (qui `regions`), poi insert dello storico.
 */
export async function saveEuFuelPrices(
  points: EuFuelHistoryPoint[],
  source: string,
  runId: number | null = null
) {
  // Un solo timestamp di acquisizione per l'intero run (vedi
  // savePricePoints): distinto da `recordedAt`, la data del dato.
  const retrievedAt = new Date();
  let saved = 0;
  const recordedDates: Date[] = [];

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

    const recordedAt = new Date(point.date);

    // Letta PRIMA dell'upsert, per sapere cosa c'era in tabella prima di
    // sovrascriverlo. `saveEuFuelPrices` gestisce ~54 punti a settimana
    // (27 paesi × 2 carburanti): una SELECT in più per punto è
    // trascurabile, a differenza del backfill (vedi saveRetailFuelBulk.ts).
    const existing = await db.query.retailFuelPrices.findFirst({
      where: and(
        eq(retailFuelPrices.regionId, regionId),
        eq(retailFuelPrices.fuelType, point.fuelType),
        eq(retailFuelPrices.recordedAt, recordedAt)
      ),
    });

    // Upsert sul vincolo unique (region_id, fuel_type, recorded_at):
    // il bollettino settimanale può essere ripubblicato con valori
    // rivisti per la stessa settimana — in quel caso aggiorniamo.
    await db
      .insert(retailFuelPrices)
      .values({
        regionId,
        fuelType: point.fuelType,
        price: point.pricePerLiter.toString(),
        // `?? null` e non `?.toString()`: un netto assente deve restare NULL
        // in colonna, non diventare la stringa "undefined". Stessa logica
        // per accisa e IVA, aggiunte in Fase 3.
        priceNet: point.priceNetPerLiter?.toString() ?? null,
        exciseEur: point.exciseEurPerLiter?.toString() ?? null,
        vatRatePercent: point.vatRatePercent?.toString() ?? null,
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
          priceNet: point.priceNetPerLiter?.toString() ?? null,
          exciseEur: point.exciseEurPerLiter?.toString() ?? null,
          vatRatePercent: point.vatRatePercent?.toString() ?? null,
          currency: point.currency,
          retrievedAt,
          source,
        },
      });

    // Quattro campi possono essere corretti indipendentemente — il
    // bollettino può rivedere l'accisa senza toccare il prezzo lordo, per
    // esempio. `logCorrectionIfChanged` scarta da sé i casi in cui non
    // c'è una vera differenza (vedi correctionsLog.ts), quindi chiamarla
    // quattro volte "a vuoto" quando nulla è cambiato non scrive nulla.
    const label = `${point.countryName} ${point.fuelType}`;
    await Promise.all([
      logCorrectionIfChanged({
        tableName: "retail_fuel_prices",
        entityLabel: label,
        field: "price",
        oldValue: toNumberOrNull(existing?.price ?? null),
        newValue: point.pricePerLiter,
        recordedAt,
        source,
        runId,
      }),
      logCorrectionIfChanged({
        tableName: "retail_fuel_prices",
        entityLabel: label,
        field: "price_net",
        oldValue: toNumberOrNull(existing?.priceNet ?? null),
        newValue: point.priceNetPerLiter ?? null,
        recordedAt,
        source,
        runId,
      }),
      logCorrectionIfChanged({
        tableName: "retail_fuel_prices",
        entityLabel: label,
        field: "excise_eur",
        oldValue: toNumberOrNull(existing?.exciseEur ?? null),
        newValue: point.exciseEurPerLiter ?? null,
        recordedAt,
        source,
        runId,
      }),
      logCorrectionIfChanged({
        tableName: "retail_fuel_prices",
        entityLabel: label,
        field: "vat_rate_percent",
        oldValue: toNumberOrNull(existing?.vatRatePercent ?? null),
        newValue: point.vatRatePercent ?? null,
        recordedAt,
        source,
        runId,
      }),
    ]);

    recordedDates.push(recordedAt);
    saved++;
  }

  return { saved, latestRecordedAt: latestOf(recordedDates) };
}

async function findRegionIdByName(name: string): Promise<number | null> {
  const existing = await db.query.regions.findFirst({
    where: (r, { eq }) => eq(r.name, name),
  });
  return existing?.id ?? null;
}
