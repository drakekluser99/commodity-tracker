"use client";

import { useState, type ReactNode } from "react";
import { Car, Truck } from "lucide-react";
import { formatFuelPrice, currencySymbol } from "@/lib/format";

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
    // Senza questo, per USD in locale it-IT ICU stampa il codice ISO
    // ("53,96 USD") invece del simbolo. `narrowSymbol` forza "$" / "€",
    // coerente con formatPricePerLiter qui sotto.
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPricePerLiter(value: number, currency: string): string {
  // Stesso layer di formattazione delle tabelle (separatori it-IT).
  return `${formatFuelPrice(value)} ${currencySymbol(currency)}/L`;
}

function useNumericField(defaultValue: number) {
  const [raw, setRaw] = useState(String(defaultValue));
  const numericValue = raw === "" ? 0 : Number(raw) || 0;
  return { raw, setRaw, numericValue };
}

/**
 * Calcolatore d'impatto costi carburante: Europa (media UE) vs Stati Uniti,
 * fianco a fianco, ciascuna regione nella propria valuta originale.
 *
 * NON converte EUR↔USD: un tasso di cambio aggiornato non è ancora
 * applicato (vedi nota nel testo sotto la tabella), quindi nessuna cella
 * è evidenziata come "più conveniente" tra le due regioni — sarebbe un
 * confronto fuorviante tra valute diverse. Confronta solo entro la stessa
 * riga/colonna (es. benzina Europa vs benzina Europa nel tempo), non tra
 * colonne.
 *
 * Righe della tabella: prezzo benzina/diesel (dato grezzo) e due metriche
 * derivate, evidenziate (`strong: true`) perché pensate per essere lette
 * isolatamente — "pieno auto" (prezzo benzina × capacità serbatoio,
 * editabile dall'utente, default 50L) e "costo carburante/100km camion"
 * (prezzo diesel × consumo, editabile, default 33L/100km).
 */
export default function FuelImpactCalculator({ europe, us }: Props) {
  const tank = useNumericField(DEFAULT_CAR_TANK_LITERS);
  const truck = useNumericField(DEFAULT_TRUCK_CONSUMPTION);

  // Colonne della tabella: una per regione. La riga d'intestazione le nomina.
  const regions = [
    { key: "eu", label: "Europa (media UE)", data: europe },
    { key: "us", label: "Stati Uniti", data: us },
  ];

  // Righe della tabella comparativa: ogni riga è una metrica, ogni colonna
  // una regione, così il confronto Europa/USA si legge sulla stessa riga
  // invece di saltare tra due box separati. `value` riceve i dati di una
  // regione e restituisce la cella già formattata nella sua valuta (o "—"
  // se manca il prezzo necessario a calcolarla).
  //
  // Nessuna evidenziazione del "valore più conveniente": Europa è in EUR e
  // USA in USD senza conversione, quindi marcare un numero come "più basso"
  // sarebbe un confronto fuorviante tra valute diverse (vedi nota sotto).
  const rows: {
    key: string;
    label: string;
    icon?: ReactNode;
    strong?: boolean;
    value: (data: RegionFuelAverage) => string;
  }[] = [
    {
      key: "petrol",
      label: "Prezzo benzina",
      value: (d) =>
        d.petrol !== null ? formatPricePerLiter(d.petrol, d.currency) : "—",
    },
    {
      key: "diesel",
      label: "Prezzo diesel",
      value: (d) =>
        d.diesel !== null ? formatPricePerLiter(d.diesel, d.currency) : "—",
    },
    {
      key: "tank",
      label: `Pieno auto (${tank.numericValue} L)`,
      icon: <Car size={14} />,
      strong: true,
      value: (d) =>
        d.petrol !== null
          ? formatMoney(d.petrol * tank.numericValue, d.currency)
          : "—",
    },
    {
      key: "truck",
      label: "Costo carburante / 100 km (camion)",
      icon: <Truck size={14} />,
      strong: true,
      value: (d) =>
        d.diesel !== null
          ? formatMoney(d.diesel * truck.numericValue, d.currency)
          : "—",
    },
  ];

  return (
    <div className="rounded-lg border border-system-border bg-system-surface p-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-system-ink-secondary">
            Capacità serbatoio auto (litri)
          </span>
          <input
            type="number"
            min={1}
            max={200}
            value={tank.raw}
            onChange={(e) => tank.setRaw(e.target.value)}
            placeholder="es. 50"
            className="mt-1 w-full rounded-md border border-system-border px-3 py-2 font-mono tabular-nums focus:border-system-accent focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-system-ink-secondary">
            Consumo camion (litri ogni 100 km)
          </span>
          <input
            type="number"
            min={1}
            max={200}
            value={truck.raw}
            onChange={(e) => truck.setRaw(e.target.value)}
            placeholder="es. 33"
            className="mt-1 w-full rounded-md border border-system-border px-3 py-2 font-mono tabular-nums focus:border-system-accent focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[440px] text-sm">
          <thead>
            {/* Intestazioni in stile terminale, come le altre tabelle del sito. */}
            <tr className="border-b border-system-border text-left font-mono text-xs uppercase tracking-wider text-system-ink-secondary">
              <th className="py-3 pr-4 font-medium">Metrica</th>
              {regions.map((r) => (
                <th key={r.key} className="px-4 py-3 text-right font-medium">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className="border-b border-system-border-subtle last:border-0"
              >
                <td className="py-3 pr-4 text-system-ink-secondary">
                  <span className="flex items-center gap-1.5">
                    {row.icon}
                    {row.label}
                  </span>
                </td>
                {regions.map((r) => (
                  <td
                    key={r.key}
                    className={`px-4 py-3 text-right font-mono tabular-nums ${
                      row.strong
                        ? "text-base font-semibold text-system-ink"
                        : "text-system-ink-secondary"
                    }`}
                  >
                    {row.value(r.data)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 space-y-2 text-xs leading-relaxed text-system-ink-muted">
        <p>
          <strong className="text-system-ink-secondary">Perché i 100 km del camion contano:</strong>{" "}
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
