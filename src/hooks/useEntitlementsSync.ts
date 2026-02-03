/**
 * useEntitlementsSync Hook
 * 
 * Triggers entitlements fetch once when bootStatus becomes 'authed'.
 * Uses existing useEntitlements hook from entitlements.ts.
 * 
 * - One-shot per app launch
 * - Never blocks UI
 * - Falls back to cached/default entitlements on error
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { devLog } from '@/lib/devLog';

interface UseEntitlementsSyncOptions {
  /** bootStatus from useBootAuthority */
  bootStatus: string;
}

/**
 * Hook to sync entitlements when user becomes authenticated.
 * Should be called in root layout (BootRouter) to ensure early fetch.
 */
export function useEntitlementsSync({ bootStatus }: UseEntitlementsSyncOptions) {
  const queryClient = useQueryClient();
  const hasSyncedRef = useRef(false);

  useEffect(() => {
    // Guard: Only sync once per app launch
    if (hasSyncedRef.current) {
      return;
    }

    // Guard: Must be fully authenticated
    if (bootStatus !== 'authed') {
      return;
    }

    hasSyncedRef.current = true;

    devLog('[useEntitlementsSync] Triggering entitlements fetch on authed');

    // Invalidate entitlements query to trigger fresh fetch
    // useEntitlements() uses react-query which will handle the actual fetch
    queryClient.invalidateQueries({ queryKey: ['entitlements'] });
  }, [bootStatus, queryClient]);
}
