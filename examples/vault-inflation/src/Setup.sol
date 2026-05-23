// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockERC20} from "@infra/MockERC20.sol";
import {CtfChallenge} from "@infra/CtfChallenge.sol";
import {Vault, IERC20} from "./Vault.sol";
import {Depositor} from "./Depositor.sol";

/// One Setup per player. Inherits from CtfChallenge which captures
/// `player`, enforces `isSolved(who) == (who == player) && _check()`,
/// and exposes a one-shot `recordSolve()` event. We only have to write
/// the constructor (multi-contract deploy + funding) and `_check()`.
contract Setup is CtfChallenge {
    MockERC20 public immutable asset;
    Vault public immutable vault;
    Depositor public immutable depositor;

    uint256 public constant PLAYER_BALANCE = 2_000 ether;
    uint256 public constant VICTIM_BALANCE = 1_000 ether;
    uint256 public constant SOLVE_THRESHOLD = 2_500 ether;

    constructor(address _player) CtfChallenge(_player) {
        asset = new MockERC20("Mock USDC", "USDC", address(this), PLAYER_BALANCE + VICTIM_BALANCE);
        vault = new Vault(IERC20(address(asset)));
        depositor = new Depositor(vault);

        asset.transfer(_player, PLAYER_BALANCE);
        asset.transfer(address(depositor), VICTIM_BALANCE);
    }

    function _check() internal view override returns (bool) {
        if (!depositor.triggered()) return false;
        return asset.balanceOf(player) >= SOLVE_THRESHOLD;
    }
}
