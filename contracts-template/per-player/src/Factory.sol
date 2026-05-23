// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Template: one isolated instance per player.
///
/// The backend points its `target` at this Factory and gates the flag on
/// `isSolved(player)`. Each player calls `spawn()` exactly once; the
/// factory deploys a fresh `Instance` for them.
contract Factory {
    mapping(address => Instance) public instanceOf;

    event Spawned(address indexed player, address instance);

    function spawn() external returns (Instance inst) {
        require(address(instanceOf[msg.sender]) == address(0), "already spawned");
        inst = new Instance(msg.sender);
        instanceOf[msg.sender] = inst;
        emit Spawned(msg.sender, address(inst));
    }

    function isSolved(address player) external view returns (bool) {
        Instance inst = instanceOf[player];
        if (address(inst) == address(0)) return false;
        return inst.isSolved();
    }
}

/// Per-player instance. Replace `_check()` with your win condition.
contract Instance {
    address public immutable player;

    constructor(address _player) {
        player = _player;
    }

    function isSolved() external view returns (bool) {
        return _check();
    }

    function _check() internal view virtual returns (bool) {
        return false;
    }
}
