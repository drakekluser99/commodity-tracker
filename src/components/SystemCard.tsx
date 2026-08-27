import type { ReactNode } from "react";

type SystemCardProps = {
  /** Etichetta piccola sopra il titolo, es. "PROFILE://" — stile terminale */
  eyebrow?: string;
  /** Titolo principale della card */
  title?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Card con angoli "a mirino" invece del solito bordo pieno.
 *
 * Perché così: un bordo pieno su tutti e 4 i lati è quello che usano
 * tutti i siti. L'effetto "system-style" nasce dal fatto che il bordo
 * vero è sottilissimo e sono solo i 4 angoli a essere marcati, come il
 * mirino di una fotocamera. Tecnicamente: 4 <span> posizionati assoluti
 * sugli angoli, ognuno con due lati bordati (es. alto-sinistra ha
 * border-top + border-left), che sporgono di 1px oltre il bordo del box.
 *
 * I colori arrivano dai token "system-*" definiti in @theme (globals.css)
 * — non scriviamo hex qui dentro, così restano centralizzati in un solo
 * posto e coerenti in tutto il sito.
 */
export function SystemCard({
  eyebrow,
  title,
  children,
  className = "",
}: SystemCardProps) {
  const cornerClass =
    "pointer-events-none absolute h-3.5 w-3.5 border-system-border-strong";

  return (
    <div
      className={`relative border border-system-border bg-system-bg p-6 ${className}`}
    >
      {/* I 4 mirini agli angoli: 4 casi diversi (quale coppia di lati
          bordare, quale angolo). Scritti per esteso invece che in loop
          perché sono solo 4 e un loop qui non renderebbe il codice più
          leggibile, solo più indiretto. */}
      <span className={`${cornerClass} -top-px -left-px border-l-2 border-t-2`} />
      <span className={`${cornerClass} -top-px -right-px border-r-2 border-t-2`} />
      <span className={`${cornerClass} -bottom-px -left-px border-l-2 border-b-2`} />
      <span className={`${cornerClass} -bottom-px -right-px border-r-2 border-b-2`} />

      {eyebrow && (
        <p className="mb-1 font-mono text-xs uppercase tracking-wider text-system-ink-muted">
          {eyebrow}
        </p>
      )}
      {title && (
        <h3 className="mb-3 text-lg font-semibold text-system-ink">{title}</h3>
      )}

      {children}
    </div>
  );
}
