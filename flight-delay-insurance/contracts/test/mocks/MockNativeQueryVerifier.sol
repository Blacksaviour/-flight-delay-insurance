// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {INativeQueryVerifier} from "../../src/vendor/VerifierInterface.sol";

/// @notice Stand-in for the real Native Query Verifier precompile (0x0FD2), which only exists
/// on actual Creditcoin networks. Deployed to that fixed address in tests via `vm.etch` so
/// PolicyManager's calls to the precompile address route here instead. This lets us exercise
/// the full verify -> decode -> settle path without a live testnet connection, while keeping
/// the proof-shaped calldata format identical to what the real precompile expects.
contract MockNativeQueryVerifier is INativeQueryVerifier {
    bool public nextResult = true;

    function setNextResult(bool result) external {
        nextResult = result;
    }

    function verifyAndEmit(
        uint64, /* chainKey */
        uint64, /* height */
        bytes calldata, /* encodedTransaction */
        MerkleProof calldata, /* merkleProof */
        ContinuityProof calldata /* continuityProof */
    ) external view returns (bool) {
        return nextResult;
    }

    function calculateTxIndex(MerkleProof calldata merkleProof) external pure returns (uint64) {
        // Deterministic, arbitrary-but-stable stand-in derived from the proof shape so
        // different test fixtures naturally get different queryIds.
        return uint64(merkleProof.siblings.length);
    }
}
