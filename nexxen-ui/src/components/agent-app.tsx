"use client";

import { HomeLink } from "@/components/home-link";
import { ActivityPanel } from "@/components/activity-panel";
import { NetworkPage } from "@/components/network-page";
import { StorePage, StoreWelcome } from "@/components/service-store";
import { WalletHeader } from "@/components/wallet-bar";
import { APP } from "@/config/app";
import {
  AgentInterface,
  fetchLLM,
  useThemeModePreference,
  vercelAIAdapter,
  vercelAIMessageFormat,
} from "@openuidev/react-ui";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";

const llm = fetchLLM({
  url: "/api/chat",
  streamAdapter: vercelAIAdapter(),
  messageFormat: vercelAIMessageFormat,
});

const StoreIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M4 7h16l-1.5 12h-13zM9 7a3 3 0 0 1 6 0" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Mastercard-style interlocking circles. */
const NetworkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 14" aria-hidden>
    <circle cx="7" cy="7" r="7" fill="#eb001b" />
    <circle cx="17" cy="7" r="7" fill="#f79e1b" fillOpacity="0.9" />
  </svg>
);

export default function AgentApp() {
  // Follows the system theme until the footer toggle is first used, then
  // remembers the choice.
  const { setPreference, mode } = useThemeModePreference();

  return (
    <div className={`nx-shell nx-shell-${mode}`}>
      <WalletHeader mode={mode} />
      <div className="nx-shell-app">
    <AgentInterface
      llm={llm}
      componentLibrary={openuiLibrary}
      logoUrl={APP.logoUrl}
      agentName={APP.name}
      theme={{ mode }}
    >
      <AgentInterface.Sidebar>
        <AgentInterface.SidebarHeader agentName={<HomeLink>{APP.name}</HomeLink>} />
        <div className="nx-sidebar-nav">
          <AgentInterface.NewChatButton />
          <AgentInterface.SidebarItem path="store" icon={<StoreIcon />}>
            AI tools
          </AgentInterface.SidebarItem>
          <AgentInterface.SidebarItem path="network" icon={<NetworkIcon />}>
            AP4M payments
          </AgentInterface.SidebarItem>
        </div>
        <AgentInterface.SidebarContent>
          <AgentInterface.ThreadList />
        </AgentInterface.SidebarContent>
        <AgentInterface.SidebarFooter>
          <AgentInterface.ThemeModeToggle mode={mode} onModeChange={setPreference} />
        </AgentInterface.SidebarFooter>
      </AgentInterface.Sidebar>
      <AgentInterface.ThreadHeader />
      <AgentInterface.Welcome>
        <StoreWelcome />
      </AgentInterface.Welcome>
      <AgentInterface.Route path="store">
        <StorePage />
      </AgentInterface.Route>
      <AgentInterface.Route path="network">
        <NetworkPage />
      </AgentInterface.Route>
    </AgentInterface>
        <ActivityPanel />
      </div>
    </div>
  );
}
