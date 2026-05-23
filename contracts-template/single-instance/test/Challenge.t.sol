// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Challenge} from "../src/Challenge.sol";

contract ChallengeTest is Test {
    Challenge c;
    address signer = makeAddr("signer");
    address player = makeAddr("player");

    function setUp() public {
        c = new Challenge(signer);
    }

    function test_StartsUnsolved() public view {
        assertFalse(c.isSolved(player));
    }

    function test_SignerStored() public view {
        assertEq(c.signer(), signer);
    }
}
