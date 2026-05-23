// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Amm, IERC20} from "./Amm.sol";

/// A naive lending vault. Holds B-token reserves. Players deposit A
/// as collateral, the vault prices their A in B using `amm.priceAinB()`,
/// and lets them borrow up to 100% of the implied value.
///
/// Bug: the price comes from a single AMM's *spot* reserves. A player
/// can swap into the AMM to push priceAinB() arbitrarily high right
/// before borrowing — they pay AMM slippage, but if the vault's
/// borrow limit > AMM's slippage cost, they net positive B. Plus, the
/// player can swap back after borrowing to recover most of the
/// "collateral" they used to skew price.
///
/// Production mitigation:
///   - TWAP oracles (price0CumulativeLast in the Uniswap V2 pattern,
///     or a Chainlink feed).
///   - Multi-source price aggregation.
///   - Per-block borrow caps.
///   - Disallow same-block deposit + borrow.
contract LendingVault {
    Amm    public immutable amm;
    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;
    uint256 public constant SOLVE_THRESHOLD = 100_000 ether;

    mapping(address => uint256) public collateral;
    mapping(address => uint256) public debt;

    constructor(Amm _amm) {
        amm    = _amm;
        tokenA = _amm.tokenA();
        tokenB = _amm.tokenB();
    }

    function deposit(uint256 amount) external {
        require(tokenA.transferFrom(msg.sender, address(this), amount), "tfA");
        collateral[msg.sender] += amount;
    }

    /// Borrow B against your A-collateral, valued at the spot price.
    function borrow(uint256 amount) external {
        uint256 priceAinB = amm.priceAinB();
        uint256 maxBorrow = collateral[msg.sender] * priceAinB / 1e18;
        require(debt[msg.sender] + amount <= maxBorrow, "undercollateralized");
        debt[msg.sender] += amount;
        require(tokenB.transfer(msg.sender, amount), "tfB");
    }

    function isSolved(address who) external view returns (bool) {
        return tokenB.balanceOf(who) >= SOLVE_THRESHOLD;
    }
}
