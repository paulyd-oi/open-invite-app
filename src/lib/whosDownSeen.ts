/**
 * [WHOS_DOWN_V1] Local-only "seen" tracking for the Who's Down feed badge.
 *
 * The Discover → Who's Down tab badge shows unseen idea count (new-since-
 * last-open), not total active count. Seen IDs are persisted locally per
 * user via AsyncStorage. No backend read-tracking.
 *
 * Key format: `whosDownSeen_<userId>`
 * Value format: JSON string[] of event_request IDs the user has seen.
 *
 * Scope intentionally tight: append-only set with a soft cap so the blob
 * never grows unbounded. No cross-device sync, no per-item read state,
 * no unseen activity tracking.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { devError } from "./devLog";

const STORAGE_KEY_PREFIX = "whosDownSeen_";
// Soft cap — once the set exceeds this, we trim to the newest half on the
// next write. Expired ideas drop out of the feed on the backend side, so
// this cap only matters for extremely active users over months.
const MAX_SEEN_IDS = 2000;
const TRIM_TO = 1000;

function getStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

async function loadSeenIds(userId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(getStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

async function saveSeenIds(userId: string, ids: string[]): Promise<void> {
  try {
    const trimmed = ids.length > MAX_SEEN_IDS ? ids.slice(-TRIM_TO) : ids;
    await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(trimmed));
  } catch {
    if (__DEV__) devError("[WhosDownSeen] Failed to persist seen IDs");
  }
}

export interface WhosDownSeenHook {
  /** Hydrated seen-ID set. Empty until AsyncStorage finishes loading. */
  seenIds: Set<string>;
  /** True once AsyncStorage has been read (success or fail). */
  hydrated: boolean;
  /** Mark a batch of idea IDs as seen. No-op if all are already seen or userId is null. */
  markSeen: (ids: string[]) => void;
}

/**
 * Returns a hook-managed seen-ID set for the given user. `userId` may be
 * null/undefined before auth settles; in that case the hook stays empty
 * and unhydrated until a user ID arrives.
 */
export function useWhosDownSeen(userId: string | null | undefined): WhosDownSeenHook {
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);
  // Tracks which userId the current state belongs to so switching users
  // doesn't leak state from the previous user.
  const hydratedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setSeenIds(new Set());
      setHydrated(false);
      hydratedForRef.current = null;
      return;
    }
    if (hydratedForRef.current === userId) return;

    let cancelled = false;
    hydratedForRef.current = userId;
    loadSeenIds(userId).then((ids) => {
      if (cancelled || hydratedForRef.current !== userId) return;
      setSeenIds(new Set(ids));
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const markSeen = useCallback(
    (ids: string[]) => {
      if (!userId || ids.length === 0) return;
      setSeenIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const id of ids) {
          if (typeof id === "string" && id.length > 0 && !next.has(id)) {
            next.add(id);
            changed = true;
          }
        }
        if (!changed) return prev;
        // Fire-and-forget persist. Order preserved by Set insertion order;
        // stored as array so the newest entries survive the soft-cap trim.
        void saveSeenIds(userId, Array.from(next));
        return next;
      });
    },
    [userId],
  );

  return { seenIds, hydrated, markSeen };
}
