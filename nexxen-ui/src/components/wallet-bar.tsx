"use client";
import { useEffect, useRef, useState } from "react";
import { AccountAvatar, DemoAvatarPicker } from "@/components/account-profile";

type HistoryItem = {
  at: string;
  service: string;
  seller: string;
  amountRlusd: string;
  txHash: string;
  explorerUrl: string | null;
  status: "paid" | "settled";
  input?: string;
  ok?: boolean;
};

export type FeedEvent = {
  at: string;
  kind: "402" | "VEREV" | "POLICY" | "VOUCHER" | "SETTLED" | "PAYOUT" | "DECLINE" | "ERROR";
  text: string;
  decision?: "APPROVE" | "ASK_OWNER" | "DECLINE";
  code?: number;
  txHash?: string;
  explorerUrl?: string | null;
};

export type Report = {
  score: number | null;
  fundedLimitRlusd: string;
  settledPayments: number;
  settledRlusd: string;
  withinBudget: number;
  declines: number;
  blocksApproved: number;
  blockDecider: "VEREV" | "POLICY";
  paidOutToSellers: number;
  lastTx: string | null;
  lastTxUrl: string | null;
};

export type WalletData = {
  wallet: { mode: "live" | "demo"; address: string; xrp: string | null; explorerUrl: string | null };
  balance: { budgetRlusd: string; spentRlusd: string; availableRlusd: string };
  report: Report;
  events: FeedEvent[];
  history: HistoryItem[];
  error?: string;
};

const short = (hex: string) => `${hex.slice(0, 6)}…${hex.slice(-4)}`;
const fmt = (v: string | number, digits = 3) => Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });

function ago(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// One poller shared by every component that shows wallet data.
type Listener = (d: WalletData) => void;
const listeners = new Set<Listener>();
let latest: WalletData | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function poll() {
  fetch("/api/wallet", { cache: "no-store" })
    .then((r) => r.json())
    .then((json: WalletData) => {
      if (json.error) return;
      latest = json;
      listeners.forEach((l) => l(json));
    })
    .catch(() => {});
}

/** Polls the agent wallet: address, XRP gas, RLUSD budget, history, feed and report. */
export function useWallet() {
  const [data, setData] = useState<WalletData | null>(latest);
  const [delta, setDelta] = useState<{ rlusd: number; key: number } | null>(null);
  const last = useRef<number | null>(latest ? Number(latest.balance.availableRlusd) : null);

  useEffect(() => {
    const onData: Listener = (json) => {
      const available = Number(json.balance.availableRlusd);
      if (last.current !== null && available !== last.current) {
        setDelta({ rlusd: available - last.current, key: Date.now() });
      }
      last.current = available;
      setData(json);
    };
    listeners.add(onData);
    if (!timer) {
      poll();
      timer = setInterval(poll, 3000);
    }
    return () => {
      listeners.delete(onData);
      if (!listeners.size && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);

  return { data, delta };
}

/** Prominent wallet header above the chat, with a transaction history dialog. */
export function WalletHeader({ mode }: { mode: "light" | "dark" }) {
  const { data, delta } = useWallet();
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!data) return;
    navigator.clipboard?.writeText(data.wallet.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  const profile = (
    <div className="nxw-identity nxw-identity-stack">
      <div className="nxw-identity-row">
        <AccountAvatar />
        {data ? (
          <div>
            <div className="nxw-caption">
              Agent wallet
              <span className={`nxw-badge nxw-badge-${data.wallet.mode}`}>
                <span className="nxw-dot" />
                {data.wallet.mode === "live" ? "Live · XRPL EVM Testnet" : "Demo · simulated"}
              </span>
            </div>
            <div className="nxw-address">
              {data.wallet.explorerUrl ? (
                <a href={data.wallet.explorerUrl} target="_blank" rel="noreferrer" title={data.wallet.address}>
                  {short(data.wallet.address)}
                </a>
              ) : (
                <span title={data.wallet.address}>{short(data.wallet.address)}</span>
              )}
              <button className="nxw-icon-btn" onClick={copy} title="Copy address">
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ) : (
          <div className="nxw-loading">Loading agent wallet…</div>
        )}
      </div>
      <DemoAvatarPicker />
    </div>
  );

  if (!data) {
    return <header className={`nxw nxw-${mode}`}>{profile}</header>;
  }
  const { wallet, balance, history } = data;
  const spentPct = Math.min(100, (Number(balance.spentRlusd) / Number(balance.budgetRlusd || 1)) * 100);
  const lastBuy = history[0];

  return (
    <header className={`nxw nxw-${mode}`}>
      {profile}

      <div className="nxw-stat">
        <div className="nxw-caption">RLUSD available</div>
        <div className="nxw-value">
          {fmt(balance.availableRlusd)}
          <span className="nxw-unit"> / {fmt(balance.budgetRlusd)}</span>
          {delta && (
            <span key={delta.key} className={`nxw-delta ${delta.rlusd < 0 ? "down" : "up"}`}>
              {delta.rlusd < 0 ? "−" : "+"}
              {fmt(Math.abs(delta.rlusd), 6)}
            </span>
          )}
        </div>
        <div className="nxw-bar" title={`${fmt(spentPct, 2)}% of budget spent`}>
          <span style={{ width: `${Math.max(spentPct, 0.8)}%` }} />
        </div>
        <div className="nxw-sub">Spent {fmt(balance.spentRlusd, 6)} RLUSD</div>
      </div>

      <div className="nxw-stat">
        <div className="nxw-caption">XRP for gas</div>
        <div className="nxw-value">{wallet.xrp === null ? "—" : fmt(wallet.xrp, 4)}</div>
        <div className="nxw-sub">{wallet.mode === "live" ? "Pays network fees" : "Not used in demo"}</div>
      </div>

      <div className="nxw-stat nxw-last">
        <div className="nxw-caption">Last purchase</div>
        {lastBuy ? (
          <>
            <div className="nxw-last-name">{lastBuy.service}</div>
            <div className="nxw-sub">
              <span className="nxw-neg">−{lastBuy.amountRlusd} RLUSD</span> · {lastBuy.seller} · {ago(lastBuy.at)}
            </div>
          </>
        ) : (
          <div className="nxw-sub">Nothing bought yet</div>
        )}
      </div>

      <button className="nxw-history-btn" onClick={() => dialog.current?.showModal()}>
        Transaction history
        <span className="nxw-count">{history.length}</span>
      </button>

      <dialog ref={dialog} className="nx-dialog" onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        <div className="nx-dialog-body">
          <div className="nx-row">
            <div>
              <div className="nx-title">Transaction history</div>
              <div className="nx-muted">
                {short(wallet.address)} · spent {balance.spentRlusd} of {balance.budgetRlusd} RLUSD ·{" "}
                {wallet.mode === "live" ? "XRPL EVM Testnet" : "demo (simulated)"}
              </div>
            </div>
            <button className="nx-btn nx-btn-sm" onClick={() => dialog.current?.close()}>
              Close
            </button>
          </div>
          {history.length === 0 ? (
            <p className="nx-muted">Nothing bought yet.</p>
          ) : (
            <table className="nx-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Service</th>
                  <th>Input</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.txHash}>
                    <td>{new Date(h.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td>
                      {h.service}
                      <div className="nx-muted">{h.seller}</div>
                    </td>
                    <td className="nx-input-cell" title={h.input}>
                      {h.input ?? "–"}
                    </td>
                    <td className="nx-neg">−{h.amountRlusd} RLUSD</td>
                    <td>
                      <span className={`nx-status nx-${h.status === "settled" ? "settled" : "authorized"}`}>{h.status}</span>
                      {h.ok === false && <div className="nx-muted">job failed</div>}
                    </td>
                    <td>
                      {h.explorerUrl ? (
                        <a href={h.explorerUrl} target="_blank" rel="noreferrer" className="nx-mono">
                          {short(h.txHash)} ↗
                        </a>
                      ) : (
                        <span className="nx-mono">{short(h.txHash)} (demo)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </dialog>
    </header>
  );
}
