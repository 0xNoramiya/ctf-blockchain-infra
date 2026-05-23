// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "@infra/MockERC20.sol";
import {KothBank, IERC20} from "../src/KothBank.sol";

contract KothBankTest is Test {
    MockERC20 token;
    KothBank  bank;
    address alice = makeAddr("alice");
    address bob   = makeAddr("bob");

    function setUp() public {
        token = new MockERC20("KOTH", "KOTH", address(this), 10_000 ether);
        bank  = new KothBank(IERC20(address(token)));
        token.transfer(alice, 1_000 ether);
        token.transfer(bob,   1_000 ether);
        vm.prank(alice); token.approve(address(bank), type(uint256).max);
        vm.prank(bob);   token.approve(address(bank), type(uint256).max);
    }

    function _bump(address who, uint256 amount) internal {
        vm.prank(who);
        bank.bump(amount);
    }
    function _withdraw(address who, uint256 amount) internal {
        vm.prank(who);
        bank.withdraw(amount);
    }

    function test_StartsUncrowned() public view {
        assertFalse(bank.isSolved(alice));
    }

    function test_BumpCrowns() public {
        _bump(alice, 100 ether);
        assertEq(bank.king(), alice);
        assertTrue(bank.isSolved(alice));
    }

    function test_HigherBumpDethrones() public {
        _bump(alice, 100 ether);
        _bump(bob, 101 ether);
        assertEq(bank.king(), bob);
        assertFalse(bank.isSolved(alice));
        assertTrue(bank.isSolved(bob));
    }

    function test_FrozenKingExploit() public {
        _bump(alice, 100 ether);            // alice is king at 100
        assertEq(bank.kingScore(), 100 ether);

        _withdraw(alice, 100 ether);        // 🚨 alice still king, kingScore still 100
        assertEq(bank.king(), alice, "still king after withdraw");
        assertEq(bank.kingScore(), 100 ether, "kingScore unchanged");

        // Bob bumps with EXACTLY 100; that doesn't beat kingScore (strictly >).
        _bump(bob, 100 ether);
        assertEq(bank.king(), alice, "alice's frozen throne held");
        assertTrue(bank.isSolved(alice));
        assertFalse(bank.isSolved(bob));
    }

    function test_HonestPlayerStaysSolvable() public {
        _bump(alice, 100 ether);
        _withdraw(alice, 100 ether);
        // 101 strictly greater than kingScore 100 ⇒ bob dethrones.
        _bump(bob, 101 ether);
        assertEq(bank.king(), bob);
        assertTrue(bank.isSolved(bob));
    }
}
