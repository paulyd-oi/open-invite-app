/**
 * Offline Action Queue Module
 *
 * Provides a persistent queue for actions that need to sync when online.
 * Actions are stored in AsyncStorage and replayed when network returns.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { devLog, devWarn, devError } from "./devLog";
import { trackOfflineActionQueued } from "@/analytics/analyticsEventsSSOT";
import { getPostHogRef, posthogCapture } from "@/analytics/posthogSSOT";

// Simple UUID generator (no external dependency)
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Storage key for the queue
const QUEUE_STORAGE_KEY = "offlineQueue:v1";

// Dead-letter counter persistence
const DEAD_LETTER_STORAGE_KEY = "offlineQueue:deadLetterCount:v1";
let _deadLetterCount = -1; // -1 = not yet loaded from storage

/**
 * Get the cumulative count of actions that exceeded MAX_RETRIES and were dropped.
 * Loads from AsyncStorage on first call, then uses in-memory cache.
 */
export async function getDeadLetterCount(): Promise<number> {
  if (_deadLetterCount >= 0) return _deadLetterCount;
  try {
    const stored = await AsyncStorage.getItem(DEAD_LETTER_STORAGE_KEY);
    _deadLetterCount = stored ? parseInt(stored, 10) || 0 : 0;
  } catch {
    _deadLetterCount = 0;
  }
  return _deadLetterCount;
}

/**
 * Reset the dead-letter counter to zero.
 */
export async function clearDeadLetterCount(): Promise<void> {
  _deadLetterCount = 0;
  try {
    await AsyncStorage.setItem(DEAD_LETTER_STORAGE_KEY, "0");
  } catch {
    // best-effort
  }
}

/** Increment the dead-letter counter by 1 and persist. */
async function _incrementDeadLetterCount(): Promise<void> {
  const current = await getDeadLetterCount();
  _deadLetterCount = current + 1;
  try {
    await AsyncStorage.setItem(DEAD_LETTER_STORAGE_KEY, String(_deadLetterCount));
  } catch {
    // best-effort
  }
}

// Safety rails
const MAX_QUEUE_SIZE = 50;
const MAX_RETRIES = 3;

// Action types that can be queued
export type QueuedActionType = "CREATE_EVENT" | "UPDATE_EVENT" | "RSVP_CHANGE" | "DELETE_RSVP";

// Status of a queued action
export type QueuedActionStatus = "pending" | "processing" | "failed";

// Queued action structure
export interface QueuedAction {
  id: string;
  type: QueuedActionType;
  payload: any;
  createdAt: number;
  status: QueuedActionStatus;
  error?: string;
  retryCount?: number;
  // For local placeholder reconciliation
  localId?: string; // e.g., "local_abc123" for locally created events
}

// Event payload for CREATE_EVENT
export interface CreateEventPayload {
  title: string;
  emoji: string;
  startTime: string;
  endTime?: string;
  location?: string;
  description?: string;
  visibility?: string;
  inviteOnly?: boolean;
  color?: string;
  recurring?: {
    frequency: string;
    interval?: number;
    endDate?: string;
    daysOfWeek?: number[];
  };
}

// Event payload for UPDATE_EVENT
export interface UpdateEventPayload {
  eventId: string;
  updates: Partial<CreateEventPayload>;
}

// RSVP payload for RSVP_CHANGE
export interface RsvpChangePayload {
  eventId: string;
  status: "going" | "interested" | "not_going";
}

// Delete RSVP payload
export interface DeleteRsvpPayload {
  eventId: string;
}

/**
 * Load the queue from storage
 */
export async function loadQueue(): Promise<QueuedAction[]> {
  try {
    const data = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (data) {
      try {
        return JSON.parse(data);
      } catch (parseError) {
        devLog("[OFFLINE_QUEUE_CORRUPT]", { error: parseError });
        await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
        return [];
      }
    }
  } catch (error) {
    if (__DEV__) {
      devLog("[offlineQueue] Error loading queue:", error);
    }
  }
  return [];
}

/**
 * Save the queue to storage
 */
export async function saveQueue(queue: QueuedAction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (error) {
    if (__DEV__) {
      devLog("[offlineQueue] Error saving queue:", error);
    }
  }
}

/**
 * Add an action to the queue
 */
export async function enqueue(
  type: QueuedActionType,
  payload: any,
  localId?: string
): Promise<QueuedAction> {
  const action: QueuedAction = {
    id: generateUUID(),
    type,
    payload,
    createdAt: Date.now(),
    status: "pending",
    localId,
    retryCount: 0,
  };

  let queue = await loadQueue();

  // Evict to stay within MAX_QUEUE_SIZE
  if (queue.length >= MAX_QUEUE_SIZE) {
    // Drop oldest failed items first
    const failedIndices = queue
      .map((a, i) => ({ i, isFailed: a.status === "failed" }))
      .filter((x) => x.isFailed)
      .map((x) => x.i);
    if (failedIndices.length > 0) {
      queue.splice(failedIndices[0], 1);
    } else {
      // Still full: drop oldest overall
      queue.shift();
    }
    if (__DEV__) {
      devWarn("[offlineQueue] Queue full — evicted oldest item to make room");
    }
  }

  queue.push(action);
  await saveQueue(queue);

  // [P1_POSTHOG_OFFLINE_QUEUED] Emit when action is enqueued
  trackOfflineActionQueued({
    actionType: type,
    queueSizeAfter: queue.length,
    retryCount: 0,
  });

  if (__DEV__) {
    devLog("[offlineQueue] Enqueued action:", type, action.id);
  }

  return action;
}

/**
 * Mark an action as processing
 */
export async function markProcessing(id: string): Promise<void> {
  const queue = await loadQueue();
  const action = queue.find((a) => a.id === id);
  if (action) {
    action.status = "processing";
    await saveQueue(queue);
  }
}

/**
 * Mark an action as failed
 */
export async function markFailed(id: string, error: string): Promise<void> {
  const queue = await loadQueue();
  const action = queue.find((a) => a.id === id);
  if (action) {
    action.retryCount = (action.retryCount || 0) + 1;
    if (action.retryCount >= MAX_RETRIES) {
      // Permanently failed — remove from queue to prevent unbounded retry loops
      const newQueue = queue.filter((a) => a.id !== id);
      await saveQueue(newQueue);

      // [P0_OFFLINE_DEAD_LETTER] Log + track dead-lettered action
      devWarn("[P0_OFFLINE_DEAD_LETTER]", {
        actionType: action.type,
        retryCount: action.retryCount,
        id,
        error,
      });

      // Increment persistent dead-letter counter
      await _incrementDeadLetterCount();

      // Emit PostHog event (bypasses typed catalog — this is a P0 observability signal)
      posthogCapture(getPostHogRef(), "offline_action_dead_letter", {
        actionType: action.type,
        retryCount: action.retryCount,
        queueSizeAfter: newQueue.length,
        error,
      });

      return;
    }
    action.status = "failed";
    action.error = error;
    await saveQueue(queue);
  }
}

/**
 * Remove an action from the queue (on success)
 */
export async function removeAction(id: string): Promise<void> {
  const queue = await loadQueue();
  const newQueue = queue.filter((a) => a.id !== id);
  await saveQueue(newQueue);

  if (__DEV__) {
    devLog("[offlineQueue] Removed action:", id);
  }
}

/**
 * Clear all failed actions from the queue
 */
export async function clearFailed(): Promise<void> {
  const queue = await loadQueue();
  const newQueue = queue.filter((a) => a.status !== "failed");
  await saveQueue(newQueue);
}

/**
 * Clear the entire queue
 */
export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
}

/**
 * Get all pending actions (for replay)
 */
export async function getPendingActions(): Promise<QueuedAction[]> {
  const queue = await loadQueue();
  return queue.filter((a) => a.status === "pending" || a.status === "failed");
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  total: number;
  pending: number;
  processing: number;
  failed: number;
}> {
  const queue = await loadQueue();
  return {
    total: queue.length,
    pending: queue.filter((a) => a.status === "pending").length,
    processing: queue.filter((a) => a.status === "processing").length,
    failed: queue.filter((a) => a.status === "failed").length,
  };
}

/**
 * Check if there are any pending actions
 */
export async function hasPendingActions(): Promise<boolean> {
  const queue = await loadQueue();
  return queue.some((a) => a.status === "pending" || a.status === "failed");
}
