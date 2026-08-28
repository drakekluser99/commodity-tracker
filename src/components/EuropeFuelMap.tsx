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

  const petrolValues = prices
    .map((p) => p.petrol)
    .filter((v): v is number => v !== null);
  const min = Math.min(...petrolValues);
  const max = Math.max(...petrolValues);

  return (
    <div className="relative">
      <ComposableMap
        projection="geoAzimuthalEqualArea"
        projectionConfig={{ rotate: [-15, -52, 0], scale: 700 }}
        width={800}
        height={520}
        style={{ width: "100%", height: "auto" }}
      >
        <ZoomableGroup center={[0, 0]} zoom={1} minZoom={1} maxZoom={5}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const name = geo.properties.name as string;
                const data = dataByCountry.get(name);
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
                        stroke: "#ffffff",
                        strokeWidth: 0.5,
                        outline: "none",
                      },
                      hover: {
                        fill: t !== null ? interpolateColor(t) : "#eef0f3",
                        stroke: "#14181f",
                        strokeWidth: 1,
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
