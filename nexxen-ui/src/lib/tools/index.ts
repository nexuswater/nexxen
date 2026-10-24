import { ap4mTools } from "./ap4m";

/**
 * Every tool the agent can call. Add a file next to ap4m.ts and register it
 * here; the UI shows each call in the tool timeline automatically.
 */
export const tools = {
  ...ap4mTools,
};
