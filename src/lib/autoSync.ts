/**
 * Auto-Sync Service (Premium Feature)
 *
 * Automatically syncs device calendar events to Open Invite backend once per day.
 * Only available for Pro users.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDeviceCalendars, getDeviceEvents, hasCalendarPermissions } from "./calendarSync";
import { api } from "./api";

const LAST_SYNC_KEY = "autoSync:lastSync";
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface AutoSyncResult {
  success: boolean;
  synced: boolean;
  imported?: number;
  updated?: number;
  skipped?: number;
  error?: string;
  lastSyncTime?: string;
}

/**
 * Check if auto-sync is due (last sync was more than 24 hours ago)
 */
export async function isAutoSyncDue(): Promise<boolean> {
  try {
    const lastSyncStr = await AsyncStorage.getItem(LAST_SYNC_KEY);
    if (!lastSyncStr) return true; // Never synced before

    const lastSync = new Date(lastSyncStr);
    const now = new Date();
    const timeSinceLastSync = now.getTime() - lastSync.getTime();

    return timeSinceLastSync >= SYNC_INTERVAL_MS;
  } catch (error) {
    console.error("[AutoSync] Failed to check last sync time:", error);
    return false; // Don't sync if we can't determine
  }
}

/**
 * Get the last sync time
 */
export async function getLastSyncTime(): Promise<Date | null> {
  try {
    const lastSyncStr = await AsyncStorage.getItem(LAST_SYNC_KEY);
    return lastSyncStr ? new Date(lastSyncStr) : null;
  } catch {
    return null;
  }
}

/**
 * Record that a sync was performed
 */
async function recordSyncTime(): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  } catch (error) {
    console.error("[AutoSync] Failed to record sync time:", error);
  }
}

/**
 * Perform auto-sync: fetch device calendar events and import them
 *
 * Requirements:
 * - User must be Pro
 * - Calendar permissions must be granted
 * - Last sync was more than 24 hours ago
 */
export async function performAutoSync(options?: {
  forceSync?: boolean; // Ignore 24-hour check
  isPro?: boolean; // Pro status (if already known)
}): Promise<AutoSyncResult> {
  try {
    // Check if sync is due (unless forced)
    if (!options?.forceSync) {
      const isDue = await isAutoSyncDue();
      if (!isDue) {
        const lastSync = await getLastSyncTime();
        return {
          success: true,
          synced: false,
          lastSyncTime: lastSync?.toISOString(),
        };
      }
    }

    // Check Pro status (caller should pass this to avoid extra API call)
    const isPro = options?.isPro ?? false;
    if (!isPro) {
      return {
        success: false,
        synced: false,
        error: "Auto-sync is a Pro feature",
      };
    }

    // Check calendar permissions
    const hasPermissions = await hasCalendarPermissions();
    if (!hasPermissions) {
      if (__DEV__) {
        console.log("[Calendar] Permission not granted — auto-sync skipped");
      }
      return {
        success: false,
        synced: false,
        error: "Calendar permissions not granted",
      };
    }

    // Get all writable calendars on the device
    const calendars = await getDeviceCalendars();
    const writableCalendars = calendars.filter((c) => c.allowsModifications);

    if (writableCalendars.length === 0) {
      return {
        success: false,
        synced: false,
        error: "No writable calendars found",
      };
    }

    // Fetch events from last 7 days to next 90 days (Pro horizon)
    const now = new Date();
    const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const endDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days ahead

    const calendarIds = writableCalendars.map((c) => c.id);
    const deviceEvents = await getDeviceEvents(calendarIds, startDate, endDate);

    if (deviceEvents.length === 0) {
      // No events to sync, but mark as successful
      await recordSyncTime();
      return {
        success: true,
        synced: true,
        imported: 0,
        updated: 0,
        skipped: 0,
        lastSyncTime: new Date().toISOString(),
      };
    }

    // Transform device events to import format
    const eventsToImport = deviceEvents.map((event) => ({
      deviceEventId: event.id,
      title: event.title,
      startTime: event.startDate.toISOString(),
      endTime: event.endDate.toISOString(),
      location: event.location,
      notes: event.notes,
      calendarId: event.calendarId,
      calendarName: event.calendarTitle || "Unknown",
    }));

    // Import events to backend
    const response = await api.post<{
      success: boolean;
      imported: number;
      updated: number;
      skipped: number;
    }>("/api/events/import", {
      events: eventsToImport,
      defaultVisibility: "private", // Auto-synced events default to private
    });

    // Record sync time
    await recordSyncTime();

    return {
      success: true,
      synced: true,
      imported: response.imported,
      updated: response.updated,
      skipped: response.skipped,
      lastSyncTime: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error("[AutoSync] Sync failed:", error);
    return {
      success: false,
      synced: false,
      error: error?.message ?? "Unknown error",
    };
  }
}

/**
 * Clear auto-sync data (used when downgrading from Pro or clearing app data)
 */
export async function clearAutoSyncData(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_SYNC_KEY);
  } catch (error) {
    console.error("[AutoSync] Failed to clear sync data:", error);
  }
}
