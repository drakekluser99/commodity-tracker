import { NextRequest, NextResponse } from "next/server";
import { fetchEuFuelHistory } from "@/lib/fetchers/euOilBulletinHistory";
import { saveEuFuelPrices } from "@/lib/fetchers/saveEuFuelPrices";
import { saveWeeklyNarrative } from "@/lib/fetchers/saveWeeklyNarrative";
import { getLastTwoEuropeFuelWeeks } from "@/lib/db/queries";
import { generateWeeklyNarrative } from "@/lib/narrative/generateWeeklyNarrative";
import {
  startFetchRun,
  finishFetchRun,
  errorMessage,
} from "@/lib/fetchers/fetchRunLog";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

// 60 secondi e non i 10 di prima. Il file storico pesa 4,3 MB contro le
// poche centinaia di KB del bollettino settimanale, e ExcelJS lo apre per
// intero — sette fogli, uno dei quali con dodicimila righe. Sulla rete di
// Vercel il download è veloce (la run automatica del 3 set ha scaricato il
// file settimanale in 1,7 s contro i 20 s da una linea domestica), ma il
// parsing non lo è, e un timeout qui si presenterebbe come `ok: false` in
// `fetch_runs` senza dire che è stata solo questione di tempo.
//
// 60 s è il massimo consentito dal piano Hobby. La durata reale della
// prima run va letta in `fetch_runs` (`finished_at` meno `started_at`):
// se si avvicina al limite, la strada è leggere il file in streaming
// invece di caricarlo tutto in memoria.
export const maxDuration = 60;

const SOURCE = "eu_weekly_oil_bulletin";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const runId = await startFetchRun(SOURCE, "fetch-eu-fuel-prices");

  try {
    // `latestOnly`: il file contiene vent'anni di settimane, ma al cron
    // serve solo l'ultima. Senza questo ogni giovedì riscriverebbe ~56.000
    // righe per aggiornarne 54 — inutile, e su `neon-http` lentissimo. Lo
    // storico completo lo carica una tantum scripts/backfill.ts.
    const points = await fetchEuFuelHistory({ latestOnly: true });
    const { saved, latestRecordedAt } = await saveEuFuelPrices(
      points,
      SOURCE,
      runId
    );

    // "Cosa è cambiato questa settimana": generata DOPO il salvataggio,
    // confrontando le due settimane più recenti ora in tabella (quella
    // appena arrivata e quella precedente). In un try/catch separato dal
    // resto: i prezzi sono già salvati correttamente a questo punto, un
    // errore qui è un arricchimento mancato, non un fallimento del cron —
    // non deve far segnare `ok: false` in fetch_runs per un dato che in
    // realtà è arrivato.
    try {
      const { current, previous, currentDate } =
        await getLastTwoEuropeFuelWeeks();
      if (current.length > 0 && previous.length > 0 && currentDate) {
        const entries = generateWeeklyNarrative(current, previous);
        await saveWeeklyNarrative(currentDate, entries);
      }
    } catch (err) {
      console.error(
        "Errore nella generazione di 'cosa è cambiato questa settimana':",
        err
      );
    }

    await finishFetchRun(runId, {
      ok: true,
      pointsSaved: saved,
      latestRecordedAt,
    });
    return NextResponse.json({ ok: true, saved });
  } catch (err) {
    console.error("Errore nel cron fetch-eu-fuel-prices:", err);
    await finishFetchRun(runId, { ok: false, errorText: errorMessage(err) });
    return NextResponse.json({ error: "Fetch fallito" }, { status: 500 });
  }
}
