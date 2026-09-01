"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, Globe2, Calculator, BarChart3, Fuel } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
}

interface Props {
  /** Ancore alla stessa pagina (sezioni della dashboard) */
  items: NavItem[];
  /** Link ad altre pagine del sito (Metodologia, Glossario) */
  pageLinks: NavItem[];
  githubUrl: string;
}

const ICONS: Record<string, typeof Globe2> = {
  "#mappa": Globe2,
  "#calcolatore": Calculator,
  "#materie-prime": BarChart3,
  "#carburanti": Fuel,
};

export default function MobileNav({ items, pageLinks, githubUrl }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative sm:hidden">
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? "Chiudi menu" : "Apri menu"}
        aria-expanded={open}
        className="flex items-center justify-center rounded-md border border-system-border p-2 text-system-ink-secondary transition-colors hover:border-system-accent hover:text-system-accent"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      {open && (
        /* Stesso trattamento "tab bar connessa" del menu desktop, ma in
           verticale: un solo contenitore con bordo esterno unico e divisori
           sottili (border-t, first:border-t-0) fra le voci invece di
           spaziatura vuota. `overflow-hidden` ritaglia l'hover agli angoli
           arrotondati; niente padding verticale sul contenitore così i
           divisori arrivano ai bordi. Hover coerente col desktop
           (bg-system-bg + testo accent). */
        <div className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-lg border border-system-border bg-system-surface shadow-lg">
          {items.map(({ href, label }) => {
            const Icon = ICONS[href] ?? Globe2;
            return (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 border-t border-system-border px-4 py-2.5 text-sm text-system-ink-secondary transition-colors first:border-t-0 hover:bg-system-bg hover:text-system-accent"
              >
                <Icon size={15} />
                {label}
              </a>
            );
          })}
          {pageLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block border-t border-system-border px-4 py-2.5 text-sm text-system-ink-secondary transition-colors hover:bg-system-bg hover:text-system-accent"
            >
              {label}
            </Link>
          ))}
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block border-t border-system-border px-4 py-2.5 text-sm text-system-ink-secondary transition-colors hover:bg-system-bg hover:text-system-accent"
          >
            Codice sorgente
          </a>
        </div>
      )}
    </div>
  );
}
