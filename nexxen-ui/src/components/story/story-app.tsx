"use client";
import { ActivityPanel } from "@/components/activity-panel";
import { WalletHeader } from "@/components/wallet-bar";
import { useThemeModePreference } from "@openuidev/react-ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ApprovalStep,
  AuditStep,
  BorrowStep,
  CardStep,
  HonestStep,
  JobStep,
  LimitsStep,
  ProofStep,
  QuoteStep,
} from "./steps";
import { useProof, useStory } from "./use-story";
import "./story.css";

/** The ten hackathon demo steps, in presenter order. */
const STEPS = [
  { short: "You set limits", title: "NEXXEN lets your AI agent spend money, but only within the limits you set." },
  { short: "The paid job", title: "Your agent has a paid job, but needs computing power first." },
  { short: "Borrow", title: "Borrow what it needs and pick how long to repay: hours or days." },
  { short: "Repayment quote", title: "Here’s the repayment quote. It’s demo financing, not a real loan." },
  { short: "Small purchase", title: "A small purchase within budget: the agent just pays, for real." },
  { short: "Big purchase", title: "A bigger purchase: NEXXEN stops it and asks you first." },
  { short: "You approve", title: "You approve that one purchase by signing on your Ledger Flex." },
  { short: "Reserved", title: "The purchase is reserved. The blocked attempt stays on record." },
  { short: "Proof", title: "Proof: the RLUSD payment settled on testnet, checked on-chain." },
  { short: "What’s real", title: "What’s real, what’s sandbox-tested, what’s simulated, and every transaction." },
];

const fromHash = () => {
  const n = Number(window.location.hash.replace("#", ""));
  return n >= 1 && n <= STEPS.length ? n : 1;
};

export default function StoryApp() {
  const { setPreference, mode } = useThemeModePreference();
  const { data, error, busy, act, refresh, clearError } = useStory();
  const proof = useProof();
  const [step, setStep] = useState(fromHash);

  const go = useCallback((n: number) => {
    const next = Math.min(Math.max(1, n), STEPS.length);
    setStep(next);
    history.replaceState(null, "", `#${next}`);
  }, []);

  useEffect(() => {
    const onHash = () => setStep(fromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight") go(step + 1);
      if (e.key === "ArrowLeft") go(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, go]);

  // Re-read state on every step so changes made elsewhere (another tab, the API) show up.
  useEffect(() => {
    clearError();
    refresh();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (n: number) => {
    if (!data) return false;
    const s = data;
    return [
      true,
      true,
      s.quotes.length > 0,
      !!s.financing.accepted,
      s.orders.some((o) => o.status === "approved"),
      s.orders.some((o) => o.status === "blocked"),
      s.approvals.some((a) => a.status === "consumed"),
      s.orders.some((o) => o.status === "reserved"),
      !!proof.proof?.verified,
      false,
    ][n - 1];
  };

  const props = data ? { data, act, busy, go } : null;
  const current = STEPS[step - 1];

  return (
    <div className={`nxd nxd-${mode}`}>
      <WalletHeader mode={mode} />
      <div className="nxd-body">
        <nav className="nxd-rail">
          <Link href="/" className="nxd-brand">
            NEXXEN
            <small>Agent spending. Human control.</small>
          </Link>
          <ol>
            {STEPS.map((s, i) => (
              <li key={s.short}>
                <button className={`${step === i + 1 ? "on" : ""} ${done(i + 1) && step !== i + 1 ? "done" : ""}`} onClick={() => go(i + 1)}>
                  <span>{done(i + 1) && step !== i + 1 ? "✓" : i + 1}</span>
                  {s.short}
                </button>
              </li>
            ))}
          </ol>
          <div className="nxd-rail-foot">
            <button className="nxd-link" disabled={!!busy} onClick={() => act({ action: "reset" }).then(() => go(1))}>
              Reset rehearsal{data ? ` (run ${data.run})` : ""}
            </button>
            <button className="nxd-link" onClick={() => setPreference(mode === "dark" ? "light" : "dark")}>
              {mode === "dark" ? "Light" : "Dark"} mode
            </button>
            <Link className="nxd-link" href="/">
              ← Agent chat &amp; AI tools
            </Link>
          </div>
        </nav>

        <main className="nxd-stage">
          <div className="nxd-progress">
            <span style={{ width: `${(step / STEPS.length) * 100}%` }} />
          </div>
          <div className="nxd-kicker">
            Step {step} of {STEPS.length} · {current.short}
          </div>
          <h1 className="nxd-title">{current.title}</h1>
          {error && (
            <p className="nxd-error" role="alert">
              {error}
            </p>
          )}
          <section className="nxd-panel" key={step}>
            {!props ? (
              <p className="nxd-dim">Loading…</p>
            ) : step === 1 ? (
              <LimitsStep {...props} />
            ) : step === 2 ? (
              <JobStep {...props} />
            ) : step === 3 ? (
              <BorrowStep {...props} />
            ) : step === 4 ? (
              <QuoteStep {...props} />
            ) : step === 5 ? (
              <CardStep {...props} focus="gpu-small" />
            ) : step === 6 ? (
              <CardStep {...props} focus="gpu-large" />
            ) : step === 7 ? (
              <ApprovalStep {...props} />
            ) : step === 8 ? (
              <AuditStep {...props} />
            ) : step === 9 ? (
              <ProofStep {...proof} />
            ) : (
              <HonestStep {...props} proof={proof.proof} />
            )}
          </section>
          <footer className="nxd-nav">
            <button className="nxd-btn" disabled={step === 1} onClick={() => go(step - 1)}>
              ← Back
            </button>
            <span className="nxd-dim">← → keys</span>
            <button className="nxd-btn nxd-btn-primary" disabled={step === STEPS.length} onClick={() => go(step + 1)}>
              Next: {STEPS[step]?.short ?? "done"} →
            </button>
          </footer>
        </main>

        {/* The existing live flow: every AP4M payment step as it happens on the Mastercard settlement layer. */}
        <ActivityPanel />
      </div>
    </div>
  );
}
