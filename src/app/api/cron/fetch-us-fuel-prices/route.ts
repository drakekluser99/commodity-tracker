import { NextRequest, NextResponse } from "next/server";
import { fetchUsFuelPrices } from "@/lib/fetchers/eiaUs";
import { saveUsFuelPrices } from "@/lib/fetchers/saveUsFuelPrices";

export const maxDuration = 10;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "EIA_API_KEY non configurata" },
      { status: 500 }
    );
  }

  try {
    const points = await fetchUsFuelPrices(apiKey);
    const saved = await saveUsFuelPrices(points, "eia_us");

    return NextResponse.json({ ok: true, saved });
  } catch (err) {
    console.error("Errore nel cron fetch-us-fuel-prices:", err);
    return NextResponse.json({ error: "Fetch fallito" }, { status: 500 });
  }
}
