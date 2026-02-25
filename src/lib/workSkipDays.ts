/**
 * Work Skip Days — local exception layer for day-off overrides.
 *
 * Persists a set of yyyy-MM-dd date keys in AsyncStorage.
 * When a day is "skipped", work blocks are suppressed for that day
 * in both the calendar UI and Who's Free availability engine.
 *
 * DEV proof tag: [P2_WORK_SKIP]
 */
import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { devLog } from "@/lib/devLog";

const STORAGE_KEY = "oi:workSkipDateKeys";

/** In-memory cache to avoid repeated reads. */
let _cache: Set<string> | null = null;

/** Format a Date as yyyy-MM-dd in local timezone. */
export function formatDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Load skip keys from storage (cached after first read). */
export async function getWorkSkipDateKeys(): Promise<Set<string>> {
  if (_cache) return _cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    _cache = new Set(arr);
  } catch {
    _cache = new Set();
  }
  if (__DEV__) {
    devLog("[P2_WORK_SKIP] load", { count: _cache.size });
  }
  return _cache;
}

/** Persist the current skip set. */
async function persist(keys: Set<string>): Promise<void> {
  _cache = keys;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
}

/** Add a day to the skip list. */
export async function addWorkSkipDay(dayKey: string): Promise<void> {
  const keys = await getWorkSkipDateKeys();
  if (keys.has(dayKey)) return;
  keys.add(dayKey);
  await persist(keys);
  if (__DEV__) {
    devLog("[P2_WORK_SKIP] add", { dayKey, count: keys.size });
  }
}

/** Remove a day from the skip list (restore work schedule). */
export async function removeWorkSkipDay(dayKey: string): Promise<void> {
  const keys = await getWorkSkipDateKeys();
  if (!keys.has(dayKey)) return;
  keys.delete(dayKey);
  await persist(keys);
  if (__DEV__) {
    devLog("[P2_WORK_SKIP] remove", { dayKey, count: keys.size });
  }
}

/** Check if a day is skipped. */
export function isWorkSkipped(dayKey: string): boolean {
  return _cache?.has(dayKey) ?? false;
}

/**
 * React hook — returns the current skip set + a refresh trigger.
 * Components call `refresh()` after add/remove to re-render.
 */
export function useWorkSkipDays(): {
  skipKeys: Set<string>;
  loaded: boolean;
  refresh: () => void;
} {
  const [skipKeys, setSkipKeys] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getWorkSkipDateKeys().then((keys) => {
      if (!cancelled) {
        setSkipKeys(new Set(keys));
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, [tick]);

  const refresh = useCallback(() => {
    _cache = null; // bust cache so next read hits storage
    setTick((t) => t + 1);
  }, []);

  return { skipKeys, loaded, refresh };
}
