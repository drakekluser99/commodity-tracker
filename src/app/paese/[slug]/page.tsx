import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getLatestFuelPrices } from "@/lib/db/queries";
import {
  computeEuropeFuelStats,
  taxPerLiter,
  taxSharePercent,
  rankByTaxShare,
  vatEurPerLiter,
  otherTaxesPerLiter,
} from "@/lib/europeFuelStats";
import { EU_COUNTRY_SLUGS, englishNameForSlug } from "@/lib/countries";
import { localizedCountryName } from "@/lib/countryNames";
import { formatFuelPrice, formatDate, currencySymbol } from "@/lib/format";
import { computeFreshness, getFreshnessConfig } from "@/lib/freshness/compute";
import { SystemCard } from "@/components/SystemCard";
import { ProvenanceStamp } from "@/components/ProvenanceStamp";
import { SourceNote } from "@/components/SourceNote";

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

  // Scomposizione accisa/IVA (Fase 3): derivata qui e non nel database, per
  // lo stesso motivo spiegato in europeFuelStats.ts — un solo posto dove
  // ricalcolarla. `null` a catena quando manca anche solo un ingrediente:
  // il foglio delle accise/IVA non copre ogni paese fin dal 2005, quindi
  // in molte settimane la scomposizione fine non è disponibile anche
  // quando "di cui imposte" totale lo è.
  const petrolVatEur = vatEurPerLiter(
    country.petrolNet,
    country.petrolExciseEur,
    country.petrolVatRatePercent
  );
  const petrolOtherTax = otherTaxesPerLiter(
    country.petrol,
    country.petrolNet,
    country.petrolExciseEur,
    petrolVatEur
  );
  const dieselVatEur = vatEurPerLiter(
    country.dieselNet,
    country.dieselExciseEur,
    country.dieselVatRatePercent
  );
  const dieselOtherTax = otherTaxesPerLiter(
    country.diesel,
    country.dieselNet,
    country.dieselExciseEur,
    dieselVatEur
  );
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
            excise={country.petrolExciseEur}
            vat={petrolVatEur}
            otherTax={petrolOtherTax}
            share={petrolTaxShare}
            avgGross={average.petrol}
            currency="EUR"
          />
          <FuelStatCard
            label="Diesel"
            gross={country.diesel}
            net={country.dieselNet}
            tax={dieselTax}
            excise={country.dieselExciseEur}
            vat={dieselVatEur}
            otherTax={dieselOtherTax}
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

        <SourceNote sources={["eu-commission"]}>
          Fonte: Bollettino Petrolifero Settimanale, Commissione Europea ·
          Ultima rilevazione:{" "}
          {country.recordedAt ? formatDate(country.recordedAt) : "—"}
        </SourceNote>
      </main>
    </div>
  );
}

function FuelStatCard({
  label,
  gross,
  net,
  tax,
  excise,
  vat,
  otherTax,
  share,
  avgGross,
  currency,
}: {
  label: string;
  gross: number | null;
  net: number | null;
  tax: number | null;
  /** Accisa, IVA e residuo — Fase 3. `null` a catena se il foglio delle
   * accise/IVA non copre questo paese in questa settimana: in quel caso si
   * mostra solo il totale "di cui imposte", senza scomporlo a metà. */
  excise: number | null;
  vat: number | null;
  otherTax: number | null;
  share: number | null;
  avgGross: number | null;
  currency: string;
}) {
  const symbol = currencySymbol(currency);
  // La scomposizione fine (accisa/IVA/altro) si mostra solo quando è
  // COMPLETA: mostrare accisa da sola con IVA a "—" lascerebbe intendere
  // che l'IVA sia zero invece che sconosciuta. Un oggetto e non tre
  // variabili sciolte: così TypeScript restringe i tre valori a "non
  // null" dentro il blocco JSX che lo usa, invece di richiedere un
  // controllo separato (e ripetuto) su ognuno.
  const breakdown =
    excise !== null && vat !== null && otherTax !== null
      ? { excise, vat, otherTax }
      : null;
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
        {breakdown && (
          <div className="ml-3 space-y-1.5 border-l border-system-border-subtle pl-3">
            <Row
              label="Accisa"
              value={`${formatFuelPrice(breakdown.excise)} ${symbol}/L`}
              muted
            />
            <Row
              label="IVA"
              value={`${formatFuelPrice(breakdown.vat)} ${symbol}/L`}
              muted
            />
            {breakdown.otherTax > 0.0005 && (
              <Row
                label="Altre imposte"
                value={`${formatFuelPrice(breakdown.otherTax)} ${symbol}/L`}
                muted
              />
            )}
          </div>
        )}
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
