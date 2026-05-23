// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// Naive ERC4626-shaped vault. Two bugs in one place:
///
///   1. `totalAssets()` reads live `asset.balanceOf(this)`. Anyone can
///      donate tokens directly to the vault and inflate the price per
///      share without going through deposit().
///   2. `deposit()` computes `shares = amount * totalShares / totalAssets`
///      with floor division and NO `require(shares > 0)`. If totalAssets
///      is bigger than amount * totalShares, the depositor pays full
///      price and receives zero shares.
///
/// Combine them: deposit 1 wei → mint 1 share → donate (amount > victim's
/// deposit) → trigger victim's deposit → victim gets 0 shares → withdraw
/// your 1 share, sweep the whole vault.
///
/// Pattern source: GoGoPool TokenggAVAX H-05, Cream Finance ~$130M loss (2021).
contract Vault {
    IERC20 public immutable asset;
    mapping(address => uint256) public balanceOf;
    uint256 public totalShares;

    constructor(IERC20 _asset) {
        asset = _asset;
    }

    function totalAssets() public view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    function deposit(uint256 amount) external returns (uint256 shares) {
        uint256 ts = totalShares;
        if (ts == 0) {
            shares = amount;
        } else {
            shares = amount * ts / totalAssets();
        }
        require(asset.transferFrom(msg.sender, address(this), amount), "tf");
        balanceOf[msg.sender] += shares;
        totalShares = ts + shares;
    }

    function withdraw(uint256 shares) external returns (uint256 amount) {
        amount = shares * totalAssets() / totalShares;
        balanceOf[msg.sender] -= shares;
        totalShares -= shares;
        require(asset.transfer(msg.sender, amount), "tf");
    }
}
