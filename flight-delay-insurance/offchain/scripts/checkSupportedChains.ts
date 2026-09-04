/**
 * De-risking step 1 (per the PRD): before writing any business logic, confirm the raw
 * Attestcoin Protocol plumbing actually works against the real CC3 testnet and print the
 * real chainKey for Sepolia -- don't assume it's 1, look it up.
 *
 * Usage: npx tsx scripts/checkSupportedChains.ts
 */
import "dotenv/config";
import { JsonRpcProvider } from "ethers";
import { chainInfo } from "@gluwa/usc-sdk";

async function main() {
  const creditcoinRpcUrl = process.env.CREDITCOIN_RPC_URL;
  if (!creditcoinRpcUrl) throw new Error("CREDITCOIN_RPC_URL not set in .env");

  const creditcoinProvider = new JsonRpcProvider(creditcoinRpcUrl);
  const chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(creditcoinProvider);

  console.log(`Querying ChainInfo precompile via ${creditcoinRpcUrl} ...`);
  const supportedChains = await chainInfoProvider.getSupportedChains();

  console.log("\nSupported source chains on this Creditcoin network:");
  console.table(supportedChains);

  const sepolia = supportedChains.find((c) => c.chainName.toLowerCase().includes("sepolia"));
  if (!sepolia) {
    console.warn(
      "\nWARNING: no chain with 'sepolia' in its name was found. " +
        "Check the list above manually and set SEPOLIA_CHAIN_KEY in .env accordingly."
    );
    return;
  }

  console.log(`\nFound Sepolia: chainKey=${sepolia.chainKey}, chainId=${sepolia.chainId}`);
  console.log(`Set SEPOLIA_CHAIN_KEY=${sepolia.chainKey} in your .env if it doesn't match already.`);
}

main().catch((err) => {
  console.error("checkSupportedChains failed:", err);
  process.exitCode = 1;
});
