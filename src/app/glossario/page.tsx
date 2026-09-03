import Link from "next/link";
import { ProvenanceStamp } from "@/components/ProvenanceStamp";

export const metadata = {
  title: "Glossario — Mercuriale",
};

export default function Glossario() {
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
            Glossario
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-system-ink-secondary">
            I termini che compaiono sulla dashboard, spiegati in parole
            semplici. Se un dato ti sembra strano — due tipi di petrolio con
            prezzi diversi, un valore fermo da settimane — qui trovi il
            perché.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 space-y-10">
        <Section index="01" title="WTI e Brent: perché due prezzi per «il petrolio»">
          <p className="text-sm leading-relaxed text-system-ink-secondary">
            Sono entrambi petrolio greggio leggero e a basso zolfo, ma sono
            due <strong>benchmark</strong> diversi: due punti di riferimento
            che il mercato usa per prezzare tutto il resto.
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-system-ink-secondary">
            <li>
              <strong>WTI</strong> (West Texas Intermediate) si consegna a
              Cushing, in Oklahoma, nell&apos;entroterra degli Stati Uniti.
              È il riferimento del mercato nordamericano.
            </li>
            <li>
              <strong>Brent</strong> prende il nome da un giacimento del Mare
              del Nord e si riferisce a greggio estratto lì e caricato via
              nave. È il riferimento per Europa, Africa e gran parte del
              mercato internazionale.
            </li>
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-system-ink-secondary">
            La differenza di prezzo (lo <em>spread</em> Brent–WTI) nasce
            soprattutto dalla logistica: il Brent, essendo già su nave,
            raggiunge facilmente qualsiasi mercato; il WTI parte
            dall&apos;entroterra e dipende da oleodotti e capacità di
            stoccaggio locali. Si aggiungono la maggiore offerta interna
            USA (shale) e il premio per il rischio geopolitico che pesa più
            sul Brent. I due prezzi restano comunque molto vicini e si
            muovono quasi sempre nella stessa direzione.
          </p>
        </Section>

        <Section
          index="02"
          title="Weekly Oil Bulletin (Commissione Europea)"
        >
          <p className="text-sm leading-relaxed text-system-ink-secondary">
            È il bollettino settimanale con cui la Commissione Europea
            pubblica i prezzi medi al consumo di benzina e diesel — tasse
            incluse — per ciascuno dei 27 Stati membri. I dati sono
            comunicati dai singoli Stati e raccolti in un unico documento,
            pubblicato di norma il <strong>giovedì</strong>.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-system-ink-secondary">
            È la fonte dei prezzi carburante europei che vedi sulla mappa e
            nella tabella «Carburanti al consumo». Sono medie nazionali, non
            il prezzo di un singolo distributore.
          </p>
        </Section>

        <Section
          index="03"
          title="EIA (U.S. Energy Information Administration)"
        >
          <p className="text-sm leading-relaxed text-system-ink-secondary">
            È l&apos;ente statistico ufficiale del Dipartimento
            dell&apos;Energia degli Stati Uniti. Raccoglie e pubblica dati
            indipendenti su produzione, consumi e prezzi dell&apos;energia,
            compresi i prezzi medi settimanali di benzina e diesel al
            distributore. È la fonte dei dati USA di questo sito.
          </p>
        </Section>

        <Section
          index="04"
          title="Perché alcuni dati sono giornalieri e altri mensili"
        >
          <p className="text-sm leading-relaxed text-system-ink-secondary">
            Dipende da come nasce il prezzo alla fonte.
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-system-ink-secondary">
            <li>
              <strong>Petrolio e gas naturale</strong> sono scambiati ogni
              giorno su mercati finanziari molto liquidi: esiste una
              quotazione per ogni giornata di contrattazione, quindi
              l&apos;aggiornamento è giornaliero.
            </li>
            <li>
              <strong>Metalli e materie prime agricole</strong> qui arrivano
              da serie di prezzo mondiale aggregate (tipo «Global Price
              of…»), che vengono ricalcolate e pubblicate una volta al mese,
              spesso con due o tre settimane di ritardo. Per queste,
              l&apos;aggiornamento è mensile.
            </li>
            <li>
              <strong>Carburanti al consumo</strong> seguono la cadenza di
              chi li rileva: settimanale per l&apos;UE (giovedì) e per gli
              USA (lunedì).
            </li>
          </ul>
        </Section>

        <Section index="05" title="Il badge «non aggiornato»">
          <p className="text-sm leading-relaxed text-system-ink-secondary">
            Compare accanto alla data di una materia prima quando
            l&apos;ultimo valore che abbiamo è più vecchio del ritardo
            atteso per la sua cadenza. Non significa che il dato sia
            sbagliato: significa che potrebbe non essere quello corrente.
            Le soglie precise e il ragionamento dietro il badge sono
            spiegati nella{" "}
            <Link
              href="/metodologia"
              className="text-system-accent hover:underline"
            >
              pagina Metodologia
            </Link>
            .
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
