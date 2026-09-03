import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getLatestFuelPrices } from "@/lib/db/queries";
import {
  computeEuropeFuelStats,
  taxPerLiter,
  taxSharePercent,
  rankByTaxShare,
} from "@/lib/europeFuelStats";
import { EU_COUNTRY_SLUGS, englishNameForSlug } from "@/lib/countries";
import { localizedCountryName } from "@/lib/countryNames";
import { formatFuelPrice, formatDate, currencySymbol } from "@/lib/format";
import { computeFreshness, getFreshnessConfig } from "@/lib/freshness/compute";
import { SystemCard } from "@/components/SystemCard";
import { ProvenanceStamp } from "@/components/ProvenanceStamp";

// Come la home: i dati cambiano ogni settimana (bollettino UE il giovedì) e
// arrivano da un cron, non da una build. `force-dynamic` legge il database
// a ogni richiesta invece di congelare i prezzi nella pagina generata al
// deploy — altrimenti, senza un rebuild, la pagina mostrerebbe per sempre
// i prezzi del giorno in cui è stata costruita.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Pre-genera le 27 pagine paese al build (gli slug, non il contenuto: con
 * `force-dynamic` il contenuto resta comunque letto a ogni richiesta).
 * Serve soprattutto a Next per sapere che questi URL esistono, così un
 * link a /paese/germania non richiede una route dinamica "a sorpresa".
 */
export async function generateStaticParams() {
  return EU_COUNTRY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const englishName = englishNameForSlug(slug);
  if (!englishName) return {};
  const italianName = localizedCountryName(englishName);
  const title = `Prezzo della benzina in ${italianName}, quanto è tassa — Mercuriale`;
  const description = `Il prezzo della benzina in ${italianName} scomposto in carburante e imposte, a confronto con la media dei 27 paesi UE. Fonte: Commissione Europea, aggiornato ogni settimana.`;
  return {
    title,
    description,
    openGraph: { title, description },
  };
}

/** Ordinale italiano al femminile ("1ª", "8ª", "27ª") — concorda con "quota". */
function ordinal(n: number): string {
  return `${n}ª`;
}

export default async function CountryPage({ params }: PageProps) {
  const { slug } = await params;
  const englishName = englishNameForSlug(slug);
  if (!englishName) notFound();

  const italianName = localizedCountryName(englishName);
  const fuelPrices = await getLatestFuelPrices();
  const { countries, average } = computeEuropeFuelStats(fuelPrices);
  const country = countries.find((c) => c.countryName === englishName);

  // Lo slug è valido (è uno dei 27 paesi tracciati) ma potremmo non avere
  // ancora un prezzo per lui — es. subito dopo l'aggiunta del paese, prima
  // del primo cron. Pagina onesta invece di un 404: l'URL è corretto, manca
  // solo il dato.
  if (!country) {
    return (
      <div className="min-h-screen bg-system-bg text-system-ink">
        <header className="border-b border-system-border bg-system-surface">
          <div className="mx-auto max-w-3xl px-6 py-8">
            <Link
              href="/#mappa"
              className="text-xs font-semibold uppercase tracking-[0.14em] text-system-accent hover:underline"
            >
              ← Torna alla mappa
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Benzina in {italianName}
            </h1>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-6 py-10">
          <p className="text-sm leading-relaxed text-system-ink-secondary">
            Non abbiamo ancora un prezzo registrato per {italianName}. Il
            bollettino settimanale della Commissione Europea potrebbe non
            averlo ancora pubblicato per questo paese.
          </p>
        </main>
      </div>
    );
  }

  const petrolTax = taxPerLiter(country.petrol, country.petrolNet);
  const dieselTax = taxPerLiter(country.diesel, country.dieselNet);
  const petrolTaxShare = taxSharePercent(country.petrol, country.petrolNet);
  const dieselTaxShare = taxSharePercent(country.diesel, country.dieselNet);
  const petrolRanks = rankByTaxShare(countries, "petrol");
  const rank = petrolRanks.get(englishName) ?? null;

  const vsAveragePetrol =
    country.petrol !== null && average.petrol !== null
      ? country.petrol - average.petrol
      : null;

  const freshnessConfig = getFreshnessConfig("eu_weekly_oil_bulletin");
  const freshnessState = country.recordedAt
    ? computeFreshness(country.recordedAt, freshnessConfig)
    : "non_aggiornato";

  return (
    <div className="min-h-screen bg-system-bg text-system-ink">
      <header className="border-b border-system-border bg-system-surface">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <Link
            href="/#mappa"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-system-accent hover:underline"
          >
            ← Torna alla mappa
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <ProvenanceStamp size={20} className="text-system-accent" />
            Benzina in {italianName}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-system-ink-secondary">
            {country.petrol !== null && petrolTaxShare !== null ? (
              <>
                Il prezzo alla pompa è{" "}
                <strong className="text-system-ink">
                  {formatFuelPrice(country.petrol)} €/L
                </strong>
                . Di questo,{" "}
                <strong className="text-system-ink">
                  {petrolTaxShare.toLocaleString("it-IT", {
                    maximumFractionDigits: 1,
                  })}
                  %
                </strong>{" "}
                è tassa
                {rank
                  ? `, la ${ordinal(rank.rank)} quota fiscale più alta su ${
                      rank.total
                    } paesi UE`
                  : ""}
                .
              </>
            ) : (
              "Non abbiamo ancora un prezzo al netto delle imposte per questo paese: la quota fiscale non è calcolabile questa settimana."
            )}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 space-y-8">
        {freshnessState !== "aggiornato" && (
          <p className="rounded-md border border-system-signal-wait/40 bg-system-surface px-4 py-3 text-xs text-system-signal-wait">
            {freshnessState === "non_aggiornato"
              ? "Dato non aggiornato"
              : "In attesa dell'aggiornamento"}
            : l&apos;ultima rilevazione è del{" "}
            {country.recordedAt ? formatDate(country.recordedAt) : "—"}.
          </p>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          <FuelStatCard
            label="Benzina"
            gross={country.petrol}
            net={country.petrolNet}
            tax={petrolTax}
            share={petrolTaxShare}
            avgGross={average.petrol}
            currency="EUR"
          />
          <FuelStatCard
            label="Diesel"
            gross={country.diesel}
            net={country.dieselNet}
            tax={dieselTax}
            share={dieselTaxShare}
            avgGross={average.diesel}
            currency="EUR"
          />
        </section>

        <SystemCard
          eyebrow="Confronto"
          title={`${italianName} rispetto alla media dei 27`}
        >
          <p className="text-sm leading-relaxed text-system-ink-secondary">
            {vsAveragePetrol !== null && average.petrol !== null ? (
              <>
                La benzina in {italianName} costa{" "}
                <strong
                  className={
                    vsAveragePetrol >= 0
                      ? "text-system-signal-up"
                      : "text-system-signal-down"
                  }
                >
                  {vsAveragePetrol >= 0 ? "+" : "−"}
                  {formatFuelPrice(Math.abs(vsAveragePetrol))} €/L
                </strong>{" "}
                rispetto alla media semplice dei 27 paesi UE (
                {formatFuelPrice(average.petrol)} €/L).
              </>
            ) : (
              "Il confronto con la media dei 27 non è disponibile questa settimana."
            )}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-system-ink-muted">
            &quot;Media dei 27&quot; e non &quot;media UE&quot;: è una media
            semplice tra paesi, dove Malta pesa come la Germania — non una
            media ponderata sui consumi, che la Commissione pubblica a parte
            e che vale un numero diverso.{" "}
            <Link
              href="/metodologia"
              className="underline hover:text-system-ink"
            >
              Metodologia
            </Link>
          </p>
        </SystemCard>

        <p className="mt-2 flex items-start gap-1.5 font-mono text-xs uppercase tracking-wider text-system-ink-muted">
          <ProvenanceStamp
            size={14}
            className="mt-0.5 shrink-0 text-system-accent"
          />
          <span>
            Fonte: Bollettino Petrolifero Settimanale, Commissione Europea ·
            Ultima rilevazione:{" "}
            {country.recordedAt ? formatDate(country.recordedAt) : "—"}
          </span>
        </p>
      </main>
    </div>
  );
}

function FuelStatCard({
  label,
  gross,
  net,
  tax,
  share,
  avgGross,
  currency,
}: {
  label: string;
  gross: number | null;
  net: number | null;
  tax: number | null;
  share: number | null;
  avgGross: number | null;
  currency: string;
}) {
  const symbol = currencySymbol(currency);
  return (
    <SystemCard eyebrow={label}>
      <div className="space-y-2 text-sm">
        <Row
          label="Prezzo alla pompa"
          value={gross !== null ? `${formatFuelPrice(gross)} ${symbol}/L` : "—"}
          strong
        />
        <Row
          label="Al netto delle imposte"
          value={net !== null ? `${formatFuelPrice(net)} ${symbol}/L` : "—"}
        />
        <Row
          label="Di cui imposte"
          value={tax !== null ? `${formatFuelPrice(tax)} ${symbol}/L` : "—"}
        />
        <Row
          label="Quota fiscale"
          value={
            share !== null
              ? `${share.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`
              : "—"
          }
          strong
        />
        <Row
          label="Media dei 27"
          value={avgGross !== null ? `${formatFuelPrice(avgGross)} ${symbol}/L` : "—"}
          muted
        />
      </div>
    </SystemCard>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-system-ink-secondary">{label}</span>
      <span
        className={`font-mono tabular-nums ${
          strong
            ? "text-base font-semibold text-system-ink"
            : muted
              ? "text-xs text-system-ink-muted"
              : "text-system-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
