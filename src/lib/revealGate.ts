/**
 * revealGate — Tracks which events a user has "revealed" by flipping the invite card.
 *
 * Uses AsyncStorage with an in-memory Set cache for synchronous reads.
 * Hydrated once via hydrateRevealCache() in root layout.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "open_invite_revealed_events";

const _revealed = new Set<string>();
let _hydrated = false;

/** Call once at app start (e.g. root layout useEffect). */
export async function hydrateRevealCache(): Promise<void> {
  if (_hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const ids: string[] = JSON.parse(raw);
      ids.forEach((id) => _revealed.add(id));
    }
  } catch {
    // Non-critical — worst case user sees blur again
  }
  _hydrated = true;
}

/** Synchronous check — safe after hydration. */
export function isEventRevealed(eventId: string): boolean {
  return _revealed.has(eventId);
}

/** Mark event as revealed. Persists in background. */
export function markEventRevealed(eventId: string): void {
  if (_revealed.has(eventId)) return;
  _revealed.add(eventId);
  // Persist — cap at 500 most recent to avoid unbounded growth
  const ids = Array.from(_revealed).slice(-500);
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ids)).catch(() => {});
}
