// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockERC20} from "@infra/MockERC20.sol";
import {KothBank, IERC20} from "../src/KothBank.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        uint256 mintTo = vm.envOr("INITIAL_DROP", uint256(0));

        vm.startBroadcast(deployerKey);
        MockERC20 token = new MockERC20("KOTH Token", "KOTH", vm.addr(deployerKey), 1_000_000 ether);
        KothBank bank = new KothBank(IERC20(address(token)));
        if (mintTo > 0) {
            token.transfer(vm.envAddress("INITIAL_DROP_TO"), mintTo);
        }
        vm.stopBroadcast();

        console2.log("Token:  ", address(token));
        console2.log("Bank:   ", address(bank));
        console2.log("");
        console2.log("Paste into backend/challenges.json:");
        console2.log("  target =", address(bank));
        console2.log("Add to backend/.env:");
        console2.log("  FLAG_KOTHFK=CTF{...}");
    }
}
