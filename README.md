# Margarita_BNB

Margarita is an on-chain tequila gacha on BNB Chain, backed by a real-world asset: one barrel of Extra Añejo tequila, split into 100 bottles.

Open a barrel for 0.001 tBNB. A verifiable random roll picks one of four tiers (Blanco 70%, Reposado 22%, Añejo 7%, Extra Añejo 1%) as an ERC-1155 token. Tokens age up on chain: 3 Blanco, 3 Reposado or 7 Añejo make one of the next tier. Extra Añejo is capped at 100, one per bottle in the barrel, and is the token that redeems for a bottle. Lower tiers can be swapped in the prize vault for tokenized stocks and BNB ecosystem tokens at a live CoinMarketCap price.

- **Live app:** https://frontend-lyart-six-47.vercel.app
- **Game contract (BSC Testnet):** [`0x69B95045fe06192Fb42fA1e897aFFFe9eC1023f1`](https://testnet.bscscan.com/address/0x69b95045fe06192fb42fa1e897afffe9ec1023f1)
- **Prize vault (BSC Testnet):** [`0xa1a3F6cd5b5a5d5068E41956f65B1BaF66BFc3E4`](https://testnet.bscscan.com/address/0xa1a3f6cd5b5a5d5068e41956f65b1baf66bfc3e4)

| Folder | |
|---|---|
| [`smart-contracts/`](smart-contracts) | Game and prize vault contracts (Foundry, Chainlink VRF v2.5, OpenZeppelin) |
| [`frontend/`](frontend) | Web app, 3D pull and landing page (Next.js 16, wagmi, three.js) |

## Run it

```sh
cd smart-contracts && forge test
cd frontend && npm install && npm run dev
```

Server environment for the frontend (never `NEXT_PUBLIC_`, never committed): `CMC_API_KEY` (CoinMarketCap Pro API) and `QUOTE_SIGNER_PK` (testnet-only key that signs vault quotes). Public addresses default to the testnet deploy in `frontend/lib/contract.ts` and `frontend/lib/prizes.ts`.

## Write-up

**Problem and audience.** Collectible gachas are opaque: players can't see the odds, the randomness or what a pull really costs, and the prizes rarely connect to anything real. Margarita is for crypto-native collectors who want a fun, fair pull with a physical, finite asset behind it.

**What it does.**
- **Provably fair pulls.** Each pull requests Chainlink VRF v2.5 on BNB Chain. The roll, the tier range and the reveal transaction are shown, and anyone can check `PullRevealed(player, requestId, tier, roll)` against `rollToTier(roll)`.
- **A real asset with a hard cap.** 100 Extra Añejo tokens map to 100 bottles of one barrel; the contract enforces the cap.
- **Real cost, live from CoinMarketCap** (`/open`): the pull price in USD, the expected pulls and USD cost to reach one Extra Añejo with and without aging (24.05 and 100 pulls, checked by a 2M-pull Monte Carlo), and the break-even pull price in BNB for a given bottle value.
- **Prize vault** (`/cellar`): swap Blanco, Reposado or Añejo (worth $1, $5 and $20, set by the owner with `setTierUsd`; generous on purpose for the testnet demo, where a pull costs about $0.55) for test tokenized stocks (NVIDIA, Tesla, Apple xStocks) or BNB ecosystem tokens (CAKE). The server reads the token's live USD price from CoinMarketCap, signs an EIP-712 quote valid for 2 minutes, and the vault contract verifies the signature and pays out on chain.

**Data sources and why.**
- CoinMarketCap Pro API `GET /v3/cryptocurrency/quotes/latest`:
  - BNB (id 1839) and CAKE (7186) feed the real-cost panel, served from `/api/market` with a 5-minute CDN cache;
  - NVDAx (36992), TSLAx (37004), AAPLx (36994) and CAKE (7186) price each vault swap in `/api/quote`, signed per request.
  - The key stays on the server; usage is verifiable in the CMC dashboard and in each `Claimed(player, tier, amount, token, priceUsd, payout, nonce)` event on chain.
  - Live proof: [1 Reposado → 0.03334 mNVDAx at $149.96](https://testnet.bscscan.com/tx/0xf6a968baacd55dcb40fe90438e41a2d6c5a68573953e20776c2caedb082a9682) (block 145025197).
- Chainlink VRF v2.5 (BSC Testnet coordinator) for the rolls.

**BNB Chain.** Both contracts run on BSC Testnet (chain 97). Reads go through BSC RPC; token metadata is served at `/metadata/{id}.json` and set on chain with `setURI`.

**What's next.** Mainnet with an audited contract; Redeem with shipping for Extra Añejo; real tokenized stocks in the vault instead of test tokens; a second price source (Atlas) checked against CoinMarketCap before signing; more barrels from more distilleries.

## Contracts

All contracts are verified on BscScan.

| Contract | Address (BSC Testnet) |
|---|---|
| Margarita (game, ERC-1155) | `0x69B95045fe06192Fb42fA1e897aFFFe9eC1023f1` |
| PrizeVault | [`0xa1a3F6cd5b5a5d5068E41956f65B1BaF66BFc3E4`](https://testnet.bscscan.com/address/0xa1a3f6cd5b5a5d5068e41956f65b1baf66bfc3e4) |
| mNVDAx (test NVIDIA xStock) | `0x1813958B46562cE3285DBc8d3eED5C06d2e3999e` |
| mTSLAx (test Tesla xStock) | `0xDf79c733bab1Fc6889b1Fc8ca894791C7C173CD0` |
| mAAPLx (test Apple xStock) | `0xf26c1AACb238b4b68B9cf61a97d0303fe2E5b55C` |
| mCAKE (test CAKE) | `0x2A12232C05466B06d0B0536FdfB10EE575ed3591` |

Tests: 83 passing (`forge test`). Margarita was reviewed with an AI auditor. PrizeVault had one quick independent manual security review with forge proof-of-concept tests and no formal audit; no critical or high issues were found. Treat both as unaudited hackathon code. Testnet demo only.
