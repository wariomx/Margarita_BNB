"use client";

import { PrizeVaultPanel } from "@/components/PrizeVaultPanel";
import Link from "next/link";
import { ConnectWallet } from "@/components/ConnectWallet";
import { ErrorNote } from "@/components/ErrorNote";
import { phaseLabel, useContractTx } from "@/hooks/useContractTx";
import { useGame } from "@/hooks/useGame";
import { useNow } from "@/hooks/useNow";
import { usePlayerActivity, type AgingBarrel, type PendingPull, type Reveal } from "@/hooks/usePlayerActivity";
import { useWallet } from "@/hooks/useWallet";
import {
  CHAIN,
  NATIVE,
  PULL_TIMEOUT_SECONDS,
  TIERS,
  TIER_IDS,
  deployment,
  checkReveal,
  rollToTier,
  txUrl,
  type TierId,
} from "@/lib/contract";
import { formatClock, formatDuration, formatGroup, formatMinutes, formatNative, shortHex } from "@/lib/format";
import Image from "next/image";
import { Lineup, POSTER } from "./Lineup";
import { TierLabel, TierSwatch } from "./TierSwatch";

export function CellarView() {
  const wallet = useWallet();
  const activity = usePlayerActivity(wallet.status === "ready" ? wallet.address : undefined);

  if (wallet.status === "connecting") {
    return (
      <div className="flex flex-col gap-2 py-6" aria-busy="true">
        <p className="font-display text-xl font-extrabold">Checking your wallet…</p>
      </div>
    );
  }
  if (wallet.status === "disconnected") {
    return (
      <Gate title="Connect a wallet" body="Your tokens, aging barrels and pending pulls show up here.">
        <ConnectWallet className="btn btn-primary" />
      </Gate>
    );
  }
  if (wallet.status === "wrongNetwork") {
    return (
      <Gate title="Wrong network" body={`Your wallet is on another chain. Margarita runs on ${CHAIN.name} only.`}>
        <button type="button" className="btn btn-primary" onClick={wallet.switchToTarget} disabled={wallet.isSwitching}>
          {wallet.isSwitching ? "Switching…" : `Switch to ${CHAIN.name}`}
        </button>
      </Gate>
    );
  }

  if (activity.isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <div className="flex flex-col gap-2">
        <p className="font-display text-xl font-extrabold">Reading your barrels from the chain…</p>
        <p className="font-mono text-sm text-muted">
          {deployment.hasPlayerViews
            ? "playerState(" + shortHex(wallet.address ?? "") + ")"
            : `Scanning events for ${shortHex(wallet.address ?? "")} since block ${formatGroup(Number(deployment.fromBlock))}`}
        </p>
        </div>
        <div aria-hidden="true" className="grid gap-[2px] bg-ink p-[2px] sm:grid-cols-2 lg:grid-cols-4">
          {TIER_IDS.map((t) => (
            <div key={t} className="h-[360px] animate-pulse bg-paper-2" />
          ))}
        </div>
      </div>
    );
  }

  if (activity.isError || !activity.data) {
    return (
      <div className="panel-hard flex flex-wrap items-center gap-x-8 gap-y-4 p-6">
        <div className="flex flex-[1_1_400px] flex-col gap-1.5">
          <p className="font-display text-xl font-extrabold">Couldn’t read your cellar</p>
          <p className="text-sm text-muted">
            The RPC didn’t answer. Your tokens are safe; only this view is missing.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => activity.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const a = activity.data;
  const holdsAny = TIER_IDS.some((t) => a.balances[t] > 0);
  const isEmpty =
    !holdsAny && a.pending.length === 0 && a.agings.length === 0 && a.reveals.length === 0 && a.refundable === 0n;

  if (isEmpty) {
    return (
      <Gate title="No barrels yet" body="Your tokens, aging barrels and pending pulls show up here.">
        <Link href="/open" className="btn btn-primary btn-lg">
          Open a barrel
        </Link>
      </Gate>
    );
  }

  return (
    <div className="flex flex-col gap-16">
      <RefundBanner amount={a.refundable} />
      <UnclaimedBanner unclaimed={a.unclaimed} />
      <Shelf balances={a.balances} />
      <PrizeVaultPanel balances={a.balances} />
      <AgingNow agings={a.agings} />
      <WaitingForRoll pending={a.pending} />
      <Reveals reveals={a.reveals} error={a.revealsError} />
    </div>
  );
}

function Gate({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="grid items-center gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex flex-col items-start gap-4">
        <h2 className="text-3xl">{title}</h2>
        <p className="text-lg text-ink-2">{body}</p>
        {children}
      </div>
      <div className="stage flex justify-center border-2 border-ink px-6 pb-6 pt-10">
        <Lineup priority className="max-w-[560px]" />
      </div>
    </div>
  );
}

function SectionHead({ id, title, note }: { id: string; title: string; note?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 id={id} className="text-3xl">
        {title}
      </h2>
      {note ? <p className="text-muted">{note}</p> : null}
    </div>
  );
}

function RefundBanner({ amount }: { amount: bigint }) {
  const tx = useContractTx();
  if (amount === 0n) return null;
  const value = formatNative(amount, NATIVE);
  return (
    <div className="panel-hard flex flex-wrap items-center gap-x-8 gap-y-4 p-6">
      <div className="flex flex-[1_1_400px] flex-col gap-2">
        <p className="font-display text-xl font-extrabold">{value} is waiting for you</p>
        <p className="text-sm text-muted">
          Chainlink never answered one of your pulls, so the owner cancelled it and credited what you paid.
        </p>
      </div>
      <button type="button" className="btn btn-primary" disabled={tx.busy} onClick={() => tx.run("claimRefund")}>
        {phaseLabel(tx.state.phase, `Claim ${value}`)}
      </button>
      {tx.state.error ? <ErrorNote error={tx.state.error} onDismiss={tx.reset} /> : null}
    </div>
  );
}

function UnclaimedBanner({ unclaimed }: { unclaimed: Record<TierId, number> }) {
  const tx = useContractTx();
  const held = TIER_IDS.filter((t) => unclaimed[t] > 0);
  if (held.length === 0) return null;
  return (
    <div className="panel-hard flex flex-col gap-4 p-6">
      {held.map((t) => (
        <div key={t} className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex flex-[1_1_400px] flex-col gap-2">
            <p className="font-display text-xl font-extrabold">
              {unclaimed[t]} {TIERS[t].name} {unclaimed[t] === 1 ? "is" : "are"} waiting for you
            </p>
            <p className="text-sm text-muted">
              Your wallet contract didn’t accept the token when it was revealed, so the contract kept it for you.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={tx.busy}
            onClick={() => tx.run("claimUnclaimed", [BigInt(t)])}
          >
            {phaseLabel(tx.state.phase, `Claim ${TIERS[t].name}`)}
          </button>
        </div>
      ))}
      {tx.state.error ? <ErrorNote error={tx.state.error} onDismiss={tx.reset} /> : null}
    </div>
  );
}

function Shelf({ balances }: { balances: Record<TierId, number> }) {
  return (
    <section aria-labelledby="shelf-title" className="flex flex-col gap-6">
      <SectionHead id="shelf-title" title="On the shelf" />
      <div className="grid gap-[2px] bg-ink p-[2px] sm:grid-cols-2 lg:grid-cols-4">
        {TIER_IDS.map((t) => (
          <ShelfCard key={t} tier={t} count={balances[t]} />
        ))}
      </div>
    </section>
  );
}

function ShelfCard({ tier, count }: { tier: TierId; count: number }) {
  const game = useGame();
  const tx = useContractTx();
  const t = TIERS[tier];
  const paused = game.data?.paused;
  const secs = tier < 4 ? game.data?.agingSeconds[tier as 1 | 2 | 3] : undefined;
  const cost = tier < 4 ? game.data?.agingCost[tier as 1 | 2 | 3] : undefined;
  const next = tier < 4 ? TIERS[(tier + 1) as 2 | 3 | 4].name : undefined;
  const canAge = cost !== undefined && count >= cost;
  const ageClosed = tier === 3 && game.data?.soldOut;

  return (
    <article className="flex min-w-0 flex-col bg-paper">
      <div className="stage flex justify-center px-6 pt-6">
        <Image
          src={POSTER[tier]}
          width={448}
          height={560}
          alt={`${t.name} bottle`}
          sizes="(min-width: 64rem) 160px, 40vw"
          className={`aspect-[4/5] w-3/5 object-cover ${count === 0 ? "opacity-40" : ""}`}
        />
      </div>
      <TierSwatch tier={tier} className="h-3 w-full" />
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl">{t.name}</h3>
          <span className="badge">{tier}</span>
        </div>
        <p className={`num text-4xl ${count === 0 ? "text-muted" : ""}`}>× {count}</p>
        {next ? (
          <>
            <button
              type="button"
              className="btn btn-primary mt-auto"
              disabled={!canAge || paused || ageClosed || tx.busy}
              onClick={() => tx.run("startAging", [BigInt(tier)])}
            >
              {phaseLabel(tx.state.phase, `Age ${cost ?? "…"} → 1 ${next}`)}
            </button>
            <p className="text-sm text-muted">
              {ageClosed
                ? `All ${game.data?.barrel.totalShares ?? 100} Extra Añejo are issued, so Añejo no longer ages up.`
                : cost === undefined
                  ? "…"
                  : canAge
                    ? `Takes ${secs ? formatMinutes(secs) : "…"}. ${cost} ${t.name} are burned now; 1 ${next} is minted when you finish.`
                    : `You need ${cost} ${t.name} to age (you have ${count}).${secs ? ` Takes ${formatMinutes(secs)}.` : ""}`}
            </p>
          </>
        ) : (
          <>
            <button type="button" className="btn mt-auto" disabled>
              Redeem opens soon
            </button>
            <p className="text-sm text-muted">
              Redeeming burns the token for a bottle. It opens once delivery is set up.
              {game.data ? ` ${game.data.left} of ${game.data.barrel.totalShares} bottles are still in the barrel.` : ""}
            </p>
          </>
        )}
        {paused ? <p className="note text-sm">Paused by the owner.</p> : null}
        {tx.state.error ? <ErrorNote error={tx.state.error} onDismiss={tx.reset} /> : null}
      </div>
    </article>
  );
}

function AgingNow({ agings }: { agings: AgingBarrel[] }) {
  const game = useGame();
  const now = useNow();
  if (agings.length === 0) return null;
  return (
    <section aria-labelledby="aging-title" className="flex flex-col gap-4">
      <SectionHead
        id="aging-title"
        title="Aging now"
        note="Come back and finish each barrel; nothing is collected automatically."
      />
      <div className="overflow-x-auto">
        <table className="co min-w-[760px]">
          <thead>
            <tr>
              <th scope="col">Barrel</th>
              <th scope="col">In → out</th>
              <th scope="col">Ready at</th>
              <th scope="col">Progress</th>
              <th scope="col">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {agings.map((b) => (
              <AgingRow
                key={b.agingId.toString()}
                barrel={b}
                now={now}
                total={game.data?.agingSeconds[b.tier as 1 | 2 | 3]}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AgingRow({ barrel, now, total }: { barrel: AgingBarrel; now: number | null; total?: number }) {
  const tx = useContractTx();
  const left = now === null ? undefined : barrel.readyAt - now;
  const ready = left !== undefined && left <= 0;
  const pct =
    total && left !== undefined ? Math.min(100, Math.max(0, ((total - left) / total) * 100)) : ready ? 100 : 0;
  const out = (barrel.tier + 1) as TierId;

  return (
    <tr>
      <td className="num">#{barrel.agingId.toString()}</td>
      <td>
        <span className="inline-flex flex-wrap items-center gap-2">
          <TierLabel tier={barrel.tier} strong={false} /> → <TierLabel tier={out} strong={false} />
        </span>
      </td>
      <td className="num">{formatClock(barrel.readyAt)}</td>
      <td>
        <span className="flex items-center gap-3">
          <span
            className="relative h-3 w-40 bg-paper-2 shadow-[inset_0_0_0_1px_var(--color-ink)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            aria-label={`Barrel ${barrel.agingId} aging`}
          >
            <span className="absolute inset-y-0 left-0 bg-wood-3" style={{ width: `${pct}%` }} />
          </span>
          {ready ? (
            <b>Ready</b>
          ) : (
            <span className="num">{left === undefined ? "…" : `${formatDuration(left)} left`}</span>
          )}
        </span>
      </td>
      <td className="text-right">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!ready || tx.busy}
          onClick={() => tx.run("finishAging", [barrel.agingId])}
        >
          {phaseLabel(tx.state.phase, "Finish aging")}
        </button>
        {tx.state.error ? (
          <div className="mt-2 text-left">
            <ErrorNote error={tx.state.error} onDismiss={tx.reset} />
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function WaitingForRoll({ pending }: { pending: PendingPull[] }) {
  const now = useNow();
  if (pending.length === 0) return null;
  return (
    <section aria-labelledby="pending-title" className="flex flex-col gap-4">
      <SectionHead
        id="pending-title"
        title="Waiting for a roll"
        note={`Chainlink usually answers within a minute. After an hour without an answer the owner can cancel a pull and credit your ${NATIVE}.`}
      />
      <div className="overflow-x-auto">
        <table className="co min-w-[760px]">
          <thead>
            <tr>
              <th scope="col">Request</th>
              <th scope="col">Paid</th>
              <th scope="col">Pulled at</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((p) => (
              <PendingRow key={p.requestId.toString()} pull={p} now={now} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PendingRow({ pull, now }: { pull: PendingPull; now: number | null }) {
  const elapsed = now === null ? undefined : now - pull.requestedAt;
  const overdue = elapsed !== undefined && elapsed >= PULL_TIMEOUT_SECONDS;

  return (
    <tr>
      <td className="num">{shortHex(pull.requestId)}</td>
      <td className="num">{formatNative(pull.paid, NATIVE)}</td>
      <td className="num">{formatClock(pull.requestedAt)}</td>
      <td>
        {elapsed === undefined ? (
          "…"
        ) : overdue ? (
          <>
            <b>No answer for {formatMinutes(elapsed)}</b>, waiting for the owner to cancel
          </>
        ) : (
          `Waiting for Chainlink, ${formatDuration(elapsed)}`
        )}
      </td>
    </tr>
  );
}

function Reveals({ reveals, error }: { reveals: Reveal[]; error?: string }) {
  if (reveals.length === 0 && !error) return null;
  return (
    <section aria-labelledby="reveals-title" className="flex flex-col gap-4">
      <SectionHead id="reveals-title" title="Reveals" />
      {error ? (
        <p className="note text-sm">Couldn’t load the reveal history. Balances above are current.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="co min-w-[760px]">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Tier</th>
                <th scope="col">Roll</th>
                <th scope="col">Check</th>
                <th scope="col">Transaction</th>
              </tr>
            </thead>
            <tbody>
              {reveals.map((r) => {
                const check = checkReveal(r.roll, r.tier);
                const url = txUrl(r.txHash);
                return (
                  <tr key={r.requestId.toString()}>
                    <td className="num">{r.timestamp ? formatClock(r.timestamp) : `block ${r.blockNumber}`}</td>
                    <td>
                      <TierLabel tier={r.tier} strong={r.tier >= 3} />
                    </td>
                    <td className="num">{formatGroup(r.roll)}</td>
                    <td>
                      rollToTier({formatGroup(r.roll)}) = {rollToTier(r.roll)}{" "}
                      {check === "ok" ? "✓" : check === "soldOut" ? "→ 3, sold out ✓" : "✗ mismatch"}
                    </td>
                    <td className="num">{url ? <a href={url}>{shortHex(r.txHash)}</a> : shortHex(r.txHash)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
