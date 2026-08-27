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
        className="flex items-center justify-center rounded-md border border-[#dde1e7] p-2 text-[#5b6472] transition-colors hover:border-[#0f6b66] hover:text-[#0f6b66]"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-lg border border-[#dde1e7] bg-white py-2 shadow-lg">
          {items.map(({ href, label }) => {
            const Icon = ICONS[href] ?? Globe2;
            return (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#5b6472] transition-colors hover:bg-[#f7f8fa] hover:text-[#0f6b66]"
              >
                <Icon size={15} />
                {label}
              </a>
            );
          })}
          <div className="my-1 border-t border-[#eef0f3]" />
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-[#5b6472] transition-colors hover:bg-[#f7f8fa] hover:text-[#0f6b66]"
          >
            Codice sorgente
          </a>
        </div>
      )}
    </div>
  );
}
