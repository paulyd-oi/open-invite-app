/**
 * useEventColorOverrides — React hook for event color customization
 * 
 * Provides:
 * - colorOverrides: Record of eventId -> color overrides
 * - getOverrideColor: Get override for specific event
 * - setOverrideColor: Set override for specific event
 * - resetColor: Remove override (return to default)
 * - isLoading: Whether overrides are still loading
 */

import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { devLog, devWarn, devError } from "@/lib/devLog";
import {
  loadColorOverrides,
  saveColorOverride,
  removeColorOverride,
  getColorOverride,
  getAllColorOverrides,
} from "@/lib/eventColorOverrides";
import { useSession } from "@/lib/useSession";
import { eventKeys } from "@/lib/eventQueryKeys";
import { api } from "@/lib/api";

interface UseEventColorOverridesResult {
  colorOverrides: Record<string, string>;
  getOverrideColor: (eventId: string | undefined | null) => string | undefined;
  setOverrideColor: (eventId: string, color: string) => Promise<void>;
  resetColor: (eventId: string) => Promise<void>;
  isLoading: boolean;
}

export function useEventColorOverrides(): UseEventColorOverridesResult {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user?.id;
  
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load overrides when user changes
  useEffect(() => {
    if (!userId) {
      setColorOverrides({});
      setIsLoading(false);
      return;
    }

    let mounted = true;
    
    const load = async () => {
      setIsLoading(true);
      try {
        const overrides = await loadColorOverrides(userId);
        if (mounted) {
          setColorOverrides(overrides);
        }
      } catch (error) {
        if (__DEV__) {
          devError("[useEventColorOverrides] Load failed:", error);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [userId]);

  // Get override for specific event
  const getOverrideColor = useCallback(
    (eventId: string | undefined | null): string | undefined => {
      if (!eventId) return undefined;
      return colorOverrides[eventId];
    },
    [colorOverrides]
  );

  // Set override for specific event — saves locally + persists to backend [P0_EVENT_COLOR_UI]
  const setOverrideColor = useCallback(
    async (eventId: string, color: string): Promise<void> => {
      if (!userId) return;

      try {
        await saveColorOverride(userId, eventId, color);
        
        // Update local state
        setColorOverrides((prev) => ({
          ...prev,
          [eventId]: color,
        }));

        // P0 FIX: Invalidate specific keys instead of wildcard
        queryClient.invalidateQueries({ queryKey: eventKeys.single(eventId) });
        queryClient.invalidateQueries({ queryKey: eventKeys.feed() });
        queryClient.invalidateQueries({ queryKey: eventKeys.calendar() });
        
        if (__DEV__) {
          devLog("[P0_EVENT_COLOR_UI]", "setOverrideColor", { eventId, color });
        }

        // Fire-and-forget: persist to backend for cross-device sync
        api.put(`/api/events/${eventId}/color`, { color }).catch((err: unknown) => {
          if (__DEV__) {
            devWarn("[P0_EVENT_COLOR_UI]", "backend_persist_failed", { eventId, error: String(err) });
          }
        });
      } catch (error) {
        if (__DEV__) {
          devError("[useEventColorOverrides] Set failed:", error);
        }
        throw error;
      }
    },
    [userId, queryClient]
  );

  // Reset color to default — removes local + tells backend [P0_EVENT_COLOR_UI]
  const resetColor = useCallback(
    async (eventId: string): Promise<void> => {
      if (!userId) return;

      try {
        await removeColorOverride(userId, eventId);
        
        // Update local state
        setColorOverrides((prev) => {
          const next = { ...prev };
          delete next[eventId];
          return next;
        });

        // P0 FIX: Invalidate specific keys instead of wildcard
        queryClient.invalidateQueries({ queryKey: eventKeys.single(eventId) });
        queryClient.invalidateQueries({ queryKey: eventKeys.feed() });
        queryClient.invalidateQueries({ queryKey: eventKeys.calendar() });
        
        if (__DEV__) {
          devLog("[P0_EVENT_COLOR_UI]", "resetColor", { eventId });
        }

        // Fire-and-forget: clear on backend (null color = reset)
        api.put(`/api/events/${eventId}/color`, { color: null }).catch((err: unknown) => {
          if (__DEV__) {
            devWarn("[P0_EVENT_COLOR_UI]", "backend_reset_failed", { eventId, error: String(err) });
          }
        });
      } catch (error) {
        if (__DEV__) {
          devError("[useEventColorOverrides] Reset failed:", error);
        }
        throw error;
      }
    },
    [userId, queryClient]
  );

  return {
    colorOverrides,
    getOverrideColor,
    setOverrideColor,
    resetColor,
    isLoading,
  };
}
