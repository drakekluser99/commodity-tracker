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
 * Intervallo da chiedere all'API per ciascuna categoria.
 *
 * Non è una preferenza nostra, è un limite della fonte: gli endpoint
 * energia (WTI, BRENT, NATURAL_GAS) accettano daily/weekly/monthly, mentre
 * metalli e agricole espongono solo monthly/quarterly/annual. Chiedere
 * `daily` per il rame non dà un errore — la fonte restituisce comunque la
 * serie mensile, e questo è il motivo per cui metalli e agricole nel sito
 * si muovono una volta al mese mentre il petrolio si muove ogni giorno.
 * Dichiararlo esplicitamente rende la cosa leggibile invece che
 * sorprendente.
 */
export function intervalForCategory(category: string): "daily" | "monthly" {
  return category === "energy" ? "daily" : "monthly";
}

/**
 * Recupera la SERIE COMPLETA di una materia prima, non solo l'ultimo punto.
 *
 * Questa funzione non esiste per fare una chiamata in più: è la stessa,
 * identica chiamata che il cron fa già. Ogni risposta di Alpha Vantage
 * contiene l'intero storico dentro `json.data` — anni di rilevazioni — e
 * finora ne buttavamo via tutto tranne `data[0]`. Il backfill dello storico
 * quindi non costa richieste aggiuntive alla fonte: costa solo smettere di
 * scartare quello che è già nella risposta.
 *
 * `fromDate` taglia la serie: senza limite il WTI giornaliero torna indietro
 * fino al 1986 e riempirebbe il database di righe che nessuna schermata del
 * sito mostra.
 */
export async function fetchCommoditySeries(
  commodity: (typeof TRACKED_COMMODITIES)[number],
  apiKey: string,
  options: { interval?: "daily" | "monthly"; fromDate?: string } = {}
): Promise<NormalizedPricePoint[]> {
  const interval =
    options.interval ?? intervalForCategory(commodity.category);
  const url = `https://www.alphavantage.co/query?function=${commodity.functionName}&interval=${interval}&apikey=${apiKey}`;

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
    return [];
  }

  const unit = json.unit ?? "unknown";

  return (json.data ?? [])
    // Alpha Vantage restituisce "value": "." quando per quella data il
    // dato non esiste (festivi, giorni di mercato chiuso). Non è uno zero
    // e non è un prezzo: si scarta, non si interpola.
    .filter((row) => row.value !== "." && Number.isFinite(parseFloat(row.value)))
    .filter((row) => !options.fromDate || row.date >= options.fromDate)
    .map((row) => ({
      symbol: commodity.symbol,
      name: commodity.name,
      category: commodity.category,
      unit,
      price: parseFloat(row.value),
      date: row.date,
    }));
}

/**
 * Recupera l'ultimo prezzo disponibile per una singola materia prima.
 * È il caso d'uso del cron quotidiano, ed è ora un sottile involucro
 * attorno a `fetchCommoditySeries`: una sola implementazione del parsing
 * e della gestione delle risposte anomale, così se la fonte cambia formato
 * c'è un solo punto da correggere.
 */
async function fetchOne(
  commodity: (typeof TRACKED_COMMODITIES)[number],
  apiKey: string
): Promise<NormalizedPricePoint | null> {
  // `interval: "daily"` esplicito e non `intervalForCategory`: il cron si
  // comportava già così per tutte e dieci le materie prime, e questo
  // refactoring non deve cambiarne il comportamento di nascosto.
  const series = await fetchCommoditySeries(commodity, apiKey, {
    interval: "daily",
  });
  return series[0] ?? null;
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
