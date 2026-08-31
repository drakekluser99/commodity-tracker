import { NextRequest, NextResponse } from "next/server";
import {
  fetchCommodityBatch,
  TRACKED_COMMODITIES,
} from "./alphaVantage";
import { savePricePoints } from "./savePricePoints";
import { startFetchRun, finishFetchRun, errorMessage } from "./fetchRunLog";

type Commodity = (typeof TRACKED_COMMODITIES)[number];

/**
 * Logica condivisa dalle 5 route del cron materie prime
 * (fetch-market-prices-1 … -5): autentica la richiesta, chiama Alpha
 * Vantage per il batch passato, salva i risultati nel database. Ogni
 * `route.ts` è solo un sottile wrapper che sceglie quale batch passare
 * qui e con quale etichetta (per i log).
 */
export async function runMarketPriceCron(
  request: NextRequest,
  batch: readonly Commodity[],
  batchLabel: string
) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Richiesta non autenticata: non è un tentativo di fetch, non lo
    // registriamo in fetch_runs.
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const runId = await startFetchRun(
    "alpha_vantage",
    `fetch-market-prices-${batchLabel}`
  );

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    await finishFetchRun(runId, {
      ok: false,
      errorText: "ALPHA_VANTAGE_API_KEY non configurata",
    });
    return NextResponse.json(
      { error: "ALPHA_VANTAGE_API_KEY non configurata" },
      { status: 500 }
    );
  }

  try {
    const points = await fetchCommodityBatch(batch, apiKey);
    const saved = await savePricePoints(points, "alpha_vantage");

    // `ok: true` = il run è arrivato in fondo senza eccezioni. NON vuol
    // dire "tutto salvato": se Alpha Vantage risponde con un rate limit
    // (HTTP 200 + campo Information) `fetchCommodityBatch` scarta quei
    // punti e `saved` può essere < di quanti ne attendevamo. Quel
    // confronto lo fa chi legge fetch_runs.
    await finishFetchRun(runId, { ok: true, pointsSaved: saved });
    return NextResponse.json({ ok: true, batch: batchLabel, saved });
  } catch (err) {
    console.error(`Errore nel cron fetch-market-prices-${batchLabel}:`, err);
    await finishFetchRun(runId, { ok: false, errorText: errorMessage(err) });
    return NextResponse.json({ error: "Fetch fallito" }, { status: 500 });
  }
}
