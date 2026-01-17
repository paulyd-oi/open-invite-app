/**
 * Offline Sync Module
 *
 * Handles:
 * - Queue replay when coming back online
 * - Offline-aware mutations (create event, RSVP)
 * - Reconciliation of local placeholders with server data
 */

import { useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useNetworkStatus, subscribeToNetworkStatus } from "./networkStatus";
import {
  loadQueue,
  markProcessing,
  markFailed,
  removeAction,
  enqueue,
  QueuedAction,
  CreateEventPayload,
  RsvpChangePayload,
  DeleteRsvpPayload,
  UpdateEventPayload,
} from "./offlineQueue";
import {
  useOfflineStore,
  generateLocalEventId,
  LocalEvent,
} from "./offlineStore";
import { toast } from "@/components/Toast";

// Types for API responses
interface CreateEventResponse {
  id: string;
  title: string;
  [key: string]: any;
}

interface RsvpResponse {
  success?: boolean;
  [key: string]: any;
}

/**
 * Execute a single queued action
 * Returns true on success, false on failure
 */
async function executeAction(action: QueuedAction): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    switch (action.type) {
      case "CREATE_EVENT": {
        const payload = action.payload as CreateEventPayload;
        const response = await api.post<CreateEventResponse>("/api/events", payload);
        return { success: true, data: response };
      }

      case "UPDATE_EVENT": {
        const payload = action.payload as UpdateEventPayload;
        const response = await api.patch<any>(`/api/events/${payload.eventId}`, payload.updates);
        return { success: true, data: response };
      }

      case "RSVP_CHANGE": {
        const payload = action.payload as RsvpChangePayload;
        const response = await api.post<RsvpResponse>(`/api/events/${payload.eventId}/rsvp`, {
          status: payload.status,
        });
        return { success: true, data: response };
      }

      case "DELETE_RSVP": {
        const payload = action.payload as DeleteRsvpPayload;
        const response = await api.delete<RsvpResponse>(`/api/events/${payload.eventId}/rsvp`);
        return { success: true, data: response };
      }

      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (error: any) {
    const errorMessage = error?.message || "Unknown error";

    // Check for auth errors (401/403) - these should stop the replay
    if (errorMessage.includes("401") || errorMessage.includes("403") || errorMessage.includes("Unauthorized")) {
      return { success: false, error: errorMessage };
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Replay all pending actions in the queue
 */
export async function replayQueue(
  onProgress?: (current: number, total: number) => void,
  onReconcile?: (localId: string, serverId: string) => void
): Promise<{ success: boolean; failed: number }> {
  const queue = await loadQueue();
  const pendingActions = queue.filter((a) => a.status === "pending" || a.status === "failed");

  if (pendingActions.length === 0) {
    return { success: true, failed: 0 };
  }

  if (__DEV__) {
    console.log(`[OfflineSync] Replaying ${pendingActions.length} actions`);
  }

  let failedCount = 0;

  for (let i = 0; i < pendingActions.length; i++) {
    const action = pendingActions[i];

    // Report progress
    onProgress?.(i + 1, pendingActions.length);

    // Mark as processing
    await markProcessing(action.id);

    // Execute the action
    const result = await executeAction(action);

    if (result.success) {
      // Handle reconciliation for CREATE_EVENT
      if (action.type === "CREATE_EVENT" && action.localId && result.data?.id) {
        onReconcile?.(action.localId, result.data.id);
      }

      // Remove successful action from queue
      await removeAction(action.id);

      if (__DEV__) {
        console.log(`[OfflineSync] Action ${action.id} (${action.type}) succeeded`);
      }
    } else {
      // Mark as failed
      await markFailed(action.id, result.error || "Unknown error");
      failedCount++;

      if (__DEV__) {
        console.log(`[OfflineSync] Action ${action.id} (${action.type}) failed:`, result.error);
      }

      // If it's an auth error, stop replay
      if (result.error?.includes("401") || result.error?.includes("403")) {
        if (__DEV__) {
          console.log("[OfflineSync] Auth error detected, stopping replay");
        }
        break;
      }
    }
  }

  return { success: failedCount === 0, failed: failedCount };
}

/**
 * Hook to handle queue replay when coming back online
 */
export function useOfflineSync() {
  const { isOnline } = useNetworkStatus();
  const queryClient = useQueryClient();
  const wasOfflineRef = useRef(!isOnline);
  const isReplayingRef = useRef(false);

  const setSyncing = useOfflineStore((s) => s.setSyncing);
  const setSyncProgress = useOfflineStore((s) => s.setSyncProgress);
  const reconcileLocalEvent = useOfflineStore((s) => s.reconcileLocalEvent);
  const removeLocalRsvp = useOfflineStore((s) => s.removeLocalRsvp);
  const loadFromStorage = useOfflineStore((s) => s.loadFromStorage);

  // Load offline store on mount
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  // Handle online/offline transitions
  useEffect(() => {
    const handleOnlineTransition = async () => {
      // Check if we just came back online
      if (isOnline && wasOfflineRef.current && !isReplayingRef.current) {
        isReplayingRef.current = true;
        wasOfflineRef.current = false;

        if (__DEV__) {
          console.log("[OfflineSync] Back online, starting queue replay");
        }

        // Start syncing
        setSyncing(true);

        try {
          // Replay the queue
          const result = await replayQueue(
            // Progress callback
            (current, total) => {
              setSyncProgress({ current, total });
            },
            // Reconciliation callback
            (localId, serverId) => {
              reconcileLocalEvent(localId, serverId);
            }
          );

          // Refetch key queries
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["events"] }),
            queryClient.invalidateQueries({ queryKey: ["events", "calendar"] }),
            queryClient.invalidateQueries({ queryKey: ["events", "feed"] }),
          ]);

          // Show result
          if (result.failed > 0) {
            toast.error("Sync Incomplete", `${result.failed} action(s) failed to sync`);
          } else {
            toast.success("Synced", "Your changes have been saved");
          }
        } catch (error) {
          if (__DEV__) {
            console.log("[OfflineSync] Queue replay error:", error);
          }
          toast.error("Sync Failed", "Some changes couldn't be saved");
        } finally {
          setSyncing(false);
          setSyncProgress(null);
          isReplayingRef.current = false;
        }
      }
    };

    handleOnlineTransition();

    // Track offline state
    if (!isOnline) {
      wasOfflineRef.current = true;
    }
  }, [isOnline, queryClient, setSyncing, setSyncProgress, reconcileLocalEvent]);

  return {
    isOnline,
    isSyncing: useOfflineStore((s) => s.isSyncing),
    syncProgress: useOfflineStore((s) => s.syncProgress),
  };
}

/**
 * Hook for offline-aware event creation
 */
export function useOfflineCreateEvent() {
  const { isOnline } = useNetworkStatus();
  const addLocalEvent = useOfflineStore((s) => s.addLocalEvent);

  const createEvent = useCallback(
    async (
      payload: CreateEventPayload,
      userId: string
    ): Promise<{ id: string; isLocal: boolean }> => {
      if (isOnline) {
        // Online: create normally
        const response = await api.post<CreateEventResponse>("/api/events", payload);
        return { id: response.id, isLocal: false };
      }

      // Offline: create local placeholder and queue
      const localId = generateLocalEventId();

      // Create local event placeholder
      const localEvent: LocalEvent = {
        id: localId,
        localId,
        title: payload.title,
        emoji: payload.emoji,
        startTime: payload.startTime,
        endTime: payload.endTime,
        location: payload.location,
        description: payload.description,
        isLocalOnly: true,
        userId,
        visibility: payload.visibility || "friends",
        inviteOnly: payload.inviteOnly || false,
        color: payload.color,
      };

      // Add to local store
      addLocalEvent(localEvent);

      // Queue for later sync
      const action = await enqueue("CREATE_EVENT", payload, localId);
      localEvent.queueActionId = action.id;

      // Show toast
      toast.info("Saved Offline", "Will sync when you're back online");

      if (__DEV__) {
        console.log("[OfflineSync] Created local event:", localId);
      }

      return { id: localId, isLocal: true };
    },
    [isOnline, addLocalEvent]
  );

  return { createEvent, isOnline };
}

/**
 * Hook for offline-aware RSVP changes
 */
export function useOfflineRsvp() {
  const { isOnline } = useNetworkStatus();
  const setLocalRsvp = useOfflineStore((s) => s.setLocalRsvp);
  const removeLocalRsvp = useOfflineStore((s) => s.removeLocalRsvp);

  const changeRsvp = useCallback(
    async (eventId: string, status: "going" | "interested" | "maybe" | "not_going"): Promise<void> => {
      if (isOnline) {
        // Online: change normally
        await api.post(`/api/events/${eventId}/rsvp`, { status });
        return;
      }

      // Offline: update local state and queue
      const localId = `rsvp_${eventId}_${Date.now()}`;

      setLocalRsvp(eventId, {
        eventId,
        status,
        localId,
      });

      await enqueue("RSVP_CHANGE", { eventId, status } as RsvpChangePayload);

      toast.info("Saved Offline", "Will sync when you're back online");

      if (__DEV__) {
        console.log("[OfflineSync] Queued RSVP change:", eventId, status);
      }
    },
    [isOnline, setLocalRsvp]
  );

  const deleteRsvp = useCallback(
    async (eventId: string): Promise<void> => {
      if (isOnline) {
        // Online: delete normally
        await api.delete(`/api/events/${eventId}/rsvp`);
        return;
      }

      // Offline: remove local state and queue
      removeLocalRsvp(eventId);
      await enqueue("DELETE_RSVP", { eventId } as DeleteRsvpPayload);

      toast.info("Saved Offline", "Will sync when you're back online");

      if (__DEV__) {
        console.log("[OfflineSync] Queued RSVP delete:", eventId);
      }
    },
    [isOnline, removeLocalRsvp]
  );

  return { changeRsvp, deleteRsvp, isOnline };
}
