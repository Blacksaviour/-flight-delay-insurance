// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";

/// @notice Builds `encodedTransaction` byte blobs in the exact (uint8, bytes[]) chunked format
/// that EvmV1Decoder expects, so tests can exercise PolicyManager's decode/settle logic without
/// needing a real proof from a live source chain. This mirrors, field-for-field, the encoding
/// scheme documented in EvmV1Decoder.sol for an EIP-1559 (type 2) transaction.
library EvmV1Fixtures {
    /// @notice Builds a type-2 encoded transaction whose receipt contains exactly one log:
    /// FlightDelayReported(uint256 indexed policyId, uint256 delayMinutes), emitted by `emitter`.
    function buildDelayReportTx(address emitter, uint256 policyId, uint256 delayMinutes, bytes32 eventSignature)
        internal
        pure
        returns (bytes memory encodedTransaction)
    {
        // Chunk 0: CommonTxFields (nonce, gasLimit, from, toIsNull, to, value, data)
        bytes memory chunk0 = abi.encode(
            uint64(1), // nonce
            uint64(21000), // gasLimit
            address(0xBEEF), // from (unused by PolicyManager)
            false, // toIsNull
            emitter, // to
            uint256(0), // value
            bytes("") // data
        );

        // Chunk 1: Type2Fields (chainId, maxPriorityFeePerGas, maxFeePerGas, accessList, yParity, r, s)
        EvmV1Decoder.AccessListEntryBytes32[] memory emptyAccessList = new EvmV1Decoder.AccessListEntryBytes32[](0);
        bytes memory chunk1 = abi.encode(
            uint64(11155111), // chainId (Sepolia)
            uint128(1 gwei),
            uint128(2 gwei),
            emptyAccessList,
            uint8(0),
            bytes32(0),
            bytes32(0)
        );

        // Chunk 2: ReceiptFields (receiptStatus, receiptGasUsed, receiptLogs, receiptLogsBloom)
        bytes32[] memory topics = new bytes32[](2);
        topics[0] = eventSignature;
        topics[1] = bytes32(policyId);

        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = EvmV1Decoder.LogEntryTuple({address_: emitter, topics: topics, data: abi.encode(delayMinutes)});

        bytes memory chunk2 = abi.encode(
            uint8(1), // receiptStatus = success
            uint64(50000), // receiptGasUsed
            logs,
            bytes("") // receiptLogsBloom (unused by PolicyManager)
        );

        bytes[] memory chunks = new bytes[](3);
        chunks[0] = chunk0;
        chunks[1] = chunk1;
        chunks[2] = chunk2;

        encodedTransaction = abi.encode(uint8(2), chunks);
    }

    /// @notice Same as buildDelayReportTx but with receiptStatus = 0 (failed source-chain tx),
    /// to exercise PolicyManager's "Source transaction did not succeed" guard.
    function buildFailedTx(address emitter, uint256 policyId, uint256 delayMinutes, bytes32 eventSignature)
        internal
        pure
        returns (bytes memory encodedTransaction)
    {
        bytes memory chunk0 =
            abi.encode(uint64(1), uint64(21000), address(0xBEEF), false, emitter, uint256(0), bytes(""));

        EvmV1Decoder.AccessListEntryBytes32[] memory emptyAccessList = new EvmV1Decoder.AccessListEntryBytes32[](0);
        bytes memory chunk1 = abi.encode(
            uint64(11155111), uint128(1 gwei), uint128(2 gwei), emptyAccessList, uint8(0), bytes32(0), bytes32(0)
        );

        bytes32[] memory topics = new bytes32[](2);
        topics[0] = eventSignature;
        topics[1] = bytes32(policyId);

        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = EvmV1Decoder.LogEntryTuple({address_: emitter, topics: topics, data: abi.encode(delayMinutes)});

        bytes memory chunk2 = abi.encode(uint8(0), uint64(50000), logs, bytes(""));

        bytes[] memory chunks = new bytes[](3);
        chunks[0] = chunk0;
        chunks[1] = chunk1;
        chunks[2] = chunk2;

        encodedTransaction = abi.encode(uint8(2), chunks);
    }
}
