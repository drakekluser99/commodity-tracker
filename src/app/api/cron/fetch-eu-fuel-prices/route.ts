import { NextRequest, NextResponse } from "next/server";
import { fetchEuFuelPrices } from "@/lib/fetchers/euOilBulletin";
import { saveEuFuelPrices } from "@/lib/fetchers/saveEuFuelPrices";

export const maxDuration = 10;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const points = await fetchEuFuelPrices();
    const saved = await saveEuFuelPrices(points, "eu_weekly_oil_bulletin");

    return NextResponse.json({ ok: true, saved });
  } catch (err) {
    console.error("Errore nel cron fetch-eu-fuel-prices:", err);
    return NextResponse.json({ error: "Fetch fallito" }, { status: 500 });
  }
}
