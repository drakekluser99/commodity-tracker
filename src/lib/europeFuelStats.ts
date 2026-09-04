import type { LatestFuelPrice } from "./db/queries";

/**
 * Dato carburante di un paese europeo, già scomposto per benzina/diesel e
 * lordo/netto. `recordedAt` è la data della rilevazione più recente tra le
 * due (di solito coincidono, arrivano dallo stesso bollettino settimanale).
 */
export interface CountryFuelPoint {
  countryName: string; // chiave grezza in inglese, es. "Italy" — quella di `regions.name`
  petrol: number | null;
  diesel: number | null;
  /** Prezzi al netto delle imposte. `null` dove la Commissione non li pubblica. */
  petrolNet: number | null;
  dieselNet: number | null;
  /**
   * Accisa (euro/litro) e aliquota IVA (%) — Fase 3. `null` dove il foglio
   * delle accise/IVA non copre quel paese in quella settimana, con lo
   * stesso significato di `petrolNet`/`dieselNet`: niente non è zero.
   */
  petrolExciseEur: number | null;
  dieselExciseEur: number | null;
  petrolVatRatePercent: number | null;
  dieselVatRatePercent: number | null;
  recordedAt: Date | null;
}

export interface EuropeFuelAverage {
  petrol: number | null;
  diesel: number | null;
  petrolNet: number | null;
  dieselNet: number | null;
  currency: "EUR";
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Ricostruisce, dai prezzi europei più recenti, sia il dato per paese sia
 * la media dei 27 — le due cose che la home (mappa, calcolatore) e le
 * pagine /paese/[slug] devono vedere allo STESSO modo.
 *
 * Prima questa logica viveva solo dentro page.tsx. Estratta qui perché una
 * pagina paese l'avrebbe altrimenti duplicata una seconda volta, rendendo
 * concreto il rischio che il codice originale già segnalava in un
 * commento: più copie della stessa formula sono più occasioni di farle
 * divergere (es. una pagina che arrotonda la media in modo diverso
 * dall'altra, e i due numeri smettono silenziosamente di coincidere).
 *
 * Media SEMPLICE dei paesi presenti, non ponderata sui consumi — vedi la
 * nota in EuropeFuelMap.tsx e in metodologia/page.tsx: è la media "dei 27",
 * non "la media UE" (che la Commissione calcola pesata, e vale diverso).
 * Un paese senza prezzo netto ESCE dalla media netta invece di entrarci
 * come zero: altrimenti un solo paese senza dato trascinerebbe giù la
 * media di tutti gli altri.
 */
export function computeEuropeFuelStats(fuelPrices: LatestFuelPrice[]): {
  countries: CountryFuelPoint[];
  average: EuropeFuelAverage;
} {
  const europeFuels = fuelPrices.filter((f) => f.continent === "europe");

  const byCountry = new Map<string, CountryFuelPoint>();
  for (const f of europeFuels) {
    const existing = byCountry.get(f.regionName) ?? {
      countryName: f.regionName,
      petrol: null,
      diesel: null,
      petrolNet: null,
      dieselNet: null,
      petrolExciseEur: null,
      dieselExciseEur: null,
      petrolVatRatePercent: null,
      dieselVatRatePercent: null,
      recordedAt: null,
    };
    // `priceNet` arriva come stringa o null: `parseFloat(null)` darebbe NaN,
    // che è un numero e passerebbe indenne. Il ternario tiene il null null.
    // Stessa cautela per accisa e aliquota IVA.
    const net = f.priceNet !== null ? parseFloat(f.priceNet) : null;
    const excise = f.exciseEur !== null ? parseFloat(f.exciseEur) : null;
    const vatRate =
      f.vatRatePercent !== null ? parseFloat(f.vatRatePercent) : null;
    const price = parseFloat(f.price);
    if (f.fuelType === "petrol") {
      existing.petrol = price;
      existing.petrolNet = net;
      existing.petrolExciseEur = excise;
      existing.petrolVatRatePercent = vatRate;
    }
    if (f.fuelType === "diesel") {
      existing.diesel = price;
      existing.dieselNet = net;
      existing.dieselExciseEur = excise;
      existing.dieselVatRatePercent = vatRate;
    }
    if (!existing.recordedAt || f.recordedAt > existing.recordedAt) {
      existing.recordedAt = f.recordedAt;
    }
    byCountry.set(f.regionName, existing);
  }

  function averageGross(fuelType: string): number | null {
    return average(
      europeFuels.filter((f) => f.fuelType === fuelType).map((f) => parseFloat(f.price))
    );
  }

  function averageNet(fuelType: string): number | null {
    return average(
      europeFuels
        .filter((f) => f.fuelType === fuelType && f.priceNet !== null)
        .map((f) => parseFloat(f.priceNet!))
    );
  }

  return {
    countries: Array.from(byCountry.values()),
    average: {
      petrol: averageGross("petrol"),
      diesel: averageGross("diesel"),
      petrolNet: averageNet("petrol"),
      dieselNet: averageNet("diesel"),
      currency: "EUR",
    },
  };
}

/** Imposte al litro: prezzo alla pompa meno prezzo netto. `null` se manca uno dei due. */
export function taxPerLiter(
  gross: number | null,
  net: number | null
): number | null {
  if (gross === null || net === null) return null;
  return gross - net;
}

/** Quota fiscale sul prezzo, in percentuale. `null` se manca il netto o il prezzo non è positivo. */
export function taxSharePercent(
  gross: number | null,
  net: number | null
): number | null {
  if (gross === null || net === null || gross <= 0) return null;
  return ((gross - net) / gross) * 100;
}

/**
 * IVA in euro al litro. Si calcola, non si legge dal database — solo
 * l'aliquota (`vatRatePercent`) è un dato grezzo, l'importo è sempre
 * derivato da qui, un solo posto invece di ricalcolarlo a ogni pagina.
 *
 * Base imponibile = prezzo netto + accisa: è così che l'IVA sui carburanti
 * si applica per legge nell'UE, sul prezzo comprensivo di accisa e non sul
 * solo prezzo industriale. `null` se manca uno qualunque dei tre input —
 * un'IVA calcolata su una base incompleta sarebbe un numero inventato.
 */
export function vatEurPerLiter(
  net: number | null,
  exciseEur: number | null,
  vatRatePercent: number | null
): number | null {
  if (net === null || exciseEur === null || vatRatePercent === null) {
    return null;
  }
  return ((net + exciseEur) * vatRatePercent) / 100;
}

/**
 * Il residuo fiscale che accisa e IVA non spiegano: prezzo lordo meno
 * netto meno accisa meno IVA. Copre "Other Indirect Taxes" (foglio che
 * deliberatamente non leggiamo, vedi euOilBulletinHistory.ts) e i piccoli
 * scarti di arrotondamento tra le fonti. `null` se manca un ingrediente —
 * mai forzato a 0, che nasconderebbe un dato mancante come se fosse un
 * residuo davvero nullo.
 *
 * Non è mai negativo per costruzione fiscale, ma un valore leggermente
 * sotto zero PUÒ comparire per via di arrotondamenti fra fogli diversi
 * della stessa fonte: si clampa a 0 solo qui, in visualizzazione, senza
 * toccare i dati salvati.
 */
export function otherTaxesPerLiter(
  gross: number | null,
  net: number | null,
  exciseEur: number | null,
  vatEur: number | null
): number | null {
  if (gross === null || net === null || exciseEur === null || vatEur === null) {
    return null;
  }
  return Math.max(0, gross - net - exciseEur - vatEur);
}

/**
 * Posizione di un paese in classifica per quota fiscale (1 = quota più
 * alta), tra i soli paesi per cui la quota è calcolabile quella settimana.
 * `total` è quanti paesi entrano in classifica — può essere meno di 27 se
 * a qualcuno manca il prezzo netto.
 */
export function rankByTaxShare(
  countries: CountryFuelPoint[],
  fuel: "petrol" | "diesel"
): Map<string, { rank: number; total: number }> {
  const withShare = countries
    .map((c) => ({
      countryName: c.countryName,
      share: taxSharePercent(
        fuel === "petrol" ? c.petrol : c.diesel,
        fuel === "petrol" ? c.petrolNet : c.dieselNet
      ),
    }))
    .filter((c): c is { countryName: string; share: number } => c.share !== null)
    .sort((a, b) => b.share - a.share);

  const ranks = new Map<string, { rank: number; total: number }>();
  withShare.forEach((c, i) => {
    ranks.set(c.countryName, { rank: i + 1, total: withShare.length });
  });
  return ranks;
}
