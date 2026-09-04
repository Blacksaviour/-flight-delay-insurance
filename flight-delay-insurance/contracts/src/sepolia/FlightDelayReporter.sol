// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title FlightDelayReporter
/// @notice Deployed on a source chain (Ethereum Sepolia on testnet). Records a flight-delay
/// fact as an on-chain event tied to a specific policyId. This transaction is later proven
/// into Creditcoin via the Attestcoin Protocol (Merkle + continuity proof, verified through
/// the Native Query Verifier precompile at 0x0FD2) so that PolicyManager on Creditcoin can
/// trust that this event genuinely happened on Sepolia before it releases a payout.
///
/// HACKATHON SIMPLIFICATION (disclosed): reportDelay() is restricted to a single `reporter`
/// address controlled by the team, standing in for a real flight-status data source / a
/// decentralized set of attesters. This is the only mocked part of the system — everything
/// downstream of this transaction (attestation, proof generation, on-chain verification,
/// payout gating) is real, functional Attestcoin Protocol usage, not simulated.
contract FlightDelayReporter is Ownable {
    /// @dev keccak256("FlightDelayReported(uint256,uint256)")
    /// PolicyManager on Creditcoin decodes logs by this exact signature — if you change this
    /// event's name or argument types, recompute the signature and update PolicyManager too.
    event FlightDelayReported(uint256 indexed policyId, uint256 delayMinutes);

    address public reporter;

    error NotAuthorizedReporter(address caller);
    error ZeroAddress();

    constructor(address initialReporter) Ownable(msg.sender) {
        if (initialReporter == address(0)) revert ZeroAddress();
        reporter = initialReporter;
    }

    /// @notice Update who is allowed to report delays. Owner-only.
    function setReporter(address newReporter) external onlyOwner {
        if (newReporter == address(0)) revert ZeroAddress();
        reporter = newReporter;
    }

    /// @notice Record that `policyId`'s flight was delayed by `delayMinutes`.
    /// @dev This is the transaction that gets attested and proven into Creditcoin.
    function reportDelay(uint256 policyId, uint256 delayMinutes) external {
        if (msg.sender != reporter) revert NotAuthorizedReporter(msg.sender);
        emit FlightDelayReported(policyId, delayMinutes);
    }
}
