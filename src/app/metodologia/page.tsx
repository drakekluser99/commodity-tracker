import Link from "next/link";
import { SystemCard } from "@/components/SystemCard";
import { ProvenanceStamp } from "@/components/ProvenanceStamp";

export const metadata = {
  title: "Metodologia — Prezzario",
};

export default function Metodologia() {
  return (
    <div className="min-h-screen bg-system-bg text-system-ink">
      <header className="border-b border-system-border bg-white">
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
            Quando una serie di materie prime resta ferma oltre il ritardo
            atteso per la sua cadenza (14 giorni per le giornaliere, 75 per
            le mensili), nella tabella compare un badge{" "}
            <strong>&quot;non aggiornato&quot;</strong> accanto alla data: il
            valore mostrato è l&apos;ultimo che abbiamo, ma potrebbe non
            essere quello corrente.
          </p>
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
              La media UE mostrata è una <strong>media semplice</strong>{" "}
              tra i 27 paesi, non ponderata per popolazione o consumi
              reali di ciascun paese.
            </li>
          </ul>
        </Section>

        <Section index="04" title="Codice sorgente">
          <p className="text-sm leading-relaxed text-system-ink-secondary">
            Questo è un progetto open source: chiunque può ispezionare il
            codice, verificare come i dati vengono raccolti e processati,
            o contribuire con miglioramenti.
          </p>
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
