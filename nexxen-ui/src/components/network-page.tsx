"use client";
import type { Purchase, Settlement } from "@/lib/ap4m/agent";
import { useNav } from "@openuidev/react-ui";
import { useCallback, useEffect, useState } from "react";

type ChannelView = { channel_id: string; channel_status: string; cap: string; redeemed: string | null };
type ServiceView = {
  id: string;
  name: string;
  seller: string;
  listedPriceRlusd: string;
  available: boolean | null;
  priceRlusd?: string;
  reason?: string;
};
type StatusView =
  | { configured: false; missing: string[]; network: { explorerUrl: string; faucetUrl?: string } }
  | {
      configured: true;
      mode: "live" | "demo";
      demoReason?: string;
      team: string;
      agent: string;
      gasXrp: string | null;
      policy: { maxChannelCapRlusd: string; maxPriceRlusd: string };
      network: { explorerUrl: string | null };
      contracts: { paymentLedger: string };
      channels: ChannelView[];
    };
type Snapshot = {
  status?: StatusView;
  services?: ServiceView[];
  journal: { purchases: Purchase[]; settlements: Settlement[] };
  error?: string;
};

const short = (hex: string) => `${hex.slice(0, 8)}…${hex.slice(-6)}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function ExplorerLink(props: { explorer: string | null; path: string; label: string; className?: string }) {
  if (!props.explorer) return <span className={props.className}>{props.label}</span>;
  return (
    <a className={props.className} href={`${props.explorer}/${props.path}`} target="_blank" rel="noreferrer">
      {props.label}
    </a>
  );
}

export function useAp4m(intervalMs = 5000) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/ap4m", { cache: "no-store" })
        .then((res) => res.json())
        .then((json) => alive && setData(json))
        .catch(() => {});
    load();
    const t = setInterval(load, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [intervalMs]);

  const settle = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/ap4m", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "settle" }),
    });
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Settlement failed");
    setBusy(false);
  }, []);

  return { data, busy, error, settle };
}

export function NetworkPage() {
  const nav = useNav();
  const { data, busy, error, settle } = useAp4m();

  if (!data) return <div className="nx-page">Connecting to AP4M…</div>;
  const s = data.status;
  const explorer = s?.network.explorerUrl ?? null;
  const settledClaims = new Set(data.journal.settlements.flatMap((x) => x.receipts.map((r) => r.claim_id)));
  const unsettled = data.journal.purchases.filter((p) => !settledClaims.has(p.claimId));

  return (
    <div className="nx-page">
      <header className="nx-header">
        <div>
          <h1>AP4M</h1>
          <p className="nx-muted">
            Mastercard Agent Pay for Machines ·{" "}
            {s?.configured && s.mode === "demo" ? (
              <span className="nx-pill nx-demo">Demo mode · simulated</span>
            ) : (
              <>
                <span className="nx-pill nx-live">Live · XRPL EVM Testnet</span> <span className="nx-pill">RLUSD settlement</span>
              </>
            )}
          </p>
        </div>
        <button className="nx-btn" onClick={() => nav.navigate(undefined)}>
          Back to chat
        </button>
      </header>

      {(error || data.error) && <div className="nx-error">{error ?? data.error}</div>}

      {s?.configured && s.mode === "demo" && (
        <div className="nx-card nx-demo-banner">
          <div className="nx-title">Demo mode: purchases run locally with real signed vouchers</div>
          <div className="nx-muted">
            The agent signs genuine AP4M (EIP-712) vouchers and each is verified before delivery; the Channel,
            on-chain redemption and RLUSD payout are simulated. Live AP4M turns on by itself once this is fixed:
          </div>
          <div className="nx-mono">{s.demoReason}</div>
        </div>
      )}

      {s && !s.configured && (
        <section className="nx-card">
          <div className="nx-title">Finish AP4M setup</div>
          <ol className="nx-steps">
            <li>
              Sign in to the <a href="https://hackathon.ap4m.build/participant" target="_blank" rel="noreferrer">participant portal</a>.
            </li>
            <li>
              Run <code>pnpm ap4m:wallets</code> to create the agent and merchant wallets in <code>.env.local</code>, then
              add their addresses on <b>My setup</b> and fund the team budget.
            </li>
            <li>
              Get XRP for gas from the{" "}
              <a href="https://faucet.testevm.ripple.com" target="_blank" rel="noreferrer">XRPL EVM faucet</a> for both wallets.
            </li>
            <li>
              Fill in <code>AP4M_TEAM_NAME</code>, <code>MERCHANT_ID</code> in <code>.env.local</code>, restart, and run{" "}
              <code>pnpm merchants</code>.
            </li>
          </ol>
          <div className="nx-muted">Missing: {s.missing.join(", ")}</div>
        </section>
      )}

      {s?.configured && (
        <section className="nx-grid3">
          <div className="nx-card">
            <div className="nx-label">Team</div>
            <div className="nx-title">{s.team}</div>
            <div className="nx-muted">Policy: ≤ {s.policy.maxPriceRlusd} RLUSD per purchase</div>
          </div>
          <div className="nx-card">
            <div className="nx-label">Agent wallet</div>
            <ExplorerLink explorer={explorer} path={`address/${s.agent}`} label={short(s.agent)} className="nx-title" />
            <div className="nx-muted">{s.gasXrp === null ? "no gas needed in demo" : `${Number(s.gasXrp).toFixed(3)} XRP for gas`}</div>
          </div>
          <div className="nx-card">
            <div className="nx-label">PaymentLedger</div>
            <ExplorerLink
              explorer={explorer}
              path={`address/${s.contracts.paymentLedger}`}
              label={short(s.contracts.paymentLedger)}
              className="nx-title"
            />
            <div className="nx-muted">VoucherRedeemed events live here</div>
          </div>
        </section>
      )}

      {s?.configured && (
        <section>
          <h2>Channels</h2>
          {s.channels.length === 0 && <p className="nx-muted">No Channel yet. The agent opens one on its first purchase.</p>}
          {s.channels.map((c) => (
            <div key={c.channel_id} className="nx-card">
              <div className="nx-row">
                <div>
                  <div className="nx-mono">{c.channel_id}</div>
                  <span className={`nx-status nx-${c.channel_status === "open" ? "active" : "expired"}`}>{c.channel_status}</span>
                </div>
                <div className="nx-title">
                  {c.redeemed ?? "–"} <span className="nx-muted">/ {c.cap} RLUSD</span>
                </div>
              </div>
              {c.redeemed !== null && (
                <div className="nx-bar">
                  <div style={{ width: `${Math.min(100, (Number(c.redeemed) / Number(c.cap)) * 100)}%` }} />
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      <section>
        <h2>Services for sale (x402)</h2>
        <div className="nx-grid3">
          {(data.services ?? []).map((svc) => (
            <div key={svc.id} className="nx-card">
              <div className="nx-label">{svc.seller}</div>
              <div className="nx-title">{svc.name}</div>
              <div className="nx-muted">
                {svc.priceRlusd ?? svc.listedPriceRlusd} RLUSD ·{" "}
                {svc.available === true ? "live 402 price" : svc.reason ?? "unavailable"}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="nx-row">
          <h2>Purchases</h2>
          <button className="nx-btn nx-primary" disabled={busy || unsettled.length === 0} onClick={settle}>
            {busy ? "Settling…" : `Settle now (${unsettled.length})`}
          </button>
        </div>
        {data.journal.purchases.length === 0 && <p className="nx-muted">No purchases yet.</p>}
        {data.journal.purchases.length > 0 && (
          <table className="nx-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Service</th>
                <th>Amount</th>
                <th>{s?.configured && s.mode === "demo" ? "Voucher (simulated tx)" : "On-chain voucher"}</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.journal.purchases.map((p) => (
                <tr key={p.claimId}>
                  <td>{time(p.at)}</td>
                  <td>
                    {p.service}
                    <div className="nx-muted">{p.seller}</div>
                  </td>
                  <td>{p.amountRlusd} RLUSD</td>
                  <td>
                    {p.explorerUrl ? (
                      <a href={p.explorerUrl} target="_blank" rel="noreferrer" className="nx-mono">
                        {short(p.txHash)}
                      </a>
                    ) : (
                      <span className="nx-mono">{short(p.txHash)} (demo)</span>
                    )}
                  </td>
                  <td>
                    <span className={`nx-status nx-${settledClaims.has(p.claimId) ? "settled" : "authorized"}`}>
                      {settledClaims.has(p.claimId) ? "settled" : "redeemed"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Settlements</h2>
        {data.journal.settlements.length === 0 && (
          <p className="nx-muted">AP4M settles automatically; settled payouts and receipts appear here.</p>
        )}
        <div className="nx-grid3">
          {data.journal.settlements.map((x) => (
            <div key={x.payoutTx} className="nx-card">
              <div className="nx-label">RLUSD payout · {time(x.at)}</div>
              <div className="nx-title">{x.amountRlusd} RLUSD</div>
              {x.payoutExplorerUrl ? (
                <a href={x.payoutExplorerUrl} target="_blank" rel="noreferrer" className="nx-mono">
                  {short(x.payoutTx)}
                </a>
              ) : (
                <span className="nx-mono">{short(x.payoutTx)} (demo payout)</span>
              )}
              {x.receipts.map(
                (r) =>
                  r.receipt_url && (
                    <a key={r.claim_id} href={r.receipt_url} target="_blank" rel="noreferrer" className="nx-muted">
                      Verifiable receipt ({r.amount_rlusd} RLUSD)
                    </a>
                  ),
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
