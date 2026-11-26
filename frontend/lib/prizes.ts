import type { Address } from "viem";

export type Prize = {
  key: string;
  symbol: string;
  name: string;
  cmcId: number;
  cmcSlug: string;
  kind: "stock" | "ecosystem";
  address: Address | undefined;
};

export const PRIZES: Prize[] = [
  { key: "nvda", symbol: "mNVDAx", name: "NVIDIA tokenized stock", cmcId: 36992, cmcSlug: "nvidia-tokenized-stock-xstock", kind: "stock", address: (process.env.NEXT_PUBLIC_PRIZE_NVDA ?? "0x1813958B46562cE3285DBc8d3eED5C06d2e3999e") as Address },
  { key: "tsla", symbol: "mTSLAx", name: "Tesla tokenized stock", cmcId: 37004, cmcSlug: "tesla-tokenized-stock-xstock", kind: "stock", address: (process.env.NEXT_PUBLIC_PRIZE_TSLA ?? "0xDf79c733bab1Fc6889b1Fc8ca894791C7C173CD0") as Address },
  { key: "aapl", symbol: "mAAPLx", name: "Apple tokenized stock", cmcId: 36994, cmcSlug: "apple-tokenized-stock-xstock", kind: "stock", address: (process.env.NEXT_PUBLIC_PRIZE_AAPL ?? "0xf26c1AACb238b4b68B9cf61a97d0303fe2E5b55C") as Address },
  { key: "cake", symbol: "mCAKE", name: "PancakeSwap CAKE", cmcId: 7186, cmcSlug: "pancakeswap", kind: "ecosystem", address: (process.env.NEXT_PUBLIC_PRIZE_CAKE ?? "0x2A12232C05466B06d0B0536FdfB10EE575ed3591") as Address },
];

export const VAULT_TIERS = [1, 2, 3] as const;

export const VAULT_CHAIN_ID = 97;

export function vaultAddress(): Address | undefined {
  const a = process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? (process.env.NEXT_PUBLIC_CHAIN === "local" ? undefined : "0xa1a3F6cd5b5a5d5068E41956f65B1BaF66BFc3E4");
  return a ? (a as Address) : undefined;
}

export const QUOTE_TYPES = {
  Quote: [
    { name: "token", type: "address" },
    { name: "priceUsd", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export function quoteDomain(vault: Address) {
  return { name: "MargaritaPrizeVault", version: "1", chainId: VAULT_CHAIN_ID, verifyingContract: vault } as const;
}
