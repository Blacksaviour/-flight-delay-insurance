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
      <div className="rounded-xl bg-slate-900/50 p-6 border border-slate-800">
        <h2 className="text-xl font-semibold mb-2">Liquidity Pool</h2>
        <p className="text-slate-400">Connect your wallet to view LP positions.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-slate-900/50 p-6 border border-slate-800 space-y-4">
      <h2 className="text-xl font-semibold mb-2">Liquidity Pool (DeFi Track)</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div>
          <p className="text-xs text-slate-500">Pool Balance</p>
          <p className="text-lg font-semibold">{poolUSDC.toFixed(2)} mUSDC</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Your LP Tokens</p>
          <p className="text-lg font-semibold">{lpCount.toFixed(4)} ipLP</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">LP Token Value</p>
          <p className="text-lg font-semibold">{lpTokenValueUSDC.toFixed(6)} USDC</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Your Share</p>
          <p className="text-lg font-semibold text-success">{myShareUSDC.toFixed(2)} USDC</p>
        </div>
      </div>

      <div className="border-t border-slate-800 pt-4 space-y-3">
        <p className="text-xs text-slate-500">
          Deposit mUSDC to back policy payouts. Earn premium yield. Absorb payout risk pro-rata.
        </p>
        <div className="flex gap-2">
          <input
            type="number" value={amountUSDC}
            onChange={(e) => setAmountUSDC(e.target.value)}
            className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-creditcoin"
            min="0"
          />
          <button
            onClick={handleDeposit}
            disabled={isPending || isConfirming || !lpBal && depositRaw === 0}
            className="px-4 py-2 bg-creditcoin hover:bg-creditcoin-dark rounded-lg font-medium transition"
          >
            Deposit
          </button>
        </div>

        {needsApprove && (
          <button
            onClick={handleApprove}
            className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition"
          >
            Approve mUSDC for Pool
          </button>
        )}

        {lpCount > 0 && (
          <button
            onClick={handleWithdraw}
            disabled={isPending || isConfirming}
            className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition"
          >
            Withdraw All ({lpCount.toFixed(2)} ipLP)
          </button>
        )}
      </div>

      {confirmed && (
        <p className="text-sm text-green-400">Transaction confirmed.</p>
      )}
    </div>
  );
}
