// SPDX-License-Identifier: MIT
// Minimal type declarations for @gluwa/usc-sdk until official types are published.
// Provides basic type information for the SDK's chain info and proof builder APIs.

declare module "@gluwa/usc-sdk" {
  // Chain info provider for fetching chain configuration
  export namespace chainInfo {
    export class PrecompileChainInfoProvider {
      constructor(url: string, chainKey?: number);
      getChainKey(): number;
      getHeight(): number;
    }
  }

  // Proof provider service for generating cross-chain attestation proofs
  export namespace proofProvider {
    export namespace service {
      export class ProofBuilder {
        constructor(chainKey: number, url: string, pollIntervalMs?: number);
        waitUntilHeightAttested(chainKey: number, blockHeight: number | bigint): Promise<void>;
        getProof(txHash: string): Promise<{
          success: boolean;
          data?: {
            chainKey: number;
            headerNumber: number;
            txBytes: string;
            merkleProof: {
              root: string;
              siblings: string[];
            };
            continuityProof: {
              lowerEndpointDigest: string;
              roots: string[];
            };
          };
          error?: string;
        }>;
      }
    }
  }
}
