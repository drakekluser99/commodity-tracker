/**
 * Backfill dello storico prezzi.
 *
 *   npx tsx scripts/backfill.ts commodities [--from AAAA-MM-GG] [--only SIMBOLI] [--dry-run]
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
 *
 * `--only COTTON,SUGAR,COFFEE` limita la corsa ad alcuni simboli. Serve a
 * riprendere un backfill interrotto dalla quota di Alpha Vantage senza
 * riscaricare quelli già salvati: su ~25 richieste al giorno, condivise con
 * i cinque cron, ogni richiesta sprecata è un simbolo che non recuperi oggi.
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
  const fromDate = readFlag(rest, "--from");
  const only = readFlag(rest, "--only");

  if (fromDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    console.error(`Data non valida per --from: "${fromDate}". Attesa AAAA-MM-GG.`);
    process.exit(1);
  }

  if (target === "commodities") {
    await backfillCommodities({ fromDate, dryRun, only });
  } else if (target === "us-fuel") {
    await backfillUsFuel({ fromDate, dryRun });
  } else if (target === "eu-fuel") {
    await backfillEuFuel({ fromDate, dryRun });
  } else {
    console.error(USAGE);
    process.exit(1);
  }
}

const USAGE = `Uso: npx tsx scripts/backfill.ts <commodities|us-fuel|eu-fuel> [opzioni]

  --from AAAA-MM-GG   data di partenza dello storico (default: 10 anni fa)
  --only SIMBOLI      solo queste materie prime, separate da virgola
                      (es. --only COTTON,SUGAR,COFFEE)
  --dry-run           scarica e conta senza scrivere`;

/**
 * Legge un'opzione accettando sia `--nome=valore` sia `--nome valore`.
 *
 * Il ramo esplicito sull'indice non è pedanteria: `indexOf` restituisce -1
 * quando l'opzione manca, e `rest[-1 + 1]` è `rest[0]` — cioè il primo
 * argomento qualunque esso sia. Senza il controllo, `--dry-run` finirebbe
 * per essere letto come se fosse una data.
 */
function readFlag(args: string[], name: string): string | undefined {
  const inline = args.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
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
  only?: string;
}) {
  const { TRACKED_COMMODITIES, fetchCommoditySeries, intervalForCategory } =
    await import("../src/lib/fetchers/alphaVantage");

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ALPHA_VANTAGE_API_KEY non configurata. Mettila in .env.local."
    );
  }

  // `--only` esiste per una ragione precisa: il piano gratuito di Alpha
  // Vantage concede ~25 richieste al giorno, condivise con i cinque cron
  // quotidiani. Al primo lancio reale (3 set 2026) la quota si è esaurita
  // sulle ultime tre materie prime, e senza questo filtro riprenderle
  // significherebbe riscaricare anche le sette già salvate — sette
  // richieste su venticinque buttate per riscrivere righe identiche.
  const commodityList = selectCommodities(TRACKED_COMMODITIES, opts.only);

  // Default a 10 anni: senza limite il WTI giornaliero risale al 1986 e
  // scriverebbe decine di migliaia di righe che nessuna schermata mostra.
  // Il grafico più lungo del sito guarda 90 giorni; dieci anni lasciano
  // spazio a finestre annuali e a confronti storici senza gonfiare il
  // database.
  const fromDate = opts.fromDate ?? tenYearsAgo();
  console.log(
    `Backfill materie prime da ${fromDate} — ${commodityList.length} di ${TRACKED_COMMODITIES.length} simboli, ${commodityList.length} richieste ad Alpha Vantage\n`
  );

  const all: Awaited<ReturnType<typeof fetchCommoditySeries>> = [];

  for (let i = 0; i < commodityList.length; i++) {
    const commodity = commodityList[i];
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

/**
 * Filtra le materie prime in base a `--only`.
 *
 * Fallisce forte su un simbolo sconosciuto invece di ignorarlo: un refuso
 * come `--only COTON` che si limitasse a non trovare nulla lascerebbe
 * credere che il backfill sia andato a buon fine su zero righe. Lo stesso
 * principio del lookup in src/lib/freshness/compute.ts — mai un default
 * silenzioso su una configurazione sbagliata.
 */
function selectCommodities<T extends { readonly symbol: string }>(
  all: readonly T[],
  only: string | undefined
): readonly T[] {
  if (!only) return all;

  const wanted = only
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const known = new Set(all.map((c) => c.symbol));
  const unknown = wanted.filter((s) => !known.has(s));
  if (unknown.length > 0) {
    console.error(
      `Simboli sconosciuti in --only: ${unknown.join(", ")}\n` +
        `Disponibili: ${all.map((c) => c.symbol).join(", ")}`
    );
    process.exit(1);
  }

  // Si filtra `all` invece di mappare `wanted`: così l'ordine resta quello
  // canonico di TRACKED_COMMODITIES e un simbolo ripetuto per errore
  // sulla riga di comando non produce due richieste.
  return all.filter((c) => wanted.includes(c.symbol));
}

/**
 * Carburanti al consumo UE dal file storico della Commissione.
 *
 * Un solo download da 4,3 MB copre tutto: 27 paesi, due carburanti, tutte
 * le settimane dal 2005, con il prezzo alla pompa E quello al netto delle
 * imposte. La differenza fra i due è il carico fiscale — il dato che il
 * sito non poteva calcolare prima di questo file.
 *
 * Il default a 10 anni vale anche qui: sono già ~28.000 righe (52
 * settimane × 10 anni × 27 paesi × 2 carburanti). Andare al 2005 ne
 * triplicherebbe il numero per finestre che nessuna schermata mostra.
 */
async function backfillEuFuel(opts: { fromDate?: string; dryRun: boolean }) {
  const { fetchEuFuelHistory } = await import(
    "../src/lib/fetchers/euOilBulletinHistory"
  );

  const fromDate = opts.fromDate ?? tenYearsAgo();
  console.log(`Backfill carburanti UE da ${fromDate}`);
  console.log("  scaricamento del file storico (~4,3 MB)...");

  const points = await fetchEuFuelHistory({ fromDate });
  const dates = [...new Set(points.map((p) => p.date))].sort();
  const conNetto = points.filter((p) => p.priceNetPerLiter !== null).length;
  const conAccisa = points.filter((p) => p.exciseEurPerLiter !== null).length;
  const conIva = points.filter((p) => p.vatRatePercent !== null).length;

  console.log(
    `  ${points.length} rilevazioni  ${dates[0]} → ${dates[dates.length - 1]}  (${dates.length} settimane)`
  );
  console.log(
    `  con prezzo netto: ${conNetto} su ${points.length} — le altre non avranno scomposizione fiscale`
  );
  console.log(
    `  con accisa: ${conAccisa} su ${points.length} · con aliquota IVA: ${conIva} su ${points.length}`
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
      regionName: p.countryName,
      // Il codice ISO non lo scriviamo: `regions.country_code` è già
      // popolato (o già null) dal fetcher settimanale, e sovrascriverlo da
      // qui significherebbe che due fetcher si contendono la stessa
      // colonna. Una cosa per volta.
      countryCode: null,
      continent: "europe",
      fuelType: p.fuelType,
      pricePerLiter: p.pricePerLiter,
      priceNetPerLiter: p.priceNetPerLiter,
      exciseEurPerLiter: p.exciseEurPerLiter,
      vatRatePercent: p.vatRatePercent,
      currency: p.currency,
      date: p.date,
    })),
    "eu_weekly_oil_bulletin",
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
