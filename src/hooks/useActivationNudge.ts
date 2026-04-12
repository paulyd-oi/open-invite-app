import { useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ActivationNudgeKey = "add_friends" | "create_event" | "rsvp_event";

const DISMISS_CAP = 3;
const SESSION_COOLDOWN = 3;

interface UseActivationNudgeOptions {
  userId: string | undefined;
  hasFriends: boolean;
  hasCreatedEvent: boolean;
  hasRsvpd: boolean;
  /** true while signals are still loading — suppress while unknown */
  loading: boolean;
}

function storageKey(userId: string, suffix: string) {
  return `oi:activation_nudge:${userId}:${suffix}`;
}

export function useActivationNudge(opts: UseActivationNudgeOptions) {
  const { userId, hasFriends, hasCreatedEvent, hasRsvpd, loading } = opts;
  const [activeNudge, setActiveNudge] = useState<ActivationNudgeKey | null>(null);
  const evaluatedRef = useRef(false);

  useEffect(() => {
    if (!userId || loading) return;
    if (evaluatedRef.current) return;
    evaluatedRef.current = true;

    (async () => {
      try {
        const sessionKey = storageKey(userId, "session_count");
        const prevSessionsRaw = await AsyncStorage.getItem(sessionKey);
        const prevSessions = parseInt(prevSessionsRaw ?? "0", 10) || 0;
        const sessionNow = prevSessions + 1;
        await AsyncStorage.setItem(sessionKey, String(sessionNow));

        const candidates: ActivationNudgeKey[] = [];
        if (!hasFriends) candidates.push("add_friends");
        if (!hasCreatedEvent) candidates.push("create_event");
        if (!hasRsvpd) candidates.push("rsvp_event");
        if (candidates.length === 0) return;

        for (const key of candidates) {
          const dismissCount =
            parseInt((await AsyncStorage.getItem(storageKey(userId, `dismiss:${key}`))) ?? "0", 10) || 0;
          if (dismissCount >= DISMISS_CAP) continue;
          const lastShown =
            parseInt((await AsyncStorage.getItem(storageKey(userId, `last_shown:${key}`))) ?? "0", 10) || 0;
          if (lastShown > 0 && sessionNow - lastShown < SESSION_COOLDOWN) continue;
          await AsyncStorage.setItem(storageKey(userId, `last_shown:${key}`), String(sessionNow));
          setActiveNudge(key);
          return;
        }
      } catch {
        // Silent fail — nudges are non-critical
      }
    })();
  }, [userId, hasFriends, hasCreatedEvent, hasRsvpd, loading]);

  const dismiss = useCallback(async () => {
    if (!userId || !activeNudge) return;
    const key = activeNudge;
    setActiveNudge(null);
    try {
      const dismissKey = storageKey(userId, `dismiss:${key}`);
      const prev = parseInt((await AsyncStorage.getItem(dismissKey)) ?? "0", 10) || 0;
      await AsyncStorage.setItem(dismissKey, String(prev + 1));
    } catch {
      // Silent
    }
  }, [userId, activeNudge]);

  return { activeNudge, dismiss };
}
