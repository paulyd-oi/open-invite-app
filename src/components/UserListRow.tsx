import React, { useState } from "react";
import { View, Text, Pressable, Image, type ViewStyle } from "react-native";
import { useTheme } from "@/lib/ThemeContext";
import { ChevronRight } from "@/ui/icons";

// ═══════════════════════════════════════════════════════════════
//  UserRow — SSOT for every list-style user row in the app.
//  Friends list · Circle Members · Event Attendees · Add Members
//
//  DOCTRINE: Never use Pressable style function callback
//  (style={({pressed})=>...}). NativeWind wrapper may not execute it.
//  Use pressed state (useState) + static style arrays.
// ═══════════════════════════════════════════════════════════════

export const AVATAR_SIZE = 40;

export interface UserRowProps {
  /** Avatar image URL. */
  avatarUri?: string | null;
  /** Single-char fallback when no avatar image. Derived from displayName/handle if omitted. */
  fallbackInitial?: string;
  /** User's @handle (without "@" prefix). If present, row shows "@handle" as primary. */
  handle?: string | null;
  /** Fallback display name. Shown as primary only when handle is missing. */
  displayName?: string | null;
  /** Calendar bio / subtitle. Shown as muted secondary line; omitted when empty. */
  bio?: string | null;
  /** Optional badge text shown inline after the primary text (e.g. "Host"). */
  badgeText?: string | null;
  /** Optional node rendered on the right side (chevron, trash, radio, badge, etc.). */
  rightAccessory?: React.ReactNode;
  /** Optional node rendered before the avatar (e.g. pin indicator). */
  leftAccessory?: React.ReactNode;
  /** When true and no rightAccessory is provided, renders a default ChevronRight. */
  showChevron?: boolean;
  /** Called when the entire row is pressed. */
  onPress?: () => void;
  /** Called on long press. */
  onLongPress?: () => void;
  /** When true, row press feedback is suppressed (useful when parent handles gestures). */
  disablePressFeedback?: boolean;
  /** Extra style applied to the outermost container. */
  style?: ViewStyle;
  /** Test ID for testing. */
  testID?: string;
}

/**
 * Canonical user row.  Use this component wherever a user appears in a
 * vertical list (friends, circle members, event attendees, add-member pickers).
 *
 * Primary text: `@handle` when handle exists, else `displayName`, else "Unknown".
 * Secondary text: `bio` — rendered only when non-empty.
 */
export const UserRow = React.memo(function UserRow({
  avatarUri,
  fallbackInitial,
  handle,
  displayName,
  bio,
  badgeText,
  rightAccessory,
  leftAccessory,
  showChevron = false,
  onPress,
  onLongPress,
  disablePressFeedback = false,
  style,
  testID,
}: UserRowProps) {
  const { themeColor, isDark, colors } = useTheme();
  const [pressed, setPressed] = useState(false);

  // ── Derive text ───────────────────────────────────────────
  const trimmedHandle = handle?.trim();
  const primary = trimmedHandle ? `@${trimmedHandle}` : (displayName?.trim() ?? "Unknown");
  const secondary = bio?.trim() || "";
  const initial = (fallbackInitial ?? displayName?.trim()?.[0] ?? trimmedHandle?.[0] ?? "?").toUpperCase();

  // ── Right element ─────────────────────────────────────────
  const rightEl =
    rightAccessory != null
      ? rightAccessory
      : showChevron
        ? <ChevronRight size={18} color={colors.textTertiary} />
        : null;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={!disablePressFeedback && onPress ? () => setPressed(true) : undefined}
      onPressOut={!disablePressFeedback && onPress ? () => setPressed(false) : undefined}
      disabled={!onPress && !onLongPress}
      testID={testID}
      style={[
        {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: "transparent",
        },
        style,
        pressed && {
          backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
        },
      ]}
    >
      {/* Left accessory (e.g. pin indicator) */}
      {leftAccessory != null && leftAccessory}

      {/* Avatar */}
      <View
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: AVATAR_SIZE / 2,
          overflow: "hidden",
          backgroundColor: colors.avatarBg,
        }}
      >
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }} />
        ) : (
          <View
            style={{
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: themeColor + "20",
            }}
          >
            <Text style={{ fontWeight: "600", color: themeColor }}>{initial}</Text>
          </View>
        )}
      </View>

      {/* Text column */}
      <View style={{ flex: 1, marginLeft: 12, justifyContent: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text
            style={{ fontSize: 15, fontWeight: "600", color: colors.text, letterSpacing: -0.2, flexShrink: 1 }}
            numberOfLines={1}
          >
            {primary}
          </Text>
          {!!badgeText && (
            <View
              style={{
                marginLeft: 8,
                backgroundColor: themeColor + "20",
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 4,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: themeColor }}>{badgeText}</Text>
            </View>
          )}
        </View>
        {secondary ? (
          <Text
            style={{ fontSize: 13, color: colors.textSecondary, marginTop: 1, lineHeight: 17 }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {secondary}
          </Text>
        ) : null}
      </View>

      {/* Right accessory slot */}
      {rightEl != null && (
        <View style={{ marginLeft: 8 }}>{rightEl}</View>
      )}
    </Pressable>
  );
});

// ── Backward-compat aliases (circle/event already import UserListRow) ──
export type UserListRowProps = UserRowProps;
export const UserListRow = UserRow;
export default UserRow;
