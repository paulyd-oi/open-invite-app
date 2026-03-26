import React from "react";
import BottomSheet from "@/components/BottomSheet";
import { ThemeSwatchRail } from "@/components/create/ThemeSwatchRail";
import { SettingsSheetContent } from "@/components/create/SettingsSheetContent";
import { CoverMediaPickerSheet } from "@/components/create/CoverMediaPickerSheet";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { NotificationPrePromptModal } from "@/components/NotificationPrePromptModal";
import { PostCreateShareModal } from "@/components/create/PostCreateShareModal";
import type { DockMode } from "@/components/create/CreateBottomDock";
import type { ThemeId } from "@/lib/eventThemes";
import type { CustomTheme } from "@/lib/customThemeStorage";
import type { PaywallContext } from "@/lib/entitlements";
import type { CoverMediaItem } from "@/components/create/coverMedia.types";
import type { Circle } from "@/shared/contracts";

interface CreateSheetsProps {
  // Dock
  activeDockMode: DockMode | null;
  onCloseDock: () => void;

  // Theme sheet
  selectedThemeId: ThemeId | null;
  selectedCustomTheme: CustomTheme | null;
  customThemes: CustomTheme[];
  userIsPro: boolean;
  isDark: boolean;
  glassText: string;
  glassSecondary: string;
  glassTertiary: string;
  onSelectTheme: (id: ThemeId | null) => void;
  onSelectCustomTheme: (ct: CustomTheme | null) => void;
  onDeleteCustomTheme: (id: string) => void;
  onOpenPaywall: () => void;
  onOpenThemeBuilder: (editId?: string) => void;

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

  // Post-create share modal
  showShareModal: boolean;
  createdEvent: React.ComponentProps<typeof PostCreateShareModal>["createdEvent"];
  onCloseShareModal: () => void;
  shareModalBg: string;
  shareModalBorder: string;
  themeColor: string;
}

export function CreateSheets({
  activeDockMode,
  onCloseDock,
  selectedThemeId,
  selectedCustomTheme,
  customThemes,
  userIsPro,
  isDark,
  glassText,
  glassSecondary,
  glassTertiary,
  onSelectTheme,
  onSelectCustomTheme,
  onDeleteCustomTheme,
  onOpenPaywall,
  onOpenThemeBuilder,
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
  showShareModal,
  createdEvent,
  onCloseShareModal,
  shareModalBg,
  shareModalBorder,
  themeColor,
}: CreateSheetsProps) {
  return (
    <>
      {/* ── Theme Sheet ── */}
      <BottomSheet
        visible={activeDockMode === "theme"}
        onClose={onCloseDock}
        title="Theme"
        heightPct={0.55}
      >
        <ThemeSwatchRail
          selectedThemeId={selectedThemeId}
          selectedCustomTheme={selectedCustomTheme}
          customThemes={customThemes}
          userIsPro={userIsPro}
          isDark={isDark}
          glassText={glassText}
          glassSecondary={glassSecondary}
          glassTertiary={glassTertiary}
          onSelectTheme={onSelectTheme}
          onSelectCustomTheme={onSelectCustomTheme}
          onDeleteCustomTheme={onDeleteCustomTheme}
          onOpenPaywall={onOpenPaywall}
          onOpenThemeBuilder={onOpenThemeBuilder}
        />
      </BottomSheet>

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

      {/* [GROWTH_V1] Post-create event share prompt */}
      <PostCreateShareModal
        visible={showShareModal}
        createdEvent={createdEvent}
        onClose={onCloseShareModal}
        backgroundColor={shareModalBg}
        borderColor={shareModalBorder}
        glassText={glassText}
        glassSecondary={glassSecondary}
        themeColor={themeColor}
      />
    </>
  );
}
