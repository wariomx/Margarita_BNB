"use client";

import { useQuery } from "@tanstack/react-query";
import { getAbiItem, zeroAddress } from "viem";
import { usePublicClient } from "wagmi";
import { CHAIN, GAME, asTier, margaritaAbi } from "@/lib/contract";
import type { Reveal } from "./usePlayerActivity";

export type RevealWatch =
  | { status: "waiting"; requestedAt: number }
  | { status: "revealed"; reveal: Reveal }
  | { status: "cancelled" };

export function useRevealWatcher(requestId: bigint | undefined, fromBlock: bigint | undefined) {
  const client = usePublicClient({ chainId: CHAIN.id });
  return useQuery({
    queryKey: ["reveal", CHAIN.id, GAME, requestId?.toString()],
    enabled: Boolean(client && requestId !== undefined && fromBlock !== undefined),
    refetchInterval: (q) => (q.state.data && q.state.data.status !== "waiting" ? false : 3_000),
    queryFn: async (): Promise<RevealWatch> => {
      const findReveal = async (): Promise<RevealWatch | undefined> => {
        const [log] = await client!.getLogs({
          address: GAME,
          event: getAbiItem({ abi: margaritaAbi, name: "PullRevealed" }),
          args: { requestId },
          fromBlock,
          toBlock: "latest",
        });
        if (!log) return undefined;
        const block = await client!.getBlock({ blockNumber: log.blockNumber! });
        return {
          status: "revealed",
          reveal: {
            requestId: requestId!,
            tier: asTier(log.args.tier!),
            roll: Number(log.args.roll!),
            txHash: log.transactionHash!,
            blockNumber: log.blockNumber!,
            timestamp: Number(block.timestamp),
          },
        };
      };

      const revealed = await findReveal();
      if (revealed) return revealed;
      const [player, , requestedAt] = await client!.readContract({
        address: GAME,
        abi: margaritaAbi,
        functionName: "pendingPulls",
        args: [requestId!],
      });
      if (player !== zeroAddress) return { status: "waiting", requestedAt: Number(requestedAt) };
      return (await findReveal()) ?? { status: "cancelled" };
    },
  });
}
