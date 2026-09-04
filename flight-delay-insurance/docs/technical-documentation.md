# Technical Documentation: Attestcoin Protocol Integration

## Overview

This document explains how the flight-delay parametric insurance product integrates
with the **Attestcoin Protocol** on Creditcoin CC3 testnet. The core guarantee is:
**a policy payout only fires if a real on-chain transaction on Ethereum Sepolia
recording the delay fact is cryptographically proven to have occurred.**

The proof is not simulated — it uses the real `@gluwa/usc-sdk` `ProofBuilder` service
and the real `NativeQueryVerifier` precompile at `0x0FD2` on Creditcoin. The
precompile verifies a **Merkle inclusion proof** (the transaction was in that Sepolia
block) and a **continuity proof** (that Sepolia block was anchored to a Creditcoin
attestation checkpoint).

---

## Architecture Diagram

```
[Ethereum Sepolia]                    [Creditcoin CC3 testnet]

 FlightDelayReporter.sol                 (block attested automatically
   reportDelay(policyId, delayMinutes)       by Creditcoin's attesters)
        |                                         |
        |  @gluwa/usc-sdk                        2. Attestcoin
        |  ProofBuilder.waitUntilHeightAttested()   attestation
        |  ProofBuilder.getProof(txHash)            (periodic)
        |                                          |
        |  proofData = { chainKey,                3. submit ->
        |    headerNumber, txBytes,              PolicyManager.execute()
        |    merkleProof.root,                    -> precompile 0x0FD2
        |    merkleProof.siblings,                -> verifyAndEmit()
        |    continuityProof.lowerEndpointDigest  -> Merkle + continuity
        |    continuityProof.roots }              proof verified
        |                                          |
        +----->  4. decoded txBytes --------------> PolicyManager
                      +-- EvmV1Decoder             _settleFromDelayEvent()
                      +-- reads FlightDelayReported(policyId, delayMinutes)
                      +-- checks delayMinutes > thresholdMinutes
                      +-- liquidityPool.payOut(policyholder, payoutAmount)
```

---

## Key Contracts

| Contract | Network | Purpose |
|---|---|---|
| `FlightDelayReporter.sol` | Sepolia | Records the delay fact as an on-chain event (the tx we prove) |
| `PolicyManager.sol` | Creditcoin CC3 | ASC entry point (`execute()`), policy state, proof decode, settle |
| `LiquidityPool.sol` | Creditcoin CC3 | Pooled LP capital backing payouts; mints LP tokens |
| `MockUSDC.sol` | Creditcoin CC3 | 6-decimal test stablecoin for premiums/payouts |
| `ASCBase.sol` | Creditcoin CC3 | Vendored from `@gluwa/usc-contracts@0.1.2`; provides `execute()` entry point |
| `VerifierInterface.sol` | Creditcoin CC3 | Interface to precompile `0x0FD2` (`verifyAndEmit`, `calculateTxIndex`) |

---

## Data Flow (Step by Step)

### Step 1 — Policy Purchase (Creditcoin -> Creditcoin)

```solidity
PolicyManager.purchasePolicy(thresholdMinutes, payoutAmount, premium)
```

1. Caller approves `MockUSDC` for `PolicyManager`.
2. `PolicyManager` calls `STABLECOIN.transferFrom(msg.sender, liquidityPool, premium)`
   — the premium is forwarded to the LiquidityPool, not held by PolicyManager itself.
3. `PolicyManager` calls `liquidityPool.notifyPremiumReceived(premium)` — an
   accounting notification (emits `PremiumReceived`).
4. A `Policy` struct is stored: `{ policyholder, thresholdMinutes,
### Step 2 — Delay Reported (Sepolia -> Sepolia)

```solidity
FlightDelayReporter.reportDelay(policyId, delayMinutes)
```

1. The team-controlled **reporter wallet** (the disclosed hackathon simplification —
   see "Scope Limitations" below) calls `reportDelay`.
2. The contract emits `FlightDelayReported(policyId, delayMinutes)`. The transaction's
   calldata and logs are now anchored in a Sepolia block.
3. Creditcoin's attesters **automatically** attest that Sepolia block to Creditcoin
   (this is the Attestcoin Protocol's automatic periodic attestation — no action needed).

### Step 3 — Proof Generation (Off-Chain, Creditcoin -> Proof Builder Service)

**File:** `offchain/scripts/settleFlightDelay.ts`, function `main()`

```typescript
// 3a. Wait for Creditcoin to attest the Sepolia block
const proofBuilder = new proofProvider.service.ProofBuilder(chainKey, proofBuilderUrl, 5000);
await proofBuilder.waitUntilHeightAttested(chainKey, blockNumber);

// 3b. Fetch the inclusion proof
const proofResult = await proofBuilder.getProof(txHash);
const proofData = proofResult.data;
// proofData = { chainKey, headerNumber, txBytes, merkleProof, continuityProof }
```

- `waitUntilHeightAttested()` polls the Proof Builder service until the Sepolia block
  at `blockNumber` has been anchored to a Creditcoin attestation checkpoint.
  Default timeout: 15 minutes.
- `getProof(txHash)` returns the Merkle proof (siblings) and continuity proof
  (lowerEndpointDigest + continuityRoots).

**Important:** The `chainKey` for Sepolia is **not assumed to be 1**. Before deploying,
run `npm run check-chains` (`offchain/scripts/checkSupportedChains.ts`) to query the
`ChainInfoProvider` and discover the real chain key. This is the PRD's Days 1-2
de-risking step.

### Step 4 — Proof Submission & Verification (Creditcoin -> Precompile -> PolicyManager)

```typescript
// From settleFlightDelay.ts — submits to Creditcoin
const settleTx = await policyManager.execute(
    PolicyManagerAction.SettleDelay,   // action = 0
    proofData.chainKey,
    proofData.headerNumber,
    proofData.txBytes,
    proofData.merkleProof.root,
    proofData.merkleProof.siblings,
    proofData.continuityProof.lowerEndpointDigest,
    proofData.continuityProof.roots
);
```

Inside `PolicyManager.execute()` (inherited from `ASCBase`):

1. **Query ID computation + replay check:**
   `ASCBase._computeQueryId()` hashes `(chainKey, blockHeight, txIndex)` into a
   `bytes32`. If `processedQueries[queryId]` is already `true`, the call reverts with
   `"Query already processed"` — this prevents double-payout from the same proof.

2. **On-chain proof verification (the cryptographic gate):**
   `ASCBase._verifyProof()` calls `VERIFIER.verifyAndEmit(chainKey, height,
   encodedTransaction, merkleProof, continuityProof)` on the precompile at `0x0FD2`.
   - **Merkle proof:** verifies that the Sepolia transaction is included in the
     attested block (proves "this tx happened on Sepolia").
   - **Continuity proof:** verifies that the Sepolia block header was anchored to a
     Creditcoin attestation checkpoint (proves "Creditcoin's attesters confirmed
     this block").
   - If either proof fails, the precompile returns `false` and `execute()` reverts
     with `"Proof of inclusion verification failed"`.

3. **Mark as processed:** `processedQueries[queryId] = true` — no replay possible.

4. **Dispatch to business logic:** `_processAndEmitEvent(action, queryId,
   encodedTransaction)` -> `_settleFromDelayEvent(encodedTransaction)`.

### Step 5 — Settlement Logic (PolicyManager)

Inside `_settleFromDelayEvent(bytes memory encodedTransaction)`:

```solidity
// 1. Verify the source transaction succeeded
EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
require(receipt.receiptStatus == 1, "Source transaction did not succeed");

// 2. Find the FlightDelayReported event log
EvmV1Decoder.LogEntry[] memory delayLogs = EvmV1Decoder.getLogsByEventSignature(
    receipt, DELAY_EVENT_SIGNATURE
);
require(delayLogs.length > 0, "NoDelayEventFound");

// 3. Verify the event came from the registered FlightDelayReporter contract
EvmV1Decoder.LogEntry memory log = delayLogs[0];
require(log.address_ == sourceReporterContract, "DelayEventNotFromRegisteredReporter");

// 4. Validate the log structure
require(log.topics[0] == DELAY_EVENT_SIGNATURE, "Not FlightDelayReported event");
require(log.topics.length == 2, "Invalid topics");
require(log.data.length == 32, "Invalid data");

// 5. Extract policyId and delayMinutes from the log
uint256 policyId = uint256(log.topics[1]);
uint256 delayMinutes = abi.decode(log.data, (uint256));

// 6. Look up the policy
Policy storage policy = policies[policyId];
require(policy.policyholder != address(0), "PolicyNotFound");
require(policy.status == Active, "PolicyNotActive");

// 7. Compare against threshold and settle
if (delayMinutes > policy.thresholdMinutes) {
    policy.status = Paid;
    liquidityPool.payOut(policy.policyholder, policy.payoutAmount);
    emit PolicySettled(policyId, delayMinutes, true);
} else {
    policy.status = Expired;
    emit PolicyExpired(policyId);
    emit PolicySettled(policyId, delayMinutes, false);
}
```

Key point: **Step 4 (the precompile verification) is the cryptographic gate.** If the
proof is invalid, the function never reaches the decode/settle logic. There is **no
code path** that pays out without a successfully verified proof.
---

## Security Properties

| Property | How it's enforced |
|---|---|
| **Proof must be valid** | `ASCBase.execute()` calls `verifyAndEmit()` on the `0x0FD2` precompile. If it returns `false`, execution reverts before any business logic runs. |
| **No replay** | `processedQueries[queryId]` mapping blocks duplicate proof submissions. |
| **Only the real reporter's events are trusted** | `log.address_` (the contract address from the proven Sepolia transaction) is checked against `sourceReporterContract` (whitelisted by PolicyManager owner). An attacker cannot deploy a fake contract on Sepolia and claim its events came from the real reporter. |
| **Single-use policies** | `policy.status` must be `Active`; after settlement it becomes `Paid` or `Expired`. |
| **Premium safety** | `nonReentrant` guard on `purchasePolicy`. |
| **Pool solvency for payouts** | `LiquidityPool.payOut()` checks `amount <= balanceOf(pool)` and reverts with `InsufficientPoolLiquidity` if insufficient. |

---

## Scope Limitations & Simplifications (Disclosed)

### Single reporter (disclosed in PRD §3)
`FlightDelayReporter.reportDelay()` is restricted to a single `reporter` address
controlled by the team. In production, this would be replaced by:
- A decentralized set of data attesters (e.g., 3-of-5 threshold) cross-checking a
  real flight-status API (FlightAware, AviationStack, etc.), or
- A Chainlink CCIP or similar oracle writing to the reporter contract.

The **only** mocked part of the system is **who calls `reportDelay()`**. Everything
downstream — attestation, proof generation, on-chain precompile verification, log
decoding, threshold comparison, and payout — is fully real and cryptographically
enforced.

### LP token economics (MVP)
The `LiquidityPool` mints a simple LP token (no risk tranching). Senior/junior
tranches are a stretch goal (PRD §14), not implemented. LP token value is a simple
pro-rata claim on the pool's stablecoin balance.

### Manual flight data entry
No live flight-status API integration. The team manually provides the delay value
when calling `reportDelay()`. Real API integration is a stretch goal (PRD §14).

---

## End-to-End Demo Sequence

1. **Alice buys a policy:** `purchasePolicy(120, 200e6, 10e6)` — 200 USDC payout if
   the flight is delayed > 120 min, 10 USDC premium. Premium is forwarded to the
   LiquidityPool.

2. **Team reports the delay:** `reporter.reportDelay(0, 180)` on Sepolia — the flight
   was delayed 180 minutes. This transaction is anchored in a Sepolia block.

3. **Creditcoin attests the block:** (automatic, periodic — no action needed).

4. **Frontend runs the proof pipeline** (`npm run settle -- 0 180`):
   - `waitUntilHeightAttested()` polls until the block is attested.
   - `getProof(txHash)` fetches the Merkle + continuity proof.
   - `policyManager.execute(...)` submits the proof to the `0x0FD2` precompile.

5. **Precompile verifies the proof** — Merkle inclusion + continuity — on-chain.

6. **PolicyManager decodes the proven transaction**, reads `delayMinutes = 180`,
   compares `180 > 120` -> `true`, calls `liquidityPool.payOut(alice, 200e6)`.

7. **Alice receives 200 USDC** — automatically, no adjuster, no claim form.

---

## Running the Code

### Prerequisites
- Node.js 22+, Foundry (forge), npm
- Real RPC URLs for Sepolia and Creditcoin CC3 testnet
- Funded test wallets on both networks
- Real `SEPOLIA_CHAIN_KEY` (query via `npm run check-chains`)

### 1. Compile and test contracts
```bash
cd contracts
npm install
forge test
# Expected: 18 passed
```

### 2. Deploy
```bash
# Sepolia (reporter contract)
forge script script/DeploySepoliaReporter.s.sol \
    --rpc-url sepolia --broadcast -vvvv

# Creditcoin CC3 testnet
forge script script/DeployCreditcoin.s.sol \
    --rpc-url creditcoin_cc3_testnet --broadcast -vvvv
```

### 3. Configure offchain
```bash
cd ../offchain
npm install
cp .env.example .env
# Fill in RPC URLs, private keys, all contract addresses
npm run check-chains    # confirms SEPOLIA_CHAIN_KEY
```

### 4. Run settlement pipeline
```bash
npm run settle -- <policyId> <delayMinutes>
# Example: npm run settle -- 0 180
```
   premium, payoutAmount, status: Active }`.