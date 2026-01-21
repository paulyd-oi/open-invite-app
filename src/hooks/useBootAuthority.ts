/**
 * Boot Authority Hook
 * 
 * Centralizes auth bootstrap state management for root-level routing decisions.
 * Single source of truth for: "are we loading?", "authed?", "onboarding?", "logged out?"
 * 
 * This hook should be used ONCE at the root level (_layout.tsx) to determine
 * which screen to show initially. It prevents competing redirects from multiple
 * auth checks (token, session cache, session.user, etc).
 * 
 * Deduplicates concurrent bootstrap calls via in-flight promise.
 */

import { useState, useEffect, useRef } from 'react';
import { bootstrapAuthWithWatchdog } from '@/lib/authBootstrap';

export type BootStatus = 'loading' | 'authed' | 'onboarding' | 'loggedOut' | 'error';

interface UseBootAuthorityResult {
  status: BootStatus;
  error?: string;
}

// Module-level in-flight promise to deduplicate concurrent bootstrap calls
let inFlightBootstrap: Promise<Awaited<ReturnType<typeof bootstrapAuthWithWatchdog>>> | null = null;

export function useBootAuthority(): UseBootAuthorityResult {
  const [status, setStatus] = useState<BootStatus>('loading');
  const [error, setError] = useState<string | undefined>();
  const hasRunRef = useRef(false);

  useEffect(() => {
    // Prevent double-run in strict mode
    if (hasRunRef.current) {
      return;
    }
    hasRunRef.current = true;

    const runBootstrap = async () => {
      try {
        // Deduplicate: if another bootstrap is in-flight, reuse it
        if (inFlightBootstrap) {
          if (__DEV__) {
            console.log('[BootAuthority] Using in-flight bootstrap');
          }
          const result = await inFlightBootstrap;
          mapBootstrapResultToStatus(result, setStatus, setError);
          return;
        }

        if (__DEV__) {
          console.log('[BootAuthority] Starting bootstrap...');
        }
        
        // Start new in-flight bootstrap
        inFlightBootstrap = bootstrapAuthWithWatchdog();
        const result = await inFlightBootstrap;
        mapBootstrapResultToStatus(result, setStatus, setError);
      } catch (err) {
        console.error('[BootAuthority] Unexpected error:', err);
        setStatus('error');
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        inFlightBootstrap = null;
      }
    };

    runBootstrap();
  }, []);

  return { status, error };
}

// Helper to map bootstrap result to UI status
function mapBootstrapResultToStatus(
  result: Awaited<ReturnType<typeof bootstrapAuthWithWatchdog>>,
  setStatus: (status: BootStatus) => void,
  setError: (error: string | undefined) => void
) {
  if (__DEV__) {
    console.log('[BootAuthority] Bootstrap complete:', result.state);
  }

  if (result.timedOut) {
    console.error('[BootAuthority] Bootstrap timed out');
    setStatus('error');
    setError('Bootstrap timeout');
    return;
  }

  if (result.error) {
    console.error('[BootAuthority] Bootstrap error:', result.error);
    setStatus('error');
    setError(result.error);
    return;
  }

  // Map bootstrap state to boot status
  switch (result.state) {
    case 'loggedOut':
      setStatus('loggedOut');
      break;
    case 'onboarding':
      setStatus('onboarding');
      break;
    case 'authed':
      setStatus('authed');
      break;
    default:
      console.warn('[BootAuthority] Unknown bootstrap state:', result.state);
      setStatus('error');
      setError('Unknown bootstrap state');
  }
}
