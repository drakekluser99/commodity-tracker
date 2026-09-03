/**
 * Backfill dello storico prezzi.
 *
 *   npx tsx scripts/backfill.ts commodities [--from AAAA-MM-GG] [--dry-run]
 *   npx tsx scripts/backfill.ts us-fuel     [--from AAAA-MM-GG] [--dry-run]
 *
 * Perché uno script e non una rotta di cron: è un'operazione una tantum, che
 * dura minuti e scrive migliaia di righe. Una funzione serverless di Vercel
 * verrebbe uccisa dal timeout, e comunque non è lavoro che deve ripetersi.
 *
 * È IDEMPOTENTE: sia savePricePointsBulk sia saveRetailFuelPricesBulk fanno
 * upsert sulle stesse chiavi uniche del cron quotidiano. Rilanciarlo non
 * duplica niente, e se s'interrompe a metà si rilancia e basta.
 *
 * `--dry-run` scarica e conta senza scrivere: il modo giusto di vedere quanti
 * punti arriverebbero, e da che data, prima di toccare il database.
 */
import "dotenv/config";
import { config } from "dotenv";

// Next carica .env.local da sé, tsx no: senza questa riga DATABASE_URL non
// esiste e src/lib/db/client.ts lancia l'errore che spiega esattamente
// questo. `override: false` per non calpestare variabili già nell'ambiente.
config({ path: ".env.local", override: false });

// Gli import che toccano il database vanno DOPO il caricamento delle
// variabili: `client.ts` legge process.env.DATABASE_URL al momento
// dell'import, non alla prima query. Con un import statico in cima al file
// verrebbe valutato prima di config() e fallirebbe sempre.
async function main() {
  const [target, ...rest] = process.argv.slice(2);
  const dryRun = rest.includes("--dry-run");
  // Accetta sia `--from=2015-01-01` sia `--from 2015-01-01`. L'indexOf va
  // controllato: senza il ramo esplicito, quando `--from` manca indexOf
  // restituisce -1 e `rest[0]` finirebbe per essere letto come data —
  // passando "--dry-run" al posto di un giorno.
  const eqArg = rest.find((a) => a.startsWith("--from="));
  const spaceIdx = rest.indexOf("--from");
  const fromDate = eqArg
    ? eqArg.slice("--from=".length)
    : spaceIdx >= 0
      ? rest[spaceIdx + 1]
      : undefined;

  if (fromDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    console.error(`Data non valida per --from: "${fromDate}". Attesa AAAA-MM-GG.`);
    process.exit(1);
  }

  if (target === "commodities") {
    await backfillCommodities({ fromDate, dryRun });
  } else if (target === "us-fuel") {
    await backfillUsFuel({ fromDate, dryRun });
  } else {
    console.error(
      "Uso: npx tsx scripts/backfill.ts <commodities|us-fuel> [--from AAAA-MM-GG] [--dry-run]"
    );
    process.exit(1);
  }
}

/**
 * Materie prime globali da Alpha Vantage.
 *
 * Il punto chiave: NON servono chiamate aggiuntive alla fonte. Ogni risposta
 * di Alpha Vantage contiene già l'intera serie storica — il cron quotidiano
 * ne usava solo il primo elemento e buttava il resto. Qui si fanno le stesse
 * dieci chiamate del cron, tenendo tutto.
 *
 * Restano sequenziali con pausa per la stessa ragione documentata in
 * alphaVantage.ts: il piano gratuito limita anche le connessioni simultanee,
 * non solo il conteggio nel tempo, e le richieste parallele fallivano in
 * silenzio con HTTP 200.
 */
async function backfillCommodities(opts: {
  fromDate?: string;
  dryRun: boolean;
}) {
  const { TRACKED_COMMODITIES, fetchCommoditySeries, intervalForCategory } =
    await import("../src/lib/fetchers/alphaVantage");

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ALPHA_VANTAGE_API_KEY non configurata. Mettila in .env.local."
    );
  }

  // Default a 10 anni: senza limite il WTI giornaliero risale al 1986 e
  // scriverebbe decine di migliaia di righe che nessuna schermata mostra.
  // Il grafico più lungo del sito guarda 90 giorni; dieci anni lasciano
  // spazio a finestre annuali e a confronti storici senza gonfiare il
  // database.
  const fromDate = opts.fromDate ?? tenYearsAgo();
  console.log(`Backfill materie prime da ${fromDate}\n`);

  const all: Awaited<ReturnType<typeof fetchCommoditySeries>> = [];

  for (let i = 0; i < TRACKED_COMMODITIES.length; i++) {
    const commodity = TRACKED_COMMODITIES[i];
    if (i > 0) await sleep(2000);

    const interval = intervalForCategory(commodity.category);
    try {
      const series = await fetchCommoditySeries(commodity, apiKey, {
        interval,
        fromDate,
      });
      const oldest = series[series.length - 1]?.date ?? "—";
      const newest = series[0]?.date ?? "—";
      console.log(
        `  ${commodity.symbol.padEnd(12)} ${String(series.length).padStart(5)} punti  ${interval.padEnd(7)}  ${oldest} → ${newest}`
      );
      all.push(...series);
    } catch (err) {
      console.error(`  ${commodity.symbol.padEnd(12)} ERRORE:`, err);
    }
  }

  console.log(`\nTotale: ${all.length} rilevazioni.`);
  if (opts.dryRun) {
    console.log("--dry-run: niente è stato scritto.");
    return;
  }

  const { savePricePointsBulk } = await import(
    "../src/lib/fetchers/savePricePoints"
  );
  const written = await savePricePointsBulk(all, "alpha_vantage", (w, t) =>
    process.stdout.write(`\r  scrittura ${w}/${t}`)
  );
  console.log(`\nScritte ${written} righe in price_history.`);
}

/**
 * Carburanti al consumo USA dall'EIA. Una sola chiamata: la serie
 * settimanale completa sta sotto il tetto di 5.000 righe dell'API v2.
 */
async function backfillUsFuel(opts: { fromDate?: string; dryRun: boolean }) {
  const { fetchUsFuelHistory } = await import("../src/lib/fetchers/eiaUs");

  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) {
    throw new Error("EIA_API_KEY non configurata. Mettila in .env.local.");
  }

  const fromDate = opts.fromDate ?? tenYearsAgo();
  console.log(`Backfill carburanti USA da ${fromDate}\n`);

  const points = await fetchUsFuelHistory(apiKey, { fromDate });
  const dates = points.map((p) => p.date).sort();
  console.log(
    `  ${points.length} rilevazioni  ${dates[0]} → ${dates[dates.length - 1]}`
  );

  if (opts.dryRun) {
    console.log("--dry-run: niente è stato scritto.");
    return;
  }

  const { saveRetailFuelPricesBulk } = await import(
    "../src/lib/fetchers/saveRetailFuelBulk"
  );
  const written = await saveRetailFuelPricesBulk(
    points.map((p) => ({
      regionName: "United States",
      countryCode: "US",
      continent: "north_america",
      fuelType: p.fuelType,
      pricePerLiter: p.pricePerLiter,
      currency: p.currency,
      date: p.date,
    })),
    "eia_us",
    (w, t) => process.stdout.write(`\r  scrittura ${w}/${t}`)
  );
  console.log(`\nScritte ${written} righe in retail_fuel_prices.`);
}

function tenYearsAgo(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 10);
  return d.toISOString().slice(0, 10);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

main().catch((err) => {
  console.error("\nErrore:", err);
  process.exit(1);
});
