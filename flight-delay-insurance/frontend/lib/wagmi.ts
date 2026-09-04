// SPDX-License-Identifier: MIT
// wagmi + RainbowKit configuration for dual-chain support
// (Creditcoin CC3 testnet + Sepolia).

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { creditcoinCc3Testnet, sepolia } from "./config";

/**
 * RainbowKit's getDefaultConfig returns a ready-to-use wagmi Config with
 * MetaMask, WalletConnect, and injected connectors pre-wired. The app uses
 * two chains: Creditcoin CC3 testnet (primary, for policy purchase/settle)
 * and Sepolia (source chain, for reporting delay).
 */
export const wagmiConfig = getDefaultConfig({
  chains: [creditcoinCc3Testnet, sepolia],
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo-project",
  appName: "Flight Delay Insurance",
  appDescription: "Parametric flight-delay insurance on Creditcoin",
  appUrl: "https://flight-delay-insurance.local",
  appIcon: "https://placehold.co/64x64/4F46E5/FFFFFF?text=F",
});

