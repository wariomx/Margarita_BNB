// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {PrizeVault} from "../src/PrizeVault.sol";
import {MockStock} from "../src/MockStock.sol";

contract DeployVault is Script {
    address constant GAME = 0x69B95045fe06192Fb42fA1e897aFFFe9eC1023f1;
    address constant QUOTE_SIGNER = 0x99d89E10ff730690e0E5548C0F837CA7644C362A;
    uint256 constant VAULT_SUPPLY = 1_000_000e18;

    function run() external returns (PrizeVault vault) {
        require(block.chainid == 97, "BNB Chain Testnet (97) only");
        address signer = vm.envOr("QUOTE_SIGNER", QUOTE_SIGNER);

        string[4] memory tickers = ["NVDAx", "TSLAx", "AAPLx", "CAKE"];

        vm.startBroadcast();
        address owner = msg.sender;
        vault = new PrizeVault(IERC1155(GAME), signer, owner);
        console.log("PrizeVault:", address(vault));
        for (uint256 i; i < tickers.length; i++) {
            MockStock token = new MockStock(tickers[i], owner);
            token.mint(address(vault), VAULT_SUPPLY);
            vault.setToken(address(token), true);
            console.log(token.symbol(), address(token));
        }
        vm.stopBroadcast();

        console.log("Owner:", owner);
        console.log("Signer:", signer);
    }
}
