/**
 * P0 PRIVACY: Event visibility and masking utilities
 * 
 * INVARIANT: Busy/private events must NEVER leak titles, locations, or descriptions
 * to non-owners. This module provides centralized masking logic for all render paths.
 */

/**
 * Determines if an event should be masked (displayed as "Busy") for the viewer.
 * 
 * @param event - Event with isBusy, isWork, isOwn flags
 * @param viewerIsOwner - Whether the current viewer owns this event
 * @returns true if the event should show masked "Busy" content
 */
export function shouldMaskEvent(
  event: { isBusy?: boolean; isWork?: boolean; isOwn?: boolean },
  viewerIsOwner?: boolean
): boolean {
  const isBusyOrPrivate = event.isBusy || event.isWork;
  const isOwner = viewerIsOwner ?? event.isOwn ?? false;
  const shouldMask = isBusyOrPrivate && !isOwner;
  
  // [P0_PRIVACY_BUSY] Log masking decision in DEV
  if (__DEV__) {
    console.log("[P0_PRIVACY_BUSY] shouldMaskEvent:", {
      isBusy: event.isBusy,
      isWork: event.isWork,
      isOwn: event.isOwn,
      viewerIsOwner,
      shouldMask,
    });
  }
  
  return shouldMask ?? false;
}

/**
 * Returns display-safe event fields, masking sensitive data for busy/private events.
 * 
 * USAGE: Call this in ANY component rendering event titles/details for non-owners.
 * 
 * @param event - Event object with title, emoji, location, description
 * @param viewerIsOwner - Whether the current viewer owns this event
 * @returns Masked or original fields based on visibility rules
 */
export function getEventDisplayFields(
  event: {
    title: string;
    emoji?: string;
    location?: string | null;
    description?: string | null;
    isBusy?: boolean;
    isWork?: boolean;
    isOwn?: boolean;
  },
  viewerIsOwner?: boolean
): {
  displayTitle: string;
  displayEmoji: string;
  displayLocation: string | null | undefined;
  displayDescription: string | null | undefined;
  isMasked: boolean;
} {
  const isMasked = shouldMaskEvent(event, viewerIsOwner);
  
  if (isMasked) {
    // [P0_PRIVACY_BUSY] Log masked output
    if (__DEV__) {
      console.log("[P0_PRIVACY_BUSY] MASKED event - hiding title:", event.title);
    }
    return {
      displayTitle: "Busy",
      displayEmoji: "🔒",
      displayLocation: undefined,
      displayDescription: undefined,
      isMasked: true,
    };
  }
  
  return {
    displayTitle: event.title,
    displayEmoji: event.emoji ?? "📅",
    displayLocation: event.location,
    displayDescription: event.description,
    isMasked: false,
  };
}

export function shouldShowInSocial(event: any): boolean {
  return !event?.isBusy;
}

export function filterSocialEvents<T>(events: T[]): T[] {
  return (events ?? []).filter((e: any) => shouldShowInSocial(e));
}
