import React from "react";
import { Pressable, View, Text, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { Pencil, Copy, Camera, Share2, Bell, AlertTriangle, Palette, Trash2, ImagePlus } from "@/ui/icons";
import { STATUS } from "@/ui/tokens";
import BottomSheet from "@/components/BottomSheet";

interface EventActionsSheetColors {
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
}

interface LiveActivityState {
  active: boolean | null;
  supported: boolean;
  subtitle: string;
  canToggle: boolean;
  hasEnded: boolean;
}

interface EventActionsSheetProps {
  visible: boolean;
  isMyEvent: boolean;
  isBusy: boolean;
  isImported: boolean;
  hasEventPhoto: boolean;
  isBusyBlock: boolean;
  currentColorOverride: string | null | undefined;
  myRsvpStatus: string | null;
  liveActivity: LiveActivityState;
  isDark: boolean;
  themeColor: string;
  colors: EventActionsSheetColors;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onChangePhoto: () => void;
  onShare: () => void;
  onShareFlyer?: () => void;
  onToggleLiveActivity: () => void;
  onReport: () => void;
  onOpenColorPicker: () => void;
  onDelete: () => void;
  onRemoveImported: () => void;
}

function ActionRow({
  icon,
  label,
  onPress,
  isDark,
  themeColor,
  colors,
  testID,
  disabled,
  style,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  isDark: boolean;
  themeColor: string;
  colors: EventActionsSheetColors;
  testID?: string;
  disabled?: boolean;
  style?: object;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      testID={testID}
      className="flex-row items-center py-4"
      style={{ borderBottomWidth: 1, borderBottomColor: colors.border, ...style }}
      onPress={onPress}
      disabled={disabled}
    >
      <View
        className="w-10 h-10 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
      >
        {icon}
      </View>
      {children ?? <Text style={{ color: colors.text, fontSize: 16 }}>{label}</Text>}
    </Pressable>
  );
}

export function EventActionsSheet({
  visible,
  isMyEvent,
  isBusy,
  isImported,
  hasEventPhoto,
  isBusyBlock,
  currentColorOverride,
  myRsvpStatus,
  liveActivity,
  isDark,
  themeColor,
  colors,
  onClose,
  onEdit,
  onDuplicate,
  onChangePhoto,
  onShare,
  onShareFlyer,
  onToggleLiveActivity,
  onReport,
  onOpenColorPicker,
  onDelete,
  onRemoveImported,
}: EventActionsSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightPct={0}
      backdropOpacity={0.5}
      title="Event Options"
    >
      {/* Actions */}
      <View style={{ paddingHorizontal: 20 }}>
        {/* Owner Actions (app-created, non-busy only) */}
        {isMyEvent && !isBusy && (
          <>
            <ActionRow
              testID="event-detail-menu-edit"
              icon={<Pencil size={20} color={themeColor} />}
              label="Edit Event"
              onPress={onEdit}
              isDark={isDark}
              themeColor={themeColor}
              colors={colors}
            />

            <ActionRow
              icon={<Copy size={20} color={themeColor} />}
              label="Duplicate Event"
              onPress={onDuplicate}
              isDark={isDark}
              themeColor={themeColor}
              colors={colors}
            />

            <ActionRow
              icon={<Camera size={20} color={themeColor} />}
              label={hasEventPhoto ? "Change Banner Photo" : "Add Banner Photo"}
              onPress={onChangePhoto}
              isDark={isDark}
              themeColor={themeColor}
              colors={colors}
            />
          </>
        )}

        {/* Share - available to everyone (unless busy block) */}
        {!isBusy && (
          <>
            <ActionRow
              icon={<Share2 size={20} color={themeColor} />}
              label="Share Event"
              onPress={onShare}
              isDark={isDark}
              themeColor={themeColor}
              colors={colors}
            />
            {onShareFlyer && (
              <ActionRow
                icon={<ImagePlus size={20} color={themeColor} />}
                label="Share Flyer"
                onPress={onShareFlyer}
                isDark={isDark}
                themeColor={themeColor}
                colors={colors}
              />
            )}
          </>
        )}

        {/* Lock Screen Updates — iOS live activity toggle */}
        {Platform.OS === "ios" && liveActivity.active !== null && !isBusy && (isMyEvent || myRsvpStatus === "going") && !liveActivity.hasEnded && (
          <Pressable
            className="flex-row items-center py-4"
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border, opacity: liveActivity.canToggle || liveActivity.active ? 1 : 0.55 }}
            disabled={!liveActivity.canToggle && !liveActivity.active}
            onPress={() => {
              if (!liveActivity.canToggle && !liveActivity.active) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onToggleLiveActivity();
            }}
          >
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: liveActivity.active ? `${STATUS.going.fg}12` : (isDark ? "#2C2C2E" : "#F3F4F6") }}
            >
              <Bell size={20} color={liveActivity.active ? STATUS.going.fg : themeColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 16 }}>Lock Screen Updates</Text>
              <Text style={{ color: liveActivity.active ? STATUS.going.fg : colors.textTertiary, fontSize: 12, marginTop: 1 }}>
                {liveActivity.subtitle}
              </Text>
            </View>
          </Pressable>
        )}

        {/* Report - only for non-owners, non-busy */}
        {!isMyEvent && !isBusy && (
          <ActionRow
            icon={<AlertTriangle size={20} color={colors.textSecondary} />}
            label="Report Event"
            onPress={onReport}
            isDark={isDark}
            themeColor={themeColor}
            colors={colors}
          />
        )}

        {/* Block Color - host-only invariant [P0_EVENT_COLOR_GATE] */}
        {isMyEvent && !isBusyBlock && (
          <Pressable
            className="flex-row items-center py-4"
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
            onPress={onOpenColorPicker}
          >
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              <Palette size={20} color={themeColor} />
            </View>
            <View className="flex-1 flex-row items-center justify-between">
              <Text style={{ color: colors.text, fontSize: 16 }}>Block Color</Text>
              {currentColorOverride && (
                <View
                  className="w-6 h-6 rounded-full mr-2"
                  style={{ backgroundColor: currentColorOverride, borderWidth: 2, borderColor: colors.border }}
                />
              )}
            </View>
          </Pressable>
        )}

        {/* Delete Event - host-only destructive action (app-created only) */}
        {isMyEvent && !isBusy && !isImported && (
          <Pressable
            testID="event-detail-menu-delete"
            className="flex-row items-center py-4"
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
            onPress={onDelete}
          >
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: "rgba(239,68,68,0.12)" }}
            >
              <Trash2 size={20} color={STATUS.destructive.fg} />
            </View>
            <Text style={{ color: STATUS.destructive.fg, fontSize: 16, fontWeight: "500" }}>Delete Event</Text>
          </Pressable>
        )}

        {/* [IMPORTED_EVENT] Remove from Open Invite — imported events only */}
        {isMyEvent && isImported && (
          <Pressable
            testID="event-detail-menu-remove-imported"
            className="flex-row items-center py-4"
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
            onPress={onRemoveImported}
          >
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: "rgba(239,68,68,0.12)" }}
            >
              <Trash2 size={20} color={STATUS.destructive.fg} />
            </View>
            <Text style={{ color: STATUS.destructive.fg, fontSize: 16, fontWeight: "500" }}>Remove from Open Invite</Text>
          </Pressable>
        )}

        {/* Cancel */}
        <Pressable
          className="flex-row items-center justify-center py-4 mt-2"
          onPress={onClose}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: "500" }}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
