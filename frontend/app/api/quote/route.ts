import { randomBytes } from "node:crypto";
import { parseUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PRIZES, QUOTE_TYPES, quoteDomain, vaultAddress } from "@/lib/prizes";

const QUOTE_TTL_SECONDS = 120;

type CmcQuote = { price?: number; last_updated?: string; symbol?: string };

function pickUsd(entry: unknown): CmcQuote | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const q = (entry as { quote?: unknown }).quote;
  if (Array.isArray(q)) return q.find((x: CmcQuote) => x?.symbol === "USD") ?? q[0];
  if (q && typeof q === "object") return (q as Record<string, CmcQuote>).USD;
  return undefined;
}

async function cmcUsdPrice(id: number) {
  const key = process.env.CMC_API_KEY;
  if (!key) throw new Error("market data unavailable");
  const res = await fetch(`https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/latest?id=${id}&convert=USD`, {
    headers: { "X-CMC_PRO_API_KEY": key, Accept: "application/json" },
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`market data ${res.status}`);
  const body = (await res.json()) as { data?: unknown };
  const data = body.data;
  const entry = Array.isArray(data) ? data.find((d: { id?: number }) => d?.id === id) : (data as Record<string, unknown>)?.[String(id)];
  const usd = pickUsd(entry);
  if (!usd?.price || !(usd.price > 0)) throw new Error("no USD price");
  return { price: usd.price, updatedAt: usd.last_updated ?? null };
}

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("token");
  const prize = PRIZES.find((p) => p.key === key);
  const vault = vaultAddress();
  const pk = process.env.QUOTE_SIGNER_PK as Hex | undefined;
  if (!prize || !prize.address || !prize.cmcId) return Response.json({ error: "unknown prize" }, { status: 404 });
  if (!vault || !pk) return Response.json({ error: "vault not configured" }, { status: 503 });
  try {
    const { price, updatedAt } = await cmcUsdPrice(prize.cmcId);
    const priceUsd = parseUnits(price.toFixed(8), 18);
    const expiry = BigInt(Math.floor(Date.now() / 1000) + QUOTE_TTL_SECONDS);
    const nonce = BigInt(`0x${randomBytes(32).toString("hex")}`);
    const quote = { token: prize.address, priceUsd, expiry, nonce };
    const signature = await privateKeyToAccount(pk).signTypedData({
      domain: quoteDomain(vault),
      types: QUOTE_TYPES,
      primaryType: "Quote",
      message: quote,
    });
    return Response.json(
      {
        prize: prize.key,
        symbol: prize.symbol,
        cmcId: prize.cmcId,
        priceUsd: price,
        updatedAt,
        source: "CoinMarketCap Pro API",
        quote: { token: quote.token, priceUsd: priceUsd.toString(), expiry: expiry.toString(), nonce: nonce.toString() },
        signature,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "quote failed" }, { status: 503 });
  }
}
