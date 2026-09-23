"use client";

import { useEffect, useState } from "react";
import { getCurrentAuthUser, onAuthStateChange } from "./supabase-client";

const AVATAR_STORAGE_KEY = "testino_avatar_url";

/**
 * Hook to retrieve and cache the authenticated user's avatar image URL (e.g. from Google OAuth).
 * Reads from localStorage first for zero-flicker render, then syncs with Supabase user metadata.
 */
export function useAuthAvatar(): string | null {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(AVATAR_STORAGE_KEY);
    }
    return null;
  });

  useEffect(() => {
    let active = true;

    const syncAvatar = async () => {
      try {
        const user = await getCurrentAuthUser();
        if (!active) return;
        const metaAvatar = (user?.user_metadata?.avatar_url || user?.user_metadata?.picture) as string | undefined;
        if (metaAvatar && typeof metaAvatar === "string") {
          setAvatarUrl(metaAvatar);
          localStorage.setItem(AVATAR_STORAGE_KEY, metaAvatar);
        } else if (!user) {
          setAvatarUrl(null);
          localStorage.removeItem(AVATAR_STORAGE_KEY);
        }
      } catch {
        // ignore offline errors
      }
    };

    void syncAvatar();

    const unsubscribe = onAuthStateChange((user) => {
      const metaAvatar = (user?.user_metadata?.avatar_url || user?.user_metadata?.picture) as string | undefined;
      if (metaAvatar && typeof metaAvatar === "string") {
        setAvatarUrl(metaAvatar);
        localStorage.setItem(AVATAR_STORAGE_KEY, metaAvatar);
      } else if (!user) {
        setAvatarUrl(null);
        localStorage.removeItem(AVATAR_STORAGE_KEY);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return avatarUrl;
}
