import type { ReactNode } from "react";
import { ProvenanceStamp } from "./ProvenanceStamp";
import { badgeKindsFor, KIND_LABEL, type SourceId } from "@/lib/sources";

type SourceNoteProps = {
  /**
   * Le fonti citate in questa nota. Più di una è normale (es. "Maggiori
   * variazioni" mescola Alpha Vantage, Commissione Europea ed EIA): i badge
   * si deduplicano da soli sul `kind`, quindi due fonti primarie non
   * producono due badge identici.
   */
  sources: SourceId[];
  children: ReactNode;
};

/**
 * Nota "Fonte:" condivisa da homepage e pagine paese (prima erano due
 * implementazioni copiate a mano — una qui, una inline in
 * `/paese/[slug]/page.tsx` — che si spostano fuori sincrono a ogni modifica
 * di stile). Estratta in Fase 2 insieme alla gerarchia delle fonti, perché
 * i badge dovevano comparire in entrambi i posti.
 *
 * Il timbro di provenienza resta il primo elemento, come prima: dice "questo
 * numero ha una fonte". I badge sotto dicono *che tipo* di fonte è —
 * distinzione che l'analisi competitor isola come quella che separa un sito
 * credibile da "un altro sito con numeri".
 */
export function SourceNote({ sources, children }: SourceNoteProps) {
  const kinds = badgeKindsFor(sources);

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <p className="flex items-start gap-1.5 font-mono text-xs uppercase tracking-wider text-system-ink-muted">
        <ProvenanceStamp
          size={14}
          className="mt-0.5 shrink-0 text-system-accent"
        />
        <span>{children}</span>
      </p>
      <div className="ml-[22px] flex flex-wrap gap-1.5">
        {kinds.map((kind) => (
          <span
            key={kind}
            className={
              kind === "primaria"
                ? "rounded border border-system-accent/40 px-1.5 py-0.5 font-mono text-[10px] uppercase leading-none tracking-wider text-system-accent"
                : "rounded border border-system-ink-muted/40 px-1.5 py-0.5 font-mono text-[10px] uppercase leading-none tracking-wider text-system-ink-muted"
            }
          >
            {KIND_LABEL[kind]}
          </span>
        ))}
      </div>
    </div>
  );
}
