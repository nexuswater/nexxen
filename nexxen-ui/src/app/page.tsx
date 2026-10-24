"use client";
import "@openuidev/react-ui/styles/index.css";

import dynamic from "next/dynamic";

// Client-only: the server-rendered shell looked clickable before hydration,
// so starters and the composer silently ignored early clicks.
const AgentApp = dynamic(() => import("@/components/agent-app"), {
  ssr: false,
  loading: () => <div className="nx-boot">Loading NEXXEN…</div>,
});

export default function Home() {
  return <AgentApp />;
}
