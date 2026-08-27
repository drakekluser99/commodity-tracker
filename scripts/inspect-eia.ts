/**
 * Esegui con: npx tsx scripts/inspect-eia.ts TUA_API_KEY
 *
 * Ottieni una API key gratuita su: https://www.eia.gov/opendata/register.php
 * (arriva via email in pochi minuti)
 *
 * Stampa la risposta grezza dell'API per confermare che i codici prodotto
 * (EPMR, EPD2D) e l'area (NUS) usati in src/lib/fetchers/eiaUs.ts siano
 * corretti, e che l'unità di misura sia davvero $/GAL come assunto.
 */

const apiKey = process.argv[2];
if (!apiKey) {
  console.error("Uso: npx tsx scripts/inspect-eia.ts TUA_API_KEY");
  process.exit(1);
}

async function main() {
  const url = new URL("https://api.eia.gov/v2/petroleum/pri/gnd/data/");
  url.searchParams.set("api_key", apiKey!);
  url.searchParams.set("frequency", "weekly");
  url.searchParams.append("data[0]", "value");
  url.searchParams.append("facets[product][]", "EPMR");
  url.searchParams.append("facets[product][]", "EPD2D");
  url.searchParams.append("facets[duoarea][]", "NUS");
  url.searchParams.append("sort[0][column]", "period");
  url.searchParams.append("sort[0][direction]", "desc");
  url.searchParams.set("length", "10");

  console.log("Chiamata a:", url.toString().replace(apiKey!, "***"));

  const res = await fetch(url.toString());
  console.log("\nStatus HTTP:", res.status);

  const json = await res.json();
  console.log("\nRisposta completa:\n", JSON.stringify(json, null, 2));
}

main().catch((err) => {
  console.error("Errore:", err);
  process.exit(1);
});
