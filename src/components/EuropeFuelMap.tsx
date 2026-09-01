"use client";

import { useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";

const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";

export interface CountryFuelData {
  countryName: string;
  petrol: number | null;
  diesel: number | null;
}

interface Props {
  prices: CountryFuelData[];
  euAveragePetrol: number | null;
}

// Hex reali dei token system-* (vedi globals.css @theme) — lo stile SVG di
// react-simple-maps vuole un colore risolto, non può leggere var(--color-*)
// in modo affidabile su tutti i browser per il fill.
const NEUTRAL_HEX = "#e2e4e9"; // system-border — centro della scala (alla media UE)
const ACCENT_HEX = "#0f6b66"; // system-accent (verde) — sotto la media
const ACCENT_DOWN_HEX = "#b34324"; // system-accent-down (ruggine) — sopra la media
const NO_DATA_FILL = "#eef0f3"; // system-border-subtle — fallback "nessun dato".
// INVARIATO rispetto a prima: deliberatamente diverso da NEUTRAL_HEX
// (system-border, il centro della scala), altrimenti "nessun dato" e
// "esattamente alla media UE" sarebbero visivamente indistinguibili sulla
// mappa.

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
 * Mappa interattiva d'Europa colorata per prezzo benzina (react-simple-maps,
 * atlante 50m). Zoom con rotellina, pan trascinando; hover su un paese apre
 * un tooltip col dettaglio benzina/diesel e lo scostamento dalla media UE.
 *
 * Scala cromatica DIVERGENTE centrata sulla media UE, non una rampa
 * monocroma min→max: ogni paese riceve uno scarto FIRMATO dalla media,
 * normalizzato sul range min-max visibile:
 *
 *   scarto = (prezzo_paese - media_UE) / (max - min)
 *
 * negativo = sotto media (più conveniente, verde `system-accent`),
 * positivo = sopra media (più caro, ruggine `system-accent-down`). Il
 * colore neutro (`system-border`) è il CENTRO della scala, non il minimo.
 * L'intensità del colore è `|scarto| * 2` clampata a 1, così un solo
 * outlier estremo non schiaccia la scala per tutti gli altri paesi (per
 * il dettaglio riga per riga vedi i commenti su `scarto`/`intensita` più
 * sotto, dentro il render). Se manca `euAveragePetrol` o il prezzo del
 * paese, non c'è un centro su cui posizionare lo scarto: il paese cade nel
 * fallback `NO_DATA_FILL`, indistinguibile a vista da "nessun dato" — è
 * corretto, perché per quel paese la scala divergente non è calcolabile.
 */
export default function EuropeFuelMap({ prices, euAveragePetrol }: Props) {
  const [hovered, setHovered] = useState<CountryFuelData | null>(null);

  const dataByCountry = new Map(prices.map((p) => [p.countryName, p]));

  const withPetrol = prices.filter(
    (p): p is CountryFuelData & { petrol: number } => p.petrol !== null
  );
  const petrolValues = withPetrol.map((p) => p.petrol);
  const min = Math.min(...petrolValues);
  const max = Math.max(...petrolValues);

  return (
    <div className="relative">
      <ComposableMap
        projection="geoAzimuthalEqualArea"
        // Inquadratura più stretta sull'Europa con dati: centro spostato a
        // 13°E / 50°N e scala 900 (era rotate [-15,-52], scale 700),
        // viewBox più basso (490 invece di 520). Riduce il vuoto grigio a
        // est (Russia, Ucraina, Turchia — paesi senza dati) e l'oceano
        // atlantico, tenendo dentro Portogallo, Finlandia, Grecia. Cipro e
        // Malta restano vicini al bordo sud-est: visibili trascinando la
        // mappa, e Malta compare comunque nelle etichette degli estremi.
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
                // Il bordo evidenziato è pilotato dallo stato React `hovered`
                // (lo stesso che alimenta il tooltip), NON dallo pseudo-stato
                // CSS :hover di react-simple-maps. Su touch il :hover nativo
                // resta "incollato" all'ultimo elemento toccato: il tooltip
                // (stato React) si aggiornava ma il bordo evidenziato no. Usando
                // `isHovered` sia in `default` che in `hover` il risultato è
                // identico qualunque pseudo-stato il browser applichi.
                const isHovered = hovered?.countryName === name;

                // Scarto firmato dalla media UE, normalizzato sul range
                // min-max visibile: negativo = sotto la media (più
                // conveniente, verde), positivo = sopra (più caro, ruggine).
                // Il range min-max resta il riferimento di scala, ma il
                // centro della rampa cromatica è la media, non il minimo.
                // Richiede euAveragePetrol: se manca (fonte non ancora
                // disponibile), il paese cade nel fallback NO_DATA_FILL
                // insieme ai paesi senza prezzo — non c'è un centro su cui
                // posizionarlo.
                const scarto =
                  data?.petrol !== undefined &&
                  data?.petrol !== null &&
                  euAveragePetrol !== null &&
                  max > min
                    ? (data.petrol - euAveragePetrol) / (max - min)
                    : null;

                // Quanto è "acceso" il colore: clampato a 1 così un outlier
                // estremo non produce un colore fuori scala rispetto agli
                // altri paesi. Fattore di partenza *2: un paese a metà tra
                // la media e un estremo del range arriva già a saturazione
                // piena — se in pagina sembra scalare troppo in fretta o
                // troppo piano, va ricalibrato qui.
                const intensita =
                  scarto !== null ? Math.min(Math.abs(scarto) * 2, 1) : null;

                const fillColor =
                  scarto === null || intensita === null
                    ? NO_DATA_FILL
                    : scarto < 0
                      ? interpolateColor(NEUTRAL_HEX, ACCENT_HEX, intensita)
                      : interpolateColor(NEUTRAL_HEX, ACCENT_DOWN_HEX, intensita);

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={() => {
                      if (data) setHovered(data);
                    }}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      default: {
                        fill: fillColor,
                        stroke: isHovered
                          ? "var(--color-system-accent)"
                          : "#ffffff",
                        strokeWidth: isHovered ? 1 : 0.5,
                        outline: "none",
                        cursor: data ? "pointer" : "default",
                      },
                      hover: {
                        fill: fillColor,
                        stroke: isHovered
                          ? "var(--color-system-accent)"
                          : "#ffffff",
                        strokeWidth: isHovered ? 1 : 0.5,
                        outline: "none",
                        cursor: data ? "pointer" : "default",
                      },
                      pressed: {
                        fill: fillColor,
                        outline: "none",
                      },
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {hovered && (
        <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-system-border bg-system-surface px-3 py-2 text-sm shadow-md">
          <div className="font-medium">{hovered.countryName}</div>
          {hovered.petrol !== null && (
            <div className="mt-1 flex items-center justify-between gap-4">
              <span className="text-xs text-system-ink-muted">Benzina</span>
              <span className="font-mono tabular-nums">
                {hovered.petrol.toFixed(3)} €/L
              </span>
            </div>
          )}
          {hovered.diesel !== null && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-system-ink-muted">Diesel</span>
              <span className="font-mono tabular-nums">
                {hovered.diesel.toFixed(3)} €/L
              </span>
            </div>
          )}
          {hovered.petrol !== null && euAveragePetrol !== null && (
            <div className="mt-1 border-t border-system-border-subtle pt-1 text-xs text-system-ink-muted">
              {hovered.petrol > euAveragePetrol ? "+" : ""}
              {((hovered.petrol - euAveragePetrol) * 1000).toFixed(0)}{" "}
              millesimi vs media UE
            </div>
          )}
        </div>
      )}

      {/* Riga sintetica coi 3 riferimenti della scala divergente (min,
          centro=media UE, max) — sostituisce la barra sfumata min/max di
          prima, che descriveva una rampa monocroma non più in uso. Divisori
          border-l invece di un glifo "|": stesso pattern già usato altrove
          nel progetto (nav "tab bar", colonne del footer). */}
      <div className="mt-3 flex items-center justify-between text-xs text-system-ink-muted">
        <span className="font-mono">
          <span className="uppercase tracking-wider">Minimo</span>{" "}
          <span className="tabular-nums text-system-ink">{min.toFixed(2)} €/L</span>
        </span>
        <span className="border-l border-system-border-subtle pl-3 font-mono">
          <span className="uppercase tracking-wider">Media UE</span>{" "}
          <span className="tabular-nums text-system-ink">
            {euAveragePetrol !== null ? `${euAveragePetrol.toFixed(2)} €/L` : "n/d"}
          </span>
        </span>
        <span className="border-l border-system-border-subtle pl-3 font-mono">
          <span className="uppercase tracking-wider">Massimo</span>{" "}
          <span className="tabular-nums text-system-ink">{max.toFixed(2)} €/L</span>
        </span>
      </div>
      <p className="mt-2 text-xs text-system-ink-muted">
        Scorri con la rotellina per ingrandire, trascina per spostarti.
        Passa il mouse su un paese per i dettagli.
      </p>
    </div>
  );
}
