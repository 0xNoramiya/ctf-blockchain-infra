// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Challenge} from "../src/Challenge.sol";

contract ChallengeTest is Test {
    address player = makeAddr("player");
    address bystander = makeAddr("bystander");

    function test_OnlyConfiguredPlayerCanSolve() public {
        Challenge c = new Challenge(player);
        assertFalse(c.isSolved(player), "default _check must be false");
        assertFalse(c.isSolved(bystander), "bystander never solves");
    }
}
