import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
config({ path: ".env.local" });

// Questo file NON viene eseguito dall'app in produzione: serve solo
// al comando `drizzle-kit` (npm run db:generate / db:migrate) per sapere
// dove sono le tabelle e dove scrivere i file SQL di migrazione.
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle", // qui finiscono i file .sql generati automaticamente
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
