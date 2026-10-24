import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type LanguageModel } from "ai";
import { createClaudeCode } from "ai-sdk-provider-claude-code";
import { services } from "./store";

/**
 * The AI jobs the sellers run once a purchase is paid. Each seller has its own
 * model with no tools at all, so a seller can never reach the buyer's payment
 * tools. Jobs only run after buyService() returns a redeemed payment.
 */

const sellerClaude = createClaudeCode({
  defaultSettings: { tools: [], maxTurns: 1, persistSession: false, env: { ANTHROPIC_API_KEY: undefined } },
});

function sellerModel(): LanguageModel {
  const id = process.env.SELLER_MODEL || process.env.AI_MODEL || "claude-code:haiku";
  const [provider, model] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
  if (provider === "claude-code") return sellerClaude(id === process.env.AI_MODEL ? "haiku" : model);
  if (provider === "anthropic") return createAnthropic()(model);
  if (provider === "openai") return createOpenAI()(model);
  return sellerClaude("haiku");
}

export type JobInput = { input: string; targetLanguage?: string };

/** Reject bad input before any money moves. */
export function validateJob(serviceId: string, job: JobInput) {
  if (!services.some((s) => s.id === serviceId)) throw new Error(`Unknown service ${serviceId}`);
  const input = job.input?.trim();
  if (!input) throw new Error("This service needs an input");
  if (serviceId === "summarize-url") {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new Error("Summarize needs a full URL, e.g. https://xrpl.org");
    }
    if (!["http:", "https:"].includes(url.protocol) || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      throw new Error("Summarize only reads public http(s) pages");
    }
  }
  if (input.length > 8000) throw new Error("Input is too long (8000 characters max)");
}

async function ask(system: string, prompt: string) {
  const { text } = await generateText({ model: sellerModel(), system, prompt, maxOutputTokens: 1200 });
  return text.trim();
}

function pageText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

export async function runJob(serviceId: string, job: JobInput): Promise<Record<string, unknown>> {
  const input = job.input.trim();
  switch (serviceId) {
    case "summarize-url": {
      const res = await fetch(input, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`The page returned HTTP ${res.status}`);
      const text = pageText(await res.text());
      const summary = await ask(
        "You summarize web pages. Reply with a 2-3 sentence summary, then 3-5 key points as '- ' bullets. No preamble.",
        `URL: ${input}\n\nPage text:\n${text}`,
      );
      return { url: input, summary };
    }
    case "translate": {
      const language = job.targetLanguage?.trim() || "Hindi";
      const translation = await ask(
        `You are a professional translator. Translate the user's text into ${language}. Keep tone and formatting. Reply with the translation only.`,
        input,
      );
      return { language, original: input, translation };
    }
    case "generate-image": {
      const seed = Math.floor(Math.random() * 1_000_000);
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(input)}?width=1024&height=1024&nologo=true&seed=${seed}`;
      // Generate now so the image is ready (and cached) when the chat shows it.
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`Image generation failed (HTTP ${res.status})`);
      return { prompt: input, image_url: url, size: "1024x1024" };
    }
    case "sentiment": {
      const raw = await ask(
        'You analyze sentiment. Reply with JSON only: {"sentiment":"positive|neutral|negative|mixed","score":-1..1,' +
          '"tone":["..."],"key_phrases":["..."],"one_line":"..."}',
        input,
      );
      const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
      try {
        return { text: input, ...JSON.parse(json) };
      } catch {
        return { text: input, analysis: raw };
      }
    }
    default:
      throw new Error(`Unknown service ${serviceId}`);
  }
}
