"use client";
import { useNav, useThreadList } from "@openuidev/react-ui";
import type { ReactNode } from "react";

/** Sidebar title that returns to the welcome screen, like the New Chat button. */
export function HomeLink({ children }: { children: ReactNode }) {
  const switchToNewThread = useThreadList((s) => s.switchToNewThread);
  const nav = useNav();

  return (
    <button
      type="button"
      className="openui-agent-sidebar-header__agent-name home-link"
      onClick={() => {
        switchToNewThread();
        if (nav.path !== undefined) nav.navigate(undefined);
      }}
    >
      {children}
    </button>
  );
}
