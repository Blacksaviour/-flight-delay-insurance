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
      <div className="card">
        <h2 className="card-title mb-2">Buy Flight Delay Policy</h2>
        <p className="card-subtitle">Connect your wallet to purchase a policy.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <h2 className="card-title">Buy Flight Delay Policy</h2>
      </div>
      <div className="mb-5 text-sm text-slate-400">
        Your balance:{" "}
        <span className="text-slate-200 font-semibold">{balanceNum.toFixed(2)} mUSDC</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div>
          <label className="field-label">Delay Threshold (min)</label>
          <input
            type="number" value={thresholdMinutes}
            onChange={(e) => setThresholdMinutes(e.target.value)}
            className="input"
            min="1"
          />
        </div>
        <div>
          <label className="field-label">Payout (USDC)</label>
          <input
            type="number" value={payoutUSDC}
            onChange={(e) => setPayoutUSDC(e.target.value)}
            className="input"
            min="1"
          />
        </div>
        <div>
          <label className="field-label">Premium (USDC)</label>
          <input
            type="number" value={premiumUSDC}
            onChange={(e) => setPremiumUSDC(e.target.value)}
            className="input"
            min="1"
          />
        </div>
      </div>

      <div className="space-y-2.5">
        {allowanceNum < premiumRaw && (
          <button
            onClick={handleApprove} disabled={isLoading}
            className="btn-secondary w-full"
          >
            Approve mUSDC Spending
          </button>
        )}
        <button
          onClick={handlePurchase}
          disabled={isLoading || balanceNum < Number(premiumUSDC)}
          className="btn-primary w-full"
        >
          {isLoading ? "Pending..." : `Buy Policy · ${premiumUSDC} USDC premium`}
        </button>
      </div>

      {isConfirmed && (
        <div className="result-box">✓ Policy purchased! Transaction confirmed.</div>
      )}
    </div>
  );
}
