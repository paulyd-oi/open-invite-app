import React from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ReportModal } from "@/components/event/ReportModal";
import { CalendarSyncModal } from "@/components/event/CalendarSyncModal";
import { ColorPickerSheet } from "@/components/event/ColorPickerSheet";
import { PhotoUploadSheet } from "@/components/event/PhotoUploadSheet";
import { AttendeesSheet } from "@/components/event/AttendeesSheet";
import { EventActionsSheet } from "@/components/event/EventActionsSheet";
import { EventSummaryModal } from "@/components/EventSummaryModal";
import { FirstRsvpNudge } from "@/components/FirstRsvpNudge";
import { PostValueInvitePrompt } from "@/components/PostValueInvitePrompt";
import { NotificationPrePromptModal } from "@/components/NotificationPrePromptModal";
import type { EventReportReason } from "@/shared/contracts";

type RsvpPromptChoice = "post_value_invite" | "first_rsvp_nudge" | "notification" | "none";

export interface EventModalsProps {
  // Calendar sync
  showSyncModal: boolean;
  onCloseSyncModal: () => void;
  onGoogleCalendar: () => void;
  onAppleCalendar: () => void;
  colors: any;

  // Event Summary
  showSummaryModal: boolean;
  onCloseSummaryModal: () => void;
  eventId: string;
  eventTitle: string;
  eventEmoji: string;
  eventDate: Date;
  attendeeCount: number;
  existingSummary?: string | null;
  existingRating?: number | null;

  // Delete comment confirm
  showDeleteCommentConfirm: boolean;
  onConfirmDeleteComment: () => void;
  onCancelDeleteComment: () => void;

  // Remove RSVP confirm
  showRemoveRsvpConfirm: boolean;
  onConfirmRemoveRsvp: () => void;
  onCancelRemoveRsvp: () => void;

  // Delete event confirm
  showDeleteEventConfirm: boolean;
  onConfirmDeleteEvent: () => void;
  onCancelDeleteEvent: () => void;

  // Remove imported confirm
  showRemoveImportedConfirm: boolean;
  onConfirmRemoveImported: () => void;
  onCancelRemoveImported: () => void;

  // RSVP prompt arbitration
  rsvpPromptChoice: RsvpPromptChoice;
  onFirstRsvpNudgePrimary: () => void;
  onFirstRsvpNudgeSecondary: () => void;
  onFirstRsvpNudgeDismiss: () => void;
  onPostValueInviteClose: () => void;
  onNotificationPromptClose: () => void;
  sessionUserId?: string;

  // Event Actions Sheet
  showEventActionsSheet: boolean;
  eventActionsProps: {
    isMyEvent: boolean;
    isBusy: boolean;
    isImported: boolean;
    hasEventPhoto: boolean;
    isBusyBlock: boolean;
    currentColorOverride: string | null | undefined;
    myRsvpStatus: string | null;
    liveActivity: {
      active: boolean | null;
      supported: boolean;
      subtitle: string;
      canToggle: boolean;
      hasEnded: boolean;
    };
    isDark: boolean;
    themeColor: string;
    colors: any;
    onClose: () => void;
    onEdit: () => void;
    onDuplicate: () => void;
    onChangePhoto: () => void;
    onShare: () => void;
    onToggleLiveActivity: () => void;
    onReport: () => void;
    onOpenColorPicker: () => void;
    onDelete: () => void;
    onRemoveImported: () => void;
  };

  // Report Modal
  showReportModal: boolean;
  selectedReportReason: EventReportReason | null;
  reportDetails: string;
  isSubmittingReport: boolean;
  themeColor: string;
  onCloseReport: () => void;
  onSelectReportReason: (reason: EventReportReason) => void;
  onChangeReportDetails: (text: string) => void;
  onSubmitReport: () => void;
  onCancelReport: () => void;

  // Attendees Sheet
  showAttendeesModal: boolean;
  isLoadingAttendees: boolean;
  hasAttendeesError: boolean;
  attendeesPrivacyDenied: boolean;
  attendeesList: any[];
  guestGoingList: any[];
  effectiveGoingCount: number;
  hostUserId?: string;
  isDark: boolean;
  onCloseAttendees: () => void;
  onRetryAttendees: () => void;
  onPressAttendee: (userId: string) => void;

  // Color Picker Sheet
  showColorPicker: boolean;
  currentColorOverride?: string;
  onCloseColorPicker: () => void;
  onSelectColor: (color: string) => void;
  onResetColor: () => void;

  // Photo Upload Sheet
  showPhotoSheet: boolean;
  hasExistingPhoto: boolean;
  uploadingPhoto: boolean;
  onClosePhotoSheet: () => void;
  onUploadPhoto: () => void;
  onRemovePhoto: () => void;
}

export function EventModals(props: EventModalsProps) {
  return (
    <>
      <CalendarSyncModal
        visible={props.showSyncModal}
        colors={props.colors}
        onClose={props.onCloseSyncModal}
        onGoogleCalendar={props.onGoogleCalendar}
        onAppleCalendar={props.onAppleCalendar}
      />

      <EventSummaryModal
        visible={props.showSummaryModal}
        onClose={props.onCloseSummaryModal}
        eventId={props.eventId}
        eventTitle={props.eventTitle}
        eventEmoji={props.eventEmoji}
        eventDate={props.eventDate}
        attendeeCount={props.attendeeCount}
        existingSummary={props.existingSummary}
        existingRating={props.existingRating}
      />

      <ConfirmModal
        visible={props.showDeleteCommentConfirm}
        title="Delete Comment"
        message="Are you sure you want to delete this comment?"
        confirmText="Delete"
        isDestructive
        onConfirm={props.onConfirmDeleteComment}
        onCancel={props.onCancelDeleteComment}
      />

      <ConfirmModal
        visible={props.showRemoveRsvpConfirm}
        title="Remove RSVP?"
        message="You can RSVP again anytime."
        confirmText="Remove"
        cancelText="Keep RSVP"
        isDestructive
        onConfirm={props.onConfirmRemoveRsvp}
        onCancel={props.onCancelRemoveRsvp}
      />

      <ConfirmModal
        visible={props.showDeleteEventConfirm}
        title="Delete Event"
        message="This will permanently delete the event for everyone. This can't be undone."
        confirmText="Delete"
        isDestructive
        onConfirm={props.onConfirmDeleteEvent}
        onCancel={props.onCancelDeleteEvent}
      />

      <ConfirmModal
        visible={props.showRemoveImportedConfirm}
        title="Remove from Open Invite"
        message="This removes the event from Open Invite only. Your device calendar won't be affected."
        confirmText="Remove"
        isDestructive
        onConfirm={props.onConfirmRemoveImported}
        onCancel={props.onCancelRemoveImported}
      />

      <FirstRsvpNudge
        visible={props.rsvpPromptChoice === "first_rsvp_nudge"}
        onPrimary={props.onFirstRsvpNudgePrimary}
        onSecondary={props.onFirstRsvpNudgeSecondary}
        onDismiss={props.onFirstRsvpNudgeDismiss}
      />

      <PostValueInvitePrompt
        visible={props.rsvpPromptChoice === "post_value_invite"}
        surface="rsvp"
        onClose={props.onPostValueInviteClose}
      />

      <NotificationPrePromptModal
        visible={props.rsvpPromptChoice === "notification"}
        onClose={props.onNotificationPromptClose}
        userId={props.sessionUserId}
      />

      <EventActionsSheet visible={props.showEventActionsSheet} {...props.eventActionsProps} />

      <ReportModal
        visible={props.showReportModal}
        selectedReportReason={props.selectedReportReason}
        reportDetails={props.reportDetails}
        isSubmittingReport={props.isSubmittingReport}
        themeColor={props.themeColor}
        colors={props.colors}
        onClose={props.onCloseReport}
        onSelectReason={props.onSelectReportReason}
        onChangeDetails={props.onChangeReportDetails}
        onSubmit={props.onSubmitReport}
        onCancel={props.onCancelReport}
      />

      <AttendeesSheet
        visible={props.showAttendeesModal}
        isLoading={props.isLoadingAttendees}
        hasError={props.hasAttendeesError}
        isPrivacyDenied={props.attendeesPrivacyDenied}
        attendees={props.attendeesList}
        guestGoingList={props.guestGoingList}
        effectiveGoingCount={props.effectiveGoingCount}
        hostUserId={props.hostUserId}
        isDark={props.isDark}
        themeColor={props.themeColor}
        colors={props.colors}
        onClose={props.onCloseAttendees}
        onRetry={props.onRetryAttendees}
        onPressAttendee={props.onPressAttendee}
      />

      <ColorPickerSheet
        visible={props.showColorPicker}
        currentColorOverride={props.currentColorOverride}
        colors={props.colors}
        onClose={props.onCloseColorPicker}
        onSelectColor={props.onSelectColor}
        onResetColor={props.onResetColor}
      />

      <PhotoUploadSheet
        visible={props.showPhotoSheet}
        hasExistingPhoto={props.hasExistingPhoto}
        uploadingPhoto={props.uploadingPhoto}
        themeColor={props.themeColor}
        colors={props.colors}
        onClose={props.onClosePhotoSheet}
        onUploadPhoto={props.onUploadPhoto}
        onRemovePhoto={props.onRemovePhoto}
      />
    </>
  );
}
