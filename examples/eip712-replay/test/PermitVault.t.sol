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
    uint256 AMOUNT;
    uint256 THRESHOLD;
    bytes32 TYPEHASH;
    bytes32 DOMAIN;

    function setUp() public {
        signer = vm.addr(signerKey);
        token = new MockERC20("Permit Token", "PT", address(this), 1_000_000 ether);
        vault = new PermitVault(signer, IERC20(address(token)));
        token.transfer(address(vault), 1_000_000 ether);
        AMOUNT    = vault.AUTHORIZED_AMOUNT();
        THRESHOLD = vault.SOLVE_THRESHOLD();
        TYPEHASH  = vault.PERMIT_TYPEHASH();
        DOMAIN    = vault.DOMAIN_SEPARATOR();
    }

    function _signPermit(address spender, uint256 amount, uint256 deadline) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(TYPEHASH, spender, amount, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_OnePermitWorks() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signPermit(player, AMOUNT, deadline);
        vm.prank(player);
        vault.permit(AMOUNT, deadline, sig);
        assertEq(token.balanceOf(player), 100 ether);
    }

    function test_ReplayDrainsToSolve() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signPermit(player, AMOUNT, deadline);
        vm.startPrank(player);
        for (uint i = 0; i < 10; i++) {
            vault.permit(AMOUNT, deadline, sig);
        }
        vm.stopPrank();
        assertGe(token.balanceOf(player), THRESHOLD);
        assertTrue(vault.isSolved(player));
    }

    function test_ExpiredSigReverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signPermit(player, AMOUNT, deadline);
        vm.warp(block.timestamp + 2 hours);
        vm.prank(player);
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "expired"));
        vault.permit(AMOUNT, deadline, sig);
    }

    function test_WrongSpenderReverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signPermit(player, AMOUNT, deadline);
        address other = makeAddr("other");
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "bad sig"));
        vault.permit(AMOUNT, deadline, sig);
    }
}
