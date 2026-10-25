import { env } from "./store";

/**
 * Spending-block approval. The agent asks once per block (one Channel); inside
 * it, 0.001 RLUSD vouchers stream without further checks and the Channel's
 * on-chain cap enforces the block.
 *
 * VEREV is the intended decider. Its API client and mock come from the VEREV
 * team; until they are wired in here, the owner's own policy decides and every
 * decision is labelled POLICY (never VEREV) in the feed.
 */

export type BlockRequest = {
  agent: string;
  blockRlusd: string;
  availableRlusd: string;
  spentRlusd: string;
};

export type BlockDecision = {
  decidedBy: "VEREV" | "POLICY";
  decision: "APPROVE" | "ASK_OWNER" | "DECLINE";
  reason: string;
  code?: number;
  ref?: string;
};

export interface BlockApprover {
  approveBlock(req: BlockRequest): Promise<BlockDecision>;
}

/** The owner's policy from .env.local: block size within the owner's limit and the remaining budget. */
const ownerPolicy: BlockApprover = {
  async approveBlock(req) {
    const ownerLimit = Number(env().maxChannelCap);
    const block = Number(req.blockRlusd);
    if (block > Number(req.availableRlusd)) {
      return { decidedBy: "POLICY", decision: "DECLINE", reason: "block exceeds the remaining budget" };
    }
    if (block > ownerLimit) {
      return { decidedBy: "POLICY", decision: "ASK_OWNER", reason: `over the owner's ${ownerLimit} RLUSD block limit` };
    }
    return { decidedBy: "POLICY", decision: "APPROVE", reason: "within the owner's block limit" };
  },
};

// Swap in the VEREV client here once it lands (keep ownerPolicy as the offline fallback).
export const blockApprover: BlockApprover = ownerPolicy;
