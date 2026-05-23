// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockERC20} from "@infra/MockERC20.sol";
import {VaultPool, IERC20} from "../src/VaultPool.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        address signer = vm.envAddress("SIGNER_ADDRESS");
        uint256 supply = vm.envOr("POOL_SUPPLY", uint256(1_000_000_000_000_000 ether));

        vm.startBroadcast(deployerKey);
        MockERC20 token = new MockERC20("Vault Token", "VLT", vm.addr(deployerKey), supply);
        VaultPool pool = new VaultPool(signer, IERC20(address(token)));
        token.transfer(address(pool), supply);
        vm.stopBroadcast();

        console2.log("Token: ", address(token));
        console2.log("Pool:  ", address(pool));
        console2.log("Signer:", signer);
        console2.log("");
        console2.log("Paste into backend/challenges.json:");
        console2.log("  target =", address(pool));
        console2.log("Add to backend/.env:");
        console2.log("  FLAG_SIGREPLAY=CTF{...your-flag...}");
        console2.log("  SIGNER_KEY_SIGREPLAY=0x...key for", signer);
    }
}
