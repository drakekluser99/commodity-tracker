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

function parseSheet(sheet: ExcelJS.Worksheet): EuFuelPricePoint[] {
  // Il file della Commissione ha righe di intestazione non standard
  // (a volte su più righe, con celle unite). Cerchiamo la riga che
  // contiene qualcosa che assomiglia a un nome di paese nella prima
  // colonna: da lì in poi consideriamo che iniziano i dati.
  const countryNames = new Set(EU_COUNTRIES);
  let headerRowNumber: number | null = null;
  let dataStartRow: number | null = null;

  sheet.eachRow((row, rowNumber) => {
    if (dataStartRow !== null) return; // già trovato, non serve continuare

    const firstCell = String(row.getCell(1).value ?? "").trim();
    if (countryNames.has(firstCell)) {
      dataStartRow = rowNumber;
      headerRowNumber = rowNumber - 1; // assumiamo l'intestazione nella riga precedente
    }
  });

  if (dataStartRow === null || headerRowNumber === null) {
    throw new Error(
      "Impossibile individuare l'inizio dei dati nel foglio: nessun nome di paese riconosciuto nella prima colonna. Il formato del file potrebbe essere cambiato — vedi scripts/inspect-eu-bulletin.ts per ispezionarlo."
    );
  }

  // Troviamo le colonne "Euro-super 95" (benzina) e "Automotive gas oil"
  // / "Diesel" cercando il testo nell'intestazione, invece di assumere
  // un indice fisso di colonna.
  const headerRow = sheet.getRow(headerRowNumber);
  const petrolColumn = findColumnByPattern(headerRow, /euro.?super.?95/i);
  const dieselColumn = findColumnByPattern(headerRow, /diesel|gas.?oil/i);

  if (!petrolColumn || !dieselColumn) {
    throw new Error(
      "Impossibile trovare le colonne benzina/diesel nell'intestazione. Formato inatteso — ispeziona manualmente il file."
    );
  }

  const results: EuFuelPricePoint[] = [];
  const today = new Date().toISOString().slice(0, 10);

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < dataStartRow!) return;

    const countryName = String(row.getCell(1).value ?? "").trim();
    if (!countryNames.has(countryName)) return; // riga non di dati (es. media UE, note a fondo pagina)

    const petrolPrice = parsePriceCell(row.getCell(petrolColumn));
    const dieselPrice = parsePriceCell(row.getCell(dieselColumn));

    if (petrolPrice !== null) {
      results.push({
        countryName,
        fuelType: "petrol",
        pricePerLiter: petrolPrice,
        currency: "EUR",
        date: today,
      });
    }
    if (dieselPrice !== null) {
      results.push({
        countryName,
        fuelType: "diesel",
        pricePerLiter: dieselPrice,
        currency: "EUR",
        date: today,
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
