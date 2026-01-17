/**
 * Offline Action Queue Module
 *
 * Provides a persistent queue for actions that need to sync when online.
 * Actions are stored in AsyncStorage and replayed when network returns.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

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
  status: "going" | "interested" | "maybe" | "not_going";
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
      return JSON.parse(data);
    }
  } catch (error) {
    if (__DEV__) {
      console.log("[offlineQueue] Error loading queue:", error);
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
      console.log("[offlineQueue] Error saving queue:", error);
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

  const queue = await loadQueue();
  queue.push(action);
  await saveQueue(queue);

  if (__DEV__) {
    console.log("[offlineQueue] Enqueued action:", type, action.id);
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
    action.status = "failed";
    action.error = error;
    action.retryCount = (action.retryCount || 0) + 1;
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
    console.log("[offlineQueue] Removed action:", id);
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
