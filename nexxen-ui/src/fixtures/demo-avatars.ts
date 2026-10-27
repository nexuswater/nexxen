/**
 * Demo profile photos for the sandbox dashboard.
 * Real X profile photos replace these when X_BEARER_TOKEN is set.
 * pfp-fuzzy-astronaut.webp is an original geometric placeholder until the
 * real Fuzzy astronaut file is dropped in at the same path.
 */

export const DEMO_AVATARS = [
  {
    id: "fuzzy-white-xrp",
    src: "/demo/pfp-fuzzy-white-xrp.webp",
    label: "Fuzzy in an XRP shirt",
    placeholder: false,
  },
  {
    id: "pharaoh-astronaut",
    src: "/demo/pfp-pharaoh-astronaut.webp",
    label: "Pharaoh astronaut",
    placeholder: false,
  },
  {
    id: "fuzzy-astronaut",
    src: "/demo/pfp-fuzzy-astronaut.webp",
    label: "Fuzzy astronaut placeholder",
    placeholder: true,
  },
] as const;

export type DemoAvatar = (typeof DEMO_AVATARS)[number];
export type DemoAvatarId = DemoAvatar["id"];

export const DEFAULT_DEMO_AVATAR_ID: DemoAvatarId = "fuzzy-white-xrp";

export const NEXUS_WATER_LOGO = {
  src: "/brand/nexus-water-logo.png",
  alt: "Nexus Water",
  width: 1254,
  height: 1254,
} as const;
