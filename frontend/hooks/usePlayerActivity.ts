"use client";

import { useQuery } from "@tanstack/react-query";
import { getAbiItem, type Address, type Hash, type PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import { CHAIN, GAME, TIER_IDS, asTier, deployment, margaritaAbi, type TierId } from "@/lib/contract";
import { getLogsChunked } from "@/lib/logs";

export type PendingPull = { requestId: bigint; paid: bigint; requestedAt: number };
export type AgingBarrel = { agingId: bigint; tier: TierId; readyAt: number };
export type Reveal = {
  requestId: bigint;
  tier: TierId;
  roll: number;
  txHash: Hash;
  blockNumber: bigint;
  timestamp?: number;
};

export type PlayerActivity = {
  balances: Record<TierId, number>;
  unclaimed: Record<TierId, number>;
  pending: PendingPull[];
  agings: AgingBarrel[];
  reveals: Reveal[];
  refundable: bigint;
  revealsError?: string;
};

const c = { address: GAME, abi: margaritaAbi } as const;
const REVEAL_LIMIT = 20;

function byTier(values: readonly bigint[]): Record<TierId, number> {
  return { 1: Number(values[0]), 2: Number(values[1]), 3: Number(values[2]), 4: Number(values[3]) };
}

async function readViaViews(client: PublicClient, player: Address) {
  const [balances, unclaimed, pullIds, pulls, agingIds, agingList] = await client.readContract({
    ...c,
    functionName: "playerState",
    args: [player],
  });
  return {
    balances: byTier(balances),
    unclaimed: byTier(unclaimed),
    pending: pullIds.map((id, i) => ({
      requestId: id,
      paid: pulls[i].paid,
      requestedAt: Number(pulls[i].requestedAt),
    })),
    agings: agingIds.map((id, i) => ({
      agingId: id,
      tier: asTier(agingList[i].tier),
      readyAt: Number(agingList[i].readyAt),
    })),
  };
}

async function readViaLogs(client: PublicClient, player: Address, latest: bigint) {
  const ids = TIER_IDS.map((t) => BigInt(t));
  const [balances, ...unclaimed] = await Promise.all([
    client.readContract({ ...c, functionName: "balanceOfBatch", args: [ids.map(() => player), ids] }),
    ...ids.map((t) => client.readContract({ ...c, functionName: "unclaimed", args: [player, t] })),
  ]);

  const requested = await getLogsChunked(
    (fromBlock, toBlock) =>
      client.getLogs({
        address: GAME,
        event: getAbiItem({ abi: margaritaAbi, name: "PullRequested" }),
        args: { player },
        fromBlock,
        toBlock,
      }),
    deployment.fromBlock,
    latest,
  );
  const started = await getLogsChunked(
    (fromBlock, toBlock) =>
      client.getLogs({
        address: GAME,
        event: getAbiItem({ abi: margaritaAbi, name: "AgingStarted" }),
        args: { player },
        fromBlock,
        toBlock,
      }),
    deployment.fromBlock,
    latest,
  );

  const pullStates = await Promise.all(
    requested.map((l) => client.readContract({ ...c, functionName: "pendingPulls", args: [l.args.requestId!] })),
  );
  const agingStates = await Promise.all(
    started.map((l) => client.readContract({ ...c, functionName: "agings", args: [l.args.agingId!] })),
  );

  return {
    balances: byTier(balances),
    unclaimed: byTier(unclaimed),
    pending: requested
      .map((l, i) => ({ id: l.args.requestId!, s: pullStates[i] }))
      .filter(({ s }) => s[0].toLowerCase() === player.toLowerCase())
      .map(({ id, s }) => ({ requestId: id, paid: s[1], requestedAt: Number(s[2]) })),
    agings: started
      .map((l, i) => ({ id: l.args.agingId!, s: agingStates[i] }))
      .filter(({ s }) => s[0].toLowerCase() === player.toLowerCase())
      .map(({ id, s }) => ({ agingId: id, tier: asTier(s[1]), readyAt: Number(s[2]) })),
  };
}

async function readReveals(client: PublicClient, player: Address, latest: bigint): Promise<Reveal[]> {
  const logs = await getLogsChunked(
    (fromBlock, toBlock) =>
      client.getLogs({
        address: GAME,
        event: getAbiItem({ abi: margaritaAbi, name: "PullRevealed" }),
        args: { player },
        fromBlock,
        toBlock,
      }),
    deployment.fromBlock,
    latest,
  );
  const recent = logs.slice(-REVEAL_LIMIT).reverse();
  const blocks = [...new Set(recent.map((l) => l.blockNumber!))];
  const times = new Map(
    await Promise.all(
      blocks.map(async (n) => [n, Number((await client.getBlock({ blockNumber: n })).timestamp)] as const),
    ),
  );
  return recent.map((l) => ({
    requestId: l.args.requestId!,
    tier: asTier(l.args.tier!),
    roll: Number(l.args.roll!),
    txHash: l.transactionHash!,
    blockNumber: l.blockNumber!,
    timestamp: times.get(l.blockNumber!),
  }));
}

export function usePlayerActivity(player: Address | undefined) {
  const client = usePublicClient({ chainId: CHAIN.id });
  return useQuery({
    queryKey: ["activity", CHAIN.id, GAME, player],
    enabled: Boolean(client && player),
    refetchInterval: 10_000,
    queryFn: async (): Promise<PlayerActivity> => {
      const latest = await client!.getBlockNumber();
      const [state, refundable] = await Promise.all([
        deployment.hasPlayerViews ? readViaViews(client!, player!) : readViaLogs(client!, player!, latest),
        client!.readContract({ ...c, functionName: "refundable", args: [player!] }).catch(() => 0n),
      ]);

      let reveals: Reveal[] = [];
      let revealsError: string | undefined;
      try {
        reveals = await readReveals(client!, player!, latest);
      } catch (err) {
        revealsError = err instanceof Error ? err.message : String(err);
      }

      state.pending.sort((a, b) => a.requestedAt - b.requestedAt);
      state.agings.sort((a, b) => a.readyAt - b.readyAt);
      return { ...state, refundable, reveals, revealsError };
    },
  });
}
