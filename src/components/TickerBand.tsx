export type TickerStat = {
  key: string;
  /** Etichetta breve, resa in maiuscolo dal CSS (il DOM resta com'è). */
  label: string;
  /** Valore già formattato per la UI italiana (vedi src/lib/format.ts). */
  value: string;
  /** Unità di misura, resa più piccola accanto al valore. Opzionale. */
  unit?: string;
  /** Riga di contesto sotto il valore: variazione, cadenza, nota. */
  note?: string;
  /**
   * Tono della riga di contesto. `up`/`down` colorano con i colori di
   * SEGNALE (vedi globals.css), non con l'accento di marca: qui il colore
   * porta significato, non estetica.
   */
  noteTone?: "up" | "down" | "neutral";
};

type TickerBandProps = {
  stats: TickerStat[];
};

/**
 * Fascia sintetica dell'header: i valori di apertura del sito, sul fondo
 * scuro del "chrome".
 *
 * Sostituisce la fila di `StatusLabel` che stava qui prima. Il cambio non
 * è solo estetico: quella era una riga di etichette tutte uguali, e i
 * valori (un prezzo, una data, uno stato) hanno pesi diversi. Qui il
 * valore è l'elemento grosso, l'etichetta è sopra in piccolo e il contesto
 * (variazione, cadenza) sta sotto — così si legge in colpo d'occhio quale
 * numero conta.
 *
 * Solo valori ASSOLUTI e stato: nessun ranking. Le classifiche di
 * variazione vivono già nella sezione "Maggiori variazioni" più sotto, e
 * duplicarle qui le renderebbe entrambe più deboli.
 *
 * L'animazione di ingresso è CSS pura, dichiarata in globals.css
 * (`animate-scan-in`) e sfalsata cella per cella con `animationDelay`
 * inline. Non serve un Client Component: nessuno stato, nessun evento,
 * nessun rischio di disallineamento fra server e client. Parte dal 65% di
 * opacità, mai da zero — vedi la nota sulle animazioni in globals.css.
 */
export function TickerBand({ stats }: TickerBandProps) {
  return (
    /* `relative` non è decorativo: HeroBackdrop nell'header è in
       posizione assoluta, e un elemento posizionato dipinge SOPRA il
       contenuto in flusso normale. Senza questo, la curva di sfondo
       attraverserebbe la fascia invece di fermarsi dietro. */
    <div className="relative border-y border-system-chrome-border bg-system-chrome-raised">
      <div className="mx-auto max-w-7xl">
        {/* 2 colonne su mobile, tutte in riga da `lg` in su. I divisori
            verticali (border-l) esistono solo dove le celle stanno
            davvero su una riga sola: su due colonne un border-l cadrebbe
            a metà di righe che vanno a capo. */}
        <div className="grid grid-cols-2 lg:grid-cols-5">
          {stats.map((stat, i) => (
            <div
              key={stat.key}
              className="animate-scan-in border-l border-system-chrome-border px-5 py-3.5 first:border-l-0 lg:border-l"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-system-chrome-ink-muted">
                {stat.label}
              </div>
              <div className="mt-1 font-mono text-[17px] font-medium tabular-nums text-system-chrome-ink">
                {stat.value}
                {stat.unit && (
                  <span className="ml-1 text-[11px] text-system-chrome-ink-muted">
                    {stat.unit}
                  </span>
                )}
              </div>
              {stat.note && (
                <div
                  className={`mt-0.5 font-mono text-[11px] tabular-nums ${
                    stat.noteTone === "up"
                      ? "text-system-chrome-signal-up"
                      : stat.noteTone === "down"
                        ? "text-system-chrome-signal-down"
                        : "text-system-chrome-ink-muted"
                  }`}
                >
                  {stat.note}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
