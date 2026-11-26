"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Hash, TransactionReceipt } from "viem";
import { useConnection, usePublicClient, useWriteContract } from "wagmi";
import { CHAIN, GAME, NATIVE, margaritaAbi } from "@/lib/contract";
import { toFriendlyError, type FriendlyError } from "@/lib/errors";

type WriteName = "pull" | "claimRefund" | "startAging" | "finishAging" | "redeem" | "claimUnclaimed";

export type TxPhase = "idle" | "checking" | "wallet" | "mining" | "done" | "error";

export type TxState = {
  phase: TxPhase;
  hash?: Hash;
  receipt?: TransactionReceipt;
  error?: FriendlyError;
};

export function useContractTx() {
  const publicClient = usePublicClient({ chainId: CHAIN.id });
  const { address } = useConnection();
  const write = useWriteContract();
  const queryClient = useQueryClient();
  const [state, setState] = useState<TxState>({ phase: "idle" });

  const run = useCallback(
    async (functionName: WriteName, args: readonly bigint[] = [], value?: bigint) => {
      if (!publicClient || !address) return undefined;
      try {
        setState({ phase: "checking" });
        const { request } = await publicClient.simulateContract({
          account: address,
          address: GAME,
          abi: margaritaAbi,
          functionName,
          args,
          value,
        } as never);
        setState({ phase: "wallet" });
        const hash = await write.mutateAsync(request as never);
        setState({ phase: "mining", hash });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
          setState({
            phase: "error",
            hash,
            receipt,
            error: {
              title: "Transaction failed",
              body: "The network rejected it and the fee was spent. Your tokens didn’t change.",
              code: "receipt.status = reverted",
            },
          });
          return undefined;
        }
        setState({ phase: "done", hash, receipt });
        await queryClient.invalidateQueries();
        return receipt;
      } catch (err) {
        setState((s) => ({ ...s, phase: "error", error: toFriendlyError(err, NATIVE) }));
        return undefined;
      }
    },
    [publicClient, address, write, queryClient],
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);
  const busy = state.phase === "checking" || state.phase === "wallet" || state.phase === "mining";

  return { run, state, reset, busy };
}

export function phaseLabel(phase: TxPhase, idle: string) {
  switch (phase) {
    case "checking":
      return "Checking…";
    case "wallet":
      return "Confirm in your wallet…";
    case "mining":
      return "Sending…";
    default:
      return idle;
  }
}
