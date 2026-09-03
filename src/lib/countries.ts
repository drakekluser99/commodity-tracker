import { COUNTRY_NAMES_IT } from "./countryNames";

export interface CountryRoute {
  slug: string;
  englishName: string; // chiave in `regions.name`, per il join sui dati
  italianName: string; // per titoli e testo
}

/**
 * Slug URL -> nome inglese (chiave grezza di `regions.name`), per i 27
 * paesi UE tracciati. Scritto a mano invece di derivarlo da
 * COUNTRY_NAMES_IT con una funzione di slugify generica: alcuni nomi hanno
 * spazi e accenti ("Paesi Bassi", "Repubblica Ceca") che si prestano a più
 * di uno slug plausibile. Una tabella esplicita non lascia dubbi su quale
 * URL corrisponde a quale paese — stessa scelta fatta in countryNames.ts
 * per la stessa ragione: la lista è piccola (27 righe) e stabile, quindi
 * "scritta a mano" costa poco e toglie un'intera classe di bug.
 *
 * Esclude gli Stati Uniti: questa pagina esiste per la scomposizione
 * fiscale, che l'EIA non pubblica (solo la Commissione Europea lo fa).
 */
const SLUG_TO_ENGLISH: Record<string, string> = {
  austria: "Austria",
  belgio: "Belgium",
  bulgaria: "Bulgaria",
  croazia: "Croatia",
  cipro: "Cyprus",
  "repubblica-ceca": "Czechia",
  danimarca: "Denmark",
  estonia: "Estonia",
  finlandia: "Finland",
  francia: "France",
  germania: "Germany",
  grecia: "Greece",
  ungheria: "Hungary",
  irlanda: "Ireland",
  italia: "Italy",
  lettonia: "Latvia",
  lituania: "Lithuania",
  lussemburgo: "Luxembourg",
  malta: "Malta",
  "paesi-bassi": "Netherlands",
  polonia: "Poland",
  portogallo: "Portugal",
  romania: "Romania",
  slovacchia: "Slovakia",
  slovenia: "Slovenia",
  spagna: "Spain",
  svezia: "Sweden",
};

export const EU_COUNTRY_SLUGS: readonly string[] = Object.keys(SLUG_TO_ENGLISH);

/** Nome inglese per uno slug, o `null` se lo slug non corrisponde a nessun paese tracciato. */
export function englishNameForSlug(slug: string): string | null {
  return SLUG_TO_ENGLISH[slug] ?? null;
}

/** Slug e nome italiano per un nome inglese, o `null` se non è uno dei 27. */
export function routeForCountry(englishName: string): CountryRoute | null {
  const entry = Object.entries(SLUG_TO_ENGLISH).find(
    ([, en]) => en === englishName
  );
  if (!entry) return null;
  const [slug] = entry;
  return {
    slug,
    englishName,
    italianName: COUNTRY_NAMES_IT[englishName] ?? englishName,
  };
}
