// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// The only ABI the backend relies on. Any contract you point a manifest
/// entry's `target` at must implement this.
///
/// `who` is the address the backend will pass — usually the connected
/// wallet's address. Returning true releases the flag from the backend
/// when the player calls `/api/flag/:id?address=who`.
interface IChallenge {
    function isSolved(address who) external view returns (bool);
}
