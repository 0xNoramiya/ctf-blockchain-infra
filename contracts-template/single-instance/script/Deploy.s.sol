// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Challenge} from "../src/Challenge.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        address signer = vm.envAddress("SIGNER_ADDRESS");

        vm.startBroadcast(deployerKey);
        Challenge ch = new Challenge(signer);
        vm.stopBroadcast();

        console2.log("Challenge:", address(ch));
        console2.log("Signer:   ", signer);
        console2.log("Set this in backend .env and challenges.json:");
        console2.log("  target =", address(ch));
    }
}
