"use client";
import { useWallet, type FeedEvent } from "@/components/wallet-bar";
import { useEffect, useRef } from "react";

const short = (hex: string) => `${hex.slice(0, 6)}…${hex.slice(-4)}`;
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

const KIND_CLASS: Record<FeedEvent["kind"], string> = {
  "402": "k-request",
  VEREV: "k-decision",
  POLICY: "k-decision",
  VOUCHER: "k-money",
  SETTLED: "k-proof",
  PAYOUT: "k-proof",
  DECLINE: "k-decline",
  ERROR: "k-decline",
};

/** Right-hand panel: agent report (real numbers only) above the live payment feed. */
export function ActivityPanel() {
  const { data } = useWallet();
  const feedEnd = useRef<HTMLLIElement>(null);
  const newest = data?.events[0]?.at;

  // The feed reads top to bottom in time order; follow the newest line.
  useEffect(() => {
    feedEnd.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [newest]);

  if (!data) return <aside className="nxa">Loading activity…</aside>;
  const { wallet, report, events } = data;

  return (
    <aside className="nxa">
      <section className="nxa-card">
        <div className="nxa-head">
          <span className="nxa-eyebrow">Agent report</span>
          <span className={`nxa-pill ${wallet.mode}`}>{wallet.mode === "live" ? "Live · XRPL EVM" : "Demo"}</span>
        </div>
        <div className="nxa-agent">
          NEXXEN agent · <span className="nxa-mono">{short(wallet.address)}</span>
        </div>

        <div className="nxa-score">
          {report.score === null ? (
            <>
              <div className="nxa-score-ring empty">—</div>
              <div className="nxa-score-copy">
                <b>Credit score</b>
                <span>Appears once VEREV scores this agent</span>
              </div>
            </>
          ) : (
            <>
              <div className="nxa-score-ring">{report.score}</div>
              <div className="nxa-score-copy">
                <b>of 1000</b>
                <span>VEREV credit score</span>
              </div>
            </>
          )}
        </div>

        <div className="nxa-grid">
          <div>
            <span>Funded limit</span>
            <b>
              {Number(report.fundedLimitRlusd).toLocaleString()} <small>RLUSD</small>
            </b>
          </div>
          <div>
            <span>Settled payments</span>
            <b>
              {report.settledPayments} <small>{Number(report.settledRlusd).toLocaleString(undefined, { maximumFractionDigits: 4 })} RLUSD</small>
            </b>
          </div>
          <div>
            <span>Within budget</span>
            <b>
              {report.withinBudget} <small>in {report.blocksApproved} approved block{report.blocksApproved === 1 ? "" : "s"}</small>
            </b>
          </div>
          <div>
            <span>Declines</span>
            <b>{report.declines}</b>
          </div>
        </div>

        <div className="nxa-proof">
          <div>
            <b>Built only from on-chain payments</b>
            <span>
              Every settled payment is a VoucherRedeemed tx · blocks decided by {report.blockDecider}
              {report.blockDecider === "POLICY" ? " (VEREV client pending)" : ""}
            </span>
          </div>
          {report.lastTx &&
            (report.lastTxUrl ? (
              <a href={report.lastTxUrl} target="_blank" rel="noreferrer" className="nxa-mono">
                {short(report.lastTx)} ↗
              </a>
            ) : (
              <span className="nxa-mono">{short(report.lastTx)}</span>
            ))}
        </div>
      </section>

      <section className="nxa-card nxa-feed-card">
        <div className="nxa-head">
          <span className="nxa-eyebrow">Live feed</span>
          <span className="nxa-legend">
            <i className="k-request" />
            request <i className="k-decision" />
            decision <i className="k-money" />
            money <i className="k-proof" />
            proof
          </span>
        </div>
        {events.length === 0 ? (
          <p className="nxa-empty">Buy a tool and every step of the payment shows up here.</p>
        ) : (
          <ol className="nxa-feed">
            {[...events].reverse().map((e, i, all) => (
              <li
                key={`${e.at}-${i}`}
                ref={i === all.length - 1 ? feedEnd : undefined}
                className={i === all.length - 1 ? "fresh" : undefined}
              >
                <time>{clock(e.at)}</time>
                <span className={`nxa-kind ${KIND_CLASS[e.kind]}`}>{e.kind}</span>
                <span className="nxa-text">
                  {e.text}
                  {e.explorerUrl && (
                    <a href={e.explorerUrl} target="_blank" rel="noreferrer">
                      {" "}
                      ↗
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}
