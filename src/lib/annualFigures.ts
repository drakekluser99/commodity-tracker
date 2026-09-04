import type { SourceId } from "./sources";

/**
 * "NUMERO DEL GIORNO" — ultima voce della Fase 3 della roadmap del 3
 * settembre 2026.
 *
 * Cosa NON è: non un cron, non una tabella, non un valore ricalcolato a
 * ogni visita. È l'esatto opposto delle altre fonti del sito — quelle
 * pubblicano ogni giorno o settimana e il sito le insegue; questa la
 * pubblica un ente pubblico UNA VOLTA L'ANNO (il bilancio dell'attività
 * dell'Agenzia delle Dogane e dei Monopoli), e il sito la cita, non la
 * ricalcola.
 *
 * Perché un file a parte e non una riga in `sources.ts`: `sources.ts`
 * descrive le FONTI (chi pubblica), questo file descrive il DATO stesso
 * (cosa dice quella fonte quest'anno) — sono due cose diverse che cambiano
 * a ritmi diversi. Un solo oggetto esportato, non un array: oggi c'è un
 * solo "numero del giorno". Se un domani ne servisse più di uno (es. un
 * secondo dato accanto a questo), diventa un array — non prima.
 *
 * Perché questo valore e non un altro: la ricerca per questa feature ha
 * trovato due candidati verificabili — 39 miliardi € (accise specifiche
 * su benzina+gasolio, fonte: Annuario Statistico ACI 2025, che però non
 * dichiara la propria fonte primaria) e questo, 26,7 miliardi € (accisa
 * sui "prodotti energetici", categoria fiscale più ampia di benzina/
 * gasolio ma con FONTE DIRETTA istituzionale — esattamente il tipo di
 * fonte primaria che il resto del sito privilegia, vedi sources.ts).
 * Scelto il secondo: meno "pulito" nello scope, ma la fonte è quella
 * giusta, non un intermediario.
 *
 * MANUTENZIONE: questo dato NON si aggiorna da solo. L'Agenzia delle
 * Dogane pubblica il bilancio dell'attività dell'anno precedente ogni
 * primavera (i due comunicati trovati durante la ricerca sono di
 * maggio 2025 e maggio 2026) — è il momento giusto per controllare se è
 * uscito un numero più recente e aggiornare questo oggetto a mano.
 * `year` è quello che va in etichetta sul sito: se questo file non viene
 * toccato per anni, `year` resta ferma e la pagina continua a dirlo
 * onestamente ("dati 2024") invece di far sembrare il numero più fresco
 * di quanto sia — è esattamente l'errore, isolato nell'analisi
 * competitor, che questa struttura vuole evitare (un numero statico
 * spacciato per vivo).
 */
export interface AnnualFigure {
  /** Importo in euro (non miliardi): tenerlo nell'unità base evita ambiguità
   *  su cosa sia effettivamente memorizzato — la conversione a "miliardi"
   *  per la UI è un problema di formattazione, vedi formatBillionsEur. */
  valueEur: number;
  /** Frase completa, pronta per la UI: include già cosa misura il numero
   *  e il contesto minimo per non farlo sembrare più preciso di quanto
   *  dichiarato dalla fonte (l'86% è la fonte stessa a scorporarlo). */
  headline: string;
  /** Anno CUI SI RIFERISCE il dato (l'esercizio fiscale), non l'anno in cui
   *  è stato pubblicato — stessa distinzione recordedAt/retrievedAt usata
   *  ovunque nello schema del database. */
  year: number;
  sourceId: SourceId;
  /** Pagina istituzionale della fonte. adm.gov.it blocca il fetch
   *  automatico (verificato durante la ricerca), ma resta raggiungibile
   *  da un browser normale — è comunque il link giusto da dare al lettore. */
  sourceUrl: string;
}

export const ANNUAL_FIGURE: AnnualFigure = {
  valueEur: 26_700_000_000,
  headline:
    "Nel 2024 le accise sui prodotti energetici (benzina, gasolio e gli altri carburanti) hanno portato all'Erario italiano 26,7 miliardi di euro — l'86% di quanto lo Stato incassa complessivamente dalle Accise energie, il resto viene da gas naturale, energia elettrica e alcolici.",
  year: 2024,
  sourceId: "adm",
  sourceUrl:
    "https://www.adm.gov.it/portale/en/gli-stati-generali-dell-agenzia-delle-dogane-e-dei-monopoli-2025",
};
