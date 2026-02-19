/**
 * SocialPulseRow — thin Apple-like card strip shown on Calendar day detail
 * when there is non-zero social activity this week (open events from feed).
 *
 * Reads from React Query cache only — no new network fetches.
 * Renders nothing when count === 0 or data unavailable.
 *
 * [P1_SOCIAL_PULSE] proof tag
 */

import React from "react";
import { View, Text, Pressable } from "react-native";
import { Activity, ChevronRight } from "@/ui/icons";
import { useTheme, TILE_SHADOW } from "@/lib/ThemeContext";
import * as Haptics from "expo-haptics";
import { devLog } from "@/lib/devLog";

type PulseVariant = "open_events" | "friend_updates";

interface SocialPulseRowProps {
  count: number;
  variant: PulseVariant;
  onPress: () => void;
}

function getCopy(count: number, variant: PulseVariant): string {
  if (variant === "open_events") {
    return `${count} open event${count === 1 ? "" : "s"} in your circles this week`;
  }
  return `${count} update${count === 1 ? "" : "s"} from friends this week`;
}

export function SocialPulseRow({ count, variant, onPress }: SocialPulseRowProps) {
  const { themeColor, colors, isDark } = useTheme();

  // Never render when count is 0
  if (count <= 0) return null;

  if (__DEV__) {
    devLog("[P1_SOCIAL_PULSE]", {
      visible: 1,
      variant,
      count,
      reason: "non_zero_activity",
    });
  }

  const copy = getCopy(count, variant);

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="rounded-xl px-3.5 py-3 mb-3 flex-row items-center"
      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
      style={{
        backgroundColor: isDark ? colors.surface : `${themeColor}05`,
        borderWidth: 1,
        borderColor: isDark ? colors.border : `${themeColor}10`,
        ...(isDark ? {} : TILE_SHADOW),
      }}
    >
      <View
        className="w-7 h-7 rounded-full items-center justify-center mr-2.5"
        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
        style={{ backgroundColor: `${themeColor}0D` }}
      >
        <Activity size={14} color={themeColor} />
      </View>
      <View className="flex-1 mr-2">
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <Text
          className="text-xs font-semibold mb-0.5"
          style={{ color: themeColor, opacity: 0.75 }}
        >
          This week
        </Text>
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <Text
          className="text-[12px] leading-[16px]"
          style={{ color: colors.textSecondary }}
        >
          {copy}
        </Text>
      </View>
      <ChevronRight size={14} color={colors.textSecondary} />
    </Pressable>
  );
}
