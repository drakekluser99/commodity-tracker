/**
 * Conversioni di SOLA VISUALIZZAZIONE per le materie prime globali.
 *
 * Perché qui e non nel fetcher o nel database: il dato grezzo salvato in
 * `price_history` (e l'unità in `commodities.unit`) deve restare identico a
 * quello che l'API Alpha Vantage restituisce davvero. È il principio cardine
 * del progetto — ogni dato ha fonte, data e unità dichiarate — e serve anche
 * per accuratezza e tracciabilità: se un domani ricontrolliamo un valore
 * contro la fonte, deve combaciare al centesimo. Per questo la conversione a
 * un'unità più leggibile per il pubblico europeo si fa solo nel layer di
 * presentazione, subito prima del render, e mai sul dato persistito.
 *
 * Cosa si converte e cosa no:
 * - COTTON è l'unica materia prima della tabella quotata in unità non metrica
 *   ("cents per pound"): la portiamo a "cents per kg".
 * - BRENT (dollari al barile) e NATURAL_GAS (dollari per MMBtu) NON si
 *   toccano: barile e BTU sono lo standard internazionale con cui petrolio e
 *   gas si quotano ovunque, non è un'incongruenza da correggere.
 */

// 1 libbra avoirdupois = 0.45359237 kg (standard internazionale esatto).
// cents/kg = cents/libbra ÷ (kg per libbra)
// Verifica: 88.7750 cents/libbra ÷ 0.45359237 = 195.7154 cents/kg
const KG_PER_POUND = 0.45359237;

export interface DisplayPrice {
  price: number;
  unit: string;
}

/**
 * Restituisce prezzo e unità così come vanno MOSTRATI all'utente.
 * Per tutte le materie prime tranne il cotone è un passthrough: si ritorna
 * il valore invariato. Il gate su `symbol` più il controllo sull'unità
 * evita di riscalare per sbaglio se un domani la fonte cambiasse formato.
 */
export function displayCommodityPrice(
  symbol: string,
  price: number,
  unit: string
): DisplayPrice {
  if (symbol === "COTTON" && /pound/i.test(unit)) {
    return { price: price / KG_PER_POUND, unit: "cents per kg" };
  }
  return { price, unit };
}
