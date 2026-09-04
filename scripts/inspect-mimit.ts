/**
 * Ispezione/primo salvataggio Fase 4 (MIMIT).
 *
 *   npx tsx scripts/inspect-mimit.ts             # scarica, aggrega, STAMPA soltanto
 *   npx tsx scripts/inspect-mimit.ts --save       # scarica, aggrega, SALVA in retail_fuel_prices_it
 *
 * A differenza di backfill.ts, questo non è uno storico: il MIMIT pubblica
 * solo l'istantanea di oggi, non un archivio scaricabile in un colpo solo
 * (a differenza del bollettino UE). Ogni lancio salva UNA rilevazione, per
 * la data che il file dichiara nella riga "Estrazione del ...".
 *
 * Senza `--save` è la modalità giusta per il primo lancio vero: la libreria
 * (`src/lib/fetchers/mimit.ts`) non è mai stata testata contro il file reale
 * da questo ambiente (rete del container cloud bloccata verso mimit.gov.it,
 * vedi CLAUDE.md) — i contatori di scarto qui sotto dicono se il parsing
 * regge o se qualcosa nel formato è diverso da quanto documentato.
 */
import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local", override: false });

async function main() {
  const save = process.argv.includes("--save");

  const { fetchAndAggregateMimit, averagePrice } = await import(
    "../src/lib/fetchers/mimit"
  );

  console.log("Scaricamento anagrafica + prezzi MIMIT...");
  const result = await fetchAndAggregateMimit();
  const { diagnostics } = result;

  console.log(`Estrazione: ${result.extractedOn ?? "(riga non trovata)"}`);
  console.log(`Codifica: ${diagnostics.decodingUsedFallback ? "windows-1252 (fallback)" : "utf-8"}`);
  console.log(`Impianti riconosciuti (provincia nota): ${diagnostics.totalStations}`);
  console.log(`Righe prezzo lette: ${diagnostics.totalPriceRows}`);
  console.log(`Righe prezzo orfane (idImpianto non in anagrafica): ${diagnostics.orphanPriceRows}`);
  console.log(
    `Sigle provincia sconosciute: ${diagnostics.unknownProvinceCodes.size}` +
      (diagnostics.unknownProvinceCodes.size > 0
        ? ` -> ${Array.from(diagnostics.unknownProvinceCodes).join(", ")}`
        : "")
  );
  console.log(
    `Carburanti scartati (fuori benzina/gasolio standard): ${diagnostics.unknownFuelTypes.size}` +
      (diagnostics.unknownFuelTypes.size > 0
        ? ` -> ${Array.from(diagnostics.unknownFuelTypes).slice(0, 20).join(", ")}${diagnostics.unknownFuelTypes.size > 20 ? ", ..." : ""}`
        : "")
  );
  console.log(`Combinazioni provincia×carburante×self/servito aggregate: ${result.aggregates.length}`);

  console.log("\nCampione (prime 10 combinazioni):");
  for (const agg of result.aggregates.slice(0, 10)) {
    console.log(
      `  ${agg.provinceCode} ${agg.fuelType} ${agg.isSelf ? "self" : "servito"}: ` +
        `${averagePrice(agg).toFixed(3)} €/L su ${agg.stationIds.size} impianti`
    );
  }

  if (!save) {
    console.log("\n(--save non passato: nessuna scrittura sul database)");
    return;
  }

  const { saveMimitPrices } = await import("../src/lib/fetchers/saveMimitPrices");
  console.log("\nSalvataggio su retail_fuel_prices_it...");
  const written = await saveMimitPrices(result, "mimit");
  console.log(`Scritte ${written} righe (province × carburante).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Errore:", err);
    process.exit(1);
  });
