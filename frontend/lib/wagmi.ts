import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import type { EIP1193Provider } from "viem";
import { CHAIN, deployment } from "./contract";

export const BINANCE_IN_APP = "binanceInApp";

export function binanceInAppProvider(): EIP1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { binancew3w?: { ethereum?: EIP1193Provider } }).binancew3w?.ethereum;
}

export const config = createConfig({
  chains: [CHAIN],
  connectors: [
    injected(),
    injected({ target: { id: BINANCE_IN_APP, name: "Binance Wallet", provider: () => binanceInAppProvider() } }),
  ],
  transports: { [CHAIN.id]: http(deployment.rpcUrl) },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
