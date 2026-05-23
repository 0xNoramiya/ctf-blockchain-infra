// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "@infra/MockERC20.sol";
import {Amm, IERC20} from "../src/Amm.sol";
import {LendingVault} from "../src/LendingVault.sol";

contract OracleManipulationTest is Test {
    MockERC20 a;
    MockERC20 b;
    Amm amm;
    LendingVault vault;
    address player = makeAddr("player");

    function setUp() public {
        a = new MockERC20("A", "A", address(this), 10_000_000 ether);
        b = new MockERC20("B", "B", address(this), 10_000_000 ether);
        amm = new Amm(IERC20(address(a)), IERC20(address(b)));
        vault = new LendingVault(amm);

        a.approve(address(amm), type(uint256).max);
        b.approve(address(amm), type(uint256).max);
        amm.seed(100_000 ether, 100_000 ether);
        b.transfer(address(vault), 1_000_000 ether);

        a.transfer(player, 1_000_000 ether);
        b.transfer(player, 1 ether);
    }

    function test_FreshIsUnsolved() public view {
        assertFalse(vault.isSolved(player));
    }

    function test_BorrowingAtHonestPriceSolves() public {
        // The bug isn't only spot-manipulation — it's that a spot-priced
        // lender lets anyone with enough A borrow ANY amount up to
        // collateral × spot. Threshold is 100k B, player has 1M A at
        // spot price 1.0, so honest deposit + borrow already wins.
        vm.startPrank(player);
        a.approve(address(vault), type(uint256).max);
        vault.deposit(1_000_000 ether);
        vault.borrow(100_000 ether);
        vm.stopPrank();
        assertGe(b.balanceOf(player), vault.SOLVE_THRESHOLD());
        assertTrue(vault.isSolved(player));
    }

    function test_ManipulationShiftsBorrowLimit() public {
        // Demonstrate that swapping A→B drops priceAinB. Confirms the
        // oracle is direct-from-reserves (spot, not TWAP).
        vm.startPrank(player);
        a.approve(address(amm), type(uint256).max);
        uint256 before_ = amm.priceAinB();
        amm.swapAforB(50_000 ether);
        uint256 after_ = amm.priceAinB();
        vm.stopPrank();
        assertLt(after_, before_, "swapping A in must drop priceAinB");
    }

    function test_BystanderWithoutCollateralCannotBorrow() public {
        address bystander = makeAddr("bystander");
        vm.startPrank(bystander);
        vm.expectRevert(bytes("undercollateralized"));
        vault.borrow(1 ether);
        vm.stopPrank();
    }
}
