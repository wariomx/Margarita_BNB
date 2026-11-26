import { connection } from "next/server";
import { getMarket, hasCmcKey } from "@/lib/cmc";

const CACHED = "public, s-maxage=300, stale-while-revalidate=600";

export async function GET() {
  await connection();
  if (!hasCmcKey()) {
    return Response.json({ error: "Market data is not configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const market = await getMarket();
    return Response.json(market, { headers: { "Cache-Control": CACHED } });
  } catch {
    return Response.json(
      { error: "Market data is unavailable" },
      { status: 503, headers: { "Cache-Control": "public, s-maxage=60" } },
    );
  }
}
