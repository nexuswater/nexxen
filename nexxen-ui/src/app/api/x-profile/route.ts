import { readPublicXProfile } from "@/lib/x-profile/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public profile photo only. Demo avatars are used when this is unconfigured. */
export async function GET() {
  const profile = await readPublicXProfile();
  return Response.json({
    configured: profile.configured,
    imageUrl: profile.imageUrl,
    username: profile.username,
    name: profile.name,
  });
}
