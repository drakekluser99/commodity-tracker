import ExcelJS from "exceljs";

/**
 * URL ufficiale della Commissione Europea per il bollettino "prezzi con
 * tasse" più recente. L'ID del documento (264c2d0f-...) resta STABILE
 * settimana dopo settimana: solo il contenuto del file viene sostituito.
 * Verificato manualmente il 27/08/2026 confrontando la data della pagina
 * (13 agosto 2026) col link di download ancora attivo.
 *
 * Fonte: https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en
 */
const EU_OIL_BULLETIN_URL =
  "https://energy.ec.europa.eu/document/download/264c2d0f-f161-4ea3-a777-78faae59bea0_en?filename=Weekly%20Oil%20Bulletin%20Weekly%20prices%20with%20Taxes.xlsx";

export interface EuFuelPricePoint {
  countryName: string;
  fuelType: "petrol" | "diesel";
  pricePerLiter: number;
  currency: "EUR";
  date: string; // YYYY-MM-DD
}

/**
 * NOTA IMPORTANTE PER CHI CONTRIBUISCE AL PROGETTO:
 * Questo parser non è stato ancora validato contro un vero download del
 * file (il sandbox di sviluppo non ha accesso di rete al dominio della
 * Commissione Europea). È scritto in modo DIFENSIVO — cerca le colonne
 * per nome/pattern nell'intestazione invece di assumere una posizione
 * fissa — ma va confermato eseguendo `npm run inspect:eu-bulletin` in un
 * ambiente con accesso di rete completo, e aggiustato se necessario.
 * Vedi scripts/inspect-eu-bulletin.ts.
 */
/**
 * NOTA: struttura confermata il 27/08/2026 eseguendo scripts/inspect-eu-bulletin.ts
 * contro il file reale. Layout osservato:
 *   Riga 1 = intestazioni prodotto (es. "Euro-super 95 (I)", "...Automotive
 *            gas oil...", "...Heating gas oil...", "GPL...")
 *   Riga 2 = data del bollettino (colonna 1) + unità di misura per colonna
 *            ("1000 l" per benzina/diesel/riscaldamento/GPL, "t" per olio
 *            combustibile pesante)
 *   Riga 3+ = una riga per paese; colonna 1 = nome paese, colonne successive
 *             = prezzi. Alcuni paesi hanno celle vuote per prodotti che non
 *             riportano (es. Austria non ha dati su olio combustibile/GPL).
 * I prezzi sono espressi per 1000 litri, non per litro: vanno divisi per
 * 1000 prima di salvarli come "prezzo al litro".
 */
export async function fetchEuFuelPrices(): Promise<EuFuelPricePoint[]> {
  const res = await fetch(EU_OIL_BULLETIN_URL);
  if (!res.ok) {
    throw new Error(`Download del bollettino UE fallito: HTTP ${res.status}`);
  }

  const buffer = await res.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("Nessun foglio trovato nel file XLSX del bollettino UE");
  }

  return parseSheet(sheet);
}

export function parseSheet(sheet: ExcelJS.Worksheet): EuFuelPricePoint[] {
  const countryNames = new Set(EU_COUNTRIES);

  // Passo 1: la riga di intestazione (prodotti) va cercata esplicitamente,
  // NON assunta come "quella subito sopra i dati" — nel file reale c'è una
  // riga di unità/data in mezzo tra intestazione e primo paese.
  let headerRowNumber: number | null = null;
  let unitsRowNumber: number | null = null;
  sheet.eachRow((row, rowNumber) => {
    if (headerRowNumber !== null || rowNumber > 5) return; // cerchiamo solo nelle prime righe
    const hasPetrolLabel = findColumnByPattern(row, /euro.?super.?95/i);
    if (hasPetrolLabel) {
      headerRowNumber = rowNumber;
      unitsRowNumber = rowNumber + 1;
    }
  });

  let dataStartRow: number | null = null;
  sheet.eachRow((row, rowNumber) => {
    if (dataStartRow !== null) return;
    const firstCell = String(row.getCell(1).value ?? "").trim();
    if (countryNames.has(firstCell)) dataStartRow = rowNumber;
  });

  if (headerRowNumber === null || dataStartRow === null) {
    throw new Error(
      "Impossibile individuare intestazione o inizio dati nel foglio. Il formato del file potrebbe essere cambiato — rilancia scripts/inspect-eu-bulletin.ts per verificare."
    );
  }

  const headerRow = sheet.getRow(headerRowNumber);
  const petrolColumn = findColumnByPattern(headerRow, /euro.?super.?95/i);
  // Pattern specifico "automotive gas oil" / "dieselkraftstoff": la colonna
  // del gasolio da riscaldamento contiene anch'essa la parola "gas oil"
  // ("Heating gas oil"), quindi un pattern generico /gas.?oil/ la
  // confonderebbe con quella del diesel.
  const dieselColumn = findColumnByPattern(
    headerRow,
    /automotive gas oil|dieselkraftstoff/i
  );

  if (!petrolColumn || !dieselColumn) {
    throw new Error(
      "Impossibile trovare le colonne benzina/diesel nell'intestazione. Formato inatteso — ispeziona manualmente il file."
    );
  }

  // La data del bollettino è nella riga delle unità, colonna 1
  // (es. "2026-08-24T00:00:00.000Z"). La leggiamo dinamicamente invece
  // di usare la data odierna: il bollettino potrebbe non essere ancora
  // stato aggiornato quando il cron gira.
  const rawDate = unitsRowNumber
    ? sheet.getRow(unitsRowNumber).getCell(1).value
    : null;
  const bulletinDate = rawDate
    ? new Date(rawDate as string).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const results: EuFuelPricePoint[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < dataStartRow!) return;

    const countryName = String(row.getCell(1).value ?? "").trim();
    if (!countryNames.has(countryName)) return;

    // Prezzi nel file sono per 1000 litri: dividiamo per ottenere il
    // prezzo per litro, l'unità che usiamo in tutto il resto del progetto.
    const petrolRaw = parsePriceCell(row.getCell(petrolColumn));
    const dieselRaw = parsePriceCell(row.getCell(dieselColumn));

    if (petrolRaw !== null) {
      results.push({
        countryName,
        fuelType: "petrol",
        pricePerLiter: petrolRaw / 1000,
        currency: "EUR",
        date: bulletinDate,
      });
    }
    if (dieselRaw !== null) {
      results.push({
        countryName,
        fuelType: "diesel",
        pricePerLiter: dieselRaw / 1000,
        currency: "EUR",
        date: bulletinDate,
      });
    }
  });

  return results;
}

function findColumnByPattern(
  headerRow: ExcelJS.Row,
  pattern: RegExp
): number | null {
  let found: number | null = null;
  headerRow.eachCell((cell, colNumber) => {
    if (found !== null) return;
    const text = String(cell.value ?? "");
    if (pattern.test(text)) found = colNumber;
  });
  return found;
}

function parsePriceCell(cell: ExcelJS.Cell): number | null {
  const raw = cell.value;
  if (raw === null || raw === undefined) return null;
  const asString = String(raw).replace(",", "."); // alcuni paesi usano la virgola come separatore decimale
  const value = parseFloat(asString);
  return Number.isFinite(value) ? value : null;
}

// Nomi paese come compaiono tipicamente nel bollettino (inglese).
// Usati per riconoscere dove iniziano le righe di dati.
const EU_COUNTRIES = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia",
  "Denmark", "Estonia", "Finland", "France", "Germany", "Greece",
  "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg",
  "Malta", "Netherlands", "Poland", "Portugal", "Romania", "Slovakia",
  "Slovenia", "Spain", "Sweden",
];
