import { listServices, readJournal, settleAll, status } from "@/lib/ap4m/agent";

export const runtime = "nodejs";

/** Read model for the AP4M page: setup, Channels, services, purchases, settlements. */
export async function GET() {
  const [s, services] = await Promise.allSettled([status(), listServices()]);
  return Response.json({
    status: s.status === "fulfilled" ? s.value : undefined,
    services: services.status === "fulfilled" ? services.value : [],
    journal: readJournal(),
    error: s.status === "rejected" ? (s.reason as Error).message : undefined,
  });
}

export async function POST(req: Request) {
  const { action } = (await req.json()) as { action?: string };
  if (action !== "settle") return Response.json({ error: "unknown action" }, { status: 400 });
  try {
    return Response.json({ settled: await settleAll() });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 409 });
  }
}
