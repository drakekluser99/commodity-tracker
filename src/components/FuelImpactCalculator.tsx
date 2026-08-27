"use client";

import { useState } from "react";

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

export default function FuelImpactCalculator({ europe, us }: Props) {
  const [tankLiters, setTankLiters] = useState(DEFAULT_CAR_TANK_LITERS);
  const [truckConsumption, setTruckConsumption] = useState(
    DEFAULT_TRUCK_CONSUMPTION
  );

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
            value={tankLiters}
            onChange={(e) => setTankLiters(Number(e.target.value) || 0)}
            className="mt-1 w-full rounded-md border border-[#dde1e7] px-3 py-2 font-mono tabular-nums focus:border-[#0f6b66] focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-[#5b6472]">
            Consumo camion (litri / 100 km)
          </span>
          <input
            type="number"
            min={1}
            max={200}
            value={truckConsumption}
            onChange={(e) => setTruckConsumption(Number(e.target.value) || 0)}
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

            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-sm text-[#5b6472]">
                🚗 Pieno auto ({tankLiters} L)
              </span>
              <span className="font-mono text-lg font-semibold tabular-nums">
                {data.petrol !== null
                  ? formatMoney(data.petrol * tankLiters, data.currency)
                  : "—"}
              </span>
            </div>

            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-sm text-[#5b6472]">
                🚛 Camion / 100 km
              </span>
              <span className="font-mono text-lg font-semibold tabular-nums">
                {data.diesel !== null
                  ? formatMoney(data.diesel * truckConsumption, data.currency)
                  : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[#8891a0]">
        Stima approssimativa basata sui prezzi medi nazionali più recenti.
        Il consumo reale varia molto in base al veicolo, al carico
        trasportato e allo stile di guida — questi numeri servono a dare
        un ordine di grandezza, non un valore preciso. Europa e USA sono
        mostrati nella rispettiva valuta originale, senza conversione:
        un confronto diretto EUR/USD richiederebbe un tasso di cambio
        aggiornato, che questo calcolatore non applica ancora.
      </p>
    </div>
  );
}
