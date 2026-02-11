/**
 * DEV-only convergence timeline proof.
 *
 * Measures delta-ms from "push received" → "query invalidated"
 * → "query refetched" → "UI converged" for a given entity id.
 *
 * ALWAYS-ON via [P0_TIMELINE] tag (no extra toggle required).
 * No-op in production builds.
 */

import { devLog } from "@/lib/devLog";

export type TimelineEvent =
  | "push_received"
  | "query_invalidated"
  | "query_refetched"
  | "ui_converged";

const starts = new Map<string, number>();

/**
 * Mark a convergence timeline event for the given entity id.
 *
 * - First mark for an id: sets start time, logs deltaMs=0
 * - Subsequent marks: logs deltaMs = now - start
 * - On "ui_converged": deletes the id to avoid unbounded growth
 */
export function markTimeline(id: string, event: TimelineEvent): void {
  if (!__DEV__) return;

  const now = performance.now();

  if (!starts.has(id)) {
    starts.set(id, now);
    devLog("[P0_TIMELINE]", { id, event, deltaMs: 0 });
  } else {
    const deltaMs = Math.round(now - starts.get(id)!);
    devLog("[P0_TIMELINE]", { id, event, deltaMs });
  }

  if (event === "ui_converged") {
    starts.delete(id);
  }
}
