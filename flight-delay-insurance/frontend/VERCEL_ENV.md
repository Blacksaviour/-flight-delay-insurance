# Deploying to Vercel

This documents how to deploy the **Frontend** (`/frontend`) to Vercel as the
BUIDL CTC 2026 Fall submission's UI for the flight-delay parametric insurance
app.

The frontend is a Next.js 15 (App Router) app using wagmi v2 + RainbowKit for
dual-chain wallet connection (Creditcoin CC3 testnet + Sepolia).

## Prerequisites

1. Push the repo to GitHub (one repo is fine; Vercel will be pointed at the
   `frontend/` subdirectory).
2. Funded wallets on **both**:
   - Creditcoin CC3 testnet (`https://rpc.cc3-testnet.creditcoin.network`)
   - Ethereum Sepolia (`https://ethereum-sepolia-rpc.publicnode.com`)
3. **Deploy the on-chain contracts first** — the UI needs their addresses.
   See `README.md` "Deploy order". After deploying, copy the four CC3 addresses
   + the Sepolia reporter address into the env vars below.

## Option A — Vercel CLI (fastest for a hackathon demo)

```bash
# one-time setup
npm install -g vercel            # if you don't already have it
vercel login
vercel link --project flight-delay-insurance  # pick/create the project

# set environment (once per project)
# ... add every var in the ENV TABLE below ...

# build locally first to verify (recommended)
cd frontend
npm install
npm run build            # must finish with no errors
vercel --prod            # builds again in the cloud and deploys
```

> A local `npm run build` that passes guarantees the Vercel deploy passes.

## Option B — Vercel dashboard (GitHub integration)

1. Go to [vercel.com/new](https://vercel.com/new) → "Import Git Repository".
2. Select your repo, then on **Configure Project** set:
   - **Root Directory** -> `frontend`
   - **Framework Preset** -> `Next.js` (auto-detected; builds with `next build`, outputs `.next`)
   - **Build Command** -> `npm run build`
   - **Output Directory** -> `.next`
3. Expand **Environment Variables** and add every variable from the table below.
   Mark `NEXT_PUBLIC_*` as "Plain" (exposed to the client) and mark the
   server-only secrets as "Server" (kept out of the browser bundle).
4. Click **Deploy**. The first build installs deps, runs `next build`, and on
   success serves `https://<project>.vercel.app`.

## Environment variables

`NEXT_PUBLIC_*` vars are inlined into the browser bundle at build time; the
rest are server-only (read by `app/api/settle/route.ts`).

| `NEXT_PUBLIC_USE_LOCAL_SIM` | client | optional | `true` = use the local Anvil `settleForTesting()` path (no real proof); `false` = run the live Attestcoin pipeline. Defaults to local. |
| `NEXT_PUBLIC_CREDITCOIN_RPC_URL` | client+server | required | `https://rpc.cc3-testnet.creditcoin.network` (or `http://127.0.0.1:8545` for local) |
| `NEXT_PUBLIC_CREDITCOIN_CHAIN_ID` | client | required | `40715` (CC3) or `407150` (Anvil local) |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL` | client | optional | Sepolia RPC used by the wallet connector for the "Report Delay" tx |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | client | required for WC | A WalletConnect cloud project id (RainbowKit). Set to `demo-project` for local sims. |
| `NEXT_PUBLIC_MOCK_USDC_ADDRESS` | client | required | Deployed `MockUSDC` address on CC3 (or Anvil) |
| `NEXT_PUBLIC_POLICY_MANAGER_ADDRESS` | client+server | required | Deployed `PolicyManager` address |
| `NEXT_PUBLIC_LIQUIDITY_POOL_ADDRESS` | client | required | Deployed `LiquidityPool` address |
| `NEXT_PUBLIC_FLIGHT_DELAY_REPORTER_ADDRESS` | client | required | Deployed `FlightDelayReporter` address on Sepolia (or `0x000...` in local sim) |
| `SEPOLIA_RPC_URL` | server | required (real mode) | Server-side Sepolia RPC for the settle pipeline |
| `CREDITCOIN_RPC_URL` | server | required | Server-side CC3 RPC (same as NEXT_PUBLIC_CREDITCOIN_RPC_URL for real mode, or Anvil for local) |
| `PROOF_BUILDER_URL` | server | required (real mode) | `https://prover.cc3-testnet.creditcoin.network` |
| `SEPOLIA_CHAIN_KEY` | server | required (real mode) | **Lookup first** with `cd ../offchain && npm run check-chains` — do NOT assume it's `1`. |
| `SETTLER_PRIVATE_KEY` | server (Server) | required | CC3 private key that signs `PolicyManager.execute()` |
| `REPORTER_PRIVATE_KEY` | server (Server) | optional | Listed for completeness; the UI does NOT use it (the connected wallet signs `reportDelay` directly). The offchain CLI uses it. |

### ⚠️ Important: the settle route is long-polling

`app/api/settle/route.ts` calls `proofBuilder.waitUntilHeightAttested(...)`,
which can block for **minutes** while Creditcoin attests the Sepolia block
(default Attestcoin timeout ~15 min).

- **Vercel Hobby plan** functions time out at **10 seconds** — the settle route
  will NOT complete a full Attestcoin attestation wait there.
- **Vercel Pro** supports up to **900s** — raise the function timeout in the
  Vercel dashboard (**Project Settings -> Functions**) for
  `app/api/settle/route.js`, or re-add the `functions` block to `vercel.json`:
  ```json
  "functions": {
    "app/api/settle/route.js": { "maxDuration": 900 }
  }
  ```

**Recommended for the hackathon demo:** either (a) run it on Pro, or (b) skip the
Vercel function entirely and run the offchain CLI instead:

```bash
cd ../offchain
npm install
cp .env.example .env     # fill in RPC URLs, keys, deployed addresses
npm run check-chains     # confirm SEPOLIA_CHAIN_KEY
npm run settle -- <policyId> <delayMinutes>   # e.g. 0 180
```

The CLI and the Vercel `/api/settle` route use the **identical** real Attestcoin
proof pipeline (`ProofBuilder.waitUntilHeightAttested` -> `getProof` ->
`precompile 0x0FD2 verifyAndEmit` -> decode -> payout). The CLI just avoids the
serverless-function timeout.

## Two deployment modes

### Local Anvil demo (fastest, no testnet funds needed)
```
NEXT_PUBLIC_USE_LOCAL_SIM=true
NEXT_PUBLIC_CREDITCOIN_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_CREDITCOIN_CHAIN_ID=407150
CREDITCOIN_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_FLIGHT_DELAY_REPORTER_ADDRESS=0x0000000000000000000000000000000000000000
```
Deploy contracts with `forge script script/DeployCreditcoinLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast`, then fill in the three CC3 addresses. Settlement here uses `PolicyManager.settleForTesting()` — the **same** decode->threshold->pool-payout logic, but the precompile step is bypassed because Anvil has no `0x0FD2`. The real precompile path is exercised only on CC3.

### Real Creditcoin CC3 + Sepolia (the judged "real Attestcoin" flow)
Set `NEXT_PUBLIC_USE_LOCAL_SIM=false`, point both RPCs at the live testnets,
deploy with `DeployCreditcoin.s.sol` / `DeploySepoliaReporter.s.sol`, set the
four contract addresses + `SEPOLIA_CHAIN_KEY` (via `check-chains`) + the two
private keys, and click "Run Settle Pipeline" in the TriggerPanel.

## Quick verification checklist before shipping
- [ ] `cd frontend && npm install && npm run build` passes locally (or in Vercel).
- [ ] All `NEXT_PUBLIC_*` addresses populated from your deployment.
- [ ] `SEPOLIA_CHAIN_KEY` confirmed via `npm run check-chains` (offchain/).
- [ ] Settle mode decision: Pro plan (900s function) **or** offchain CLI.
