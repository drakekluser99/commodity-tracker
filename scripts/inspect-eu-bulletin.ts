/**
 * Esegui con: npx tsx scripts/inspect-eu-bulletin.ts
 *
 * Scarica il file XLSX ufficiale del bollettino UE e stampa le prime righe
 * grezze così possiamo confermare (o correggere) le assunzioni fatte in
 * src/lib/fetchers/euOilBulletin.ts sul layout delle colonne.
 */
import ExcelJS from "exceljs";

const URL =
  "https://energy.ec.europa.eu/document/download/264c2d0f-f161-4ea3-a777-78faae59bea0_en?filename=Weekly%20Oil%20Bulletin%20Weekly%20prices%20with%20Taxes.xlsx";

async function main() {
  console.log("Scaricamento in corso...");
  const res = await fetch(URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const buffer = await res.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  console.log(`\nFogli trovati: ${workbook.worksheets.map((w) => w.name).join(", ")}\n`);

  const sheet = workbook.worksheets[0];
  console.log(`Ispeziono il primo foglio: "${sheet.name}"\n`);

  // Stampa le prime 15 righe, tutte le colonne, così vediamo dove sono
  // davvero le intestazioni e dove iniziano i dati.
  let printed = 0;
  sheet.eachRow((row, rowNumber) => {
    if (printed >= 15) return;
    const values = row.values as unknown[]; // indice 0 vuoto per convenzione ExcelJS
    console.log(`Riga ${rowNumber}:`, JSON.stringify(values.slice(1)));
    printed++;
  });
}

main().catch((err) => {
  console.error("Errore:", err);
  process.exit(1);
});
