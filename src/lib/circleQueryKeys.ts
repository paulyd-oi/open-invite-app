/**
 * SSOT circle query keys - all circle-related React Query keys must use these.
 * 
 * INVARIANT: No wildcard invalidations for circles (e.g., invalidateQueries({queryKey:["circles"]}))
 * unless explicitly targeting the list/feed. Only specific keys may be invalidated using these SSOT helpers.
 */

/**
 * Circle query key builders
 * 
 * ARCHITECTURE:
 * - ["circles"] alone = circles list/feed query
 * - ["circles", "single", id] = single circle detail
 * - ["circles", "messages", id] = circle messages
 * - ["circles", "unreadCount"] = unread count across all circles
 * 
 * This structure prevents prefix-match cascades:
 * - invalidateQueries({queryKey: ["circle", id]}) would prefix-match ["circle-messages", id]
 * - invalidateQueries({queryKey: circleKeys.single(id)}) only matches that specific key
 */
export const circleKeys = {
  // Base key for circles list/feed
  all: () => ["circles"] as const,
  
  // Single circle by ID
  single: (id: string) => ["circles", "single", id] as const,
  
  // Circle-specific sub-resources
  messages: (id: string) => ["circles", "messages", id] as const,
  
  // Typing presence
  typing: (id: string) => ["circles", "typing", id] as const,

  // Unread count
  unreadCount: () => ["circles", "unreadCount"] as const,

  // Availability summary for a circle
  availabilitySummary: (id: string) => ["circles", "availabilitySummary", id] as const,

  // Plan lock state for a circle
  planLock: (id: string) => ["circles", "planLock", id] as const,
} as const;
