import { AGENT_INSTRUCTIONS } from "@/config/app";
import librarySpec from "@/generated/spec.json";
import { getModel, toolsFor } from "@/lib/models";
import { generateSystemPrompt } from "@openuidev/lang-core";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

export const runtime = "nodejs";

// The generated spec carries the library and its prompt options; generateSystemPrompt takes them separately.
const { promptOptions, ...library } = librarySpec;
const system = `${AGENT_INSTRUCTIONS}\n\n${generateSystemPrompt({ library, promptOptions })}`;

export async function POST(req: Request) {
  const payload = (await req.json()) as { messages?: UIMessage[] };
  if (!Array.isArray(payload.messages)) {
    return Response.json({ error: "messages must be an array" }, { status: 400 });
  }

  const result = streamText({
    model: getModel(),
    system,
    messages: await convertToModelMessages(payload.messages),
    tools: toolsFor(),
    stopWhen: stepCountIs(Number(process.env.AI_MAX_STEPS ?? 8)),
    abortSignal: req.signal,
  });

  // Preserve the AI SDK's native UIMessage stream. The frontend adapter uses
  // the AI SDK itself to decode it before mapping chunks into OpenUI events.
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      sendReasoning: true,
      // Surface provider errors (missing key, unknown model) instead of a generic message.
      onError: (error) => (error instanceof Error ? error.message : String(error)),
    }).pipeThrough(asClientToolCalls()),
  });
}

/**
 * Claude Code runs our tools itself (as MCP tools) and reports them as
 * provider-executed, which OpenUI's AI SDK adapter rejects. They arrive
 * complete with outputs, so present them as ordinary tool calls under their
 * plain names (mcp__app__get_weather -> get_weather).
 */
function asClientToolCalls() {
  return new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      if ("providerExecuted" in chunk) {
        chunk = { ...chunk };
        delete (chunk as { providerExecuted?: boolean }).providerExecuted;
      }
      if ("toolName" in chunk && chunk.toolName.startsWith("mcp__app__")) {
        chunk = { ...chunk, toolName: chunk.toolName.slice("mcp__app__".length) };
      }
      controller.enqueue(chunk);
    },
  });
}
