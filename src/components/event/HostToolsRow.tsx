import React from "react";
import { Pressable, View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Share2, Copy, Pencil, HandCoins, ListChecks } from "@/ui/icons";
import { RADIUS } from "@/ui/layout";

interface BringListItem {
  claimedByUserId?: string | null;
}

interface HostToolsRowColors {
  text: string;
  textSecondary: string;
}

interface HostToolsRowProps {
  bringListEnabled: boolean;
  bringListItems: BringListItem[];
  pitchInEnabled: boolean;
  pitchInHandle: string | null | undefined;
  pitchInMethod: string | null | undefined;
  isDark: boolean;
  themeColor: string;
  colors: HostToolsRowColors;
  onShare: () => void;
  onCopyReminder: () => void;
  onEdit: () => void;
}

export function HostToolsRow({
  bringListEnabled,
  bringListItems,
  pitchInEnabled,
  pitchInHandle,
  pitchInMethod,
  isDark,
  themeColor,
  colors,
  onShare,
  onCopyReminder,
  onEdit,
}: HostToolsRowProps) {
  const hasBringList = bringListEnabled && bringListItems.length > 0;
  const bringClaimed = bringListItems.filter((i) => !!i.claimedByUserId).length;
  const hasPitchIn = pitchInEnabled && !!pitchInHandle;

  return (
    <Animated.View entering={FadeInDown.delay(85).springify()} style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 4 }}>
      {/* Compact action row */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {/* Share */}
        <Pressable
          onPress={onShare}
          style={{
            flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
            paddingVertical: 10, borderRadius: RADIUS.md,
            backgroundColor: themeColor,
          }}
        >
          <Share2 size={14} color="#FFFFFF" />
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFFFFF", marginLeft: 6 }}>Share</Text>
        </Pressable>
        {/* Copy reminder */}
        <Pressable
          onPress={onCopyReminder}
          style={{
            flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
            paddingVertical: 10, borderRadius: RADIUS.md,
            backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
          }}
        >
          <Copy size={14} color={colors.text} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginLeft: 6 }}>Reminder</Text>
        </Pressable>
        {/* Edit */}
        <Pressable
          onPress={onEdit}
          style={{
            flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
            paddingVertical: 10, borderRadius: RADIUS.md,
            backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
          }}
        >
          <Pencil size={14} color={colors.text} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginLeft: 6 }}>Edit</Text>
        </Pressable>
      </View>

      {/* Coordination summaries */}
      {(hasBringList || hasPitchIn) && (
        <View style={{ marginTop: 10 }}>
          {hasBringList && (
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
              <ListChecks size={13} color={colors.textSecondary} />
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 6 }}>
                What to bring: {bringClaimed}/{bringListItems.length} claimed
              </Text>
            </View>
          )}
          {hasPitchIn && (
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
              <HandCoins size={13} color={colors.textSecondary} />
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 6 }}>
                Pitch In: {pitchInMethod === "venmo" ? "Venmo" : pitchInMethod === "cashapp" ? "Cash App" : pitchInMethod === "paypal" ? "PayPal" : ""} @{pitchInHandle}
              </Text>
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
}
