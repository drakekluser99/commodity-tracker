import type { LatestProvinceFuelPrice } from "./db/queries";

/**
 * Fase 4 — equivalente di europeFuelStats.ts ma per le 107 province
 * italiane (MIMIT), non i 27 paesi UE (Commissione Europea).
 *
 * Perché un file separato e non un'estensione di europeFuelStats.ts: le
 * due fonti danno dati di forma diversa. La Commissione pubblica un prezzo
 * NETTO (da cui deriviamo la scomposizione fiscale); il MIMIT pubblica solo
 * il prezzo alla pompa, diviso in self/servito. Non c'è netto da cui
 * sottrarre, quindi qui non esiste (e non deve esistere) un taxPerLiter:
 * la scomposizione fiscale del carburante italiano resta unica per tutto
 * il paese e vive già in /paese/italia — l'accisa non varia da provincia a
 * provincia, quindi ripeterla qui sarebbe un numero identico ripetuto 107
 * volte, non un'informazione nuova.
 */

export interface ProvinceFuelPoint {
  provinceCode: string; // sigla, es. "MI" — chiave grezza di provinces.code
  provinceName: string;
  petrolSelf: number | null;
  petrolServed: number | null;
  dieselSelf: number | null;
  dieselServed: number | null;
  // Impianti dietro ciascuna media — trasparenza sul campione, stesso
  // principio del conteggio già salvato in retail_fuel_prices_it.
  petrolSelfStations: number | null;
  petrolServedStations: number | null;
  dieselSelfStations: number | null;
  dieselServedStations: number | null;
  recordedAt: Date | null;
}

export interface ItalyFuelAverage {
  petrolSelf: number | null;
  petrolServed: number | null;
  dieselSelf: number | null;
  dieselServed: number | null;
}

/**
 * Media PESATA sul numero di impianti di ogni provincia, non una media
 * semplice fra le 107 province come invece si fa per i 27 paesi UE in
 * europeFuelStats.ts. Lì una media semplice è una scelta dichiarata perché
 * non abbiamo i consumi reali per paese per pesarla correttamente; qui
 * invece il numero di impianti per provincia è un dato che abbiamo già,
 * salvato apposta per trasparenza sul campione — usarlo come peso è più
 * onesto di ignorarlo, e Milano (centinaia di impianti) non deve pesare
 * quanto un'Isernia da poche decine.
 */
function weightedAverage(
  items: { price: number; weight: number }[]
): number | null {
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  if (totalWeight === 0) return null;
  const weightedSum = items.reduce((sum, i) => sum + i.price * i.weight, 0);
  return weightedSum / totalWeight;
}

export function computeItalianFuelStats(prices: LatestProvinceFuelPrice[]): {
  provinces: ProvinceFuelPoint[];
  average: ItalyFuelAverage;
} {
  const byProvince = new Map<string, ProvinceFuelPoint>();

  for (const p of prices) {
    const existing = byProvince.get(p.provinceCode) ?? {
      provinceCode: p.provinceCode,
      provinceName: p.provinceName,
      petrolSelf: null,
      petrolServed: null,
      dieselSelf: null,
      dieselServed: null,
      petrolSelfStations: null,
      petrolServedStations: null,
      dieselSelfStations: null,
      dieselServedStations: null,
      recordedAt: null,
    };
    // `priceSelfAvg`/`priceServedAvg` arrivano come stringa o null dal
    // driver Postgres: stesso ternario cauto di europeFuelStats.ts, un
    // parseFloat(null) darebbe NaN e passerebbe indenne come "numero".
    const self = p.priceSelfAvg !== null ? parseFloat(p.priceSelfAvg) : null;
    const served =
      p.priceServedAvg !== null ? parseFloat(p.priceServedAvg) : null;
    if (p.fuelType === "petrol") {
      existing.petrolSelf = self;
      existing.petrolServed = served;
      existing.petrolSelfStations = p.selfStationCount;
      existing.petrolServedStations = p.servedStationCount;
    }
    if (p.fuelType === "diesel") {
      existing.dieselSelf = self;
      existing.dieselServed = served;
      existing.dieselSelfStations = p.selfStationCount;
      existing.dieselServedStations = p.servedStationCount;
    }
    if (!existing.recordedAt || p.recordedAt > existing.recordedAt) {
      existing.recordedAt = p.recordedAt;
    }
    byProvince.set(p.provinceCode, existing);
  }

  const provinceList = Array.from(byProvince.values());

  function averageSelf(fuel: "petrolSelf" | "dieselSelf", stationsKey: "petrolSelfStations" | "dieselSelfStations"): number | null {
    return weightedAverage(
      provinceList
        .filter((pr) => pr[fuel] !== null && pr[stationsKey] !== null)
        .map((pr) => ({ price: pr[fuel] as number, weight: pr[stationsKey] as number }))
    );
  }
  function averageServed(fuel: "petrolServed" | "dieselServed", stationsKey: "petrolServedStations" | "dieselServedStations"): number | null {
    return weightedAverage(
      provinceList
        .filter((pr) => pr[fuel] !== null && pr[stationsKey] !== null)
        .map((pr) => ({ price: pr[fuel] as number, weight: pr[stationsKey] as number }))
    );
  }

  return {
    provinces: provinceList,
    average: {
      petrolSelf: averageSelf("petrolSelf", "petrolSelfStations"),
      petrolServed: averageServed("petrolServed", "petrolServedStations"),
      dieselSelf: averageSelf("dieselSelf", "dieselSelfStations"),
      dieselServed: averageServed("dieselServed", "dieselServedStations"),
    },
  };
}

/**
 * Posizione di una provincia in classifica per prezzo (1 = più cara), tra
 * le sole province per cui il prezzo è disponibile quel giorno — stessa
 * convenzione di rankByTaxShare in europeFuelStats.ts (rank 1 = valore più
 * alto), così un domani chi legge entrambi i file non deve invertire la
 * lettura mentalmente.
 */
export function rankByPrice(
  provinceList: ProvinceFuelPoint[],
  fuel: "petrol" | "diesel",
  mode: "self" | "served"
): Map<string, { rank: number; total: number }> {
  const key =
    fuel === "petrol"
      ? mode === "self"
        ? "petrolSelf"
        : "petrolServed"
      : mode === "self"
        ? "dieselSelf"
        : "dieselServed";

  const withPrice = provinceList
    .map((p) => ({ provinceCode: p.provinceCode, price: p[key] }))
    .filter((p): p is { provinceCode: string; price: number } => p.price !== null)
    .sort((a, b) => b.price - a.price);

  const ranks = new Map<string, { rank: number; total: number }>();
  withPrice.forEach((p, i) => {
    ranks.set(p.provinceCode, { rank: i + 1, total: withPrice.length });
  });
  return ranks;
}
