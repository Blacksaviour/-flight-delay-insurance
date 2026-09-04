// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";

import {INativeQueryVerifier, NativeQueryVerifierLib} from "../vendor/VerifierInterface.sol";
import {ASCBase} from "../vendor/ASCBase.sol";
import {ILiquidityPool} from "../interfaces/ILiquidityPool.sol";

/// @title PolicyManager
/// @notice Deployed on Creditcoin (CC3 testnet). This is the Attestcoin Smart Contract (ASC)
/// for the flight-delay parametric insurance product, combined with the dApp's business logic
/// (policy state, premiums, payouts) in a single contract per the "combined pattern" described
/// in Attestcoin's dApp Builder Infrastructure docs.
///
/// Flow:
///  1. A user calls purchasePolicy(...) and pays a premium in a testnet stablecoin.
///  2. Off-chain, a FlightDelayReporter transaction on Sepolia records the real delay.
///  3. Anyone (the frontend, in the hackathon demo) submits that transaction's inclusion
///     proof via execute() (inherited from ASCBase), which verifies it synchronously through
///     the Native Query Verifier precompile at 0x0FD2 before this contract ever sees the data.
///  4. Once verified, _processAndEmitEvent decodes the FlightDelayReported event from the
///     proven transaction and, if delayMinutes exceeds the policy's threshold, pays out.
///
/// The payout is cryptographically gated on step 3 succeeding -- there is no path to payout
/// that skips proof verification.
contract PolicyManager is Ownable, ReentrancyGuard, ASCBase {
    enum PolicyAction {
        SettleDelay // 0
    }

    enum PolicyStatus {
        Active,
        Triggered,
        Paid,
        Expired
    }

    struct Policy {
        address policyholder;
        uint256 thresholdMinutes;
        uint256 premium;
        uint256 payoutAmount;
        PolicyStatus status;
    }

    /// @dev keccak256("FlightDelayReported(uint256,uint256)")
    /// Must match FlightDelayReporter.sol on the source chain exactly -- if that event's
    /// signature changes, recompute this constant.
    bytes32 public constant DELAY_EVENT_SIGNATURE = keccak256("FlightDelayReported(uint256,uint256)");

    error InvalidAction(uint8 action);
    error ZeroAddress();
    error ZeroAmount();
    error PolicyNotFound(uint256 policyId);
    error PolicyNotActive(uint256 policyId);
    error SourceReporterNotRegistered();
    error DelayEventNotFromRegisteredReporter();
    error NoDelayEventFound();
    error LiquidityPoolNotRegistered();

    IERC20 public immutable STABLECOIN;

    /// @notice Address of the FlightDelayReporter contract on the source chain (Sepolia).
    /// Only FlightDelayReported events emitted by this address are trusted -- without this
    /// check, anyone could deploy a lookalike contract on Sepolia and emit a fraudulent
    /// FlightDelayReported event to trigger payouts.
    address public sourceReporterContract;

    /// @notice Address of the LiquidityPool contract that holds pooled capital. Premiums are
    /// forwarded here on purchasePolicy; payouts are pulled through payOut() on settlement.
    /// If left unset, policy purchase reverts -- the pool is a hard dependency, not optional,
    /// since the PRD requires all payouts to be backed by pooled LP capital (DeFi track).
    ILiquidityPool public liquidityPool;

    mapping(uint256 => Policy) public policies;
    uint256 public nextPolicyId;

    /// @notice When true, enables the local-development settleForTesting() functions.
    /// Can only be turned on by the owner on a local chain (chainId 407150), so it is
    /// inert on the real Creditcoin CC3 testnet.
    bool public localDevMode;

    event SourceReporterRegistered(address indexed sourceReporterContract);
    event LiquidityPoolRegistered(address indexed liquidityPool);
    event PolicyPurchased(
        uint256 indexed policyId, address indexed policyholder, uint256 thresholdMinutes, uint256 payoutAmount, uint256 premium
    );
    event PolicySettled(uint256 indexed policyId, uint256 delayMinutes, bool triggered);
    event PolicyExpired(uint256 indexed policyId);

    constructor(IERC20 stablecoin) Ownable(msg.sender) {
        if (address(stablecoin) == address(0)) revert ZeroAddress();
        STABLECOIN = stablecoin;
    }

        /// @notice Register the FlightDelayReporter contract address on the source chain.
    /// Owner-only, one-time-per-deployment in practice.
    function registerSourceReporter(address _sourceReporterContract) external onlyOwner {
        if (_sourceReporterContract == address(0)) revert ZeroAddress();
        sourceReporterContract = _sourceReporterContract;
        emit SourceReporterRegistered(_sourceReporterContract);
    }

    /// @notice Wire this PolicyManager to the LiquidityPool that backs payouts.
    /// Owner-only; must be called before any policy purchase so that premiums are
    /// forwarded to the pool and payouts are pulled from pooled LP capital.
    function setLiquidityPool(address _liquidityPool) external onlyOwner {
        if (_liquidityPool == address(0)) revert ZeroAddress();
        liquidityPool = ILiquidityPool(_liquidityPool);
        emit LiquidityPoolRegistered(_liquidityPool);
    }

        /// @notice Buy a flight-delay policy. Premium is pulled from the caller and forwarded
    /// to the LiquidityPool (pooled LP capital) to back the payout. Must have a registered
    /// liquidity pool beforehand.
    /// @param thresholdMinutes Delay (in minutes) that must be exceeded to trigger payout.
    /// @param payoutAmount Amount paid out (in stablecoin's smallest unit) if triggered.
    /// @param premium Amount charged upfront (in stablecoin's smallest unit).
    function purchasePolicy(uint256 thresholdMinutes, uint256 payoutAmount, uint256 premium)
        external
        nonReentrant
        returns (uint256 policyId)
    {
        if (payoutAmount == 0) revert ZeroAmount();
        if (address(liquidityPool) == address(0)) revert LiquidityPoolNotRegistered();

        bool ok = STABLECOIN.transferFrom(msg.sender, address(liquidityPool), premium);
        require(ok, "Premium transfer failed");
        liquidityPool.notifyPremiumReceived(premium);

        policyId = nextPolicyId++;
        policies[policyId] = Policy({
            policyholder: msg.sender,
            thresholdMinutes: thresholdMinutes,
            premium: premium,
            payoutAmount: payoutAmount,
            status: PolicyStatus.Active
        });

        emit PolicyPurchased(policyId, msg.sender, thresholdMinutes, payoutAmount, premium);
    }

    /// @dev Called by ASCBase.execute() only after the Native Query Verifier precompile has
    /// synchronously confirmed the Merkle + continuity proof for the submitted transaction.
    /// Nothing in this function needs to re-check "did this really happen on Sepolia" --
    /// that guarantee has already been made by the precompile before we get here.
    function _processAndEmitEvent(uint8 action, bytes32, /* queryId, unused */ bytes memory encodedTransaction)
        internal
        override
    {
        if (action == uint8(PolicyAction.SettleDelay)) {
            _settleFromDelayEvent(encodedTransaction);
        } else {
            revert InvalidAction(action);
        }
    }

    function _settleFromDelayEvent(bytes memory encodedTransaction) internal {
        if (sourceReporterContract == address(0)) revert SourceReporterNotRegistered();

        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        require(EvmV1Decoder.isValidTransactionType(txType), "Unsupported transaction type");

        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        require(receipt.receiptStatus == 1, "Source transaction did not succeed");

        EvmV1Decoder.LogEntry[] memory delayLogs = EvmV1Decoder.getLogsByEventSignature(receipt, DELAY_EVENT_SIGNATURE);
        if (delayLogs.length == 0) revert NoDelayEventFound();

        // MVP: only the first matching log in the transaction is processed.
        EvmV1Decoder.LogEntry memory log = delayLogs[0];

        if (log.address_ != sourceReporterContract) revert DelayEventNotFromRegisteredReporter();
        require(log.topics.length == 2, "Invalid FlightDelayReported topics");
        require(log.topics[0] == DELAY_EVENT_SIGNATURE, "Not FlightDelayReported event");
        require(log.data.length == 32, "Invalid FlightDelayReported data");

        uint256 policyId = uint256(log.topics[1]);
        uint256 delayMinutes = abi.decode(log.data, (uint256));

        Policy storage policy = policies[policyId];
        if (policy.policyholder == address(0)) revert PolicyNotFound(policyId);
        if (policy.status != PolicyStatus.Active) revert PolicyNotActive(policyId);

        bool triggered = delayMinutes > policy.thresholdMinutes;

        if (triggered) {
            if (address(liquidityPool) == address(0)) revert LiquidityPoolNotRegistered();
            policy.status = PolicyStatus.Paid;
            liquidityPool.payOut(policy.policyholder, policy.payoutAmount);
        } else {
            policy.status = PolicyStatus.Expired;
            emit PolicyExpired(policyId);
        }

        emit PolicySettled(policyId, delayMinutes, triggered);
    }

        /// @notice View helper for the frontend.
    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        return policies[policyId];
    }

    // =========================================================================
    // LOCAL DEVELOPMENT / TESTING ONLY
    // =========================================================================
    // The functions below exist solely to enable local simulation of the
    // Attestcoin flow without the real Creditcoin precompile (0x0FD2). They
    // are guarded by an `onlyLocalDev` modifier and can only be enabled by
    // the contract owner on a local chain (chainId 407150). In production
    // on Creditcoin CC3 testnet, these functions are inert.
    //
    // How it works: settleForTesting() directly calls _settleFromDelayEvent()
    // with a hand-crafted encodedTransaction blob built by EvmV1Fixtures,
    // completely skipping the ASCBase.execute() → precompile verification
    // path. This is the correct pattern for local development because the
    // precompile at 0x0FD2 does not exist on Anvil.

    /// @dev Enables or disables local-dev mode for testing functions.
    /// Can only be called by the owner on a local chain (chainId 407150).
    function setLocalDevMode(bool enabled) external onlyOwner {
        uint256 chainId;
        assembly { chainId := chainid() }
        require(chainId == 407150, "Local dev only on chainId 407150");
        localDevMode = enabled;
    }

    modifier onlyLocalDev() {
        require(localDevMode, "Local dev mode not enabled");
        _;
    }

    /// @notice Simulates the settle flow for local development/testing.
    /// This bypasses Attestcoin proof verification and directly calls
    /// _settleFromDelayEvent() with a mock encoded transaction.
    /// ONLY callable when localDevMode is enabled (chainId 407150).
    function settleForTesting(uint256 policyId, uint256 delayMinutes) external onlyLocalDev {
        // Build a mock encoded transaction blob that EvmV1Decoder can decode.
        // This mirrors what EvmV1Fixtures.buildDelayReportTx() produces in tests.
        bytes memory encodedTransaction = _buildMockDelayReportTx(
            sourceReporterContract,
            policyId,
            delayMinutes,
            DELAY_EVENT_SIGNATURE
        );

        // Directly call the internal settle logic, bypassing ASCBase.execute()
        _settleFromDelayEvent(encodedTransaction);
    }

    /// @dev Builds a mock EvmV1-encoded transaction blob containing a
    /// FlightDelayReported event log, for use in settleForTesting().
    /// This must match the field layout that EvmV1Decoder expects.
    function _buildMockDelayReportTx(
        address emitter,
        uint256 policyId,
        uint256 delayMinutes,
        bytes32 eventSignature
    ) internal pure returns (bytes memory) {
        // Chunk 0: CommonTxFields
        bytes memory chunk0 = abi.encode(
            uint64(1),    // nonce
            uint64(21000), // gasLimit
            address(0xBEEF), // from
            false,        // toIsNull
            emitter,      // to (the reporter contract)
            uint256(0),   // value
            bytes("")     // data
        );

        // Chunk 1: Type2Fields (unused by PolicyManager, but required for valid tx)
        bytes memory chunk1 = abi.encode(
            uint64(11155111),  // chainId (Sepolia, unused by decoder)
            uint128(1 gwei),   // maxPriorityFeePerGas
            uint128(2 gwei),   // maxFeePerGas
            new bytes[](0),    // empty access list
            uint8(0),          // yParity
            bytes32(0),        // r
            bytes32(0)         // s
        );

        // Chunk 2: ReceiptFields with the FlightDelayReported event log
        bytes32[] memory topics = new bytes32[](2);
        topics[0] = eventSignature;
        topics[1] = bytes32(policyId);

        EvmV1Decoder.LogEntryTuple memory log = EvmV1Decoder.LogEntryTuple({
            address_: emitter,
            topics: topics,
            data: abi.encode(delayMinutes)
        });

        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = log;

        bytes memory chunk2 = abi.encode(
            uint8(1),     // receiptStatus = success
            uint64(50000), // receiptGasUsed
            logs,
            bytes("")    // receiptLogsBloom
        );

        bytes[] memory chunks = new bytes[](3);
        chunks[0] = chunk0;
        chunks[1] = chunk1;
        chunks[2] = chunk2;

        return abi.encode(uint8(2), chunks); // type 2 transaction
    }
}
