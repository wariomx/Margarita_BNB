"use client";

import Link from "next/link";
import { useState } from "react";
import { parseEventLogs, type Hash } from "viem";
import { ErrorNote } from "@/components/ErrorNote";
import { BarrelStock } from "@/components/BarrelStock";
import { ConnectWallet } from "@/components/ConnectWallet";
import { RevealCard } from "@/components/RevealCard";
import { phaseLabel, useContractTx } from "@/hooks/useContractTx";
import { useGame } from "@/hooks/useGame";
import { useNow } from "@/hooks/useNow";
import { useRevealWatcher, type RevealWatch } from "@/hooks/useRevealWatcher";
import { useWallet } from "@/hooks/useWallet";
import { CHAIN, NATIVE, PULL_TIMEOUT_SECONDS, margaritaAbi, txUrl } from "@/lib/contract";
import { formatClock, formatDuration, formatNative, shortHex } from "@/lib/format";
import { Lineup } from "./Lineup";
import { PullStage, useReducedMotion } from "./PullStage";
import { toFriendlyError } from "@/lib/errors";

const STILL_WAITING_AFTER = 180;

type ActivePull = { requestId: bigint; fromBlock: bigint; txHash: Hash };

export function PullPanel() {
  const wallet = useWallet();
  const game = useGame();
  const pullTx = useContractTx();
  const refundTx = useContractTx();
  const [active, setActive] = useState<ActivePull>();
  const [shown, setShown] = useState<{ still?: string }>();
  const reducedMotion = useReducedMotion();
  const watch = useRevealWatcher(active?.requestId, active?.fromBlock);
  const data = active ? watch.data : undefined;
  const now = useNow();
  const requestedAt = data?.status === "waiting" ? data.requestedAt : undefined;
  const elapsed = now !== null && requestedAt ? now - requestedAt : 0;
  const stillWaiting = elapsed >= STILL_WAITING_AFTER;

  const sending = !active && (pullTx.state.phase === "mining" || pullTx.state.phase === "done");
  const revealed = data?.status === "revealed" ? data.reveal : undefined;
  const showCard = revealed !== undefined && (reducedMotion || shown !== undefined);
  const stageOn = !reducedMotion && (sending || (active !== undefined && data?.status !== "cancelled" && !showCard));

  const price = game.data?.price;
  const priceText = price === undefined ? "…" : formatNative(price, NATIVE);

  async function pull() {
    if (price === undefined) return;
    const receipt = await pullTx.run("pull", [], price);
    if (!receipt) return;
    const [ev] = parseEventLogs({ abi: margaritaAbi, eventName: "PullRequested", logs: receipt.logs });
    if (ev) setActive({ requestId: ev.args.requestId, fromBlock: receipt.blockNumber, txHash: receipt.transactionHash });
  }

  function reset() {
    setActive(undefined);
    setShown(undefined);
    pullTx.reset();
    refundTx.reset();
  }

  return (
    <aside
      aria-labelledby="pull-title"
      className="grid min-w-0 border-2 border-ink lg:grid-cols-[minmax(0,1fr)_400px]"
    >
      <div className="stage flex min-w-0 flex-col items-center justify-center gap-6 p-4 sm:min-h-[440px] sm:p-10">
        {stageOn ? (
          <div className="flex justify-center">
            <PullStage tier={revealed?.tier} spinning={!stillWaiting} onDone={(still) => setShown({ still })} />
          </div>
        ) : (
          <Lineup
            pick={showCard ? revealed?.tier : undefined}
            waiting={(sending || active !== undefined) && !showCard}
            showOdds={!sending && active === undefined}
            priority
            className="max-w-[760px]"
          />
        )}
        {!stageOn && !sending && active === undefined ? (
          <p className="text-sm text-muted">Agave Barrel, an ERC-1155 on BNB Chain</p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-6 border-t-2 border-ink bg-paper p-6 sm:p-8 lg:border-l-2 lg:border-t-0">
      {showCard && revealed ? (
        <RevealCard reveal={revealed} onAnother={reset} still={shown?.still} />
      ) : revealed ? (
        <h2 id="pull-title" className="text-2xl" role="status">
          Opening your barrel
        </h2>
      ) : active ? (
        <ActivePullView
          active={active}
          data={data}
          now={now}
          elapsed={elapsed}
          stillWaiting={stillWaiting}
          reducedMotion={reducedMotion}
          onDone={reset}
          refundTx={refundTx}
        />
      ) : sending ? (
        <div className="flex flex-col gap-3">
          <h2 id="pull-title" className="text-2xl" role="status">
            Barrel thrown
          </h2>
          <p>Your pull is on its way to {CHAIN.name}. The roll starts once it is in a block.</p>
        </div>
      ) : (
        <>
          <h2 id="pull-title" className="text-xl">
            One pull
          </h2>
          <div className="flex flex-col gap-2">
            <span className="label">Price, read from the contract</span>
            <span className="num text-4xl" aria-live="polite">
              {priceText}
            </span>
            <span className="text-sm text-muted">Plus the network fee. The amount must match exactly.</span>
          </div>

          {game.data?.soldOut ? (
            <div className="flex flex-col gap-3">
              <button type="button" className="btn w-full" disabled>
                Sold out
              </button>
              <p className="text-sm text-muted">
                All {game.data.barrel.totalShares} bottles already have an Extra Añejo, so pulls are closed. Tokens you
                hold still age in <Link href="/cellar">My cellar</Link>, up to Añejo.
              </p>
            </div>
          ) : wallet.status === "disconnected" || wallet.status === "connecting" ? (
            <div className="flex flex-col gap-3">
              <ConnectWallet label="Connect wallet to pull" className="btn btn-primary btn-lg w-full" />
              <p className="text-sm text-muted">
                Binance Wallet, MetaMask, Rabby or any browser wallet on {CHAIN.name}. Need test BNB?{" "}
                <a href="https://www.bnbchain.org/en/testnet-faucet">Testnet faucet</a>
              </p>
              {wallet.connectError ? (
                <p role="alert" className="note text-sm">
                  {toFriendlyError(wallet.connectError, NATIVE).code.startsWith("UserRejected")
                    ? "You cancelled in your wallet. Nothing was connected."
                    : "No browser wallet answered. Install MetaMask or Rabby, then try again."}
                </p>
              ) : null}
            </div>
          ) : wallet.status === "wrongNetwork" ? (
            <div className="flex flex-col gap-3">
              <p className="font-semibold">Your wallet is on another network.</p>
              <button type="button" className="btn btn-primary btn-lg w-full" onClick={wallet.switchToTarget} disabled={wallet.isSwitching}>
                {wallet.isSwitching ? "Switching…" : `Switch to ${CHAIN.name}`}
              </button>
              <p className="font-mono text-sm text-muted">chainId {CHAIN.id}</p>
            </div>
          ) : game.data?.paused ? (
            <div className="flex flex-col gap-3">
              <button type="button" className="btn w-full" disabled>
                Pulls are paused
              </button>
              <p className="text-sm text-muted">
                The owner paused new pulls, aging and redeeming. You can still finish aging barrels and claim refunds in{" "}
                <Link href="/cellar">My cellar</Link>.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                className="btn btn-primary btn-lg w-full"
                onClick={pull}
                disabled={pullTx.busy || price === undefined}
                aria-busy={pullTx.busy}
              >
                {phaseLabel(pullTx.state.phase, `Open one barrel for ${priceText}`)}
              </button>
              {wallet.balance !== undefined && price !== undefined && wallet.balance < price ? (
                <p className="text-sm">
                  Not enough {NATIVE}. <a href="https://www.bnbchain.org/en/testnet-faucet">Get test BNB</a>
                </p>
              ) : (
                <p className="text-sm text-muted">
                  If Chainlink doesn’t answer within an hour, the pull can be cancelled and your {NATIVE} returned.
                </p>
              )}
              {pullTx.state.error ? <ErrorNote error={pullTx.state.error} onDismiss={pullTx.reset} /> : null}
            </div>
          )}

          <BarrelStock />
        </>
      )}
      </div>
    </aside>
  );
}

function ActivePullView({
  active,
  data,
  now,
  elapsed,
  stillWaiting,
  onDone,
  refundTx,
}: {
  active: ActivePull;
  data: RevealWatch | undefined;
  now: number | null;
  elapsed: number;
  stillWaiting: boolean;
  reducedMotion: boolean;
  onDone: () => void;
  refundTx: ReturnType<typeof useContractTx>;
}) {
  if (data?.status === "cancelled") {
    return (
      <div className="flex flex-col gap-4">
        <h2 id="pull-title" className="text-2xl">
          Pull cancelled
        </h2>
        <p>
          Chainlink never answered, so the owner cancelled this pull and credited your {NATIVE}. A late answer is ignored;
          there is no reroll.
        </p>
        {refundTx.state.phase === "done" ? (
          <p role="status" className="note">
            Refund sent to your wallet.
          </p>
        ) : (
          <button type="button" className="btn btn-primary btn-lg w-full" disabled={refundTx.busy} onClick={() => refundTx.run("claimRefund")}>
            {phaseLabel(refundTx.state.phase, "Claim refund")}
          </button>
        )}
        {refundTx.state.error ? <ErrorNote error={refundTx.state.error} onDismiss={refundTx.reset} /> : null}
        <button type="button" className="btn btn-secondary w-full" onClick={onDone}>
          Back to the barrel
        </button>
      </div>
    );
  }

  const requestedAt = data?.status === "waiting" ? data.requestedAt : undefined;
  const cancelFrom = requestedAt ? requestedAt + PULL_TIMEOUT_SECONDS : undefined;
  const overdue = cancelFrom !== undefined && now !== null && now >= cancelFrom;
  const pullUrl = txUrl(active.txHash);

  return (
    <div className="flex flex-col gap-4">
      <h2 id="pull-title" className="text-2xl">
        {stillWaiting ? "Taking longer than usual" : "Drawing your barrel"}
      </h2>
      <p>
        {stillWaiting
          ? `Chainlink hasn’t answered yet. Your ${NATIVE} stays held by the contract for this pull.`
          : "Chainlink VRF is rolling. This usually takes under a minute."}
      </p>
      <p className="num text-3xl" role="timer" aria-live="off">
        {requestedAt && now !== null ? formatDuration(elapsed) : "…"}
      </p>
      <dl className="grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-rule pt-4 text-sm">
        <dt className="font-semibold text-muted">Pull tx</dt>
        <dd className="text-right font-mono">{pullUrl ? <a href={pullUrl}>{shortHex(active.txHash)}</a> : shortHex(active.txHash)}</dd>
        <dt className="font-semibold text-muted">Request</dt>
        <dd className="text-right font-mono">{shortHex(active.requestId)}</dd>
        {stillWaiting && cancelFrom ? (
          <>
            <dt className="font-semibold text-muted">Can be cancelled from</dt>
            <dd className="text-right font-mono">{formatClock(cancelFrom)}</dd>
          </>
        ) : null}
      </dl>
      {stillWaiting ? (
        <p className="text-sm text-muted">
          {overdue
            ? `No answer for over an hour. The owner can now cancel this pull; your ${NATIVE} is then credited and you claim it here or in My cellar.`
            : `If there’s still no answer an hour after your pull, the owner can cancel it and your ${NATIVE} is credited back to you.`}
        </p>
      ) : null}
      <p className="text-sm text-muted">
        You can leave. The result will be in <Link href="/cellar">My cellar</Link>.
      </p>
    </div>
  );
}
