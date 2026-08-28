type ProvenanceStampProps = {
  size?: number;
  className?: string;
};

/**
 * Timbro di provenienza — l'elemento firma del sito.
 *
 * Perché questo e non un'icona qualsiasi: le materie prime sono beni
 * fisici storicamente certificati (hallmark sull'oro, certificazioni di
 * origine sul petrolio, bolli di qualità sui prodotti agricoli). Il
 * progetto ha come principio cardine "nessun dato senza contesto" — un
 * timbro di autenticazione non è decorazione, codifica letteralmente
 * quello che il sito fa: certificare che ogni dato ha una fonte
 * verificabile.
 *
 * Cerchio doppio + tacche cardinali (come un vero hallmark) + spunta
 * interna, ruotato di -6° per un effetto "timbrato a mano" invece che
 * un'icona vettoriale asettica.
 *
 * `currentColor` invece di un hex fisso: eredita il colore del testo del
 * genitore, così basta cambiare una classe text-* per ricolorarlo, senza
 * duplicare il verde system-accent qui dentro.
 */
export function ProvenanceStamp({ size = 16, className = "" }: ProvenanceStampProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      className={className}
      aria-hidden="true"
    >
      <g transform="translate(64,64) rotate(-6)">
        <circle r="46" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle r="37" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <line x1="0" y1="-46" x2="0" y2="-58" stroke="currentColor" strokeWidth="3" />
        <line x1="0" y1="46" x2="0" y2="58" stroke="currentColor" strokeWidth="3" />
        <line x1="-46" y1="0" x2="-58" y2="0" stroke="currentColor" strokeWidth="3" />
        <line x1="46" y1="0" x2="58" y2="0" stroke="currentColor" strokeWidth="3" />
        <path
          d="M -16 2 L -5 15 L 18 -14"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
