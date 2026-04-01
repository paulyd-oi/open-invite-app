/**
 * useSaveEvent — Shared save/unsave toggle for events.
 *
 * Save = POST /api/events/:id/rsvp { status: "interested" }
 * Unsave = DELETE /api/events/:id/rsvp (removes the event_interest row)
 *
 * isSaved derived from viewerRsvpStatus passed in (already in cache).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { postIdempotent } from "@/lib/idempotencyKey";
import { api } from "@/lib/api";
import { invalidateEventKeys, getInvalidateAfterRsvpJoin } from "@/lib/eventQueryKeys";
import { safeToast } from "@/lib/safeToast";
import { devLog } from "@/lib/devLog";

type UseSaveEventOptions = {
  eventId: string;
  viewerRsvpStatus: string | null | undefined;
};

export function useSaveEvent({ eventId, viewerRsvpStatus }: UseSaveEventOptions) {
  const queryClient = useQueryClient();
  const isSaved = viewerRsvpStatus === "interested" || viewerRsvpStatus === "maybe";

  const saveMutation = useMutation({
    mutationFn: () =>
      postIdempotent(`/api/events/${eventId}/rsvp`, { status: "interested" }),
    onSuccess: () => {
      invalidateEventKeys(queryClient, getInvalidateAfterRsvpJoin(eventId), "save_event");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err) => {
      if (__DEV__) devLog("[SAVE_EVENT_ERR]", err);
      safeToast.error("Couldn't save", "Please try again");
    },
  });

  const unsaveMutation = useMutation({
    mutationFn: () =>
      api.delete(`/api/events/${eventId}/rsvp`),
    onSuccess: () => {
      invalidateEventKeys(queryClient, getInvalidateAfterRsvpJoin(eventId), "unsave_event");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    onError: (err) => {
      if (__DEV__) devLog("[UNSAVE_EVENT_ERR]", err);
      safeToast.error("Couldn't unsave", "Please try again");
    },
  });

  const isLoading = saveMutation.isPending || unsaveMutation.isPending;

  const toggleSave = () => {
    if (isLoading) return;
    if (isSaved) {
      unsaveMutation.mutate();
    } else {
      saveMutation.mutate();
    }
  };

  return { isSaved, toggleSave, isLoading };
}
