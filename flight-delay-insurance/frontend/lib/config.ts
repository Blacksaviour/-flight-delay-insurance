// SPDX-License-Identifier: MIT
// Central configuration: chain definitions, contract addresses, and shared helpers.

import type { Chain } from "viem/chains";

/**
 * Creditcoin chain.
 *
 * Reads chain id + RPC from env so the same config works for two environments:
 *  - LOCAL (Anvil, default for the demo): chain id 407150, RPC http://127.0.0.1:8545
 *  - CC3 TESTNET: chain id 40715, RPC https://rpc.cc3-testnet.creditcoin.network
 *
 * The local chain MUST be 407150 — PolicyManager.setLocalDevMode() and the local
 * settle path guard on that exact id.
 */
const ccChainId = Number(
  process.env.NEXT_PUBLIC_CREDITCOIN_CHAIN_ID || "407150"
);
const ccRpc =
  process.env.NEXT_PUBLIC_CREDITCOIN_RPC_URL ||
  "http://127.0.0.1:8545";

export const creditcoinCc3Testnet = {
  id: ccChainId,
  name:
    ccChainId === 407150
      ? "Creditcoin (Local Anvil)"
      : "Creditcoin CC3 Testnet",
  nativeCurrency: {
    name: "Creditcoin",
    symbol: "CTC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [ccRpc],
    },
  },
  blockExplorers: {
    default: {
      name: "Creditcoin Explorer",
      url: "https://scan.cc3-testnet.creditcoin.network",
    },
  },
  testnet: true,
} as const satisfies Chain;

/**
 * Ethereum Sepolia testnet (source chain for FlightDelayReporter).
 */
export const sepolia = {
  id: 11155111,
  name: "Sepolia",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ||
          "https://ethereum-sepolia-rpc.publicnode.com",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Etherscan",
      url: "https://sepolia.etherscan.io",
    },
  },
  testnet: true,
} as const satisfies Chain;

// ---------------------------------------------------------------------------
// Contract addresses (read from env — must match the .env.local values after
// you have run the Foundry deploy scripts).
// ---------------------------------------------------------------------------

export const CONTRACTS = {
  mockUsdc: process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS as `0x${string}` | "",
  policyManager: process.env.NEXT_PUBLIC_POLICY_MANAGER_ADDRESS as `0x${string}` | "",
  liquidityPool: process.env.NEXT_PUBLIC_LIQUIDITY_POOL_ADDRESS as `0x${string}` | "",
  flightDelayReporter:
    process.env.NEXT_PUBLIC_FLIGHT_DELAY_REPORTER_ADDRESS as `0x${string}` | "",
} as const;

// 6-decimal MockUSDC, so 1 USDC = 1e6 units.
export const STABLECOIN_DECIMALS = 6;
export const PREMIUM_USDC = 10; // default demo premium in USDC
export const PAYOUT_USDC = 200; // default demo payout in USDC
export const THRESHOLD_MINUTES = 120; // default delay threshold in minutes

/** Convert a USDC amount (e.g. 200) to the smallest unit (e.g. 200_000_000) */
export function toUSDC(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** STABLECOIN_DECIMALS));
}
