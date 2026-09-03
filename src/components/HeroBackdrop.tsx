import type { PricePoint } from "@/lib/priceHistory";

type HeroBackdropProps = {
  /** Punti della serie da disegnare, in ordine cronologico. */
  points: PricePoint[];
  className?: string;
};

// Sistema di coordinate interno del disegno. Non sono pixel: l'SVG ha
// `preserveAspectRatio="none"`, quindi si deforma per riempire il
// contenitore. Sono solo le proporzioni con cui calcoliamo i punti.
const VIEW_W = 1200;
const VIEW_H = 260;
// Margine verticale: la curva non tocca mai il bordo alto/basso del
// riquadro, altrimenti nei punti estremi il tratto verrebbe tagliato a
// metà dallo spessore della linea.
const PAD_Y = 26;

/**
 * Sfondo dell'header: la curva REALE della serie passata (il Brent a 90
 * giorni) disegnata a piena larghezza dietro il wordmark, in ambra al 12%
 * di opacità.
 *
 * Perché così e non un'immagine o una gif: il principio del progetto è che
 * ogni cosa in pagina debba avere una fonte. Un asset decorativo comprato
 * o generato direbbe il contrario proprio nel punto più visibile del sito.
 * Questa curva invece è il dato: cambia da sola a ogni nuova rilevazione,
 * pesa zero byte di asset scaricati (è markup, viaggia col resto della
 * pagina), non ha bisogno di essere aggiornata a mano e non rallenta il
 * primo caricamento. È ornamento e informazione nello stesso segno.
 *
 * Perché NON ha assi né etichette: qui è deliberatamente illeggibile come
 * grafico. Il grafico vero, con scala e valori, sta nella sezione 03. Un
 * grafico "quasi leggibile" nell'header inviterebbe a leggerne i valori
 * senza dare gli strumenti per farlo — peggio che non averlo. Per questo è
 * anche `aria-hidden`: per uno screen reader non c'è nulla da annunciare,
 * l'informazione è tutta nella sezione dedicata.
 *
 * Server Component: nessuna interattività, nessuno stato. La matematica
 * gira una volta sola sul server e in pagina arriva solo il tracciato.
 */
export function HeroBackdrop({ points, className = "" }: HeroBackdropProps) {
  // Con meno di 2 punti non esiste una curva da disegnare (una linea ha
  // bisogno di almeno due estremi). Meglio nessuno sfondo che un tratto
  // orizzontale finto che sembrerebbe "prezzo piatto".
  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Se tutti i valori sono identici (serie piatta) lo span è 0 e la
  // divisione darebbe NaN: in quel caso usiamo 1, così la curva finisce
  // tutta a metà altezza — che è la rappresentazione corretta di "non
  // cambia nulla".
  const span = max - min || 1;

  const coords = points.map((point, i) => {
    const x = (i / (points.length - 1)) * VIEW_W;
    // L'asse Y dell'SVG cresce verso il BASSO, quindi il valore più alto
    // deve avere la y più piccola: da qui il `(max - value)` invece di
    // `(value - min)`.
    const y = PAD_Y + ((max - point.value) / span) * (VIEW_H - PAD_Y * 2);
    return { x, y };
  });

  const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  // Il poligono dell'area è la stessa spezzata più due vertici che la
  // chiudono sul bordo inferiore del riquadro.
  const area = `0,${VIEW_H} ${line} ${VIEW_W},${VIEW_H}`;
  const last = coords[coords.length - 1];

  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      // `none`: la curva si stira per riempire l'header a qualsiasi
      // larghezza invece di mantenere le proporzioni e lasciare fasce
      // vuote ai lati. Su un elemento decorativo la deformazione non è un
      // problema — anzi, tiene il tratto sempre a filo dei bordi.
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="hero-fade" x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor="var(--color-system-chrome-accent)"
            stopOpacity={0.1}
          />
          <stop
            offset="100%"
            stopColor="var(--color-system-chrome-accent)"
            stopOpacity={0}
          />
        </linearGradient>
      </defs>

      <polygon points={area} fill="url(#hero-fade)" />
      <polyline
        className="animate-draw"
        points={line}
        fill="none"
        stroke="var(--color-system-chrome-accent)"
        strokeOpacity={0.2}
        strokeWidth={2}
        // `vectorEffect` tiene lo spessore del tratto costante in pixel
        // nonostante la deformazione del viewBox: senza, allargando la
        // finestra la linea si assottiglierebbe fino a sparire.
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
      {/* Punto sull'ultima rilevazione: è l'unico segno "acceso" del
          disegno, e indica dove finisce il dato — non è un pallino
          decorativo messo a caso. */}
      <circle
        cx={last.x}
        cy={last.y}
        r={4}
        fill="var(--color-system-chrome-accent)"
        fillOpacity={0.4}
      />
    </svg>
  );
}
