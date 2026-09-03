import ExcelJS from "exceljs";

/**
 * Fetcher del file STORICO del bollettino petrolifero della Commissione
 * Europea — "Price developments 2005 onwards", ~4,3 MB.
 *
 * Fonte: https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en
 *
 * Perché sostituisce `euOilBulletin.ts` invece di affiancarlo. Il file
 * settimanale contiene una sola settimana e solo i prezzi ALLA POMPA.
 * Questo contiene tutte le settimane dal 2005 e, soprattutto, un secondo
 * foglio con i prezzi AL NETTO DELLE IMPOSTE. La differenza fra i due è il
 * carico fiscale, per 27 paesi, da fonte istituzionale primaria: è il dato
 * che il sito non poteva calcolare e che nessun aggregatore commerciale
 * pubblica in questa forma.
 *
 * Con un file solo il cron settimanale aggiorna anche la scomposizione
 * fiscale, e c'è un parser solo da mantenere invece di due.
 *
 * PERCHÉ QUESTO PARSER È PIÙ SOLIDO DEL PRECEDENTE
 *
 * Il file settimanale costringe a cercare le colonne per somiglianza
 * ("euro.?super.?95" sull'intestazione), con tutte le trappole del caso —
 * la colonna del gasolio da riscaldamento contiene anch'essa "gas oil" e
 * va esclusa a mano. Qui la riga 1 di ogni foglio contiene CHIAVI
 * LEGGIBILI DALLA MACCHINA, una per colonna:
 *
 *   IT_price_with_tax_euro95   IT_price_wo_tax_diesel   DK_exchange_rate
 *
 * Quindi si cerca la colonna per nome ESATTO. Nessun pattern, nessuna
 * posizione fissa: se la Commissione riordina le colonne il parser
 * continua a funzionare, e se rinomina una chiave fallisce subito con un
 * errore che dice quale.
 *
 * LAYOUT OSSERVATO (3 set 2026, con scripts/inspect-eu-history.ts)
 *
 *   7 fogli. Ci servono i primi due, che hanno struttura identica:
 *     "Prices with taxes"  → prezzo alla pompa
 *     "Prices wo taxes"    → prezzo al netto di imposte
 *   Riga 1 = chiavi macchina (vedi sopra)
 *   Riga 2 = etichette umane multilingua
 *   Riga 3 = unità di misura: "1000 l" per benzina/diesel, "t" per gli
 *            oli combustibili. Colonna 1 = la parola "Date"
 *   Riga 4+ = una riga per settimana, colonna 1 = data, in ordine
 *            DECRESCENTE (la più recente in cima)
 *   In fondo, righe di disclaimer senza data: si riconoscono perché la
 *   colonna 1 non contiene una data, ed è così che le scartiamo.
 *
 * DUE VERIFICHE FATTE SUI DATI VERI, che vale la pena conoscere:
 *
 * 1. I prezzi sono già in EURO, non in valuta nazionale. Le colonne
 *    `XX_exchange_rate` dei paesi fuori dall'euro sono informative. Lo si
 *    vede da un ordine di grandezza: DK_price_with_tax_euro95 = 2524 per
 *    1000 litri, cioè 2,52 €/L — plausibile per la Danimarca; in corone
 *    sarebbero 2,52 DKK/L, un decimo del reale.
 * 2. La riga più recente di questo file (31 ago 2026, IT euro95 = 2016,7)
 *    coincide con quanto il bollettino settimanale aveva già salvato nel
 *    nostro database (2,0167 €/L). Le due fonti concordano: il passaggio
 *    da un file all'altro non cambia i numeri già in pagina.
 *
 * ATTENZIONE al Regno Unito: le colonne `UK_*` esistono ancora
 * nell'intestazione ma non hanno più dati. Non è nella nostra mappa dei
 * paesi, quindi viene ignorato — ma è la ragione per cui le righe recenti
 * sono più corte dell'intestazione, e un parser posizionale ci sbatterebbe.
 */

const EU_HISTORY_URL =
  "https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx";

const SHEET_WITH_TAX = "Prices with taxes";
const SHEET_WITHOUT_TAX = "Prices wo taxes";

/**
 * Codice ISO usato dal file → nome del paese come sta in `regions.name`.
 *
 * I nomi a destra NON sono una scelta estetica: sono le chiavi già
 * presenti nel database, scritte dal fetcher settimanale, e sono le stesse
 * su cui `EuropeFuelMap` fa il join con la cartografia. Cambiarne uno qui
 * creerebbe un paese duplicato in `regions` invece di aggiornare quello
 * esistente.
 *
 * Il Regno Unito è assente di proposito: ha ancora le colonne nel file ma
 * non è più uno Stato membro, e non è nella cartografia dei 27.
 */
const COUNTRY_BY_CODE: Record<string, string> = {
  AT: "Austria",
  BE: "Belgium",
  BG: "Bulgaria",
  HR: "Croatia",
  CY: "Cyprus",
  CZ: "Czechia",
  DK: "Denmark",
  EE: "Estonia",
  FI: "Finland",
  FR: "France",
  DE: "Germany",
  GR: "Greece",
  HU: "Hungary",
  IE: "Ireland",
  IT: "Italy",
  LV: "Latvia",
  LT: "Lithuania",
  LU: "Luxembourg",
  MT: "Malta",
  NL: "Netherlands",
  PL: "Poland",
  PT: "Portugal",
  RO: "Romania",
  SK: "Slovakia",
  SI: "Slovenia",
  ES: "Spain",
  SE: "Sweden",
};

// Suffisso della chiave nel file → il nostro `fuel_type`.
const PRODUCT_BY_FUEL = { petrol: "euro95", diesel: "diesel" } as const;

/** I prezzi nel file sono per 1000 litri. Noi salviamo al litro. */
const LITERS_PER_UNIT = 1000;

export interface EuFuelHistoryPoint {
  countryName: string;
  fuelType: "petrol" | "diesel";
  /** Prezzo alla pompa, imposte incluse, €/litro. */
  pricePerLiter: number;
  /**
   * Prezzo al netto di imposte, €/litro. `null` quando la Commissione non
   * pubblica il netto per quel paese/settimana: in quel caso il carico
   * fiscale NON si calcola, e non va inventato per differenza da una media.
   */
  priceNetPerLiter: number | null;
  currency: "EUR";
  date: string; // YYYY-MM-DD
}

export async function fetchEuFuelHistory(
  options: { fromDate?: string; latestOnly?: boolean } = {}
): Promise<EuFuelHistoryPoint[]> {
  const res = await fetch(EU_HISTORY_URL);
  if (!res.ok) {
    throw new Error(`Download del file storico UE fallito: HTTP ${res.status}`);
  }

  const buffer = await res.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  return parseWorkbook(workbook, options);
}

/**
 * Separata da `fetchEuFuelHistory` per poterla esercitare su un workbook
 * costruito a mano, senza rete — la stessa ragione per cui `parseSheet` è
 * esportata da euOilBulletin.ts.
 */
export function parseWorkbook(
  workbook: ExcelJS.Workbook,
  options: { fromDate?: string; latestOnly?: boolean } = {}
): EuFuelHistoryPoint[] {
  const gross = readSheet(workbook, SHEET_WITH_TAX, "price_with_tax");
  const net = readSheet(workbook, SHEET_WITHOUT_TAX, "price_wo_tax");

  // Le date vengono dal foglio dei prezzi alla pompa: è quello che
  // determina cosa esiste. Se il foglio dei netti non ha una settimana, il
  // punto si salva lo stesso col netto a null — meglio un prezzo senza
  // scomposizione che nessun prezzo.
  let dates = [...gross.keys()].sort(); // crescente
  if (options.fromDate) dates = dates.filter((d) => d >= options.fromDate!);
  if (options.latestOnly) dates = dates.slice(-1);

  const points: EuFuelHistoryPoint[] = [];

  for (const date of dates) {
    const grossRow = gross.get(date)!;
    const netRow = net.get(date);

    for (const [code, countryName] of Object.entries(COUNTRY_BY_CODE)) {
      for (const fuelType of ["petrol", "diesel"] as const) {
        const key = `${code}|${PRODUCT_BY_FUEL[fuelType]}`;
        const grossValue = grossRow.get(key);
        if (grossValue === undefined) continue;

        const netValue = netRow?.get(key);
        points.push({
          countryName,
          fuelType,
          pricePerLiter: grossValue / LITERS_PER_UNIT,
          priceNetPerLiter:
            netValue === undefined ? null : netValue / LITERS_PER_UNIT,
          currency: "EUR",
          date,
        });
      }
    }
  }

  return points;
}

/**
 * Legge un foglio e restituisce: data → (paese|prodotto) → valore.
 *
 * `infix` è il pezzo variabile della chiave (`price_with_tax` oppure
 * `price_wo_tax`): è l'unica differenza fra i due fogli, e passarlo come
 * parametro evita di duplicare tutta la funzione.
 */
function readSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  infix: string
): Map<string, Map<string, number>> {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    throw new Error(
      `Foglio "${sheetName}" non trovato nel file storico UE. Fogli presenti: ${workbook.worksheets
        .map((w) => w.name)
        .join(", ")}. Rilancia scripts/inspect-eu-history.ts.`
    );
  }

  // Passo 1: dalla riga delle chiavi, l'indice di ogni colonna che ci
  // interessa. Costruiamo l'insieme delle chiavi attese e cerchiamo quelle,
  // invece di scorrere le 226 colonne indovinando cosa sono.
  const headerRow = sheet.getRow(1);
  const columnByKey = new Map<string, number>();

  headerRow.eachCell((cell, colNumber) => {
    const raw = String(cell.value ?? "").trim();
    // Forma attesa: <CODICE>_<infix>_<prodotto>, es. IT_price_with_tax_euro95
    for (const code of Object.keys(COUNTRY_BY_CODE)) {
      for (const [fuelType, product] of Object.entries(PRODUCT_BY_FUEL)) {
        if (raw === `${code}_${infix}_${product}`) {
          columnByKey.set(`${code}|${product}`, colNumber);
        }
        void fuelType;
      }
    }
  });

  // Se il formato cambia, meglio fermarsi qui con un messaggio esplicito
  // che salvare mezza Europa senza accorgersene. Attese: 27 paesi × 2
  // prodotti.
  const missing: string[] = [];
  for (const code of Object.keys(COUNTRY_BY_CODE)) {
    for (const product of Object.values(PRODUCT_BY_FUEL)) {
      if (!columnByKey.has(`${code}|${product}`)) {
        missing.push(`${code}_${infix}_${product}`);
      }
    }
  }
  if (missing.length > 0) {
    // L'elenco delle chiavi mancanti, non solo il conteggio: se un giorno
    // la Commissione rinomina o toglie una colonna, la differenza fra
    // "manca l'Italia" e "manca il diesel ovunque" è la diagnosi, e
    // ricavarla da un numero costa una sessione.
    throw new Error(
      `Nel foglio "${sheetName}" mancano ${missing.length} colonne attese: ` +
        `${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ", …" : ""}. ` +
        `Il formato del file potrebbe essere cambiato — rilancia scripts/inspect-eu-history.ts.`
    );
  }

  // Passo 2: le righe di dati. Si riconoscono dal fatto che la colonna 1
  // contiene una data: le righe 1-3 sono intestazioni e in fondo ci sono
  // disclaimer e righe vuote, tutte senza data. Filtrare per tipo invece
  // che per numero di riga rende il parser indifferente a quante righe di
  // testo la Commissione aggiunga in cima o in coda.
  const byDate = new Map<string, Map<string, number>>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 3) return;
    const date = asIsoDate(row.getCell(1).value);
    if (!date) return;

    const values = new Map<string, number>();
    for (const [key, colNumber] of columnByKey) {
      const value = asNumber(row.getCell(colNumber).value);
      if (value !== null) values.set(key, value);
    }
    if (values.size > 0) byDate.set(date, values);
  });

  if (byDate.size === 0) {
    throw new Error(
      `Nessuna riga di dati nel foglio "${sheetName}" del file storico UE.`
    );
  }

  return byDate;
}

/**
 * La colonna della data arriva da ExcelJS come oggetto Date, ma un file
 * ricalcolato o riesportato può restituirla come stringa. Accettiamo
 * entrambe e restituiamo `null` per tutto il resto — è così che le righe
 * di disclaimer in fondo al foglio vengono scartate senza doverle contare.
 */
function asIsoDate(raw: ExcelJS.CellValue): string | null {
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "string") {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function asNumber(raw: ExcelJS.CellValue): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  // Alcune celle sono formule: ExcelJS le restituisce come oggetto con il
  // valore già calcolato in `result`. Nei fogli dei prezzi non ne abbiamo
  // viste, ma il foglio "Consumption" ne è pieno: gestirle qui costa due
  // righe e toglie una sorpresa futura.
  if (raw && typeof raw === "object" && "result" in raw) {
    const result = (raw as { result?: unknown }).result;
    return typeof result === "number" && Number.isFinite(result) ? result : null;
  }
  if (typeof raw === "string") {
    const value = parseFloat(raw.replace(",", "."));
    return Number.isFinite(value) ? value : null;
  }
  return null;
}
