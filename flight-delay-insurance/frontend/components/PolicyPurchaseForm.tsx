// SPDX-License-Identifier: MIT
"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import type { Address } from "viem";

import { useStablecoinBalance, useAllowance, pmAbi, usdcAbi } from "@/lib/hooks";
import { CONTRACTS } from "@/lib/config";

const MAX_APPROVAL = 1_000_000_000n * 10n ** 6n; // 1M USDC in smallest unit

export default function PolicyPurchaseForm() {
  const { address, isConnected } = useAccount();
  const { data: allowance } = useAllowance(address, CONTRACTS.policyManager as Address);
  const { data: balance } = useStablecoinBalance(address);
  const { data: hash, isPending, isSuccess, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });

  const [thresholdMinutes, setThresholdMinutes] = useState("120");
  const [payoutUSDC, setPayoutUSDC] = useState("200");
  const [premiumUSDC, setPremiumUSDC] = useState("10");

  const allowanceNum = allowance ? Number(allowance) : 0;
  const balanceNum = balance ? Number(balance) / 1e6 : 0;
  const premiumRaw = Math.round(Number(premiumUSDC) * 1e6);
  const isLoading = isPending || isConfirming;

  const handleApprove = async () => {
    await writeContract({
      address: CONTRACTS.mockUsdc as Address,
      abi: usdcAbi,
      functionName: "approve",
      args: [CONTRACTS.policyManager as Address, MAX_APPROVAL],
    });
  };

  const handlePurchase = async () => {
    const payoutRaw = BigInt(Math.round(Number(payoutUSDC) * 1e6));
    const thresholdRaw = BigInt(Math.round(Number(thresholdMinutes)));
    const premiumRawLocal = BigInt(premiumRaw);
    await writeContract({
      address: CONTRACTS.policyManager as Address,
      abi: pmAbi,
      functionName: "purchasePolicy",
      args: [thresholdRaw, payoutRaw, premiumRawLocal],
    });
  };

  if (!isConnected) {
    return (
      <div className="rounded-xl bg-slate-900/50 p-6 border border-slate-800">
        <h2 className="text-xl font-semibold mb-2">Buy Flight Delay Policy</h2>
        <p className="text-slate-400">Connect your wallet to purchase a policy.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-slate-900/50 p-6 border border-slate-800">
      <h2 className="text-xl font-semibold mb-4">Buy Flight Delay Policy</h2>
      <div className="mb-4 text-sm text-slate-400">
        Your mUSDC balance: {balanceNum.toFixed(2)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">
            Delay Threshold (min)
          </label>
          <input
            type="number" value={thresholdMinutes}
            onChange={(e) => setThresholdMinutes(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-creditcoin"
            min="1"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Payout (USDC)</label>
          <input
            type="number" value={payoutUSDC}
            onChange={(e) => setPayoutUSDC(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-creditcoin"
            min="1"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Premium (USDC)</label>
          <input
            type="number" value={premiumUSDC}
            onChange={(e) => setPremiumUSDC(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-creditcoin"
            min="1"
          />
        </div>
      </div>
      {allowanceNum < premiumRaw && (
        <button
          onClick={handleApprove} disabled={isLoading}
          className="w-full mb-3 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition"
        >
          Approve mUSDC Spending
        </button>
      )}
      <button
        onClick={handlePurchase}
        disabled={isLoading || balanceNum < Number(premiumUSDC)}
        className="w-full px-4 py-2 bg-creditcoin hover:bg-creditcoin-dark disabled:opacity-50 rounded-lg font-medium transition"
      >
        {isLoading ? "Pending..." : `Buy Policy (${premiumUSDC} USDC premium)`}
      </button>
      {isConfirmed && (
        <p className="mt-3 text-sm text-green-400">Policy purchased! Transaction confirmed.</p>
      )}
    </div>
  );
}
