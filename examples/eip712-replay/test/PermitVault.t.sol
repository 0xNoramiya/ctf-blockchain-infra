// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "@infra/MockERC20.sol";
import {PermitVault, IERC20} from "../src/PermitVault.sol";

contract PermitVaultTest is Test {
    MockERC20 token;
    PermitVault vault;
    uint256 signerKey = 0xB0B;
    address signer;
    address player = makeAddr("player");

    function setUp() public {
        signer = vm.addr(signerKey);
        token = new MockERC20("Permit Token", "PT", address(this), 1_000_000 ether);
        vault = new PermitVault(signer, IERC20(address(token)));
        token.transfer(address(vault), 1_000_000 ether);
    }

    function _signPermit(address spender, uint256 amount, uint256 deadline) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            vault.PERMIT_TYPEHASH(),
            spender, amount, deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", vault.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_OnePermitWorks() public {
        bytes memory sig = _signPermit(player, vault.AUTHORIZED_AMOUNT(), block.timestamp + 1 hours);
        vm.prank(player);
        vault.permit(vault.AUTHORIZED_AMOUNT(), block.timestamp + 1 hours, sig);
        assertEq(token.balanceOf(player), 100 ether);
    }

    function test_ReplayDrainsToSolve() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signPermit(player, vault.AUTHORIZED_AMOUNT(), deadline);
        vm.startPrank(player);
        for (uint i = 0; i < 10; i++) {
            vault.permit(vault.AUTHORIZED_AMOUNT(), deadline, sig);
        }
        vm.stopPrank();
        assertGe(token.balanceOf(player), vault.SOLVE_THRESHOLD());
        assertTrue(vault.isSolved(player));
    }

    function test_ExpiredSigReverts() public {
        bytes memory sig = _signPermit(player, vault.AUTHORIZED_AMOUNT(), block.timestamp + 1 hours);
        vm.warp(block.timestamp + 2 hours);
        vm.prank(player);
        vm.expectRevert(bytes("expired"));
        vault.permit(vault.AUTHORIZED_AMOUNT(), block.timestamp - 1 hours, sig);
    }

    function test_WrongSpenderReverts() public {
        // Sig was for `player`; another address can't redeem (msg.sender
        // is part of the typed struct).
        bytes memory sig = _signPermit(player, vault.AUTHORIZED_AMOUNT(), block.timestamp + 1 hours);
        address other = makeAddr("other");
        vm.prank(other);
        vm.expectRevert(bytes("bad sig"));
        vault.permit(vault.AUTHORIZED_AMOUNT(), block.timestamp + 1 hours, sig);
    }
}
