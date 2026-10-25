import { lastProof, verifyProof } from "@/lib/story/proof";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Last verification result; POST runs a fresh read-only verification. */
export async function GET() {
  return Response.json({ proof: lastProof() });
}

export async function POST() {
  return Response.json({ proof: await verifyProof() });
}
