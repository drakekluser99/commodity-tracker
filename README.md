# Prezzario

Progetto open source di tracciamento prezzi di materie prime globali e
carburanti al consumo: ogni dato con la sua fonte, la sua data e i suoi limiti
dichiarati esplicitamente.

**Sito live:** https://commodity-tracker-one-delta.vercel.app

## Stack tecnico

- [Next.js 16](https://nextjs.org) (App Router) + TypeScript
- Tailwind CSS
- Drizzle ORM + [Neon](https://neon.tech) Postgres (serverless)
- Deploy su [Vercel](https://vercel.com), con redeploy automatico a ogni push su `main`

## Fonti dati e frequenza di aggiornamento

| Fonte | Dati | Aggiornamento |
| --- | --- | --- |
| [Alpha Vantage](https://www.alphavantage.co/documentation/#commodities) | Materie prime globali (petrolio, gas, metalli, agricole) | Giornaliero |
| [Bollettino Petrolifero Settimanale](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en) (Commissione Europea) | Carburanti al consumo, paesi UE | Ogni giovedì |
| [EIA](https://www.eia.gov/opendata/) (U.S. Energy Information Administration) | Carburanti al consumo, USA | Ogni lunedì |

L'aggiornamento è gestito da cron job schedulati in `vercel.json`, che
chiamano gli endpoint protetti sotto `src/app/api/cron/`.

## Sviluppo locale

```bash
npm install
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000).

### Variabili d'ambiente

Copia `.env.example` in `.env.local` e imposta i valori:

| Variabile | Obbligatoria | Descrizione |
| --- | --- | --- |
| `DATABASE_URL` | sì | Connection string Postgres di Neon |
| `CRON_SECRET` | sì | Stringa segreta che protegge gli endpoint `/api/cron/*` (es. `openssl rand -hex 32`) |
| `ALPHA_VANTAGE_API_KEY` | per il cron materie prime | API key gratuita — https://www.alphavantage.co/support/#api-key |
| `EIA_API_KEY` | per il cron carburanti USA | API key gratuita — https://www.eia.gov/opendata/register.php |

### Comandi utili

```bash
npm run dev            # server di sviluppo
npm run build          # build di produzione
npm run db:generate    # genera le migrazioni Drizzle dallo schema
npm run db:migrate     # applica le migrazioni
npm run db:studio      # Drizzle Studio
```

## Licenza e disclaimer

Progetto open source · dati pubblici, **nessuna garanzia di accuratezza**.
I prezzi sono medie nazionali o dati di mercato ritardati, non quotazioni in
tempo reale né prezzi di punti vendita specifici. Vedi la
[pagina Metodologia](https://commodity-tracker-one-delta.vercel.app/metodologia)
per fonti, limiti e frequenza di aggiornamento.

## Autore

Creato da [Yuri Copparini](https://www.linkedin.com/in/yuri-copparini).
