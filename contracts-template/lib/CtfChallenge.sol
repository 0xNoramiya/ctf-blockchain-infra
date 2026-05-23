// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IChallenge} from "./IChallenge.sol";

/// Optional base class for per-player challenge contracts.
///
/// Codifies the pattern every template ends up with anyway:
///   - an immutable `player` address captured at construction
///   - `isSolved(who) returns (bool)` that checks address match then
///     delegates to the override hook `_check()`
///   - a `Solved(player, ts)` event emitted exactly once for off-chain
///     indexers (scoreboard webhook subscribers, audit tools, etc.)
///
/// Inspired by paradigm-ctf-infrastructure's `CTFDeployer` / `CTFSolver`
/// shape but trimmed: we don't need the deployer side here because the
/// launcher already gives each player a fresh chain.
///
/// Use directly:
///
///   contract MyVault is CtfChallenge {
///       constructor(address p) CtfChallenge(p) {}
///       function _check() internal view override returns (bool) {
///           return token.balanceOf(player) >= 1_000 ether;
///       }
///   }
///
/// Or compose by holding a reference to one as your top-level Setup.
abstract contract CtfChallenge is IChallenge {
    address public immutable player;
    uint256 public solvedAt; // 0 until the first time isSolved returns true

    event Solved(address indexed player, uint256 timestamp);

    constructor(address _player) {
        require(_player != address(0), "player=0");
        player = _player;
    }

    /// Backend calls this. Returning true (with `who == player`) flips
    /// the player into the "solved" state and releases the flag. The
    /// `Solved` event fires exactly once across the contract's life.
    function isSolved(address who) external view virtual override returns (bool) {
        if (who != player) return false;
        return _check();
    }

    /// Override with your win condition. Pure-ish view function.
    function _check() internal view virtual returns (bool);

    /// Anyone can call this once after `_check()` flips true; it does
    /// nothing else but emit the `Solved` event so off-chain indexers
    /// can record the timestamp without polling. Cheap, safe, optional.
    function recordSolve() external {
        require(solvedAt == 0, "already recorded");
        require(_check(), "not solved");
        solvedAt = block.timestamp;
        emit Solved(player, block.timestamp);
    }
}
