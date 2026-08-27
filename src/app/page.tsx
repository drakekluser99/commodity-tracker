import { getLatestCommodityPrices, getLatestFuelPrices } from "@/lib/db/queries";
import EuropeFuelMap from "@/components/EuropeFuelMap";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  energy: "Energia",
  metal: "Metalli",
  agricultural: "Agricole",
};

const CONTINENT_LABELS: Record<string, string> = {
  europe: "Europa",
  north_america: "Nord America",
  oceania: "Oceania",
  latam: "LatAm",
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

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

  const europeanPetrolPrices = (fuelsByContinent.get("europe") ?? [])
    .filter((f) => f.fuelType === "petrol")
    .map((f) => ({ countryName: f.regionName, price: parseFloat(f.price) }));

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#14181f]">
      <header className="border-b border-[#dde1e7] bg-white">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0f6b66]">
            Commodity Tracker · Progetto open source
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Materie prime e carburanti, in tempo quasi reale
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5b6472]">
            Dati raccolti da fonti pubbliche: Alpha Vantage per le materie
            prime globali, la Commissione Europea e l&apos;EIA per i
            carburanti al consumo. Aggiornati automaticamente via cron job.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {europeanPetrolPrices.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold">Prezzo benzina in Europa</h2>
            <div className="mt-4 rounded-lg border border-[#dde1e7] bg-white p-4">
              <EuropeFuelMap prices={europeanPetrolPrices} />
            </div>
            <SourceNote>
              Fonte: Bollettino Petrolifero Settimanale, Commissione Europea ·
              Confini amministrativi: Natural Earth (dominio pubblico)
            </SourceNote>
          </section>
        )}

        <section className={europeanPetrolPrices.length > 0 ? "mt-12" : ""}>
          <h2 className="text-lg font-semibold">Materie prime globali</h2>
          {commodityPrices.length === 0 ? (
            <EmptyState label="Nessun dato ancora. Il cron job non è ancora girato per questa fonte." />
          ) : (
            <div className="mt-4 overflow-hidden rounded-lg border border-[#dde1e7] bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#dde1e7] text-left text-xs uppercase tracking-wide text-[#5b6472]">
                    <th className="px-4 py-3 font-medium">Materia prima</th>
                    <th className="px-4 py-3 font-medium">Categoria</th>
                    <th className="px-4 py-3 text-right font-medium">Prezzo</th>
                    <th className="px-4 py-3 text-right font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {commodityPrices.map((c) => (
                    <tr key={c.symbol} className="border-b border-[#eef0f3] last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-[#8891a0]">{c.symbol}</div>
                      </td>
                      <td className="px-4 py-3 text-[#5b6472]">
                        {CATEGORY_LABELS[c.category] ?? c.category}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {c.price} <span className="text-xs text-[#8891a0]">{c.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-[#8891a0]">
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

        <section className="mt-12">
          <h2 className="text-lg font-semibold">Carburanti al consumo</h2>
          {fuelsByContinent.size === 0 ? (
            <EmptyState label="Nessun dato ancora. Il cron job non è ancora girato per questa fonte." />
          ) : (
            <div className="mt-4 space-y-6">
              {Array.from(fuelsByContinent.entries()).map(([continent, fuels]) => (
                <div key={continent} className="overflow-hidden rounded-lg border border-[#dde1e7] bg-white">
                  <div className="border-b border-[#dde1e7] bg-[#f7f8fa] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#5b6472]">
                    {CONTINENT_LABELS[continent] ?? continent}
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#dde1e7] text-left text-xs uppercase tracking-wide text-[#5b6472]">
                        <th className="px-4 py-3 font-medium">Regione</th>
                        <th className="px-4 py-3 font-medium">Carburante</th>
                        <th className="px-4 py-3 text-right font-medium">Prezzo / litro</th>
                        <th className="px-4 py-3 text-right font-medium">Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fuels.map((f) => (
                        <tr
                          key={`${f.regionName}-${f.fuelType}`}
                          className="border-b border-[#eef0f3] last:border-0"
                        >
                          <td className="px-4 py-3">{f.regionName}</td>
                          <td className="px-4 py-3 text-[#5b6472] capitalize">
                            {f.fuelType === "petrol" ? "Benzina" : "Diesel"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">
                            {parseFloat(f.price).toFixed(3)}{" "}
                            <span className="text-xs text-[#8891a0]">{f.currency}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-[#8891a0]">
                            {formatDate(f.recordedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
          <SourceNote>
            Fonte: Bollettino Petrolifero Settimanale (UE) · EIA (USA) ·
            Prezzi medi nazionali, non punti vendita specifici
          </SourceNote>
        </section>
      </main>

      <footer className="mx-auto max-w-5xl px-6 py-10 text-xs text-[#8891a0]">
        Progetto open source · dati pubblici, nessuna garanzia di accuratezza
      </footer>
    </div>
  );
}

function SourceNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-xs text-[#8891a0]">{children}</p>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-[#dde1e7] bg-white px-4 py-8 text-center text-sm text-[#8891a0]">
      {label}
    </div>
  );
}
