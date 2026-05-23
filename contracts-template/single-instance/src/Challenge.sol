// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChallenge {
    function isSolved(address player) external view returns (bool);
}

/// Template: single shared instance, optional backend signer.
///
/// Replace the body of `_check()` with your own win condition. The
/// backend reads `isSolved(player)` and releases the flag when true.
///
/// If your challenge needs a backend signer (see backend/challenges.json
/// `signer.enabled`), expose a public `signer()` getter so deploy scripts
/// can verify the deployed value matches the backend wallet.
contract Challenge is IChallenge {
    address public immutable signer;

    constructor(address _signer) {
        signer = _signer;
    }

    /// Override this with your own win condition. The default never
    /// solves, so a fresh template never accidentally releases flags.
    function isSolved(address player) external view virtual returns (bool) {
        return _check(player);
    }

    function _check(address /*player*/) internal view virtual returns (bool) {
        return false;
    }
}
