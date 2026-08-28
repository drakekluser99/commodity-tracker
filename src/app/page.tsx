import { getLatestCommodityPrices, getLatestFuelPrices } from "@/lib/db/queries";
import EuropeFuelMap from "@/components/EuropeFuelMap";
import FuelImpactCalculator from "@/components/FuelImpactCalculator";
import MobileNav from "@/components/MobileNav";
import { FuelPriceTable } from "@/components/FuelPriceTable";
import { StatusLabel } from "@/components/StatusLabel";
import Link from "next/link";
import { Code2, Fuel, Globe2, Calculator, BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

const GITHUB_URL = "https://github.com/drakekluser99/commodity-tracker";

const CATEGORY_LABELS: Record<string, string> = {
  energy: "Energia",
  metal: "Metalli",
  agricultural: "Agricole",
};

const CONTINENT_LABELS: Record<string, string> = {
  europe: "Europa",
  north_america: "Nord America",
  oceania: "Oceania",
  latam: "America Latina",
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

const NAV_ITEMS = [
  { href: "#mappa", label: "Mappa", icon: Globe2 },
  { href: "#calcolatore", label: "Cosa significa", icon: Calculator },
  { href: "#materie-prime", label: "Materie prime", icon: BarChart3 },
  { href: "#carburanti", label: "Carburanti", icon: Fuel },
];

export default async function Home() {
  const [commodityPrices, fuelPrices] = await Promise.all([
    getLatestCommodityPrices(),
    getLatestFuelPrices(),
  ]);

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

  return (
    <div className="min-h-screen bg-system-bg text-system-ink">
      <header className="border-b border-system-border bg-white">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-system-accent">
                Commodity Tracker · Progetto open source
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Materie prime e carburanti, in tempo quasi reale
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-system-ink-secondary">
                Dati raccolti da fonti pubbliche: Alpha Vantage per le materie
                prime globali, la Commissione Europea e l&apos;EIA per i
                carburanti al consumo. Aggiornati automaticamente ogni
                giorno.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden items-center gap-2 rounded-md border border-system-border px-3 py-2 text-sm font-medium text-system-ink-secondary transition-colors hover:border-system-accent hover:text-system-accent sm:flex"
              >
                <Code2 size={16} />
                Codice sorgente
              </a>
              <MobileNav
                items={NAV_ITEMS.map(({ href, label }) => ({ href, label }))}
                githubUrl={GITHUB_URL}
              />
            </div>
          </div>

          {lastUpdated && (
            // Ex "Ultimo aggiornamento: ...": ora un'etichetta system-style
            // con pallino di stato. `live` perché il dato è aggiornato di
            // recente via cron; il valore resta la data formattata in italiano.
            <div className="mt-4">
              <StatusLabel
                label="MARKET DATA"
                value={formatDateTime(lastUpdated)}
                live
              />
            </div>
          )}

          <nav className="mt-6 hidden flex-wrap gap-1 border-t border-system-border-subtle pt-4 sm:flex">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <a
                key={href}
                href={href}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-system-ink-secondary transition-colors hover:bg-system-bg hover:text-system-accent"
              >
                <Icon size={14} />
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl px-6 py-10">
        {europeanFuelData.length > 0 && (
          <section id="mappa" className="scroll-mt-8">
            <h2 className="text-lg font-semibold">Prezzo benzina in Europa</h2>
            <div className="mt-4 rounded-lg border border-system-border bg-white p-4">
              <EuropeFuelMap prices={europeanFuelData} euAveragePetrol={europeAverage.petrol} />
            </div>
            <SourceNote>
              Fonte: Bollettino Petrolifero Settimanale, Commissione Europea ·
              Confini amministrativi: Natural Earth (dominio pubblico)
            </SourceNote>
          </section>
        )}

        {(europeAverage.petrol !== null || usAverage.petrol !== null) && (
          <section id="calcolatore" className="mt-12 scroll-mt-8">
            <h2 className="text-lg font-semibold">Cosa significa in pratica</h2>
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
          <h2 className="text-lg font-semibold">Materie prime globali</h2>
          {commodityPrices.length === 0 ? (
            <EmptyState label="Nessun dato ancora. Il cron job non è ancora girato per questa fonte." />
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-system-border bg-white">
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
                  {commodityPrices.map((c) => (
                    <tr key={c.symbol} className="border-b border-system-border-subtle transition-colors last:border-0 hover:bg-system-bg">
                      <td className="px-4 py-3">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-system-ink-muted">{c.symbol}</div>
                      </td>
                      <td className="px-4 py-3 text-system-ink-secondary">
                        {CATEGORY_LABELS[c.category] ?? c.category}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {c.price} <span className="text-xs text-system-ink-muted">{c.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-system-ink-muted">
                        {formatDate(c.recordedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <SourceNote>
            Fonte: Alpha Vantage (dati di mercato) · Aggiornamento:
            giornaliero via cron job
          </SourceNote>
        </section>

        <section id="carburanti" className="mt-12 scroll-mt-8">
          <h2 className="text-lg font-semibold">Carburanti al consumo</h2>
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
          <SourceNote>
            Fonte: Bollettino Petrolifero Settimanale (UE) · EIA (USA) ·
            Prezzi medi nazionali, non punti vendita specifici
          </SourceNote>
        </section>
      </main>

      <footer className="relative mt-8 rounded-t-4xl border-t border-system-border bg-white">
        <div className="absolute left-1/2 right-1/2 top-0 h-px w-1/3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent via-system-accent/30 to-transparent blur-[1px]" />

        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-system-accent">
                Commodity Tracker
              </p>
              <p className="mt-3 text-xs leading-relaxed text-system-ink-muted">
                Progetto open source · dati pubblici, nessuna garanzia di
                accuratezza
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-system-ink-secondary">
                Naviga
              </h3>
              <ul className="mt-3 space-y-2 text-sm">
                {NAV_ITEMS.map(({ href, label }) => (
                  <li key={href}>
                    <a
                      href={href}
                      className="text-system-ink-secondary transition-colors hover:text-system-accent"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-system-ink-secondary">
                Progetto
              </h3>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link
                    href="/metodologia"
                    className="text-system-ink-secondary transition-colors hover:text-system-accent"
                  >
                    Metodologia
                  </Link>
                </li>
                <li>
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-system-ink-secondary transition-colors hover:text-system-accent"
                  >
                    Codice sorgente
                  </a>
                </li>
              </ul>
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
  return (
    <p className="mt-2 font-mono text-xs uppercase tracking-wider text-system-ink-muted">
      {children}
    </p>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-system-border bg-white px-4 py-8 text-center text-sm text-system-ink-muted">
      {label}
    </div>
  );
}
