/**
 * customThemeStorage — Persistence layer for user-created custom themes.
 *
 * Uses AsyncStorage (already installed, old-arch compatible) with a
 * synchronous in-memory cache so existing call-sites stay unchanged.
 * The cache is hydrated once via hydrateCustomThemeCache() which must
 * be called early in the app lifecycle (e.g. root layout useEffect).
 * Writes update the cache immediately and persist to AsyncStorage
 * in the background.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ThemeVisualStack } from "@/lib/eventThemes";

const STORAGE_KEY = "open_invite_custom_themes";

export interface CustomTheme {
  id: string; // "custom_" + uuid
  name: string;
  visualStack: ThemeVisualStack;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

// ─── In-memory cache (sync reads, async persistence) ──

let _cache: CustomTheme[] = [];
let _hydrated = false;

/**
 * Call once at app startup (root layout) to populate the cache from disk.
 * Safe to call multiple times — only the first call reads from AsyncStorage.
 */
export async function hydrateCustomThemeCache(): Promise<void> {
  if (_hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      _cache = JSON.parse(raw) as CustomTheme[];
    }
  } catch {
    _cache = [];
  }
  _hydrated = true;
}

function persist(): void {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(_cache)).catch(() => {});
}

// ─── Public API (synchronous, identical signatures to previous MMKV impl) ──

export function loadCustomThemes(): CustomTheme[] {
  return _cache;
}

export function saveCustomTheme(theme: CustomTheme): void {
  const idx = _cache.findIndex((t) => t.id === theme.id);
  if (idx >= 0) {
    _cache[idx] = theme;
  } else {
    _cache.push(theme);
  }
  // Replace cache reference so React state updates detect the change
  _cache = [..._cache];
  persist();
}

export function deleteCustomTheme(id: string): void {
  _cache = _cache.filter((t) => t.id !== id);
  persist();
}

export const MAX_CUSTOM_THEMES = 10;
