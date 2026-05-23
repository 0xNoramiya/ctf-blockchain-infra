// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Per-player private-anvil template.
///
/// One `Challenge` per spawned container; the launcher creates a fresh
/// container per player, runs the deploy script inside it, and uses
/// `isSolved(player)` to check completion.
///
/// The `player` parameter is the *player address that triggered the
/// spawn*, not msg.sender — the same address you read from the env in
/// the deploy script.
contract Challenge {
    address public immutable player;

    constructor(address _player) {
        player = _player;
    }

    function isSolved(address who) external view returns (bool) {
        if (who != player) return false;
        return _check();
    }

    function _check() internal view virtual returns (bool) {
        return false;
    }
}
