"use client";

import Link from "next/link";
import { ErrorNote } from "@/components/ErrorNote";
import { phaseLabel, useContractTx } from "@/hooks/useContractTx";
import { useGame } from "@/hooks/useGame";
import type { Reveal } from "@/hooks/usePlayerActivity";
import { useConnection, useReadContract } from "wagmi";
import { CHAIN, GAME, TIERS, checkReveal, margaritaAbi, txUrl } from "@/lib/contract";
import { formatGroup, formatMinutes, shortHex } from "@/lib/format";
import Image from "next/image";
import { POSTER } from "./Lineup";

export function RevealCard({ reveal, onAnother, still }: { reveal: Reveal; onAnother: () => void; still?: string }) {
  const game = useGame();
  const ageTx = useContractTx();
  const t = TIERS[reveal.tier];
  const check = checkReveal(reveal.roll, reveal.tier);
  const url = txUrl(reveal.txHash);
  const next = reveal.tier < 4 ? TIERS[(reveal.tier + 1) as 2 | 3 | 4] : undefined;
  const ageSecs = reveal.tier < 4 ? game.data?.agingSeconds[reveal.tier as 1 | 2 | 3] : undefined;
  const cost = reveal.tier < 4 ? game.data?.agingCost[reveal.tier as 1 | 2 | 3] : undefined;
  const { address } = useConnection();
  const balance = useReadContract({
    address: GAME,
    abi: margaritaAbi,
    chainId: CHAIN.id,
    functionName: "balanceOf",
    args: address ? [address, BigInt(reveal.tier)] : undefined,
    query: { enabled: Boolean(address) },
  });
  const held = balance.data === undefined ? undefined : Number(balance.data);
  const canAge = cost !== undefined && held !== undefined && held >= cost;
  const ageClosed = reveal.tier === 3 && game.data?.soldOut;

  return (
    <div className="flex flex-col gap-4">
      <p className="label">Your piece</p>
      <div className={`reveal-land flex items-end justify-between gap-4 tier-${reveal.tier} p-4`}>
        <span className="badge">{reveal.tier}</span>
        {still ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={still}
            alt={`A ${t.name} bottle`}
            width={140}
            height={150}
            className="h-[150px] w-[140px] bg-paper object-cover shadow-[inset_0_0_0_2px_var(--color-ink)]"
          />
        ) : (
          <Image
            src={POSTER[reveal.tier]}
            width={448}
            height={560}
            alt={`A ${t.name} bottle`}
            className="aspect-[14/15] h-[150px] w-[140px] bg-paper object-cover shadow-[inset_0_0_0_2px_var(--color-ink)]"
          />
        )}
      </div>
      <h2
        id="pull-title"
        className="text-4xl"
        aria-live="assertive"
      >
        {t.name}
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-rule pt-4 text-sm">
        <dt className="font-semibold text-muted">Roll</dt>
        <dd className="text-right font-mono">{formatGroup(reveal.roll)} of 0 to 9 999</dd>
        <dt className="font-semibold text-muted">Range</dt>
        <dd className="text-right font-mono">
          {check === "soldOut"
            ? `${formatGroup(TIERS[4].from)} to ${formatGroup(TIERS[4].to)} → tier 4, paid as tier 3`
            : `${formatGroup(t.from)} to ${formatGroup(t.to)} → tier ${reveal.tier} ${check === "ok" ? "✓" : "✗"}`}
        </dd>
        <dt className="font-semibold text-muted">Chance</dt>
        <dd className="text-right font-mono">{t.chance}</dd>
        <dt className="font-semibold text-muted">Reveal tx</dt>
        <dd className="text-right font-mono">
          {url ? <a href={url}>{shortHex(reveal.txHash)}</a> : shortHex(reveal.txHash)}
        </dd>
      </dl>

      {ageTx.state.phase === "done" ? (
        <p role="status" className="note">
          Aging started. Finish it in <Link href="/cellar">My cellar</Link>
          {ageSecs ? ` after ${formatMinutes(ageSecs)}` : ""}.
        </p>
      ) : check === "soldOut" ? (
        <p className="note text-sm">
          You rolled an Extra Añejo, but all 100 bottles were already won while your pull was waiting, so the contract
          gave you an Añejo instead.
        </p>
      ) : next && ageClosed ? (
        <p className="note text-sm">All 100 Extra Añejo are issued, so Añejo no longer ages up.</p>
      ) : next && canAge ? (
        <button
          type="button"
          className="btn btn-primary btn-lg w-full"
          disabled={ageTx.busy}
          onClick={() => ageTx.run("startAging", [BigInt(reveal.tier)])}
        >
          {phaseLabel(
            ageTx.state.phase,
            `Age ${cost} → 1 ${next.name}${ageSecs ? ` in ${formatMinutes(ageSecs)}` : ""}`,
          )}
        </button>
      ) : next ? (
        <p className="note text-sm">
          {cost !== undefined && held !== undefined
            ? `${cost} ${t.name} age into 1 ${next.name}. You have ${held}.`
            : `Several ${t.name} age into 1 ${next.name}.`}
        </p>
      ) : (
        <p className="note text-sm">
          The top tier. Redeeming it for a bottle opens once delivery is set up; keep it in your cellar until then.
        </p>
      )}
      {ageTx.state.error ? <ErrorNote error={ageTx.state.error} onDismiss={ageTx.reset} /> : null}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-secondary flex-1" onClick={onAnother}>
          Open another
        </button>
        <Link href="/cellar" className="btn btn-secondary flex-1">
          My cellar
        </Link>
      </div>
    </div>
  );
}
