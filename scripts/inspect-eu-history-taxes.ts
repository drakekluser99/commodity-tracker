/**
 * Esegui con: npx tsx scripts/inspect-eu-history-taxes.ts
 *
 * Come inspect-eu-history.ts, ma sui QUATTRO fogli che quello script salta
 * di proposito (guarda solo i primi tre: "Prices with taxes", "Prices wo
 * taxes", "Consumption"). Servono per la Fase 3 della roadmap (split
 * accisa/IVA): "VAT", "Excise duties", "Excise duties - components",
 * "Other Indirect Taxes" — mai ispezionati finora.
 *
 * Stessa logica difensiva di sempre: il parser va scritto su un layout
 * osservato, non immaginato. Questo script non scrive niente, stampa e
 * basta.
 */
import ExcelJS from "exceljs";

const URL =
  "https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx";

const SHEETS_TO_INSPECT = [
  "VAT",
  "Excise duties",
  "Excise duties - components",
  "Other Indirect Taxes",
];

async function main() {
  console.log("Scaricamento (~4 MB, può richiedere qualche secondo)...");
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const buffer = await res.arrayBuffer();
  console.log(`Ricevuti ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB\n`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  for (const sheetName of SHEETS_TO_INSPECT) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) {
      console.log(`\nFoglio "${sheetName}" non trovato. Fogli presenti: ${workbook.worksheets.map((w) => w.name).join(", ")}`);
      continue;
    }

    console.log(`\n${"=".repeat(70)}\nFOGLIO "${sheet.name}" — righe: ${sheet.rowCount}  colonne: ${sheet.columnCount}\n`);
    console.log("--- prime 8 righe ---");
    let printed = 0;
    sheet.eachRow((row, rowNumber) => {
      if (printed >= 8) return;
      const values = row.values as unknown[]; // indice 0 vuoto per convenzione ExcelJS
      console.log(`Riga ${String(rowNumber).padStart(3)}:`, JSON.stringify(values.slice(1)));
      printed++;
    });

    const last = sheet.rowCount;
    console.log(`\n--- ultime 5 righe (di ${last}) ---`);
    for (let n = Math.max(1, last - 4); n <= last; n++) {
      const values = sheet.getRow(n).values as unknown[];
      console.log(`Riga ${String(n).padStart(3)}:`, JSON.stringify(values.slice(1)));
    }
  }
}

main().catch((err) => {
  console.error("Errore:", err);
  process.exit(1);
});
