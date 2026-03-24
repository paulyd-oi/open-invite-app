/**
 * customThemeStorage — Persistence layer for user-created custom themes.
 *
 * Uses react-native-mmkv for synchronous JSON storage.
 * Phase 5A scaffold: exports save/load/delete but does NOT wire them
 * into the UI. Phase 5D will integrate.
 */

import { MMKV } from "react-native-mmkv";
import type { ThemeVisualStack } from "@/lib/eventThemes";

const storage = new MMKV({ id: "custom-themes" });
const STORAGE_KEY = "open_invite_custom_themes";

export interface CustomTheme {
  id: string; // "custom_" + uuid
  name: string;
  visualStack: ThemeVisualStack;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export function loadCustomThemes(): CustomTheme[] {
  const raw = storage.getString(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as CustomTheme[];
  } catch {
    return [];
  }
}

export function saveCustomTheme(theme: CustomTheme): void {
  const existing = loadCustomThemes();
  const idx = existing.findIndex((t) => t.id === theme.id);
  if (idx >= 0) {
    existing[idx] = theme;
  } else {
    existing.push(theme);
  }
  storage.set(STORAGE_KEY, JSON.stringify(existing));
}

export function deleteCustomTheme(id: string): void {
  const existing = loadCustomThemes();
  const filtered = existing.filter((t) => t.id !== id);
  storage.set(STORAGE_KEY, JSON.stringify(filtered));
}
