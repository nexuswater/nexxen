import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createProviderRegistry } from "ai";
import { createAiSdkMcpServer, createClaudeCode } from "ai-sdk-provider-claude-code";
import { tools } from "./tools";

/**
 * Local Claude Code (the engine behind `claude -p`), billed to your Claude
 * subscription via `claude login` instead of an API key. Personal/local use
 * only: don't deploy an app that runs on your subscription login.
 *
 * Claude Code runs its own agent loop, so our tools are handed to it as an
 * in-process MCP server and its built-in tools (Bash, Read, Edit, ...) are off.
 */
const claudeCode = createClaudeCode({
  defaultSettings: {
    pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_PATH,
    tools: [],
    mcpServers: { app: createAiSdkMcpServer("app", tools) },
    allowedTools: Object.keys(tools).map((name) => `mcp__app__${name}`),
    maxTurns: Number(process.env.AI_MAX_STEPS ?? 8),
    persistSession: false,
    // Claude Code prefers an API key over the subscription login when one is
    // present, so keep the anthropic: provider's key from leaking into it.
    env: { ANTHROPIC_API_KEY: undefined },
  },
});

/**
 * One registry for every provider the template supports. Pick the model with
 * AI_MODEL="<provider>:<model-id>", e.g. "claude-code:sonnet".
 * Each provider reads its own key from the environment and only fails when a
 * model from it is actually called, so unused providers need no config.
 */
export const registry = createProviderRegistry({
  "claude-code": claudeCode,
  anthropic: createAnthropic(),
  openai: createOpenAI(),
  google: createGoogleGenerativeAI(),
  bedrock: createAmazonBedrock(),
  // Any OpenAI-compatible endpoint: Ollama, LM Studio, vLLM, OpenRouter, Groq, ...
  compatible: createOpenAICompatible({
    name: "compatible",
    baseURL: process.env.COMPATIBLE_BASE_URL ?? "http://localhost:11434/v1",
    apiKey: process.env.COMPATIBLE_API_KEY,
  }),
});

export const DEFAULT_MODEL = "claude-code:sonnet";

type ModelId = Parameters<typeof registry.languageModel>[0];

export function getModel(id = process.env.AI_MODEL ?? DEFAULT_MODEL) {
  return registry.languageModel(id as ModelId);
}

/** Claude Code executes tools itself; passing them to streamText too would only warn. */
export function toolsFor(id = process.env.AI_MODEL ?? DEFAULT_MODEL) {
  return id.startsWith("claude-code:") ? undefined : tools;
}
