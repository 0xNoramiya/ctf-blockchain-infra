// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Challenge} from "../src/Challenge.sol";

/// Runs once at container start, against the local anvil. Reads the
/// PLAYER address that the launcher injected into the container env.
contract Deploy is Script {
    function run() external {
        address player = vm.envAddress("PLAYER");

        // Anvil pre-funded key 0 — fine inside a private container.
        uint256 deployer = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

        vm.startBroadcast(deployer);
        Challenge ch = new Challenge(player);
        vm.stopBroadcast();

        // The single line the launcher captures from container stdout
        // to populate the player-facing instance state. The launcher's
        // contract: any line of the form `CTF_META={json}` is parsed.
        console2.log(
            string.concat(
                "CTF_META={\"target\":\"",
                vm.toString(address(ch)),
                "\",\"extra\":{\"player\":\"",
                vm.toString(player),
                "\"}}"
            )
        );
    }
}
