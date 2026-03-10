/**
 * Live Activity bridge for iOS event tracking on Lock Screen / Dynamic Island.
 *
 * Privacy: No PII is sent to the Live Activity. Only event title, start time,
 * location name, and RSVP status are displayed.
 *
 * One-active-activity invariant: Starting a new activity automatically
 * ends any existing one.
 *
 * Timer: The Lock Screen countdown is driven by the OS clock via
 * Text(timerInterval:countsDown:). No periodic app updates needed.
 */

import { Platform, NativeModules } from "react-native";
import { devLog, devWarn } from "@/lib/devLog";

const TAG = "[LiveActivity]";

interface LiveActivityBridgeModule {
  startActivity(
    eventId: string,
    eventTitle: string,
    startTimeEpoch: number,
    locationName: string | null,
    rsvpStatus: string,
  ): Promise<{ activityId: string }>;
  updateActivity(
    eventId: string,
    rsvpStatus: string,
    ended: boolean,
  ): Promise<{ updated: boolean }>;
  endActivity(eventId: string | null): Promise<{ ended: number }>;
  getActiveEventId(): Promise<string | null>;
  areActivitiesEnabled(): Promise<boolean>;
}

/**
 * Get the native module, or null if unavailable (Android, old iOS, Expo Go).
 */
function getBridge(): LiveActivityBridgeModule | null {
  if (Platform.OS !== "ios") return null;
  const mod = NativeModules.LiveActivityBridge;
  if (!mod) {
    devWarn(TAG, "Native module not available (Expo Go or old iOS)");
    return null;
  }
  return mod as LiveActivityBridgeModule;
}

/**
 * Check if Live Activities are supported and enabled on this device.
 * Returns false on Android, Expo Go, iOS < 16.1, or if user disabled them.
 */
export async function areLiveActivitiesEnabled(): Promise<boolean> {
  const bridge = getBridge();
  if (!bridge) return false;
  try {
    return await bridge.areActivitiesEnabled();
  } catch {
    return false;
  }
}

/**
 * Start a Live Activity for an event.
 * Automatically ends any existing activity (one-active invariant).
 */
export async function startLiveActivity(params: {
  eventId: string;
  eventTitle: string;
  startTime: string; // ISO 8601
  locationName?: string | null;
  rsvpStatus: string;
}): Promise<boolean> {
  const bridge = getBridge();
  if (!bridge) return false;

  // Convert ISO string to Unix epoch seconds for the native timer
  const startTimeEpoch = new Date(params.startTime).getTime() / 1000;

  try {
    const result = await bridge.startActivity(
      params.eventId,
      params.eventTitle,
      startTimeEpoch,
      params.locationName ?? null,
      params.rsvpStatus,
    );
    devLog(TAG, "Started:", result.activityId);
    return true;
  } catch (e: any) {
    devWarn(TAG, "Start failed:", e?.message);
    return false;
  }
}

/**
 * Update the Live Activity state (RSVP status, ended flag).
 * Countdown is OS-driven — no need to pass time values.
 */
export async function updateLiveActivity(params: {
  eventId: string;
  rsvpStatus: string;
  ended?: boolean;
}): Promise<boolean> {
  const bridge = getBridge();
  if (!bridge) return false;

  try {
    await bridge.updateActivity(
      params.eventId,
      params.rsvpStatus,
      params.ended ?? false,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * End a Live Activity. Pass null to end all.
 */
export async function endLiveActivity(eventId: string | null = null): Promise<void> {
  const bridge = getBridge();
  if (!bridge) return;
  try {
    const result = await bridge.endActivity(eventId);
    devLog(TAG, "Ended:", result.ended, "activities");
  } catch {
    // Silently fail — activity may already be gone
  }
}

/**
 * Get the event ID of the currently active Live Activity, or null.
 */
export async function getActiveLiveActivityEventId(): Promise<string | null> {
  const bridge = getBridge();
  if (!bridge) return null;
  try {
    return await bridge.getActiveEventId();
  } catch {
    return null;
  }
}
