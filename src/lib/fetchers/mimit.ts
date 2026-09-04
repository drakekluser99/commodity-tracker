import { provinceForCode } from "@/lib/provinces";

/**
 * Fetcher Fase 4 (MIMIT). Scarica i due CSV pubblici del Ministero delle
 * Imprese e del Made in Italy (licenza IODL 2.0, aggiornati ogni giorno
 * con dato alla comunicazione precedente) e li aggrega SUBITO per
 * provincia: la riga per singola stazione non esce mai da questa funzione,
 * per il motivo spiegato in schema.ts sopra `retailFuelPricesIt`.
 *
 * NON ancora verificato contro una run reale: la rete di questo container
 * non raggiunge mimit.gov.it (egress bloccato per policy), la struttura è
 * ricostruita dai metadati pubblicati e da un campione scaricato a mano
 * dall'utente il 4 set 2026 (23.981 impianti, 93.068 righe prezzo). Prima
 * di collegarlo a un cron, lanciare `scripts/inspect-mimit.ts` e leggere i
 * contatori di scarto (`unknownProvinceCodes`, `unknownFuelTypes`,
 * `orphanPriceRows`) — se sono alti, qualcosa nel formato reale è diverso
 * da quanto documentato qui.
 */

const ANAGRAFICA_URL =
  "https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv";
const PREZZI_URL = "https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv";

export type MimitFuelType = "petrol" | "diesel";

/**
 * Solo i due carburanti standard, non le varianti brandizzate ("Blue
 * Diesel", "Hvolution" ecc. — nomi commerciali diversi da gestore a
 * gestore) né GPL/metano (fuori scopo per ora, coerente con "niente
 * redesign totale" in CLAUDE.md). Mescolare una variante premium nella
 * media del gasolio standard la sposterebbe verso l'alto in modo silenzioso
 * — meglio scartare la riga che contarla nel posto sbagliato.
 */
function normalizeFuelType(descCarburante: string): MimitFuelType | null {
  const v = descCarburante.trim().toLowerCase();
  if (v === "benzina") return "petrol";
  if (v === "gasolio") return "diesel";
  return null;
}

/**
 * I file MIMIT non dichiarano la codifica nell'header HTTP in modo
 * affidabile (fonte pubblica amministrativa, storicamente ISO-8859-1). Si
 * prova UTF-8 e si controlla se compaiono caratteri di sostituzione
 * (U+FFFD, il segno che la decodifica ha corrotto un accento come "città"
 * o "perù"); in quel caso si ridecodifica come Windows-1252. Non è una
 * proprietà del formato che possiamo verificare da qui (rete bloccata) —
 * `scripts/inspect-mimit.ts` stampa quale delle due ha usato, da
 * confermare al primo lancio vero.
 */
function decodeMimitCsv(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("�")) return utf8;
  return new TextDecoder("windows-1252").decode(buffer);
}

/** Righe grezze di un CSV pipe-delimited MIMIT, saltando le due righe di intestazione. */
function parseMimitRows(text: string): { extractedOn: string | null; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  // Riga 1: "Estrazione del gg/mm/aaaa" o simile — non è la data DEL DATO
  // per ogni riga (quella la porta `dtComu` nel file prezzi), ma è il
  // timestamp dell'intero export ed è ciò che si salva come `recordedAt`.
  const extractedOn = lines[0]?.trim() ?? null;
  // Riga 2: intestazione colonne — scartata, il parsing è posizionale sui
  // nomi noti (idImpianto sempre primo campo in entrambi i file).
  const dataLines = lines.slice(2);
  return {
    extractedOn,
    rows: dataLines.map((l) => l.split("|")),
  };
}

export interface MimitAggregate {
  provinceCode: string;
  fuelType: MimitFuelType;
  isSelf: boolean;
  priceSum: number;
  stationIds: Set<string>;
}

export interface MimitFetchResult {
  /** Riga "Estrazione del ..." del file prezzi — diventa `recordedAt`. */
  extractedOn: string | null;
  aggregates: MimitAggregate[];
  diagnostics: {
    totalStations: number;
    totalPriceRows: number;
    unknownProvinceCodes: Set<string>;
    unknownFuelTypes: Set<string>;
    /** Righe prezzo il cui idImpianto non è nell'anagrafica scaricata insieme. */
    orphanPriceRows: number;
    decodingUsedFallback: boolean;
  };
}

/**
 * Scarica, unisce e aggrega. Una sola chiamata di rete per file (nessun
 * batch, a differenza di Alpha Vantage: qui non c'è rate limit noto, ma
 * NON è stato verificato — se il primo lancio reale fallisce con un 429,
 * quello è il primo sospetto).
 */
export async function fetchAndAggregateMimit(): Promise<MimitFetchResult> {
  const [anagraficaRes, prezziRes] = await Promise.all([
    fetch(ANAGRAFICA_URL),
    fetch(PREZZI_URL),
  ]);
  if (!anagraficaRes.ok) {
    throw new Error(`Anagrafica MIMIT: HTTP ${anagraficaRes.status}`);
  }
  if (!prezziRes.ok) {
    throw new Error(`Prezzi MIMIT: HTTP ${prezziRes.status}`);
  }

  const anagraficaBuf = await anagraficaRes.arrayBuffer();
  const prezziBuf = await prezziRes.arrayBuffer();
  const anagraficaText = decodeMimitCsv(anagraficaBuf);
  const prezziText = decodeMimitCsv(prezziBuf);
  const decodingUsedFallback =
    new TextDecoder("utf-8").decode(anagraficaBuf).includes("�") ||
    new TextDecoder("utf-8").decode(prezziBuf).includes("�");

  const { rows: anagraficaRows } = parseMimitRows(anagraficaText);
  const { extractedOn, rows: prezziRows } = parseMimitRows(prezziText);

  // idImpianto -> sigla provincia. Colonne dell'anagrafica (vedi
  // CLAUDE.md/metadati MIMIT): idImpianto, Gestore, Bandiera, Tipo
  // Impianto, Nome Impianto, Indirizzo, Comune, Provincia, Latitudine,
  // Longitudine. idImpianto è sempre il PRIMO campo (indice 0, sicuro);
  // Provincia/Latitudine/Longitudine si leggono dal FONDO della riga, non
  // da un indice fisso dall'inizio — vedi il commento più sotto.
  const stationProvince = new Map<string, string>();
  const unknownProvinceCodes = new Set<string>();
  for (const row of anagraficaRows) {
    const id = row[0]?.trim();
    // Provincia NON si legge dall'indice fisso 7. Verificato il 4 set 2026
    // contro il file reale: alcune righe hanno un numero di campi diverso
    // da 10 (indirizzi o nomi impianto con un `|` non ripulito, nonostante
    // il cambio di separatore di febbraio 2026) — un indice fisso dall'inizio
    // legge un pezzo di indirizzo o il Comune al posto della Provincia su
    // quelle righe (60 sigle sconosciute su un primo campione, tutte
    // riconducibili a questo). Latitudine/Longitudine/Provincia restano
    // sempre le ULTIME tre colonne qualunque cosa succeda prima: si legge
    // da lì, non dall'inizio.
    const provinceCode = row[row.length - 3]?.trim();
    if (!id || !provinceCode) continue;
    if (!provinceForCode(provinceCode)) {
      unknownProvinceCodes.add(provinceCode);
      continue; // scartata: non aggregabile su una provincia che non riconosciamo
    }
    stationProvince.set(id, provinceCode);
  }

  // Chiave di aggregazione: provincia|carburante|self. Un Map invece di
  // scrivere 428 righe finte in anticipo — le combinazioni che non
  // compaiono nel CSV di oggi restano assenti, non finiscono a 0 (stesso
  // principio di priceNet: mancante non è zero).
  const buckets = new Map<string, MimitAggregate>();
  const unknownFuelTypes = new Set<string>();
  let orphanPriceRows = 0;

  // Colonne del file prezzi: idimpianto, descCarburante, prezzo, isSelf, dtComu.
  for (const row of prezziRows) {
    const stationId = row[0]?.trim();
    const descCarburante = row[1]?.trim();
    const prezzoStr = row[2]?.trim();
    const isSelfStr = row[3]?.trim();
    if (!stationId || !descCarburante || !prezzoStr) continue;

    const provinceCode = stationProvince.get(stationId);
    if (!provinceCode) {
      orphanPriceRows++;
      continue;
    }

    const fuelType = normalizeFuelType(descCarburante);
    if (!fuelType) {
      unknownFuelTypes.add(descCarburante);
      continue;
    }

    const price = parseFloat(prezzoStr);
    if (!Number.isFinite(price) || price <= 0) continue;

    const isSelf = isSelfStr === "1";
    const key = `${provinceCode}|${fuelType}|${isSelf ? "self" : "served"}`;
    const existing = buckets.get(key) ?? {
      provinceCode,
      fuelType,
      isSelf,
      priceSum: 0,
      stationIds: new Set<string>(),
    };
    existing.priceSum += price;
    existing.stationIds.add(stationId);
    buckets.set(key, existing);
  }

  return {
    extractedOn,
    aggregates: Array.from(buckets.values()),
    diagnostics: {
      totalStations: stationProvince.size,
      totalPriceRows: prezziRows.length,
      unknownProvinceCodes,
      unknownFuelTypes,
      orphanPriceRows,
      decodingUsedFallback,
    },
  };
}

/** Prezzo medio di un aggregato — chiamata a valle, tiene la somma grezza separata dalla media. */
export function averagePrice(agg: MimitAggregate): number {
  return agg.priceSum / agg.stationIds.size;
}
