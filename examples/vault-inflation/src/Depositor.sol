// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vault, IERC20} from "./Vault.sol";

interface IApprove {
    function approve(address spender, uint256 amount) external returns (bool);
}

/// Naive victim contract. Holds funds and will deposit them all into
/// the vault — but only when the player tells it to via
/// `triggerVictimDeposit()`. This gives the player full control over
/// the deposit ordering relative to their own actions.
contract Depositor {
    Vault public immutable vault;
    IERC20 public immutable asset;
    bool public triggered;

    constructor(Vault _vault) {
        vault = _vault;
        asset = _vault.asset();
    }

    function triggerVictimDeposit() external {
        require(!triggered, "already");
        uint256 amount = asset.balanceOf(address(this));
        IApprove(address(asset)).approve(address(vault), amount);
        vault.deposit(amount);
        triggered = true;
    }
}
