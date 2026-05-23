// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Factory} from "../src/Factory.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");

        vm.startBroadcast(deployerKey);
        Factory f = new Factory();
        vm.stopBroadcast();

        console2.log("Factory:", address(f));
        console2.log("Set this in backend challenges.json:");
        console2.log("  target =", address(f));
    }
}
