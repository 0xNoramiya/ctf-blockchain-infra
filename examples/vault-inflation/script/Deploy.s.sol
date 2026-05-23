// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VaultFactory} from "../src/VaultFactory.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");

        vm.startBroadcast(deployerKey);
        VaultFactory f = new VaultFactory();
        vm.stopBroadcast();

        console2.log("Factory:", address(f));
        console2.log("");
        console2.log("Paste into backend/challenges.json:");
        console2.log("  target =", address(f));
        console2.log("Set FLAG_VAULTINF in backend/.env.");
    }
}
