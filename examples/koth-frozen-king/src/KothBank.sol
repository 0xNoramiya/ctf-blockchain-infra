// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// KOTH-style "bank": deposit tokens, accumulate a score. Highest score
/// is king; isSolved(player) == (player == king).
///
/// Bug: `withdraw()` decrements the caller's score but never updates
/// `kingScore` (or re-elects a king from remaining scores). Once a
/// player has been crowned, they can withdraw their entire stake and
/// remain king forever — the throne is frozen because every subsequent
/// `bump()` is compared against a kingScore that no longer reflects any
/// real balance.
///
/// Mitigation: on withdraw, if caller is king, recompute the new king
/// from a leaderboard, or require king to maintain a minimum balance,
/// or use highest-balance-since-block-N semantics.
contract KothBank {
    IERC20  public immutable token;
    mapping(address => uint256) public score;
    address public king;
    uint256 public kingScore;

    event Crowned(address indexed newKing, address indexed oldKing, uint256 score);

    constructor(IERC20 _token) { token = _token; }

    function bump(uint256 amount) external {
        require(token.transferFrom(msg.sender, address(this), amount), "tf");
        unchecked { score[msg.sender] += amount; }
        if (score[msg.sender] > kingScore) {
            emit Crowned(msg.sender, king, score[msg.sender]);
            kingScore = score[msg.sender];
            king = msg.sender;
        }
    }

    function withdraw(uint256 amount) external {
        require(score[msg.sender] >= amount, "balance");
        unchecked { score[msg.sender] -= amount; }
        require(token.transfer(msg.sender, amount), "tf");
        // 🚨 missing: if (msg.sender == king) { kingScore = score[msg.sender]; }
        //             plus a re-election step.
    }

    function isSolved(address who) external view returns (bool) {
        return who == king && who != address(0);
    }
}
