import { ImageResponse } from "next/og";

/**
 * Immagine di anteprima per social e chat (Open Graph + Twitter card).
 *
 * Il nome del file è una convenzione dell'App Router: Next trova
 * `opengraph-image.tsx` dentro src/app/, esegue il default export a build
 * time e ne pubblica il PNG, aggiungendo da sé i meta tag `og:image` e
 * `twitter:image`. Per questo in layout.tsx non c'è nessuna dichiarazione
 * di immagine: sarebbe un doppione.
 *
 * `ImageResponse` renderizza JSX con Satori, che è un motore di layout
 * ridotto, non un browser. Tre conseguenze pratiche da ricordare quando si
 * modifica questo file:
 *   - niente CSS esterno, niente Tailwind: solo `style` inline;
 *   - ogni contenitore con più di un figlio vuole `display: "flex"`
 *     esplicito, altrimenti il render fallisce;
 *   - le famiglie di font vanno caricate a mano. Qui non lo facciamo: il
 *     testo usa il fallback di sistema, che non è IBM Plex ma è comunque
 *     un grottesco neutro, e caricare il woff2 di Plex significherebbe una
 *     fetch di rete in fase di build per un'immagine che si guarda a
 *     200 px di larghezza in una timeline.
 *
 * Il marchio è ridisegnato inline invece di importare MercurialeMark
 * perché quel componente usa `currentColor`, che qui non eredita nulla:
 * Satori non ha un albero CSS da cui risalire. Se il segno cambia, vanno
 * aggiornati entrambi — è il prezzo di non avere un browser in fase di
 * build.
 */
export const alt = "Mercuriale · Prezzi materie prime e carburanti";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Gli stessi due valori di globals.css: --color-system-chrome e
// --color-system-chrome-accent. Ripetuti come costanti perché le custom
// property CSS non arrivano fin qui.
const CHROME = "#14110c";
const ACCENT = "#e8a33d";
const INK = "#efe7d8";
const INK_MUTED = "#9a8f7c";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: CHROME,
          padding: "0 90px",
          // Filo ambra in basso: la stessa chiusura del footer del sito.
          borderBottom: `10px solid ${ACCENT}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "34px" }}>
          <svg width="132" height="132" viewBox="0 0 64 64" fill="none">
            <g stroke={ACCENT} strokeWidth="3">
              <path d="M5 32 H57" />
              <path d="M5 24 V40" />
              <path d="M32 5 V59" />
              <path d="M24 5 H40" />
              <path d="M24 59 H40" />
            </g>
            <path
              fill={ACCENT}
              d="M32 9 Q34.5 29 47 32 Q34.5 35 32 55 Q29.5 35 17 32 Q29.5 29 32 9 Z"
            />
            <circle cx="57" cy="32" r="4" fill={ACCENT} />
          </svg>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 92,
                fontWeight: 600,
                letterSpacing: "0.05em",
                color: INK,
              }}
            >
              MERCURIALE
            </div>
            <div
              style={{
                fontSize: 26,
                letterSpacing: "0.18em",
                color: ACCENT,
                marginTop: 8,
              }}
            >
              OSSERVATORIO APERTO · DATI PUBBLICI
            </div>
          </div>
        </div>
        <div style={{ fontSize: 34, color: INK, marginTop: 56 }}>
          Prezzi di materie prime e carburanti
        </div>
        <div style={{ fontSize: 26, color: INK_MUTED, marginTop: 14 }}>
          Ogni dato con la sua fonte, la sua data e i suoi limiti dichiarati.
        </div>
      </div>
    ),
    size,
  );
}
