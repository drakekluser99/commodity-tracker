import { localizedCountryName } from "@/lib/countryNames";

/**
 * Genera "cosa è cambiato questa settimana": non un elenco di percentuali
 * (quello esiste già, è "Maggiori variazioni" in home), ma frasi che dicono
 * la stessa cosa che dice la scomposizione fiscale — non solo QUANTO è
 * cambiato il prezzo, ma quanta parte di quel cambiamento è carburante e
 * quanta è tassa. "Il diesel è salito di 3 centesimi, tutti di prodotto,
 * zero di tassa" è un'informazione diversa da "diesel +1,4%".
 *
 * Funzione pura: riceve le righe di due settimane già lette dal database
 * (vedi getLastTwoEuropeFuelWeeks in lib/db/queries.ts) e restituisce le
 * frasi da salvare. Nessun accesso a IO qui dentro, stesso principio di
 * priceHistory.ts — si testa con dati finti, senza un database.
 */

export interface WeekFuelRow {
  regionName: string; // chiave grezza in inglese, es. "Italy"
  fuelType: string; // "petrol" | "diesel"
  price: string;
  priceNet: string | null;
}

export type NarrativeKind = "it_petrol" | "it_diesel" | "eu_mover";

export interface NarrativeEntry {
  kind: NarrativeKind;
  text: string;
}

const FUEL_INFO: Record<string, { label: string; masculine: boolean }> = {
  petrol: { label: "la benzina", masculine: false },
  diesel: { label: "il diesel", masculine: true },
};

function toNum(v: string | null): number | null {
  return v !== null ? parseFloat(v) : null;
}

/** Differenza in centesimi di euro, arrotondata all'intero più vicino. */
function centsDelta(current: number, previous: number): number {
  return Math.round((current - previous) * 100);
}

/**
 * Descrive una delle due componenti (prodotto o tassa) di una variazione.
 * "tutti"/"zero" quando una componente spiega da sola l'intera variazione
 * (il caso comune — il prezzo netto UE non cambia tutte le settimane),
 * altrimenti il valore firmato. Senza ripetere la parola "centesimi": la
 * stabilisce già la frase che la contiene.
 */
function describePart(partCents: number, totalCents: number): string {
  if (partCents === 0) return "zero";
  if (partCents === totalCents) return "tutti";
  return `${partCents > 0 ? "+" : "−"}${Math.abs(partCents)}`;
}

/**
 * Una riga completa: soggetto + carburante + verso della variazione,
 * scomposta in prodotto/tassa quando entrambe le settimane hanno il netto.
 * `null` se la variazione arrotonda a zero centesimi — nessuna notizia,
 * meglio niente riga che una inventata.
 */
function describeChange(
  subject: string,
  fuelType: string,
  current: { price: number; net: number | null },
  previous: { price: number; net: number | null }
): string | null {
  const info = FUEL_INFO[fuelType];
  if (!info) return null;

  const deltaCents = centsDelta(current.price, previous.price);
  if (deltaCents === 0) return null;

  const up = deltaCents > 0;
  const verb = up
    ? info.masculine
      ? "salito"
      : "salita"
    : info.masculine
      ? "sceso"
      : "scesa";
  const abs = Math.abs(deltaCents);
  const base = `${subject} ${info.label} è ${verb} di ${abs} centes${abs === 1 ? "imo" : "imi"} questa settimana`;

  // Senza il netto per una delle due settimane non si scompone: una tassa
  // stimata per differenza da una media costerebbe più di una frase più
  // corta, stesso principio della mappa e del calcolatore.
  if (current.net === null || previous.net === null) {
    return `${base}.`;
  }

  const netDeltaCents = centsDelta(current.net, previous.net);
  const taxDeltaCents = deltaCents - netDeltaCents;
  return `${base}: ${describePart(netDeltaCents, deltaCents)} di prodotto, ${describePart(taxDeltaCents, deltaCents)} di tassa.`;
}

export function generateWeeklyNarrative(
  current: WeekFuelRow[],
  previous: WeekFuelRow[]
): NarrativeEntry[] {
  const previousByKey = new Map<string, WeekFuelRow>();
  for (const row of previous) {
    previousByKey.set(`${row.regionName}|${row.fuelType}`, row);
  }

  const entries: NarrativeEntry[] = [];

  // Le due righe fisse: benzina e diesel in Italia. Sono la ragion d'essere
  // del sito, quindi compaiono ogni volta che c'è una variazione da dire.
  for (const fuelType of ["petrol", "diesel"] as const) {
    const currentRow = current.find(
      (r) => r.regionName === "Italy" && r.fuelType === fuelType
    );
    const previousRow = previousByKey.get(`Italy|${fuelType}`);
    if (!currentRow || !previousRow) continue;

    const currentPrice = toNum(currentRow.price);
    const previousPrice = toNum(previousRow.price);
    if (currentPrice === null || previousPrice === null) continue;

    const text = describeChange(
      "In Italia",
      fuelType,
      { price: currentPrice, net: toNum(currentRow.priceNet) },
      { price: previousPrice, net: toNum(previousRow.priceNet) }
    );
    if (text) {
      entries.push({
        kind: fuelType === "petrol" ? "it_petrol" : "it_diesel",
        text,
      });
    }
  }

  // La terza riga: il paese DIVERSO dall'Italia con la variazione più
  // grande sulla benzina questa settimana. Dà alla sezione un respiro
  // europeo invece di parlare solo di noi due volte su tre — lo stesso
  // principio della mappa, applicato a una frase invece che a un colore.
  // Solo benzina: è il carburante di riferimento in tutto il resto del
  // sito (la mappa parte su benzina, il calcolatore la usa per "pieno
  // auto"), e due mover nella stessa riga avrebbero reso la frase illeggibile.
  let biggestMover: { text: string; absCents: number } | null = null;
  for (const currentRow of current) {
    if (currentRow.regionName === "Italy" || currentRow.fuelType !== "petrol") {
      continue;
    }
    const previousRow = previousByKey.get(`${currentRow.regionName}|petrol`);
    if (!previousRow) continue;

    const currentPrice = toNum(currentRow.price);
    const previousPrice = toNum(previousRow.price);
    if (currentPrice === null || previousPrice === null) continue;

    const absCents = Math.abs(centsDelta(currentPrice, previousPrice));
    if (absCents === 0) continue;
    if (biggestMover && absCents <= biggestMover.absCents) continue;

    const text = describeChange(
      `In ${localizedCountryName(currentRow.regionName)}`,
      "petrol",
      { price: currentPrice, net: toNum(currentRow.priceNet) },
      { price: previousPrice, net: toNum(previousRow.priceNet) }
    );
    if (text) biggestMover = { text, absCents };
  }
  if (biggestMover) {
    entries.push({ kind: "eu_mover", text: biggestMover.text });
  }

  return entries;
}
