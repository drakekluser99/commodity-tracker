import { eq, desc } from "drizzle-orm";
import { db } from "./client";
import { commodities, priceHistory, regions, retailFuelPrices } from "./schema";

export interface LatestCommodityPrice {
  symbol: string;
  name: string;
  category: string;
  unit: string;
  price: string;
  recordedAt: Date;
}

export interface LatestFuelPrice {
  regionName: string;
  continent: string;
  fuelType: string;
  price: string;
  currency: string;
  recordedAt: Date;
}

/**
 * Prende l'ultimo prezzo registrato per ogni materia prima globale.
 *
 * Approccio: leggiamo tutto lo storico unito all'anagrafica, ordinato
 * dal più recente, poi teniamo solo la PRIMA occorrenza di ogni symbol
 * incontrata durante il ciclo (che, essendo l'array ordinato per data
 * decrescente, è per forza la più recente). Con poche centinaia di righe
 * come le nostre va benissimo; se il dataset crescesse molto, si
 * passerebbe a una query SQL con DISTINCT ON per farlo fare al database
 * invece che a JavaScript.
 */
export async function getLatestCommodityPrices(): Promise<
  LatestCommodityPrice[]
> {
  const rows = await db
    .select({
      symbol: commodities.symbol,
      name: commodities.name,
      category: commodities.category,
      unit: commodities.unit,
      price: priceHistory.price,
      recordedAt: priceHistory.recordedAt,
    })
    .from(priceHistory)
    .innerJoin(commodities, eq(priceHistory.commodityId, commodities.id))
    .orderBy(desc(priceHistory.recordedAt));

  const seen = new Set<string>();
  const latest: LatestCommodityPrice[] = [];
  for (const row of rows) {
    if (seen.has(row.symbol)) continue;
    seen.add(row.symbol);
    latest.push(row);
  }
  return latest;
}

/** Stessa logica di sopra, ma per i prezzi carburanti regionali. */
export async function getLatestFuelPrices(): Promise<LatestFuelPrice[]> {
  const rows = await db
    .select({
      regionName: regions.name,
      continent: regions.continent,
      fuelType: retailFuelPrices.fuelType,
      price: retailFuelPrices.price,
      currency: retailFuelPrices.currency,
      recordedAt: retailFuelPrices.recordedAt,
    })
    .from(retailFuelPrices)
    .innerJoin(regions, eq(retailFuelPrices.regionId, regions.id))
    .orderBy(desc(retailFuelPrices.recordedAt));

  const seen = new Set<string>();
  const latest: LatestFuelPrice[] = [];
  for (const row of rows) {
    const key = `${row.regionName}:${row.fuelType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(row);
  }
  return latest;
}