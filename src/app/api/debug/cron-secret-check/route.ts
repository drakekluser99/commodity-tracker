import { NextRequest, NextResponse } from "next/server";

// Route di debug TEMPORANEA — non rivela il valore del segreto, solo
// lunghezza/presenza, per capire perché isAuthorizedCronRequest rifiuta
// anche dopo aver rigenerato CRON_SECRET su Vercel. Da rimuovere appena
// risolto il 401 sul cron fetch-us-fuel-prices.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  return NextResponse.json({
    envHasCronSecret: !!secret,
    envCronSecretLength: secret ? secret.length : 0,
    headerPresent: !!authHeader,
    headerLength: authHeader ? authHeader.length : 0,
    // "Bearer " sono 7 caratteri: la lunghezza del segreto atteso nell'header
    headerLooksLikeBearer: authHeader ? authHeader.startsWith("Bearer ") : false,
    expectedHeaderLength: secret ? secret.length + 7 : null,
  });
}
