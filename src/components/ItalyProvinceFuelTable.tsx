"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { formatFuelPrice } from "@/lib/format";

export type ProvinceFuelRow = {
  provinceCode: string;
  provinceName: string;
  /** Slug pronto per il link, es. "milano" — evita di ricalcolarlo/importare
   * provinceForCode dentro un Client Component. */
  slug: string;
  petrolSelf: number | null;
  dieselSelf: number | null;
};

type ItalyProvinceFuelTableProps = {
  rows: ProvinceFuelRow[];
  /** Quante province mostrare in anteprima (metà più economiche, metà più
   * care). Più alto che in FuelPriceTable (6): con 107 province invece di
   * 27 paesi, 6 estremi sarebbero un campione troppo piccolo per farsi
   * un'idea della variabilità. */
  previewCount?: number;
};

/**
 * Tabella "Carburanti in Italia, provincia per provincia" — stessa idea di
 * FuelPriceTable (ricerca + anteprima degli estremi + "mostra tutti"), non
 * duplicata da lì perché la forma dei dati è diversa: FuelPriceTable ha una
 * riga per (paese, carburante), qui ogni provincia è GIÀ una riga sola con
 * benzina e gasolio affiancati — non ha senso raddoppiare le righe quando
 * le 107 province condividono la stessa unità di rilevazione (self, MIMIT).
 *
 * La differenza che conta rispetto a FuelPriceTable: qui ogni riga porta a
 * una pagina reale (/provincia/[slug]). Prima di questo componente le 107
 * pagine esistevano già ma erano raggiungibili solo digitando l'URL — vedi
 * CLAUDE.md, sezione Fase 4. Il click sull'intera riga (non solo sul nome)
 * è deliberato: con 107 righe un bersaglio di click piccolo (solo il testo
 * del nome) sarebbe scomodo su schermi piccoli/touch.
 */
export function ItalyProvinceFuelTable({
  rows,
  previewCount = 10,
}: ItalyProvinceFuelTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  // Prezzo medio (benzina + gasolio, solo dove disponibili) per ordinare
  // dal più economico al più caro — stesso ruolo di `avgPrice` in
  // FuelPriceTable, ma qui il dato è già a livello di provincia, quindi non
  // serve raggrupparlo prima.
  const sorted = useMemo(() => {
    return [...rows]
      .map((r) => {
        const prices = [r.petrolSelf, r.dieselSelf].filter(
          (p): p is number => p !== null
        );
        const avgPrice =
          prices.length > 0
            ? prices.reduce((sum, p) => sum + p, 0) / prices.length
            : null;
        return { ...r, avgPrice };
      })
      // Una provincia senza NESSUN prezzo (cron non ancora passato di lì)
      // non ha senso ordinarla né mostrarla tra gli "estremi": finirebbe
      // sempre in cima o in fondo per un dato che non c'è.
      .filter((r) => r.avgPrice !== null)
      .sort((a, b) => (a.avgPrice as number) - (b.avgPrice as number));
  }, [rows]);

  const total = sorted.length;
  const needsControls = total > previewCount;

  const searched = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.trim().toLowerCase();
    return sorted.filter((r) => r.provinceName.toLowerCase().includes(q));
  }, [sorted, query]);

  const visible = useMemo(() => {
    if (searched !== null) return searched;
    if (!needsControls || expanded) return sorted;

    const half = Math.ceil(previewCount / 2);
    const cheapest = sorted.slice(0, half);
    const priciest = sorted.slice(-half);
    const seen = new Set<string>();
    return [...cheapest, ...priciest].filter((r) => {
      if (seen.has(r.provinceCode)) return false;
      seen.add(r.provinceCode);
      return true;
    });
  }, [sorted, searched, needsControls, expanded, previewCount]);

  return (
    <div className="overflow-hidden rounded-lg border border-system-border bg-system-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-system-border bg-system-bg px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-system-ink-secondary">
          Province
        </span>

        {needsControls && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="relative w-full sm:w-auto">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-system-ink-muted"
                aria-hidden="true"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca provincia..."
                aria-label="Cerca provincia"
                className="w-full rounded-md border border-system-border bg-system-surface py-1 pl-7 pr-2 text-xs text-system-ink placeholder:text-system-ink-muted focus:border-system-accent focus:outline-none sm:w-auto"
              />
            </div>
            {searched === null && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="whitespace-nowrap font-mono text-xs uppercase tracking-wider text-system-accent hover:underline"
              >
                {expanded
                  ? "Mostra solo estremi ↑"
                  : `Mostra tutte (${total}) →`}
              </button>
            )}
          </div>
        )}
      </div>

      {needsControls && searched === null && !expanded && (
        <p className="border-b border-system-border-subtle px-4 py-2 text-xs text-system-ink-muted">
          Anteprima: province più economiche e più care · {total} province con
          un prezzo registrato
        </p>
      )}

      {visible.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-system-ink-muted">
          Nessuna provincia trovata per &quot;{query}&quot;
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-system-border text-left font-mono text-xs uppercase tracking-wider text-system-ink-secondary">
                <th className="px-4 py-3 font-medium">Provincia</th>
                <th className="px-4 py-3 text-right font-medium">
                  Benzina self
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  Gasolio self
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const href = `/provincia/${r.slug}`;
                return (
                  // La riga intera naviga al click (onClick + cursor-pointer):
                  // con 107 righe un bersaglio piccolo (solo il nome) sarebbe
                  // scomodo. Il nome resta comunque un <Link> vero — non solo
                  // per accessibilità/tastiera, ma perché è quello che i
                  // motori di ricerca vedono: un onClick su <tr> da solo non
                  // è un link scansionabile.
                  <tr
                    key={r.provinceCode}
                    onClick={() => router.push(href)}
                    className="cursor-pointer border-b border-system-border-subtle transition-colors last:border-0 hover:bg-system-bg"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={href}
                        className="text-system-ink hover:text-system-accent hover:underline"
                      >
                        {r.provinceName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {r.petrolSelf !== null
                        ? `${formatFuelPrice(r.petrolSelf)} €/L`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {r.dieselSelf !== null
                        ? `${formatFuelPrice(r.dieselSelf)} €/L`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
