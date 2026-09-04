/**
 * Registro delle fonti dati del sito, con la loro "gerarchia": una fonte
 * primaria istituzionale (l'ente che pubblica il dato per legge o mandato
 * pubblico — Commissione Europea, EIA) pesa diversamente da un aggregatore
 * commerciale (Alpha Vantage, che a sua volta raccoglie da altre fonti e lo
 * rivende come servizio). Il sito non nasconde questa differenza: la rende
 * visibile accanto a ogni nota "Fonte:", con un badge.
 *
 * Un solo posto per aggiungere una fonte futura (es. MIMIT in Fase 4):
 * basta una nuova voce qui, tutto il resto del sito la eredita.
 */

export type SourceKind = "primaria" | "aggregata";

export type SourceId = "eu-commission" | "eia" | "alpha-vantage" | "mimit" | "adm";

type SourceMeta = {
  /** Nome per esteso, usato nel testo delle note "Fonte:". */
  label: string;
  kind: SourceKind;
};

export const SOURCES: Record<SourceId, SourceMeta> = {
  "eu-commission": {
    label: "Commissione Europea",
    kind: "primaria",
  },
  eia: {
    label: "EIA (U.S. Energy Information Administration)",
    kind: "primaria",
  },
  "alpha-vantage": {
    label: "Alpha Vantage",
    kind: "aggregata",
  },
  // Fase 4: dati stazione-per-stazione aggregati per provincia. Ente
  // pubblico con mandato di legge sulla raccolta, non un intermediario
  // commerciale — stessa categoria di Commissione Europea/EIA.
  mimit: {
    label: "MIMIT (Ministero delle Imprese e del Made in Italy)",
    kind: "primaria",
  },
  // "Numero del giorno" (Fase 3): un'unica cifra annuale, non un cron —
  // vedi src/lib/annualFigures.ts. Ente pubblico con dato autoprodotto
  // (il proprio gettito), stessa categoria delle altre fonti primarie.
  adm: {
    label: "Agenzia delle Dogane e dei Monopoli",
    kind: "primaria",
  },
};

export const KIND_LABEL: Record<SourceKind, string> = {
  primaria: "fonte primaria istituzionale",
  aggregata: "aggregatore commerciale",
};

/** Etichette dei badge, deduplicate e in ordine stabile (primaria prima). */
export function badgeKindsFor(sources: SourceId[]): SourceKind[] {
  const present = new Set(sources.map((id) => SOURCES[id].kind));
  return (["primaria", "aggregata"] as const).filter((k) => present.has(k));
}
