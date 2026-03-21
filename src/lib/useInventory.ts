/**
 * Inventory Hooks — fetch public spot-counter endpoints (no auth required).
 *
 * Uses a plain fetch (not api.get) because these endpoints are public and
 * must work regardless of auth state (e.g., paywall shown pre-login).
 */

import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/queryKeys";
import { BACKEND_URL } from "@/lib/config";

// ── Types ──────────────────────────────────────────────────────────────

export interface InventorySpots {
  claimed: number;
  total: number;
  remaining: number;
  isSoldOut: boolean;
}

// ── Fetchers ───────────────────────────────────────────────────────────

async function fetchInventory(endpoint: string): Promise<InventorySpots> {
  const res = await fetch(`${BACKEND_URL}${endpoint}`);
  if (!res.ok) throw new Error(`Inventory fetch failed: ${res.status}`);
  return res.json();
}

// ── Hooks ──────────────────────────────────────────────────────────────

export function useFounderSpots() {
  return useQuery({
    queryKey: qk.inventoryFounderSpots(),
    queryFn: () => fetchInventory("/api/inventory/founder-spots"),
    enabled: true, // Public endpoint — no auth gate needed
    staleTime: 60_000, // 1 min — counters don't change fast
    gcTime: 5 * 60_000,
  });
}

export function useEarlyMemberSpots() {
  return useQuery({
    queryKey: qk.inventoryEarlyMemberSpots(),
    queryFn: () => fetchInventory("/api/inventory/early-member-spots"),
    enabled: true, // Public endpoint — no auth gate needed
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}
