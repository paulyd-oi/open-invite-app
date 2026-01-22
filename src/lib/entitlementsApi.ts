/**
 * Entitlements API
 * 
 * Simple API helper for fetching entitlements from backend.
 * Uses existing api wrapper patterns.
 */

import { api } from './api';
import type { EntitlementsResponse } from './entitlements';

/**
 * Fetch current user's entitlements from backend
 * GET /api/entitlements
 * 
 * Returns null on error (safe fallback)
 */
export async function fetchEntitlements(): Promise<EntitlementsResponse | null> {
  try {
    const response = await api.get<EntitlementsResponse>('/api/entitlements');
    return response;
  } catch (error) {
    if (__DEV__) {
      console.log('[EntitlementsApi] fetchEntitlements error:', error);
    }
    return null;
  }
}
