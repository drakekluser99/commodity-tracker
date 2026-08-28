"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

export type FuelRow = {
  regionName: string;
  fuelType: "petrol" | "diesel";
  price: string; // arriva come stringa dal DB (numeric di Postgres → string in TS)
  currency: string;
  /**
   * Data già formattata in italiano (es. "24/08/2026") dal Server Component
   * chiamante, NON un oggetto Date. Perché: il progetto ha già preso un bug
   * passando funzioni come prop da Server a Client Component — per lo stesso
   * motivo evitiamo di passare qui la funzione formatDate o un Date grezzo,
   * e formattiamo la data PRIMA, lato server, passando solo una stringa.
   */
  recordedAtFormatted: string;
};

type FuelPriceTableProps = {
  continentLabel: string;
  fuels: FuelRow[];
  /** Quanti paesi mostrare in anteprima (metà più economici, metà più cari) */
  previewRegionsCount?: number;
};

/**
 * Tabella carburanti con ricerca live ed elenco compresso.
 *
 * Perché non mostriamo tutte le righe subito: con 27 paesi × 2 carburanti
 * (54 righe) per la sola Europa, e Oceania/LatAm in arrivo, una tabella
 * piatta scorre all'infinito senza dare un punto di ingresso utile.
 * Di default mostriamo solo gli "estremi" (i paesi più economici e più
 * cari), che sono l'informazione più interessante a colpo d'occhio — il
 * resto è raggiungibile cercando o espandendo.
 */
export function FuelPriceTable({
  continentLabel,
  fuels,
  previewRegionsCount = 6,
}: FuelPriceTableProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  // Raggruppiamo le righe per paese e calcoliamo il prezzo medio (benzina
  // + diesel), che ci serve per ordinare dal più economico al più caro.
  // useMemo evita di ricalcolare questo lavoro a ogni render se `fuels`
  // non cambia (es. quando l'utente digita nella ricerca, cambia solo
  // `query`, non i dati grezzi).
  const regions = useMemo(() => {
    const byRegion = new Map<string, FuelRow[]>();
    for (const row of fuels) {
      const existing = byRegion.get(row.regionName) ?? [];
      existing.push(row);
      byRegion.set(row.regionName, existing);
    }

    return Array.from(byRegion.entries())
      .map(([regionName, rows]) => {
        const avgPrice =
          rows.reduce((sum, r) => sum + parseFloat(r.price), 0) / rows.length;
        return { regionName, rows, avgPrice };
      })
      .sort((a, b) => a.avgPrice - b.avgPrice);
  }, [fuels]);

  const totalRegions = regions.length;
  // Se ci sono pochi paesi (es. Nord America con solo gli USA), la ricerca
  // e il pulsante "mostra tutti" sarebbero inutili: mostriamo tutto senza
  // fronzoli.
  const needsControls = totalRegions > previewRegionsCount;

  const searchedRegions = useMemo(() => {
    if (!query.trim()) return null; // null = nessuna ricerca attiva
    const q = query.trim().toLowerCase();
    return regions.filter((r) => r.regionName.toLowerCase().includes(q));
  }, [regions, query]);

  const visibleRegions = useMemo(() => {
    if (searchedRegions !== null) return searchedRegions;
    if (!needsControls || expanded) return regions;

    // Anteprima: metà dai più economici, metà dai più cari. Con
    // previewRegionsCount=6 sono 3 + 3. Se i due gruppi si sovrappongono
    // (dataset piccolo) il Set toglie i duplicati.
    const half = Math.ceil(previewRegionsCount / 2);
    const cheapest = regions.slice(0, half);
    const priciest = regions.slice(-half);
    const seen = new Set<string>();
    return [...cheapest, ...priciest].filter((r) => {
      if (seen.has(r.regionName)) return false;
      seen.add(r.regionName);
      return true;
    });
  }, [regions, searchedRegions, needsControls, expanded, previewRegionsCount]);

  return (
    <div className="overflow-hidden rounded-lg border border-system-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-system-border bg-system-bg px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-system-ink-secondary">
          {continentLabel}
        </span>

        {needsControls && (
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-system-ink-muted"
                aria-hidden="true"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca paese..."
                aria-label={`Cerca paese in ${continentLabel}`}
                className="rounded-md border border-system-border bg-white py-1 pl-7 pr-2 text-xs text-system-ink placeholder:text-system-ink-muted focus:border-system-accent focus:outline-none"
              />
            </div>
            {searchedRegions === null && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="whitespace-nowrap font-mono text-xs uppercase tracking-wider text-system-accent hover:underline"
              >
                {expanded
                  ? "Mostra solo estremi ↑"
                  : `Mostra tutti (${totalRegions}) →`}
              </button>
            )}
          </div>
        )}
      </div>

      {needsControls && searchedRegions === null && !expanded && (
        <p className="border-b border-system-border-subtle px-4 py-2 text-xs text-system-ink-muted">
          Anteprima: paesi più economici e più cari · {totalRegions} paesi totali
        </p>
      )}

      {visibleRegions.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-system-ink-muted">
          Nessun paese trovato per &quot;{query}&quot;
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-system-border text-left font-mono text-xs uppercase tracking-wider text-system-ink-secondary">
                <th className="px-4 py-3 font-medium">Regione</th>
                <th className="px-4 py-3 font-medium">Carburante</th>
                <th className="px-4 py-3 text-right font-medium">Prezzo / litro</th>
                <th className="px-4 py-3 text-right font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {visibleRegions.flatMap(({ regionName, rows }) =>
                rows.map((f) => (
                  <tr
                    key={`${regionName}-${f.fuelType}`}
                    className="border-b border-system-border-subtle transition-colors last:border-0 hover:bg-system-bg"
                  >
                    <td className="px-4 py-3">{regionName}</td>
                    <td className="px-4 py-3 text-system-ink-secondary capitalize">
                      {f.fuelType === "petrol" ? "Benzina" : "Diesel"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {parseFloat(f.price).toFixed(3)}{" "}
                      <span className="text-xs text-system-ink-muted">{f.currency}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-system-ink-muted">
                      {f.recordedAtFormatted}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
