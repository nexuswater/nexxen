/**
 * Reads a public X profile image. Tokens stay in the server environment.
 * When X_BEARER_TOKEN is missing, callers should show the demo avatar.
 * This module does not send payments or touch wallet, card, or signing code.
 */

export type PublicXProfile = {
  configured: boolean;
  imageUrl: string | null;
  username: string | null;
  name: string | null;
};

const UNCONFIGURED: PublicXProfile = {
  configured: false,
  imageUrl: null,
  username: null,
  name: null,
};

const X_API_ORIGIN = "https://api.x.com";

/** X profile URLs often end in _normal. Swap that for the larger _400x400 variant. */
export function largerProfileImageUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "pbs.twimg.com") return null;
  url.pathname = url.pathname.replace(/_(?:normal|bigger|mini|200x200)(\.[a-zA-Z0-9]+)$/, "_400x400$1");
  url.search = "";
  url.hash = "";
  return url.toString();
}

function usernamePath(raw: string | undefined): string | null {
  const username = raw?.trim().replace(/^@/, "") ?? "";
  if (!username) return "/2/users/me";
  if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) return null;
  return `/2/users/by/username/${encodeURIComponent(username)}`;
}

export async function readPublicXProfile(env: NodeJS.ProcessEnv = process.env): Promise<PublicXProfile> {
  const token = env.X_BEARER_TOKEN?.trim() ?? "";
  if (!token || /[\r\n]/.test(token)) return UNCONFIGURED;

  const path = usernamePath(env.X_USERNAME);
  if (!path) return { ...UNCONFIGURED, configured: true };

  const endpoint = new URL(path, X_API_ORIGIN);
  endpoint.searchParams.set("user.fields", "profile_image_url,name,username");

  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { ...UNCONFIGURED, configured: true };
    const body = (await response.json()) as {
      data?: { profile_image_url?: unknown; username?: unknown; name?: unknown };
    };
    const imageUrl = typeof body.data?.profile_image_url === "string" ? largerProfileImageUrl(body.data.profile_image_url) : null;
    return {
      configured: true,
      imageUrl,
      username: typeof body.data?.username === "string" ? body.data.username : null,
      name: typeof body.data?.name === "string" ? body.data.name : null,
    };
  } catch {
    return { ...UNCONFIGURED, configured: true };
  }
}
