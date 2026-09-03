/**
 * Fetcher per l'EIA (U.S. Energy Information Administration) API v2.
 * Route: petroleum/pri/gnd (Gasoline aNd Diesel retail prices).
 * Docs generali: https://www.eia.gov/opendata/documentation.php
 *
 * NOTA PER CHI CONTRIBUISCE: i codici dei "facet" qui sotto (product,
 * duoarea) sono presi dalla documentazione EIA e da serie storiche note
 * (es. EMM_EPMRU_PTE_NUS_DPG per la benzina regular USA), ma non sono
 * stati ancora confermati con una vera chiamata API (serve una API key
 * personale, registrabile gratis su https://www.eia.gov/opendata/register.php).
 * Esegui `npm run inspect:eia` con la tua key per confermare/correggere.
 */

const EIA_BASE_URL = "https://api.eia.gov/v2/petroleum/pri/gnd/data/";

// Codici prodotto EIA: EPMR = Gasoline Regular All Formulations,
// EPD2D = No 2 Diesel Low Sulfur (il diesel standard per autotrazione).
// NUS = "U.S." (media nazionale) come area (duoarea).
const PRODUCT_CODES = { petrol: "EPMR", diesel: "EPD2D" } as const;
const US_NATIONAL_AREA = "NUS";

interface EiaApiRow {
  period: string; // formato data, es. "2026-08-18"
  duoarea: string;
  product: string;
  "product-name": string;
  value: string; // l'API restituisce i numeri come stringa
  units: string; // es. "$/GAL" atteso
}

interface EiaApiResponse {
  response: {
    data: EiaApiRow[];
  };
}

export interface UsFuelPricePoint {
  fuelType: "petrol" | "diesel";
  pricePerLiter: number;
  currency: "USD";
  date: string; // YYYY-MM-DD
}

const GALLONS_TO_LITERS = 3.785411784; // conversione esatta, non un'approssimazione

export async function fetchUsFuelPrices(
  apiKey: string
): Promise<UsFuelPricePoint[]> {
  const url = new URL(EIA_BASE_URL);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("frequency", "weekly");
  url.searchParams.append("data[0]", "value");
  url.searchParams.append("facets[product][]", PRODUCT_CODES.petrol);
  url.searchParams.append("facets[product][]", PRODUCT_CODES.diesel);
  url.searchParams.append("facets[duoarea][]", US_NATIONAL_AREA);
  url.searchParams.append("sort[0][column]", "period");
  url.searchParams.append("sort[0][direction]", "desc");
  url.searchParams.set("length", "10"); // ultime righe, ne basta 1 per prodotto ma teniamo margine

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`EIA API ha risposto HTTP ${res.status}`);
  }

  const json = (await res.json()) as EiaApiResponse;
  const rows = json.response?.data ?? [];

  if (rows.length === 0) {
    throw new Error(
      "Nessun dato restituito dall'API EIA. Verifica i codici product/duoarea con scripts/inspect-eia.ts."
    );
  }

  // Verifica difensiva sull'unità di misura: se l'API non restituisce
  // dollari per gallone come previsto, meglio fallire rumorosamente che
  // salvare un prezzo convertito in modo sbagliato senza accorgersene.
  const unexpectedUnit = rows.find((r) => !r.units?.includes("GAL"));
  if (unexpectedUnit) {
    throw new Error(
      `Unità di misura inattesa dall'API EIA: "${unexpectedUnit.units}". Atteso qualcosa con "GAL". Verifica con scripts/inspect-eia.ts prima di continuare.`
    );
  }

  const latestByProduct = new Map<string, EiaApiRow>();
  for (const row of rows) {
    // Le righe sono ordinate per data decrescente: la prima che vediamo
    // per ogni prodotto è la più recente.
    if (!latestByProduct.has(row.product)) {
      latestByProduct.set(row.product, row);
    }
  }

  const results: UsFuelPricePoint[] = [];
  const petrolRow = latestByProduct.get(PRODUCT_CODES.petrol);
  const dieselRow = latestByProduct.get(PRODUCT_CODES.diesel);

  if (petrolRow) {
    results.push({
      fuelType: "petrol",
      pricePerLiter: parseFloat(petrolRow.value) / GALLONS_TO_LITERS,
      currency: "USD",
      date: petrolRow.period,
    });
  }
  if (dieselRow) {
    results.push({
      fuelType: "diesel",
      pricePerLiter: parseFloat(dieselRow.value) / GALLONS_TO_LITERS,
      currency: "USD",
      date: dieselRow.period,
    });
  }

  return results;
}

/**
 * Recupera lo STORICO settimanale completo, non solo l'ultima settimana.
 *
 * L'unica differenza rispetto a `fetchUsFuelPrices` è che qui non si tiene
 * la prima riga per prodotto: si tengono tutte. La serie dell'EIA parte dal
 * 1994 per la benzina e dal 1995 per il diesel, quindi sono circa 1.600
 * settimane per prodotto — sotto il tetto di 5.000 righe per chiamata
 * dell'API v2, e questo è il motivo per cui non serve paginare.
 *
 * L'ordinamento passa da `desc` ad `asc`: quando si legge uno storico si
 * vuole scoprire subito da quando parte, non dove arriva.
 */
export async function fetchUsFuelHistory(
  apiKey: string,
  options: { fromDate?: string } = {}
): Promise<UsFuelPricePoint[]> {
  const url = new URL(EIA_BASE_URL);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("frequency", "weekly");
  url.searchParams.append("data[0]", "value");
  url.searchParams.append("facets[product][]", PRODUCT_CODES.petrol);
  url.searchParams.append("facets[product][]", PRODUCT_CODES.diesel);
  url.searchParams.append("facets[duoarea][]", US_NATIONAL_AREA);
  url.searchParams.append("sort[0][column]", "period");
  url.searchParams.append("sort[0][direction]", "asc");
  url.searchParams.set("length", "5000"); // massimo consentito dall'API v2
  if (options.fromDate) url.searchParams.set("start", options.fromDate);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`EIA API ha risposto HTTP ${res.status}`);
  }

  const json = (await res.json()) as EiaApiResponse;
  const rows = json.response?.data ?? [];

  if (rows.length === 0) {
    throw new Error(
      "Nessun dato storico restituito dall'API EIA. Verifica i codici product/duoarea con scripts/inspect-eia.ts."
    );
  }

  // Stessa verifica difensiva sull'unità di `fetchUsFuelPrices`: meglio
  // fallire rumorosamente che riempire il database di 3.000 righe
  // convertite con il fattore sbagliato.
  const unexpectedUnit = rows.find((r) => !r.units?.includes("GAL"));
  if (unexpectedUnit) {
    throw new Error(
      `Unità di misura inattesa dall'API EIA: "${unexpectedUnit.units}". Atteso qualcosa con "GAL".`
    );
  }

  const fuelTypeByProduct: Record<string, "petrol" | "diesel"> = {
    [PRODUCT_CODES.petrol]: "petrol",
    [PRODUCT_CODES.diesel]: "diesel",
  };

  const results: UsFuelPricePoint[] = [];
  for (const row of rows) {
    const fuelType = fuelTypeByProduct[row.product];
    const value = parseFloat(row.value);
    // L'EIA lascia buchi nella serie (festività, settimane non rilevate):
    // arrivano come stringa vuota o null. Si scartano.
    if (!fuelType || !Number.isFinite(value)) continue;
    results.push({
      fuelType,
      pricePerLiter: value / GALLONS_TO_LITERS,
      currency: "USD",
      date: row.period,
    });
  }

  return results;
}
