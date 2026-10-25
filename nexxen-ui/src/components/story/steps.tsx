"use client";
import { useWallet } from "@/components/wallet-bar";
import { useEffect, useMemo, useState } from "react";
import type { Approval, CardOrder, Proof, StoryData } from "./use-story";

type Act = (body: Record<string, unknown>) => Promise<StoryData | null>;
export type StepProps = { data: StoryData; act: Act; busy: string | null; go: (step: number) => void };

const short = (hex?: string | null) => (hex ? `${hex.slice(0, 6)}…${hex.slice(-4)}` : "—");
const utc = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false }) + " UTC";
const fmt = (v: string | number, d = 4) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: d });

function Tag({ kind, children }: { kind: "real" | "verified" | "sandbox" | "sim" | "demo" | "pending"; children: React.ReactNode }) {
  return <span className={`nxd-tag nxd-tag-${kind}`}>{children}</span>;
}

function StatusPill({ status }: { status: CardOrder["status"] }) {
  const label = { approved: "Approved", blocked: "Blocked", declined: "Declined", reserved: "Reserved" }[status];
  return <span className={`nxd-pill nxd-pill-${status}`}>{label}</span>;
}

/* 1 ─ Human sets the limits */
export function LimitsStep({ data }: StepProps) {
  const p = data.policy;
  const [small, large] = data.items;
  return (
    <div className="nxd-stack">
      <div className="nxd-simple">
        <div className="nxd-simple-tile">
          <span className="nxd-simple-icon" aria-hidden>
            👤
          </span>
          <b>You set the rules</b>
          <p>
            Your AI agent may spend up to <strong>{p.cardLimit} RLUSD</strong> per purchase.
          </p>
        </div>
        <div className="nxd-simple-tile">
          <span className="nxd-simple-icon" aria-hidden>
            🤖
          </span>
          <b>Your agent buys on its own</b>
          <p>Small purchases go through instantly. You don’t click anything.</p>
        </div>
        <div className="nxd-simple-tile">
          <span className="nxd-simple-icon" aria-hidden>
            🔐
          </span>
          <b>Big purchases wait for you</b>
          <p>Anything over the limit is stopped until you approve it on your {p.ownerDevice}.</p>
        </div>
      </div>
      <div className="nxd-examples">
        <div className="nxd-example ok">
          <span>
            {small.name} · <b>{small.amount} RLUSD</b>
          </span>
          <em>✓ Agent pays</em>
        </div>
        <div className="nxd-example stop">
          <span>
            {large.name} · <b>{large.amount} RLUSD</b>
          </span>
          <em>✋ Waits for you</em>
        </div>
      </div>
      <p className="nxd-note">Payments run on Mastercard Agent Pay for Machines (AP4M), in RLUSD on the XRP Ledger EVM testnet.</p>
    </div>
  );
}

/* 2 ─ The agent's paid job */
export function JobStep({ data }: StepProps) {
  const j = data.job;
  const flow = ["Borrow", "Buy GPU compute", "Deliver", "Get paid", "Repay"];
  return (
    <div className="nxd-stack">
      <div className="nxd-job">
        <div>
          <span className="nxd-eyebrow">Incoming job · {j.client}</span>
          <h3>{j.title}</h3>
          <p>The agent can do the work, but it has to pay for GPU compute upfront, and the client pays only on delivery.</p>
        </div>
        <div className="nxd-job-nums">
          <div>
            <span>Client pays on delivery</span>
            <b>{j.paysRlusd} RLUSD</b>
          </div>
          <div>
            <span>Compute needed upfront</span>
            <b>~{j.computeRlusd} RLUSD</b>
          </div>
        </div>
      </div>
      <ol className="nxd-flow">
        {flow.map((f, i) => (
          <li key={f}>
            <span>{i + 1}</span>
            {f}
          </li>
        ))}
      </ol>
      <p className="nxd-note">
        <Tag kind="sim">Simulated</Tag> The client, job and GPU merchant are samples. The agent wallet and its RLUSD payments in the header are live on XRPL EVM
        Testnet.
      </p>
    </div>
  );
}

/* 3 & 4 ─ Borrow and the repayment quote */
const PRESETS = [
  { label: "6 h", duration: 6, unit: "hours" },
  { label: "12 h", duration: 12, unit: "hours" },
  { label: "1 day", duration: 1, unit: "days" },
  { label: "2 days", duration: 2, unit: "days" },
  { label: "7 days", duration: 7, unit: "days" },
] as const;

export function BorrowStep({ data, act, busy, go }: StepProps) {
  const accepted = data.financing.accepted;
  const [amount, setAmount] = useState(accepted?.amount ?? "5.00");
  const [unit, setUnit] = useState<"hours" | "days">(accepted?.unit ?? "days");
  const [duration, setDuration] = useState(accepted?.duration ?? 2);
  const max = unit === "days" ? 7 : 168;
  const hours = duration * (unit === "days" ? 24 : 1);
  const preview = (Number(amount) * 0.12 * hours) / (365 * 24);

  const getQuote = async () => {
    if (await act({ action: "quote", amount: Number(amount).toFixed(2), duration, unit })) go(4);
  };

  return (
    <div className="nxd-stack">
      <div className="nxd-borrow">
        <label className="nxd-field">
          <span>
            Amount <b>{fmt(amount, 2)} RLUSD</b>
          </span>
          <input
            type="range"
            min={0.5}
            max={10}
            step={0.1}
            value={amount}
            disabled={!!accepted}
            onChange={(e) => setAmount(Number(e.target.value).toFixed(2))}
          />
          <div className="nxd-range-ends">
            <small>0.50</small>
            <small>10.00</small>
          </div>
        </label>
        <div className="nxd-field">
          <span>
            Repayment term{" "}
            <b>
              {duration} {unit === "days" ? (duration === 1 ? "day" : "days") : duration === 1 ? "hour" : "hours"}
            </b>
          </span>
          <div className="nxd-seg">
            {(["hours", "days"] as const).map((u) => (
              <button
                key={u}
                className={u === unit ? "on" : ""}
                disabled={!!accepted}
                onClick={() => {
                  setUnit(u);
                  setDuration(u === "days" ? Math.min(Math.max(1, Math.round(duration / 24)), 7) : Math.min(duration * 24, 168));
                }}
              >
                {u === "hours" ? "Hours" : "Days"}
              </button>
            ))}
          </div>
          <input type="range" min={1} max={max} step={1} value={duration} disabled={!!accepted} onChange={(e) => setDuration(Number(e.target.value))} />
          <div className="nxd-chips">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                disabled={!!accepted}
                className={p.unit === unit && p.duration === duration ? "on" : ""}
                onClick={() => {
                  setUnit(p.unit);
                  setDuration(p.duration);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="nxd-preview">
        <div>
          <span className="nxd-eyebrow">Estimated repayment</span>
          <b>{(Number(amount) + preview).toFixed(4)} RLUSD</b>
          <small>
            {fmt(amount, 2)} + {preview.toFixed(6)} interest at 12% a year, for {hours} hours
          </small>
        </div>
        {accepted ? (
          <button className="nxd-btn" onClick={() => go(4)}>
            View accepted quote →
          </button>
        ) : (
          <button className="nxd-btn nxd-btn-primary" onClick={getQuote} disabled={busy === "quote"}>
            {busy === "quote" ? "Quoting…" : "Get repayment quote →"}
          </button>
        )}
      </div>
      <p className="nxd-note">
        <Tag kind="demo">Demo financing</Tag> Terms run in hours or days, up to 7 days. Not a real loan; nothing is lent or borrowed.
      </p>
    </div>
  );
}

function useCountdown(iso?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return null;
  const s = Math.max(0, Math.round((Date.parse(iso) - now) / 1000));
  return { expired: s === 0, label: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` };
}

export function QuoteStep({ data, act, busy, go }: StepProps) {
  const q = data.financing.accepted ?? data.quotes[0];
  const left = useCountdown(q?.acceptedAt ? undefined : q?.expiresAt);
  if (!q) {
    return (
      <div className="nxd-empty">
        No quote yet.{" "}
        <button className="nxd-link" onClick={() => go(3)}>
          Go back to Borrow
        </button>
      </div>
    );
  }
  return (
    <div className="nxd-stack">
      <div className="nxd-quote">
        <div className="nxd-quote-banner">DEMO FINANCING · NOT A REAL LOAN · NO FUNDS MOVE</div>
        <div className="nxd-quote-main">
          <span className="nxd-eyebrow">Repay</span>
          <b>
            {Number(q.total).toFixed(4)} <small>RLUSD</small>
          </b>
          <span>by {utc(q.dueAt)}</span>
        </div>
        <dl className="nxd-quote-rows">
          <div>
            <dt>Principal</dt>
            <dd>{q.amount} RLUSD</dd>
          </div>
          <div>
            <dt>Interest</dt>
            <dd>{q.interest} RLUSD</dd>
          </div>
          <div>
            <dt>Rate</dt>
            <dd>{q.annualRateBps / 100}% a year (nominal), no fees</dd>
          </div>
          <div>
            <dt>Term</dt>
            <dd>
              {q.duration} {q.unit} ({q.hours} h)
            </dd>
          </div>
          <div>
            <dt>Method</dt>
            <dd>{q.convention}</dd>
          </div>
        </dl>
        <div className="nxd-quote-foot">
          {q.acceptedAt ? (
            <>
              <span className="nxd-ok">✓ Accepted {utc(q.acceptedAt)}: the agent’s card budget is {q.amount} RLUSD (simulated)</span>
              <button className="nxd-btn nxd-btn-primary" onClick={() => go(5)}>
                Open the card →
              </button>
            </>
          ) : (
            <>
              <span className="nxd-dim">{left?.expired ? "Quote expired: get a new one" : `Quote valid for ${left?.label}`}</span>
              <div className="nxd-row">
                <button className="nxd-btn" onClick={() => go(3)}>
                  Adjust
                </button>
                <button className="nxd-btn nxd-btn-primary" disabled={busy === "accept" || left?.expired} onClick={() => act({ action: "accept", quoteId: q.id })}>
                  {busy === "accept" ? "Accepting…" : "Accept demo financing"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* 5 & 6 ─ The agent buys */
function TxLink({ hash, url }: { hash: string; url: string | null }) {
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="nxd-mono">
      {short(hash)} ↗
    </a>
  ) : (
    <span className="nxd-mono">{short(hash)} (demo)</span>
  );
}

/** Channel IDs open the live channel state (cap, redeemed, payments) from the AP4M service. */
function ChannelLink({ id }: { id: string }) {
  return (
    <a href={`/api/ap4m/channel/${id}`} target="_blank" rel="noreferrer" className="nxd-mono" title="Live channel state">
      {short(id)} ↗
    </a>
  );
}

/** A claim is shown by the VoucherRedeemed event in its payment transaction's logs. */
function ClaimLink({ id, txUrl }: { id: string; txUrl: string | null }) {
  return txUrl ? (
    <a href={`${txUrl}?tab=logs`} target="_blank" rel="noreferrer" className="nxd-mono" title="VoucherRedeemed event on the explorer">
      {short(id)} ↗
    </a>
  ) : (
    <span className="nxd-mono">{short(id)}</span>
  );
}

function OrderResult({ order, act, busy }: { order: CardOrder; act?: Act; busy?: string | null }) {
  return (
    <div className={`nxd-result nxd-result-${order.status}`}>
      <div className="nxd-result-head">
        <StatusPill status={order.status} />
        <b>
          {order.item} · {order.amount} RLUSD
        </b>
        <span className="nxd-dim">{utc(order.at)}</span>
      </div>
      <p>{order.reason}</p>
      <ul className="nxd-checks">
        {order.checks.map((c) => (
          <li key={c.label} className={c.ok ? "ok" : "no"}>
            <i>{c.ok ? "✓" : "✕"}</i>
            <span>{c.label}</span>
            <small>{c.detail}</small>
          </li>
        ))}
      </ul>
      {order.payment && (
        <div className="nxd-delivered">
          {order.result?.imageUrl ? (
            <figure className="nxd-figure">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={order.result.imageUrl} alt={order.result.prompt ?? "Rendered image"} />
              {order.result.renderer && <figcaption>{order.result.renderer}</figcaption>}
            </figure>
          ) : (
            <div className="nxd-empty nxd-redeliver">
              <span>Paid, but the image service is busy.</span>
              {act && (
                <button className="nxd-btn nxd-btn-primary" disabled={!!busy} onClick={() => act({ action: "redeliver", orderId: order.id })}>
                  {busy === "redeliver" ? "Rendering…" : "Retry delivery (no new payment)"}
                </button>
              )}
            </div>
          )}
          <dl className="nxd-quote-rows">
            <div>
              <dt>Paid</dt>
              <dd>
                {order.amount} RLUSD to {order.merchant}
              </dd>
            </div>
            <div>
              <dt>Transaction</dt>
              <dd>
                <TxLink hash={order.payment.txHash} url={order.payment.explorerUrl} />
              </dd>
            </div>
            <div>
              <dt>AP4M claim</dt>
              <dd>
                <ClaimLink id={order.payment.claimId} txUrl={order.payment.explorerUrl} />
              </dd>
            </div>
            <div>
              <dt>Channel</dt>
              <dd>{order.payment.mode === "live" ? <ChannelLink id={order.payment.channelId} /> : <span className="nxd-mono">{short(order.payment.channelId)}</span>}</dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>{order.payment.mode === "live" ? "XRPL EVM Testnet (chain 1449000)" : "Demo mode (simulated)"}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

export function CardStep({ data, act, busy, go, focus }: StepProps & { focus: "gpu-small" | "gpu-large" }) {
  const { data: w } = useWallet();
  const f = data.financing;
  const item = data.items.find((i) => i.id === focus)!;
  const live = item.rail === "ap4m";
  const spentPct = Number(f.budget) ? (Number(f.used) / Number(f.budget)) * 100 : 0;
  const latest = data.orders.find((o) => o.itemId === focus && o.status !== "reserved");
  const paying = busy === "card";

  return (
    <div className="nxd-stack">
      <div className="nxd-cardrow">
        {live ? (
          <div className="nxd-vcard nxd-wallet-vis">
            <div className="nxd-vcard-top">
              <span>NEXXEN · agent wallet</span>
              <Tag kind="real">Live</Tag>
            </div>
            <div className="nxd-vcard-bal">
              <small>RLUSD available</small>
              <b>{w ? Number(w.balance.availableRlusd).toFixed(3) : "…"} RLUSD</b>
            </div>
            <div className="nxd-vcard-foot">
              <span>Limit {data.policy.cardLimit} per purchase</span>
              <span className="nxd-mono">{short(data.agent)}</span>
            </div>
          </div>
        ) : (
          <div className="nxd-vcard">
            <div className="nxd-vcard-top">
              <span>NEXXEN · agent card</span>
              <svg width="34" height="20" viewBox="0 0 24 14" aria-hidden>
                <circle cx="7" cy="7" r="7" fill="#eb001b" />
                <circle cx="17" cy="7" r="7" fill="#f79e1b" fillOpacity="0.9" />
              </svg>
            </div>
            <div className="nxd-vcard-bal">
              <small>Card budget from the demo financing</small>
              <b>{f.remaining} RLUSD</b>
            </div>
            <div className="nxd-vcard-bar">
              <span style={{ width: `${Math.min(100, spentPct)}%` }} />
            </div>
            <div className="nxd-vcard-foot">
              <span>Limit {data.policy.cardLimit} per purchase</span>
              <span>Simulated card</span>
            </div>
          </div>
        )}
        <div className="nxd-offers">
          <span className="nxd-eyebrow">What the agent wants to buy</span>
          {data.items.map((i) => {
            const over = Number(i.amount) > Number(data.policy.cardLimit);
            return (
              <div key={i.id} className={`nxd-offer ${i.id === focus ? "focus" : "muted"}`}>
                <div>
                  <b>{i.name}</b>
                  <small>
                    {i.merchant} · {over ? `over the ${data.policy.cardLimit} RLUSD limit` : "within the limit"}
                  </small>
                </div>
                <span className="nxd-offer-price">{i.amount}</span>
                <button
                  className={`nxd-btn ${i.id === focus ? "nxd-btn-primary" : ""}`}
                  disabled={!!busy || i.id !== focus}
                  onClick={() => act({ action: "card", itemId: i.id })}
                >
                  {paying && i.id === focus ? "Paying…" : "Agent buys"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {!live && !f.accepted && (
        <p className="nxd-warn">
          The card has no budget yet.{" "}
          <button className="nxd-link" onClick={() => go(4)}>
            Accept the demo financing quote first
          </button>
        </p>
      )}
      {paying && live && (
        <div className="nxd-paying">
          <span className="nxd-spin" />
          Paying the seller over AP4M on testnet, then the seller renders the image… (up to a minute)
        </div>
      )}
      {latest && !paying && <OrderResult order={latest} act={act} busy={busy} />}
      {latest?.status === "approved" && live && !paying && (
        <div className="nxd-row nxd-end">
          <button className="nxd-btn nxd-btn-primary" onClick={() => go(6)}>
            Now try something bigger →
          </button>
        </div>
      )}
      {latest?.status === "blocked" && (
        <div className="nxd-row nxd-end">
          <span className="nxd-dim">Nothing was paid. The request waits for the owner.</span>
          <button className="nxd-btn nxd-btn-primary" onClick={() => go(7)}>
            Ask the owner on {data.policy.ownerDevice} →
          </button>
        </div>
      )}
      <p className="nxd-note">
        {live ? (
          <>
            <Tag kind="real">Real · testnet</Tag> A real RLUSD payment from the agent wallet to our PixelForge seller agent, over Mastercard AP4M.
          </>
        ) : (
          <>
            <Tag kind="sim">Simulated</Tag> The card and the GPU merchant are simulated. The limit check is real and runs before any payment.
          </>
        )}
      </p>
    </div>
  );
}

/* 7 ─ Owner signs one exception */
declare global {
  interface Window {
    ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
  }
}

const toHex = (s: string) => "0x" + Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");

export function ApprovalStep({ data, act, busy, go }: StepProps) {
  const blocked = data.orders.find((o) => o.status === "blocked");
  const approvals = data.approvals.filter((a) => a.orderId === blocked?.id);
  const consumed = approvals.find((a) => a.status === "consumed");
  const pending = approvals.find((a) => a.status === "pending");
  const left = useCountdown(pending?.expiresAt);
  const [pasted, setPasted] = useState("");
  const [walletErr, setWalletErr] = useState<string | null>(null);
  const owner = data.policy.owner;

  if (!blocked) {
    return (
      <div className="nxd-empty">
        No blocked request yet.{" "}
        <button className="nxd-link" onClick={() => go(6)}>
          Try the larger purchase first
        </button>
      </div>
    );
  }

  const signWithWallet = async (a: Approval) => {
    setWalletErr(null);
    if (!window.ethereum) return setWalletErr("No browser wallet found. Connect the Ledger through MetaMask or Rabby, or paste a signature below.");
    try {
      const [account] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const signature = (await window.ethereum.request({ method: "personal_sign", params: [toHex(a.message), account] })) as string;
      await act({ action: "submit", approvalId: a.id, signature, via: "wallet" });
    } catch (e) {
      setWalletErr((e as Error).message || "Signing was cancelled.");
    }
  };

  return (
    <div className="nxd-stack">
      {!owner && (
        <p className="nxd-warn">
          No owner key is configured, so no signature can be trusted. Set <code>OWNER_APPROVER_ADDRESS</code> (the {data.policy.ownerDevice} address) in
          .env.local and restart.
        </p>
      )}
      <div className="nxd-approval-req">
        <StatusPill status="blocked" />
        <b>
          {blocked.item} · {blocked.amount} RLUSD
        </b>
        <span className="nxd-dim">request {blocked.id.slice(0, 8)} · over the {data.policy.cardLimit} RLUSD limit</span>
      </div>

      {consumed ? (
        <div className="nxd-evidence">
          <div className="nxd-evidence-head">
            <span className="nxd-ok-big">✓</span>
            <div>
              <b>Owner approved one exception</b>
              <small>Signature checked on the server against the owner’s key</small>
            </div>
            <Tag kind="verified">Signature verified</Tag>
          </div>
          <dl className="nxd-quote-rows">
            <div>
              <dt>Signed by</dt>
              <dd className="nxd-mono">{consumed.signer}</dd>
            </div>
            <div>
              <dt>Owner key</dt>
              <dd>
                {data.policy.ownerDevice} · {consumed.signer === owner ? "matches OWNER_APPROVER_ADDRESS" : "mismatch"}
              </dd>
            </div>
            <div>
              <dt>Scope</dt>
              <dd>This request only, once, before {utc(consumed.expiresAt)}</dd>
            </div>
            <div>
              <dt>Signed</dt>
              <dd>
                {consumed.verifiedAt && utc(consumed.verifiedAt)} · via {consumed.via === "wallet" ? "browser wallet" : "pasted signature"}
              </dd>
            </div>
            <div>
              <dt>Signature</dt>
              <dd className="nxd-mono">{short(consumed.signature)}</dd>
            </div>
          </dl>
          <details>
            <summary>Exact message the owner signed</summary>
            <pre className="nxd-msg">{consumed.message}</pre>
          </details>
          <div className="nxd-row nxd-end">
            <button className="nxd-btn nxd-btn-primary" onClick={() => go(8)}>
              See the reservation →
            </button>
          </div>
        </div>
      ) : pending ? (
        <div className="nxd-sign">
          <div className="nxd-sign-msg">
            <span className="nxd-eyebrow">What the owner reviews on {data.policy.ownerDevice}</span>
            <pre className="nxd-msg">{pending.message}</pre>
          </div>
          <div className="nxd-sign-side">
            <div>
              <span className="nxd-eyebrow">Must be signed by</span>
              <b className="nxd-mono">{owner ? short(owner) : "not configured"}</b>
            </div>
            <div>
              <span className="nxd-eyebrow">Expires in</span>
              <b>{left?.expired ? "expired" : left?.label}</b>
            </div>
            <button className="nxd-btn nxd-btn-primary" disabled={!owner || !!busy || left?.expired} onClick={() => signWithWallet(pending)}>
              {busy === "submit" ? "Verifying…" : `Sign on ${data.policy.ownerDevice}`}
            </button>
            <small className="nxd-dim">Uses the browser wallet that has the Ledger connected (personal_sign).</small>
            <details>
              <summary>Paste a signature instead</summary>
              <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="0x… (65-byte signature)" rows={3} />
              <button
                className="nxd-btn"
                disabled={!owner || !pasted.trim() || !!busy}
                onClick={() => act({ action: "submit", approvalId: pending.id, signature: pasted.trim(), via: "pasted" })}
              >
                Verify signature
              </button>
            </details>
            {walletErr && <p className="nxd-error">{walletErr}</p>}
            <button className="nxd-link nxd-danger" disabled={!!busy} onClick={() => act({ action: "deny", approvalId: pending.id })}>
              Owner denies
            </button>
          </div>
        </div>
      ) : (
        <div className="nxd-row">
          <button className="nxd-btn nxd-btn-primary" disabled={!!busy} onClick={() => act({ action: "prepare", orderId: blocked.id })}>
            {busy === "prepare" ? "Preparing…" : "Prepare the approval request"}
          </button>
          {approvals.some((a) => a.status === "denied") && <span className="nxd-dim">The owner denied the last request; the purchase stayed blocked.</span>}
        </div>
      )}
    </div>
  );
}

/* 8 ─ Reservation and audit history */
export function AuditStep({ data }: StepProps) {
  const byId = useMemo(() => new Map(data.orders.map((o) => [o.id, o])), [data.orders]);
  const reservation = data.orders.find((o) => o.status === "reserved");
  return (
    <div className="nxd-stack">
      {reservation ? (
        <div className="nxd-link-pair">
          <div className="nxd-link-card">
            <StatusPill status="blocked" />
            <b>Original request {reservation.fromOrderId?.slice(0, 8)}</b>
            <small>Stays blocked forever: the audit history is never rewritten</small>
          </div>
          <div className="nxd-link-mid">signed exception →</div>
          <div className="nxd-link-card">
            <StatusPill status="reserved" />
            <b>
              Reservation {reservation.id.slice(0, 8)} · {reservation.amount} RLUSD
            </b>
            <small>Consumes card budget once · approval {reservation.approvalId?.slice(0, 8)}</small>
          </div>
        </div>
      ) : (
        <p className="nxd-empty">No reservation yet. It appears after the owner signs in step 7.</p>
      )}
      <div className="nxd-cols">
        <div>
          <span className="nxd-eyebrow">Card requests this run</span>
          <table className="nxd-table">
            <tbody>
              {data.orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <StatusPill status={o.status} />
                  </td>
                  <td>
                    {o.item}
                    <small>{o.fromOrderId ? `from ${byId.get(o.fromOrderId)?.id.slice(0, 8)}` : o.id.slice(0, 8)}</small>
                  </td>
                  <td className="nxd-num">{o.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="nxd-budget">
            Card budget {data.financing.budget} · used {data.financing.used} · remaining <b>{data.financing.remaining} RLUSD</b>
          </div>
        </div>
        <div>
          <span className="nxd-eyebrow">Audit history (append-only)</span>
          <ol className="nxd-audit">
            {data.audit.map((a, i) => (
              <li key={i}>
                <time>{new Date(a.at).toLocaleTimeString([], { hour12: false })}</time>
                <span className={`nxd-kind nxd-kind-${a.kind.toLowerCase()}`}>{a.kind.replace("_", " ")}</span>
                <span>{a.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

/* 9 ─ Proof */
export function ProofStep({ proof, running, verify }: { proof: Proof | null; running: boolean; verify: () => void }) {
  const { data: w } = useWallet();
  return (
    <div className="nxd-stack">
      <div className="nxd-proof-head">
        <div>
          <span className="nxd-eyebrow">AP4M testnet RLUSD payment</span>
          <b>{proof ? `${proof.claim.amountRlusd} RLUSD settled to the seller's payout wallet` : "Settled claim receipt"}</b>
          {proof && <small>Settled {utc(proof.claim.settledAt)} · payout block {proof.claim.payoutBlock.toLocaleString()}</small>}
        </div>
        <button className="nxd-btn nxd-btn-primary" onClick={verify} disabled={running}>
          {running ? "Verifying on-chain… (~15 s)" : proof ? "Verify again now" : "Verify now"}
        </button>
      </div>

      {proof && (
        <div className={`nxd-proof ${proof.verified ? "ok" : "bad"}`}>
          <div className="nxd-proof-status">
            <span className="nxd-ok-big">{proof.verified ? "✓" : "✕"}</span>
            <div>
              <b>{proof.verified ? "Verified" : "Not verified"}</b>
              <small>
                via {proof.provider.name} · {proof.sdkVersion} · {utc(proof.checkedAt)} · {(proof.durationMs / 1000).toFixed(1)} s
              </small>
            </div>
            {proof.provider.quicknode ? <Tag kind="verified">Quicknode</Tag> : <Tag kind="pending">Quicknode not configured</Tag>}
          </div>
          {proof.error && <p className="nxd-error">{proof.error}</p>}
          <ul className="nxd-checks">
            {proof.checks.map((c) => (
              <li key={c.label} className={c.ok ? "ok" : "no"}>
                <i>{c.ok ? "✓" : "✕"}</i>
                <span>{c.label}</span>
              </li>
            ))}
          </ul>
          <dl className="nxd-quote-rows">
            <div>
              <dt>Claim</dt>
              <dd>
                <a href={proof.claim.receiptUrl} target="_blank" rel="noreferrer" className="nxd-mono" title="Public AP4M claim receipt">
                  {short(proof.claim.claimId)} ↗
                </a>
              </dd>
            </div>
            <div>
              <dt>Channel</dt>
              <dd>
                <ChannelLink id={proof.claim.channelId} />
              </dd>
            </div>
            <div>
              <dt>Payout wallet</dt>
              <dd className="nxd-mono">{proof.claim.payout}</dd>
            </div>
            <div>
              <dt>Payout tx</dt>
              <dd>
                <a href={proof.claim.payoutTxUrl} target="_blank" rel="noreferrer" className="nxd-mono">
                  {short(proof.claim.payoutTx)} ↗
                </a>
              </dd>
            </div>
            <div>
              <dt>Settlement tx</dt>
              <dd>
                <a href={proof.claim.settlementTxUrl} target="_blank" rel="noreferrer" className="nxd-mono">
                  {short(proof.claim.settlementTx)} ↗
                </a>
              </dd>
            </div>
            <div>
              <dt>Public receipt</dt>
              <dd>
                <a href={proof.claim.receiptUrl} target="_blank" rel="noreferrer">
                  hackathon.ap4m.build receipt ↗
                </a>
              </dd>
            </div>
          </dl>
          {!proof.provider.quicknode && (
            <p className="nxd-note">To verify through Quicknode, set QUICKNODE_RPC_URL to your Quicknode XRPL EVM Testnet endpoint and verify again.</p>
          )}
        </div>
      )}
      {w && (
        <p className="nxd-note">
          <Tag kind="real">Live</Tag> This agent has made {w.report.settledPayments} AP4M payments ({fmt(w.report.settledRlusd, 4)} RLUSD), each a VoucherRedeemed
          transaction on XRPL EVM Testnet.
        </p>
      )}
    </div>
  );
}

/* 10 ─ What's real */
export function HonestStep({ data, proof }: StepProps & { proof: Proof | null }) {
  const { data: w } = useWallet();
  const signed = data.approvals.find((a) => a.status === "consumed");
  const rows: { what: string; tag: React.ReactNode; detail: string }[] = [
    {
      what: "Agent payments in RLUSD over Mastercard AP4M",
      tag: <Tag kind="real">Real · testnet</Tag>,
      detail: `${w?.report.settledPayments ?? "—"} payments signed by the agent and redeemed on XRPL EVM Testnet`,
    },
    {
      what: "Settlement receipt verification",
      tag: proof?.verified ? <Tag kind="verified">Verified</Tag> : <Tag kind="pending">Not run</Tag>,
      detail: proof?.verified ? `AP4M SDK checks via ${proof.provider.name}, ${utc(proof.checkedAt)}` : "Run it in step 9",
    },
    {
      what: `Owner exception signed on ${data.policy.ownerDevice}`,
      tag: signed ? <Tag kind="verified">Signature verified</Tag> : <Tag kind="pending">Not signed this run</Tag>,
      detail: signed ? `Signer ${short(signed.signer)} matches the owner's key` : "Ready: approval request and server-side signature check",
    },
    { what: "Spending limits and blocking", tag: <Tag kind="real">Real · app logic</Tag>, detail: "Checked on the server before any payment" },
    {
      what: "Marqeta card authorization",
      tag: <Tag kind="sandbox">Sandbox-tested</Tag>,
      detail: "Separate test, Oct 24: $1.00 authorization 0000 / PENDING on Mastercard's simulated network",
    },
    { what: "Stablecoin-to-card funding", tag: <Tag kind="sim">Simulated</Tag>, detail: "No RLUSD is converted or sent to a card issuer" },
    { what: "GPU purchase and delivery", tag: <Tag kind="sim">Simulated</Tag>, detail: "CloudGPU is a fictional merchant" },
    { what: "Financing", tag: <Tag kind="demo">Demo quote</Tag>, detail: "Not a real loan; no funds or debt are created" },
  ];
  return (
    <div className="nxd-stack">
      <table className="nxd-table nxd-honest">
        <tbody>
          {rows.map((r) => (
            <tr key={r.what}>
              <td>{r.what}</td>
              <td>{r.tag}</td>
              <td className="nxd-dim">{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <TransactionDetails data={data} proof={proof} />
      <p className="nxd-closing">Agent spending. Human control.</p>
    </div>
  );
}

/** Every transaction and decision in this demo, with its proof. */
function TransactionDetails({ data, proof }: { data: StoryData; proof: Proof | null }) {
  const { data: w } = useWallet();
  type Row = { at: string; what: string; amount: string; how: React.ReactNode; status: React.ReactNode; proof: React.ReactNode };
  const rows: Row[] = [];

  for (const o of data.orders) {
    rows.push({
      at: o.at,
      what: `${o.item} · ${o.merchant}`,
      amount: `${o.amount} RLUSD`,
      how: o.rail === "ap4m" ? <Tag kind="real">AP4M</Tag> : <Tag kind="sim">Card</Tag>,
      status: <StatusPill status={o.status} />,
      proof: o.payment ? (
        <TxLink hash={o.payment.txHash} url={o.payment.explorerUrl} />
      ) : o.status === "reserved" ? (
        `Owner exception ${o.approvalId?.slice(0, 8)}`
      ) : o.status === "blocked" ? (
        "Stopped before payment"
      ) : (
        "Simulated authorization"
      ),
    });
  }
  for (const a of data.approvals.filter((x) => x.status === "consumed")) {
    rows.push({
      at: a.verifiedAt ?? a.at,
      what: `Owner signature on ${data.policy.ownerDevice}`,
      amount: "—",
      how: <Tag kind="verified">Signature</Tag>,
      status: <span className="nxd-pill nxd-pill-approved">Verified</span>,
      proof: <span className="nxd-mono">{`${short(a.signer)} · sig ${short(a.signature)}`}</span>,
    });
  }
  const fin = data.financing.accepted;
  if (fin?.acceptedAt) {
    rows.push({
      at: fin.acceptedAt,
      what: `Demo financing · ${fin.duration} ${fin.unit}`,
      amount: `${fin.amount} RLUSD → repay ${Number(fin.total).toFixed(4)}`,
      how: <Tag kind="demo">Demo</Tag>,
      status: <span className="nxd-pill nxd-pill-declined">Not a loan</span>,
      proof: "No funds moved",
    });
  }
  if (proof?.verified) {
    rows.push({
      at: proof.claim.settledAt,
      what: "AP4M settlement payout to the seller",
      amount: `${proof.claim.amountRlusd} RLUSD`,
      how: <Tag kind="real">AP4M</Tag>,
      status: <span className="nxd-pill nxd-pill-approved">Verified</span>,
      proof: (
        <>
          <TxLink hash={proof.claim.payoutTx} url={proof.claim.payoutTxUrl} /> · settlement <TxLink hash={proof.claim.settlementTx} url={proof.claim.settlementTxUrl} />
        </>
      ),
    });
  }
  rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return (
    <>
      <div className="nxd-section">
        <span className="nxd-eyebrow">Transaction details · this demo</span>
        <table className="nxd-table nxd-tx">
          <thead>
            <tr>
              <th>Time (UTC)</th>
              <th>What</th>
              <th>Amount</th>
              <th>Rail</th>
              <th>Status</th>
              <th>Proof</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="nxd-mono">{utc(r.at)}</td>
                <td>{r.what}</td>
                <td className="nxd-num">{r.amount}</td>
                <td>{r.how}</td>
                <td>{r.status}</td>
                <td>{r.proof}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {w && w.history.length > 0 && (
        <div className="nxd-section">
          <span className="nxd-eyebrow">
            All live AP4M payments by this agent · {w.history.length} payments · {fmt(w.report.settledRlusd, 4)} RLUSD
          </span>
          <table className="nxd-table nxd-tx">
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>Service</th>
                <th>Seller</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {w.history.map((h) => (
                <tr key={h.txHash}>
                  <td className="nxd-mono">{utc(h.at)}</td>
                  <td>{h.service}</td>
                  <td>{h.seller}</td>
                  <td className="nxd-num">{h.amountRlusd} RLUSD</td>
                  <td>{h.status}</td>
                  <td>
                    <TxLink hash={h.txHash} url={h.explorerUrl} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
