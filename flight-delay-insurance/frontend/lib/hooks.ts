// SPDX-License-Identifier: MIT
// Typed contract helpers: read ABIs from the JSON files and expose
// reusable wagmi hooks for each contract interaction.

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import type { Address } from "viem";

import policyManagerAbi from "@/lib/abis/PolicyManager.json";
import mockUsdcAbi from "@/lib/abis/MockUSDC.json";
import liquidityPoolAbi from "@/lib/abis/LiquidityPool.json";
import flightDelayReporterAbi from "@/lib/abis/FlightDelayReporter.json";

import { CONTRACTS, creditcoinCc3Testnet, sepolia } from "@/lib/config";

export const pmAbi = policyManagerAbi.abi as any;
export const usdcAbi = mockUsdcAbi.abi as any;
export const lpAbi = liquidityPoolAbi.abi as any;
export const reporterAbi = flightDelayReporterAbi.abi as any;

// --- PolicyManager reads (Creditcoin) ---

export function usePolicy(policyId: bigint | undefined) {
  return useReadContract({
    address: CONTRACTS.policyManager as Address | undefined,
    abi: pmAbi,
    functionName: "getPolicy",
    args: policyId !== undefined ? [policyId] : undefined,
    chainId: creditcoinCc3Testnet.id,
  });
}

export function usePolicyCount() {
  return useReadContract({
    address: CONTRACTS.policyManager as Address | undefined,
    abi: pmAbi,
    functionName: "nextPolicyId",
    chainId: creditcoinCc3Testnet.id,
  });
}

export function useAllowance(owner: `0x${string}` | undefined, spender: `0x${string}` | undefined) {
  return useReadContract({
    address: CONTRACTS.mockUsdc as Address | undefined,
    abi: usdcAbi,
    functionName: "allowance",
    args: owner && spender ? [owner, spender] : undefined,
    chainId: creditcoinCc3Testnet.id,
  });
}

export function useStablecoinBalance(account: `0x${string}` | undefined) {
  return useReadContract({
    address: CONTRACTS.mockUsdc as Address | undefined,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    chainId: creditcoinCc3Testnet.id,
  });
}

// --- LiquidityPool reads (Creditcoin) ---

export function usePoolBalance() {
  return useReadContract({
    address: CONTRACTS.liquidityPool as Address | undefined,
    abi: lpAbi,
    functionName: "poolBalance",
    chainId: creditcoinCc3Testnet.id,
  });
}

export function useLpTokenValue() {
  return useReadContract({
    address: CONTRACTS.liquidityPool as Address | undefined,
    abi: lpAbi,
    functionName: "lpTokenValue",
    chainId: creditcoinCc3Testnet.id,
  });
}

export function useLpBalance(account: `0x${string}` | undefined) {
  return useReadContract({
    address: CONTRACTS.liquidityPool as Address | undefined,
    abi: lpAbi,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    chainId: creditcoinCc3Testnet.id,
  });
}

// --- Write transaction wrapper ---

export function useTx() {
  const { data: hash, isPending, isSuccess } = useWriteContract();
  const { isLoading: isWaiting, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  return {
    hash,
    isPending: isPending || isWaiting,
    isConfirmed: isConfirmed,
  };
}

