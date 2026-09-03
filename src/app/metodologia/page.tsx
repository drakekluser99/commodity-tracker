import Link from "next/link";
import { SystemCard } from "@/components/SystemCard";
import { ProvenanceStamp } from "@/components/ProvenanceStamp";

export const metadata = {
  title: "Metodologia — Mercuriale",
};

export default function Metodologia() {
  return (
    <div className="min-h-screen bg-system-bg text-system-ink">
      <header className="border-b border-system-border bg-system-surface">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <Link
            href="/"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-system-accent hover:underline"
          >
            ← Torna alla dashboard
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <ProvenanceStamp size={20} className="text-system-accent" />
            Metodologia
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-system-ink-secondary">
            Come raccogliamo i dati, da dove vengono, e quali sono i loro
            limiti. Un numero senza contesto può essere fuorviante quanto
            un numero sbagliato — qui trovi il contesto.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 space-y-10">
        <Section index="01" title="Fonti dei dati">
          <SourceItem
            name="Alpha Vantage"
            desc="Prezzi di mercato per materie prime globali (petrolio, gas naturale, metalli, agricole). Dati giornalieri, aggregati da mercati finanziari internazionali."
            link="https://www.alphavantage.co"
          />
          <SourceItem
            name="Commissione Europea — Weekly Oil Bulletin"
            desc="Prezzi medi settimanali di benzina e diesel, rilevati ufficialmente in ciascuno dei 27 Stati membri UE."
            link="https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en"
          />
          <SourceItem
            name="EIA — U.S. Energy Information Administration"
            desc="Prezzi medi nazionali settimanali di benzina e diesel negli Stati Uniti, ente statistico ufficiale del governo USA."
            link="https://www.eia.gov/opendata"
          />
        </Section>

        <Section index="02" title="Frequenza di aggiornamento">
          <p className="text-sm leading-relaxed text-system-ink-secondary">
            I dati vengono raccolti automaticamente tramite processi
            pianificati (cron job): le materie prime globali giornalmente,
            i carburanti europei settimanalmente (allineati alla
            pubblicazione ufficiale del bollettino, il giovedì), quelli
            USA settimanalmente (il lunedì). Non sono dati in tempo reale
            minuto per minuto — il titolo &quot;in tempo quasi reale&quot; si
            riferisce a questo: aggiornati regolarmente, non istantanei.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-system-ink-secondary">
            Ogni serie ha tre stati possibili, calcolati confrontando la data
            dell&apos;ultimo valore con la cadenza attesa per quella fonte:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-system-ink-secondary">
            <li>
              <strong>Aggiornato</strong> — nessun badge: l&apos;ultimo
              valore rientra nella cadenza attesa (1 giorno per petrolio e
              gas naturale, 7 per i carburanti, 30 per metalli e agricole).
            </li>
            <li>
              <strong>&quot;In attesa&quot;</strong> — la cadenza attesa è
              passata da poco, ma restiamo dentro un margine di tolleranza
              (3 giorni per le serie giornaliere e settimanali, 10 per le
              mensili) pensato per coprire un ritardo occasionale della
              fonte: un weekend, una festività, una pubblicazione slittata.
            </li>
            <li>
              <strong>&quot;Non aggiornato&quot;</strong> — anche il margine
              di tolleranza è superato: il valore mostrato è l&apos;ultimo
              che abbiamo, ma potrebbe non essere più quello corrente.
            </li>
          </ul>
        </Section>

        <Section index="03" title="Limiti da conoscere">
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-system-ink-secondary">
            <li>
              I prezzi dei carburanti sono <strong>medie nazionali</strong>,
              non il prezzo di un singolo distributore. Il prezzo reale
              in una specifica città o area può differire, anche di
              parecchio.
            </li>
            <li>
              Il calcolatore &quot;Cosa significa in pratica&quot; usa
              consumi <strong>stimati</strong> (capacità serbatoio auto e
              litri/100km camion), non misurati: il consumo reale dipende
              dal veicolo specifico, dal carico e dallo stile di guida.
            </li>
            <li>
              I prezzi Europa (EUR) e USA (USD) non vengono convertiti in
              una valuta comune: un confronto diretto richiederebbe un
              tasso di cambio aggiornato, che questo progetto non applica
              ancora.
            </li>
            <li>
              La <strong>&quot;media dei 27&quot;</strong> mostrata in mappa
              e in tabella è una media <strong>semplice</strong> tra i 27
              paesi UE: Malta pesa quanto la Germania. La Commissione
              Europea pubblica anche una propria media, ponderata sui
              consumi reali di ciascun paese, e le due non coincidono —
              quella ponderata è più alta di circa 11 centesimi al litro.
              Non sono in contraddizione: rispondono a domande diverse
              (&quot;qual è il prezzo tipico di un paese UE&quot; contro
              &quot;quanto paga in media il litro effettivamente consumato
              in Europa&quot;), e per questo qui si usa sempre l&apos;etichetta
              esplicita &quot;media dei 27&quot; invece del generico
              &quot;media UE&quot;.
            </li>
          </ul>
        </Section>

        <Section index="04" title="Codice sorgente">
          <p className="text-sm leading-relaxed text-system-ink-secondary">
            Questo è un progetto open source: chiunque può ispezionare il
            codice, verificare come i dati vengono raccolti e processati,
            o contribuire con miglioramenti. Il codice è rilasciato sotto
            licenza MIT; i dati di prezzo restano soggetti ai termini delle
            rispettive fonti.
          </p>
        </Section>

        <Section index="05" title="API pubblica">
          <p className="text-sm leading-relaxed text-system-ink-secondary">
            Gli stessi ultimi prezzi mostrati sulla dashboard sono
            disponibili in JSON, per riusarli in altri progetti:
          </p>
          <p className="mt-3">
            <code className="rounded border border-system-border bg-system-panel px-2 py-1 font-mono text-xs text-system-ink">
              GET https://commodity-tracker-one-delta.vercel.app/api/data
            </code>
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-system-ink-secondary">
            <li>
              Nessuna autenticazione. Header{" "}
              <code className="font-mono text-xs">
                Access-Control-Allow-Origin: *
              </code>
              , quindi si può chiamare anche da un browser di terze parti.
            </li>
            <li>
              I prezzi sono i valori <strong>grezzi</strong> come salvati
              dalla fonte: nessuna conversione di visualizzazione (il
              cotone resta in <code className="font-mono text-xs">cents per
              pound</code>, non cents/kg come in tabella).
            </li>
            <li>
              <code className="font-mono text-xs">price</code> è numerico;
              le date sono ISO 8601 in UTC. Risposta rigenerata a ogni
              richiesta.
            </li>
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-system-ink-secondary">
            Esempio di risposta (abbreviata):
          </p>
          <pre className="mt-2 overflow-x-auto rounded-md border border-system-border bg-system-panel p-4 font-mono text-xs leading-relaxed text-system-ink-secondary">
{`{
  "generatedAt": "2026-08-31T12:00:00.000Z",
  "commodities": [
    {
      "symbol": "BRENT",
      "name": "Brent Crude Oil",
      "category": "energy",
      "price": 88.24,
      "unit": "dollars per barrel",
      "recordedAt": "2026-08-25T00:00:00.000Z"
    }
  ],
  "fuelPrices": [
    {
      "region": "Italy",
      "continent": "europe",
      "fuelType": "petrol",
      "price": 2.003,
      "currency": "EUR",
      "recordedAt": "2026-08-24T00:00:00.000Z"
    }
  ]
}`}
          </pre>
        </Section>
      </main>

      <footer className="mx-auto max-w-3xl px-6 py-10 text-xs text-system-ink-muted">
        Progetto open source · dati pubblici, nessuna garanzia di accuratezza
      </footer>
    </div>
  );
}

function Section({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-system-ink-muted">{index} /</span>
        <h2 className="text-lg font-semibold text-system-ink">{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SourceItem({ name, desc, link }: { name: string; desc: string; link: string }) {
  return (
    <SystemCard className="mb-4 last:mb-0">
      <div className="flex items-start gap-2">
        <ProvenanceStamp size={18} className="mt-0.5 shrink-0 text-system-accent" />
        <div>
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-system-accent hover:underline"
          >
            {name} ↗
          </a>
          <p className="mt-1 text-sm leading-relaxed text-system-ink-secondary">
            {desc}
          </p>
        </div>
      </div>
    </SystemCard>
  );
}
