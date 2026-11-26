# Margarita_BNB

Margarita is an on-chain tequila gacha on BNB Chain. Open a barrel for 0.001 tBNB, a Chainlink VRF roll picks one of four tiers (Blanco, Reposado, Añejo, Extra Añejo) as an ERC-1155 token, and tokens age up: 3 Blanco, 3 Reposado or 7 Añejo make one of the next tier. Extra Añejo is capped at 100, one per bottle in the barrel.

**Live on BSC Testnet:** [`0x69B95045fe06192Fb42fA1e897aFFFe9eC1023f1`](https://testnet.bscscan.com/address/0x69b95045fe06192fb42fa1e897afffe9ec1023f1)

| Folder | |
|---|---|
| [`smart-contracts/`](smart-contracts) | Solidity game contract (Foundry, Chainlink VRF v2.5, OpenZeppelin ERC-1155) |
| [`frontend/`](frontend) | Web app and landing page (Next.js, wagmi, three.js) |

```sh
cd smart-contracts && forge test
cd frontend && npm install && npm run dev
```
