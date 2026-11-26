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

## Safety

- Rolls come only from the Chainlink coordinator set at deploy, so not even the owner can pick them.
- If VRF stops answering, the owner can pause and cancel pulls older than 1 hour, and players claim their tBNB back.
- Player funds waiting on a pull can't be withdrawn by the owner.
- Reviewed with an AI auditor, not a professional audit. Testnet demo only.

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
