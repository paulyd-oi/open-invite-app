/**
 * Boot Authority Hook
 * 
 * Singleton auth bootstrap state management. Bootstrap runs ONCE per app launch.
 * All components subscribe to the shared module-level state.
 * 
 * Bootstrap only re-runs when:
 * - Explicit retry() call
 * - Token state changes (logout/login)
 * - App relaunches
 * 
 * Multiple useBootAuthority() calls do NOT trigger multiple bootstraps.
 */

import { useState, useEffect, useRef } from 'react';
import { bootstrapAuthWithWatchdog } from '@/lib/authBootstrap';
import { devLog, devError, devWarn } from '@/lib/devLog';

export type BootStatus = 'loading' | 'authed' | 'onboarding' | 'loggedOut' | 'error' | 'degraded';

interface UseBootAuthorityResult {
  status: BootStatus;
  error?: string;
  retry: () => void;
}

// ========== SINGLETON STATE ==========
// Module-level state shared across all hook instances
let globalStatus: BootStatus = 'loading';
let globalError: string | undefined = undefined;
let hasBootstrappedOnce = false;
let inFlightBootstrap: Promise<Awaited<ReturnType<typeof bootstrapAuthWithWatchdog>>> | null = null;
let refreshRequestId = 0; // Counter incremented to request forced bootstrap refresh

// Subscribers for state updates
const subscribers = new Set<(status: BootStatus, error?: string) => void>();

function notifySubscribers() {
  subscribers.forEach(callback => callback(globalStatus, globalError));
}

function setGlobalState(status: BootStatus, error?: string) {
  const prevStatus = globalStatus;
  globalStatus = status;
  globalError = error;
  
  // INVARIANT C: Log state transitions for debugging
  if (__DEV__) {
    devLog('[P0_BOOT_STATE]', `${prevStatus} → ${status}`, error ? `error: ${error}` : '');
  }
  
  notifySubscribers();
}
// =====================================

export function useBootAuthority(): UseBootAuthorityResult {
  const [status, setStatus] = useState<BootStatus>(globalStatus);
  const [error, setError] = useState<string | undefined>(globalError);
  const hasRunRef = useRef(false);
  const lastSeenRequestIdRef = useRef(0);

  // Subscribe to global state updates
  useEffect(() => {
    const callback = (newStatus: BootStatus, newError?: string) => {
      setStatus(newStatus);
      setError(newError);
    };
    
    subscribers.add(callback);
    
    // Sync with current global state immediately
    setStatus(globalStatus);
    setError(globalError);
    
    return () => {
      subscribers.delete(callback);
    };
  }, []);

  // Bootstrap ONCE per app launch (singleton)
  useEffect(() => {
    // Check if a refresh was requested (counter changed)
    const refreshRequested = refreshRequestId > lastSeenRequestIdRef.current;

    // If already bootstrapped and no refresh requested, skip
    if (hasBootstrappedOnce && !refreshRequested) {
      devLog('[BOOT_AUTHORITY]', 'Bootstrap already ran - skipping');
      return;
    }

    // If refresh requested, allow re-run
    if (refreshRequested) {
      devLog('[BOOT_AUTHORITY]', 'Refresh requested (id=' + refreshRequestId + ') - allowing re-run');
      hasBootstrappedOnce = false;
    }

    // If bootstrap in flight, skip
    if (inFlightBootstrap) {
      devLog('[BOOT_AUTHORITY]', 'Bootstrap already in flight - skipping');
      return;
    }

    // Prevent duplicate runs from concurrent mounts
    if (hasRunRef.current) {
      return;
    }
    hasRunRef.current = true;

    devLog('[BOOT_AUTHORITY]', 'Starting bootstrap...');

    const runBootstrap = async () => {
      try {
        inFlightBootstrap = bootstrapAuthWithWatchdog();
        const result = await inFlightBootstrap;
        mapBootstrapResultToGlobalStatus(result);
        hasBootstrappedOnce = true;
        lastSeenRequestIdRef.current = refreshRequestId;
      } catch (err) {
        devError('[BOOT_AUTHORITY]', 'Bootstrap error:', err);
        setGlobalState('error', err instanceof Error ? err.message : String(err));
        hasBootstrappedOnce = true;
        lastSeenRequestIdRef.current = refreshRequestId;
      } finally {
        inFlightBootstrap = null;
      }
    };

    runBootstrap();
  }, []);

  // Explicit retry - resets singleton and re-runs bootstrap
  const retry = () => {
    if (globalStatus === 'degraded' || globalStatus === 'error') {
      devLog('[BOOT_AUTHORITY]', 'Explicit retry - resetting singleton...');
      
      // Reset singleton state
      hasBootstrappedOnce = false;
      inFlightBootstrap = null;
      hasRunRef.current = false;
      setGlobalState('loading');
      
      // Re-run bootstrap
      const runBootstrap = async () => {
        try {
          inFlightBootstrap = bootstrapAuthWithWatchdog();
          const result = await inFlightBootstrap;
          mapBootstrapResultToGlobalStatus(result);
          hasBootstrappedOnce = true;
        } catch (err) {
          devError('[BOOT_AUTHORITY]', 'Retry error:', err);
          setGlobalState('error', err instanceof Error ? err.message : String(err));
          hasBootstrappedOnce = true;
        } finally {
          inFlightBootstrap = null;
        }
      };
      runBootstrap();
    }
  };

  return { status, error, retry };
}

// Helper to map bootstrap result to global status (singleton)
function mapBootstrapResultToGlobalStatus(
  result: Awaited<ReturnType<typeof bootstrapAuthWithWatchdog>>
) {
  devLog('[BOOT_AUTHORITY]', 'Bootstrap complete:', result.state);

  if (result.timedOut) {
    devError('[BOOT_AUTHORITY]', 'Bootstrap timed out');
    setGlobalState('error', 'Bootstrap timeout');
    return;
  }

  if (result.error && result.state !== 'degraded') {
    devError('[BOOT_AUTHORITY]', 'Bootstrap error:', result.error);
    setGlobalState('error', result.error);
    return;
  }

  // Map bootstrap state to boot status
  switch (result.state) {
    case 'loggedOut':
      setGlobalState('loggedOut');
      break;
    case 'onboarding':
      setGlobalState('onboarding');
      break;
    case 'authed':
      setGlobalState('authed');
      break;
    case 'degraded':
      setGlobalState('degraded', result.error);
      break;
    default:
      devWarn('[BOOT_AUTHORITY]', 'Unknown bootstrap state:', result.state);
      setGlobalState('error', 'Unknown bootstrap state');
  }
}

// Export for logout flow to reset singleton
export function resetBootAuthority() {
  devLog('[BOOT_AUTHORITY]', 'Resetting singleton for logout...');
  hasBootstrappedOnce = false;
  inFlightBootstrap = null;
  setGlobalState('loading');
}

// Export for post-login flow to force immediate re-bootstrap
// Returns the final boot status so caller can route directly
export async function rebootstrapAfterLogin(): Promise<BootStatus> {
  devLog('[P0_WHITE_LOGIN]', 'Post-login rebootstrap - resetting singleton and running bootstrap...');
  
  // Reset singleton state
  hasBootstrappedOnce = false;
  inFlightBootstrap = null;
  setGlobalState('loading');
  
  // Immediately run bootstrap
  try {
    inFlightBootstrap = bootstrapAuthWithWatchdog();
    const result = await inFlightBootstrap;
    mapBootstrapResultToGlobalStatus(result);
    hasBootstrappedOnce = true;
    devLog('[P0_WHITE_LOGIN]', 'Post-login rebootstrap complete, status:', globalStatus);
    return globalStatus;
  } catch (err) {
    devError('[P0_WHITE_LOGIN]', 'Post-login bootstrap error:', err);
    setGlobalState('error', err instanceof Error ? err.message : String(err));
    hasBootstrappedOnce = true;
    return 'error';
  } finally {
    inFlightBootstrap = null;
  }
}

// Export for onboarding completion to request one-time bootstrap refresh
export function requestBootstrapRefreshOnce(): void {
  refreshRequestId++;
  devLog('[BOOT_AUTHORITY]', 'Requesting bootstrap refresh (id=' + refreshRequestId + ')');
}

// Export getter for refresh request ID (for waiting logic)
export function getBootstrapRefreshRequestId(): number {
  return refreshRequestId;
}
