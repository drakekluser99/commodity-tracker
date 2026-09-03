/**
 * Esegui con: npx tsx scripts/inspect-eu-history.ts
 *
 * Ispeziona il file STORICO del bollettino UE — un file diverso da quello
 * che il cron scarica ogni settimana.
 *
 *   Weekly prices with Taxes  →  una sola settimana, 27 paesi.
 *                                È quello che scarica euOilBulletin.ts.
 *   Prices History            →  dal 2005 a oggi, e non solo i prezzi:
 *                                contiene anche i prezzi AL NETTO delle
 *                                imposte, l'IVA e le accise.
 *
 * La seconda colonna di quel file è il motivo per cui vale la pena
 * guardarlo: prezzo alla pompa meno prezzo netto = carico fiscale, per 27
 * paesi e per ogni settimana degli ultimi vent'anni, da fonte istituzionale
 * primaria. Lo stesso download serve sia il backfill dello storico sia la
 * scomposizione del prezzo alla pompa.
 *
 * Questo script non scrive niente: scarica e stampa la struttura, perché il
 * parser va scritto su un layout osservato e non immaginato. È lo stesso
 * metodo usato per inspect-eu-bulletin.ts, e la nota difensiva in
 * euOilBulletin.ts spiega perché: il primo parser scritto a occhi chiusi era
 * sbagliato, la riga delle unità in mezzo non era prevista.
 */
import ExcelJS from "exceljs";

// Trovato nella pagina ufficiale del bollettino, voce
// "Price developments 2005 onwards (xlsx)", ~4,3 MB.
// https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en
const URL =
  "https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx";

async function main() {
  console.log("Scaricamento (~4 MB, può richiedere qualche secondo)...");
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const buffer = await res.arrayBuffer();
  console.log(`Ricevuti ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB\n`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  // Primo dato da guardare: quanti fogli e come si chiamano. Se la
  // Commissione ha separato un anno per foglio, il parser deve iterarli;
  // se è un unico foglio lungo, no. Cambia la forma del codice.
  console.log(`Fogli (${workbook.worksheets.length}):`);
  for (const ws of workbook.worksheets) {
    console.log(`  "${ws.name}"  righe: ${ws.rowCount}  colonne: ${ws.columnCount}`);
  }

  for (const sheet of workbook.worksheets.slice(0, 3)) {
    console.log(`\n${"=".repeat(70)}\nFOGLIO "${sheet.name}" — prime 12 righe\n`);
    let printed = 0;
    sheet.eachRow((row, rowNumber) => {
      if (printed >= 12) return;
      const values = row.values as unknown[]; // indice 0 vuoto per convenzione ExcelJS
      console.log(`Riga ${String(rowNumber).padStart(3)}:`, JSON.stringify(values.slice(1)));
      printed++;
    });

    // Anche le ultime righe: negli export della Commissione capita di
    // trovare in fondo totali, medie UE o note che non vanno importate
    // come se fossero paesi.
    const last = sheet.rowCount;
    console.log(`\n... ultime 3 righe (di ${last}):\n`);
    for (let n = Math.max(1, last - 2); n <= last; n++) {
      const values = sheet.getRow(n).values as unknown[];
      console.log(`Riga ${String(n).padStart(3)}:`, JSON.stringify(values.slice(1)));
    }
  }
}

main().catch((err) => {
  console.error("Errore:", err);
  process.exit(1);
});
