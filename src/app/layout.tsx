import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// IBM Plex Sans + Mono: una superfamiglia disegnata insieme, quindi le
// cifre monospazio della tabella e il testo che le descrive condividono
// proporzioni e "colore" tipografico. Vedi la nota in globals.css.
//
// I pesi sono dichiarati esplicitamente: IBM Plex non è una variable font
// su Google Fonts, quindi senza `weight` next/font non sa quali file
// scaricare. Ne prendiamo solo quattro (400/500/600 per il sans, 400/500
// per il mono) invece dell'intera famiglia: ogni peso in più è un file in
// più da scaricare al primo caricamento.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://commodity-tracker-one-delta.vercel.app"),
  title: "Mercuriale · Prezzi materie prime e carburanti",
  description:
    "Prezzi di materie prime globali (petrolio, gas, metalli, agricole) e carburanti al consumo per regione. Dati pubblici, con fonte, data e limiti dichiarati; nessuna garanzia di accuratezza.",
  openGraph: {
    title: "Mercuriale",
    description:
      "Prezzi di materie prime e carburanti — dati pubblici, con fonte, data e limiti.",
    url: "https://commodity-tracker-one-delta.vercel.app",
    siteName: "Mercuriale",
    locale: "it_IT",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Mercuriale",
    description: "Prezzi di materie prime e carburanti. Fonte, data e limiti inclusi.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
