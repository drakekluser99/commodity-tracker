import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { commodities, priceHistory } from "@/lib/db/schema";
import type { NormalizedPricePoint } from "./alphaVantage";
import {
  logCorrectionIfChanged,
  toNumberOrNull,
  latestOf,
} from "./correctionsLog";

/**
 * Quante righe per singola INSERT nel salvataggio massivo.
 *
 * Il driver è `neon-http`: ogni query è una richiesta HTTP a sé. Con
 * `savePricePoints`, che fa due query per punto, salvare 10.000 rilevazioni
 * significherebbe 20.000 richieste HTTP — ore di attesa. Raggruppandole in
 * INSERT da 500 righe si scende a poche decine di richieste.
 *
 * Perché 500 e non 10.000 in un colpo solo: Postgres accetta al massimo
 * 65.535 parametri per statement. Qui ogni riga ne usa 5, quindi il tetto
 * teorico sarebbe ~13.000 righe; 500 tiene un margine ampio e mantiene ogni
 * richiesta abbastanza piccola da non andare in timeout.
 */
const INSERT_CHUNK_SIZE = 500;

/**
 * Salva un elenco di prezzi normalizzati nel database.
 * Per ogni punto:
 *   1. assicura che la commodity esista in `commodities` (crea se manca)
 *   2. inserisce il prezzo in `price_history`
 *
 * Non è specifica di Alpha Vantage: qualunque fetcher futuro (EIA,
 * fonti europee...) che produce un NormalizedPricePoint può riusarla.
 */
export async function savePricePoints(
  points: NormalizedPricePoint[],
  source: string,
  // Collega ogni correzione rilevata al run che l'ha vista (vedi
  // data_corrections in schema.ts). Opzionale e default null: la funzione
  // resta chiamabile anche fuori da un cron tracciato.
  runId: number | null = null
) {
  // Un solo timestamp per l'intero batch: è un unico evento di
  // acquisizione. Distinto da `recordedAt` (la data del dato).
  const retrievedAt = new Date();
  let saved = 0;
  const recordedDates: Date[] = [];

  for (const point of points) {
    // `onConflictDoUpdate`: se il symbol esiste già (vincolo UNIQUE nello
    // schema), aggiorna nome/categoria/unità invece di fallire con un
    // errore di duplicato. Se non esiste, lo inserisce. Questo pattern
    // si chiama "upsert" (UPDATE + INSERT).
    const [commodity] = await db
      .insert(commodities)
      .values({
        symbol: point.symbol,
        name: point.name,
        category: point.category,
        unit: point.unit,
      })
      .onConflictDoUpdate({
        target: commodities.symbol,
        set: { name: point.name, category: point.category, unit: point.unit },
      })
      .returning();

    const recordedAt = new Date(point.date);

    // Letto PRIMA dell'upsert: è l'unico modo per sapere cosa c'era prima
    // di sovrascriverlo. Una riga in più per punto (Alpha Vantage salva
    // poche decine di punti al giorno, non migliaia: vedi
    // savePricePointsBulk per perché il backfill non fa questa query).
    const existing = await db.query.priceHistory.findFirst({
      where: and(
        eq(priceHistory.commodityId, commodity.id),
        eq(priceHistory.recordedAt, recordedAt)
      ),
    });

    // Upsert sul vincolo unique (commodity_id, recorded_at): se il cron
    // rigira e la fonte ripropone la stessa data, aggiorniamo il prezzo
    // (magari ricalcolato dalla fonte) invece di inserire un duplicato.
    await db
      .insert(priceHistory)
      .values({
        commodityId: commodity.id,
        price: point.price.toString(), // `numeric` di Postgres si passa come stringa via Drizzle
        recordedAt,
        retrievedAt,
        source,
      })
      .onConflictDoUpdate({
        target: [priceHistory.commodityId, priceHistory.recordedAt],
        // Anche se il valore è identico, ri-vederlo dalla fonte è una
        // nuova acquisizione: aggiorniamo `retrievedAt`.
        set: { price: point.price.toString(), retrievedAt, source },
      });

    await logCorrectionIfChanged({
      tableName: "price_history",
      entityLabel: point.name,
      field: "price",
      oldValue: toNumberOrNull(existing?.price ?? null),
      newValue: point.price,
      recordedAt,
      source,
      runId,
    });

    recordedDates.push(recordedAt);
    saved++;
  }

  return { saved, latestRecordedAt: latestOf(recordedDates) };
}

/**
 * Variante di `savePricePoints` pensata per il backfill dello storico.
 *
 * Fa esattamente le stesse due cose — assicura l'anagrafica, poi scrive lo
 * storico — ma con un profilo di query completamente diverso, perché il
 * numero di punti è diverso di tre ordini di grandezza:
 *
 *   savePricePoints      →  2 query per punto.      Giusto per 2 punti.
 *   savePricePointsBulk  →  1 query per commodity
 *                           + 1 ogni 500 rilevazioni. Giusto per 10.000.
 *
 * Non sostituisce l'altra: il cron continua a usare `savePricePoints`, che
 * è più semplice da leggere e sul suo carico di lavoro è indistinguibile.
 * Sono due funzioni perché sono due problemi.
 *
 * A differenza di `savePricePoints`, questa NON scrive in `data_corrections`:
 * un backfill scrive migliaia di righe che, nella stragrande maggioranza dei
 * casi, non esistevano prima — leggerne il valore precedente riga per riga
 * prima di ogni upsert (come fa la versione per il cron) trasformerebbe un
 * salvataggio a blocchi da 500 in migliaia di SELECT singole, vanificando
 * il motivo per cui questa funzione esiste. Se un giorno servisse
 * ricostruire le correzioni avvenute durante un backfill, è un lavoro a
 * parte (confrontare due estrazioni), non un'aggiunta a questa funzione.
 *
 * L'upsert resta identico, e non è un dettaglio: significa che questo script
 * si può rilanciare quante volte si vuole senza duplicare nulla. Se
 * s'interrompe a metà, si rilancia e riprende — le righe già scritte vengono
 * semplicemente riscritte con lo stesso valore.
 */
export async function savePricePointsBulk(
  points: NormalizedPricePoint[],
  source: string,
  onProgress?: (written: number, total: number) => void
) {
  if (points.length === 0) return 0;

  const retrievedAt = new Date();

  // Passo 1: l'anagrafica. I punti in arrivo sono migliaia ma le materie
  // prime distinte sono al massimo dieci, quindi si deduplica prima di
  // toccare il database invece di fare un upsert per riga.
  const bySymbol = new Map<string, NormalizedPricePoint>();
  for (const point of points) {
    if (!bySymbol.has(point.symbol)) bySymbol.set(point.symbol, point);
  }

  const commodityIdBySymbol = new Map<string, number>();
  for (const point of bySymbol.values()) {
    const [row] = await db
      .insert(commodities)
      .values({
        symbol: point.symbol,
        name: point.name,
        category: point.category,
        unit: point.unit,
      })
      .onConflictDoUpdate({
        target: commodities.symbol,
        set: { name: point.name, category: point.category, unit: point.unit },
      })
      .returning();
    commodityIdBySymbol.set(point.symbol, row.id);
  }

  // Passo 2: lo storico, a blocchi.
  //
  // Deduplica sulla coppia (commodity, data) PRIMA di scrivere: se la stessa
  // data comparisse due volte nello stesso INSERT, Postgres rifiuterebbe
  // l'intero statement con "ON CONFLICT DO UPDATE command cannot affect row
  // a second time". È un errore che non si vede mai scrivendo riga per riga
  // e che si incontra sempre alla prima insert massiva.
  const seen = new Set<string>();
  const rows: Array<{
    commodityId: number;
    price: string;
    recordedAt: Date;
    retrievedAt: Date;
    source: string;
  }> = [];

  for (const point of points) {
    const commodityId = commodityIdBySymbol.get(point.symbol);
    if (commodityId === undefined) continue;
    const key = `${commodityId}|${point.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      commodityId,
      price: point.price.toString(),
      recordedAt: new Date(point.date),
      retrievedAt,
      source,
    });
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    await db
      .insert(priceHistory)
      .values(chunk)
      .onConflictDoUpdate({
        target: [priceHistory.commodityId, priceHistory.recordedAt],
        // `excluded` è la pseudo-tabella di Postgres che contiene la riga
        // che si stava per inserire quando è emerso il conflitto. Qui è
        // indispensabile: in un INSERT da 500 righe ogni riga ha un prezzo
        // diverso, e scrivere un valore costante li appiattirebbe tutti
        // sullo stesso numero. `retrievedAt` e `source` invece sono davvero
        // uguali per l'intero blocco, quindi restano costanti.
        set: {
          price: sql`excluded.price`,
          retrievedAt,
          source,
        },
      });
    written += chunk.length;
    onProgress?.(written, rows.length);
  }

  return written;
}
