# Margarita: Agave Barrel Gacha

A tequila gacha on BNB Chain. Each pull mints a tequila NFT, rolled by Chainlink VRF v2.5.
Tokens age into rarer tiers, and an Extra Añejo can be redeemed for a bottle from a real barrel.

**Live on BSC Testnet:** [`0x69B95045fe06192Fb42fA1e897aFFFe9eC1023f1`](https://testnet.bscscan.com/address/0x69b95045fe06192fb42fa1e897afffe9ec1023f1) (verified)

## How it works

| Tier | ID | Chance |
|---|---|---|
| Blanco | 1 | 70% |
| Reposado | 2 | 22% |
| Añejo | 3 | 7% |
| Extra Añejo | 4 | 1% |

- **Pull:** pay 0.001 tBNB. Chainlink VRF picks the tier, and the NFT is minted when the answer arrives.
- **Age:** burn 3 Blanco, 3 Reposado or 7 Añejo to get 1 token of the next tier after 2, 5 or 10 minutes.
- **Redeem:** burn 1 Extra Añejo for a bottle. Shipping is handled off-chain.
- **Bottle cap:** at most 100 Extra Añejo can ever exist, one per bottle. Once they're all out, the barrel is sold out.

## Prize vault: tequila for tokenized stocks

Swap Blanco, Reposado or Añejo for test tokenized stocks at a live CoinMarketCap price.
Extra Añejo can't be swapped; it stays the bottle prize.

**Vault:** [`0xa1a3F6cd5b5a5d5068E41956f65B1BaF66BFc3E4`](https://testnet.bscscan.com/address/0xa1a3f6cd5b5a5d5068e41956f65b1baf66bfc3e4) (verified)

| Token | Address |
|---|---|
| mNVDAx | [`0x1813958B46562cE3285DBc8d3eED5C06d2e3999e`](https://testnet.bscscan.com/address/0x1813958b46562ce3285dbc8d3eed5c06d2e3999e) |
| mTSLAx | [`0xDf79c733bab1Fc6889b1Fc8ca894791C7C173CD0`](https://testnet.bscscan.com/address/0xdf79c733bab1fc6889b1fc8ca894791c7c173cd0) |
| mAAPLx | [`0xf26c1AACb238b4b68B9cf61a97d0303fe2E5b55C`](https://testnet.bscscan.com/address/0xf26c1aacb238b4b68b9cf61a97d0303fe2e5b55c) |
| mCAKE | [`0x2A12232C05466B06d0B0536FdfB10EE575ed3591`](https://testnet.bscscan.com/address/0x2a12232c05466b06d0b0536fdfb10ee575ed3591) |

These are testnet stand-ins for real tokenized stocks, with 18 decimals. The vault holds 1,000,000 of each.

- **Tier values:** Blanco $1, Reposado $5, Añejo $20. The owner can change them.
- **Price:** the server reads CoinMarketCap and signs an EIP-712 `Quote(address token,uint256 priceUsd,uint256 expiry,uint256 nonce)`.
  The domain is `MargaritaPrizeVault`, version `1`, chain 97. Quotes expire after 120 s, and each nonce works once.
- **Claim:** call `setApprovalForAll(vault, true)` on the game once, then `claim(tier, amount, quote, sig)`.
  Payout is `tierValue × amount ÷ price`, rounded down. Every `Claimed` event records the price used.
- **Trust:** one server key signs prices, and the owner can pause, withdraw and change tier values.

Deploy the vault and the 4 tokens:

```sh
forge script script/DeployVault.s.sol --rpc-url bsc_testnet --account <ACCOUNT> --sender <ADDRESS> \
  --broadcast --with-gas-price 0.1gwei --priority-gas-price 0.1gwei
```

## Safety

- Rolls come only from the Chainlink coordinator set at deploy, so not even the owner can pick them.
- If VRF stops answering, the owner can pause and cancel pulls older than 1 hour, and players claim their tBNB back.
- Player funds waiting on a pull can't be withdrawn by the owner.
- The game was reviewed with an AI auditor. The vault had one quick independent manual review with forge proof-of-concept tests, which found no critical or high issues.
- Neither contract is professionally audited. Treat them as unaudited hackathon code, for testnet only.

## Run it

```sh
forge test
```

Local chain with a mock VRF:

```sh
anvil
forge script script/DeployLocal.s.sol --tc DeployLocal --rpc-url http://127.0.0.1:8545 --broadcast
```

## Deploy to BSC Testnet

1. Create a VRF subscription at https://vrf.chain.link (BNB Chain Testnet) and fund it with tBNB or LINK.
2. Import a testnet-only key: `cast wallet import <ACCOUNT> --interactive`
3. `cp .env.example .env`, then set `VRF_SUBSCRIPTION_ID`. Set `VRF_NATIVE_PAYMENT=true` if you funded with tBNB.
4. Deploy and verify:
   ```sh
   source .env
   forge script script/DeployMargarita.s.sol --rpc-url bsc_testnet --account <ACCOUNT> --broadcast --verify
   ```
5. Add the game as a consumer, then pull:
   ```sh
   cast send 0xDA3b641D438362C440Ac5458c57e00a712b66700 "addConsumer(uint256,address)" $VRF_SUBSCRIPTION_ID <GAME> \
     -r bsc_testnet --account <ACCOUNT> --gas-price 0.1gwei --priority-gas-price 0.1gwei
   cast send <GAME> "pull()" --value 0.001ether \
     -r bsc_testnet --account <ACCOUNT> --gas-price 0.1gwei --priority-gas-price 0.1gwei
   ```

BSC Testnet needs a 0.1 gwei minimum tip, which is why `cast send` has the gas flags.
Check the coordinator address at https://docs.chain.link/vrf/v2-5/supported-networks.md before deploying.
