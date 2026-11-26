// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Margarita} from "../src/Margarita.sol";
import {VRFCoordinatorV2_5Mock} from "@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol";

contract LocalSetup {
    VRFCoordinatorV2_5Mock public immutable vrf;
    Margarita public immutable game;
    uint256 public immutable subId;

    constructor(address finalOwner, bytes32 keyHash, uint256 price, string memory uri) {
        vrf = new VRFCoordinatorV2_5Mock(0.1 ether, 1 gwei, 4113797966605025);
        subId = vrf.createSubscription();
        vrf.fundSubscription(subId, 1_000_000 ether);

        game = new Margarita(address(vrf), subId, keyHash, price, uri);
        vrf.addConsumer(subId, address(game));

        game.transferOwnership(finalOwner);
    }
}

contract DeployLocal is Script {
    uint256 constant ANVIL_KEY_0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    bytes32 constant LOCAL_KEY_HASH = keccak256("local-key-hash");

    function run() external returns (LocalSetup setup) {
        require(block.chainid == 31337, "local anvil (31337) only");
        if (block.number == 0) {
            vm.rpc("anvil_mine", "[\"0x1\"]");
            vm.roll(1);
        }

        address deployer = vm.addr(ANVIL_KEY_0);
        vm.startBroadcast(ANVIL_KEY_0);
        setup = new LocalSetup(deployer, LOCAL_KEY_HASH, 0.001 ether, "http://localhost:3000/metadata/{id}.json");
        setup.game().acceptOwnership();
        vm.stopBroadcast();

        console.log("VRF mock coordinator:", address(setup.vrf()));
        console.log("Margarita:", address(setup.game()));
        console.log("Owner:", setup.game().owner());
    }
}
