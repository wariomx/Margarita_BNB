"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatEther } from "viem";
import { useGame } from "@/hooks/useGame";
import { NATIVE } from "@/lib/contract";
import {
  AGING_COST,
  CHANCES,
  breakEvenPullPrice,
  expectedPullsPerExtraAnejo,
  expectedPullsWithoutAging,
  type AgingCost,
} from "@/lib/odds";

type Market = {
  bnbUsd: number;
  bnbChange24h: number | null;
  cakeUsd: number | null;
  cakeChange24h: number | null;
  updatedAt: string | null;
  source: string;
};

const DEFAULT_BOTTLE_USD = 120;

const usd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n < 1 ? 3 : 2,
    maximumFractionDigits: n < 1 ? 3 : 2,
  });

const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

const bnb = (n: number) => `${n.toLocaleString("en-US", { maximumSignificantDigits: 3 })} ${NATIVE}`;

async function fetchMarket(): Promise<Market> {
  const res = await fetch("/api/market");
  if (!res.ok) throw new Error(String(res.status));
  const body = (await res.json()) as Partial<Market>;
  if (typeof body.bnbUsd !== "number" || !(body.bnbUsd > 0)) throw new Error("bad market data");
  return body as Market;
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-t border-rule pt-3">
      <span className="label">{label}</span>
      <span className="num text-2xl">{value}</span>
      {detail ? <span className="text-sm text-muted">{detail}</span> : null}
    </div>
  );
}

export function MarketPanel() {
  const market = useQuery({
    queryKey: ["cmc-market"],
    queryFn: fetchMarket,
    staleTime: 300_000,
    refetchInterval: 300_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const game = useGame();
  const [bottleText, setBottleText] = useState(String(DEFAULT_BOTTLE_USD));

  const m = market.data;
  if (!m) return null;

  const g = game.data;
  const ladder: AgingCost = g
    ? [g.agingCost[1], g.agingCost[2], g.agingCost[3]].every((c) => c >= 2)
      ? [g.agingCost[1], g.agingCost[2], g.agingCost[3]]
      : AGING_COST
    : AGING_COST;
  const priceBnb = g ? Number(formatEther(g.price)) : null;
  const pullUsd = priceBnb === null ? null : priceBnb * m.bnbUsd;
  const withAging = expectedPullsPerExtraAnejo(CHANCES, ladder);
  const withoutAging = expectedPullsWithoutAging(CHANCES);

  const bottleParsed = Number(bottleText);
  const bottleUsd = Number.isFinite(bottleParsed) && bottleParsed > 0 ? bottleParsed : null;
  const breakEven = bottleUsd === null ? null : breakEvenPullPrice(bottleUsd, m.bnbUsd, CHANCES, ladder);
  const covered = breakEven && priceBnb !== null ? priceBnb / breakEven : null;

  const updated = m.updatedAt ? new Date(m.updatedAt) : null;
  const updatedText =
    updated && !Number.isNaN(updated.getTime())
      ? updated.toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })
      : "recently";

  const left = g ? g.bottlesFree : null;

  return (
    <section aria-labelledby="market-title" className="panel flex flex-col gap-6 p-5 sm:p-8">
      <div className="flex flex-col gap-2">
        <h2 id="market-title" className="text-xl">
          Real cost, live from CoinMarketCap
        </h2>
        <p className="max-w-[60ch] text-sm text-muted">
          BNB at {usd(m.bnbUsd)}
          {m.bnbChange24h !== null ? ` (${pct(m.bnbChange24h)} in 24 h)` : ""}
          {m.cakeUsd !== null
            ? `. CAKE at ${usd(m.cakeUsd)}${m.cakeChange24h !== null ? ` (${pct(m.cakeChange24h)})` : ""}`
            : ""}
          . Testnet BNB has no market value; these figures show what the same pull would cost on mainnet.
        </p>
      </div>

      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
        <Stat
          label="One pull"
          value={pullUsd === null ? "…" : usd(pullUsd)}
          detail={
            priceBnb === null
              ? undefined
              : `${bnb(priceBnb)}${m.bnbChange24h !== null ? `, ${pct(m.bnbChange24h)} today` : ""}`
          }
        />
        <Stat
          label="Per Extra Añejo, aging up"
          value={pullUsd === null ? `${withAging.toFixed(1)} pulls` : usd(withAging * pullUsd)}
          detail={`${withAging.toFixed(1)} pulls each over many pulls, aging ${ladder.join(" / ")} up the ladder`}
        />
        <Stat
          label="Per Extra Añejo, no aging"
          value={pullUsd === null ? `${withoutAging.toFixed(0)} pulls` : usd(withoutAging * pullUsd)}
          detail={`${withoutAging.toFixed(0)} pulls each at the 1% roll`}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-rule pt-4">
        <h3 className="font-body text-sm font-semibold tracking-normal text-ink">Bottle-backed value</h3>
        <label className="flex flex-wrap items-center gap-3 text-sm">
          <span className="label">Bottle value, USD</span>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            step={1}
            value={bottleText}
            onChange={(e) => setBottleText(e.target.value)}
            className="num min-h-11 w-28 bg-paper px-3 text-md shadow-[inset_0_0_0_1px_var(--color-ink)]"
          />
        </label>
        {breakEven !== null ? (
          <p className="max-w-[64ch]">
            Break-even pull price: <b className="num">{bnb(breakEven)}</b> ({usd(breakEven * m.bnbUsd)}).
            {priceBnb !== null && covered !== null ? (
              covered < 1 ? (
                <>
                  {" "}
                  At {bnb(priceBnb)} a pull, players pay {(covered * 100).toFixed(0)}% of the bottle value they win on
                  average; the house covers {((1 - covered) * 100).toFixed(0)}% at today’s BNB price.
                </>
              ) : (
                <>
                  {" "}
                  At {bnb(priceBnb)} a pull, players pay {covered.toFixed(1)}× the bottle value they win on average at
                  today’s BNB price.
                </>
              )
            ) : null}
          </p>
        ) : (
          <p className="text-sm text-muted">Enter a bottle value above zero.</p>
        )}
        {left !== null && g ? (
          <p className="text-sm text-muted">
            {left} of {g.barrel.totalShares} Extra Añejo bottles are still to win.
          </p>
        ) : null}
      </div>

      <p className="text-sm text-muted">
        Data: CoinMarketCap Pro API · updated {updatedText} ·{" "}
        <a href="https://coinmarketcap.com/currencies/bnb/" target="_blank" rel="noopener noreferrer">
          BNB on CoinMarketCap
        </a>
      </p>
    </section>
  );
}
