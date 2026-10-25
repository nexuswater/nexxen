"use client";
/**
 * Direct Ledger Flex approval panel, ported from nexxen-core `tools/ledger-approval/browser.mjs`
 * into this app so step 7 no longer depends on the separate panel on port 3001.
 *
 * Nothing touches the device on render: discovery, on-device address verification and the one
 * signature are each a separate user click. The server still re-verifies every signature against
 * OWNER_APPROVER_ADDRESS, so a browser-supplied address never establishes authority.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { createLedgerApprovalClient, type ReviewedApproval } from "@/lib/ledger/approval-client";
import type { Approval, StoryData } from "./use-story";

const PATH = "44'/60'/0'/0/0";
const CHAIN_ID = 1449000;

// WebHID is not in the DOM lib; the transport only needs to know whether the browser exposes it.
declare global {
  interface Navigator {
    hid?: unknown;
  }
}

type Subscription = { unsubscribe(): void };
type Observer<T> = { next(value: T): void; error(error?: unknown): void; complete(): void };

/** Only the slice of the official Device Management Kit this panel uses. */
type Dmk = {
  startDiscovering(options: object): { subscribe(observer: Observer<unknown>): Subscription };
  connect(args: { device: unknown; sessionRefresherOptions?: { isRefresherDisabled: boolean } }): Promise<string>;
  disconnect(args: { sessionId: string }): Promise<void>;
  getDeviceSessionState(args: { sessionId: string }): { subscribe(observer: Observer<{ deviceStatus: string }>): Subscription };
  sendCommand(args: { sessionId: string; command: unknown }): Promise<{ status: string; data: { name: string; version: string } }>;
};

type AddressAction = {
  observable: { subscribe(observer: Observer<{ status: string; output?: { address?: string } }>): Subscription };
  cancel?(): void;
};

type EthSigner = {
  getAddress(path: string, options: object): AddressAction;
  signMessage(path: string, message: string): { observable: { subscribe(observer: Observer<never>): Subscription }; cancel?(): void };
};

const MESSAGES: Record<string, string> = {
  OPEN_ETHEREUM_APP: "Open the Ethereum app on the Flex, then verify again.",
  APP_VERSION_CHANGED_REVIEW_REQUIRED: "The Ethereum app version changed since it was reviewed. Update OWNER_APPROVER_ETH_APP after checking the device.",
  FIRMWARE_READINESS_UNKNOWN: "Device readiness is not recorded. Set OWNER_APPROVER_FIRMWARE and OWNER_APPROVER_ETH_APP in .env.local.",
  WRONG_DEVICE_ADDRESS: "This device is not the enrolled owner key. Nothing was signed.",
  TRUSTED_AUTHORITY_NOT_ENROLLED: "No owner key is configured, so no signature can be trusted.",
  CHALLENGE_NOT_PENDING: "The approval request is no longer pending, or it expired. Prepare a new one.",
  CHALLENGE_SCOPE_MISMATCH: "The request no longer matches the owner's exception authority.",
  DEVICE_ADDRESS_MISMATCH: "The verified device address no longer matches the owner key.",
  REVIEW_CHANGED: "The request changed during review. Nothing was submitted.",
  READABLE_CANONICAL_MESSAGE_REQUIRED: "The challenge is not a readable canonical message, so it was not sent to the device.",
  LEDGER_READINESS_NOT_VERIFIED: "Confirm the device checks before signing.",
  DEVICE_ACTION_DID_NOT_COMPLETE: "The device rejected or did not finish the signature. Nothing was submitted.",
  DEVICE_ACTION_ERROR: "The device action failed. Nothing was submitted.",
  USER_CANCELLED: "Cancelled locally. Nothing was submitted.",
  DEVICE_DISCONNECTED: "The device disconnected. Nothing was submitted.",
  NO_SESSION: "Connect the Flex first.",
  SERVER_REJECTED_APPROVAL: "The server rejected the signature.",
};
const explain = (error: unknown) => {
  const raw = (error as Error)?.message || "Stopped";
  return MESSAGES[raw] || raw;
};

export function LedgerSign({
  pending,
  policy,
  act,
  expired,
}: {
  pending: Approval;
  policy: StoryData["policy"];
  act: (body: Record<string, unknown>) => Promise<StoryData | null>;
  expired: boolean;
}) {
  const [status, setStatus] = useState("Not connected. No device action has started.");
  const [connected, setConnected] = useState(false);
  const [deviceAddress, setDeviceAddress] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<ReviewedApproval | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);

  const dmk = useRef<Dmk | null>(null);
  const sessionId = useRef<string | null>(null);
  const sessionSub = useRef<Subscription | null>(null);
  const discovery = useRef<Subscription | null>(null);
  const addressSub = useRef<Subscription | null>(null);
  const addressAction = useRef<AddressAction | null>(null);
  const rejectAddress = useRef<((error: Error) => void) | null>(null);
  /** Bumped on every disconnect or cancel so a late SDK callback can never resume a dead flow. */
  const epoch = useRef(0);

  const client = useRef(createLedgerApprovalClient({ fetch: (...args: Parameters<typeof fetch>) => fetch(...args) }));

  const dispose = (ref: React.RefObject<Subscription | null>) => {
    try {
      ref.current?.unsubscribe();
    } catch {}
    ref.current = null;
  };

  const resetReview = useCallback(() => {
    setReviewed(null);
    setAcknowledged(false);
  }, []);

  const invalidate = useCallback(
    (message: string) => {
      const old = sessionId.current;
      epoch.current++;
      sessionId.current = null;
      setConnected(false);
      setBusy(false);
      // Clear user-visible evidence before any SDK or coordinator cleanup.
      setDeviceAddress(null);
      resetReview();
      setStatus(message);
      try {
        client.current.disconnect();
      } finally {
        dispose(sessionSub);
        dispose(discovery);
        dispose(addressSub);
      }
      const reject = rejectAddress.current;
      rejectAddress.current = null;
      reject?.(new Error("DISCONNECTED"));
      try {
        addressAction.current?.cancel?.();
      } catch {}
      addressAction.current = null;
      return old;
    },
    [resetReview],
  );

  // A navigation or step change must not leave the device session or a pending action alive.
  useEffect(() => () => void invalidate("Panel closed."), [invalidate]);

  const run = (fn: (current: number) => Promise<void>) => {
    if (busy) return;
    const current = epoch.current;
    setBusy(true);
    void (async () => {
      try {
        await fn(current);
      } catch (error) {
        if (current === epoch.current) setStatus(`Stopped: ${explain(error)} No automatic retry.`);
      } finally {
        if (current === epoch.current) setBusy(false);
      }
    })();
  };

  const review = () =>
    run(async (current) => {
      const next = await client.current.review(pending.id);
      if (current !== epoch.current) return;
      setReviewed(next);
      setAcknowledged(false);
      setStatus("Review the exact server-issued message below. Connecting and verifying on-device are separate actions.");
    });

  const connect = () => {
    if (busy || sessionId.current) return;
    if (!navigator.hid) {
      setStatus("Open this page in Chrome or Edge: WebHID is required to talk to the Flex.");
      return;
    }
    const current = ++epoch.current;
    let selected = false;
    setBusy(true);
    const ended = () => {
      if (current === epoch.current) invalidate("Device session ended. No further signature or submission will start.");
    };
    void (async () => {
      try {
        if (!dmk.current) {
          const [{ DeviceManagementKitBuilder }, { webHidTransportFactory }] = await Promise.all([
            import("@ledgerhq/device-management-kit"),
            import("@ledgerhq/device-transport-kit-web-hid"),
          ]);
          if (current !== epoch.current) return;
          dmk.current = new DeviceManagementKitBuilder().addTransport(webHidTransportFactory).build() as unknown as Dmk;
        }
        const sub = dmk.current.startDiscovering({}).subscribe({
          next: (device) => {
            if (current !== epoch.current || selected) return;
            selected = true;
            dispose(discovery);
            void (async () => {
              try {
                const connectedId = await dmk.current!.connect({ device, sessionRefresherOptions: { isRefresherDisabled: true } });
                if (current !== epoch.current) {
                  try {
                    await dmk.current!.disconnect({ sessionId: connectedId });
                  } catch {}
                  return;
                }
                sessionId.current = connectedId;
                setConnected(true);
                const subscription = dmk.current!.getDeviceSessionState({ sessionId: connectedId }).subscribe({
                  next: (s) => {
                    if (s.deviceStatus === "NOT CONNECTED") ended();
                  },
                  error: ended,
                  complete: ended,
                });
                if (current !== epoch.current) {
                  subscription.unsubscribe();
                  return;
                }
                sessionSub.current = subscription;
                setStatus(`Connected. Open the Ethereum app, then verify the enrolled address on the ${policy.ownerDevice}.`);
              } catch {
                ended();
              } finally {
                if (current === epoch.current) setBusy(false);
              }
            })();
          },
          error: ended,
          complete: () => {
            if (!selected) ended();
          },
        });
        if (current === epoch.current && !selected) discovery.current = sub;
        else sub.unsubscribe();
      } catch {
        ended();
      }
    })();
  };

  const verify = () =>
    run(async (current) => {
      if (!sessionId.current) throw new Error("NO_SESSION");
      setDeviceAddress(null);
      const expected = policy.owner;
      if (!expected) throw new Error("TRUSTED_AUTHORITY_NOT_ENROLLED");
      if (!policy.observedEthereumApp || !policy.observedFirmware) throw new Error("FIRMWARE_READINESS_UNKNOWN");

      const { GetAppAndVersionCommand } = await import("@ledgerhq/device-management-kit");
      if (current !== epoch.current) return;
      const app = await dmk.current!.sendCommand({ sessionId: sessionId.current, command: new GetAppAndVersionCommand() });
      if (current !== epoch.current) return;
      if (app.status !== "SUCCESS" || app.data.name !== "Ethereum") throw new Error("OPEN_ETHEREUM_APP");
      if (app.data.version !== policy.observedEthereumApp) throw new Error("APP_VERSION_CHANGED_REVIEW_REQUIRED");

      const { SignerEthBuilder } = await import("@ledgerhq/device-signer-kit-ethereum");
      if (current !== epoch.current) return;
      const signer = new SignerEthBuilder({ dmk: dmk.current as never, sessionId: sessionId.current }).build() as unknown as EthSigner;
      const action = signer.getAddress(PATH, { checkOnDevice: true, returnChainCode: false, skipOpenApp: true, chainId: CHAIN_ID });
      addressAction.current = action;
      setStatus(`Verify this public address on the ${policy.ownerDevice}. This is not a signature.`);

      let settled = false;
      let sub: Subscription | null = null;
      try {
        const address = await new Promise<string | undefined>((resolve, reject) => {
          const finish = (error: Error | null, value?: string) => {
            if (settled) return;
            settled = true;
            try {
              sub?.unsubscribe();
            } catch {}
            if (error) reject(error);
            else resolve(value);
          };
          rejectAddress.current = (error) => finish(error);
          sub = action.observable.subscribe({
            next: (r) => {
              if (current !== epoch.current) return finish(new Error("DEVICE_DISCONNECTED"));
              if (r.status === "completed") finish(null, r.output?.address);
              else if (r.status === "error" || r.status === "stopped") finish(new Error("ADDRESS_REJECTED"));
            },
            error: () => finish(new Error("DEVICE_ACTION_ERROR")),
            complete: () => finish(new Error("DEVICE_ACTION_INCOMPLETE")),
          });
          if (settled) (sub as Subscription | null)?.unsubscribe();
          else addressSub.current = sub;
        });
        if (current !== epoch.current) return;
        if (typeof address !== "string" || address.toLowerCase() !== expected.toLowerCase()) throw new Error("WRONG_DEVICE_ADDRESS");
        setDeviceAddress(address);
        setStatus("On-device address matches the enrolled owner key. Review the message, then sign one exception.");
      } finally {
        try {
          (sub as Subscription | null)?.unsubscribe();
        } catch {}
        if (current === epoch.current) {
          addressAction.current = null;
          addressSub.current = null;
          rejectAddress.current = null;
        }
      }
    });

  const sign = () =>
    run(async (current) => {
      if (!sessionId.current || !reviewed || !deviceAddress || !acknowledged) throw new Error("LEDGER_READINESS_NOT_VERIFIED");
      const selected = reviewed;
      setAcknowledged(false);
      setStatus(`Review the complete message on the ${policy.ownerDevice}. Reject unreadable or hash-only prompts. No funds move.`);

      const { SignerEthBuilder } = await import("@ledgerhq/device-signer-kit-ethereum");
      if (current !== epoch.current) return;
      const signer = new SignerEthBuilder({ dmk: dmk.current as never, sessionId: sessionId.current }).build() as unknown as EthSigner;

      const outcome = await client.current.signReviewed({
        reviewed: selected,
        verifiedDeviceAddress: deviceAddress,
        signer,
        path: PATH,
        readiness: {
          trustedApproverConfirmed: true,
          firmwareVerified: !!policy.observedFirmware,
          ethereumAppVerified: true,
          readableAsciiReviewVerified: true,
        },
        submit: ({ approvalId, signature }) => act({ action: "submit", approvalId, signature, via: "ledger" }),
      });
      if (current !== epoch.current) return;
      resetReview();
      setStatus(`Server verified and consumed this one exception. Reservation ${outcome.approval.reservationId?.slice(0, 8) ?? "created"}.`);
    });

  const cancel = () => {
    const old = invalidate("Cancelled locally. If submission already began, refresh to reconcile the server outcome.");
    const current = epoch.current;
    void (async () => {
      try {
        if (old) await dmk.current?.disconnect({ sessionId: old });
      } catch {
        if (current === epoch.current) setStatus("Local state cleared. USB disconnect failed; unplug the device before reconnecting.");
      }
    })();
  };

  const canSign = connected && !!reviewed && !!deviceAddress && acknowledged && !busy && !expired;

  return (
    <div className="nxd-ledger">
      <div className="nxd-row">
        <span className="nxd-eyebrow">Direct {policy.ownerDevice} · WebHID</span>
        {connected ? <span className="nxd-tag nxd-tag-verified">Connected</span> : <span className="nxd-tag nxd-tag-pending">Not connected</span>}
      </div>

      <ol className="nxd-ledger-steps">
        <li>
          <button className="nxd-btn" disabled={busy || !!reviewed} onClick={review}>
            1 · Load the server challenge
          </button>
        </li>
        <li>
          <button className="nxd-btn" disabled={busy || connected} onClick={connect}>
            2 · Connect {policy.ownerDevice}
          </button>
        </li>
        <li>
          <button className="nxd-btn" disabled={busy || !connected} onClick={verify}>
            3 · Verify address on device
          </button>
          {deviceAddress && <code className="nxd-mono">{deviceAddress}</code>}
        </li>
      </ol>

      {reviewed && (
        <label className="nxd-ack">
          <input type="checkbox" checked={acknowledged} disabled={busy} onChange={(e) => setAcknowledged(e.target.checked)} />
          I read the full message on the device and it matches the request above.
        </label>
      )}

      <div className="nxd-row">
        <button className="nxd-btn nxd-btn-primary" disabled={!canSign} onClick={sign}>
          4 · Sign this one exception on {policy.ownerDevice}
        </button>
        <button className="nxd-link" disabled={busy && !connected} onClick={cancel}>
          Cancel / disconnect
        </button>
      </div>

      <p className="nxd-note">{status}</p>
      <small className="nxd-dim">
        A signature proves control of the owner key; it is not proof that every field was displayed on physical hardware. The server re-checks the message,
        signer, expiry and single use before it consumes the exception.
      </small>
    </div>
  );
}
