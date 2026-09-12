// SPDX-License-Identifier: MIT
"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import type { Address } from "viem";

import { usePoolBalance, useLpBalance, useLpTokenValue, useAllowance, lpAbi, usdcAbi } from "@/lib/hooks";
import { CONTRACTS } from "@/lib/config";

const MAX_APPROVAL = 1_000_000_000n * 10n ** 6n;

/**
 * Liquidity Pool dashboard (stretch goal — DeFi track).
 * LPs deposit mUSDC and receive ipLP tokens pro-rata. Premiums from policies
 * flow in; payouts flow out. LP token value is displayed live.
 */
export default function LPDashboard() {
  const { address, isConnected } = useAccount();
  const { data: poolBal } = usePoolBalance();
  const { data: lpBal } = useLpBalance(address);
  const { data: lpValue } = useLpTokenValue();
  const { data: allowance } = useAllowance(address, CONTRACTS.liquidityPool as Address);
  const { data: hash, writeContract: write, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash });

  const [amountUSDC, setAmountUSDC] = useState("1000");

  const poolUSDC = poolBal ? Number(poolBal) / 1e6 : 0;
  const lpCount = lpBal ? Number(lpBal) / 1e6 : 0;
  const lpTokenValueUSDC = lpValue ? Number(lpValue) / 1e18 : 0;
  const myShareUSDC = lpCount * lpTokenValueUSDC;
  const allowanceNum = allowance ? Number(allowance) : 0;
  const depositRaw = Math.round(Number(amountUSDC) * 1e6);
  const needsApprove = allowanceNum < depositRaw;

  const handleDeposit = async () => {
    await write({
      address: CONTRACTS.liquidityPool as Address,
      abi: lpAbi,
      functionName: "deposit",
      args: [BigInt(depositRaw)],
    });
  };

  const handleWithdraw = async () => {
    await write({
      address: CONTRACTS.liquidityPool as Address,
      abi: lpAbi,
      functionName: "withdraw",
      args: [lpBal!],
    });
  };

  const handleApprove = async () => {
    await write({
      address: CONTRACTS.mockUsdc as Address,
      abi: usdcAbi,
      functionName: "approve",
      args: [CONTRACTS.liquidityPool as Address, MAX_APPROVAL],
    });
  };

  if (!isConnected) {
    return (
      <div className="card">
        <h2 className="card-title mb-2">Liquidity Pool</h2>
        <p className="card-subtitle">Connect your wallet to view LP positions.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-5">
        <h2 className="card-title">Liquidity Pool</h2>
        <span className="badge-neutral">DeFi Track</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="stat-box">
          <p className="stat-label">Pool Balance</p>
          <p className="stat-value text-base">{poolUSDC.toFixed(2)}</p>
          <p className="text-[11px] text-slate-500">mUSDC</p>
        </div>
        <div className="stat-box">
          <p className="stat-label">Your LP Tokens</p>
          <p className="stat-value text-base">{lpCount.toFixed(4)}</p>
          <p className="text-[11px] text-slate-500">ipLP</p>
        </div>
        <div className="stat-box">
          <p className="stat-label">LP Token Value</p>
          <p className="stat-value text-base">{lpTokenValueUSDC.toFixed(6)}</p>
          <p className="text-[11px] text-slate-500">USDC</p>
        </div>
        <div className="stat-box border-success/20 bg-success/5">
          <p className="stat-label">Your Share</p>
          <p className="stat-value text-base text-success">{myShareUSDC.toFixed(2)}</p>
          <p className="text-[11px] text-slate-500">USDC</p>
        </div>
      </div>

      <div className="divider pt-5 space-y-3">
        <p className="text-xs text-slate-500 leading-relaxed">
          Deposit mUSDC to back policy payouts, earn premium yield, and absorb payout
          risk pro-rata with other liquidity providers.
        </p>
        <div className="flex gap-2">
          <input
            type="number" value={amountUSDC}
            onChange={(e) => setAmountUSDC(e.target.value)}
            className="input flex-1"
            min="0"
          />
          <button
            onClick={handleDeposit}
            disabled={isPending || isConfirming || (!lpBal && depositRaw === 0)}
            className="btn-primary shrink-0"
          >
            Deposit
          </button>
        </div>

        {needsApprove && (
          <button onClick={handleApprove} className="btn-secondary w-full">
            Approve mUSDC for Pool
          </button>
        )}

        {lpCount > 0 && (
          <button
            onClick={handleWithdraw}
            disabled={isPending || isConfirming}
            className="btn-secondary w-full"
          >
            Withdraw All · {lpCount.toFixed(2)} ipLP
          </button>
        )}
      </div>

      {confirmed && (
        <div className="result-box mt-3">✓ Transaction confirmed.</div>
      )}
    </div>
  );
}
