import React from "react";
import { View, Text, Pressable, Image, type ViewStyle } from "react-native";
import { useTheme } from "@/lib/ThemeContext";

// ═══════════════════════════════════════════════════════════════
//  UserListRow — SSOT for every list-style user row in the app.
//  Friends list · Circle Members · Event Attendees · Add Members
// ═══════════════════════════════════════════════════════════════

// ── Layout tokens ─────────────────────────────────────────────
export const ROW_MIN_H = 48;
export const AVATAR_SIZE = 40;

export interface UserListRowProps {
  /** User's @handle (without "@" prefix). If present, row shows "@handle" as primary. */
  handle?: string | null;
  /** Fallback display name. Shown as primary only when handle is missing. */
  displayName?: string | null;
  /** Calendar bio. Shown as muted secondary line; omitted when empty. */
  calendarBio?: string | null;
  /** Avatar image URL. */
  avatarUrl?: string | null;
  /** Called when the entire row is pressed. */
  onPress?: () => void;
  /** Optional node rendered on the right side (chevron, trash, radio, badge, etc.). */
  rightAccessory?: React.ReactNode;
  /** Optional badge text shown inline after the primary text (e.g. "Host"). */
  badgeText?: string | null;
  /** Extra style applied to the outermost Pressable container. */
  style?: ViewStyle;
  /** When true, row press feedback is suppressed (useful when parent handles gestures). */
  disablePressFeedback?: boolean;
}

/**
 * Canonical user-list row.  Use this component wherever a user appears in a
 * vertical list (friends, circle members, event attendees, add-member pickers).
 *
 * Primary text: `@handle` when handle exists, else `displayName`.
 * Secondary text: `calendarBio` — rendered only when non-empty.
 */
export const UserListRow = React.memo(function UserListRow({
  handle,
  displayName,
  calendarBio,
  avatarUrl,
  onPress,
  rightAccessory,
  badgeText,
  style,
  disablePressFeedback = false,
}: UserListRowProps) {
  const { themeColor, isDark, colors } = useTheme();

  // ── Derive text ───────────────────────────────────────────
  const primary = handle?.trim() ? `@${handle.trim()}` : (displayName?.trim() ?? "");
  const bio = calendarBio?.trim() || "";
  const initial = (displayName?.trim()?.[0] ?? handle?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        // Caller overrides go first so layout-critical props always win
        ...(style as object),
        flexDirection: "row" as const,
        alignItems: "center" as const,
        minHeight: ROW_MIN_H,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor:
          !disablePressFeedback && pressed
            ? isDark
              ? "rgba(255,255,255,0.06)"
              : "rgba(0,0,0,0.04)"
            : "transparent",
      })}
    >
      {/* Avatar */}
      <View
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: AVATAR_SIZE / 2,
          overflow: "hidden",
          backgroundColor: colors.avatarBg,
          marginRight: 12,
        }}
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }} />
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
      <View style={{ flex: 1, justifyContent: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text
            style={{ fontSize: 15, fontWeight: "600", color: colors.text, letterSpacing: -0.2 }}
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
        {bio ? (
          <Text
            style={{ fontSize: 13, color: colors.textSecondary, marginTop: 1, lineHeight: 17 }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {bio}
          </Text>
        ) : null}
      </View>

      {/* Right accessory slot */}
      {rightAccessory != null && (
        <View style={{ marginLeft: 8 }}>{rightAccessory}</View>
      )}
    </Pressable>
  );
});
