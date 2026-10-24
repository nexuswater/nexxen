"use client";
import { useNav, useThread } from "@openuidev/react-ui";
import { useEffect, useRef, useState, type ReactNode } from "react";

type Service = {
  id: string;
  name: string;
  seller: string;
  description: string;
  input: string;
  listedPriceRlusd: string;
  priceRlusd?: string;
  available: boolean | null;
};

const ICONS: Record<string, ReactNode> = {
  "summarize-url": (
    <path d="M5 4h10l4 4v12H5zM14 4v5h5M8 12h8M8 15h8M8 18h5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  translate: (
    <path d="M4 5h9M8.5 3v2M6 5c1 3 3 5.5 6 7M11 5c-1 3.5-3.5 6.5-7 8M13 21l4-10 4 10M14.5 17.5h5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  "generate-image": (
    <path d="M4 5h16v14H4zM4 15l4.5-4.5 4 4 2.5-2.5L20 17M15.5 9.5h.01" strokeLinecap="round" strokeLinejoin="round" />
  ),
  sentiment: (
    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5s1.2 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01" strokeLinecap="round" strokeLinejoin="round" />
  ),
};

const ACCENTS: Record<string, string> = {
  "summarize-url": "#3b82f6",
  translate: "#10b981",
  "generate-image": "#a855f7",
  sentiment: "#f59e0b",
};

const PLACEHOLDERS: Record<string, string> = {
  "summarize-url": "https://xrpl.org",
  translate: "Hello! Our new coffee shop opens on Monday.",
  "generate-image": "A neon-lit robot buying coffee with a credit card, isometric 3D",
  sentiment: "The delivery was late but the food was absolutely amazing.",
};

const LANGUAGES = ["Hindi", "Spanish", "French", "German", "Japanese", "Arabic", "Portuguese", "Chinese"];

export function useServices() {
  const [services, setServices] = useState<Service[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/services", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => alive && setServices(j.services ?? []))
      .catch(() => alive && setServices([]));
    return () => {
      alive = false;
    };
  }, []);
  return services;
}

/** Custom AI tools store: fixed, polished cards; Buy opens an input dialog and hands the order to the agent. */
export function ServiceStore({ compact = false }: { compact?: boolean }) {
  const services = useServices();
  const processMessage = useThread((s) => s.processMessage);
  const isRunning = useThread((s) => s.isRunning);
  const nav = useNav();
  const [picked, setPicked] = useState<Service | null>(null);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("Hindi");
  const dialog = useRef<HTMLDialogElement>(null);

  const open = (s: Service) => {
    setPicked(s);
    setInput("");
    dialog.current?.showModal();
  };

  const buy = () => {
    if (!picked || !input.trim() || isRunning) return;
    const lang = picked.id === "translate" ? ` Target language: ${language}.` : "";
    dialog.current?.close();
    if (nav.path !== undefined) nav.navigate(undefined);
    processMessage({
      role: "user",
      content: `Buy ${picked.name} (${picked.id}).${lang} Input: ${input.trim()}`,
    });
  };

  return (
    <div className={`nxs ${compact ? "nxs-compact" : ""}`}>
      <div className="nxs-grid">
        {(services ?? Array.from({ length: 4 }, () => null)).map((s, i) =>
          s ? (
            <div key={s.id} className="nxs-card" style={{ ["--accent" as string]: ACCENTS[s.id] ?? "#eb001b" }}>
              <div className="nxs-card-top">
                <div className="nxs-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    {ICONS[s.id]}
                  </svg>
                </div>
                <div className="nxs-price">
                  {s.priceRlusd ?? s.listedPriceRlusd}
                  <span>RLUSD</span>
                </div>
              </div>
              <div className="nxs-name">{s.name}</div>
              <div className="nxs-seller">
                by {s.seller}
                {s.available === true && <span className="nxs-live">● live price</span>}
              </div>
              <p className="nxs-desc">{s.description}</p>
              <button className="nxs-buy" disabled={isRunning} onClick={() => open(s)}>
                {isRunning ? "Agent is busy…" : "Buy"}
              </button>
            </div>
          ) : (
            <div key={i} className="nxs-card nxs-skeleton" />
          ),
        )}
      </div>

      <dialog ref={dialog} className="nx-dialog nxs-dialog" onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        {picked && (
          <form
            className="nx-dialog-body"
            onSubmit={(e) => {
              e.preventDefault();
              buy();
            }}
          >
            <div className="nxs-dialog-head" style={{ ["--accent" as string]: ACCENTS[picked.id] ?? "#eb001b" }}>
              <div className="nxs-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  {ICONS[picked.id]}
                </svg>
              </div>
              <div>
                <div className="nx-title">{picked.name}</div>
                <div className="nx-muted">
                  by {picked.seller} · {picked.priceRlusd ?? picked.listedPriceRlusd} RLUSD per run
                </div>
              </div>
            </div>
            <label className="nxs-label">{picked.input}</label>
            {picked.id === "summarize-url" ? (
              <input
                className="nxs-input"
                autoFocus
                type="url"
                required
                placeholder={PLACEHOLDERS[picked.id]}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            ) : (
              <textarea
                className="nxs-input"
                autoFocus
                required
                rows={4}
                placeholder={PLACEHOLDERS[picked.id]}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            )}
            {picked.id === "translate" && (
              <div className="nxs-langs">
                {LANGUAGES.map((l) => (
                  <button
                    type="button"
                    key={l}
                    className={`nxs-chip ${language === l ? "on" : ""}`}
                    onClick={() => setLanguage(l)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
            <div className="nxs-note">
              Your agent pays {picked.priceRlusd ?? picked.listedPriceRlusd} RLUSD with an AP4M voucher; the seller runs the
              job only after the payment is redeemed.
            </div>
            <div className="nxs-actions">
              <button type="button" className="nx-btn" onClick={() => dialog.current?.close()}>
                Cancel
              </button>
              <button type="submit" className="nxs-buy nxs-pay" disabled={!input.trim() || isRunning}>
                Pay {picked.priceRlusd ?? picked.listedPriceRlusd} RLUSD &amp; run
              </button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}

/** Home screen: hero + store, replacing OpenUI's default welcome. */
export function StoreWelcome() {
  return (
    <div className="nxs-welcome">
      <div className="nxs-hero">
        <h1>Pay-per-use AI tools</h1>
        <p>Pick a tool. Your agent pays the seller in RLUSD with Mastercard Agent Pay for Machines, then delivers the result.</p>
      </div>
      <ServiceStore />
    </div>
  );
}

/** Full-page store (sidebar route). */
export function StorePage() {
  const nav = useNav();
  return (
    <div className="nx-page">
      <header className="nx-header">
        <div>
          <h1>AI tools</h1>
          <p className="nx-muted">Paid per run in RLUSD via AP4M</p>
        </div>
        <button className="nx-btn" onClick={() => nav.navigate(undefined)}>
          Back to chat
        </button>
      </header>
      <ServiceStore />
    </div>
  );
}
