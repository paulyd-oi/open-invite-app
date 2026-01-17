/**
 * Network Status Module
 *
 * Provides centralized network state detection and management.
 * Uses @react-native-community/netinfo for cross-platform network monitoring.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Storage key for persisted network state (for edge cases)
const NETWORK_STATE_KEY = "network_state_cache";

// Singleton state for network status
let globalIsOnline = true;
const listeners = new Set<(isOnline: boolean) => void>();

/**
 * Initialize network monitoring (call once at app startup)
 */
export function initNetworkMonitoring() {
  // Subscribe to network state changes
  NetInfo.addEventListener((state: NetInfoState) => {
    const online = !!(state.isConnected && state.isInternetReachable !== false);

    // Only notify if state changed
    if (online !== globalIsOnline) {
      const wasOffline = !globalIsOnline;
      globalIsOnline = online;

      // Notify all listeners
      listeners.forEach((listener) => listener(online));

      // Log state change in dev
      if (__DEV__) {
        console.log(`[NetworkStatus] ${wasOffline ? "Back online" : "Gone offline"}`);
      }
    }
  });

  // Check initial state
  NetInfo.fetch().then((state: NetInfoState) => {
    globalIsOnline = !!(state.isConnected && state.isInternetReachable !== false);
  });
}

/**
 * Get current network status synchronously
 */
export function isOnline(): boolean {
  return globalIsOnline;
}

/**
 * Subscribe to network status changes
 * @returns Unsubscribe function
 */
export function subscribeToNetworkStatus(
  listener: (isOnline: boolean) => void
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Hook for using network status in components
 */
export function useNetworkStatus(): {
  isOnline: boolean;
  isOffline: boolean;
  refresh: () => Promise<boolean>;
} {
  const [online, setOnline] = useState(globalIsOnline);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Sync with global state
    setOnline(globalIsOnline);

    // Subscribe to changes
    const unsubscribe = subscribeToNetworkStatus((newOnline) => {
      if (mountedRef.current) {
        setOnline(newOnline);
      }
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    const state = await NetInfo.fetch();
    const online = !!(state.isConnected && state.isInternetReachable !== false);
    globalIsOnline = online;
    if (mountedRef.current) {
      setOnline(online);
    }
    return online;
  }, []);

  return {
    isOnline: online,
    isOffline: !online,
    refresh,
  };
}

/**
 * Check if an error is a network error (vs a server error)
 */
export function isNetworkError(error: any): boolean {
  if (!error) return false;

  const message = error.message?.toLowerCase() || "";
  const name = error.name?.toLowerCase() || "";

  // Common network error indicators
  const networkErrorPatterns = [
    "network request failed",
    "network error",
    "failed to fetch",
    "timeout",
    "econnrefused",
    "enotfound",
    "enetunreach",
    "econnreset",
    "unable to resolve host",
    "no internet",
    "offline",
    "the internet connection appears to be offline",
    "a server with the specified hostname could not be found",
  ];

  return networkErrorPatterns.some(
    (pattern) => message.includes(pattern) || name.includes(pattern)
  );
}

/**
 * Check if a response status indicates a true auth failure
 * (as opposed to network/server errors)
 */
export function isAuthError(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

/**
 * Determine if an error should trigger logout
 * Only true auth errors (401/403 from server) should cause logout
 * Network errors, 5xx, timeouts should NOT cause logout
 */
export function shouldLogoutOnError(error: any): boolean {
  // Network errors - never logout
  if (isNetworkError(error)) {
    return false;
  }

  // Check for HTTP status in error
  const status = error?.status || error?.response?.status;

  // Only 401/403 from actual server response should trigger logout
  if (isAuthError(status)) {
    return true;
  }

  // Check error message for auth-specific errors
  const message = error?.message?.toLowerCase() || "";
  if (
    message.includes("unauthorized") ||
    message.includes("session expired") ||
    message.includes("invalid token") ||
    message.includes("not authenticated")
  ) {
    // But only if not a network error
    return !isNetworkError(error);
  }

  // Default: don't logout
  return false;
}
