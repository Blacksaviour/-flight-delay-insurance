# PRD: Parametric Flight-Delay Insurance on Creditcoin
**Hackathon:** BUIDL CTC 2026 Fall (Creditcoin & Credit Labs)
**Primary track:** RWA | **Secondary track:** DeFi (reinsurance pool)
**Submission window:** Aug 13 – Sep 6, 2026

---

## 1. Problem statement

Traditional insurance claims are slow, manual, and expensive — an adjuster has to verify what happened before you get paid. Parametric insurance replaces that with an objective, pre-agreed trigger: if a measurable condition is met, payout is automatic. The missing piece has always been a trustworthy way to get real-world facts on-chain without relying on one centralized oracle operator. That's what the Attestcoin Protocol is built to solve.

## 2. What we're building

A flight-delay insurance product on Creditcoin where:
- Users buy a policy (flight number, delay threshold, premium, payout amount).
- A delay event is reported and cryptographically proven to have occurred, using the Attestcoin Protocol's cross-chain transaction-inclusion proofs.
- The policy contract verifies that proof on-chain and pays out automatically — no adjuster, no manual claim.
- (Stretch) A liquidity pool backs payouts and mints LP tokens to depositors, pulling in the DeFi track.

## 3. How Attestcoin Protocol actually works (and why it changes the design)

The `@gluwa/usc-sdk` proves **"did transaction X really happen on source chain Y?"** — not arbitrary off-chain facts directly. It does this with:
- A **Merkle proof** (tx is in a specific block)
- A **continuity proof** (that block is anchored to an attestation checkpoint on Creditcoin)

This means we can't ask Attestcoin Protocol "was flight AA123 delayed?" directly. Instead, the pattern is:

1. A small **reporter contract** on a supported source chain (Ethereum Sepolia on testnet) records the delay fact as a transaction — e.g., `reportDelay(flightId, delayMinutes)`.
2. Once that block is attested on Creditcoin (automatic, periodic), we generate an **inclusion proof** for that transaction via the SDK's `ProofBuilder`.
3. We submit the proof to Creditcoin's `PrecompileBlockProver.verifySingle(...)`, which verifies on-chain that the transaction genuinely happened on Sepolia.
4. Our `PolicyManager` contract on Creditcoin decodes the verified transaction's calldata (`txBytes`) to read `flightId` and `delayMinutes`, checks it against the policy's threshold, and pays out if triggered.

This is the real, functional integration point the judges are scoring — the payout is *cryptographically gated* on proof verification, not on a trusted API call or a UI simulation.

**Where we simplify for the hackathon (and disclose it):** who is allowed to call `reportDelay()` on Sepolia. In production this would be a decentralized set of data attesters cross-checking a real flight-status API. For the demo, we run it as a single reporter wallet the team controls, seeded by a real or manually-entered flight-status lookup. The attestation and proof-verification mechanics themselves are 100% real — nothing about the Creditcoin ↔ Sepolia proof flow is mocked.

## 4. Goals / Non-goals

**Goals**
- Working, functional Attestcoin Protocol integration (proof generation + on-chain verification), not simulated
- One clean, demoable end-to-end flow: buy policy → delay reported → proof generated → payout fires
- Clear technical documentation of the Attestcoin integration (required for judging)

**Non-goals (for MVP)**
- Multiple trigger types (crop, weather) — pick flight delay only
- Fully decentralized/multi-attester reporting on the source chain
- Production-grade actuarial pricing
- Real flight-status API integration (nice-to-have stretch, not core)

## 5. Track fit

| Track | How this project satisfies it |
|---|---|
| **RWA (primary)** | Tokenizes and finances a real-world risk product; bridges an off-chain event (flight delay) to on-chain payout with transparency |
| **DeFi (stretch)** | Liquidity pool: LPs deposit stablecoin, earn premium yield, absorb payout risk pro-rata |

## 6. System architecture

```
[Sepolia testnet]                         [Creditcoin CC3 testnet]
                                            
 FlightDelayReporter.sol      ──tx──►      (block gets attested
   reportDelay(flightId,                    automatically by
   delayMinutes)                            Creditcoin's attesters)
        │
        │ usc-sdk: ProofBuilder
        │   .waitUntilHeightAttested()
        │   .getProof(txHash)
        ▼
   proofData { chainKey, headerNumber,
   txBytes, merkleProof, continuityProof }
        │
        │ submit
        ▼
                                            PrecompileBlockProver
                                              .verifySingle(proofData)
                                                    │
                                                    ▼
                                            PolicyManager.sol
                                              - decodes txBytes
                                              - checks delayMinutes > threshold
                                              - releases payout from
                                                LiquidityPool.sol (or contract
                                                balance for MVP)
                                                    │
                                                    ▼
                                            Policyholder wallet (paid)
```

## 7. Contracts

### 7.1 `FlightDelayReporter.sol` (Sepolia)
- `reportDelay(bytes32 flightId, uint256 delayMinutes)` — emits event, stores fact as calldata for the tx we'll prove
- Access-controlled to a reporter address for MVP (documented as a simplification)

### 7.2 `PolicyManager.sol` (Creditcoin CC3 testnet)
- `struct Policy { flightId, thresholdMinutes, premium, payoutAmount, policyholder, status }`
- `purchasePolicy(flightId, thresholdMinutes, payoutAmount)` — collects premium in testnet stablecoin
- `submitProofAndSettle(policyId, proofData)` — calls `PrecompileBlockProver.verifySingle`, decodes `txBytes`, checks threshold, transfers payout if triggered
- Emits `PolicyTriggered` / `PolicyExpired` events

### 7.3 `LiquidityPool.sol` (Creditcoin, stretch goal)
- `deposit(amount)` → mints LP token
- `withdraw(lpTokenAmount)` → redeems pro-rata share
- Premiums flow in on `purchasePolicy`; payouts flow out on `submitProofAndSettle`

### 7.4 Mock stablecoin
- Simple ERC-20 mint-to-test-users, or use an existing Creditcoin testnet faucet token if available

## 8. Frontend (minimal)

- Connect wallet (Creditcoin CC3 testnet)
- Buy policy: flight ID, threshold, payout, premium → calls `purchasePolicy`
- Admin/demo panel: trigger `reportDelay` on Sepolia (simulating the data source), then run the proof pipeline and call `submitProofAndSettle`
- Policy status view: Active → Triggered → Paid
- (Stretch) LP dashboard: pool balance, premiums earned, your share

**Stack:** Next.js, ethers.js v6 (required as peer dep by `@gluwa/usc-sdk`), Tailwind, RainbowKit/wagmi for wallet connection.

## 9. Data flow / sequence for the demo

1. User buys flight AA123 policy: threshold 120 min, payout 200 USDC, premium 10 USDC.
2. Team (as reporter) calls `reportDelay(AA123, 180)` on Sepolia.
3. Frontend polls `waitUntilHeightAttested`, then calls `getProof(txHash)`.
4. Frontend submits proof to `PolicyManager.submitProofAndSettle`.
5. Contract verifies proof on-chain via the precompile, decodes 180 > 120 → true, transfers 200 USDC to user.
6. UI shows tx hash + updated balance.

## 10. Hackathon timeline (assume ~10–14 days of build time within the Aug 13–Sep 6 window)

| Days | Work |
|---|---|
| 1–2 | Set up Creditcoin CC3 testnet + Sepolia environments, get faucet funds, install `@gluwa/usc-sdk`, run the SDK's example end-to-end proof flow standalone (no insurance logic yet) — de-risk the integration first |
| 3–4 | Write and deploy `FlightDelayReporter.sol` (Sepolia) and `PolicyManager.sol` skeleton (Creditcoin) |
| 5–6 | Wire the real proof pipeline: report → wait for attestation → generate proof → verify on-chain → decode → settle |
| 7–8 | Frontend: policy purchase flow, trigger/demo panel, status display |
| 9 | (Stretch) `LiquidityPool.sol` + LP dashboard |
| 10 | Testing, edge cases (proof failure, no-payout path, timeout handling) |
| 11–12 | Write technical documentation (explicitly required for judging), record demo video, build pitch deck |
| 13–14 | Buffer / polish |

**De-risking note:** Step 1–2 (getting the raw SDK proof flow working with no business logic) is the highest-risk, highest-priority task. If cross-chain attestation timing or testnet RPC access is flaky, you want to discover that in week 1, not the night before submission.

## 11. Team roles (2–4 people)

- **Solidity/on-chain dev:** `PolicyManager`, `FlightDelayReporter`, `LiquidityPool`, precompile integration
- **SDK/integration dev:** owns the `usc-sdk` proof pipeline end-to-end, including attestation timing and error handling
- **Frontend dev:** wallet connect, purchase flow, demo/trigger panel, status UI
- **Pitch/docs:** technical documentation (scored explicitly), deck, demo video

## 12. Judging-criteria alignment

| Criterion | How this project addresses it |
|---|---|
| Working Attestcoin Protocol integration code running in the project | Real `ProofBuilder` → `PrecompileBlockProver.verifySingle` call gates the payout; not simulated |
| Technical documentation | Written explanation of the reporter → attestation → proof → verification → settlement flow, with the "who submits `reportDelay`" simplification clearly disclosed |
| Depth of Attestcoin Protocol utilization | Payout is cryptographically dependent on proof verification, not a UI flag — this is as deep an integration as a 2-week hackathon build reasonably allows |
| Track fit (RWA) | Tokenized, financed real-world risk product with transparent on-chain settlement |

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Attestation timing (`waitUntilHeightAttested` default timeout 15m) causes slow/awkward live demos | Pre-generate the proof before the live demo; show the pipeline code and a recorded run, then do the on-chain settle call live |
| Testnet RPC/faucet instability on Sepolia or Creditcoin CC3 | Set up environments day 1, keep a fallback funded wallet, test the raw SDK flow early |
| Judges question the single-reporter simplification | Document it explicitly as a scoped simplification, and describe (in docs/pitch) how it'd generalize to a real attester set or live flight API in production |
| Scope creep (chasing tranches, multiple trigger types) | Tranches and multi-trigger support are explicitly non-goals for MVP — stretch only if core flow is solid with time to spare |

## 14. Stretch goals (only after core flow works end-to-end)

- Real flight-status API feeding the Sepolia reporter instead of manual entry
- Tokenized risk tranches (senior/junior) in the liquidity pool
- Second trigger type (e.g., simple weather threshold) to show the pattern generalizes

## 15. Demo script (60 seconds)

1. "Alice buys flight delay insurance for AA123 — threshold 2 hours, payout 200 USDC, premium 10 USDC." *(show purchase tx)*
2. "The flight is delayed 3 hours. That fact gets written as a transaction on Ethereum Sepolia." *(show reporter tx)*
3. "Creditcoin's Attestcoin Protocol proves that transaction really happened — Merkle proof, continuity proof, verified on-chain." *(show proof verification tx)*
4. "The moment that proof is verified, the contract pays Alice automatically." *(show balance change)*
5. "No adjuster, no claim form, no centralized oracle — just a cryptographic proof and code."
