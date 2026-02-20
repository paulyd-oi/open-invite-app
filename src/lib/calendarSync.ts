import * as Calendar from "expo-calendar";
import { Platform, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requestCalendarPermission } from "./permissions";
import { devLog, devWarn, devError } from "./devLog";

// AsyncStorage keys for sync mapping
const SYNC_MAPPING_PREFIX = "calendarSync:event:";
const SYNC_CALENDAR_KEY = "calendarSync:calendarId";

// Marker for Open Invite synced events (prevents re-import loopback)
const OPEN_INVITE_MARKER_PREFIX = "OID:";
export const OPEN_INVITE_SYNC_MARKER = "— Synced from Open Invite";

export interface CalendarPermissionResult {
  granted: boolean;
  status: string;
  canAskAgain: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  notes?: string;
  calendarId: string;
  calendarTitle?: string;
  calendarColor?: string;
}

export interface DeviceCalendar {
  id: string;
  title: string;
  color: string;
  source: string;
  isPrimary: boolean;
  allowsModifications: boolean;
}

// Request calendar permissions with user-friendly explanation
export async function requestCalendarPermissions(): Promise<boolean> {
  return requestCalendarPermission();
}

// Check calendar permission status with detailed result
export async function checkCalendarPermission(): Promise<CalendarPermissionResult> {
  try {
    const { status, canAskAgain } = await Calendar.getCalendarPermissionsAsync();

    // iOS considers both "granted" and potentially "limited" as granted
    // expo-calendar returns "granted" | "denied" | "undetermined"
    const granted = status === "granted";

    return {
      granted,
      status,
      canAskAgain: canAskAgain !== false, // Default to true if undefined
    };
  } catch (error) {
    devError("Failed to check calendar permissions:", error);
    return {
      granted: false,
      status: "undetermined",
      canAskAgain: true,
    };
  }
}

// Check if we have calendar permissions (backwards compatible)
export async function hasCalendarPermissions(): Promise<boolean> {
  const result = await checkCalendarPermission();
  return result.granted;
}

// Open device settings for the app
export function openAppSettings(): void {
  Linking.openSettings();
}

// Get all calendars on the device
export async function getDeviceCalendars(): Promise<DeviceCalendar[]> {
  try {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    return calendars.map((cal) => ({
      id: cal.id,
      title: cal.title,
      color: cal.color ?? "#007AFF",
      source: cal.source?.name ?? "Unknown",
      isPrimary: cal.isPrimary ?? false,
      allowsModifications: cal.allowsModifications ?? false,
    }));
  } catch (error) {
    if (__DEV__) {
      devError("Failed to get calendars:", error);
    }
    return [];
  }
}

// Get the default calendar for adding events
export async function getDefaultCalendarId(): Promise<string | null> {
  try {
    if (Platform.OS === "ios") {
      const defaultCalendar = await Calendar.getDefaultCalendarAsync();
      return defaultCalendar?.id ?? null;
    } else {
      // On non-iOS, find the primary calendar or first writable one
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const primary = calendars.find((c) => c.isPrimary && c.allowsModifications);
      const writable = calendars.find((c) => c.allowsModifications);
      return primary?.id ?? writable?.id ?? null;
    }
  } catch (error) {
    if (__DEV__) {
      devError("Failed to get default calendar:", error);
    }
    return null;
  }
}

// Get events from device calendars for a date range
export async function getDeviceEvents(
  calendarIds: string[],
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  try {
    if (calendarIds.length === 0) return [];

    const events = await Calendar.getEventsAsync(calendarIds, startDate, endDate);
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const calendarMap = new Map(calendars.map((c) => [c.id, c]));

    return events.map((event) => {
      const calendar = calendarMap.get(event.calendarId);
      return {
        id: event.id,
        title: event.title,
        startDate: new Date(event.startDate),
        endDate: new Date(event.endDate),
        location: event.location ?? undefined,
        notes: event.notes ?? undefined,
        calendarId: event.calendarId,
        calendarTitle: calendar?.title,
        calendarColor: calendar?.color ?? "#007AFF",
      };
    });
  } catch (error) {
    if (__DEV__) {
      devError("Failed to get device events:", error);
    }
    return [];
  }
}

// Export an event to the device calendar
export async function exportEventToCalendar(
  event: {
    title: string;
    startDate: Date;
    endDate?: Date;
    location?: string;
    notes?: string;
    alarmMinutesBefore?: number;
  },
  calendarId?: string
): Promise<string | null> {
  try {
    const targetCalendarId = calendarId ?? (await getDefaultCalendarId());
    if (!targetCalendarId) {
      if (__DEV__) {
        devError("No calendar available");
      }
      return null;
    }

    const eventDetails: Omit<Partial<Calendar.Event>, 'id' | 'organizer'> = {
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate ?? new Date(event.startDate.getTime() + 60 * 60 * 1000), // Default 1 hour
      location: event.location,
      notes: event.notes,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      alarms: event.alarmMinutesBefore !== undefined
        ? [{ relativeOffset: -event.alarmMinutesBefore }]
        : undefined,
    };

    const eventId = await Calendar.createEventAsync(targetCalendarId, eventDetails);
    return eventId;
  } catch (error) {
    if (__DEV__) {
      devError("Failed to export event:", error);
    }
    return null;
  }
}

// Delete an event from device calendar
export async function deleteEventFromCalendar(eventId: string): Promise<boolean> {
  try {
    await Calendar.deleteEventAsync(eventId);
    return true;
  } catch (error) {
    if (__DEV__) {
      devError("Failed to delete event:", error);
    }
    return false;
  }
}

// Check if an event conflicts with device calendar events
export async function checkEventConflicts(
  calendarIds: string[],
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  const events = await getDeviceEvents(calendarIds, startDate, endDate);
  return events.filter((event) => {
    // Check for overlap
    return event.startDate < endDate && event.endDate > startDate;
  });
}

// ============================================
// SYNC MAPPING FUNCTIONS (Idempotent Sync)
// ============================================

/**
 * Get the device calendar event ID for a synced Open Invite event
 */
export async function getSyncMapping(eventId: string): Promise<string | null> {
  try {
    const deviceEventId = await AsyncStorage.getItem(`${SYNC_MAPPING_PREFIX}${eventId}`);
    return deviceEventId;
  } catch (error) {
    if (__DEV__) {
      devError("Failed to get sync mapping:", error);
    }
    return null;
  }
}

/**
 * Store the mapping between Open Invite event ID and device calendar event ID
 */
export async function setSyncMapping(eventId: string, deviceEventId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${SYNC_MAPPING_PREFIX}${eventId}`, deviceEventId);
  } catch (error) {
    if (__DEV__) {
      devError("Failed to set sync mapping:", error);
    }
  }
}

/**
 * Remove sync mapping for an event
 */
export async function removeSyncMapping(eventId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${SYNC_MAPPING_PREFIX}${eventId}`);
  } catch (error) {
    if (__DEV__) {
      devError("Failed to remove sync mapping:", error);
    }
  }
}

/**
 * Check if an Open Invite event is synced to device calendar
 */
export async function isEventSynced(eventId: string): Promise<boolean> {
  const mapping = await getSyncMapping(eventId);
  if (!mapping) return false;

  // Verify the device event still exists
  try {
    const event = await Calendar.getEventAsync(mapping);
    return event != null;
  } catch {
    // Event no longer exists, clean up mapping
    await removeSyncMapping(eventId);
    return false;
  }
}

/**
 * Get or select the target calendar for syncing events
 * Uses stored preference or falls back to default/first writable calendar
 */
export async function getOrSelectSyncCalendar(): Promise<string | null> {
  try {
    // Check for stored preference
    const storedCalendarId = await AsyncStorage.getItem(SYNC_CALENDAR_KEY);
    if (storedCalendarId) {
      // Verify it still exists and is writable
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const exists = calendars.find((c) => c.id === storedCalendarId && c.allowsModifications);
      if (exists) {
        return storedCalendarId;
      }
      // Calendar no longer valid, clear preference
      await AsyncStorage.removeItem(SYNC_CALENDAR_KEY);
    }

    // Fall back to default calendar
    const defaultId = await getDefaultCalendarId();
    if (defaultId) {
      await AsyncStorage.setItem(SYNC_CALENDAR_KEY, defaultId);
      return defaultId;
    }

    return null;
  } catch (error) {
    if (__DEV__) {
      devError("Failed to get sync calendar:", error);
    }
    return null;
  }
}

export interface SyncEventInput {
  id: string;
  title: string;
  startTime: string | Date;
  endTime?: string | Date | null;
  location?: string | null;
  description?: string | null;
  emoji?: string;
}

export interface SyncResult {
  success: boolean;
  isUpdate: boolean;
  deviceEventId?: string;
  calendarTitle?: string;
  error?: string;
}

/**
 * Sync an Open Invite event to the device calendar.
 * Idempotent: creates new event or updates existing one based on mapping.
 */
export async function syncEventToDeviceCalendar(event: SyncEventInput): Promise<SyncResult> {
  try {
    // Get target calendar
    const calendarId = await getOrSelectSyncCalendar();
    if (!calendarId) {
      return {
        success: false,
        isUpdate: false,
        error: "No writable calendar found on device",
      };
    }

    // Get calendar info for the result
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const targetCalendar = calendars.find((c) => c.id === calendarId);

    // Prepare event details
    const startDate = typeof event.startTime === "string" ? new Date(event.startTime) : event.startTime;
    const endDate = event.endTime
      ? typeof event.endTime === "string" ? new Date(event.endTime) : event.endTime
      : new Date(startDate.getTime() + 60 * 60 * 1000); // Default 1 hour

    const eventTitle = event.emoji ? `${event.emoji} ${event.title}` : event.title;
    // Include OID marker to prevent re-import (dedupe)
    const eventNotes = event.description
      ? `${event.description}\n\n${OPEN_INVITE_SYNC_MARKER} (${OPEN_INVITE_MARKER_PREFIX}${event.id})`
      : `${OPEN_INVITE_SYNC_MARKER} (${OPEN_INVITE_MARKER_PREFIX}${event.id})`;

    const eventDetails: Omit<Partial<Calendar.Event>, 'id' | 'organizer'> = {
      title: eventTitle,
      startDate,
      endDate,
      location: event.location ?? undefined,
      notes: eventNotes,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      alarms: [{ relativeOffset: -30 }], // 30 minutes before
    };

    // Check for existing sync
    const existingDeviceEventId = await getSyncMapping(event.id);

    if (existingDeviceEventId) {
      // Try to update existing event
      try {
        await Calendar.updateEventAsync(existingDeviceEventId, eventDetails);
        return {
          success: true,
          isUpdate: true,
          deviceEventId: existingDeviceEventId,
          calendarTitle: targetCalendar?.title,
        };
      } catch (updateError) {
        // Event might have been deleted, create new one
        if (__DEV__) {
          devLog("Existing event not found, creating new:", updateError);
        }
        await removeSyncMapping(event.id);
      }
    }

    // Create new event
    const newDeviceEventId = await Calendar.createEventAsync(calendarId, eventDetails);
    await setSyncMapping(event.id, newDeviceEventId);

    return {
      success: true,
      isUpdate: false,
      deviceEventId: newDeviceEventId,
      calendarTitle: targetCalendar?.title,
    };
  } catch (error: any) {
    if (__DEV__) {
      devError("Failed to sync event to device calendar:", error);
    }
    return {
      success: false,
      isUpdate: false,
      error: error?.message ?? "Failed to sync event",
    };
  }
}

/**
 * Check if a device calendar event was originally synced from Open Invite.
 * Returns the Open Invite event ID if found, null otherwise.
 */
export function extractOpenInviteEventId(notes: string | undefined | null): string | null {
  if (!notes) return null;
  
  // Look for OID: marker in notes
  const match = notes.match(/OID:([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Check if a device calendar event should be skipped during import
 * (i.e., it was originally exported from Open Invite)
 */
export function isOpenInviteExportedEvent(notes: string | undefined | null): boolean {
  return extractOpenInviteEventId(notes) !== null;
}
