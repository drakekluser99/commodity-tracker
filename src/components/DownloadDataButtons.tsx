"use client";

/**
 * Pulsanti "Scarica CSV" / "Scarica JSON" per una tabella di dati.
 *
 * Il file viene costruito QUI nel browser (Blob + object URL): i dati sono
 * già tutti nella pagina, quindi non serve un endpoint server dedicato per
 * l'export. CSV e JSON partono dalle stesse `rows`/`columns` così le due
 * esportazioni restano allineate.
 */

type Column = { key: string; label: string };
type Row = Record<string, string | number | null>;

interface Props {
  /** Base del nome file: viene appesa la data odierna e l'estensione */
  filenameBase: string;
  /** Colonne in ordine, con intestazione leggibile per il CSV */
  columns: Column[];
  rows: Row[];
}

function toCsv(columns: Column[], rows: Row[]): string {
  // Un campo va quotato (e le virgolette interne raddoppiate) solo se
  // contiene il separatore, virgolette o un a-capo — regola RFC 4180.
  const escape = (value: string | number | null) => {
    const s = value == null ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escape(c.label)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escape(row[c.key])).join(","))
    .join("\n");
  return `${header}\n${body}\n`;
}

function triggerDownload(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // L'object URL si libera al giro di eventi successivo, quando il click
  // ha già avviato il salvataggio.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function DownloadDataButtons({ filenameBase, columns, rows }: Props) {
  const buttonClass =
    "rounded-md border border-system-border px-2.5 py-1 font-mono text-xs uppercase tracking-wider text-system-ink-secondary transition-colors hover:border-system-accent hover:text-system-accent disabled:cursor-not-allowed disabled:opacity-40";

  // Data calcolata al click (non in fase di render): tiene il componente
  // puro e il nome file riflette il momento dello scaricamento.
  const run = (ext: string, mime: string, content: string) => {
    const today = new Date().toISOString().slice(0, 10); // AAAA-MM-GG
    triggerDownload(`${filenameBase}-${today}.${ext}`, mime, content);
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={rows.length === 0}
        onClick={() => run("csv", "text/csv", toCsv(columns, rows))}
        className={buttonClass}
      >
        Scarica CSV
      </button>
      <button
        type="button"
        disabled={rows.length === 0}
        onClick={() =>
          run("json", "application/json", JSON.stringify(rows, null, 2) + "\n")
        }
        className={buttonClass}
      >
        Scarica JSON
      </button>
    </div>
  );
}
