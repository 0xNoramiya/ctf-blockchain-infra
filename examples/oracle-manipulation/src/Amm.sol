// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// Minimal constant-product (x·y = k) AMM. NOT production-grade —
/// no fees, no LP tokens, no slippage guards. Just enough for an
/// oracle-manipulation example. Two-token pool of (tokenA, tokenB).
contract Amm {
    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;
    uint112 public reserveA;
    uint112 public reserveB;

    event Sync(uint112 reserveA, uint112 reserveB);
    event Swap(address indexed who, uint256 inA, uint256 inB, uint256 outA, uint256 outB);

    constructor(IERC20 _a, IERC20 _b) { tokenA = _a; tokenB = _b; }

    function seed(uint112 a, uint112 b) external {
        require(reserveA == 0 && reserveB == 0, "seeded");
        require(tokenA.transferFrom(msg.sender, address(this), a), "tfA");
        require(tokenB.transferFrom(msg.sender, address(this), b), "tfB");
        reserveA = a;
        reserveB = b;
        emit Sync(a, b);
    }

    /// Swap exactly `amountIn` of A for B. Returns the B out.
    /// x·y = k after the trade; constant-product, no fee.
    function swapAforB(uint256 amountIn) external returns (uint256 outB) {
        require(amountIn > 0, "0");
        require(tokenA.transferFrom(msg.sender, address(this), amountIn), "tfA");
        uint256 k = uint256(reserveA) * uint256(reserveB);
        uint256 newA = uint256(reserveA) + amountIn;
        uint256 newB = k / newA;
        outB = uint256(reserveB) - newB;
        require(outB > 0, "0 out");
        require(tokenB.transfer(msg.sender, outB), "tfB");
        reserveA = uint112(newA);
        reserveB = uint112(newB);
        emit Swap(msg.sender, amountIn, 0, 0, outB);
        emit Sync(reserveA, reserveB);
    }

    function swapBforA(uint256 amountIn) external returns (uint256 outA) {
        require(amountIn > 0, "0");
        require(tokenB.transferFrom(msg.sender, address(this), amountIn), "tfB");
        uint256 k = uint256(reserveA) * uint256(reserveB);
        uint256 newB = uint256(reserveB) + amountIn;
        uint256 newA = k / newB;
        outA = uint256(reserveA) - newA;
        require(outA > 0, "0 out");
        require(tokenA.transfer(msg.sender, outA), "tfA");
        reserveA = uint112(newA);
        reserveB = uint112(newB);
        emit Swap(msg.sender, 0, amountIn, outA, 0);
        emit Sync(reserveA, reserveB);
    }

    /// Spot price of A in B, scaled by 1e18. THIS IS THE BUG SOURCE
    /// downstream contracts shouldn't trust it for valuation because
    /// it's manipulable inside a single transaction.
    function priceAinB() external view returns (uint256) {
        require(reserveA > 0, "no reserves");
        return uint256(reserveB) * 1e18 / uint256(reserveA);
    }
}
