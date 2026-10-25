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

async function ask(system: string, prompt: string, maxOutputTokens = 1200) {
  const { text } = await generateText({ model: sellerModel(), system, prompt, maxOutputTokens });
  return text.trim();
}

/** The seller's own illustration: one safe, self-contained SVG. */
async function drawSvg(prompt: string) {
  const reply = await ask(
    "You are an illustrator. Reply with one self-contained SVG (viewBox 0 0 512 512, no scripts, no external " +
      "references) that illustrates the user's prompt with simple shapes and gradients. Reply with the SVG only.",
    prompt,
    4000,
  );
  const svg = reply.match(/<svg[\s\S]*<\/svg>/i)?.[0];
  if (!svg || /<script|on\w+=|href=["']?(?!#)/i.test(svg)) throw new Error("No usable SVG");
  return svg;
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
      // The free image service is often overloaded (402/429/503), so the seller starts its own SVG
      // drawing in parallel and uses it only if no photo arrives in time.
      const drawing = drawSvg(input).catch((e: Error) => e);
      let lastError = "";
      for (const wait of [0, 1_500, 3_000]) {
        if (wait) await new Promise((r) => setTimeout(r, wait));
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(input)}?width=512&height=512&seed=${Math.floor(Math.random() * 1_000_000)}`;
        try {
          // Generate now so the image is ready (and cached) when the UI shows it.
          const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
          if (res.ok) return { prompt: input, image_url: url, size: "512x512", renderer: "Rendered by Pollinations" };
          lastError = `HTTP ${res.status}`;
        } catch (e) {
          lastError = (e as Error).name === "TimeoutError" ? "timed out" : (e as Error).message;
        }
      }
      const svg = await drawing;
      if (svg instanceof Error) throw new Error(`Image service unavailable (${lastError}) and the fallback failed`);
      return {
        prompt: input,
        image_url: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
        size: "512x512",
        renderer: `Drawn by the seller's model (image service ${lastError})`,
      };
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
