import { anvil, bscTestnet } from "viem/chains";
import type { Address, Chain } from "viem";

export { margaritaAbi } from "./margaritaAbi";

type Deployment = {
  chain: Chain;
  address: Address;
  fromBlock: bigint;
  hasPlayerViews: boolean;
  explorer?: string;
  rpcUrl: string;
};

const testnet: Deployment = {
  chain: bscTestnet,
  address: (process.env.NEXT_PUBLIC_GAME_ADDRESS as Address | undefined) ??
    "0x69B95045fe06192Fb42fA1e897aFFFe9eC1023f1",
  fromBlock: BigInt(process.env.NEXT_PUBLIC_GAME_FROM_BLOCK ?? "144987685"),
  hasPlayerViews: process.env.NEXT_PUBLIC_GAME_PLAYER_VIEWS !== "false",
  explorer: "https://testnet.bscscan.com",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://bsc-testnet-rpc.publicnode.com",
};

const local: Deployment = {
  chain: anvil,
  address: (process.env.NEXT_PUBLIC_GAME_ADDRESS as Address | undefined) ??
    "0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968",
  fromBlock: 0n,
  hasPlayerViews: process.env.NEXT_PUBLIC_GAME_PLAYER_VIEWS !== "false",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545",
};

export const deployment: Deployment = process.env.NEXT_PUBLIC_CHAIN === "local" ? local : testnet;
export const GAME = deployment.address;
export const CHAIN = deployment.chain;

export const NATIVE = CHAIN.id === bscTestnet.id ? "tBNB" : "ETH";

export function txUrl(hash: string) {
  return deployment.explorer ? `${deployment.explorer}/tx/${hash}` : undefined;
}
export function addressUrl(address: string) {
  return deployment.explorer ? `${deployment.explorer}/address/${address}` : undefined;
}

export type TierId = 1 | 2 | 3 | 4;

export const TIERS: Record<TierId, { name: string; chance: string; from: number; to: number }> = {
  1: { name: "Blanco", chance: "70%", from: 0, to: 6999 },
  2: { name: "Reposado", chance: "22%", from: 7000, to: 9199 },
  3: { name: "Añejo", chance: "7%", from: 9200, to: 9899 },
  4: { name: "Extra Añejo", chance: "1%", from: 9900, to: 9999 },
};

export const TIER_IDS: TierId[] = [1, 2, 3, 4];

export function asTier(n: number | bigint): TierId {
  const t = Number(n);
  if (t < 1 || t > 4) throw new Error(`Unknown tier ${t}`);
  return t as TierId;
}

export function rollToTier(roll: number): TierId {
  if (roll >= 9900) return 4;
  if (roll >= 9200) return 3;
  if (roll >= 7000) return 2;
  return 1;
}

export function checkReveal(roll: number, tier: TierId): "ok" | "soldOut" | "mismatch" {
  const expected = rollToTier(roll);
  if (expected === tier) return "ok";
  return expected === 4 && tier === 3 ? "soldOut" : "mismatch";
}

export const PULL_TIMEOUT_SECONDS = 3600;
