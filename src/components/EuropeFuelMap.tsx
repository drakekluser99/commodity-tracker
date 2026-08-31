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

function interpolateColor(t: number): string {
  const low = { r: 0xe3, g: 0xf0, b: 0xee };
  const high = { r: 0x0f, g: 0x6b, b: 0x66 };
  const r = Math.round(low.r + (high.r - low.r) * t);
  const g = Math.round(low.g + (high.g - low.g) * t);
  const b = Math.round(low.b + (high.b - low.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

export default function EuropeFuelMap({ prices, euAveragePetrol }: Props) {
  const [hovered, setHovered] = useState<CountryFuelData | null>(null);

  const dataByCountry = new Map(prices.map((p) => [p.countryName, p]));

  const withPetrol = prices.filter(
    (p): p is CountryFuelData & { petrol: number } => p.petrol !== null
  );
  const petrolValues = withPetrol.map((p) => p.petrol);
  const min = Math.min(...petrolValues);
  const max = Math.max(...petrolValues);

  // Estremi calcolati dai dati, mostrati come etichette fisse sulla mappa
  // (non solo nel tooltip al passaggio del mouse): sono l'informazione che
  // l'utente cerca per prima. `reduce` invece di sort per non allocare un
  // nuovo array.
  const cheapest = withPetrol.reduce<(CountryFuelData & { petrol: number }) | null>(
    (best, p) => (best === null || p.petrol < best.petrol ? p : best),
    null
  );
  const priciest = withPetrol.reduce<(CountryFuelData & { petrol: number }) | null>(
    (best, p) => (best === null || p.petrol > best.petrol ? p : best),
    null
  );

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
                const t =
                  data?.petrol !== undefined &&
                  data?.petrol !== null &&
                  max > min
                    ? (data.petrol - min) / (max - min)
                    : null;

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
                        fill: t !== null ? interpolateColor(t) : "#eef0f3",
                        stroke: isHovered
                          ? "var(--color-system-accent)"
                          : "#ffffff",
                        strokeWidth: isHovered ? 1 : 0.5,
                        outline: "none",
                        cursor: data ? "pointer" : "default",
                      },
                      hover: {
                        fill: t !== null ? interpolateColor(t) : "#eef0f3",
                        stroke: isHovered
                          ? "var(--color-system-accent)"
                          : "#ffffff",
                        strokeWidth: isHovered ? 1 : 0.5,
                        outline: "none",
                        cursor: data ? "pointer" : "default",
                      },
                      pressed: {
                        fill: t !== null ? interpolateColor(t) : "#eef0f3",
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

      {/* Etichette fisse con gli estremi, in alto a destra (il tooltip
          hover sta in alto a sinistra, così non si sovrappongono). */}
      {cheapest && priciest && (
        <div className="pointer-events-none absolute right-3 top-3 flex flex-col gap-1.5 text-xs">
          <div className="rounded-md border border-system-border bg-white/90 px-2.5 py-1.5 shadow-sm backdrop-blur-sm">
            <div className="font-mono uppercase tracking-wider text-system-ink-muted">
              Più economico
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-3">
              <span className="font-medium text-system-ink">
                {cheapest.countryName}
              </span>
              <span className="font-mono tabular-nums text-system-accent">
                {cheapest.petrol.toFixed(3)} €/L
              </span>
            </div>
          </div>
          <div className="rounded-md border border-system-border bg-white/90 px-2.5 py-1.5 shadow-sm backdrop-blur-sm">
            <div className="font-mono uppercase tracking-wider text-system-ink-muted">
              Più caro
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-3">
              <span className="font-medium text-system-ink">
                {priciest.countryName}
              </span>
              <span className="font-mono tabular-nums text-system-accent-down">
                {priciest.petrol.toFixed(3)} €/L
              </span>
            </div>
          </div>
        </div>
      )}

      {hovered && (
        <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-system-border bg-white px-3 py-2 text-sm shadow-md">
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

      <div className="mt-3 flex items-center gap-2 text-xs text-system-ink-muted">
        <span className="font-mono">{min.toFixed(2)} €/L</span>
        <div
          className="h-2 flex-1 rounded-full"
          style={{
            background: `linear-gradient(to right, ${interpolateColor(0)}, ${interpolateColor(1)})`,
          }}
        />
        <span className="font-mono">{max.toFixed(2)} €/L</span>
      </div>
      <p className="mt-2 text-xs text-system-ink-muted">
        Scorri con la rotellina per ingrandire, trascina per spostarti.
        Passa il mouse su un paese per i dettagli.
      </p>
    </div>
  );
}
