import { NextRequest, NextResponse } from "next/server";
import { fetchEuFuelPrices } from "@/lib/fetchers/euOilBulletin";
import { saveEuFuelPrices } from "@/lib/fetchers/saveEuFuelPrices";
import {
  startFetchRun,
  finishFetchRun,
  errorMessage,
} from "@/lib/fetchers/fetchRunLog";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

export const maxDuration = 10;

const SOURCE = "eu_weekly_oil_bulletin";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const runId = await startFetchRun(SOURCE, "fetch-eu-fuel-prices");

  try {
    const points = await fetchEuFuelPrices();
    const saved = await saveEuFuelPrices(points, SOURCE);

    await finishFetchRun(runId, { ok: true, pointsSaved: saved });
    return NextResponse.json({ ok: true, saved });
  } catch (err) {
    console.error("Errore nel cron fetch-eu-fuel-prices:", err);
    await finishFetchRun(runId, { ok: false, errorText: errorMessage(err) });
    return NextResponse.json({ error: "Fetch fallito" }, { status: 500 });
  }
}
