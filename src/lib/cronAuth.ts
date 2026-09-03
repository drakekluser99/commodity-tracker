import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Verifica che una richiesta a una route `/api/cron/*` provenga davvero
 * dallo scheduler di Vercel (o da noi, con il segreto in mano).
 *
 * Perché esiste questo file invece del confronto in linea che c'era
 * prima in ognuna delle 7 route:
 *
 * 1. **Il bug del "Bearer undefined".** Il controllo precedente era
 *    `authHeader !== `Bearer ${process.env.CRON_SECRET}``. Se
 *    `CRON_SECRET` non è configurata — un deploy di preview senza le
 *    variabili d'ambiente, o una variabile cancellata per sbaglio — in
 *    JavaScript `undefined` dentro un template literal diventa la
 *    STRINGA "undefined". Il confronto atteso diventava quindi
 *    letteralmente `Bearer undefined`, e chiunque inviasse quell'header
 *    passava il controllo e poteva far scattare i cron a piacimento,
 *    bruciando il rate limit giornaliero di Alpha Vantage. Qui il
 *    segreto mancante NEGA l'accesso invece di aprirlo: è la regola
 *    generale "fail closed", un controllo di sicurezza che non può
 *    funzionare deve dire di no.
 *
 * 2. **Confronto a tempo costante.** `!==` su stringhe si ferma al primo
 *    carattere diverso, quindi il tempo di risposta dipende da quanti
 *    caratteri iniziali sono corretti: con abbastanza tentativi si può
 *    ricostruire il segreto un carattere alla volta (timing attack). Su
 *    questo endpoint il rischio pratico è basso — c'è di mezzo la rete,
 *    e il danno massimo è un fetch di prezzi pubblici — ma il rimedio
 *    costa tre righe e vale la pena averlo per abitudine.
 *
 * Il confronto passa prima da uno SHA-256: `timingSafeEqual` pretende
 * due buffer della STESSA lunghezza (altrimenti lancia un'eccezione, e
 * l'eccezione stessa rivelerebbe la lunghezza del segreto). L'hash
 * riporta qualsiasi input a 32 byte fissi, così la lunghezza non è più
 * un'informazione che trapela.
 */
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;

  // Segreto non configurato o vuoto: nega sempre. Vedi punto 1 sopra.
  if (!secret) {
    console.error(
      "CRON_SECRET non configurata: richiesta al cron rifiutata. " +
        "Imposta la variabile d'ambiente su Vercel."
    );
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const received = createHash("sha256").update(authHeader).digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();

  return timingSafeEqual(received, expected);
}
