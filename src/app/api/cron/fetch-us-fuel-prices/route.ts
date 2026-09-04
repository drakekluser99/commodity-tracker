import { NextRequest, NextResponse } from "next/server";
import { fetchUsFuelPrices } from "@/lib/fetchers/eiaUs";
import { saveUsFuelPrices } from "@/lib/fetchers/saveUsFuelPrices";
import {
  startFetchRun,
  finishFetchRun,
  errorMessage,
} from "@/lib/fetchers/fetchRunLog";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

export const maxDuration = 10;

const SOURCE = "eia_us";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const runId = await startFetchRun(SOURCE, "fetch-us-fuel-prices");

  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) {
    await finishFetchRun(runId, {
      ok: false,
      errorText: "EIA_API_KEY non configurata",
    });
    return NextResponse.json(
      { error: "EIA_API_KEY non configurata" },
      { status: 500 }
    );
  }

  try {
    const points = await fetchUsFuelPrices(apiKey);
    const { saved, latestRecordedAt } = await saveUsFuelPrices(
      points,
      SOURCE,
      runId
    );

    await finishFetchRun(runId, {
      ok: true,
      pointsSaved: saved,
      latestRecordedAt,
    });
    return NextResponse.json({ ok: true, saved });
  } catch (err) {
    console.error("Errore nel cron fetch-us-fuel-prices:", err);
    await finishFetchRun(runId, { ok: false, errorText: errorMessage(err) });
    return NextResponse.json({ error: "Fetch fallito" }, { status: 500 });
  }
}
