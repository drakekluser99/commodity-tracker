/**
 * Fetcher per l'Alpha Vantage Commodities API.
 * Docs: https://www.alphavantage.co/documentation/#commodities
 *
 * Ogni materia prima ha il suo endpoint (?function=WTI, ?function=WHEAT...),
 * quindi definiamo qui la lista di ciò che vogliamo tracciare e per ognuno
 * facciamo una chiamata separata.
 */

// Config: un oggetto per ogni materia prima che vogliamo salvare.
// `symbol` è il codice interno che useremo noi nel database (colonna
// `commodities.symbol`), `functionName` è il parametro richiesto dall'API.
export const TRACKED_COMMODITIES = [
  { symbol: "WTI", functionName: "WTI", name: "WTI Crude Oil", category: "energy" },
  { symbol: "BRENT", functionName: "BRENT", name: "Brent Crude Oil", category: "energy" },
  { symbol: "NATURAL_GAS", functionName: "NATURAL_GAS", name: "Natural Gas", category: "energy" },
  { symbol: "COPPER", functionName: "COPPER", name: "Copper", category: "metal" },
  { symbol: "ALUMINUM", functionName: "ALUMINUM", name: "Aluminum", category: "metal" },
  { symbol: "WHEAT", functionName: "WHEAT", name: "Wheat", category: "agricultural" },
  { symbol: "CORN", functionName: "CORN", name: "Corn", category: "agricultural" },
  { symbol: "COTTON", functionName: "COTTON", name: "Cotton", category: "agricultural" },
  { symbol: "SUGAR", functionName: "SUGAR", name: "Sugar", category: "agricultural" },
  { symbol: "COFFEE", functionName: "COFFEE", name: "Coffee", category: "agricultural" },
] as const;

// Forma della risposta JSON di Alpha Vantage per gli endpoint commodities.
// Dichiararla esplicitamente ci dà controllo dei tipi invece di usare `any`
// su qualcosa che viene dall'esterno (best practice con TypeScript).
interface AlphaVantageCommodityResponse {
  name: string;
  interval: string;
  unit: string;
  data: Array<{ date: string; value: string }>;
  // Campi che Alpha Vantage restituisce AL POSTO di `data` nei casi
  // anomali, tutti con HTTP 200: rate limit superato (`Information` sul
  // piano free attuale, `Note` sul vecchio), oppure chiave/simbolo
  // sbagliati (`Error Message`). Li dichiariamo opzionali per poterli
  // loggare esplicitamente invece di ritrovarci `data` undefined.
  Information?: string;
  Note?: string;
  "Error Message"?: string;
}

export interface NormalizedPricePoint {
  symbol: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  date: string; // formato YYYY-MM-DD, così com'è dalla fonte
}

/**
 * Recupera l'ultimo prezzo disponibile per una singola materia prima.
 * Alpha Vantage a volte restituisce "value": "." quando il dato per
 * quel giorno non è ancora disponibile: in quel caso scartiamo il punto.
 */
async function fetchOne(
  commodity: (typeof TRACKED_COMMODITIES)[number],
  apiKey: string
): Promise<NormalizedPricePoint | null> {
  const url = `https://www.alphavantage.co/query?function=${commodity.functionName}&interval=daily&apikey=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Alpha Vantage ha risposto ${res.status} per ${commodity.symbol}`
    );
  }

  const json = (await res.json()) as AlphaVantageCommodityResponse;

  // Casi anomali con HTTP 200 in cui manca `data`: rate limit superato
  // (`Information`/`Note`) o chiave/simbolo non validi (`Error Message`).
  // Prima li ingoiavamo con un `return null` muto e sparivano senza
  // traccia: ora li rendiamo visibili nei log di Vercel.
  const anomalyMessage =
    json.Information ?? json.Note ?? json["Error Message"];
  if (anomalyMessage) {
    console.error(
      `Alpha Vantage: risposta anomala per ${commodity.symbol} — ${anomalyMessage}`
    );
    return null;
  }

  // Alpha Vantage a volte restituisce "value": "." quando il dato per
  // quel giorno non è ancora disponibile: in quel caso scartiamo il punto.
  const latest = json.data?.[0];
  if (!latest || latest.value === ".") {
    return null;
  }

  return {
    symbol: commodity.symbol,
    name: commodity.name,
    category: commodity.category,
    unit: json.unit ?? "unknown",
    price: parseFloat(latest.value),
    date: latest.date,
  };
}

// Dividiamo il paniere in due batch da 5. Perché non facciamo tutte e 10
// le chiamate in un colpo solo? Due motivi:
// 1. Vercel Hobby limita le funzioni serverless a 10 secondi di esecuzione:
//    un solo cron con pause per rispettare i rate limit richiederebbe più
//    di un minuto e andrebbe in timeout.
// 2. Vercel Hobby permette solo 2 cron job per progetto, una volta al giorno:
//    quindi li usiamo entrambi, uno per batch, invece di uno solo enorme.
export const COMMODITY_BATCH_A = TRACKED_COMMODITIES.slice(0, 5); // energia + metalli
export const COMMODITY_BATCH_B = TRACKED_COMMODITIES.slice(5); // agricole

/**
 * Recupera un batch di materie prime IN PARALLELO (Promise.all).
 * Con batch da 5 elementi restiamo sotto il limite di 5 richieste/minuto
 * di Alpha Vantage, e l'intera chiamata finisce in 1-2 secondi:
 * ampiamente dentro il limite di 10s di Vercel Hobby.
 */
export async function fetchCommodityBatch(
  batch: readonly (typeof TRACKED_COMMODITIES)[number][],
  apiKey: string
): Promise<NormalizedPricePoint[]> {
  // Promise.all lancia tutte le richieste insieme e aspetta che finiscano
  // tutte. Usiamo Promise.allSettled invece di Promise.all "puro" perché
  // se UNA chiamata fallisce, vogliamo comunque salvare i dati delle altre
  // invece di perdere tutto il batch.
  const settled = await Promise.allSettled(
    batch.map((commodity) => fetchOne(commodity, apiKey))
  );

  const results: NormalizedPricePoint[] = [];
  for (const outcome of settled) {
    if (outcome.status === "fulfilled" && outcome.value) {
      results.push(outcome.value);
    } else if (outcome.status === "rejected") {
      console.error("Errore nel recupero di una commodity:", outcome.reason);
    }
  }

  return results;
}
