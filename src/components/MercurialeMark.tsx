type MercurialeMarkProps = {
  size?: number;
  className?: string;
};

/**
 * Il marchio di Mercuriale.
 *
 * Il segno è l'intersezione di due assi con i terminali marcati — l'asse
 * del tempo (orizzontale) e l'asse del valore (verticale) — con una stella
 * a quattro punte nel punto di incrocio: un dato su un grafico. I terminali
 * a T lo fanno leggere anche come un regolo di misura, che è il gesto
 * giusto per un listino di prezzi.
 *
 * Quattro scelte che vale la pena spiegare, perché sono le uniche che
 * rendono questo file riusabile ovunque senza duplicarlo:
 *
 * 1. `currentColor` ovunque, nessun hex. Il marchio eredita il `color` del
 *    genitore: `text-system-chrome-accent` sul bruno, `text-system-accent`
 *    sull'avorio. Un solo file per le due tarature della palette — la
 *    stessa ragione per cui ProvenanceStamp era già scritto così.
 *
 * 2. `viewBox` 0–64 senza dimensioni fisse nell'SVG: la misura arriva dalla
 *    prop, il sistema di coordinate resta identico in ogni contesto.
 *
 * 3. L'estremità destra dell'asse del tempo non ha il terminale a T ma un
 *    disco pieno: è l'ultima rilevazione, la stessa cosa che HeroBackdrop
 *    disegna in fondo alla curva del Brent. Nel disegno originale il
 *    pallino fluttuava slegato dalla geometria e leggeva come un badge di
 *    notifica; ancorato all'asse diventa parte del significato. Resta in
 *    `currentColor`: un secondo colore qui dentro romperebbe la separazione
 *    fra colore di marca e colori di segnale introdotta nella palette.
 *
 * 4. Tratti sottili (3 unità su 64) e stella larga. È il rapporto che fa
 *    leggere la stella come una forma a sé invece che come un ispessimento
 *    dell'incrocio. Per la favicon serve il rapporto opposto — vedi
 *    src/app/icon.svg, che è volutamente un secondo disegno e non questo
 *    rimpicciolito.
 *
 * Nota sul rischio "glifo AI": la stella a quattro punte con i lati concavi
 * è diventata l'icona universale del contenuto generato da un modello, e su
 * un sito la cui promessa è la verificabilità delle fonti l'associazione
 * lavora contro. Le `Q` qui sotto sono curve quadratiche con il punto di
 * controllo tirato verso il centro, ed è quello a incavare i lati:
 * sostituire le quattro `Q` con altrettante `L` dà un rombo a lati diritti
 * e chiude la questione. Per ora si resta fedeli al disegno originale.
 */
export function MercurialeMark({ size = 32, className = "" }: MercurialeMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="3">
        {/* asse del tempo: terminale a T solo a sinistra, a destra c'è il disco */}
        <path d="M5 32 H57" />
        <path d="M5 24 V40" />
        {/* asse del valore: terminali a T su entrambe le estremità */}
        <path d="M32 5 V59" />
        <path d="M24 5 H40" />
        <path d="M24 59 H40" />
      </g>
      {/* il dato */}
      <path
        fill="currentColor"
        d="M32 9 Q34.5 29 47 32 Q34.5 35 32 55 Q29.5 35 17 32 Q29.5 29 32 9 Z"
      />
      {/* ultima rilevazione */}
      <circle cx="57" cy="32" r="4" fill="currentColor" />
    </svg>
  );
}
