import type { ReactNode } from "react";
import Link from "next/link";
import { ProvenanceStamp } from "./ProvenanceStamp";
import { badgeKindsFor, KIND_LABEL, type SourceId } from "@/lib/sources";
import { formatDateTime } from "@/lib/format";

/**
 * Un controllo pipeline da citare in una nota "Fonte:" — l'ultima
 * esecuzione registrata in `fetch_runs` per il job di quella fonte.
 * Un array e non un valore solo perché una nota può citare più fonti con
 * cadenze diverse (es. la sezione "Carburanti al consumo" mescola UE e
 * USA). `checkedAt` è `null` quando il job non ha ancora una riga in
 * `fetch_runs` (subito dopo il primo deploy) — si mostra comunque la
 * cadenza dichiarata, non si nasconde la riga.
 */
export type PipelineCheck = {
  /** Etichetta breve della fonte in QUESTO controllo (es. "UE", "USA"). */
  label: string;
  /** Cadenza dichiarata in prosa (es. "ogni giovedì"). */
  cadence: string;
  checkedAt: Date | null;
};

type SourceNoteProps = {
  /**
   * Le fonti citate in questa nota. Più di una è normale (es. "Maggiori
   * variazioni" mescola Alpha Vantage, Commissione Europea ed EIA): i badge
   * si deduplicano da soli sul `kind`, quindi due fonti primarie non
   * producono due badge identici.
   */
  sources: SourceId[];
  /**
   * Quando presente, aggiunge sotto i badge una riga con l'ultima
   * esecuzione registrata del cron corrispondente — la stessa domanda a
   * cui risponde /stato-dati (che oggi va scoperta navigando lì apposta),
   * mostrata qui accanto al numero stesso invece che solo in una pagina
   * a parte. Omesso per le fonti a cadenza mista (Alpha Vantage) o senza
   * ancora un cron tracciato in fetch_runs (MIMIT, "numero del giorno").
   */
  checks?: PipelineCheck[];
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
export function SourceNote({ sources, checks, children }: SourceNoteProps) {
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
      {checks && checks.length > 0 && (
        <p className="ml-[22px] font-mono text-[11px] leading-relaxed text-system-ink-muted">
          {checks.map((c, i) => (
            <span key={c.label}>
              {i > 0 && " · "}
              Controllato {c.label} {c.cadence}, ultimo controllo{" "}
              {c.checkedAt ? formatDateTime(c.checkedAt) : "non ancora registrato"}
            </span>
          ))}
          {" — "}
          <Link href="/stato-dati" className="text-system-accent hover:underline">
            dettaglio pipeline
          </Link>
        </p>
      )}
    </div>
  );
}
