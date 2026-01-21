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

// Subscribers for state updates
const subscribers = new Set<(status: BootStatus, error?: string) => void>();

function notifySubscribers() {
  subscribers.forEach(callback => callback(globalStatus, globalError));
}

function setGlobalState(status: BootStatus, error?: string) {
  globalStatus = status;
  globalError = error;
  notifySubscribers();
}
// =====================================

export function useBootAuthority(): UseBootAuthorityResult {
  const [status, setStatus] = useState<BootStatus>(globalStatus);
  const [error, setError] = useState<string | undefined>(globalError);
  const hasRunRef = useRef(false);

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
    // If already bootstrapped, skip
    if (hasBootstrappedOnce) {
      if (__DEV__) {
        console.log('[BootAuthority] Bootstrap already ran - skipping');
      }
      return;
    }

    // If bootstrap in flight, skip
    if (inFlightBootstrap) {
      if (__DEV__) {
        console.log('[BootAuthority] Bootstrap already in flight - skipping');
      }
      return;
    }

    // Prevent duplicate runs from concurrent mounts
    if (hasRunRef.current) {
      return;
    }
    hasRunRef.current = true;

    if (__DEV__) {
      console.log('[BootAuthority] Starting bootstrap...');
    }

    const runBootstrap = async () => {
      try {
        inFlightBootstrap = bootstrapAuthWithWatchdog();
        const result = await inFlightBootstrap;
        mapBootstrapResultToGlobalStatus(result);
        hasBootstrappedOnce = true;
      } catch (err) {
        console.error('[BootAuthority] Bootstrap error:', err);
        setGlobalState('error', err instanceof Error ? err.message : String(err));
        hasBootstrappedOnce = true;
      } finally {
        inFlightBootstrap = null;
      }
    };

    runBootstrap();
  }, []);

  // Explicit retry - resets singleton and re-runs bootstrap
  const retry = () => {
    if (globalStatus === 'degraded' || globalStatus === 'error') {
      if (__DEV__) {
        console.log('[BootAuthority] Explicit retry - resetting singleton...');
      }
      
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
          console.error('[BootAuthority] Retry error:', err);
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
  if (__DEV__) {
    console.log('[BootAuthority] Bootstrap complete:', result.state);
  }

  if (result.timedOut) {
    console.error('[BootAuthority] Bootstrap timed out');
    setGlobalState('error', 'Bootstrap timeout');
    return;
  }

  if (result.error && result.state !== 'degraded') {
    console.error('[BootAuthority] Bootstrap error:', result.error);
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
      console.warn('[BootAuthority] Unknown bootstrap state:', result.state);
      setGlobalState('error', 'Unknown bootstrap state');
  }
}

// Export for logout flow to reset singleton
export function resetBootAuthority() {
  if (__DEV__) {
    console.log('[BootAuthority] Resetting singleton for logout...');
  }
  hasBootstrappedOnce = false;
  inFlightBootstrap = null;
  setGlobalState('loading');
}
