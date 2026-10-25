/**
 * Transport-neutral lifecycle guard for the official Ethereum Signer Kit's signMessage,
 * ported from nexxen-core `adapters/ledger-message.mjs`.
 *
 * The caller must confirm the trusted approver, the device firmware/app and a readable
 * on-screen review before starting. Only a completed device action becomes an *unverified*
 * signature candidate; the server still verifies it against OWNER_APPROVER_ADDRESS.
 *
 * Never substitute signTypedData, a precomputed hash, a hot key, or a transaction.
 */

/** The exact first line of the challenge built by `challengeMessage` in src/lib/story/state.ts. */
export const APPROVAL_MESSAGE_PREFIX = "NEXXEN OWNER APPROVAL - ONE EXCEPTION\n";

export type Eip191Signature = { r: string; s: string; v: number };

type ActionState = { status: string; output?: Eip191Signature | null };

type Subscription = { unsubscribe(): void };

type ActionObservable = {
  subscribe(observer: { next(state: ActionState): void; error(error: unknown): void; complete(): void }): Subscription;
};

/** Only the slice of the official signer kit this guard is allowed to touch. */
export type MessageSigner = {
  signMessage(path: string, message: string): { observable: ActionObservable; cancel?(): void };
};

export type Readiness = {
  trustedApproverConfirmed: boolean;
  firmwareVerified: boolean;
  ethereumAppVerified: boolean;
  readableAsciiReviewVerified: boolean;
};

export type MessageAction = {
  /** Starts the one device action and resolves with the candidate signature. */
  start(): Promise<{ candidateSignature: Eip191Signature; verified: false; hardwareProven: false }>;
  result: Promise<{ candidateSignature: Eip191Signature; verified: false; hardwareProven: false }>;
  cancel(): void;
  disconnect(): void;
};

export function prepareLedgerMessageAction({
  signer,
  path,
  message,
  readiness,
}: {
  signer: MessageSigner;
  path: string;
  message: string;
  readiness: Readiness;
}): MessageAction {
  if (
    !readiness?.trustedApproverConfirmed ||
    !readiness?.firmwareVerified ||
    !readiness?.ethereumAppVerified ||
    !readiness?.readableAsciiReviewVerified
  ) {
    throw new Error("LEDGER_READINESS_NOT_VERIFIED");
  }
  // Only a readable, canonical ASCII challenge may reach the device.
  if (
    typeof message !== "string" ||
    !message.startsWith(APPROVAL_MESSAGE_PREFIX) ||
    !/^[\x20-\x7e\n]+$/.test(message) ||
    message.length > 4096
  ) {
    throw new Error("READABLE_CANONICAL_MESSAGE_REQUIRED");
  }
  if (typeof path !== "string" || !/^44'\/60'\/\d+'\/\d+\/\d+$/.test(path) || typeof signer?.signMessage !== "function") {
    throw new Error("SUPPORTED_SIGNER_REQUIRED");
  }

  type Done = { candidateSignature: Eip191Signature; verified: false; hardwareProven: false };
  let action: { observable: ActionObservable; cancel?(): void } | null = null;
  let subscription: Subscription | null = null;
  let finished = false;
  let resolve!: (value: Done) => void;
  let reject!: (error: Error) => void;
  const result = new Promise<Done>((ok, no) => {
    resolve = ok;
    reject = no;
  });

  function fail(reason: string) {
    if (finished) return;
    finished = true;
    try {
      action?.cancel?.();
    } catch {
      // Local fencing must survive an SDK cancellation failure.
    } finally {
      try {
        subscription?.unsubscribe();
      } catch {}
      reject(new Error(reason));
    }
  }

  function start() {
    if (action || finished) throw new Error("ACTION_ALREADY_STARTED");
    try {
      action = signer.signMessage(path, message);
      subscription = action.observable.subscribe({
        next: (state) => {
          if (finished) return;
          if (state.status === "completed") {
            const s = state.output;
            if (!s || !/^0x[0-9a-fA-F]{64}$/.test(s.r) || !/^0x[0-9a-fA-F]{64}$/.test(s.s) || ![0, 1, 27, 28].includes(s.v)) {
              fail("INVALID_SIGNATURE_OUTPUT");
              return;
            }
            finished = true;
            resolve({ candidateSignature: s, verified: false, hardwareProven: false });
            subscription?.unsubscribe();
          } else if (state.status === "error" || state.status === "stopped") {
            // No fallback to hash signing, typed data, a hot key or a transaction.
            fail("DEVICE_ACTION_DID_NOT_COMPLETE");
          }
        },
        error: () => fail("DEVICE_ACTION_ERROR"),
        complete: () => {
          if (!finished) fail("DEVICE_ACTION_INCOMPLETE");
        },
      });
      if (finished) subscription?.unsubscribe();
    } catch {
      fail("DEVICE_ACTION_ERROR");
    }
    return result;
  }

  return { start, result, cancel: () => fail("USER_CANCELLED"), disconnect: () => fail("DEVICE_DISCONNECTED") };
}

/** Concatenates the device's r/s/v into the 65-byte hex signature the server verifies. */
export function serializeSignature({ r, s, v }: Eip191Signature) {
  return r + s.slice(2) + (v < 27 ? v + 27 : v).toString(16).padStart(2, "0");
}
