import type { NextConfig } from "next";

/**
 * Header di sicurezza applicati a tutte le risposte.
 *
 * Il sito non ha login né dati personali, quindi qui non c'è niente di
 * drammatico da proteggere: sono header "igienici", che costano nulla e
 * chiudono le porte che non ci servono aperte. Ognuno con il suo perché:
 *
 * - `X-Frame-Options: DENY` — impedisce che il sito venga incorniciato in
 *   un iframe su un altro dominio. Serve contro il clickjacking: qualcuno
 *   carica Mercuriale invisibile sopra la propria pagina e ti fa cliccare
 *   su una cosa credendo di cliccarne un'altra. Se un domani vorremo un
 *   widget incorporabile (è nel brief), questa riga andrà ALLENTATA in
 *   modo mirato — probabilmente con `Content-Security-Policy:
 *   frame-ancestors` sulla sola rotta del widget, non tolta del tutto.
 * - `X-Content-Type-Options: nosniff` — dice al browser di fidarsi del
 *   Content-Type dichiarato invece di indovinarlo dal contenuto. Senza,
 *   un file servito come testo ma che "sembra" JavaScript può finire
 *   eseguito.
 * - `Referrer-Policy` — quando l'utente clicca un link verso l'esterno
 *   (le fonti: Commissione Europea, EIA, Alpha Vantage), invia solo il
 *   nostro dominio come provenienza, non l'URL completo della pagina.
 * - `Permissions-Policy` — spegne esplicitamente fotocamera, microfono e
 *   geolocalizzazione. Non li usiamo: dichiararlo impedisce che uno
 *   script di terze parti che finisse in pagina possa chiederli.
 *
 * Niente Content-Security-Policy per ora: una CSP scritta male rompe il
 * sito in silenzio (i font di next/font, gli stili inline di recharts e
 * react-simple-maps hanno tutti bisogno di direttive giuste), e va
 * introdotta con una fase di `Report-Only` per vedere cosa blocca prima
 * di attivarla davvero. Meglio nessuna CSP che una CSP che ci costringe
 * a metterci dentro `unsafe-inline` e non protegge da niente.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
