// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Margarita} from "../src/Margarita.sol";

contract DeployMargarita is Script {
    address constant VRF_COORDINATOR = 0xDA3b641D438362C440Ac5458c57e00a712b66700;
    bytes32 constant KEY_HASH = 0x8596b430971ac45bdf6088665b9ad8e8630c9d5049ab54b14dff711bee7c0e26;

    uint32 constant CALLBACK_GAS_LIMIT = 300_000;
    uint16 constant REQUEST_CONFIRMATIONS = 3;

    function run() external returns (Margarita game) {
        require(block.chainid == 97, "BNB Chain Testnet (97) only");

        uint256 subId = vm.envUint("VRF_SUBSCRIPTION_ID");
        uint256 price = vm.envOr("PULL_PRICE_WEI", uint256(0.001 ether));
        string memory uri = vm.envOr("TOKEN_URI", string("ipfs://REPLACE_ME/{id}.json"));
        bool nativePayment = vm.envOr("VRF_NATIVE_PAYMENT", false);

        vm.startBroadcast();
        game = new Margarita(VRF_COORDINATOR, subId, KEY_HASH, price, uri);
        if (nativePayment) {
            game.setVrfConfig(subId, KEY_HASH, CALLBACK_GAS_LIMIT, REQUEST_CONFIRMATIONS, true);
        }
        vm.stopBroadcast();

        console.log("Margarita deployed at:", address(game));
        console.log("Owner:", game.owner());
        console.log("VRF sub id:", subId);
        console.log("Pays VRF in:", nativePayment ? "tBNB" : "LINK");
        console.log("NEXT: add this address as a consumer at https://vrf.chain.link");
    }
}
