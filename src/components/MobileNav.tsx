"use client";

import { useState } from "react";
import { Menu, X, Globe2, Calculator, BarChart3, Fuel } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
}

interface Props {
  items: NavItem[];
  githubUrl: string;
}

const ICONS: Record<string, typeof Globe2> = {
  "#mappa": Globe2,
  "#calcolatore": Calculator,
  "#materie-prime": BarChart3,
  "#carburanti": Fuel,
};

export default function MobileNav({ items, githubUrl }: Props) {
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
        <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-lg border border-system-border bg-white py-2 shadow-lg">
          {items.map(({ href, label }) => {
            const Icon = ICONS[href] ?? Globe2;
            return (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-system-ink-secondary transition-colors hover:bg-system-bg hover:text-system-accent"
              >
                <Icon size={15} />
                {label}
              </a>
            );
          })}
          <div className="my-1 border-t border-system-border-subtle" />
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-system-ink-secondary transition-colors hover:bg-system-bg hover:text-system-accent"
          >
            Codice sorgente
          </a>
        </div>
      )}
    </div>
  );
}
