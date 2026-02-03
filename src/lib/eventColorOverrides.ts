/**
 * EVENT COLOR OVERRIDES — Per-user color customization for calendar blocks
 * 
 * This module stores user-specific color overrides for events displayed on their calendar.
 * Overrides are keyed by userId + eventId and persist across app restarts.
 * 
 * Key format: eventColorOverrides_<userId>
 * Value format: JSON object { [eventId]: "#RRGGBB" }
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY_PREFIX = "eventColorOverrides_";

// In-memory cache for fast access during rendering
let cachedOverrides: Record<string, string> | null = null;
let cachedUserId: string | null = null;

/**
 * Build the storage key for a user's color overrides
 */
function getStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

/**
 * Load color overrides for a user from storage
 */
export async function loadColorOverrides(userId: string): Promise<Record<string, string>> {
  try {
    // Return from cache if available for same user
    if (cachedUserId === userId && cachedOverrides !== null) {
      return cachedOverrides;
    }

    const key = getStorageKey(userId);
    const data = await AsyncStorage.getItem(key);
    
    if (data) {
      const parsed = JSON.parse(data) as Record<string, string>;
      // Update cache
      cachedOverrides = parsed;
      cachedUserId = userId;
      
      if (__DEV__) {
        const count = Object.keys(parsed).length;
        if (count > 0) {
          console.log("[EventColorOverrides] Loaded", count, "overrides for user");
        }
      }
      
      return parsed;
    }
    
    // Initialize empty cache
    cachedOverrides = {};
    cachedUserId = userId;
    return {};
  } catch (error) {
    if (__DEV__) {
      console.error("[EventColorOverrides] Failed to load:", error);
    }
    return {};
  }
}

/**
 * Save a color override for an event
 */
export async function saveColorOverride(
  userId: string,
  eventId: string,
  color: string
): Promise<void> {
  try {
    // Load existing overrides
    const overrides = await loadColorOverrides(userId);
    
    // Update
    overrides[eventId] = color;
    
    // Save to storage
    const key = getStorageKey(userId);
    await AsyncStorage.setItem(key, JSON.stringify(overrides));
    
    // Update cache
    cachedOverrides = overrides;
    cachedUserId = userId;
    
    if (__DEV__) {
      console.log("[EventColorOverrides] Saved override:", { eventId, color });
    }
  } catch (error) {
    if (__DEV__) {
      console.error("[EventColorOverrides] Failed to save:", error);
    }
    throw error;
  }
}

/**
 * Remove a color override for an event (reset to default)
 */
export async function removeColorOverride(
  userId: string,
  eventId: string
): Promise<void> {
  try {
    // Load existing overrides
    const overrides = await loadColorOverrides(userId);
    
    // Remove
    delete overrides[eventId];
    
    // Save to storage
    const key = getStorageKey(userId);
    await AsyncStorage.setItem(key, JSON.stringify(overrides));
    
    // Update cache
    cachedOverrides = overrides;
    cachedUserId = userId;
    
    if (__DEV__) {
      console.log("[EventColorOverrides] Removed override for:", eventId);
    }
  } catch (error) {
    if (__DEV__) {
      console.error("[EventColorOverrides] Failed to remove:", error);
    }
    throw error;
  }
}

/**
 * Get color override for a specific event (synchronous, uses cache)
 * Returns undefined if no override exists
 */
export function getColorOverride(
  userId: string | undefined | null,
  eventId: string | undefined | null
): string | undefined {
  if (!userId || !eventId) return undefined;
  
  // Must match cached user
  if (cachedUserId !== userId || cachedOverrides === null) {
    return undefined;
  }
  
  return cachedOverrides[eventId];
}

/**
 * Get all color overrides (synchronous, uses cache)
 */
export function getAllColorOverrides(): Record<string, string> {
  return cachedOverrides ?? {};
}

/**
 * Clear cache (call on logout)
 */
export function clearColorOverridesCache(): void {
  cachedOverrides = null;
  cachedUserId = null;
}

/**
 * Predefined color palette for the picker
 * Includes popular colors that look good as calendar blocks
 */
export const COLOR_PALETTE = [
  "#FF6B4A", // Orange-red (default theme)
  "#4ECDC4", // Teal
  "#9333EA", // Purple
  "#F59E0B", // Amber
  "#10B981", // Emerald
  "#EC4899", // Pink
  "#3B82F6", // Blue
  "#EF4444", // Red
  "#8B5CF6", // Violet
  "#06B6D4", // Cyan
  "#84CC16", // Lime
  "#6B7280", // Grey (for busy/work style)
];
