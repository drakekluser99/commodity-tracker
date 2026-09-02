// Nome inglese (regions.name, chiave grezza) -> nome italiano per la UI.
// Usata SOLO per la presentazione — il nome inglese resta la chiave vera
// per join (mappa) ed export dati grezzi, invariati.
export const COUNTRY_NAMES_IT: Record<string, string> = {
  Austria: "Austria",
  Belgium: "Belgio",
  Bulgaria: "Bulgaria",
  Croatia: "Croazia",
  Cyprus: "Cipro",
  Czechia: "Repubblica Ceca",
  Denmark: "Danimarca",
  Estonia: "Estonia",
  Finland: "Finlandia",
  France: "Francia",
  Germany: "Germania",
  Greece: "Grecia",
  Hungary: "Ungheria",
  Ireland: "Irlanda",
  Italy: "Italia",
  Latvia: "Lettonia",
  Lithuania: "Lituania",
  Luxembourg: "Lussemburgo",
  Malta: "Malta",
  Netherlands: "Paesi Bassi",
  Poland: "Polonia",
  Portugal: "Portogallo",
  Romania: "Romania",
  Slovakia: "Slovacchia",
  Slovenia: "Slovenia",
  Spain: "Spagna",
  Sweden: "Svezia",
  "United States": "Stati Uniti",
};

// Fallback esplicito: se un nome non è in mappa, mostra l'originale
// invece di un vuoto — coerente col principio "mai un fallimento silenzioso".
export function localizedCountryName(englishName: string): string {
  return COUNTRY_NAMES_IT[englishName] ?? englishName;
}
