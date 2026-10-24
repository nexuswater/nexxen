// Types for the official x402 helper (its inline JSDoc comments don't parse as types).
import type { Provider, Signer, Wallet } from "ethers";
import type { Server } from "node:http";

export type X402Context = Readonly<{ network: string; participantRequest: unknown; x402: unknown }>;

export function loadX402Context(apiUrl: string): Promise<X402Context>;

export function buyResource(options: {
  context: X402Context;
  provider: Provider;
  wallet: Wallet;
  stateDirectory: string;
  resourceUrl: string;
  channelId: string;
  maximumAmount: string;
  operation: string;
  requestFetch?: typeof fetch;
}): Promise<{ operation: string; claimId: string; transactionHash: string; redemption: "Confirmed"; resource: unknown }>;

export function createX402Merchant(config: {
  context: X402Context;
  provider: Provider;
  submitter: Signer;
  stateDirectory: string;
  resourceUrl: string;
  merchantParticipantId: string;
  payout: string;
  amount: string;
  content: Record<string, unknown>;
  cutoffMarginSeconds?: number;
  clock?: () => number;
}): { server: Server; close: () => Promise<void> };
