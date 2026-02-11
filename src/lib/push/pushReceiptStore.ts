/**
 * DEV-only push receipt store.
 * Records registration attempts, push receives, and router decisions.
 * Persisted in AsyncStorage (last 50), surfaced in Settings > "View Push Receipts".
 *
 * Tag: [P0_PUSH_TWO_ENDED]
 * NO-OP in production builds (__DEV__ guard at every entry point).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { devLog } from "@/lib/devLog";

const STORAGE_KEY = "oi:dev:push_receipts";
const MAX_RECEIPTS = 50;
const DISPLAY_LIMIT = 20;

export type PushReceiptKind =
  | "register_attempt"
  | "register_success"
  | "register_skip"
  | "push_received"
  | "push_router_handled";

export interface PushReceipt {
  ts: string;
  kind: PushReceiptKind;
  userId: string;
  details: Record<string, unknown>;
}

// In-memory cache (DEV only)
let receipts: PushReceipt[] = [];
let loaded = false;

/** Load receipts from AsyncStorage into memory (once). */
async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      receipts = JSON.parse(raw) as PushReceipt[];
    }
  } catch {
    receipts = [];
  }
  loaded = true;
}

/** Persist current receipts (trimmed to MAX). */
async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(receipts.slice(-MAX_RECEIPTS)));
  } catch {
    // best-effort
  }
}

/**
 * Record a push receipt. DEV only — no-op in production.
 */
export async function recordPushReceipt(
  kind: PushReceiptKind,
  userId: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  if (!__DEV__) return;

  await ensureLoaded();

  const entry: PushReceipt = {
    ts: new Date().toISOString(),
    kind,
    userId,
    details,
  };

  receipts.push(entry);
  if (receipts.length > MAX_RECEIPTS) {
    receipts = receipts.slice(-MAX_RECEIPTS);
  }

  // Also emit to console under the canonical tag
  devLog("[P0_PUSH_TWO_ENDED]", { kind, ts: entry.ts, userId, details });

  await persist();
}

/**
 * Get last N receipts (newest first) for display.
 */
export async function getRecentReceipts(): Promise<PushReceipt[]> {
  if (!__DEV__) return [];
  await ensureLoaded();
  return [...receipts].reverse().slice(0, DISPLAY_LIMIT);
}

/**
 * Clear all stored receipts.
 */
export async function clearPushReceipts(): Promise<void> {
  if (!__DEV__) return;
  receipts = [];
  loaded = true;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // best-effort
  }
}
