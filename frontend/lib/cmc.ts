import "server-only";
import { cacheLife } from "next/cache";

export type Market = {
  bnbUsd: number;
  bnbChange24h: number | null;
  cakeUsd: number | null;
  cakeChange24h: number | null;
  updatedAt: string | null;
  source: "CoinMarketCap";
};

const ENDPOINT = "https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/latest";
const BNB_ID = 1839;
const CAKE_ID = 7186;

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);

function findAsset(data: unknown, id: number): Json | null {
  const pick = (v: unknown): Json | null => {
    if (Array.isArray(v)) return pick(v.find((x) => isObj(x) && Number(x.id) === id) ?? v[0]);
    return isObj(v) ? v : null;
  };
  if (Array.isArray(data)) return pick(data.find((x) => isObj(x) && Number(x.id) === id));
  if (!isObj(data)) return null;
  if (data[String(id)] !== undefined) return pick(data[String(id)]);
  const match = Object.values(data)
    .flat()
    .find((x) => isObj(x) && Number(x.id) === id);
  return isObj(match) ? match : null;
}

function usdQuote(asset: Json | null): Json | null {
  if (!asset) return null;
  const q = asset.quote ?? asset.quotes;
  if (Array.isArray(q)) {
    const usd = q.find((x) => isObj(x) && (x.symbol === "USD" || x.convert === "USD" || Number(x.id) === 2781));
    return isObj(usd) ? usd : isObj(q[0]) ? q[0] : null;
  }
  if (isObj(q)) return isObj(q.USD) ? q.USD : isObj(q["2781"]) ? q["2781"] : null;
  return null;
}

export function parseQuotes(body: unknown): Market {
  const data = isObj(body) ? body.data : undefined;
  const bnb = findAsset(data, BNB_ID);
  const cake = findAsset(data, CAKE_ID);
  const bq = usdQuote(bnb);
  const cq = usdQuote(cake);
  const bnbUsd = num(bq?.price);
  if (bnbUsd === null || bnbUsd <= 0) throw new Error("CoinMarketCap response had no BNB/USD price");
  return {
    bnbUsd,
    bnbChange24h: num(bq?.percent_change_24h),
    cakeUsd: num(cq?.price),
    cakeChange24h: num(cq?.percent_change_24h),
    updatedAt: str(bq?.last_updated) ?? str(bnb?.last_updated) ?? null,
    source: "CoinMarketCap",
  };
}

export function hasCmcKey() {
  return Boolean(process.env.CMC_API_KEY);
}

export async function getMarket(): Promise<Market> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 900 });
  const key = process.env.CMC_API_KEY;
  if (!key) throw new Error("CoinMarketCap is not configured");
  const url = `${ENDPOINT}?id=${BNB_ID},${CAKE_ID}&convert=USD`;
  const res = await fetch(url, {
    headers: { "X-CMC_PRO_API_KEY": key, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`CoinMarketCap returned ${res.status}`);
  return parseQuotes(await res.json());
}
