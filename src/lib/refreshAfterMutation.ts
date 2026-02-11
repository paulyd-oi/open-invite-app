/**
 * SSOT Post-Mutation Refresh Contract
 *
 * INVARIANT: After any cross-tab mutation (RSVP, friend, circle),
 * all related query keys must be invalidated to maintain cross-tab consistency.
 *
 * Each helper documents EXACTLY which keys it invalidates and WHY.
 * Mutation call-sites MUST use these helpers in onSettled/onSuccess —
 * no ad-hoc queryClient.invalidateQueries() for cross-tab data.
 *
 * Tag: [POST_MUT_REFRESH]
 */

import type { QueryClient } from "@tanstack/react-query";
import { circleKeys } from "@/lib/circleQueryKeys";
import {
  eventKeys,
  invalidateEventKeys,
  getInvalidateAfterRsvpJoin,
  getInvalidateAfterRsvpLeave,
} from "@/lib/eventQueryKeys";
import { devLog } from "@/lib/devLog";

// ============================================================================
// FRIEND QUERY KEYS (no SSOT factory file yet — inline constants)
// ============================================================================

export const friendKeys = {
  /** All friends list */
  all: () => ["friends"] as const,
  /** Pending friend requests (sent + received) */
  requests: () => ["friendRequests"] as const,
  /** Friend suggestions / people you may know */
  suggestions: () => ["friendSuggestions"] as const,
  /** Pinned friendships */
  pinned: () => ["pinnedFriendships"] as const,
  /** Single user profile (by userId) */
  userProfile: (userId: string) => ["userProfile", userId] as const,
} as const;

// ============================================================================
// HELPER: batch invalidate an array of query keys
// ============================================================================

function batchInvalidate(
  qc: QueryClient,
  keys: Array<readonly string[]>,
  tag: string,
): void {
  if (__DEV__) {
    devLog("[POST_MUT_REFRESH]", tag, {
      keyCount: keys.length,
      keys: keys.map((k) => k.join(".")),
    });
  }
  for (const key of keys) {
    qc.invalidateQueries({ queryKey: key as string[] });
  }
}

// ============================================================================
// FRIEND MUTATIONS
// ============================================================================

/**
 * Call after accepting a friend request.
 *
 * Invalidates:
 *  - friendKeys.all          — friend list changed
 *  - friendKeys.requests     — request removed
 *  - friendKeys.suggestions  — suggestion may disappear
 *  - friendKeys.pinned       — pinned state may change
 *  - friendKeys.userProfile  — isFriend flag on profile page
 *  - circleKeys.all          — circle member lists reference friends
 */
export function refreshAfterFriendAccept(
  qc: QueryClient,
  userId?: string | null,
): void {
  const keys: Array<readonly string[]> = [
    friendKeys.all(),
    friendKeys.requests(),
    friendKeys.suggestions(),
    friendKeys.pinned(),
    circleKeys.all(),
  ];
  if (userId) {
    keys.push(friendKeys.userProfile(userId));
  }
  batchInvalidate(qc, keys, "friend_accept");
}

/**
 * Call after rejecting / declining a friend request.
 *
 * Invalidates:
 *  - friendKeys.requests     — request removed
 *  - friendKeys.suggestions  — suggestion may reappear
 *  - friendKeys.userProfile  — pending state on profile page
 */
export function refreshAfterFriendReject(
  qc: QueryClient,
  userId?: string | null,
): void {
  const keys: Array<readonly string[]> = [
    friendKeys.requests(),
    friendKeys.suggestions(),
  ];
  if (userId) {
    keys.push(friendKeys.userProfile(userId));
  }
  batchInvalidate(qc, keys, "friend_reject");
}

/**
 * Call after sending a friend request.
 *
 * Invalidates:
 *  - friendKeys.requests     — sent request list changed
 *  - friendKeys.suggestions  — suggestion may disappear
 *  - friendKeys.userProfile  — pending state on profile page
 */
export function refreshAfterFriendRequestSent(
  qc: QueryClient,
  userId?: string | null,
): void {
  const keys: Array<readonly string[]> = [
    friendKeys.requests(),
    friendKeys.suggestions(),
  ];
  if (userId) {
    keys.push(friendKeys.userProfile(userId));
  }
  batchInvalidate(qc, keys, "friend_request_sent");
}

/**
 * Call after unfriending someone.
 *
 * Invalidates:
 *  - friendKeys.all          — friend list changed
 *  - friendKeys.requests     — request state may change
 *  - friendKeys.suggestions  — suggestion may reappear
 *  - friendKeys.pinned       — pinned state may change
 *  - friendKeys.userProfile  — isFriend flag on profile page
 *  - circleKeys.all          — circle member lists reference friends
 */
export function refreshAfterUnfriend(
  qc: QueryClient,
  userId?: string | null,
): void {
  const keys: Array<readonly string[]> = [
    friendKeys.all(),
    friendKeys.requests(),
    friendKeys.suggestions(),
    friendKeys.pinned(),
    circleKeys.all(),
  ];
  if (userId) {
    keys.push(friendKeys.userProfile(userId));
  }
  batchInvalidate(qc, keys, "unfriend");
}

// ============================================================================
// CIRCLE MUTATIONS
// ============================================================================

/**
 * Call after leaving a circle.
 *
 * Invalidates:
 *  - circleKeys.all          — circle list changed
 *  - circleKeys.unreadCount  — unread total may change
 *  - circleKeys.single       — detail page stale (if circleId provided)
 *  - friendKeys.all          — friend-circle cross-reference
 */
export function refreshAfterCircleLeave(
  qc: QueryClient,
  circleId?: string | null,
): void {
  const keys: Array<readonly string[]> = [
    circleKeys.all(),
    circleKeys.unreadCount(),
    friendKeys.all(),
  ];
  if (circleId) {
    keys.push(circleKeys.single(circleId));
  }
  batchInvalidate(qc, keys, "circle_leave");
}

/**
 * Call after creating a new circle.
 *
 * Invalidates:
 *  - circleKeys.all          — circle list changed
 *  - circleKeys.unreadCount  — new circle may have unread
 */
export function refreshAfterCircleCreate(qc: QueryClient): void {
  batchInvalidate(
    qc,
    [circleKeys.all(), circleKeys.unreadCount()],
    "circle_create",
  );
}

/**
 * Call after removing a member from a circle.
 *
 * Invalidates:
 *  - circleKeys.all          — member count changed
 *  - circleKeys.single       — detail page stale
 *  - friendKeys.all          — friend-circle cross-reference
 */
export function refreshAfterCircleMemberRemove(
  qc: QueryClient,
  circleId: string,
): void {
  batchInvalidate(
    qc,
    [circleKeys.all(), circleKeys.single(circleId), friendKeys.all()],
    "circle_member_remove",
  );
}

// ============================================================================
// RSVP MUTATIONS (delegates to existing eventQueryKeys SSOT)
// ============================================================================

/**
 * Call after RSVP join/going/interested action.
 * Delegates to getInvalidateAfterRsvpJoin from eventQueryKeys SSOT.
 */
export function refreshAfterRsvpJoin(
  qc: QueryClient,
  eventId: string,
  label?: string,
): void {
  if (__DEV__) {
    devLog("[POST_MUT_REFRESH]", "rsvp_join", { eventId, label });
  }
  invalidateEventKeys(qc, getInvalidateAfterRsvpJoin(eventId), label ?? "rsvp_join");
}

/**
 * Call after RSVP leave/not_going action.
 * Delegates to getInvalidateAfterRsvpLeave from eventQueryKeys SSOT.
 */
export function refreshAfterRsvpLeave(
  qc: QueryClient,
  eventId: string,
  label?: string,
): void {
  if (__DEV__) {
    devLog("[POST_MUT_REFRESH]", "rsvp_leave", { eventId, label });
  }
  invalidateEventKeys(qc, getInvalidateAfterRsvpLeave(eventId), label ?? "rsvp_leave");
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type FriendQueryKey = ReturnType<typeof friendKeys[keyof typeof friendKeys]>;
