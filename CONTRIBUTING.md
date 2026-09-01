# Contribuire a Prezzario

Grazie per l'interesse verso questo progetto. Prezzario è un osservatorio
aperto dei prezzi di materie prime e carburanti — il principio cardine è che
ogni dato mostrato deve avere una fonte, una data e dei limiti dichiarati
esplicitamente. Questo vale anche per il codice che lo alimenta.

## Come iniziare

Per il setup dell'ambiente locale (variabili d'ambiente, comandi, database),
segui la sezione "Sviluppo locale" del README — non la ripetiamo qui per
evitare che le due guide vadano fuori sincrono nel tempo.

## Convenzioni di codice

- I commenti nel codice sono in italiano e spiegano il *perché* di una
  scelta, non il *cosa* fa il codice (quello si legge dal codice stesso).
- I numeri, le unità di misura e le valute mostrati nell'interfaccia passano
  sempre dal layer di formattazione centralizzato (src/lib/format.ts), mai
  da un `toFixed()` scritto al volo in un componente.
- Il dato grezzo così come arriva dalla fonte non si modifica mai per motivi
  di presentazione: le conversioni (es. unità di misura) appartengono solo
  al livello di visualizzazione, mai al database o alla pipeline di
  acquisizione dati.

## Se aggiungi o modifichi una fonte dati

Questa è la parte più delicata del progetto, quindi alcune regole non
negoziabili:

1. **Dichiara sempre fonte, data e limiti** del dato che stai aggiungendo —
   non è un dettaglio opzionale, è il principio fondante del progetto.
2. **Non fallire mai in silenzio.** Se una chiamata API restituisce qualcosa
   di inatteso (un errore, un campo mancante, un formato diverso), va
   loggato esplicitamente con un errore visibile — mai un `return null` o
   un `catch` vuoto che scarta il problema senza lasciare traccia. Il
   progetto ha già avuto un bug reale causato proprio da un fallimento
   silenzioso di questo tipo: chiamate API in eccesso rispetto al rate
   limit tornavano con HTTP 200 ma senza dati, e venivano scartate senza
   nessun errore visibile da nessuna parte — 7 materie prime su 10 sono
   sparite dal sito per settimane prima che qualcuno se ne accorgesse.
3. **Rispetta i vincoli UNIQUE già presenti** nello schema (o aggiungine di
   nuovi se servono) prima di usare `onConflictDoUpdate`/`onConflictDoNothing`
   — senza un vincolo su cui appoggiarsi, Postgres non ha modo di sapere
   cosa conta come "lo stesso dato", e ogni run genera righe duplicate
   invece di aggiornare quelle esistenti.

## Prima di aprire una Pull Request

Verifica in locale che passino entrambi:

```bash
npx tsc --noEmit
npm run lint
```

Se la modifica tocca lo schema del database, includi la migrazione generata
da `npm run db:generate` nella stessa PR — non applicarla manualmente senza
che sia tracciata nel codice.

## Segnalare un dato errato

Se hai trovato un prezzo o un dato che non corrisponde alla fonte ufficiale,
apri una issue usando il template "Segnala un dato errato" — non serve
scrivere codice, basta indicare cosa mostra il sito e cosa dice la fonte
primaria.
