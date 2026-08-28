@AGENTS.md

# Commodity Tracker — contesto del progetto

Progetto open source che raccoglie e mostra prezzi di materie prime globali
e carburanti al consumo, ispirato nello spirito (non nei contenuti) a
progetti di trasparenza dati pubblici come DoveVannoINostriSoldi.it:
ogni dato deve avere fonte, data, e limiti dichiarati esplicitamente.

## Stack

- Next.js 16 (App Router), TypeScript, Tailwind CSS
- Drizzle ORM + Neon Postgres (serverless)
- Deploy: Vercel, collegato a GitHub (`drakekluser99/commodity-tracker`),
  deploy automatico ad ogni push su `main`
- Identità Git di questo repo: `drakekluser99@gmail.com` (NON l'account
  di lavoro dell'utente — non cambiare mai questa configurazione)

## Architettura

- `src/lib/db/schema.ts` — 4 tabelle: `commodities`, `price_history`
  (materie prime globali), `regions`, `retail_fuel_prices` (carburanti
  per regione)
- `src/lib/db/queries.ts` — query di lettura (ultimo prezzo per ogni
  commodity/regione)
- `src/lib/fetchers/` — un fetcher per fonte dati:
  - `alphaVantage.ts` — API REST, materie prime globali, batch A
    (energia+metalli) e B (agricole) per rispettare il limite di 10s
    delle funzioni serverless su Vercel Hobby e i rate limit gratuiti
    della API
  - `euOilBulletin.ts` — scarica e parsa un file XLSX della Commissione
    Europea (bollettino settimanale carburanti), parsing DIFENSIVO per
    nome colonna (non posizione), validato contro dati reali
  - `eiaUs.ts` — API REST EIA (governo USA), carburanti settimanali
- `src/app/api/cron/*/route.ts` — 4 route protette da `CRON_SECRET`
  (header `Authorization: Bearer`), schedulate in `vercel.json`
- `src/app/page.tsx` — homepage: dashboard con mappa Europa, calcolatore
  d'impatto, tabelle materie prime/carburanti
- `src/app/metodologia/page.tsx` — pagina trasparenza (fonti, limiti,
  frequenza aggiornamento)
- `src/components/EuropeFuelMap.tsx` — mappa interattiva (react-simple-maps,
  atlante 50m — NON usare 110m, omette paesi piccoli come Malta/Lussemburgo)
- `src/components/FuelImpactCalculator.tsx` — calcolatore costo
  pieno/trasporti, EU vs USA
- `src/components/MobileNav.tsx` — menu hamburger mobile

## Convenzioni di stile del codice

- Commenti in italiano, spiegano il "perché" non il "cosa" (il progetto
  serve anche per imparare, chi legge il codice vuole capire le scelte)
- Palette colori: token `system-*` definiti in `src/app/globals.css` dentro
  `@theme` (Tailwind v4, non `tailwind.config.ts`). Non scrivere più hex a
  mano nelle classi — usare sempre le utility generate:
  - `system-bg` (#fafafa) — sfondo pagina
  - `system-panel` (#f2f3f5) — sfondo pannelli secondari
  - `system-ink` (#111318) — testo principale
  - `system-ink-secondary` (#5b6472) — testo secondario (paragrafi, nav)
  - `system-ink-muted` (#6b7280) — dettagli minori (text-xs, celle tabella)
  - `system-border` (#e2e4e9) — bordi standard
  - `system-border-subtle` (#eef0f3) — divisori più leggeri
  - `system-accent` (#0f6b66) — verde petrolio, invariato
  - `system-accent-down` (#b34324) — ruggine, per valori in salita

  Eccezione voluta: i colori SVG grezzi dentro `EuropeFuelMap.tsx` (fill dei
  paesi senza dati, stroke dei confini) restano hex letterali perché sono
  attributi JS/SVG, non classi Tailwind — non vanno migrati.
- Font numeri: sempre `font-mono tabular-nums` per allineamento colonne
- Ogni sezione dati ha una nota "Fonte: ..." sotto (componente
  `SourceNote`) — non rimuoverle, è il principio cardine del progetto

## Errori noti e già risolti (non ripeterli)

- `react-simple-maps` richiede `--legacy-peer-deps` (dichiara supporto
  solo fino a React 18, ma funziona bene con React 19) — c'è già un
  `.npmrc` con `legacy-peer-deps=true` che lo gestisce automaticamente
- **Server Component → Client Component**: mai passare funzioni (incluse
  icone lucide-react) come prop da `page.tsx` a un componente con
  `"use client"` — causa "Functions cannot be passed directly to Client
  Components" A RUNTIME (non lo cattura né `tsc` né `eslint`, solo
  visitando la pagina o con `npm run dev`). Se serve un'icona in un
  client component, definiscila lì dentro, non passarla come prop.
- `drizzle-kit` non legge `.env.local` di default (è una convenzione
  solo di Next.js) — `drizzle.config.ts` lo carica esplicitamente con
  `dotenv`
- Vulnerabilità dipendenze: quando `npm audit` segnala qualcosa,
  verificare se c'è un fix non-breaking prima di ignorarlo; se il fix
  richiede un downgrade breaking e il rischio non è applicabile al
  nostro uso, documentarlo nel commit invece di lasciarlo silenzioso

## Workflow con l'utente

- L'utente alterna claude.ai (chat web, dove Claude prepara modifiche in
  un sandbox e le passa come prompt da incollare) e Claude Code (accesso
  diretto al repo locale). Quando lavori qui, hai accesso diretto: usa
  `git log --oneline` per vedere la cronologia reale invece di fidarti
  di quello che un prompt dice di aver già fatto.
- Verifica SEMPRE con `npx tsc --noEmit` e `npx eslint` prima di
  committare. Per modifiche che toccano il confine Server/Client
  Components, esegui anche `npm run dev` e visita la pagina prima del
  push (vedi errore noto sopra).
- Dopo il push, Vercel ridispiega automaticamente — non serve azione
  manuale su Vercel.

## Cosa manca / prossimi passi naturali

- Oceania e LatAm (il piano originale del progetto include queste
  regioni, non ancora integrate — nessun fetcher scritto per loro)
- Allineamento nomi paese se qualcuno risultasse ancora grigio sulla
  mappa (verificare con l'atlante 50m, i nomi dovrebbero già combaciare
  ma non è stato testato con tutti i 27 paesi contemporaneamente)
- Possibile grafico storico prezzi nel tempo (oggi mostriamo solo
  l'ultimo valore, `price_history`/`retail_fuel_prices` accumulano già
  storico utilizzabile)
- Media UE ponderata per popolazione invece di media semplice (richiede
  dati di popolazione per paese, non ancora integrati)
