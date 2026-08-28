import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://commodity-tracker-one-delta.vercel.app"),
  title: "Prezzario · Prezzi materie prime e carburanti",
  description:
    "Tracciamento in tempo quasi reale di materie prime globali (petrolio, gas, metalli, agricole) e carburanti al consumo per regione. Dati pubblici, fonti verificate, nessuna garanzia di accuratezza.",
  openGraph: {
    title: "Prezzario",
    description:
      "Prezzi materie prime e carburanti, in tempo quasi reale — dati pubblici e verificati.",
    url: "https://commodity-tracker-one-delta.vercel.app",
    siteName: "Prezzario",
    locale: "it_IT",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Prezzario",
    description: "Prezzi materie prime e carburanti, in tempo quasi reale.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
