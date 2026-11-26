"use client";

import { useReadContracts } from "wagmi";
import { CHAIN, GAME, margaritaAbi } from "@/lib/contract";

const c = { address: GAME, abi: margaritaAbi, chainId: CHAIN.id } as const;

const LEGACY_AGING_COST = 1;

export function useGame() {
  const q = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...c, functionName: "price" },
      { ...c, functionName: "paused" },
      { ...c, functionName: "barrel" },
      { ...c, functionName: "redeemedCount" },
      { ...c, functionName: "agingTimes", args: [1n] },
      { ...c, functionName: "agingTimes", args: [2n] },
      { ...c, functionName: "agingTimes", args: [3n] },
      { ...c, functionName: "agingCost", args: [1n] },
      { ...c, functionName: "agingCost", args: [2n] },
      { ...c, functionName: "agingCost", args: [3n] },
      { ...c, functionName: "extraAnejoIssued" },
    ],
    query: { refetchInterval: 20_000 },
  });

  const r = q.data;
  const core = r && r.slice(0, 7).every((x) => x.status === "success");
  const data =
    r && core
      ? (() => {
          const price = r[0].result as bigint;
          const paused = r[1].result as boolean;
          const [name, distillery, totalShares] = r[2].result as readonly [string, string, bigint, string];
          const redeemed = Number(r[3].result as bigint);
          const secs = (i: number) => Number(r[i].result as bigint);
          const issued = r[10].status === "success" ? Number(r[10].result as bigint) : undefined;
          const cost = (i: number) => (r[i].status === "success" ? Number(r[i].result as bigint) : LEGACY_AGING_COST);
          return {
            price,
            paused,
            barrel: { name, distillery, totalShares: Number(totalShares) },
            redeemed,
            left: Number(totalShares) - redeemed,
            extraIssued: issued,
            bottlesFree: issued === undefined ? Number(totalShares) - redeemed : Number(totalShares) - issued,
            soldOut: issued !== undefined && issued >= Number(totalShares),
            agingSeconds: { 1: secs(4), 2: secs(5), 3: secs(6) } as Record<1 | 2 | 3, number>,
            agingCost: { 1: cost(7), 2: cost(8), 3: cost(9) } as Record<1 | 2 | 3, number>,
          };
        })()
      : undefined;

  return { data, isLoading: q.isLoading, error: q.error, refetch: q.refetch };
}
