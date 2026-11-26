"use client";

import { useMounted } from "./useNow";
import { useBalance, useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { CHAIN } from "@/lib/contract";
import { BINANCE_IN_APP, binanceInAppProvider } from "@/lib/wagmi";

export type WalletStatus = "connecting" | "disconnected" | "wrongNetwork" | "ready";

export type WalletOption = { id: string; name: string; icon?: string };

function rank(w: WalletOption) {
  const key = `${w.id} ${w.name}`.toLowerCase();
  if (key.includes("binance")) return 0;
  if (key.includes("metamask")) return 1;
  return 2;
}

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
  if (!mounted || connection.status === "reconnecting") status = "connecting";
  else if (!connection.isConnected || !connection.address) status = "disconnected";
  else if (connection.chainId !== CHAIN.id) status = "wrongNetwork";
  else status = "ready";

  const announced = connectors.filter((c) => c.id !== "injected" && c.id !== BINANCE_IN_APP);
  const hasBinance = announced.some((c) => c.name.toLowerCase().includes("binance"));
  const inApp = !hasBinance && mounted && binanceInAppProvider() ? connectors.filter((c) => c.id === BINANCE_IN_APP) : [];
  const found = [...inApp, ...announced];
  const hasInjected = mounted && typeof window !== "undefined" && Boolean((window as { ethereum?: unknown }).ethereum);
  const usable = !mounted ? [] : found.length > 0 ? found : hasInjected ? connectors.filter((c) => c.id === "injected") : [];
  const wallets: WalletOption[] = usable
    .map((c) => ({ id: c.id, name: c.id === "injected" ? "Browser wallet" : c.name, icon: c.icon }))
    .sort((a, b) => rank(a) - rank(b));

  const pending = connect.isPending ? connect.variables?.connector : undefined;
  const pendingId = pending && "id" in pending ? pending.id : undefined;

  return {
    status,
    address: connection.address,
    balance: balance.data?.value,
    refetchBalance: balance.refetch,
    wallets,
    connect: (id?: string) => {
      const connector = id ? usable.find((c) => c.id === id) : usable.length === 1 ? usable[0] : undefined;
      if (connector) connect.mutate({ connector });
    },
    connectError: connect.error,
    isConnecting: connect.isPending,
    pendingId,
    disconnect: () => disconnect.mutate({}),
    switchToTarget: () => switchChain.mutate({ chainId: CHAIN.id }),
    isSwitching: switchChain.isPending,
    switchError: switchChain.error,
  };
}
