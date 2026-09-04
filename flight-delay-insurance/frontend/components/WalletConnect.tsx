// SPDX-License-Identifier: MIT
"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

/**
 * RainbowKit's ConnectButton — handles MetaMask, WalletConnect, etc.
 * Renders as a compact button when disconnected, shows address + balance when connected.
 */
export default function WalletConnect() {
  return (
    <div className="flex justify-end p-4">
      <ConnectButton
        showBalance={false}
        chainStatus="name"
        accountStatus="address"
      />
    </div>
  );
}
