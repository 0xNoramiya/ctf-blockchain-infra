// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockERC20} from "@infra/MockERC20.sol";
import {Amm, IERC20} from "../src/Amm.sol";
import {LendingVault} from "../src/LendingVault.sol";

/// Per-player deploy (private-anvil mode). The container's entrypoint
/// passes PLAYER. We mint A to the player so they can deposit, seed the
/// AMM with balanced reserves, and stock the vault with B reserves.
contract Deploy is Script {
    function run() external {
        address player = vm.envAddress("PLAYER");
        uint256 deployer = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

        vm.startBroadcast(deployer);

        MockERC20 a = new MockERC20("Asset A", "A", vm.addr(deployer), 10_000_000 ether);
        MockERC20 b = new MockERC20("Asset B", "B", vm.addr(deployer), 10_000_000 ether);
        Amm amm = new Amm(IERC20(address(a)), IERC20(address(b)));
        LendingVault vault = new LendingVault(amm);

        // Seed the AMM with 100k of each token → spot price 1.0.
        a.approve(address(amm), type(uint256).max);
        b.approve(address(amm), type(uint256).max);
        amm.seed(100_000 ether, 100_000 ether);

        // Stock the vault with 1M B so there's something to borrow.
        b.transfer(address(vault), 1_000_000 ether);

        // Give the player working capital. Generous on A so they can
        // afford to skew the AMM. Modest on B so the win threshold
        // (100k B in player's wallet) genuinely requires the exploit.
        a.transfer(player, 1_000_000 ether);
        b.transfer(player, 1 ether);

        vm.stopBroadcast();

        console2.log(string.concat(
            "CTF_META={\"target\":\"",
            _hex(address(vault)),
            "\",\"extra\":{\"amm\":\"", _hex(address(amm)),
            "\",\"tokenA\":\"", _hex(address(a)),
            "\",\"tokenB\":\"", _hex(address(b)), "\"}}"
        ));
    }

    function _hex(address a) private pure returns (string memory) {
        bytes20 b = bytes20(a);
        bytes memory s = new bytes(42);
        bytes16 alphabet = 0x30313233343536373839616263646566;
        s[0] = "0"; s[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            s[2 + i*2]     = alphabet[uint8(b[i]) >> 4];
            s[2 + i*2 + 1] = alphabet[uint8(b[i]) & 0x0f];
        }
        return string(s);
    }
}
