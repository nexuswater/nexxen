# Notes for coding agents

This is a Next.js 16 app built on OpenUI (generative UI) and the Vercel AI SDK v7.

- Before changing UI or generative components, read the maintained OpenUI skill:
  https://raw.githubusercontent.com/thesysdev/skills/refs/heads/main/skills/openui/SKILL.md
- `AgentInterface` slots are matched by component identity. Use `<AgentInterface.X>` directly
  and never wrap them in `memo`, HOCs or re-exports, or the default renders instead.
- The model is chosen by `AI_MODEL` (`provider:model`) through `src/lib/models.ts`; the default
  `claude-code:*` runs local Claude Code, which executes tools itself over MCP. Don't
  hardcode a provider in the route.
- Tools live in `src/lib/tools/` (AI SDK `tool()` with a zod `inputSchema`) and are registered
  in `src/lib/tools/index.ts`. Don't use zod `.default()` in tool inputs: the claude-code MCP
  bridge treats those fields as required. Use `.optional()` and apply the default in `execute`.
- `src/generated/spec.json` is generated from `src/lib/library.ts` by `pnpm generate`. Don't edit it by hand.
- AP4M payments follow the official hackathon kit rules in `AP4M-AGENTS.md` (keys only from env, RLUSD has
  18 decimals, voucher amounts are cumulative). `src/lib/ap4m/kit/` holds the unmodified official helpers.
- Check changes with `pnpm typecheck && pnpm lint && pnpm build`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
