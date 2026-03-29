import React from "react";
import BottomSheet from "@/components/BottomSheet";
import { SettingsSheetContent } from "@/components/create/SettingsSheetContent";
import { CoverMediaPickerSheet } from "@/components/create/CoverMediaPickerSheet";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { NotificationPrePromptModal } from "@/components/NotificationPrePromptModal";
import type { DockMode } from "@/components/create/CreateBottomDock";
import type { PaywallContext } from "@/lib/entitlements";
import type { CoverMediaItem } from "@/components/create/coverMedia.types";

interface CreateSheetsProps {
  // Dock
  activeDockMode: DockMode | null;
  onCloseDock: () => void;

  // Settings sheet
  settingsProps: React.ComponentProps<typeof SettingsSheetContent>;

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
  activeDockMode,
  onCloseDock,
  settingsProps,
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
      {/* ── Settings Sheet ── */}
      <BottomSheet
        visible={activeDockMode === "settings"}
        onClose={onCloseDock}
        title="Settings"
        heightPct={0.65}
      >
        <SettingsSheetContent {...settingsProps} />
      </BottomSheet>

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
