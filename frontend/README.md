# Margarita · frontend

Web app for Margarita, an on-chain gacha game on BNB Chain. Open a barrel, a verifiable random roll picks one of four tequila tiers (ERC-1155), and tokens age up: 3 Blanco, 3 Reposado or 7 Añejo make one of the next tier.

Next.js 16 · Tailwind 4 · wagmi 3 + viem · three.js

## Run (BSC Testnet)

```sh
npm install
npm run dev
```

The contract address, deploy block and RPC default to the live testnet deploy in `lib/contract.ts`. Override them in `.env.local` (see `.env.example`).

## Run locally (anvil)

```sh
anvil
cd ../smart-contracts && forge script script/DeployLocal.s.sol --tc DeployLocal --rpc-url http://127.0.0.1:8545 --broadcast
cd ../frontend && NEXT_PUBLIC_CHAIN=local npm run dev
```

Reveal a pull with the VRF mock: `cast send <mock> "fulfillRandomWordsWithOverride(uint256,address,uint256[])" <requestId> <game> "[19900]"`.

## Structure

| Path | |
|---|---|
| `public/home.html` | Landing page at `/` |
| `app/open`, `app/cellar` | Pull and cellar pages |
| `app/metadata/[file]`, `public/assets/tokens` | ERC-1155 metadata and token art (3D bottle renders) |
| `lib/barrelScene.ts`, `landing/barrelTop.ts` | 3D barrel-top (three.js, `public/assets/barrel/barrel-top.glb`) |
| `lib/margaritaAbi.ts` | Generated with `npm run abi:sync` from `../smart-contracts/out` |

## Checks

```sh
npm run typecheck && npm run lint && npm run build
```
