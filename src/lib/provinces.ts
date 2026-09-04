/**
 * Le 107 province italiane (elenco ISTAT), sigla -> nome per esteso e slug
 * URL. Stessa scelta di countries.ts: tabella scritta a mano invece di
 * derivata, perché alcuni nomi hanno accenti o doppie parole ("Reggio
 * Calabria", "Forlì-Cesena") che si prestano a più di uno slug plausibile.
 *
 * La sigla è la chiave grezza: è quella che compare nella colonna
 * `Provincia` dell'anagrafica MIMIT (`anagrafica_impianti_attivi.csv`),
 * quindi è lei il bersaglio del join fetcher -> database, non il nome.
 *
 * NON ancora verificata contro le sigle reali osservate nel CSV MIMIT (la
 * rete di questo container non raggiunge mimit.gov.it, vedi CLAUDE.md) —
 * `scripts/inspect-mimit.ts` logga qualunque sigla che non trova qui, da
 * correggere al primo lancio vero se emerge un disallineamento.
 */

export interface ProvinceRoute {
  code: string; // sigla, es. "MI" — chiave grezza della colonna Provincia MIMIT
  name: string; // nome per esteso, es. "Milano"
  slug: string; // per l'URL /provincia/[slug]
}

const PROVINCES: readonly ProvinceRoute[] = [
  // Piemonte
  { code: "TO", name: "Torino", slug: "torino" },
  { code: "VC", name: "Vercelli", slug: "vercelli" },
  { code: "NO", name: "Novara", slug: "novara" },
  { code: "CN", name: "Cuneo", slug: "cuneo" },
  { code: "AT", name: "Asti", slug: "asti" },
  { code: "AL", name: "Alessandria", slug: "alessandria" },
  { code: "BI", name: "Biella", slug: "biella" },
  { code: "VB", name: "Verbano-Cusio-Ossola", slug: "verbano-cusio-ossola" },
  // Valle d'Aosta
  { code: "AO", name: "Valle d'Aosta", slug: "valle-d-aosta" },
  // Lombardia
  { code: "VA", name: "Varese", slug: "varese" },
  { code: "CO", name: "Como", slug: "como" },
  { code: "SO", name: "Sondrio", slug: "sondrio" },
  { code: "MI", name: "Milano", slug: "milano" },
  { code: "BG", name: "Bergamo", slug: "bergamo" },
  { code: "BS", name: "Brescia", slug: "brescia" },
  { code: "PV", name: "Pavia", slug: "pavia" },
  { code: "CR", name: "Cremona", slug: "cremona" },
  { code: "MN", name: "Mantova", slug: "mantova" },
  { code: "LC", name: "Lecco", slug: "lecco" },
  { code: "LO", name: "Lodi", slug: "lodi" },
  { code: "MB", name: "Monza e della Brianza", slug: "monza-e-della-brianza" },
  // Trentino-Alto Adige
  { code: "BZ", name: "Bolzano", slug: "bolzano" },
  { code: "TN", name: "Trento", slug: "trento" },
  // Veneto
  { code: "VR", name: "Verona", slug: "verona" },
  { code: "VI", name: "Vicenza", slug: "vicenza" },
  { code: "BL", name: "Belluno", slug: "belluno" },
  { code: "TV", name: "Treviso", slug: "treviso" },
  { code: "VE", name: "Venezia", slug: "venezia" },
  { code: "PD", name: "Padova", slug: "padova" },
  { code: "RO", name: "Rovigo", slug: "rovigo" },
  // Friuli-Venezia Giulia
  { code: "UD", name: "Udine", slug: "udine" },
  { code: "GO", name: "Gorizia", slug: "gorizia" },
  { code: "TS", name: "Trieste", slug: "trieste" },
  { code: "PN", name: "Pordenone", slug: "pordenone" },
  // Liguria
  { code: "IM", name: "Imperia", slug: "imperia" },
  { code: "SV", name: "Savona", slug: "savona" },
  { code: "GE", name: "Genova", slug: "genova" },
  { code: "SP", name: "La Spezia", slug: "la-spezia" },
  // Emilia-Romagna
  { code: "PC", name: "Piacenza", slug: "piacenza" },
  { code: "PR", name: "Parma", slug: "parma" },
  { code: "RE", name: "Reggio Emilia", slug: "reggio-emilia" },
  { code: "MO", name: "Modena", slug: "modena" },
  { code: "BO", name: "Bologna", slug: "bologna" },
  { code: "FE", name: "Ferrara", slug: "ferrara" },
  { code: "RA", name: "Ravenna", slug: "ravenna" },
  { code: "FC", name: "Forlì-Cesena", slug: "forli-cesena" },
  { code: "RN", name: "Rimini", slug: "rimini" },
  // Toscana
  { code: "MS", name: "Massa-Carrara", slug: "massa-carrara" },
  { code: "LU", name: "Lucca", slug: "lucca" },
  { code: "PT", name: "Pistoia", slug: "pistoia" },
  { code: "FI", name: "Firenze", slug: "firenze" },
  { code: "LI", name: "Livorno", slug: "livorno" },
  { code: "PI", name: "Pisa", slug: "pisa" },
  { code: "AR", name: "Arezzo", slug: "arezzo" },
  { code: "SI", name: "Siena", slug: "siena" },
  { code: "GR", name: "Grosseto", slug: "grosseto" },
  { code: "PO", name: "Prato", slug: "prato" },
  // Umbria
  { code: "PG", name: "Perugia", slug: "perugia" },
  { code: "TR", name: "Terni", slug: "terni" },
  // Marche
  { code: "PU", name: "Pesaro e Urbino", slug: "pesaro-e-urbino" },
  { code: "AN", name: "Ancona", slug: "ancona" },
  { code: "MC", name: "Macerata", slug: "macerata" },
  { code: "AP", name: "Ascoli Piceno", slug: "ascoli-piceno" },
  { code: "FM", name: "Fermo", slug: "fermo" },
  // Lazio
  { code: "VT", name: "Viterbo", slug: "viterbo" },
  { code: "RI", name: "Rieti", slug: "rieti" },
  { code: "RM", name: "Roma", slug: "roma" },
  { code: "LT", name: "Latina", slug: "latina" },
  { code: "FR", name: "Frosinone", slug: "frosinone" },
  // Abruzzo
  { code: "AQ", name: "L'Aquila", slug: "l-aquila" },
  { code: "TE", name: "Teramo", slug: "teramo" },
  { code: "PE", name: "Pescara", slug: "pescara" },
  { code: "CH", name: "Chieti", slug: "chieti" },
  // Molise
  { code: "CB", name: "Campobasso", slug: "campobasso" },
  { code: "IS", name: "Isernia", slug: "isernia" },
  // Campania
  { code: "CE", name: "Caserta", slug: "caserta" },
  { code: "BN", name: "Benevento", slug: "benevento" },
  { code: "NA", name: "Napoli", slug: "napoli" },
  { code: "AV", name: "Avellino", slug: "avellino" },
  { code: "SA", name: "Salerno", slug: "salerno" },
  // Puglia
  { code: "FG", name: "Foggia", slug: "foggia" },
  { code: "BA", name: "Bari", slug: "bari" },
  { code: "TA", name: "Taranto", slug: "taranto" },
  { code: "BR", name: "Brindisi", slug: "brindisi" },
  { code: "LE", name: "Lecce", slug: "lecce" },
  { code: "BT", name: "Barletta-Andria-Trani", slug: "barletta-andria-trani" },
  // Basilicata
  { code: "PZ", name: "Potenza", slug: "potenza" },
  { code: "MT", name: "Matera", slug: "matera" },
  // Calabria
  { code: "CS", name: "Cosenza", slug: "cosenza" },
  { code: "CZ", name: "Catanzaro", slug: "catanzaro" },
  { code: "RC", name: "Reggio Calabria", slug: "reggio-calabria" },
  { code: "KR", name: "Crotone", slug: "crotone" },
  { code: "VV", name: "Vibo Valentia", slug: "vibo-valentia" },
  // Sicilia
  { code: "TP", name: "Trapani", slug: "trapani" },
  { code: "PA", name: "Palermo", slug: "palermo" },
  { code: "ME", name: "Messina", slug: "messina" },
  { code: "AG", name: "Agrigento", slug: "agrigento" },
  { code: "CL", name: "Caltanissetta", slug: "caltanissetta" },
  { code: "EN", name: "Enna", slug: "enna" },
  { code: "CT", name: "Catania", slug: "catania" },
  { code: "RG", name: "Ragusa", slug: "ragusa" },
  { code: "SR", name: "Siracusa", slug: "siracusa" },
  // Sardegna
  { code: "SS", name: "Sassari", slug: "sassari" },
  { code: "NU", name: "Nuoro", slug: "nuoro" },
  { code: "CA", name: "Cagliari", slug: "cagliari" },
  { code: "OR", name: "Oristano", slug: "oristano" },
  { code: "SU", name: "Sud Sardegna", slug: "sud-sardegna" },
];

const BY_CODE: ReadonlyMap<string, ProvinceRoute> = new Map(
  PROVINCES.map((p) => [p.code, p])
);
const BY_SLUG: ReadonlyMap<string, ProvinceRoute> = new Map(
  PROVINCES.map((p) => [p.slug, p])
);

export const ALL_PROVINCES: readonly ProvinceRoute[] = PROVINCES;

/** Provincia per sigla MIMIT (es. "MI"), o `null` se la sigla non è nota. */
export function provinceForCode(code: string): ProvinceRoute | null {
  return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

/** Provincia per slug URL, o `null` se non corrisponde a nessuna delle 107. */
export function provinceForSlug(slug: string): ProvinceRoute | null {
  return BY_SLUG.get(slug) ?? null;
}
