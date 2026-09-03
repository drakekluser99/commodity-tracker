"use client";

import { useId, useMemo, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";
import Link from "next/link";
import { localizedCountryName } from "@/lib/countryNames";
import { formatFuelPrice } from "@/lib/format";
import { routeForCountry } from "@/lib/countries";

const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";

export interface CountryFuelData {
  countryName: string;
  petrol: number | null;
  diesel: number | null;
  /**
   * Prezzi al netto delle imposte. `null` dove la Commissione non li
   * pubblica: in quel caso la quota fiscale non si calcola e il paese
   * finisce nel grigio "nessun dato", che è la risposta onesta.
   */
  petrolNet: number | null;
  dieselNet: number | null;
}

interface Props {
  prices: CountryFuelData[];
  /**
   * Medie UE calcolate in page.tsx, una per carburante. Sono il CENTRO
   * della scala divergente: senza la media per la metrica attiva non c'è
   * un punto neutro su cui posizionare lo scarto, e i paesi cadono nel
   * fallback "nessun dato".
   *
   * Arriva come oggetto di dati semplici e non come funzione di calcolo:
   * questo è un Client Component, e passargli una funzione da `page.tsx`
   * fallisce A RUNTIME con "Functions cannot be passed directly to Client
   * Components" — un errore che né `tsc` né `eslint` catturano (vedi la
   * voce corrispondente in CLAUDE.md).
   */
  euAverage: {
    petrol: number | null;
    diesel: number | null;
    petrolNet: number | null;
    dieselNet: number | null;
  };
}

// Hex reali dei token system-* (vedi globals.css @theme) — lo stile SVG di
// react-simple-maps vuole un colore risolto, non può leggere var(--color-*)
// in modo affidabile su tutti i browser per il fill.
const NEUTRAL_HEX = "#e4dccb"; // system-border — centro della scala (alla media UE)
const BELOW_HEX = "#3f6f4a"; // system-signal-down (verde bosco) — sotto la media
const ABOVE_HEX = "#b0461f"; // system-signal-up (ruggine) — sopra la media
const INK_HEX = "#191509"; // system-ink — bordo del paese in hover
const NO_DATA_FILL = "#f0ebe0"; // system-border-subtle — fallback "nessun dato".
// Deliberatamente diverso da NEUTRAL_HEX (il centro della scala), altrimenti
// "nessun dato" e "esattamente alla media UE" sarebbero indistinguibili.

/**
 * Le metriche selezionabili sulla mappa.
 *
 * Il motivo per cui esiste un registro invece di due rami `if (benzina)`:
 * la mappa non deve sapere che sta disegnando prezzi di benzina. Deve
 * sapere che sta disegnando UNA grandezza numerica per paese, con
 * un'etichetta, un'unità e una media di riferimento. Il giorno in cui il
 * file storico della Commissione darà il carico fiscale (prezzo alla pompa
 * meno prezzo netto), aggiungere quella vista sarà una voce in più in
 * questo array — non una riscrittura del componente.
 *
 * `field` è il nome di una proprietà, non una funzione che legge il dato.
 * Sembra una sottigliezza, ed è invece la ragione per cui questo registro
 * può stare in un file `"use client"` senza problemi: se un domani il
 * registro dovesse arrivare da `page.tsx`, delle funzioni al suo interno
 * lo renderebbero impossibile da serializzare.
 */
type FuelKey = "petrol" | "diesel";
type MeasureKey = "price" | "taxShare";

const FUELS: ReadonlyArray<{ key: FuelKey; label: string }> = [
  { key: "petrol", label: "Benzina" },
  { key: "diesel", label: "Diesel" },
];

/**
 * Le due grandezze che la mappa sa disegnare.
 *
 * Sono due DIMENSIONI separate — carburante e misura — e non quattro voci
 * in una fila sola. Con quattro chip ("benzina", "diesel", "quota benzina",
 * "quota diesel") il lettore deve ricostruire da sé che sono due assi
 * incrociati; con due file di due, la struttura è visibile.
 *
 * `unit` e `format` stanno qui e non nel componente perché sono ciò che
 * distingue una misura dall'altra: un prezzo si scrive con tre decimali e
 * "€/L", una quota con uno e "%". Aggiungere una terza misura in futuro
 * (per esempio la sola accisa, dai fogli fiscali del file storico) vuol
 * dire aggiungere una voce qui.
 */
const MEASURES: ReadonlyArray<{
  key: MeasureKey;
  label: string;
  unit: string;
  format: (value: number) => string;
}> = [
  { key: "price", label: "Prezzo", unit: "€/L", format: formatFuelPrice },
  {
    key: "taxShare",
    label: "Quota fiscale",
    unit: "%",
    format: (v) => v.toLocaleString("it-IT", { maximumFractionDigits: 1 }),
  },
];

/**
 * Il valore di un paese per una data combinazione carburante × misura.
 *
 * La quota fiscale è `(pompa − netto) / pompa`, cioè quanta parte del
 * prezzo finale è imposta. Restituisce `null` se manca il netto: NON si
 * ripiega su una stima, perché un carico fiscale inventato su un sito che
 * promette fonte-data-limiti costa più di una cella vuota.
 */
function metricValue(
  data: CountryFuelData,
  fuel: FuelKey,
  measure: MeasureKey
): number | null {
  const gross = data[fuel];
  if (gross === null || !Number.isFinite(gross)) return null;
  if (measure === "price") return gross;

  const net = fuel === "petrol" ? data.petrolNet : data.dieselNet;
  if (net === null || !Number.isFinite(net) || gross <= 0) return null;
  return ((gross - net) / gross) * 100;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function interpolateColor(fromHex: string, toHex: string, t: number): string {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);
  const r = Math.round(from.r + (to.r - from.r) * t);
  const g = Math.round(from.g + (to.g - from.g) * t);
  const b = Math.round(from.b + (to.b - from.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Colore di un valore sulla scala divergente centrata sulla media.
 *
 * Estratta dal render perché ora serve in tre posti — i paesi, la barra
 * della legenda e i riquadri degli estremi — e tre copie della stessa
 * formula sono tre occasioni di farle divergere.
 *
 * L'intensità è `|scarto| * 2` clampata a 1: un paese a metà strada fra la
 * media e un estremo del range arriva già a saturazione piena. Il fattore
 * 2 è la manopola da girare se in pagina la scala sembra accendersi troppo
 * in fretta o troppo piano.
 */
function divergingColor(
  value: number,
  average: number,
  span: number
): string {
  if (span <= 0) return NEUTRAL_HEX;
  const scarto = (value - average) / span;
  const intensita = Math.min(Math.abs(scarto) * 2, 1);
  return scarto < 0
    ? interpolateColor(NEUTRAL_HEX, BELOW_HEX, intensita)
    : interpolateColor(NEUTRAL_HEX, ABOVE_HEX, intensita);
}

/**
 * Mappa interattiva d'Europa (react-simple-maps, atlante 50m). Zoom con
 * rotellina, pan trascinando; hover su un paese apre un tooltip.
 *
 * Scala cromatica DIVERGENTE centrata sulla media UE, non una rampa
 * monocroma min→max: il colore non dice "quanto costa" ma "quanto si
 * discosta dalla media europea", che è un'affermazione invece di un
 * gradiente. Verde sotto la media, ruggine sopra, neutro al centro.
 *
 * Tre aggiunte rispetto alla versione precedente, tutte per lo stesso
 * motivo — rendere leggibile il colore senza doverci passare sopra il
 * mouse:
 *
 *   1. una barra-legenda continua che mostra la rampa vera con i valori
 *      agli estremi e la tacca della media al suo posto proporzionale;
 *   2. tre riquadri fissi sotto la mappa (più economico, Italia, più caro)
 *      che NOMINANO i paesi. L'Italia c'è sempre, anche quando non è un
 *      estremo: è la domanda che si fa chi legge un sito italiano;
 *   3. il selettore benzina/diesel, perché il diesel esisteva già nei dati
 *      ma viveva solo dentro il tooltip.
 *
 * I riquadri non stanno SOPRA la cartografia: i box sovrapposti erano
 * stati tolti apposta perché coprivano i paesi. Stanno sotto, in riga.
 *
 * Accessibilità: il colore non è mai l'unico veicolo. Chi non distingue
 * verde e ruggine legge i tre riquadri nominati e lo scostamento numerico
 * nel tooltip.
 */
export default function EuropeFuelMap({ prices, euAverage }: Props) {
  const [hovered, setHovered] = useState<CountryFuelData | null>(null);
  const [fuel, setFuel] = useState<FuelKey>("petrol");
  const [measure, setMeasure] = useState<MeasureKey>("price");

  // `useId` e non un id fisso: se un domani la pagina montasse due mappe,
  // due <linearGradient> con lo stesso id nello stesso DOM collidono e
  // vincerebbe sempre il primo. È lo stesso inciampo già documentato in
  // PriceHistoryChart.tsx.
  const gradientId = useId();

  const activeMeasure = MEASURES.find((m) => m.key === measure) ?? MEASURES[0];

  /**
   * Il centro della scala divergente.
   *
   * Per il prezzo è la media UE calcolata in page.tsx. Per la quota
   * fiscale NON è la media delle quote dei 27 paesi, ma la quota della
   * media: `(media pompa − media netto) / media pompa`. È la risposta alla
   * domanda "del litro medio europeo, quanto è tassa", mentre la media
   * delle percentuali risponde a "qual è la quota del paese tipico" —
   * pesano Malta e la Germania allo stesso modo, e sono numeri diversi.
   * La prima è quella che la riga sotto la mappa afferma.
   */
  const average = useMemo(() => {
    if (measure === "price") return euAverage[fuel];
    const gross = euAverage[fuel];
    const net = fuel === "petrol" ? euAverage.petrolNet : euAverage.dieselNet;
    if (gross === null || net === null || gross <= 0) return null;
    return ((gross - net) / gross) * 100;
  }, [euAverage, fuel, measure]);

  const stats = useMemo(() => {
    const withValue = prices
      .map((p) => ({ country: p, value: metricValue(p, fuel, measure) }))
      .filter((r): r is { country: CountryFuelData; value: number } =>
        r.value !== null
      );

    // Senza dati non si calcolano estremi: `Math.min()` su un array vuoto
    // restituisce `Infinity`, che finiva stampato in pagina come "Infinity
    // €/L". Un caso raro — la mappa si monta solo se ci sono paesi — ma
    // non impossibile, per esempio se una fonte pubblicasse un bollettino
    // con la sola colonna diesel.
    if (withValue.length === 0) return null;

    const sorted = [...withValue].sort((a, b) => a.value - b.value);
    return {
      cheapest: sorted[0],
      dearest: sorted[sorted.length - 1],
      min: sorted[0].value,
      max: sorted[sorted.length - 1].value,
      byCountry: new Map(withValue.map((r) => [r.country.countryName, r.value])),
    };
  }, [prices, fuel, measure]);

  const dataByCountry = useMemo(
    () => new Map(prices.map((p) => [p.countryName, p])),
    [prices]
  );

  const span = stats ? stats.max - stats.min : 0;
  const italy = prices.find((p) => p.countryName === "Italy") ?? null;
  const italyValue = italy ? metricValue(italy, fuel, measure) : null;

  return (
    <div className="relative">
      {/* Selettore della metrica. Chip e non un <select>: sono due voci, e
          un menu a tendina nasconderebbe l'esistenza della seconda. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Chips
          label="Carburante"
          options={FUELS}
          active={fuel}
          onSelect={setFuel}
        />
        <Chips
          label="Misura"
          options={MEASURES}
          active={measure}
          onSelect={setMeasure}
        />
      </div>

      <ComposableMap
        projection="geoAzimuthalEqualArea"
        // Inquadratura stretta sull'Europa con dati: centro a 13°E / 50°N,
        // scala 900, viewBox 800×490. Riduce il vuoto grigio a est (Russia,
        // Ucraina, Turchia — paesi senza dati) e l'Atlantico, tenendo dentro
        // Portogallo, Finlandia, Grecia. Cipro e Malta restano vicini al
        // bordo sud-est: visibili trascinando, e comunque nominati nei
        // riquadri degli estremi quando lo sono.
        projectionConfig={{ rotate: [-13, -50, 0], scale: 900 }}
        width={800}
        height={490}
        style={{ width: "100%", height: "auto" }}
      >
        <ZoomableGroup center={[0, 0]} zoom={1} minZoom={1} maxZoom={5}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const name = geo.properties.name as string;
                const data = dataByCountry.get(name);
                const value = stats?.byCountry.get(name) ?? null;

                // Il bordo evidenziato è pilotato dallo stato React
                // `hovered`, NON dallo pseudo-stato CSS :hover di
                // react-simple-maps. Su touch il :hover nativo resta
                // "incollato" all'ultimo elemento toccato: il tooltip si
                // aggiornava ma il bordo no. Usando `isHovered` in tutti e
                // tre gli stati il risultato è identico qualunque
                // pseudo-stato applichi il browser.
                const isHovered = hovered?.countryName === name;
                const isItaly = name === "Italy";

                const fillColor =
                  value === null || average === null
                    ? NO_DATA_FILL
                    : divergingColor(value, average, span);

                // Tre livelli di bordo, in ordine di priorità. L'Italia ha
                // un contorno permanente più marcato anche quando nessuno
                // la sta sfiorando: su un sito italiano è il paese che si
                // cerca per primo, e trovarlo non dovrebbe richiedere di
                // passare il mouse su mezza Europa.
                const stroke = isHovered
                  ? INK_HEX
                  : isItaly
                    ? "var(--color-system-accent)"
                    : "#ffffff";
                const strokeWidth = isHovered ? 1.6 : isItaly ? 1 : 0.5;

                const shape = {
                  fill: fillColor,
                  stroke,
                  strokeWidth,
                  strokeLinejoin: "round" as const,
                  outline: "none",
                  cursor: data ? "pointer" : "default",
                };

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={() => {
                      if (data) setHovered(data);
                    }}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      default: shape,
                      hover: shape,
                      pressed: { fill: fillColor, outline: "none" },
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {hovered && (
        <div className="pointer-events-none absolute left-4 top-16 rounded-md border border-system-border bg-system-surface px-3 py-2 text-sm shadow-md">
          <div className="font-medium">
            {localizedCountryName(hovered.countryName)}
          </div>
          {/* Il tooltip mostra sempre TUTTE e quattro le combinazioni, con
              in evidenza quella attiva. È il punto in cui il costo di
              mostrare più dati è zero — sono già in memoria — e il
              guadagno è che si legge "2,017 €/L di cui il 51,4% è tassa"
              senza dover cambiare vista. */}
          {FUELS.map((f) =>
            MEASURES.map((m) => {
              const v = metricValue(hovered, f.key, m.key);
              if (v === null) return null;
              const isActive = f.key === fuel && m.key === measure;
              return (
                <div
                  key={`${f.key}-${m.key}`}
                  className={`mt-1 flex items-center justify-between gap-4 ${
                    isActive ? "text-system-ink" : "text-system-ink-muted"
                  }`}
                >
                  <span className="text-xs">
                    {f.label}
                    {m.key === "taxShare" ? " · imposte" : ""}
                  </span>
                  <span className="font-mono tabular-nums">
                    {m.format(v)} {m.unit}
                  </span>
                </div>
              );
            })
          )}
          {(() => {
            const v = metricValue(hovered, fuel, measure);
            if (v === null || average === null) return null;
            // Millesimi per i prezzi, punti percentuali per le quote: dire
            // "+177 millesimi" di una percentuale sarebbe un'unità
            // inventata.
            const delta =
              measure === "price" ? (v - average) * 1000 : v - average;
            const suffisso =
              measure === "price" ? "millesimi" : "punti percentuali";
            return (
              <div className="mt-1 border-t border-system-border-subtle pt-1 text-xs text-system-ink-muted">
                {delta > 0 ? "+" : delta < 0 ? "−" : ""}
                {measure === "price"
                  ? Math.abs(delta).toFixed(0)
                  : Math.abs(delta).toLocaleString("it-IT", {
                      maximumFractionDigits: 1,
                    })}{" "}
                {suffisso} vs media UE
              </div>
            );
          })()}
        </div>
      )}

      {/* Barra-legenda: la rampa vera, non tre etichette testuali. Senza
          questa il lettore vede dei colori e non ha modo di tradurli in
          numeri se non passando il mouse paese per paese.

          È costruita con lo stesso `divergingColor` usato per i paesi, in
          undici tappe: una scala disegnata a mano con altri colori sarebbe
          una legenda che mente appena qualcuno ritocca la formula. */}
      {stats && average !== null && (
        <div className="mt-4">
          <svg
            viewBox="0 0 100 6"
            preserveAspectRatio="none"
            className="h-3 w-full"
            role="img"
            aria-label={`Scala colore: da ${activeMeasure.format(stats.min)} a ${activeMeasure.format(stats.max)} ${activeMeasure.unit}, centro sulla media UE ${activeMeasure.format(average)}`}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
                {Array.from({ length: 11 }, (_, i) => {
                  const t = i / 10;
                  const value = stats.min + (stats.max - stats.min) * t;
                  return (
                    <stop
                      key={i}
                      offset={`${t * 100}%`}
                      stopColor={divergingColor(value, average, span)}
                    />
                  );
                })}
              </linearGradient>
            </defs>
            <rect width="100" height="6" fill={`url(#${gradientId})`} rx="1" />
            {/* Tacca della media, alla sua posizione proporzionale reale e
                non a metà barra: la media quasi mai cade esattamente in
                mezzo fra minimo e massimo, e disegnarla al centro
                racconterebbe una distribuzione simmetrica che non c'è. */}
            {span > 0 && (
              <rect
                x={((average - stats.min) / span) * 100 - 0.25}
                y="-1"
                width="0.5"
                height="8"
                fill={INK_HEX}
              />
            )}
          </svg>
          <div className="mt-1 flex justify-between font-mono text-[11px] text-system-ink-muted">
            <span className="tabular-nums">
              {activeMeasure.format(stats.min)} {activeMeasure.unit}
            </span>
            {/* "media dei 27" e non "media UE" e basta: è una media
                semplice dei paesi, e la Commissione ne pubblica una
                ponderata sui consumi che vale 11 centesimi in più. Dire
                quale si sta guardando è lo stesso principio delle note
                "Fonte:" sotto ogni sezione. */}
            <span className="uppercase tracking-wider">
              media dei 27{" "}
              <span className="tabular-nums text-system-ink">
                {activeMeasure.format(average)} {activeMeasure.unit}
              </span>
            </span>
            <span className="tabular-nums">
              {activeMeasure.format(stats.max)} {activeMeasure.unit}
            </span>
          </div>
        </div>
      )}

      {/* I tre riferimenti nominati. Rispondono senza interazione alle tre
          domande che uno si fa guardando una mappa di prezzi: dove costa
          meno, dove costa di più, e — su un sito italiano — quanto costa
          da noi. L'Italia resta in mezzo anche quando è un estremo: la
          posizione fissa vale più della non-ridondanza. */}
      {stats && (
        <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-system-border bg-system-border sm:grid-cols-3">
          <ExtremeCell
            label="Più economico"
            country={stats.cheapest.country.countryName}
            value={stats.cheapest.value}
            unit={activeMeasure.unit}
            format={activeMeasure.format}
            measure={measure}
            average={average}
            span={span}
          />
          <ExtremeCell
            label="Italia"
            country="Italy"
            value={italyValue}
            unit={activeMeasure.unit}
            format={activeMeasure.format}
            measure={measure}
            average={average}
            span={span}
          />
          <ExtremeCell
            label="Più caro"
            country={stats.dearest.country.countryName}
            value={stats.dearest.value}
            unit={activeMeasure.unit}
            format={activeMeasure.format}
            measure={measure}
            average={average}
            span={span}
          />
        </div>
      )}

      <p className="mt-2 text-xs text-system-ink-muted">
        Scorri con la rotellina per ingrandire, trascina per spostarti. Passa
        il mouse su un paese per i dettagli.
      </p>
    </div>
  );
}

/**
 * Una delle tre celle di riferimento sotto la mappa.
 *
 * Il quadratino di colore a sinistra usa la stessa funzione della mappa:
 * è il ponte che permette di riconoscere sulla cartografia il paese
 * nominato qui, senza cercarlo.
 */
function ExtremeCell({
  label,
  country,
  value,
  unit,
  format,
  measure,
  average,
  span,
}: {
  label: string;
  country: string;
  value: number | null;
  unit: string;
  format: (value: number) => string;
  measure: MeasureKey;
  average: number | null;
  span: number;
}) {
  const swatch =
    value !== null && average !== null
      ? divergingColor(value, average, span)
      : NO_DATA_FILL;

  const delta =
    value !== null && average !== null
      ? measure === "price"
        ? (value - average) * 1000
        : value - average
      : null;

  // Ogni riquadro nominato porta alla pagina di quel paese, quando esiste
  // (i 27 UE — vedi lib/countries.ts). `routeForCountry` torna `null` per un
  // nome fuori registro: in quel caso resta un <div>, non un link rotto.
  const route = routeForCountry(country);
  const content = (
    <>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-system-ink-muted">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 shrink-0 translate-y-px rounded-sm border border-system-border"
          style={{ backgroundColor: swatch }}
        />
        <span className="truncate text-sm text-system-ink">
          {localizedCountryName(country)}
        </span>
        <span className="ml-auto font-mono text-sm tabular-nums text-system-ink">
          {value !== null ? `${format(value)} ${unit}` : "n/d"}
        </span>
      </div>
      {delta !== null && (
        <div className="mt-0.5 text-right font-mono text-[11px] tabular-nums text-system-ink-muted">
          {delta > 0 ? "+" : delta < 0 ? "−" : ""}
          {measure === "price"
            ? Math.abs(delta).toFixed(0)
            : Math.abs(delta).toLocaleString("it-IT", {
                maximumFractionDigits: 1,
              })}{" "}
          {measure === "price" ? "millesimi" : "punti"} vs media
        </div>
      )}
    </>
  );

  if (route) {
    return (
      <Link
        href={`/paese/${route.slug}`}
        className="block bg-system-surface px-3 py-2 transition-colors hover:bg-system-panel"
      >
        {content}
      </Link>
    );
  }
  return <div className="bg-system-surface px-3 py-2">{content}</div>;
}

/**
 * Una fila di chip a selezione singola, con la sua etichetta.
 *
 * Estratta perché ora ce ne sono due e sarebbero state due blocchi
 * identici a meno di un nome. Il generico `<T extends string>` serve a non
 * perdere il tipo: `onSelect` riceve esattamente `FuelKey` o `MeasureKey`,
 * non una stringa qualunque, quindi un refuso nel valore di un'opzione lo
 * prende il compilatore invece della pagina.
 *
 * Chip e non un <select>: le voci sono due per fila, e una tendina
 * nasconderebbe l'esistenza della seconda proprio dove il punto è farla
 * scoprire.
 */
function Chips<T extends string>({
  label,
  options,
  active,
  onSelect,
}: {
  label: string;
  options: ReadonlyArray<{ key: T; label: string }>;
  active: T;
  onSelect: (key: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-system-ink-muted">
        {label}
      </span>
      <div className="flex items-center gap-1.5" role="group" aria-label={label}>
        {options.map((o) => {
          const isActive = o.key === active;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onSelect(o.key)}
              aria-pressed={isActive}
              className={`rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors ${
                isActive
                  ? "border-system-accent bg-system-surface text-system-accent"
                  : "border-system-border text-system-ink-muted hover:border-system-accent hover:text-system-accent"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
