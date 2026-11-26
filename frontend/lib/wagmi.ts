import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { CHAIN, deployment } from "./contract";

export const config = createConfig({
  chains: [CHAIN],
  connectors: [injected()],
  transports: { [CHAIN.id]: http(deployment.rpcUrl) },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
