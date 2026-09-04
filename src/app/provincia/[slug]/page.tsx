import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getLatestItalianFuelPrices } from "@/lib/db/queries";
import { computeItalianFuelStats, rankByPrice } from "@/lib/italianFuelStats";
import { ALL_PROVINCES, provinceForSlug } from "@/lib/provinces";
import { formatFuelPrice, formatDate, currencySymbol } from "@/lib/format";
import { computeFreshness, getFreshnessConfig } from "@/lib/freshness/compute";
import { SystemCard } from "@/components/SystemCard";
import { ProvenanceStamp } from "@/components/ProvenanceStamp";
import { SourceNote } from "@/components/SourceNote";

// Stesso motivo di /paese/[slug]: il dato arriva da un cron (per ora uno
// script lanciato a mano, vedi CLAUDE.md), non dalla build. `force-dynamic`
// legge il database a ogni richiesta invece di congelare il prezzo del
// giorno in cui la pagina è stata generata.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Pre-genera le 107 pagine provincia al build (gli slug, non il contenuto
 * — vedi il commento su force-dynamic sopra). Stesso ruolo di
 * generateStaticParams in /paese/[slug]: dice a Next che questi URL
 * esistono, così un link a /provincia/milano non è una route "a sorpresa".
 */
export async function generateStaticParams() {
  return ALL_PROVINCES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const province = provinceForSlug(slug);
  if (!province) return {};
  const title = `Prezzo della benzina a ${province.name}, self e servito — Mercuriale`;
  const description = `Il prezzo medio di benzina e gasolio a ${province.name}, self-service e servito, a confronto con la media nazionale. Fonte: MIMIT, dati stazione per stazione aggiornati ogni giorno.`;
  return {
    title,
    description,
    openGraph: { title, description },
  };
}

/** Ordinale italiano ("1°", "12°", "107°") — concorda con "posto". */
function ordinal(n: number): string {
  return `${n}°`;
}

export default async function ProvincePage({ params }: PageProps) {
  const { slug } = await params;
  const provinceRoute = provinceForSlug(slug);
  if (!provinceRoute) notFound();

  const fuelPrices = await getLatestItalianFuelPrices();
  const { provinces, average } = computeItalianFuelStats(fuelPrices);
  const province = provinces.find(
    (p) => p.provinceCode === provinceRoute.code
  );

  // Lo slug è valido (una delle 107 province) ma potremmo non avere ancora
  // un prezzo per lei — es. il cron non ha ancora girato per la prima
  // volta su questa provincia specifica. Pagina onesta invece di un 404,
  // stesso principio di /paese/[slug].
  if (!province) {
    return (
      <div className="min-h-screen bg-system-bg text-system-ink">
        <header className="border-b border-system-border bg-system-surface">
          <div className="mx-auto max-w-3xl px-6 py-8">
            <Link
              href="/"
              className="text-xs font-semibold uppercase tracking-[0.14em] text-system-accent hover:underline"
            >
              ← Torna alla home
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Benzina a {provinceRoute.name}
            </h1>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-6 py-10">
          <p className="text-sm leading-relaxed text-system-ink-secondary">
            Non abbiamo ancora un prezzo registrato per {provinceRoute.name}.
            Il dataset del MIMIT potrebbe non avere ancora impianti
            classificati per questa provincia nell&apos;ultima estrazione.
          </p>
        </main>
      </div>
    );
  }

  const petrolRanks = rankByPrice(provinces, "petrol", "self");
  const petrolRank = petrolRanks.get(province.provinceCode) ?? null;

  const vsAveragePetrolSelf =
    province.petrolSelf !== null && average.petrolSelf !== null
      ? province.petrolSelf - average.petrolSelf
      : null;

  const freshnessConfig = getFreshnessConfig("mimit");
  const freshnessState = province.recordedAt
    ? computeFreshness(province.recordedAt, freshnessConfig)
    : "non_aggiornato";

  return (
    <div className="min-h-screen bg-system-bg text-system-ink">
      <header className="border-b border-system-border bg-system-surface">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <Link
            href="/"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-system-accent hover:underline"
          >
            ← Torna alla home
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <ProvenanceStamp size={20} className="text-system-accent" />
            Benzina a {province.provinceName}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-system-ink-secondary">
            {province.petrolSelf !== null ? (
              <>
                Il self costa{" "}
                <strong className="text-system-ink">
                  {formatFuelPrice(province.petrolSelf)} €/L
                </strong>
                {petrolRank
                  ? `, ${ordinal(petrolRank.rank)} provincia più cara su ${
                      petrolRank.total
                    }`
                  : ""}
                .
              </>
            ) : (
              "Non abbiamo ancora un prezzo self registrato per questa provincia."
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
            {province.recordedAt ? formatDate(province.recordedAt) : "—"}.
          </p>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          <FuelStatCard
            label="Benzina"
            self={province.petrolSelf}
            served={province.petrolServed}
            selfStations={province.petrolSelfStations}
            servedStations={province.petrolServedStations}
            avgSelf={average.petrolSelf}
            currency="EUR"
          />
          <FuelStatCard
            label="Gasolio"
            self={province.dieselSelf}
            served={province.dieselServed}
            selfStations={province.dieselSelfStations}
            servedStations={province.dieselServedStations}
            avgSelf={average.dieselSelf}
            currency="EUR"
          />
        </section>

        <SystemCard
          eyebrow="Confronto"
          title={`${province.provinceName} rispetto alla media nazionale`}
        >
          <p className="text-sm leading-relaxed text-system-ink-secondary">
            {vsAveragePetrolSelf !== null && average.petrolSelf !== null ? (
              <>
                Il self a {province.provinceName} costa{" "}
                <strong
                  className={
                    vsAveragePetrolSelf >= 0
                      ? "text-system-signal-up"
                      : "text-system-signal-down"
                  }
                >
                  {vsAveragePetrolSelf >= 0 ? "+" : "−"}
                  {formatFuelPrice(Math.abs(vsAveragePetrolSelf))} €/L
                </strong>{" "}
                rispetto alla media nazionale pesata sul numero di impianti (
                {formatFuelPrice(average.petrolSelf)} €/L).
              </>
            ) : (
              "Il confronto con la media nazionale non è disponibile per questa estrazione."
            )}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-system-ink-muted">
            Media PESATA sul numero di impianti di ogni provincia, non una
            media semplice fra le 107: una provincia con centinaia di
            distributori non deve contare quanto una con poche decine.
          </p>
        </SystemCard>

        <SystemCard eyebrow="Nota" title="Perché qui non c'è la quota fiscale">
          <p className="text-sm leading-relaxed text-system-ink-secondary">
            L&apos;accisa sui carburanti è uguale in tutta Italia: non varia
            da provincia a provincia, quindi scomporla qui ripeterebbe lo
            stesso numero 107 volte invece di dire qualcosa di nuovo su{" "}
            {province.provinceName}. La trovi già calcolata in{" "}
            <Link href="/paese/italia" className="underline hover:text-system-ink">
              /paese/italia
            </Link>
            .
          </p>
        </SystemCard>

        <SourceNote sources={["mimit"]}>
          Fonte: MIMIT, anagrafica e prezzi stazione per stazione · Ultima
          rilevazione:{" "}
          {province.recordedAt ? formatDate(province.recordedAt) : "—"}
        </SourceNote>
      </main>
    </div>
  );
}

function FuelStatCard({
  label,
  self,
  served,
  selfStations,
  servedStations,
  avgSelf,
  currency,
}: {
  label: string;
  self: number | null;
  served: number | null;
  selfStations: number | null;
  servedStations: number | null;
  avgSelf: number | null;
  currency: string;
}) {
  const symbol = currencySymbol(currency);
  const diff = self !== null && served !== null ? served - self : null;

  return (
    <SystemCard eyebrow={label}>
      <div className="space-y-2 text-sm">
        <Row
          label="Self"
          value={self !== null ? `${formatFuelPrice(self)} ${symbol}/L` : "—"}
          strong
        />
        <Row
          label="Servito"
          value={served !== null ? `${formatFuelPrice(served)} ${symbol}/L` : "—"}
        />
        {diff !== null && (
          <Row
            label="Differenza servito−self"
            value={`+${formatFuelPrice(diff)} ${symbol}/L`}
            muted
          />
        )}
        <Row
          label="Media nazionale (self)"
          value={avgSelf !== null ? `${formatFuelPrice(avgSelf)} ${symbol}/L` : "—"}
          muted
        />
        <Row
          label="Campione"
          value={`${selfStations ?? "—"} self · ${servedStations ?? "—"} servito`}
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
