/**
 * Scheduling Format — SSOT display strings for slot availability.
 *
 * Every UI surface that renders availability counts/labels for scheduling
 * slots must call these helpers instead of inlining formatting logic.
 *
 * Internally delegates to getAvailabilityLabel() from smartCopy for the
 * "special" labels ("Everyone free", "Great overlap", "Only 1 free") and
 * provides consistent fallback formatting for all other cases.
 *
 * SSOT tag: [SCHED_FORMAT_V1]
 */

import { getAvailabilityLabel } from "@/lib/smartCopy";

/**
 * Verbose availability string for a scheduling slot.
 *
 * Returns:
 *  - "Everyone free"     (100 %)
 *  - "Great overlap"     (≥ 70 %)
 *  - "Only 1 free"       (exactly 1)
 *  - "3 of 5 available"  (all other cases)
 *
 * Never returns null — always a displayable string.
 */
export function formatSlotAvailability(availableCount: number, totalMembers: number): string {
  const label = getAvailabilityLabel({ availableCount, totalMembers });
  return label ?? `${availableCount} of ${totalMembers} available`;
}

/**
 * Compact availability string for a scheduling slot (list rows, tight UI).
 *
 * Returns:
 *  - "Everyone free"     (100 %)
 *  - "Great overlap"     (≥ 70 %)
 *  - "Only 1 free"       (exactly 1)
 *  - "3/5"               (all other cases)
 *
 * Never returns null — always a displayable string.
 */
export function formatSlotAvailabilityCompact(availableCount: number, totalMembers: number): string {
  const label = getAvailabilityLabel({ availableCount, totalMembers });
  return label ?? `${availableCount}/${totalMembers}`;
}

/**
 * Whether a slot has 100 % member availability.
 * Named helper to avoid ad-hoc `availableCount === totalMembers`
 * scattered across UI code.
 */
export function hasPerfectAvailability(availableCount: number, totalMembers: number): boolean {
  return totalMembers > 0 && availableCount === totalMembers;
}
