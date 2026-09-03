import {
  getLatestCommodityPrices,
  getLatestFuelPrices,
  getCommodityPriceHistory,
  getFuelPriceHistory,
} from "@/lib/db/queries";
import { groupCommodityHistory, groupFuelHistory, priceMovers } from "@/lib/priceHistory";
import { displayCommodityPrice } from "@/lib/commodityDisplay";
import {
  formatCommodityPrice,
  formatFuelPrice,
  formatPercent,
  shortUnit,
  currencySymbol,
} from "@/lib/format";
import { computeFreshness, getFreshnessConfig } from "@/lib/freshness/compute";
import EuropeFuelMap from "@/components/EuropeFuelMap";
import FuelImpactCalculator from "@/components/FuelImpactCalculator";
import MobileNav from "@/components/MobileNav";
import { FuelPriceTable } from "@/components/FuelPriceTable";
import { DownloadDataButtons } from "@/components/DownloadDataButtons";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { ProvenanceStamp } from "@/components/ProvenanceStamp";
import { HeroBackdrop } from "@/components/HeroBackdrop";
import { TickerBand, type TickerStat } from "@/components/TickerBand";
import Link from "next/link";
import {
  Code2,
  Fuel,
  Globe2,
  Calculator,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

const GITHUB_URL = "https://github.com/drakekluser99/commodity-tracker";

const CATEGORY_LABELS: Record<string, string> = {
  energy: "Energia",
  metal: "Metalli",
  // "Agricoltura" (sostantivo) e non "Agricole": la label appare da sola
  // nella colonna Categoria ("Energia", "Metalli", ...), un aggettivo
  // plurale senza sostantivo suonerebbe storto.
  agricultural: "Agricoltura",
};

const CONTINENT_LABELS: Record<string, string> = {
  europe: "Europa",
  north_america: "Nord America",
  oceania: "Oceania",
  latam: "America Latina",
};

/**
 * Da quale fonte arriva ciascun continente, per poterne calcolare la
 * freschezza. `LatestFuelPrice` (src/lib/db/queries.ts) non porta il campo
 * `source` come fa `LatestCommodityPrice`: i carburanti sono identificati
 * dalla regione, e la fonte si deduce dal continente.
 *
 * Mappa ESPLICITA e non esaustiva di proposito: `getFreshnessConfig`
 * lancia un errore su una fonte sconosciuta (scelta voluta, vedi
 * src/lib/freshness/compute.ts). Un continente non elencato qui viene
 * semplicemente escluso dal conteggio delle fonti in linea, invece di far
 * saltare l'intera homepage. Se un domani aggiungiamo Oceania o LatAm,
 * basta aggiungere la riga qui e la voce corrispondente in
 * FRESHNESS_CONFIG.
 */
const CONTINENT_SOURCES: Record<string, string> = {
  europe: "eu_weekly_oil_bulletin",
  north_america: "eia_us",
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// Colonne dell'export della tabella materie prime. Le chiavi diventano
// le colonne del CSV e i campi del JSON; l'ordine qui è l'ordine nel file.
const COMMODITY_EXPORT_COLUMNS = [
  { key: "materia_prima", label: "Materia prima" },
  { key: "simbolo", label: "Simbolo" },
  { key: "categoria", label: "Categoria" },
  { key: "prezzo", label: "Prezzo" },
  { key: "unita", label: "Unità" },
  { key: "data", label: "Data" },
];

const NAV_ITEMS = [
  { href: "#mappa", label: "Mappa", icon: Globe2 },
  { href: "#calcolatore", label: "Cosa significa", icon: Calculator },
  { href: "#materie-prime", label: "Materie prime", icon: BarChart3 },
  { href: "#carburanti", label: "Carburanti", icon: Fuel },
];

export default async function Home() {
  // Le finestre dello storico girano QUI, lato server: `groupCommodityHistory`/
  // `groupFuelHistory` producono gli oggetti PriceSeries già pronti, e a
  // PriceHistoryChart (Client Component) passiamo solo quelli.
  //
  // Perché DUE finestre diverse e non una condivisa: Alpha Vantage pubblica
  // Brent e Natural Gas con cadenza giornaliera, ma Copper/Corn/Cotton solo
  // mensile (o più rada). Con soli 30 giorni il grafico non intercetta
  // nessuna rilevazione mensile e quelle serie sparivano dal selettore.
  // 90 giorni bastano a catturarne un paio. I carburanti invece sono già
  // tutti settimanali o più fitti: 30 giorni restano corretti per loro.
  //
  // Il disable qui sotto: questo è un Server Component async con
  // `export const dynamic = "force-dynamic"`, ri-renderizzato a ogni
  // richiesta — un timestamp "ora" è esattamente ciò che vogliamo. La
  // regola `react-hooks/purity` mira ai Client Component: qui è un falso
  // positivo.
  // eslint-disable-next-line react-hooks/purity
  const commodityHistorySince = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  // eslint-disable-next-line react-hooks/purity
  const fuelHistorySince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [commodityPrices, fuelPrices, commodityHistory, fuelHistory] =
    await Promise.all([
      getLatestCommodityPrices(),
      getLatestFuelPrices(),
      getCommodityPriceHistory(commodityHistorySince),
      getFuelPriceHistory(fuelHistorySince),
    ]);
  const commoditySeries = groupCommodityHistory(commodityHistory);

  // Timestamp unico per il calcolo di freschezza di tutte le righe (vedi
  // src/lib/freshness/compute.ts). Server Component force-dynamic,
  // ri-renderizzato a ogni richiesta: "ora" è esattamente ciò che serve.
  const now = new Date();

  // Conversione di sola visualizzazione (vedi src/lib/commodityDisplay.ts):
  // il cotone arriva dalla fonte in "cents per pound" e va mostrato in
  // "cents per kg". Il dato grezzo (`c.price`, `c.unit`) resta intatto —
  // qui deriviamo solo le stringhe da rendere. Per tutte le altre materie
  // prime `displayUnit === c.unit` e teniamo la stringa grezza così com'è,
  // che conserva la precisione esatta del valore salvato.
  const commodityRows = commodityPrices.map((c) => {
    const display = displayCommodityPrice(c.symbol, parseFloat(c.price), c.unit);
    const freshnessConfig = getFreshnessConfig(c.source, c.symbol);
    const ageDays = Math.floor(
      (now.getTime() - c.recordedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      ...c,
      displayPrice:
        display.unit === c.unit ? c.price : display.price.toFixed(4),
      displayUnit: display.unit,
      freshnessState: computeFreshness(c.recordedAt, freshnessConfig, now),
      freshnessLabel: freshnessConfig.label,
      ageDays,
    };
  });

  // Righe pronte per l'export (CSV/JSON lato client). Prezzo e unità sono
  // quelli di visualizzazione (già convertiti dove serve, es. cotone in
  // cents/kg); la data in ISO per essere ordinabile/parsabile.
  const commodityExportRows = commodityRows.map((c) => ({
    materia_prima: c.name,
    simbolo: c.symbol,
    categoria: CATEGORY_LABELS[c.category] ?? c.category,
    prezzo: c.displayPrice,
    unita: c.displayUnit,
    data: c.recordedAt.toISOString().slice(0, 10),
  }));
  const fuelSeries = groupFuelHistory(fuelHistory);

  // "Maggiori variazioni": prime/ultime rilevazioni di ogni serie. Le due
  // fonti hanno finestre diverse (materie prime 90gg, carburanti 30gg):
  // ce lo portiamo dietro per riga così la sezione può dichiararlo invece
  // di far credere a un confronto sullo stesso periodo. Ordine per
  // ampiezza assoluta della variazione, prime 5.
  const topMovers = [
    ...priceMovers(commoditySeries).map((m) => ({ ...m, windowDays: 90 })),
    ...priceMovers(fuelSeries).map((m) => ({ ...m, windowDays: 30 })),
  ]
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 5);

  const fuelsByContinent = new Map<string, typeof fuelPrices>();
  for (const fuel of fuelPrices) {
    const list = fuelsByContinent.get(fuel.continent) ?? [];
    list.push(fuel);
    fuelsByContinent.set(fuel.continent, list);
  }

  const europeFuelsByCountry = new Map<string, { petrol: number | null; diesel: number | null }>();
  for (const f of fuelsByContinent.get("europe") ?? []) {
    const existing = europeFuelsByCountry.get(f.regionName) ?? { petrol: null, diesel: null };
    if (f.fuelType === "petrol") existing.petrol = parseFloat(f.price);
    if (f.fuelType === "diesel") existing.diesel = parseFloat(f.price);
    europeFuelsByCountry.set(f.regionName, existing);
  }
  const europeanFuelData = Array.from(europeFuelsByCountry.entries()).map(
    ([countryName, data]) => ({ countryName, ...data })
  );

  function average(values: number[]): number | null {
    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  const europeFuels = fuelsByContinent.get("europe") ?? [];
  const europeAverage = {
    petrol: average(
      europeFuels.filter((f) => f.fuelType === "petrol").map((f) => parseFloat(f.price))
    ),
    diesel: average(
      europeFuels.filter((f) => f.fuelType === "diesel").map((f) => parseFloat(f.price))
    ),
    currency: "EUR",
  };

  const usFuels = fuelsByContinent.get("north_america") ?? [];
  const usAverage = {
    petrol: usFuels.find((f) => f.fuelType === "petrol")
      ? parseFloat(usFuels.find((f) => f.fuelType === "petrol")!.price)
      : null,
    diesel: usFuels.find((f) => f.fuelType === "diesel")
      ? parseFloat(usFuels.find((f) => f.fuelType === "diesel")!.price)
      : null,
    currency: "USD",
  };

  const allTimestamps = [
    ...commodityPrices.map((c) => c.recordedAt),
    ...fuelPrices.map((f) => f.recordedAt),
  ];
  const lastUpdated =
    allTimestamps.length > 0
      ? new Date(Math.max(...allTimestamps.map((d) => d.getTime())))
      : null;

  // Serie della curva disegnata in filigrana dietro il wordmark
  // (src/components/HeroBackdrop.tsx). Il Brent perché è la materia prima
  // più riconoscibile e l'unica con cadenza davvero giornaliera: la curva
  // ha abbastanza punti da avere una forma. Se la serie manca (primo
  // deploy, o cron non ancora girato) HeroBackdrop non disegna nulla.
  const heroSeries =
    commoditySeries.find((s) => s.key === "BRENT")?.points ?? [];

  /**
   * Variazione percentuale di una serie nella sua finestra, per la riga di
   * contesto sotto i valori della fascia. Riusa `priceMovers`, che salta
   * già le serie con meno di 2 punti e quelle con primo valore 0.
   */
  function seriesChangePct(
    series: typeof commoditySeries,
    key: string
  ): number | null {
    const found = priceMovers(series).find((m) => m.key === key);
    return found ? found.changePct : null;
  }

  /**
   * Quante fonti stanno pubblicando come previsto, sul totale di quelle
   * configurate. Non è una lettura di `fetch_runs` (quella dice se il
   * nostro cron è partito): dice se il DATO è arrivato, che è ciò che
   * interessa a chi legge.
   *
   * Una fonte è "in linea" se almeno una delle sue serie NON è nello
   * stato `non_aggiornato` — cioè se è `aggiornato` oppure `in_attesa`.
   * La prima versione contava solo `aggiornato` ed era troppo severa:
   * il Brent ha cadenza giornaliera con 3 giorni di tolleranza, quindi
   * ogni lunedì mattina — mercati chiusi nel weekend — la fascia avrebbe
   * annunciato "0 / 3 fonti in linea" su dati perfettamente normali
   * (successo davvero il 3 set 2026). `in_attesa` significa "stiamo
   * aspettando la prossima pubblicazione", che è il funzionamento
   * previsto, non un guasto: il guasto è `non_aggiornato`, ed è quello
   * che questo contatore deve segnalare.
   *
   * Espone in cima al sito il modello di freshness a 3 stati che finora
   * viveva solo come badge dentro la tabella delle materie prime.
   */
  const sourceStates = new Map<string, boolean>();
  for (const c of commodityRows) {
    const ok = sourceStates.get(c.source) ?? false;
    sourceStates.set(c.source, ok || c.freshnessState !== "non_aggiornato");
  }
  for (const [continent, fuels] of fuelsByContinent.entries()) {
    const source = CONTINENT_SOURCES[continent];
    if (!source) continue; // continente senza fonte mappata: fuori dal conteggio
    const mostRecent = new Date(
      Math.max(...fuels.map((f) => f.recordedAt.getTime()))
    );
    const state = computeFreshness(mostRecent, getFreshnessConfig(source), now);
    const ok = sourceStates.get(source) ?? false;
    sourceStates.set(source, ok || state !== "non_aggiornato");
  }
  const sourcesOnline = Array.from(sourceStates.values()).filter(Boolean).length;
  const sourcesTotal = sourceStates.size;

  // Fascia sintetica header (punto 25 del brief): valori derivati da dati
  // già recuperati sopra, nessuna nuova query. "n/d" quando la fonte non
  // ha ancora pubblicato nulla (es. subito dopo il primo deploy).
  const brent = commodityRows.find((c) => c.symbol === "BRENT") ?? null;
  const brentChange = seriesChangePct(commoditySeries, "BRENT");
  const petrolChange = seriesChangePct(fuelSeries, "europe|petrol");
  const dieselChange = seriesChangePct(fuelSeries, "europe|diesel");

  /** Riga di contesto "variazione + finestra", o niente se non calcolabile. */
  function changeNote(pct: number | null, windowDays: number) {
    if (pct === null) return {};
    return {
      note: `${formatPercent(pct)} · ${windowDays}gg`,
      noteTone: (pct >= 0 ? "up" : "down") as "up" | "down",
    };
  }

  const headerStats: TickerStat[] = [
    {
      key: "brent",
      label: "Brent",
      value: brent ? formatCommodityPrice(parseFloat(brent.displayPrice)) : "n/d",
      unit: brent ? shortUnit(brent.displayUnit) : undefined,
      ...changeNote(brentChange, 90),
    },
    {
      key: "benzina",
      label: "Benzina UE",
      value:
        europeAverage.petrol !== null
          ? formatFuelPrice(europeAverage.petrol)
          : "n/d",
      unit:
        europeAverage.petrol !== null
          ? `${currencySymbol(europeAverage.currency)}/L`
          : undefined,
      ...changeNote(petrolChange, 30),
    },
    {
      key: "diesel",
      label: "Diesel UE",
      value:
        europeAverage.diesel !== null
          ? formatFuelPrice(europeAverage.diesel)
          : "n/d",
      unit:
        europeAverage.diesel !== null
          ? `${currencySymbol(europeAverage.currency)}/L`
          : undefined,
      ...changeNote(dieselChange, 30),
    },
    {
      key: "ultimo-dato",
      label: "Ultimo dato",
      value: lastUpdated ? formatDateTime(lastUpdated) : "n/d",
      note: "Materie prime: ogni giorno",
    },
    {
      key: "fonti",
      label: "Fonti in linea",
      value: sourcesTotal > 0 ? `${sourcesOnline} / ${sourcesTotal}` : "n/d",
      // La riga di contesto cambia significato quando c'è un problema:
      // in condizioni normali porta la cadenza (informazione utile e
      // sempre valida), quando una fonte è ferma oltre l'attesa lo dice
      // esplicitamente invece di lasciare il rapporto "2 / 3" da
      // interpretare da soli.
      ...(sourcesTotal > 0 && sourcesOnline < sourcesTotal
        ? {
            note: `${sourcesTotal - sourcesOnline} ferma oltre l'attesa`,
            noteTone: "up" as const,
          }
        : { note: "Carburanti: settimanale" }),
    },
  ];

  return (
    <div className="min-h-screen bg-system-bg text-system-ink">
      {/* ============================================================
          CHROME SCURO (header)
          ============================================================
          Lo schema del restyling è "chrome scuro + dati chiari": questa
          è la cornice, le sezioni sotto restano su avorio. Il senso è
          pratico, non solo estetico — una tabella di numeri si legge
          meglio scura su chiaro, mentre l'intestazione ha il compito
          opposto: farsi riconoscere in due secondi.

          `relative` + `overflow-hidden` servono a HeroBackdrop, che è in
          posizione assoluta e va ritagliato ai bordi dell'header. */}
      <header className="relative overflow-hidden bg-system-chrome text-system-chrome-ink">
        {/* La curva reale del Brent a 90 giorni, in filigrana dietro il
            wordmark. Non è un'immagine: è il dato. Vedi la motivazione
            estesa in src/components/HeroBackdrop.tsx. */}
        {/* Nascosto sotto `sm`: il viewBox si deforma per riempire il
            contenitore (preserveAspectRatio="none"), e su uno schermo
            stretto e alto la curva diventa una montagna verticale che
            compete col wordmark invece di stargli dietro. */}
        <HeroBackdrop points={heroSeries} className="hidden sm:block" />

        {/* `relative` su questo contenitore (e non solo z-index) mette il
            contenuto sopra l'SVG di sfondo senza creare stacking context
            inutili. */}
        <div className="relative mx-auto max-w-7xl px-6 pb-8 pt-10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {/* Wordmark (punto 17 del brief): il nome come elemento
                  visivo dominante. Resta un <p>, non un heading — l'h1
                  vero è la riga sotto, che descrive il CONTENUTO della
                  pagina (rilevante per SEO/accessibilità); il nome del
                  prodotto da solo non porta segnale tematico.

                  `uppercase` + tracking largo: "mercuriale" era il nome
                  dei listini ufficiali dei prezzi all'ingrosso pubblicati
                  dalle Camere di Commercio, e il maiuscolo spaziato è la
                  loro composizione tipica. Il maiuscolo è puramente
                  presentazionale, il testo nel DOM resta capitalizzato. */}
              <div className="flex items-center gap-3">
                <ProvenanceStamp
                  size={38}
                  className="shrink-0 text-system-chrome-accent"
                />
                <p className="text-[30px] font-semibold uppercase tracking-[0.03em] text-system-chrome-ink sm:text-4xl sm:tracking-[0.06em] lg:text-5xl">
                  Mercuriale
                </p>
              </div>
              <p className="mt-1.5 ml-[50px] font-mono text-[11px] uppercase tracking-[0.18em] text-system-chrome-accent">
                Osservatorio aperto · dati pubblici
                {/* Cursore del terminale: `aria-hidden` perché per uno
                    screen reader è rumore, e `select-none` perché non
                    deve finire in un copia-incolla del titolo. */}
                <span
                  aria-hidden="true"
                  className="animate-caret ml-1 inline-block select-none"
                >
                  _
                </span>
              </p>
              <h1 className="mt-5 text-lg font-medium text-system-chrome-ink sm:text-xl">
                Prezzi di materie prime e carburanti
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-system-chrome-ink-muted">
                Dati raccolti da fonti pubbliche: Alpha Vantage per le materie
                prime globali, la Commissione Europea e l&apos;EIA per i
                carburanti al consumo. Aggiornati automaticamente alla cadenza
                di ciascuna fonte, con fonte, data e limiti dichiarati.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden items-center gap-2 rounded-md border border-system-chrome-border px-3 py-2 font-mono text-xs uppercase tracking-wider text-system-chrome-ink-muted transition-colors hover:border-system-chrome-accent hover:text-system-chrome-accent sm:flex"
              >
                <Code2 size={15} />
                Codice sorgente
              </a>
              <MobileNav
                items={NAV_ITEMS.map(({ href, label }) => ({ href, label }))}
                pageLinks={[
                  { href: "/metodologia", label: "Metodologia" },
                  { href: "/glossario", label: "Glossario" },
                ]}
                githubUrl={GITHUB_URL}
              />
            </div>
          </div>
        </div>

        {/* Fascia sintetica (punto 25 del brief): valori assoluti di
            apertura, nessun ranking — le classifiche vivono in "Maggiori
            variazioni". Vedi src/components/TickerBand.tsx. */}
        {lastUpdated && <TickerBand stats={headerStats} />}

        {/* Barra di navigazione a piena larghezza sul chrome: divisori
            verticali fra le voci e sottolineatura in ambra sull'hover,
            invece di pillole separate da spazio vuoto. */}
        <nav className="relative hidden border-b border-system-chrome-border sm:block">
          <div className="mx-auto flex max-w-7xl">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <a
                key={href}
                href={href}
                className="flex items-center gap-1.5 border-b-2 border-l border-transparent border-l-system-chrome-border px-5 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-system-chrome-ink-muted transition-colors first:border-l-0 hover:border-b-system-chrome-accent hover:bg-white/[0.03] hover:text-system-chrome-accent"
              >
                <Icon size={13} />
                {label}
              </a>
            ))}
            <Link
              href="/metodologia"
              className="ml-auto flex items-center border-l border-system-chrome-border px-5 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-system-chrome-ink-muted transition-colors hover:text-system-chrome-accent"
            >
              Metodologia
            </Link>
            <Link
              href="/glossario"
              className="flex items-center border-l border-system-chrome-border px-5 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-system-chrome-ink-muted transition-colors hover:text-system-chrome-accent"
            >
              Glossario
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        {/* "Maggiori variazioni": riepilogo in cima, senza numero di
            sezione — è una sintesi dei dati che seguono, non una quinta
            sezione dell'indice 01–04. */}
        {topMovers.length > 0 && (
          <section className="mb-12">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-system-ink-muted">◆</span>
              <h2 className="text-lg font-semibold text-system-ink">
                Maggiori variazioni
              </h2>
            </div>
            <p className="mt-1 text-sm text-system-ink-secondary">
              Scostamento tra la prima e l&apos;ultima rilevazione nella
              finestra dei grafici qui sotto — materie prime 90 giorni,
              carburanti 30 giorni.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {topMovers.map((m) => {
                // In salita = ruggine, in discesa = verde: stessa lettura
                // del colore usata nella mappa ("più caro" ruggine) e
                // documentata in globals.css.
                const up = m.changePct >= 0;
                return (
                  <div
                    key={m.key}
                    className="rounded-lg border border-system-border bg-system-surface p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-system-ink">
                          {m.label}
                        </div>
                        <div className="mt-0.5 font-mono text-xs tabular-nums text-system-ink-muted">
                          {formatCommodityPrice(m.first)} →{" "}
                          {formatCommodityPrice(m.last)} {shortUnit(m.unit)}
                        </div>
                      </div>
                      <div
                        className={`flex shrink-0 items-center gap-1 font-mono font-semibold tabular-nums ${
                          up
                            ? "text-system-signal-up"
                            : "text-system-signal-down"
                        }`}
                      >
                        {up ? (
                          <ArrowUpRight size={16} />
                        ) : (
                          <ArrowDownRight size={16} />
                        )}
                        {formatPercent(m.changePct)}
                      </div>
                    </div>
                    <div className="mt-2 font-mono text-[11px] uppercase tracking-wider text-system-ink-muted">
                      {m.windowDays} giorni · {m.points} rilevazioni
                    </div>
                  </div>
                );
              })}
            </div>
            <SourceNote>
              Fonte: come le rispettive sezioni (Alpha Vantage per le materie
              prime, Commissione Europea ed EIA per i carburanti) · variazione
              calcolata sui soli dati disponibili nella finestra, non
              sull&apos;intero storico
            </SourceNote>
          </section>
        )}

        {europeanFuelData.length > 0 && (
          <section id="mappa" className="scroll-mt-8">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-system-ink-muted">01 /</span>
              <h2 className="text-lg font-semibold text-system-ink">Prezzo benzina in Europa</h2>
            </div>
            <div className="mt-4 rounded-lg border border-system-border bg-system-surface p-4">
              <EuropeFuelMap prices={europeanFuelData} euAveragePetrol={europeAverage.petrol} />
            </div>
            <SourceNote>
              Fonte: Bollettino Petrolifero Settimanale, Commissione Europea ·
              Aggiornamento: ogni giovedì · Confini amministrativi: Natural
              Earth (dominio pubblico)
            </SourceNote>
          </section>
        )}

        {(europeAverage.petrol !== null || usAverage.petrol !== null) && (
          <section id="calcolatore" className="mt-12 scroll-mt-8">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-system-ink-muted">02 /</span>
              <h2 className="text-lg font-semibold text-system-ink">Cosa significa in pratica</h2>
            </div>
            <p className="mt-1 text-sm text-system-ink-secondary">
              Quanto costa un pieno per un&apos;auto normale, e quanto pesa il
              carburante sui trasporti — camion che portano cibo, materiali,
              merci.
            </p>
            <div className="mt-4">
              <FuelImpactCalculator europe={europeAverage} us={usAverage} />
            </div>
          </section>
        )}

        <section id="materie-prime" className="mt-12 scroll-mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-system-ink-muted">03 /</span>
              <h2 className="text-lg font-semibold text-system-ink">Materie prime globali</h2>
            </div>
            {commodityRows.length > 0 && (
              <DownloadDataButtons
                filenameBase="mercuriale-materie-prime"
                columns={COMMODITY_EXPORT_COLUMNS}
                rows={commodityExportRows}
              />
            )}
          </div>
          {commodityPrices.length === 0 ? (
            <EmptyState label="Nessun dato ancora. Il cron job non è ancora girato per questa fonte." />
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-system-border bg-system-surface">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  {/* Intestazioni in stile terminale: monospace + maiuscolo
                      spaziato, per coerenza con le card system-style. */}
                  <tr className="border-b border-system-border text-left font-mono text-xs uppercase tracking-wider text-system-ink-secondary">
                    <th className="px-4 py-3 font-medium">Materia prima</th>
                    <th className="px-4 py-3 font-medium">Categoria</th>
                    <th className="px-4 py-3 text-right font-medium">Prezzo</th>
                    <th className="px-4 py-3 text-right font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {commodityRows.map((c) => (
                    <tr key={c.symbol} className="border-b border-system-border-subtle transition-colors last:border-0 hover:bg-system-bg">
                      <td className="px-4 py-3">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-system-ink-muted">{c.symbol}</div>
                      </td>
                      <td className="px-4 py-3 text-system-ink-secondary">
                        {CATEGORY_LABELS[c.category] ?? c.category}
                      </td>
                      <td
                        className="px-4 py-3 text-right font-mono tabular-nums"
                        title={`Valore grezzo della fonte: ${c.displayPrice} ${c.displayUnit}`}
                      >
                        {formatCommodityPrice(parseFloat(c.displayPrice))}{" "}
                        <span className="text-xs text-system-ink-muted">
                          {shortUnit(c.displayUnit)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-system-ink-muted">
                        <span className="inline-flex items-center gap-2">
                          {c.freshnessState !== "aggiornato" && (
                            <span
                              title={`Ultimo dato ${c.ageDays} giorni fa. ${c.freshnessLabel}: il valore mostrato potrebbe non essere quello corrente.`}
                              className={
                                c.freshnessState === "non_aggiornato"
                                  ? "rounded border border-system-signal-up/40 px-1.5 py-0.5 font-mono text-[10px] uppercase leading-none tracking-wider text-system-signal-up"
                                  : "rounded border border-system-signal-wait/40 px-1.5 py-0.5 font-mono text-[10px] uppercase leading-none tracking-wider text-system-signal-wait"
                              }
                            >
                              {c.freshnessState === "non_aggiornato" ? "non aggiornato" : "in attesa"}
                            </span>
                          )}
                          {formatDate(c.recordedAt)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-6">
            <PriceHistoryChart
              title="Andamento materie prime (90 giorni)"
              series={commoditySeries}
            />
          </div>
          <SourceNote>
            Fonte: Alpha Vantage (dati di mercato) · Aggiornamento: giornaliero
            (petrolio, gas naturale) · mensile (metalli, agricole) · il badge
            &quot;non aggiornato&quot; segnala una serie ferma oltre il ritardo
            atteso per la sua cadenza
          </SourceNote>
        </section>

        <section id="carburanti" className="mt-12 scroll-mt-8">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-xs text-system-ink-muted">04 /</span>
            <h2 className="text-lg font-semibold text-system-ink">Carburanti al consumo</h2>
          </div>
          {fuelsByContinent.size === 0 ? (
            <EmptyState label="Nessun dato ancora. Il cron job non è ancora girato per questa fonte." />
          ) : (
            <div className="mt-4 space-y-6">
              {Array.from(fuelsByContinent.entries()).map(([continent, fuels]) => (
                <FuelPriceTable
                  key={continent}
                  continentLabel={CONTINENT_LABELS[continent] ?? continent}
                  fuels={fuels.map((f) => ({
                    regionName: f.regionName,
                    // Il layer DB tipa fuelType come `string`; lo schema
                    // ammette solo "petrol"/"diesel" (retail_fuel_prices),
                    // quindi restringiamo qui al confine col componente.
                    fuelType: f.fuelType as "petrol" | "diesel",
                    price: f.price,
                    currency: f.currency,
                    // formatDate() gira QUI, lato server: passiamo la stringa
                    // risultante, mai la funzione (Client Component).
                    recordedAtFormatted: formatDate(f.recordedAt),
                  }))}
                />
              ))}
            </div>
          )}
          <div className="mt-6">
            <PriceHistoryChart
              title="Andamento carburanti (30 giorni)"
              series={fuelSeries}
            />
          </div>
          <SourceNote>
            Fonte: Bollettino Petrolifero Settimanale (UE, ogni giovedì) ·
            EIA (USA, ogni lunedì) · Prezzi medi nazionali, non punti vendita
            specifici
          </SourceNote>
        </section>
      </main>

      {/* Footer sul chrome scuro, come l'header: la pagina è "incorniciata"
          in alto e in basso dal bruno, e le sezioni dati stanno nel mezzo
          sull'avorio. Il filo ambra è il segno di chiusura. */}
      <footer className="mt-12 bg-system-chrome text-system-chrome-ink">
        <div className="h-0.5 bg-system-chrome-accent/50" />
        <div className="mx-auto max-w-7xl px-6 py-12">
          {/* Colonne del footer separate da divisori verticali (border-l col
              colore bordo del design system) invece che dal solo spazio
              vuoto. Attivi solo da `lg` in su, dove la griglia è a 4
              colonne su una riga sola: sotto (stack / 2 colonne) un
              border-l cadrebbe a metà di righe che vanno a capo.
              `lg:gap-x-0` + `lg:pl-8`/`lg:pr-8` danno canali uniformi con
              la linea centrata. */}
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-0">
            <div className="lg:pr-8">
              <p className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.18em] text-system-chrome-accent">
                <ProvenanceStamp size={28} className="shrink-0 text-system-chrome-accent" />
                Mercuriale
              </p>
              <p className="mt-3 text-xs leading-relaxed text-system-chrome-ink-muted">
                Progetto open source · dati pubblici, nessuna garanzia di
                accuratezza
              </p>
            </div>

            <div className="lg:border-l lg:border-system-chrome-border lg:pl-8">
              <h3 className="text-xs font-mono uppercase tracking-[0.14em] text-system-chrome-ink-muted">
                Naviga
              </h3>
              <ul className="mt-3 space-y-2 text-sm">
                {NAV_ITEMS.map(({ href, label }) => (
                  <li key={href}>
                    <a
                      href={href}
                      className="text-system-chrome-ink transition-colors hover:text-system-chrome-accent"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:border-l lg:border-system-chrome-border lg:pl-8">
              <h3 className="text-xs font-mono uppercase tracking-[0.14em] text-system-chrome-ink-muted">
                Progetto
              </h3>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link
                    href="/metodologia"
                    className="text-system-chrome-ink transition-colors hover:text-system-chrome-accent"
                  >
                    Metodologia
                  </Link>
                </li>
                <li>
                  <Link
                    href="/glossario"
                    className="text-system-chrome-ink transition-colors hover:text-system-chrome-accent"
                  >
                    Glossario
                  </Link>
                </li>
                <li>
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-system-chrome-ink transition-colors hover:text-system-chrome-accent"
                  >
                    <Code2 size={15} />
                    Codice sorgente
                  </a>
                </li>
              </ul>
            </div>

            <div className="lg:border-l lg:border-system-chrome-border lg:pl-8">
              <h3 className="text-xs font-mono uppercase tracking-[0.14em] text-system-chrome-ink-muted">
                Autore
              </h3>
              <p className="mt-3 text-sm">
                <a
                  href="https://www.linkedin.com/in/yuri-copparini"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-system-chrome-ink transition-colors hover:text-system-chrome-accent"
                >
                  <LinkedinGlyph size={15} />
                  Yuri Copparini
                </a>
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SourceNote({ children }: { children: React.ReactNode }) {
  // Il CONTENUTO della nota resta identico (è il principio cardine del
  // progetto: ogni dato con la sua fonte). Cambia solo lo stile: monospace
  // maiuscolo spaziato, in tinta con l'estetica system-style. `uppercase`
  // è puramente presentazionale, il testo nel DOM non cambia.
  //
  // Il timbro di provenienza qui davanti: le 3 note "Fonte:" sono i punti
  // dove il principio del progetto si concretizza, quindi è dove la firma
  // ha più senso. `items-start` + `mt-0.5` per allinearlo alla prima riga
  // di testo anche quando la nota va a capo.
  return (
    <p className="mt-2 flex items-start gap-1.5 font-mono text-xs uppercase tracking-wider text-system-ink-muted">
      <ProvenanceStamp size={14} className="mt-0.5 shrink-0 text-system-accent" />
      <span>{children}</span>
    </p>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-system-border bg-system-surface px-4 py-8 text-center text-sm text-system-ink-muted">
      {label}
    </div>
  );
}

// Glifo LinkedIn inline: la versione di lucide-react installata (1.34.0)
// non include icone di brand, quindi non c'è `<Linkedin />` da importare.
// `fill="currentColor"` così eredita il colore del link (grigio → accent
// in hover) come le icone lucide del resto della pagina.
function LinkedinGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}
