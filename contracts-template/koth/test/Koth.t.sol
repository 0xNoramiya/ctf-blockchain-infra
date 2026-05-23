// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Koth} from "../src/Koth.sol";

contract KothTest is Test {
    Koth k;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        k = new Koth();
    }

    function test_StartsUncrowned() public view {
        assertEq(k.king(), address(0));
        assertFalse(k.isSolved(alice));
        assertFalse(k.isSolved(address(0)), "zero must not be solved");
    }

    function test_ClaimCrowns() public {
        vm.prank(alice);
        k.claim();
        assertEq(k.king(), alice);
        assertTrue(k.isSolved(alice));
        assertFalse(k.isSolved(bob));
    }

    function test_DethroneFlipsBothPlayers() public {
        vm.prank(alice);
        k.claim();
        vm.prank(bob);
        k.claim();
        assertEq(k.king(), bob);
        assertTrue(k.isSolved(bob));
        assertFalse(k.isSolved(alice), "alice loses solved on dethrone");
    }
}
