import { channelDetails } from "@/lib/ap4m/agent";

export const runtime = "nodejs";

/** Live details for one Channel, opened from Channel links in the UI. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return new Response(JSON.stringify(await channelDetails(id), null, 2), { headers: { "content-type": "application/json" } });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
