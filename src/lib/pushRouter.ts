/**
 * Push Event Router v1 - Single Source of Truth for Push-Driven Query Updates
 * 
 * INVARIANT: All in-app push notification handling routes through handlePushEvent()
 * INVARIANT: Never invalidates broad roots like ["events"] or ["circles"]
 * INVARIANT: Uses eventKeys.* and circleKeys.* SSOT builders only
 * 
 * Features:
 * - Dedupe: Ignores duplicate events with same (type, entityId, version) for 8s window
 * - SSOT-aligned: Targets owner queries (eventKeys.single, circleKeys.messages, etc.)
 * - Patch-when-safe: Updates query data directly if payload provides safe delta
 * - Logs: [P1_PUSH_ROUTER] tag for all operations in DEV mode
 */

import type { QueryClient } from "@tanstack/react-query";
import { eventKeys } from "@/lib/eventQueryKeys";
import { circleKeys } from "@/lib/circleQueryKeys";
import { getActiveCircle } from "@/lib/activeCircle";
import { devLog } from "@/lib/devLog";
import { recordPushReceipt } from "@/lib/push/pushReceiptStore";

// ============================================================================
// DEDUPE MECHANISM
// ============================================================================

interface DedupeEntry {
  key: string;
  timestamp: number;
}

const dedupeMap = new Map<string, DedupeEntry>();
const DEDUPE_TTL_MS = 8000; // 8 seconds

/**
 * Cleanup expired dedupe entries (TTL-based)
 */
function cleanupDedupeMap(): void {
  const now = Date.now();
  const entries = Array.from(dedupeMap.entries());
  for (const [key, entry] of entries) {
    if (now - entry.timestamp > DEDUPE_TTL_MS) {
      dedupeMap.delete(key);
    }
  }
}

/**
 * Check if event should be deduped
 * @returns true if event is duplicate and should be skipped
 */
function shouldDedupe(type: string, entityId: string, version?: string | number): boolean {
  cleanupDedupeMap();
  
  const dedupeKey = `${type}:${entityId}:${version ?? "no-version"}`;
  
  if (dedupeMap.has(dedupeKey)) {
    return true; // Duplicate detected
  }
  
  // Record this event
  dedupeMap.set(dedupeKey, {
    key: dedupeKey,
    timestamp: Date.now(),
  });
  
  return false;
}

// ============================================================================
// PUSH EVENT TYPES & PAYLOADS
// ============================================================================

export type PushEventType =
  | "circle_message"
  | "event_rsvp_changed"
  | "event_updated"
  | "event_created"
  | "event_comment"
  | "friend_request"
  | "friend_accepted"
  | "join_request"
  | "join_accepted";

export interface BasePushPayload {
  type: PushEventType;
  entityId: string;
  version?: string | number;
  updatedAt?: string;
}

export interface CircleMessagePayload extends BasePushPayload {
  type: "circle_message";
  circleId: string;
  messageId?: string;
  message?: {
    id: string;
    text: string;
    userId: string;
    senderId?: string;
    createdAt: string;
    readBy?: string[];
  };
}

export interface EventRsvpChangedPayload extends BasePushPayload {
  type: "event_rsvp_changed";
  eventId: string;
  goingCount?: number;
  capacity?: number | null;
  isFull?: boolean;
  deltaGoing?: number;
  action?: "join" | "leave";
  userId?: string;
  user?: { id: string; name?: string; avatarUrl?: string };
}

export interface EventUpdatedPayload extends BasePushPayload {
  type: "event_updated";
  eventId: string;
}

export interface EventCreatedPayload extends BasePushPayload {
  type: "event_created";
  eventId: string;
}

export interface EventCommentPayload extends BasePushPayload {
  type: "event_comment";
  eventId: string;
  commentId?: string;
}

export interface FriendRequestPayload extends BasePushPayload {
  type: "friend_request" | "friend_accepted";
  userId: string;
}

export interface JoinRequestPayload extends BasePushPayload {
  type: "join_request" | "join_accepted";
  eventId: string;
}

export type PushPayload =
  | CircleMessagePayload
  | EventRsvpChangedPayload
  | EventUpdatedPayload
  | EventCreatedPayload
  | EventCommentPayload
  | FriendRequestPayload
  | JoinRequestPayload;

// ============================================================================
// ROUTER IMPLEMENTATION
// ============================================================================

export interface HandlePushEventOptions {
  type: string;
  entityId: string;
  payload?: Record<string, any>;
  receivedAt?: number;
}

/**
 * Main router entry point - handles all push-driven query updates
 */
export function handlePushEvent(
  options: HandlePushEventOptions,
  queryClient: QueryClient
): void {
  const { type, entityId, payload = {}, receivedAt = Date.now() } = options;
  
  // Extract version/updatedAt for dedupe
  const version = payload.version ?? payload.updatedAt ?? payload.messageId;
  
  // DEDUPE CHECK
  if (shouldDedupe(type, entityId, version)) {
    if (__DEV__) {
      devLog(`[P1_PUSH_ROUTER] DEDUPE_SKIP type=${type} entityId=${entityId} version=${version}`);
    }
    return;
  }
  
  // Route to appropriate handler
  let actionSummary = "unknown";
  
  try {
    switch (type) {
      case "circle_message":
        actionSummary = handleCircleMessage(payload, queryClient);
        break;
        
      case "event_rsvp_changed":
      case "join_request":
      case "join_accepted":
      case "new_attendee":
        actionSummary = handleEventRsvpChanged(payload, queryClient);
        break;
        
      case "event_updated":
      case "event_update":
        actionSummary = handleEventUpdated(payload, queryClient);
        break;
        
      case "event_created":
      case "new_event":
        actionSummary = handleEventCreated(payload, queryClient);
        break;
        
      case "event_comment":
        actionSummary = handleEventComment(payload, queryClient);
        break;
        
      case "friend_request":
      case "friend_accepted":
        actionSummary = handleFriendEvent(payload, queryClient);
        break;
        
      default:
        actionSummary = "unsupported_type";
        if (__DEV__) {
          devLog(`[P1_PUSH_ROUTER] UNSUPPORTED type=${type} entityId=${entityId}`);
        }
        return;
    }
    
    // Log successful handling
    if (__DEV__) {
      devLog(`[P1_PUSH_ROUTER] HANDLED type=${type} entityId=${entityId} action=${actionSummary}`);
      recordPushReceipt("push_router_handled", "system", {
        pushType: type,
        entityId,
        action: actionSummary,
        circleId: payload?.circleId ?? payload?.circle_id ?? null,
        eventId: payload?.eventId ?? payload?.event_id ?? null,
      });
    }
    
  } catch (error) {
    if (__DEV__) {
      devLog(`[P1_PUSH_ROUTER] ERROR type=${type} entityId=${entityId} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// ============================================================================
// DEV-ONLY PAYLOAD VALIDATORS
// ============================================================================

/** Validate circle_message payload has the minimum fields needed for safe cache patching. */
function validateCircleMessagePayload(payload: Record<string, any>): boolean {
  return (
    payload != null &&
    typeof payload.circleId === "string" &&
    payload.message != null &&
    typeof payload.message.id === "string" &&
    typeof payload.message.createdAt === "string" &&
    payload.message.user != null &&
    typeof payload.message.user.id === "string"
  );
}

/** Validate event_rsvp_changed payload has the minimum fields needed for safe cache patching. */
function validateEventRsvpPayload(payload: Record<string, any>): boolean {
  const eventId = payload.eventId ?? payload.event_id;
  return (
    payload != null &&
    typeof eventId === "string" &&
    (payload.deltaGoing === undefined || typeof payload.deltaGoing === "number")
  );
}

/** Validate event_updated payload has the minimum fields needed for safe invalidation. */
function validateEventUpdatedPayload(payload: Record<string, any>): boolean {
  const eventId = payload.eventId ?? payload.event_id;
  return payload != null && typeof eventId === "string";
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Safe append: dedupe by id AND clientMessageId, stable ordering, immutable return.
 * Works with the circle detail cache shape: { circle: { messages: [...] } }
 * If incoming msg has clientMessageId matching an optimistic entry, replaces it.
 */
export function safeAppendMessage(
  prev: any,
  msg: { id: string; createdAt: string; clientMessageId?: string; [k: string]: any },
): any {
  if (!prev?.circle) return prev;

  const existing = prev.circle.messages ?? [];

  // Dedupe by server id
  if (existing.some((m: any) => m.id === msg.id)) return prev;

  // [P1_MSG_IDEMP] Dedupe by clientMessageId: if push arrives for a message
  // whose clientMessageId already exists (optimistic or confirmed), replace it.
  if (msg.clientMessageId) {
    const matchIdx = existing.findIndex(
      (m: any) => m.clientMessageId === msg.clientMessageId,
    );
    if (matchIdx !== -1) {
      // Replace the existing entry (optimistic → server), lock to sent
      const optimisticId = existing[matchIdx].id;
      const replaced = [...existing];
      replaced[matchIdx] = { ...msg, status: "sent", clientMessageId: msg.clientMessageId };
      if (__DEV__) {
        devLog("[P1_MSG_IDEMP]", "replace_via_push", {
          clientMessageId: msg.clientMessageId,
          optimisticId,
          pushId: msg.id,
        });
      }
      return { ...prev, circle: { ...prev.circle, messages: replaced } };
    }
  }

  const next = [...existing, msg].sort(
    (a: any, b: any) => (a.createdAt as string).localeCompare(b.createdAt as string),
  );

  return { ...prev, circle: { ...prev.circle, messages: next } };
}

/**
 * Safe prepend: dedupe by id, stable ordering, immutable return.
 * Used by pagination to insert older messages at the front.
 */
export function safePrependMessages(
  existing: Array<{ id: string; createdAt: string; [k: string]: any }>,
  older: Array<{ id: string; createdAt: string; [k: string]: any }>,
): Array<{ id: string; createdAt: string; [k: string]: any }> {
  const existingIds = new Set(existing.map((m) => m.id));
  const deduped = older.filter((m) => !existingIds.has(m.id));
  if (deduped.length === 0) return existing;
  return [...deduped, ...existing].sort(
    (a, b) => (a.createdAt as string).localeCompare(b.createdAt as string),
  );
}

/**
 * Build an optimistic message for instant UI insertion.
 * Temp id namespace "optimistic-" prevents collision with server ids.
 * status: "sending" marks the message as optimistic.
 * Uses "content" to match CircleMessage schema (not "text").
 * clientMessageId: stable UUID for idempotent retry + push dedupe.
 */
export function buildOptimisticMessage(
  circleId: string,
  userId: string,
  content: string,
  userName?: string,
  userImage?: string | null,
) {
  const clientMessageId = `cmi-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    circleId,
    userId,
    content,
    text: content, // compat alias
    imageUrl: null,
    createdAt: new Date().toISOString(),
    status: "sending" as "sending" | "sent" | "failed",
    retryCount: 0,
    clientMessageId,
    user: { id: userId, name: userName ?? null, email: null, image: userImage ?? null },
  };
}

/**
 * Retry a failed message: mark as "sending", bump retryCount, re-invoke send.
 * sendFn should call the same API mutation used for normal sends.
 */
export function retryFailedMessage(
  circleId: string,
  optimisticId: string,
  queryClient: QueryClient,
  sendFn: () => void,
): void {
  queryClient.setQueryData(
    circleKeys.single(circleId),
    (prev: any) => {
      if (!prev?.circle?.messages) return prev;
      return {
        ...prev,
        circle: {
          ...prev.circle,
          messages: prev.circle.messages.map((m: any) =>
            m.id === optimisticId
              ? { ...m, status: "sending", retryCount: (m.retryCount ?? 0) + 1 }
              : m,
          ),
        },
      };
    },
  );

  if (__DEV__) {
    devLog("[P1_MSG_DELIVERY]", `retry ${optimisticId}`);
  }

  sendFn();
}

/**
 * Handle circle message push notification
 * Strategy: Patch-first — append message to cache, background reconcile only
 */
function handleCircleMessage(payload: Record<string, any>, queryClient: QueryClient): string {
  const circleId = payload.circleId ?? payload.circle_id;

  if (!circleId) {
    return "missing_circleId";
  }

  // [P1_PUSH_CONTRACT] DEV-only: reject malformed payload, fall back to reconcile
  if (__DEV__ && payload.message && !validateCircleMessagePayload(payload)) {
    devLog("[P1_PUSH_CONTRACT]", "INVALID circle_message payload", payload);
    queryClient.invalidateQueries({
      queryKey: circleKeys.single(circleId),
      refetchType: "inactive",
    });
    return "invalid_payload+reconcile";
  }

  const message = payload.message;

  // ── STEP 1: Patch circle detail cache (messages live under circleKeys.single) ──
  if (message?.id && message?.createdAt) {
    queryClient.setQueryData(
      circleKeys.single(circleId),
      (prev: any) => safeAppendMessage(prev, message),
    );

    // ── STEP 2: Read receipt patch (if readBy present on an existing message) ──
    if (Array.isArray(message.readBy)) {
      queryClient.setQueryData(
        circleKeys.single(circleId),
        (prev: any) => {
          if (!prev?.circle?.messages) return prev;
          return {
            ...prev,
            circle: {
              ...prev.circle,
              messages: prev.circle.messages.map((m: any) =>
                m.id === message.id ? { ...m, readBy: message.readBy } : m,
              ),
            },
          };
        },
      );
    }

    if (__DEV__) {
      devLog("[P1_MSG_PATCH]", `append circle=${circleId} message=${message.id}`);
    }
  }

  // ── STEP 3: Background reconcile — inactive queries only ──
  queryClient.invalidateQueries({
    queryKey: circleKeys.single(circleId),
    refetchType: "inactive",
  });

  // Also reconcile messages key (if anything else reads it)
  queryClient.invalidateQueries({
    queryKey: circleKeys.messages(circleId),
    refetchType: "inactive",
  });

  // [P1_CIRCLE_STALENESS] Invalidate circle list so Friends screen picks up
  // latest message preview / membership changes on next mount
  queryClient.invalidateQueries({
    queryKey: circleKeys.all(),
    refetchType: "inactive",
  });

  if (__DEV__) {
    devLog('[P1_CIRCLE_STALENESS]', {
      reason: 'push_circle_message',
      circleId,
      invalidations: ['circleKeys.single', 'circleKeys.messages', 'circleKeys.all'],
    });
  }

  // ── STEP 4: Unread count update ──
  const activeCircle = getActiveCircle();
  if (activeCircle === circleId) {
    // Viewer is currently in this circle — treat as read, no unread increment
    if (__DEV__) {
      devLog("[P1_READ_UNREAD]", "push treated-as-read (active)", { circleId });
    }
  } else if (message?.id) {
    // Viewer is NOT in this circle — increment totalUnread + byCircle
    queryClient.setQueryData(
      circleKeys.unreadCount(),
      (prev: any) => {
        if (!prev) return prev;
        const prevCircle = (prev.byCircle?.[circleId] as number) ?? 0;
        const nextCircle = prevCircle + 1;
        const nextTotal = ((prev.totalUnread as number) ?? 0) + 1;
        return {
          ...prev,
          totalUnread: nextTotal,
          byCircle: { ...(prev.byCircle ?? {}), [circleId]: nextCircle },
        };
      },
    );
    if (__DEV__) {
      const p = queryClient.getQueryData(circleKeys.unreadCount()) as any;
      devLog("[P1_UNREAD_V2]", "push unread++", {
        circleId,
        nextCircle: p?.byCircle?.[circleId] ?? 0,
        nextTotal: p?.totalUnread ?? 0,
      });
    }
  }

  return message?.id ? "patch_message+reconcile" : "no_message+reconcile";
}

/**
 * Handle event RSVP/attendee count changes
 * Strategy: Patch-first — update cached meta + attendees, then background reconcile
 */
function handleEventRsvpChanged(payload: Record<string, any>, queryClient: QueryClient): string {
  const eventId = payload.eventId ?? payload.event_id;
  
  if (!eventId) {
    return "missing_eventId";
  }

  // [P1_PUSH_CONTRACT] DEV-only: reject malformed payload, fall back to reconcile
  if (__DEV__ && !validateEventRsvpPayload(payload)) {
    devLog("[P1_PUSH_CONTRACT]", "INVALID event_rsvp_changed payload", payload);
    queryClient.invalidateQueries({
      queryKey: eventKeys.single(eventId),
      refetchType: "inactive",
    });
    return "invalid_payload+reconcile";
  }
  
  const delta = payload.deltaGoing ?? 0;
  const action: string | undefined = payload.action;
  const userId: string | undefined = payload.userId ?? payload.user_id;
  const user: { id: string; name?: string; avatarUrl?: string } | undefined = payload.user;
  let patched = false;

  // ── STEP 1: Patch event meta (goingCount / isFull) ──
  queryClient.setQueryData(
    eventKeys.single(eventId),
    (prev: any) => {
      if (!prev?.event) return prev;

      const newGoingCount = Math.max(0, (prev.event.goingCount ?? 0) + delta);
      const newIsFull =
        prev.event.capacity != null && newGoingCount >= prev.event.capacity;

      patched = true;
      return {
        ...prev,
        event: {
          ...prev.event,
          goingCount: newGoingCount,
          isFull: newIsFull,
        },
      };
    }
  );

  // ── STEP 2: Patch attendees cache ──
  if (userId) {
    queryClient.setQueryData(
      eventKeys.attendees(eventId),
      (prev: any) => {
        if (!prev?.attendees) return prev;

        const exists = prev.attendees.some((a: any) => a.id === userId);

        if (action === "join" && !exists && user) {
          return {
            ...prev,
            attendees: [...prev.attendees, user],
          };
        }

        if (action === "leave") {
          return {
            ...prev,
            attendees: prev.attendees.filter((a: any) => a.id !== userId),
          };
        }

        return prev;
      }
    );
  }

  // ── STEP 3: Safe reconcile — background-only refetch (inactive queries) ──
  queryClient.invalidateQueries({
    queryKey: eventKeys.single(eventId),
    refetchType: "inactive",
  });

  // ── STEP 4: DEV proof log ──
  if (__DEV__) {
    devLog("[P1_RSVP_PATCH]", {
      eventId,
      delta,
      action,
      userId,
      patched,
    });
  }

  return patched ? "patch_meta+attendees+reconcile" : "no_cache_hit+reconcile";
}

/**
 * Handle event updated push notification
 * Strategy: Invalidate owner query + projections
 */
function handleEventUpdated(payload: Record<string, any>, queryClient: QueryClient): string {
  const eventId = payload.eventId ?? payload.event_id;
  
  if (!eventId) {
    return "missing_eventId";
  }

  // [P1_PUSH_CONTRACT] DEV-only: reject malformed payload, fall back to reconcile
  if (__DEV__ && !validateEventUpdatedPayload(payload)) {
    devLog("[P1_PUSH_CONTRACT]", "INVALID event_updated payload", payload);
    queryClient.invalidateQueries({
      queryKey: eventKeys.single(eventId),
      refetchType: "inactive",
    });
    return "invalid_payload+reconcile";
  }
  
  // Invalidate event owner query
  queryClient.invalidateQueries({ queryKey: eventKeys.single(eventId) });
  
  // Invalidate projections (feed, calendar, myEvents)
  queryClient.invalidateQueries({ queryKey: eventKeys.feed() });
  queryClient.invalidateQueries({ queryKey: eventKeys.calendar() });
  queryClient.invalidateQueries({ queryKey: eventKeys.myEvents() });
  
  if (__DEV__) {
    devLog(`[P1_PUSH_ROUTER] invalidate keys=[eventKeys.single(${eventId}), eventKeys.feed(), eventKeys.calendar(), eventKeys.myEvents()]`);
  }
  
  return "invalidate_event+feeds";
}

/**
 * Handle event created push notification
 * Strategy: Invalidate feed projections only
 */
function handleEventCreated(payload: Record<string, any>, queryClient: QueryClient): string {
  // Invalidate feed projections (new event should appear in feeds)
  queryClient.invalidateQueries({ queryKey: eventKeys.feed() });
  queryClient.invalidateQueries({ queryKey: eventKeys.feedPaginated() });
  queryClient.invalidateQueries({ queryKey: eventKeys.calendar() });
  queryClient.invalidateQueries({ queryKey: eventKeys.myEvents() });
  
  if (__DEV__) {
    devLog(`[P1_PUSH_ROUTER] invalidate keys=[eventKeys.feed(), eventKeys.feedPaginated(), eventKeys.calendar(), eventKeys.myEvents()]`);
  }
  
  return "invalidate_feeds";
}

/**
 * Handle event comment push notification
 * Strategy: Invalidate event comments + owner query
 */
function handleEventComment(payload: Record<string, any>, queryClient: QueryClient): string {
  const eventId = payload.eventId ?? payload.event_id;
  
  if (!eventId) {
    return "missing_eventId";
  }
  
  // Invalidate comments query
  queryClient.invalidateQueries({ queryKey: eventKeys.comments(eventId) });
  
  // Invalidate event owner (may have comment count)
  queryClient.invalidateQueries({ queryKey: eventKeys.single(eventId) });
  
  if (__DEV__) {
    devLog(`[P1_PUSH_ROUTER] invalidate keys=[eventKeys.comments(${eventId}), eventKeys.single(${eventId})]`);
  }
  
  return "invalidate_comments+event";
}

/**
 * Handle friend request/accepted push notification
 * Strategy: Invalidate friends list and friend requests
 */
function handleFriendEvent(payload: Record<string, any>, queryClient: QueryClient): string {
  // Invalidate friends and friend requests
  queryClient.invalidateQueries({ queryKey: ["friends"] });
  queryClient.invalidateQueries({ queryKey: ["friendRequests"] });
  
  if (__DEV__) {
    devLog(`[P1_PUSH_ROUTER] invalidate keys=[["friends"], ["friendRequests"]]`);
  }
  
  return "invalidate_friends+requests";
}
