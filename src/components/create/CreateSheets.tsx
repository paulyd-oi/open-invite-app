import React from "react";
import { CoverMediaPickerSheet } from "@/components/create/CoverMediaPickerSheet";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { NotificationPrePromptModal } from "@/components/NotificationPrePromptModal";
import type { PaywallContext } from "@/lib/entitlements";
import type { CoverMediaItem } from "@/components/create/coverMedia.types";

interface CreateSheetsProps {
  // Cover picker
  showCoverPicker: boolean;
  onCloseCoverPicker: () => void;
  onSelectCover: (item: CoverMediaItem) => void;
  onPickLocalImage: () => void;
  selectedCoverId: string | undefined;
  userUploads: CoverMediaItem[];

  // Paywall
  showPaywallModal: boolean;
  paywallContext: PaywallContext;
  onClosePaywall: () => void;

  // Notification prompt
  showNotificationPrompt: boolean;
  onCloseNotificationPrompt: () => void;
  notificationUserId: string | undefined;

}

export function CreateSheets({
  showCoverPicker,
  onCloseCoverPicker,
  onSelectCover,
  onPickLocalImage,
  selectedCoverId,
  userUploads,
  showPaywallModal,
  paywallContext,
  onClosePaywall,
  showNotificationPrompt,
  onCloseNotificationPrompt,
  notificationUserId,
}: CreateSheetsProps) {
  return (
    <>
      {/* ── Cover Media Picker Sheet ── */}
      <CoverMediaPickerSheet
        visible={showCoverPicker}
        onClose={onCloseCoverPicker}
        onSelectCover={onSelectCover}
        onPickLocalImage={onPickLocalImage}
        selectedCoverId={selectedCoverId}
        userUploads={userUploads}
      />

      {/* Paywall Modal */}
      <PaywallModal
        visible={showPaywallModal}
        context={paywallContext}
        onClose={onClosePaywall}
      />

      {/* Notification prompt */}
      <NotificationPrePromptModal
        visible={showNotificationPrompt}
        onClose={onCloseNotificationPrompt}
        userId={notificationUserId}
      />

    </>
  );
}
