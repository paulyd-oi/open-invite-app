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
} from "@/ui/icons";
import { useQuery } from "@tanstack/react-query";

import { useTheme } from "@/lib/ThemeContext";
import { type SuggestionFeedItem, type SuggestionAction, type GetFriendsResponse } from "@/shared/contracts";
import { api } from "@/lib/api";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { guardEmailVerification } from "@/lib/emailVerificationGate";
import { useSession } from "@/lib/useSession";

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
      // [NUDGE_ARTIFACT_FIX] Use neutral theme-safe colors instead of orange
      return {
        icon: UserPlus,
        bgColor: "#6B728020",
        iconColor: "#6B7280",
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
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const style = getSuggestionStyle(suggestion.type);
  const Icon = style.icon;

  // Fetch friends list to map userId → friendshipId for RECONNECT_FRIEND suggestions
  const { data: friendsData } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: bootStatus === 'authed' && suggestion.type === "RECONNECT_FRIEND",
  });

  // Validate suggestion has required data for its type
  const isValidSuggestion = (() => {
    switch (suggestion.type) {
      case "JOIN_EVENT":
        return !!suggestion.eventId;
      case "RECONNECT_FRIEND":
        return !!suggestion.userId;
      default:
        return true; // NUDGE_CREATE, NUDGE_INVITE, HOT_AREA don't require IDs
    }
  })();

  // DEV-only validation logging
  if (__DEV__ && !isValidSuggestion) {
    console.warn(
      `[SUGGESTIONS_NAV_ERROR] Invalid suggestion: type=${suggestion.type}, ` +
      `eventId=${suggestion.eventId ?? 'undefined'}, userId=${suggestion.userId ?? 'undefined'}, ` +
      `title="${suggestion.title}"`
    );
  }

  // Don't render invalid suggestions (prevents dead taps)
  if (!isValidSuggestion) {
    return null;
  }

  const handlePress = () => {
    // DEV-only navigation logging
    if (__DEV__) {
      console.log(
        `[SUGGESTIONS_NAV] Tapped: type=${suggestion.type}, ` +
        `eventId=${suggestion.eventId ?? 'none'}, userId=${suggestion.userId ?? 'none'}`
      );
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    switch (suggestion.type) {
      case "JOIN_EVENT":
        // eventId is guaranteed valid by isValidSuggestion check above
        if (__DEV__) {
          console.log(`[SUGGESTIONS_NAV] Navigating to /event/${suggestion.eventId}`);
        }
        router.push(`/event/${suggestion.eventId}` as any);
        break;
      case "NUDGE_CREATE":
        if (!guardEmailVerification(session)) return;
        router.push("/create" as any);
        break;
      case "NUDGE_INVITE":
        router.push("/friends" as any);
        break;
      case "RECONNECT_FRIEND":
        // userId is guaranteed valid by isValidSuggestion check above
        const friendship = friendsData?.friends?.find(f => f.friend.id === suggestion.userId);
        
        if (friendship) {
          router.push(`/friend/${friendship.id}` as any);
        } else {
          router.push(`/user/${suggestion.userId}` as any);
        }
        break;
      case "HOT_AREA":
        router.push("/discover" as any);
        break;
    }
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).springify()}>
      <Pressable
        onPress={handlePress}
        className="mx-4 mb-3 p-4 rounded-2xl flex-row items-center"
        style={{ backgroundColor: colors.surface, overflow: 'hidden' }}
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
