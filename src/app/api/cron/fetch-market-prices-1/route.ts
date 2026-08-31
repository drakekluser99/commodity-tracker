import { NextRequest } from "next/server";
import { COMMODITY_BATCH_1 } from "@/lib/fetchers/alphaVantage";
import { runMarketPriceCron } from "@/lib/fetchers/runMarketPriceCron";

export const maxDuration = 10;

export async function GET(request: NextRequest) {
  return runMarketPriceCron(request, COMMODITY_BATCH_1, "1");
}
