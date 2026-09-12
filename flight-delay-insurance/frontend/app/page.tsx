// SPDX-License-Identifier: MIT
"use client";
import WalletConnect from "@/components/WalletConnect";
import PolicyPurchaseForm from "@/components/PolicyPurchaseForm";
import PolicyStatus from "@/components/PolicyStatus";
import TriggerPanel from "@/components/TriggerPanel";
import LPDashboard from "@/components/LPDashboard";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-surface-border bg-slate-950/60 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-5 flex justify-between items-center gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-creditcoin to-creditcoin-light flex items-center justify-center shrink-0 shadow-glow">
                <span className="text-white text-sm font-bold">✈</span>
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight truncate">
                Flight Delay Insurance
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-1 ml-[42px]">
              Parametric insurance on Creditcoin CC3 · Powered by Attestcoin Protocol
            </p>
          </div>
          <div className="shrink-0">
            <WalletConnect />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-8">
            <PolicyPurchaseForm />
            <PolicyStatus />
          </div>
          <div className="space-y-8">
            <TriggerPanel />
            <LPDashboard />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-surface-border mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8 text-sm text-slate-500 space-y-2">
          <p className="font-medium text-slate-400">
            BUIDL CTC 2026 Fall Hackathon · RWA Track · DeFi Stretch Goal
          </p>
          <p className="text-xs leading-relaxed max-w-3xl">
            The Attestcoin integration is real: payouts are cryptographically gated on
            Merkle + continuity proof verification via the 0x0FD2 precompile. The only
            simplification is the single-reporter model — see docs/technical-documentation.md.
          </p>
        </div>
      </footer>
    </main>
  );
}
