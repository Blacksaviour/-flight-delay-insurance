// SPDX-License-Identifier: MIT
"use client";

import WalletConnect from "@/components/WalletConnect";
import PolicyPurchaseForm from "@/components/PolicyPurchaseForm";
import PolicyStatus from "@/components/PolicyStatus";
import TriggerPanel from "@/components/TriggerPanel";
import LPDashboard from "@/components/LPDashboard";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/30">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Flight Delay Insurance
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Parametric insurance on Creditcoin CC3 · Powered by Attestcoin Protocol
            </p>
          </div>
          <WalletConnect />
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left column */}
          <div className="space-y-8">
            <PolicyPurchaseForm />
            <PolicyStatus />
          </div>

          {/* Right column */}
          <div className="space-y-8">
            <TriggerPanel />
            <LPDashboard />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/30 mt-12">
        <div className="max-w-6xl mx-auto px-6 py-4 text-sm text-slate-500">
          <p>
            BUIDL CTC 2026 Fall Hackathon · RWA Track · DeFi Stretch Goal
          </p>
          <p className="mt-1">
            The Attestcoin integration is real: payouts are cryptographically gated on
            Merkle + continuity proof verification via the 0x0FD2 precompile. The only
            simplification is the single-reporter model — see docs/technical-documentation.md.
          </p>
        </div>
      </footer>
    </main>
  );
}
