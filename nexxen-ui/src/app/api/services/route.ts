import { listServices } from "@/lib/ap4m/agent";

export const runtime = "nodejs";

// Live prices need RPC + 402 round trips (~3 s); reuse them briefly.
let cache: { at: number; services: Awaited<ReturnType<typeof listServices>> } | null = null;

/** The AI tools store: services with live 402 prices when available. */
export async function GET() {
  try {
    if (!cache || Date.now() - cache.at > 30_000) cache = { at: Date.now(), services: await listServices() };
    return Response.json({ services: cache.services });
  } catch (error) {
    return Response.json({ error: (error as Error).message, services: [] }, { status: 500 });
  }
}
