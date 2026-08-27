type StatusLabelProps = {
  /** Testo principale, es. "MARKET DATA" */
  label: string;
  /** Stato secondario, es. "LIVE" oppure la data ultimo aggiornamento */
  value: string;
  /** Se true, il pallino pulsa (dato "vivo" / aggiornato di recente) */
  live?: boolean;
};

/**
 * Etichetta compatta in stile "pannello di controllo": pallino di stato
 * + testo monospace maiuscolo, separati da un punto medio (·).
 *
 * Perché il pallino pulsa con Tailwind puro (animate-ping) e non con
 * JS: è un'animazione CSS nativa, quindi zero costo di performance e
 * funziona anche prima che React idrati il componente lato client.
 */
export function StatusLabel({ label, value, live = false }: StatusLabelProps) {
  return (
    <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-system-ink-muted">
      <span className="relative flex h-2 w-2">
        {live && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-system-accent opacity-75" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            live ? "bg-system-accent" : "bg-system-ink-muted"
          }`}
        />
      </span>
      <span>{label}</span>
      <span className="text-system-ink">·</span>
      <span>{value}</span>
    </div>
  );
}
