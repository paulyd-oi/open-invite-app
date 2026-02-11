/**
 * Media Invalidation SSOT
 *
 * Centralizes cache invalidation for media-related mutations
 * (avatar, banner, event photo, circle photo) so every mutation
 * site uses a single, auditable helper instead of ad-hoc calls.
 *
 * INVARIANT: Uses typed SSOT key builders (eventKeys, circleKeys).
 * No bare-string wildcard invalidations.
 */

import type { QueryClient } from "@tanstack/react-query";
import { eventKeys, invalidateEventKeys } from "./eventQueryKeys";
import { circleKeys } from "./circleQueryKeys";
import { devLog } from "./devLog";

// ── Profile media ────────────────────────────────────────────────
/**
 * Invalidate all caches that display profile media (avatar, banner).
 * Call after avatar upload, banner upload, or profile PUT.
 */
export function invalidateProfileMedia(qc: QueryClient, userId?: string): void {
  if (__DEV__) devLog("[MEDIA_INVALIDATE] profile", { userId: userId?.slice(0, 8) });

  qc.invalidateQueries({ queryKey: ["profile"] });
  qc.invalidateQueries({ queryKey: ["profiles"] });
  qc.invalidateQueries({ queryKey: ["friends"] });

  if (userId) {
    qc.invalidateQueries({ queryKey: ["userProfile", userId] });
  }
}

// ── Event media ──────────────────────────────────────────────────
/**
 * Invalidate caches that display event media (hero photo).
 * Uses SSOT eventKeys — no bare ["events"] wildcard.
 */
export function invalidateEventMedia(qc: QueryClient, eventId?: string): void {
  if (__DEV__) devLog("[MEDIA_INVALIDATE] event", { eventId: eventId?.slice(0, 8) });

  // Feed-level keys so thumbnails refresh
  invalidateEventKeys(qc, [
    eventKeys.feed(),
    eventKeys.feedPaginated(),
    eventKeys.myEvents(),
  ], "media_event_lists");

  if (eventId) {
    qc.invalidateQueries({ queryKey: eventKeys.single(eventId) });
  }
}

// ── Circle media ─────────────────────────────────────────────────
/**
 * Invalidate caches that display circle media (avatar/banner).
 * Uses SSOT circleKeys — no bare ["circles"] wildcard.
 */
export function invalidateCircleMedia(qc: QueryClient, circleId?: string): void {
  if (__DEV__) devLog("[MEDIA_INVALIDATE] circle", { circleId: circleId?.slice(0, 8) });

  qc.invalidateQueries({ queryKey: circleKeys.all() });

  if (circleId) {
    qc.invalidateQueries({ queryKey: circleKeys.single(circleId) });
  }
}
