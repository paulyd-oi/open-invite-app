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
import {
  loadColorOverrides,
  saveColorOverride,
  removeColorOverride,
  getColorOverride,
  getAllColorOverrides,
} from "@/lib/eventColorOverrides";
import { useSession } from "@/lib/useSession";

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
          console.error("[useEventColorOverrides] Load failed:", error);
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

  // Set override for specific event
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

        // Invalidate calendar queries to refresh UI
        queryClient.invalidateQueries({ queryKey: ["events"] });
        queryClient.invalidateQueries({ queryKey: ["feedEvents"] });
        queryClient.invalidateQueries({ queryKey: ["singleEvent"] });
        
        if (__DEV__) {
          console.log("[useEventColorOverrides] Set color:", { eventId, color });
        }
      } catch (error) {
        if (__DEV__) {
          console.error("[useEventColorOverrides] Set failed:", error);
        }
        throw error;
      }
    },
    [userId, queryClient]
  );

  // Reset color to default
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

        // Invalidate calendar queries to refresh UI
        queryClient.invalidateQueries({ queryKey: ["events"] });
        queryClient.invalidateQueries({ queryKey: ["feedEvents"] });
        queryClient.invalidateQueries({ queryKey: ["singleEvent"] });
        
        if (__DEV__) {
          console.log("[useEventColorOverrides] Reset color:", { eventId });
        }
      } catch (error) {
        if (__DEV__) {
          console.error("[useEventColorOverrides] Reset failed:", error);
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
