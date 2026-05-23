// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Setup} from "./Setup.sol";

/// Per-player factory. Players call spawn() once to mint their isolated
/// Setup (which deploys the rest). The backend points its `target` at
/// this Factory and calls isSolved(player) — which forwards to the
/// player's Setup.
contract VaultFactory {
    mapping(address => Setup) public setupOf;

    event Spawned(address indexed player, address setup);

    function spawn() external returns (Setup s) {
        require(address(setupOf[msg.sender]) == address(0), "already spawned");
        s = new Setup(msg.sender);
        setupOf[msg.sender] = s;
        emit Spawned(msg.sender, address(s));
    }

    function isSolved(address player) external view returns (bool) {
        Setup s = setupOf[player];
        if (address(s) == address(0)) return false;
        return s.isSolved(player);
    }
}
