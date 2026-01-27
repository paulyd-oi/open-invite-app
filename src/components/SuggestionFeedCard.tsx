import React from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  Calendar,
  Plus,
  UserPlus,
  Users,
  TrendingUp,
  ChevronRight,
} from "@/ui/icons";
import { safeToast } from "@/lib/safeToast";

import { useTheme } from "@/lib/ThemeContext";
import { type SuggestionFeedItem, type SuggestionAction } from "@/shared/contracts";

interface SuggestionFeedCardProps {
  suggestion: SuggestionFeedItem;
  index: number;
}

// Icon and color mapping for each suggestion type
function getSuggestionStyle(type: SuggestionAction): {
  icon: React.ElementType;
  bgColor: string;
  iconColor: string;
} {
  switch (type) {
    case "JOIN_EVENT":
      return {
        icon: Calendar,
        bgColor: "#4F46E520",
        iconColor: "#4F46E5",
      };
    case "NUDGE_CREATE":
      return {
        icon: Plus,
        bgColor: "#10B98120",
        iconColor: "#10B981",
      };
    case "NUDGE_INVITE":
      return {
        icon: UserPlus,
        bgColor: "#F5920020",
        iconColor: "#F59200",
      };
    case "RECONNECT_FRIEND":
      return {
        icon: Users,
        bgColor: "#EC489920",
        iconColor: "#EC4899",
      };
    case "HOT_AREA":
      return {
        icon: TrendingUp,
        bgColor: "#EF444420",
        iconColor: "#EF4444",
      };
    default:
      return {
        icon: Calendar,
        bgColor: "#6B728020",
        iconColor: "#6B7280",
      };
  }
}

export function SuggestionFeedCard({ suggestion, index }: SuggestionFeedCardProps) {
  const router = useRouter();
  const { themeColor, colors } = useTheme();
  const style = getSuggestionStyle(suggestion.type);
  const Icon = style.icon;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    switch (suggestion.type) {
      case "JOIN_EVENT":
        if (suggestion.eventId) {
          router.push(`/event/${suggestion.eventId}` as any);
        } else {
          // Fallback: show toast if event ID is missing
          safeToast.info("Event unavailable", "This event is no longer available.");
        }
        break;
      case "NUDGE_CREATE":
        router.push("/create" as any);
        break;
      case "NUDGE_INVITE":
        router.push("/friends" as any);
        break;
      case "RECONNECT_FRIEND":
        if (suggestion.userId) {
          router.push(`/user/${suggestion.userId}` as any);
        } else {
          // Fallback: navigate to friends instead of dead tap
          safeToast.info("Reconnect", "Check your friends list to reconnect.");
          router.push("/friends" as any);
        }
        break;
      case "HOT_AREA":
        // Navigate to discover with category filter if available
        router.push("/discover" as any);
        break;
    }
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).springify()}>
      <Pressable
        onPress={handlePress}
        className="mx-4 mb-3 p-4 rounded-2xl flex-row items-center"
        style={{ backgroundColor: colors.surface }}
      >
        {/* Icon */}
        <View
          className="w-12 h-12 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: style.bgColor }}
        >
          <Icon size={22} color={style.iconColor} />
        </View>

        {/* Content */}
        <View className="flex-1">
          <Text
            className="text-base font-semibold"
            style={{ color: colors.text }}
            numberOfLines={1}
          >
            {suggestion.title}
          </Text>
          <Text
            className="text-sm mt-0.5"
            style={{ color: colors.textSecondary }}
            numberOfLines={1}
          >
            {suggestion.subtitle}
          </Text>
        </View>

        {/* CTA Button */}
        <Pressable
          onPress={handlePress}
          className="px-4 py-2 rounded-full flex-row items-center"
          style={{ backgroundColor: themeColor }}
        >
          <Text className="text-white font-medium text-sm">
            {suggestion.ctaLabel}
          </Text>
          <ChevronRight size={14} color="#fff" style={{ marginLeft: 2 }} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

// Empty state for when there are no suggestions
export function SuggestionsFeedEmpty() {
  const { colors, themeColor } = useTheme();
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center px-6 py-12">
      <View
        className="w-16 h-16 rounded-full items-center justify-center mb-4"
        style={{ backgroundColor: themeColor + "15" }}
      >
        <Calendar size={32} color={themeColor} />
      </View>

      <Text
        className="text-lg font-semibold text-center mb-2"
        style={{ color: colors.text }}
      >
        You're all caught up!
      </Text>

      <Text
        className="text-center text-sm leading-5 mb-6"
        style={{ color: colors.textSecondary }}
      >
        Check back later for new suggestions based on your activity.
      </Text>

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push("/discover" as any);
        }}
        className="px-6 py-3 rounded-full"
        style={{ backgroundColor: themeColor }}
      >
        <Text className="text-white font-semibold">Discover Events</Text>
      </Pressable>
    </View>
  );
}
