// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Koth} from "../src/Koth.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");

        vm.startBroadcast(deployerKey);
        Koth k = new Koth();
        vm.stopBroadcast();

        console2.log("Koth:", address(k));
        console2.log("Set this in backend challenges.json:");
        console2.log("  target =", address(k));
    }
}
