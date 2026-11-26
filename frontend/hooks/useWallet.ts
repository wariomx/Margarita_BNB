"use client";

import { useMounted } from "./useNow";
import { useBalance, useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { CHAIN } from "@/lib/contract";

export type WalletStatus = "connecting" | "disconnected" | "wrongNetwork" | "ready";

export function useWallet() {
  const connection = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const balance = useBalance({
    address: connection.address,
    chainId: CHAIN.id,
    query: { enabled: Boolean(connection.address), refetchInterval: 15_000 },
  });

  const mounted = useMounted();

  let status: WalletStatus;
  if (!mounted || connection.status === "connecting" || connection.status === "reconnecting") status = "connecting";
  else if (!connection.isConnected || !connection.address) status = "disconnected";
  else if (connection.chainId !== CHAIN.id) status = "wrongNetwork";
  else status = "ready";

  return {
    status,
    address: connection.address,
    balance: balance.data?.value,
    refetchBalance: balance.refetch,
    connect: () => {
      const connector = connectors[0];
      if (connector) connect.mutate({ connector });
    },
    connectError: connect.error,
    isConnecting: connect.isPending,
    disconnect: () => disconnect.mutate({}),
    switchToTarget: () => switchChain.mutate({ chainId: CHAIN.id }),
    isSwitching: switchChain.isPending,
    switchError: switchChain.error,
  };
}
