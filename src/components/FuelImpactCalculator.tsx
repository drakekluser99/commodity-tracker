"use client";

import { useState } from "react";
import { Car, Truck } from "lucide-react";

export interface RegionFuelAverage {
  petrol: number | null;
  diesel: number | null;
  currency: string;
}

interface Props {
  europe: RegionFuelAverage;
  us: RegionFuelAverage;
}

const DEFAULT_CAR_TANK_LITERS = 50;
const DEFAULT_TRUCK_CONSUMPTION = 33;

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPricePerLiter(value: number, currency: string): string {
  const symbol = currency === "EUR" ? "€" : "$";
  return `${value.toFixed(3)} ${symbol}/L`;
}

function useNumericField(defaultValue: number) {
  const [raw, setRaw] = useState(String(defaultValue));
  const numericValue = raw === "" ? 0 : Number(raw) || 0;
  return { raw, setRaw, numericValue };
}

export default function FuelImpactCalculator({ europe, us }: Props) {
  const tank = useNumericField(DEFAULT_CAR_TANK_LITERS);
  const truck = useNumericField(DEFAULT_TRUCK_CONSUMPTION);

  const regions = [
    { label: "Europa (media UE)", data: europe },
    { label: "Stati Uniti", data: us },
  ];

  return (
    <div className="rounded-lg border border-[#dde1e7] bg-white p-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-[#5b6472]">
            Capacità serbatoio auto (litri)
          </span>
          <input
            type="number"
            min={1}
            max={200}
            value={tank.raw}
            onChange={(e) => tank.setRaw(e.target.value)}
            placeholder="es. 50"
            className="mt-1 w-full rounded-md border border-[#dde1e7] px-3 py-2 font-mono tabular-nums focus:border-[#0f6b66] focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-[#5b6472]">
            Consumo camion (litri ogni 100 km)
          </span>
          <input
            type="number"
            min={1}
            max={200}
            value={truck.raw}
            onChange={(e) => truck.setRaw(e.target.value)}
            placeholder="es. 33"
            className="mt-1 w-full rounded-md border border-[#dde1e7] px-3 py-2 font-mono tabular-nums focus:border-[#0f6b66] focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {regions.map(({ label, data }) => (
          <div
            key={label}
            className="rounded-lg border border-[#eef0f3] bg-[#f7f8fa] p-4"
          >
            <div className="text-sm font-semibold">{label}</div>
            <div className="mt-0.5 text-xs text-[#8891a0]">
              {data.petrol !== null && (
                <>Benzina {formatPricePerLiter(data.petrol, data.currency)}</>
              )}
              {data.petrol !== null && data.diesel !== null && " · "}
              {data.diesel !== null && (
                <>Diesel {formatPricePerLiter(data.diesel, data.currency)}</>
              )}
            </div>

            <div className="mt-4 flex items-baseline justify-between">
              <span className="flex items-center gap-1.5 text-sm text-[#5b6472]">
                <Car size={14} /> Pieno auto ({tank.numericValue} L)
              </span>
              <span className="font-mono text-lg font-semibold tabular-nums">
                {data.petrol !== null
                  ? formatMoney(data.petrol * tank.numericValue, data.currency)
                  : "—"}
              </span>
            </div>

            <div className="mt-2 flex items-baseline justify-between">
              <span className="flex items-center gap-1.5 text-sm text-[#5b6472]">
                <Truck size={14} /> Costo carburante ogni 100 km guidati da un camion
              </span>
              <span className="font-mono text-lg font-semibold tabular-nums">
                {data.diesel !== null
                  ? formatMoney(data.diesel * truck.numericValue, data.currency)
                  : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2 text-xs leading-relaxed text-[#8891a0]">
        <p>
          <strong className="text-[#5b6472]">Perché i 100 km del camion contano:</strong>{" "}
          questo è il costo di carburante che un&apos;azienda di trasporti
          paga per ogni 100 km percorsi trasportando merci — cibo,
          materiali, prodotti. Quando il diesel sale, questo costo si
          riflette (in parte) sul prezzo finale di ciò che arriva nei
          negozi.
        </p>
        <p>
          Stima approssimativa basata sui prezzi medi nazionali più
          recenti. Il consumo reale varia molto in base al veicolo, al
          carico trasportato e allo stile di guida — questi numeri danno
          un ordine di grandezza, non un valore preciso. Europa e USA
          sono mostrati nella rispettiva valuta originale, senza
          conversione: un confronto diretto EUR/USD richiederebbe un
          tasso di cambio aggiornato, che questo calcolatore non applica
          ancora.
        </p>
      </div>
    </div>
  );
}
