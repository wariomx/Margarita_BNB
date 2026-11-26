"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Abi, Address } from "viem";
import { useConnection, usePublicClient, useWriteContract } from "wagmi";
import { CHAIN, NATIVE } from "@/lib/contract";
import { toFriendlyError } from "@/lib/errors";
import type { TxState } from "./useContractTx";

export function useAnyTx() {
  const publicClient = usePublicClient({ chainId: CHAIN.id });
  const { address } = useConnection();
  const write = useWriteContract();
  const queryClient = useQueryClient();
  const [state, setState] = useState<TxState>({ phase: "idle" });

  const run = useCallback(
    async (target: Address, abi: Abi, functionName: string, args: readonly unknown[] = []) => {
      if (!publicClient || !address) return undefined;
      try {
        setState({ phase: "checking" });
        const { request } = await publicClient.simulateContract({ account: address, address: target, abi, functionName, args } as never);
        setState({ phase: "wallet" });
        const hash = await write.mutateAsync(request as never);
        setState({ phase: "mining", hash });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
          setState({
            phase: "error",
            hash,
            receipt,
            error: { title: "Transaction failed", body: "The network rejected it and the fee was spent. Your tokens didn’t change.", code: "receipt.status = reverted" },
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
  return { state, run, reset, busy };
}
