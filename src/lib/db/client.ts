import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// DATABASE_URL viene fornita da Vercel automaticamente quando colleghi
// un database Neon al progetto (Storage tab -> Connect). In locale la
// metti in un file .env.local (vedi .env.example).
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL non è definita. Copia .env.example in .env.local e inserisci la connection string di Neon."
  );
}

// `neon-http`: driver via HTTP invece che connessione TCP persistente.
// È la scelta giusta per le funzioni serverless di Vercel, che si avviano
// e chiudono ad ogni richiesta — una connessione TCP tradizionale
// andrebbe riaperta ogni volta, sprecando tempo.
const sql = neon(process.env.DATABASE_URL);

// Passiamo `schema` così Drizzle conosce le tabelle e ci dà
// autocompletamento e controllo dei tipi quando scriviamo query.
export const db = drizzle(sql, { schema });
