/**
 * Coordinator for one owner exception signed on a Ledger Flex, ported from nexxen-core
 * `adapters/ledger-approval-client.mjs` and bound to this app's /api/story read model.
 *
 * The caller supplies the official signer only after a user click and on-device address
 * verification. This module never discovers devices, enrolls authority or builds a challenge:
 * the challenge is whatever the server already issued, and the server re-verifies the
 * signature against OWNER_APPROVER_ADDRESS before consuming it.
 */
import { prepareLedgerMessageAction, serializeSignature, type MessageSigner, type Readiness } from "./message-action";
import type { Approval, StoryData } from "@/components/story/use-story";

export type ReviewedApproval = {
  owner: string;
  approval: Approval;
};

type Fetch = typeof fetch;

export function createLedgerApprovalClient({ fetch: request, clock = () => Date.now() }: { fetch: Fetch; clock?: () => number }) {
  let attempt = 0;
  let operation: { cancel(): void } | null = null;

  /** Fences any in-flight device action; local cancellation must survive an SDK failure. */
  const stop = () => {
    attempt++;
    const previous = operation;
    operation = null;
    try {
      previous?.cancel();
    } catch {}
  };

  async function story(): Promise<StoryData> {
    const response = await request("/api/story", { cache: "no-store" });
    if (!response.ok) throw new Error("SERVER_STATE_UNAVAILABLE");
    return response.json();
  }

  async function load(approvalId: string): Promise<ReviewedApproval> {
    const s = await story();
    const owner = s.policy?.owner;
    const approval = s.approvals?.find((a) => a.id === approvalId);
    if (!owner || !/^0x[0-9a-fA-F]{40}$/.test(owner)) throw new Error("TRUSTED_AUTHORITY_NOT_ENROLLED");
    if (!approval || approval.status !== "pending" || Date.parse(approval.expiresAt) <= clock()) throw new Error("CHALLENGE_NOT_PENDING");
    // The server must already expect exactly this signer for exactly this request.
    if (!approval.expectedSigner || approval.expectedSigner.toLowerCase() !== owner.toLowerCase()) throw new Error("CHALLENGE_SCOPE_MISMATCH");
    const order = s.orders?.find((o) => o.id === approval.orderId);
    if (!order || order.status !== "blocked") throw new Error("CHALLENGE_SCOPE_MISMATCH");
    if (Number(order.amount) > Number(s.policy.exceptionMax)) throw new Error("CHALLENGE_SCOPE_MISMATCH");
    return Object.freeze({ owner, approval: Object.freeze({ ...approval }) });
  }

  async function review(approvalId: string) {
    return load(approvalId);
  }

  async function signReviewed({
    reviewed,
    verifiedDeviceAddress,
    signer,
    path,
    readiness,
    submit,
  }: {
    reviewed: ReviewedApproval;
    verifiedDeviceAddress: string;
    signer: MessageSigner;
    path: string;
    readiness: Readiness;
    /** Sends the candidate signature to the server, which re-verifies it before consuming. */
    submit(args: { approvalId: string; signature: string }): Promise<StoryData | null>;
  }) {
    if (operation) throw new Error("SIGNING_ALREADY_ACTIVE");
    const current = ++attempt;

    const fresh = await load(reviewed.approval.id);
    if (current !== attempt) throw new Error("CANCELLED");
    if (fresh.owner !== reviewed.owner || fresh.approval.message !== reviewed.approval.message) throw new Error("REVIEW_CHANGED");
    if (typeof verifiedDeviceAddress !== "string" || verifiedDeviceAddress.toLowerCase() !== fresh.owner.toLowerCase()) {
      throw new Error("DEVICE_ADDRESS_MISMATCH");
    }

    const local = prepareLedgerMessageAction({ signer, path, message: fresh.approval.message, readiness });
    operation = local;
    try {
      const result = await local.start();
      if (current !== attempt) throw new Error("CANCELLED");

      // A denial, expiry or policy change during the device review must fence submission.
      const latest = await load(fresh.approval.id);
      if (current !== attempt) throw new Error("CANCELLED");
      if (latest.owner !== fresh.owner || latest.approval.message !== fresh.approval.message) throw new Error("REVIEW_CHANGED");

      // Once submitted the server owns the outcome; browser cancellation cannot claim a rollback.
      const signature = serializeSignature(result.candidateSignature);
      const outcome = await submit({ approvalId: fresh.approval.id, signature });
      if (!outcome) throw new Error("SERVER_REJECTED_APPROVAL");
      const consumed = outcome.approvals?.find((a) => a.id === fresh.approval.id);
      if (!consumed || consumed.status !== "consumed") throw new Error("UNEXPECTED_SERVER_OUTCOME");
      return { story: outcome, approval: consumed };
    } finally {
      if (operation === local) operation = null;
    }
  }

  return { review, signReviewed, cancel: stop, disconnect: stop };
}
