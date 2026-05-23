// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Factory, Instance} from "../src/Factory.sol";

contract FactoryTest is Test {
    Factory f;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        f = new Factory();
    }

    function test_NoInstanceUntilSpawn() public view {
        assertEq(address(f.instanceOf(alice)), address(0));
        assertFalse(f.isSolved(alice));
    }

    function test_SpawnIsolatesPerPlayer() public {
        vm.prank(alice);
        Instance ai = f.spawn();

        vm.prank(bob);
        Instance bi = f.spawn();

        assertTrue(address(ai) != address(bi));
        assertEq(address(f.instanceOf(alice)), address(ai));
        assertEq(address(f.instanceOf(bob)), address(bi));
    }

    function test_DoubleSpawnReverts() public {
        vm.startPrank(alice);
        f.spawn();
        vm.expectRevert(bytes("already spawned"));
        f.spawn();
        vm.stopPrank();
    }
}
