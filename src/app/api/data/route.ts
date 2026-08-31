import {
  getLatestCommodityPrices,
  getLatestFuelPrices,
} from "@/lib/db/queries";

/**
 * Endpoint pubblico in sola lettura: espone in JSON gli stessi ultimi
 * prezzi mostrati sulla dashboard, per chi vuole riusarli in altri
 * progetti. CORS aperto a qualunque origine perché è pensato proprio per
 * il consumo da browser di terze parti; non c'è nessun dato personale né
 * operazione di scrittura.
 *
 * I prezzi sono i valori GREZZI come salvati dalla fonte: nessuna
 * conversione di visualizzazione (il cotone resta in "cents per pound",
 * non cents/kg come in tabella). `price` è numerico, le date sono ISO
 * 8601 in UTC.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Dati rigenerati a ogni richiesta, come la homepage: niente cache.
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET() {
  const [commodities, fuelPrices] = await Promise.all([
    getLatestCommodityPrices(),
    getLatestFuelPrices(),
  ]);

  const body = {
    generatedAt: new Date().toISOString(),
    commodities: commodities.map((c) => ({
      symbol: c.symbol,
      name: c.name,
      category: c.category,
      price: Number(c.price),
      unit: c.unit,
      recordedAt: c.recordedAt.toISOString(),
    })),
    fuelPrices: fuelPrices.map((f) => ({
      region: f.regionName,
      continent: f.continent,
      fuelType: f.fuelType,
      price: Number(f.price),
      currency: f.currency,
      recordedAt: f.recordedAt.toISOString(),
    })),
  };

  return Response.json(body, { headers: CORS_HEADERS });
}

// Preflight CORS: Next genererebbe un OPTIONS automatico, ma senza gli
// header Access-Control-*, quindi lo definiamo esplicitamente.
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
