"use client";

import { useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
} from "react-simple-maps";

const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export interface CountryPetrolPrice {
  countryName: string;
  price: number;
}

interface Props {
  prices: CountryPetrolPrice[];
}

function interpolateColor(t: number): string {
  const low = { r: 0xe3, g: 0xf0, b: 0xee };
  const high = { r: 0x0f, g: 0x6b, b: 0x66 };
  const r = Math.round(low.r + (high.r - low.r) * t);
  const g = Math.round(low.g + (high.g - low.g) * t);
  const b = Math.round(low.b + (high.b - low.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

export default function EuropeFuelMap({ prices }: Props) {
  const [hovered, setHovered] = useState<CountryPetrolPrice | null>(null);

  const priceByCountry = new Map(prices.map((p) => [p.countryName, p.price]));

  const values = prices.map((p) => p.price);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return (
    <div className="relative">
      <ComposableMap
        projection="geoAzimuthalEqualArea"
        projectionConfig={{ rotate: [-15, -52, 0], scale: 700 }}
        width={800}
        height={520}
        style={{ width: "100%", height: "auto" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const name = geo.properties.name as string;
              const price = priceByCountry.get(name);
              const t = price !== undefined && max > min
                ? (price - min) / (max - min)
                : null;

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onMouseEnter={() => {
                    if (price !== undefined) setHovered({ countryName: name, price });
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
                      cursor: price !== undefined ? "pointer" : "default",
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
      </ComposableMap>

      {hovered && (
        <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-[#dde1e7] bg-white px-3 py-2 text-sm shadow-sm">
          <div className="font-medium">{hovered.countryName}</div>
          <div className="font-mono tabular-nums text-[#5b6472]">
            {hovered.price.toFixed(3)} EUR/L
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 text-xs text-[#8891a0]">
        <span>Meno caro</span>
        <div
          className="h-2 flex-1 rounded-full"
          style={{
            background: `linear-gradient(to right, ${interpolateColor(0)}, ${interpolateColor(1)})`,
          }}
        />
        <span>Più caro</span>
      </div>
    </div>
  );
}
