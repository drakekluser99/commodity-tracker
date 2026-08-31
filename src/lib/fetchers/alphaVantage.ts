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

// Dividiamo le 10 materie prime in 5 batch da 2. Storia di questa scelta:
// prima erano 2 batch da 5 chiamati con Promise.all (tutte le richieste in
// parallelo). Sembrava dentro il limite "5 richieste/minuto" di Alpha
// Vantage, ma in pratica 5 connessioni simultanee ne facevano fallire
// 1-2 con una risposta di rate limit (HTTP 200 + campo "Information"),
// silenziosamente: Aluminum, Sugar e Coffee non sono MAI stati salvati.
// Il limite reale sembra essere anche sulle connessioni simultanee, non
// solo sul conteggio nel tempo. Ora: batch piccoli, chiamate SEQUENZIALI
// con pausa, e un cron per batch su ORE diverse (vedi vercel.json) — su
// Vercel Hobby i cron hanno precisione oraria (±59 min), quindi distanziare
// di pochi minuti non servirebbe: servono ore diverse.
export const COMMODITY_BATCH_1 = TRACKED_COMMODITIES.slice(0, 2); // WTI, BRENT
export const COMMODITY_BATCH_2 = TRACKED_COMMODITIES.slice(2, 4); // NATURAL_GAS, COPPER
export const COMMODITY_BATCH_3 = TRACKED_COMMODITIES.slice(4, 6); // ALUMINUM, WHEAT
export const COMMODITY_BATCH_4 = TRACKED_COMMODITIES.slice(6, 8); // CORN, COTTON
export const COMMODITY_BATCH_5 = TRACKED_COMMODITIES.slice(8, 10); // SUGAR, COFFEE

// Pausa fra una chiamata e la successiva dentro lo stesso batch. Due
// secondi sono un'assicurazione a basso costo contro il limite di
// connessioni simultanee: con 2 sole chiamate per batch la funzione
// resta comunque ben sotto i 10s di `maxDuration`.
const PAUSE_BETWEEN_CALLS_MS = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Recupera un batch di materie prime IN SEQUENZA, con una pausa fra una
 * chiamata e l'altra. Non usiamo più Promise.all/allSettled: le richieste
 * parallele sono esattamente ciò che sforava il rate limit di Alpha
 * Vantage. Se UNA chiamata fallisce (throw o risposta anomala) le altre
 * proseguono comunque: non perdiamo l'intero batch per un singolo errore.
 */
export async function fetchCommodityBatch(
  batch: readonly (typeof TRACKED_COMMODITIES)[number][],
  apiKey: string
): Promise<NormalizedPricePoint[]> {
  const results: NormalizedPricePoint[] = [];

  for (let i = 0; i < batch.length; i++) {
    if (i > 0) await sleep(PAUSE_BETWEEN_CALLS_MS);
    try {
      const point = await fetchOne(batch[i], apiKey);
      if (point) results.push(point);
    } catch (err) {
      console.error(
        `Errore nel recupero di ${batch[i].symbol}:`,
        err
      );
    }
  }

  return results;
}
