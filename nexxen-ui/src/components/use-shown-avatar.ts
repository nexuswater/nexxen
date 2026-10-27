"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DEMO_AVATARS, DEFAULT_DEMO_AVATAR_ID, type DemoAvatarId } from "@/fixtures/demo-avatars";

const STORAGE_KEY = "nexxen-demo-avatar";

let avatarId: DemoAvatarId = DEFAULT_DEMO_AVATAR_ID;
const avatarListeners = new Set<() => void>();

function emitAvatar() {
  avatarListeners.forEach((listener) => listener());
}

function isAvatarId(value: string | null): value is DemoAvatarId {
  return DEMO_AVATARS.some((avatar) => avatar.id === value);
}

export function selectDemoAvatar(id: DemoAvatarId) {
  if (id === avatarId) return;
  avatarId = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // The current choice still updates on screen if storage is blocked.
  }
  emitAvatar();
}

function subscribeAvatar(listener: () => void) {
  avatarListeners.add(listener);
  return () => {
    avatarListeners.delete(listener);
  };
}

type XProfileSnapshot = {
  configured: boolean;
  imageUrl: string | null;
};

const EMPTY_PROFILE: XProfileSnapshot = { configured: false, imageUrl: null };
let profile: XProfileSnapshot = EMPTY_PROFILE;
let profileStarted = false;
const profileListeners = new Set<() => void>();

function emitProfile() {
  profileListeners.forEach((listener) => listener());
}

function loadProfile() {
  if (profileStarted || typeof window === "undefined") return;
  profileStarted = true;
  fetch("/api/x-profile", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((json: { configured?: boolean; imageUrl?: unknown } | null) => {
      if (!json) return;
      const imageUrl =
        typeof json.imageUrl === "string" && json.imageUrl.startsWith("https://pbs.twimg.com/") ? json.imageUrl : null;
      const next = { configured: json.configured === true, imageUrl };
      if (next.configured === profile.configured && next.imageUrl === profile.imageUrl) return;
      profile = next;
      emitProfile();
    })
    .catch(() => {
      // Keep the demo avatar. A failed lookup must not blank the profile.
    });
}

function subscribeProfile(listener: () => void) {
  profileListeners.add(listener);
  loadProfile();
  return () => {
    profileListeners.delete(listener);
  };
}

export function useShownAvatar() {
  const id = useSyncExternalStore(subscribeAvatar, () => avatarId, () => DEFAULT_DEMO_AVATAR_ID);
  const xProfile = useSyncExternalStore(subscribeProfile, () => profile, () => EMPTY_PROFILE);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isAvatarId(stored)) selectDemoAvatar(stored);
    } catch {
      // Ignore storage failures and keep the default demo avatar.
    }
  }, []);

  const demo = DEMO_AVATARS.find((avatar) => avatar.id === id) ?? DEMO_AVATARS[0];
  const fromX = Boolean(xProfile.imageUrl);
  return {
    src: xProfile.imageUrl ?? demo.src,
    label: fromX ? "X profile photo" : demo.label,
    fromX,
    demo,
    selectDemoAvatar,
  };
}
