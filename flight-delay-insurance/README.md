# Flight Delay Parametric Insurance — BUIDL CTC 2026 Fall

Real, functional Attestcoin Protocol integration: a flight-delay fact is written as a
transaction on Sepolia, proven into Creditcoin via Merkle + continuity proofs verified
through the Native Query Verifier precompile (`0x0FD2`), and only then does the policy
contract pay out. See `docs/prd.md` for the full design rationale and
`docs/technical-documentation.md` for the Attestcoin integration deep-dive.

## What's here

```
contracts/    Foundry project (Solidity 0.8.30)
  src/sepolia/FlightDelayReporter.sol   Source-chain contract: emits the delay fact
  src/creditcoin/PolicyManager.sol      ASC: verifies proofs, decodes, settles policies
                                         and routes payouts through the LiquidityPool
  src/creditcoin/LiquidityPool.sol      DeFi-track: pooled LP capital backing payouts
                                         and collecting premiums; mints LP tokens
  src/creditcoin/MockUSDC.sol           Testnet stablecoin for premiums/payouts
  src/vendor/                           Attestcoin's own ASCBase/VerifierInterface,
                                         vendored from @gluwa/usc-contracts@0.1.2
  src/interfaces/ILiquidityPool.sol     Minimal interface for PolicyManager -> pool calls
  test/                                18 passing Foundry tests, including a mocked
                                        precompile (vm.etch) exercising the real
                                         verify -> decode -> settle path, plus LP wiring
  script/                               Foundry deploy scripts for both chains

offchain/     Node/TypeScript proof pipeline using the real @gluwa/usc-sdk
  scripts/checkSupportedChains.ts       Confirms Sepolia's real chainKey (don't assume 1)
  scripts/settleFlightDelay.ts          Full pipeline: report -> attest -> prove -> settle

frontend/     Next.js 15 + wagmi + RainbowKit dApp (PRD §8)
  app/page.tsx                          Buy policy, status view, demo panel, LP dashboard
  app/api/settle/route.ts               Server-side proof pipeline mirrors settleFlightDelay.ts
  components/                           PolicyPurchaseForm, TriggerPanel, PolicyStatus, LPDashboard, WalletConnect
  lib/                                  Chain config, wagmi config, contract hooks, ABIs
```

## Status

**Done and verified locally:**
- All contracts compile against the real, pinned Attestcoin dependencies
  (`@gluwa/usc-contracts@0.1.2`).
- **18/18 Foundry tests pass**, including triggered payout, expiry, replay protection,
  rejection of proofs from an unregistered source contract, proof-verification-failure
  revert, liquidity-pool-not-registered revert, and access-control checks.
- LiquidityPool fully wired into PolicyManager: premiums forward to the pool, payouts
  pulled from `LiquidityPool.payOut()`.
- Offchain scripts typecheck and run (fail only on missing env vars / network access, as
  expected in a sandboxed environment with no RPC access).

**Not yet done (next steps):**
- Nothing has been deployed to real Sepolia or Creditcoin CC3 testnets, and no proof has
  been generated against the live Proof Builder service -- this environment has no network
  access to those RPCs. **This is the first thing to run once you have real RPC URLs and
  funded test wallets**: `cd offchain && npm run check-chains` to confirm the real
  `SEPOLIA_CHAIN_KEY`, then deploy both sides and run `npm run settle -- <policyId> <delayMinutes>`.
- **Frontend is scaffolded and ready to run**, but its deps (`npm install`) and `npm run
  build` couldn't be completed in this sandbox (the 30s command limit can't finish the
  large RainbowKit/wallet-connect dependency tree on this network). On a normal machine:
  `cd frontend && npm install && cp .env.local.example .env.local && npm run dev`. Then
  follow the walkthrough in `frontend/FRONTEND.md`.

## Setup

```bash
# Contracts
cd contracts
npm install
forge test              # should show 18 passed

# Offchain
cd ../offchain
npm install
cp .env.example .env    # fill in real RPC URLs, private keys, deployed addresses
npm run check-chains    # confirms real SEPOLIA_CHAIN_KEY before anything else
```

## Deploy order

1. `forge script contracts/script/DeploySepoliaReporter.s.sol --rpc-url sepolia --broadcast`
2. Copy the deployed `FlightDelayReporter` address into `SOURCE_REPORTER_CONTRACT` env var
3. `forge script contracts/script/DeployCreditcoin.s.sol --rpc-url creditcoin_cc3_testnet --broadcast`
4. Fill in all four contract addresses in `offchain/.env`
5. `cd offchain && npm run check-chains` -- confirm `SEPOLIA_CHAIN_KEY`
6. Buy a policy (via `PolicyManager.purchasePolicy`, e.g. through `cast send`)
7. `npm run settle -- <policyId> <delayMinutes>` to run the full report -> attest -> prove ->
   settle pipeline for real
