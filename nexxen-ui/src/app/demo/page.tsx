"use client";
import "@openuidev/react-ui/styles/index.css";

import dynamic from "next/dynamic";

// Client-only like the home page, so nothing looks clickable before hydration.
const StoryApp = dynamic(() => import("@/components/story/story-app"), {
  ssr: false,
  loading: () => <div className="nx-boot">Loading NEXXEN demo…</div>,
});

export default function DemoPage() {
  return <StoryApp />;
}
