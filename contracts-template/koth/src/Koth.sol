// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// King-of-the-hill template.
///
/// One shared contract, multiple players competing on shared state.
/// `isSolved(player)` returns true *only for the current king*. When a
/// new player dethrones the previous one, the previous player goes back
/// to unsolved.
///
/// Pair this with the backend's scoreboard webhook (`WEBHOOK_URL`) so
/// every dethrone fires a `solve.flip` event — CTFd/GZCTF can award
/// "first-blood-of-this-window" points without polling.
///
/// Replace `_claim()` and any helpers with your own win condition.
contract Koth {
    address public king;

    event Crowned(address indexed newKing, address indexed oldKing);

    /// Override this with your scoring / claim logic. The default is the
    /// degenerate "whoever called most recently is king" — useful for
    /// smoke-testing the infra, but you'll want something harder.
    function claim() external virtual {
        _crown(msg.sender);
    }

    function _crown(address who) internal {
        address prev = king;
        king = who;
        emit Crowned(who, prev);
    }

    function isSolved(address who) external view returns (bool) {
        return who == king && who != address(0);
    }
}
