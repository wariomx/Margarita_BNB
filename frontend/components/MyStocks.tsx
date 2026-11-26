"use client";

import { useQuery } from "@tanstack/react-query";
import { erc20Abi, formatUnits } from "viem";
import { useReadContracts, useWatchAsset } from "wagmi";
import { CHAIN } from "@/lib/contract";
import { PRIZES } from "@/lib/prizes";
import { PrizeCoin } from "./PrizeCoin";

type Prices = Record<string, { usd: number | null; change24h: number | null }>;

async function fetchPrices(): Promise<{ prices: Prices; updatedAt: string | null }> {
  const res = await fetch("/api/market");
  if (!res.ok) throw new Error(String(res.status));
  const body = (await res.json()) as { prices?: Prices; updatedAt?: string | null };
  return { prices: body.prices ?? {}, updatedAt: body.updatedAt ?? null };
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

export function MyStocks({ player }: { player: `0x${string}` }) {
  const prizes = PRIZES.filter((p) => p.address);
  const balances = useReadContracts({
    contracts: prizes.map((p) => ({ address: p.address!, abi: erc20Abi, functionName: "balanceOf" as const, args: [player] as const, chainId: CHAIN.id })),
    query: { refetchInterval: 30_000 },
  });
  const market = useQuery({
    queryKey: ["cmc-market-prices"],
    queryFn: fetchPrices,
    staleTime: 300_000,
    refetchInterval: 300_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const watch = useWatchAsset();

  const rows = prizes.map((p, i) => {
    const raw = balances.data?.[i]?.result as bigint | undefined;
    const amount = raw !== undefined ? Number(formatUnits(raw, 18)) : undefined;
    const price = market.data?.prices[String(p.cmcId)];
    const value = amount !== undefined && price?.usd ? amount * price.usd : undefined;
    return { p, amount, price, value };
  });
  const held = rows.filter((r) => r.amount && r.amount > 0);
  const total = held.reduce((s, r) => s + (r.value ?? 0), 0);

  return (
    <section aria-labelledby="stocks-title" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="stocks-title" className="text-3xl">
          My stocks
        </h2>
        {held.length > 0 && market.data ? (
          <p className="flex flex-col items-end">
            <span className="text-sm text-muted">Portfolio value</span>
            <span className="num text-3xl">{usd(total)}</span>
          </p>
        ) : null}
      </div>

      {held.length === 0 ? (
        <p className="text-[15px] text-muted">Swap Blanco, Reposado or Añejo above and your tokenized stocks show up here, priced live.</p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {held.map(({ p, amount, price, value }) => (
            <li key={p.key} className="panel flex min-w-0 flex-col items-center gap-3 p-5 text-center">
              <PrizeCoin token={p.key} size={132} still label={`${p.symbol} coin`} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-lg font-semibold">{p.symbol}</span>
                <span className="text-sm text-muted">{p.name}</span>
              </div>
              <span className="num text-xl">{amount!.toLocaleString("en-US", { maximumFractionDigits: 6 })}</span>
              <span className="num text-sm">
                {value !== undefined ? usd(value) : "price unavailable"}
                {price?.change24h !== null && price?.change24h !== undefined ? (
                  <span className={price.change24h >= 0 ? "text-success" : "text-error"}> {pct(price.change24h)} today</span>
                ) : null}
              </span>
              <button
                type="button"
                className="btn btn-secondary min-h-11 w-full px-3 text-sm"
                onClick={() => watch.mutate({ type: "ERC20", options: { address: p.address!, symbol: p.symbol, decimals: 18 } })}
              >
                Add to wallet
              </button>
            </li>
          ))}
        </ul>
      )}
      {market.data ? (
        <p className="text-xs text-muted">
          Prices from the CoinMarketCap Pro API{market.data.updatedAt ? `, updated ${new Date(market.data.updatedAt).toLocaleTimeString()}` : ""}. Test tokens on BNB Smart
          Chain testnet, priced at the real tokenized stock.
        </p>
      ) : null}
    </section>
  );
}
