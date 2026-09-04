# Flight Delay Insurance — Frontend

Next.js 15 + wagmi + viem + RainbowKit frontend for the parametric flight-delay
insurance demo on Creditcoin. Connects to both:
- **Creditcoin CC3 testnet** (chain 40715) — purchase policies, view status, LP dashboard
- **Sepolia** — report delay (the source-chain transaction the Attestcoin proof covers)

## Run it

```bash
npm install
cp .env.local.example .env.local
npm run dev           # http://localhost:3000
```

## Env vars

Fill in `.env.local` from the values in `.env.local.example`. Public vars must be
prefixed with `NEXT_PUBLIC_`; the settle API route reads the server-only vars.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_CREDITCOIN_RPC_URL` | Creditcoin CC3 RPC |
| `NEXT_PUBLIC_POLICY_MANAGER_ADDRESS` | Deployed CC3 `PolicyManager` |
| `NEXT_PUBLIC_MOCK_USDC_ADDRESS` | Deployed CC3 `MockUSDC` |
| `NEXT_PUBLIC_LIQUIDITY_POOL_ADDRESS` | Deployed CC3 `LiquidityPool` |
| `NEXT_PUBLIC_FLIGHT_DELAY_REPORTER_ADDRESS` | Deployed Sepolia `FlightDelayReporter` |
| `SEPOLIA_RPC_URL` | Server-side Sepolia RPC (settle route) |
| `CREDITCOIN_RPC_URL` | Server-side CC3 RPC (settle route) |
| `PROOF_BUILDER_URL` | Attestcoin Proof Builder |
| `SEPOLIA_CHAIN_KEY` | Real Sepolia chain key (see `offchain/scripts/checkSupportedChains.ts`) |
| `SETTLER_PRIVATE_KEY` | CC3 wallet that signs `PolicyManager.execute()` |

> `REPORTER_PRIVATE_KEY` is listed but unused by the UI — the connected wallet signs
> `reportDelay` directly on Sepolia (RainbowKit switches chain automatically).

## Demo walkthrough

1. **Buy a policy** — approve mUSDC, then purchase on Creditcoin. Premium forwards to
   the LiquidityPool.
2. **Report delay** — switch to Sepolia, enter policyId + delay minutes, click
   "Report Delay". This writes `FlightDelayReported(policyId, delayMinutes)` on Sepolia.
3. **Settle** — the server API waits for attestation, generates the Merkle + continuity
   proof via the Attestcoin ProofBuilder, and submits to `PolicyManager.execute()`.
   The CC3 precompile (0x0FD2) verifies the proof before the payout is released.
   Events are surfaced (`PolicySettled`, policyId, delayMinutes, triggered).
4. **LP dashboard** — deposit mUSDC, watch your ipLP balance and pool totals.
