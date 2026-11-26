"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatUnits, parseEventLogs, type Abi, type Address, type Hex } from "viem";
import { useConnection, useReadContract } from "wagmi";
import { ErrorNote } from "@/components/ErrorNote";
import { useAnyTx } from "@/hooks/useAnyTx";
import { phaseLabel } from "@/hooks/useContractTx";
import { CHAIN, GAME, TIERS, margaritaAbi, txUrl, type TierId } from "@/lib/contract";
import { PRIZES, VAULT_TIERS, vaultAddress } from "@/lib/prizes";
import { vaultAbi } from "@/lib/vaultAbi";

type QuoteResponse = {
  prize: string;
  symbol: string;
  priceUsd: number;
  updatedAt: string | null;
  source: string;
  quote: { token: Address; priceUsd: string; expiry: string; nonce: string };
  signature: Hex;
};

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 4 : 2 })}`;

export function PrizeVaultPanel({ balances }: { balances: Record<TierId, number> }) {
  const vault = vaultAddress();
  const { address } = useConnection();
  const prizes = PRIZES.filter((p) => p.address && p.cmcId);
  const owned = VAULT_TIERS.filter((t) => balances[t] > 0);
  const [pickedTier, setTier] = useState<TierId>();
  const tier: TierId = pickedTier && owned.includes(pickedTier as 1 | 2 | 3) ? pickedTier : (owned[0] ?? 1);
  const [pickedAmount, setAmount] = useState(1);
  const [prizeKey, setPrizeKey] = useState(prizes[0]?.key ?? "");
  const tx = useAnyTx();
  const [done, setDone] = useState<{ payout: string; symbol: string; hash: string }>();

  const tierUsd = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "tierUsd",
    args: [tier],
    chainId: CHAIN.id,
    query: { enabled: Boolean(vault) },
  });
  const approved = useReadContract({
    address: GAME,
    abi: margaritaAbi,
    functionName: "isApprovedForAll",
    args: address && vault ? [address, vault] : undefined,
    chainId: CHAIN.id,
    query: { enabled: Boolean(address && vault) },
  });
  const quote = useQuery({
    queryKey: ["prize-quote", prizeKey],
    enabled: Boolean(vault && prizeKey && owned.length > 0),
    refetchInterval: 60_000,
    queryFn: async (): Promise<QuoteResponse> => {
      const r = await fetch(`/api/quote?token=${prizeKey}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
  });

  if (!vault || prizes.length === 0) return null;

  const max = balances[tier] ?? 0;
  const amount = Math.max(1, Math.min(max, pickedAmount));
  const valueUsd = tierUsd.data !== undefined ? Number(formatUnits(tierUsd.data as bigint, 18)) * amount : undefined;
  const payout = valueUsd !== undefined && quote.data ? valueUsd / quote.data.priceUsd : undefined;

  const prize = prizes.find((p) => p.key === prizeKey);

  async function swap() {
    if (!vault) return;
    setDone(undefined);
    if (!approved.data) {
      const ok = await tx.run(GAME, margaritaAbi as Abi, "setApprovalForAll", [vault, true]);
      if (!ok) return;
      await approved.refetch();
    }
    const fresh = await quote.refetch();
    const q = fresh.data;
    if (!q) return;
    const receipt = await tx.run(vault, vaultAbi as Abi, "claim", [
      tier,
      BigInt(amount),
      { token: q.quote.token, priceUsd: BigInt(q.quote.priceUsd), expiry: BigInt(q.quote.expiry), nonce: BigInt(q.quote.nonce) },
      q.signature,
    ]);
    if (!receipt) return;
    const [ev] = parseEventLogs({ abi: vaultAbi, eventName: "Claimed", logs: receipt.logs });
    setDone({ payout: ev ? Number(formatUnits(ev.args.payout, 18)).toFixed(4) : "", symbol: q.symbol, hash: receipt.transactionHash });
  }

  return (
    <section aria-labelledby="vault-h" className="panel flex flex-col gap-4 p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h2 id="vault-h" className="font-display text-[24px] font-extrabold leading-tight">
          Swap tokens for tokenized stocks
        </h2>
        <p className="text-[15px] text-muted">
          Trade Blanco, Reposado or Añejo for test tokenized stocks or BNB ecosystem tokens at a live CoinMarketCap price, settled on BNB Chain by the
          prize vault. Extra Añejo stays for the bottle.
        </p>
      </div>

      {owned.length === 0 ? (
        <p className="text-[15px]">Open a barrel to get Blanco, Reposado or Añejo to swap.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="label">Token</span>
            <select className="min-h-11 w-full border-2 border-ink bg-paper px-3 text-[15px]" value={tier} onChange={(e) => { setTier(Number(e.target.value) as TierId); setAmount(1); }}>
              {owned.map((t) => (
                <option key={t} value={t}>
                  {TIERS[t].name} · you hold {balances[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label">Amount</span>
            <input className="min-h-11 w-full border-2 border-ink bg-paper px-3 text-[15px]" type="number" min={1} max={max} value={amount} onChange={(e) => setAmount(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label">Prize</span>
            <select className="min-h-11 w-full border-2 border-ink bg-paper px-3 text-[15px]" value={prizeKey} onChange={(e) => setPrizeKey(e.target.value)}>
              {prizes.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.symbol} · {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {owned.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="font-semibold text-muted">Value</dt>
          <dd className="num text-right">{valueUsd !== undefined ? usd(valueUsd) : "…"}</dd>
          <dt className="font-semibold text-muted">{prize?.symbol ?? "Prize"} price</dt>
          <dd className="num text-right">{quote.data ? usd(quote.data.priceUsd) : quote.isError ? "unavailable" : "…"}</dd>
          <dt className="font-semibold text-muted">You receive</dt>
          <dd className="num text-right text-lg">{payout !== undefined ? `${payout.toFixed(4)} ${prize?.symbol}` : "…"}</dd>
        </dl>
      ) : null}

      {quote.data ? (
        <p className="text-xs text-muted">
          Price from {quote.data.source}
          {quote.data.updatedAt ? `, updated ${new Date(quote.data.updatedAt).toLocaleTimeString()}` : ""}. Signed by the Margarita price service and checked on chain; the quote is
          valid for 2 minutes.
        </p>
      ) : null}

      {owned.length > 0 ? (
        <button type="button" className="btn btn-primary w-full" disabled={tx.busy || !quote.data || payout === undefined} onClick={swap}>
          {phaseLabel(tx.state.phase, approved.data ? `Swap ${amount} ${TIERS[tier].name} for ${prize?.symbol}` : `Approve and swap`)}
        </button>
      ) : null}
      {tx.state.error ? <ErrorNote error={tx.state.error} onDismiss={tx.reset} /> : null}
      {done ? (
        <p role="status" className="panel p-4 text-[15px]">
          Received {done.payout} {done.symbol}.{" "}
          {txUrl(done.hash) ? <a href={txUrl(done.hash)}>See the transaction</a> : null}
        </p>
      ) : null}
    </section>
  );
}
