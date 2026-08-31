type StatusLabelProps = {
  /** Testo principale, es. "MARKET DATA" */
  label: string;
  /** Stato secondario, es. la data dell'ultimo aggiornamento */
  value: string;
};

/**
 * Etichetta compatta in stile "pannello di controllo": pallino di stato
 * statico + testo monospace maiuscolo, separati da un punto medio (·).
 *
 * Il pallino NON è animato: i dati di Prezzario hanno cadenze giornaliere,
 * settimanali o mensili, non sono uno stream. Un pallino pulsante
 * suggerirebbe un flusso live che non esiste. Se un domani ci fosse un
 * dato realmente in streaming, l'animazione avrebbe senso solo lì.
 */
export function StatusLabel({ label, value }: StatusLabelProps) {
  return (
    <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-system-ink-muted">
      <span className="inline-flex h-2 w-2 rounded-full bg-system-ink-muted" />
      <span>{label}</span>
      <span className="text-system-ink">·</span>
      <span>{value}</span>
    </div>
  );
}
