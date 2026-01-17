import React from "react";
import { View, Text, Pressable } from "react-native";
import {
  Calendar,
  Users,
  MapPin,
  Bell,
  Camera,
  MessageCircle,
  Heart,
  Search,
  Plus,
} from "lucide-react-native";
import Animated, { FadeIn, FadeInDown, FadeInUp, BounceIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";

type EmptyStateType =
  | "events"
  | "friends"
  | "notifications"
  | "photos"
  | "comments"
  | "search"
  | "calendar";

interface EmptyStateProps {
  type: EmptyStateType;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

const EMPTY_STATE_CONFIG: Record<
  EmptyStateType,
  {
    icon: React.ComponentType<{ size: number; color: string }>;
    emoji: string;
    defaultTitle: string;
    defaultDescription: string;
    color: string;
    actionLabel?: string;
  }
> = {
  events: {
    icon: Calendar,
    emoji: "🎉",
    defaultTitle: "No events yet",
    defaultDescription: "When your friends share events, they'll show up here. Or create your own!",
    color: "#FF6B4A",
    actionLabel: "Create Event",
  },
  friends: {
    icon: Users,
    emoji: "👋",
    defaultTitle: "No friends yet",
    defaultDescription: "Add friends to see their events and share yours with them!",
    color: "#4ECDC4",
    actionLabel: "Add Friends",
  },
  notifications: {
    icon: Bell,
    emoji: "🔔",
    defaultTitle: "All caught up!",
    defaultDescription: "You have no new notifications. Check back later!",
    color: "#9B59B6",
  },
  photos: {
    icon: Camera,
    emoji: "📸",
    defaultTitle: "No photos yet",
    defaultDescription: "Share your favorite moments from events!",
    color: "#3498DB",
    actionLabel: "Add Photo",
  },
  comments: {
    icon: MessageCircle,
    emoji: "💬",
    defaultTitle: "No comments yet",
    defaultDescription: "Be the first to comment on this event!",
    color: "#E74C3C",
  },
  search: {
    icon: Search,
    emoji: "🔍",
    defaultTitle: "No results found",
    defaultDescription: "Try searching with different keywords",
    color: "#95A5A6",
  },
  calendar: {
    icon: Calendar,
    emoji: "📅",
    defaultTitle: "Nothing planned",
    defaultDescription: "Your calendar is free! Time to make plans.",
    color: "#FF6B4A",
    actionLabel: "Create Event",
  },
};

export function EmptyState({
  type,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
}: EmptyStateProps) {
  const { themeColor, isDark, colors } = useTheme();
  const config = EMPTY_STATE_CONFIG[type];
  const IconComponent = config.icon;

  const displayTitle = title ?? config.defaultTitle;
  const displayDescription = description ?? config.defaultDescription;
  const displayActionLabel = actionLabel ?? config.actionLabel;

  if (compact) {
    return (
      <Animated.View
        entering={FadeIn.duration(300)}
        className="rounded-xl p-5 items-center"
        style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
      >
        <Text className="text-3xl mb-2">{config.emoji}</Text>
        <Text className="font-semibold text-center" style={{ color: colors.text }}>
          {displayTitle}
        </Text>
        <Text className="text-sm text-center mt-1" style={{ color: colors.textSecondary }}>
          {displayDescription}
        </Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={FadeInDown.springify()}
      className="flex-1 items-center justify-center px-8 py-12"
    >
      {/* Animated Icon Container */}
      <Animated.View
        entering={BounceIn.delay(100).springify()}
        className="relative mb-6"
      >
        {/* Background Circle */}
        <View
          className="w-24 h-24 rounded-full items-center justify-center"
          style={{ backgroundColor: `${config.color}15` }}
        >
          {/* Inner Circle with Emoji */}
          <View
            className="w-16 h-16 rounded-full items-center justify-center"
            style={{ backgroundColor: `${config.color}25` }}
          >
            <Text className="text-4xl">{config.emoji}</Text>
          </View>
        </View>

        {/* Decorative Dots */}
        <Animated.View
          entering={FadeIn.delay(300)}
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full"
          style={{ backgroundColor: config.color }}
        />
        <Animated.View
          entering={FadeIn.delay(400)}
          className="absolute -bottom-2 -left-2 w-2 h-2 rounded-full"
          style={{ backgroundColor: `${config.color}60` }}
        />
        <Animated.View
          entering={FadeIn.delay(500)}
          className="absolute top-4 -left-3 w-2 h-2 rounded-full"
          style={{ backgroundColor: `${config.color}40` }}
        />
      </Animated.View>

      {/* Text Content */}
      <Animated.View entering={FadeInUp.delay(200)} className="items-center">
        <Text
          className="text-xl font-bold text-center mb-2"
          style={{ color: colors.text }}
        >
          {displayTitle}
        </Text>
        <Text
          className="text-center leading-6 max-w-xs"
          style={{ color: colors.textSecondary }}
        >
          {displayDescription}
        </Text>
      </Animated.View>

      {/* Action Button */}
      {displayActionLabel && onAction && (
        <Animated.View entering={FadeInUp.delay(400)}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onAction();
            }}
            className="mt-6 px-6 py-3 rounded-full flex-row items-center"
            style={{
              backgroundColor: themeColor,
              shadowColor: themeColor,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0.5 : 0.3,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <Plus size={18} color="#fff" />
            <Text className="text-white font-semibold ml-2">{displayActionLabel}</Text>
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

// Specialized empty states with illustrations
export function EventsEmptyState({ onCreateEvent }: { onCreateEvent?: () => void }) {
  const { themeColor, isDark, colors } = useTheme();

  return (
    <Animated.View
      entering={FadeInDown.springify()}
      className="items-center justify-center px-6 py-12"
    >
      {/* Illustration */}
      <Animated.View
        entering={BounceIn.delay(100)}
        className="relative mb-6"
      >
        {/* Calendar Stack Effect */}
        <View
          className="absolute -top-2 -left-2 w-20 h-20 rounded-2xl transform -rotate-6"
          style={{ backgroundColor: `${themeColor}10` }}
        />
        <View
          className="absolute -top-1 -left-1 w-20 h-20 rounded-2xl transform -rotate-3"
          style={{ backgroundColor: `${themeColor}15` }}
        />
        <View
          className="w-20 h-20 rounded-2xl items-center justify-center"
          style={{ backgroundColor: `${themeColor}25` }}
        >
          <Text className="text-4xl">🎉</Text>
        </View>

        {/* Floating Elements */}
        <Animated.Text
          entering={FadeIn.delay(400)}
          className="absolute -right-4 -top-2 text-2xl"
        >
          ✨
        </Animated.Text>
        <Animated.Text
          entering={FadeIn.delay(500)}
          className="absolute -left-3 bottom-0 text-lg"
        >
          🎈
        </Animated.Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(200)} className="items-center">
        <Text
          className="text-xl font-bold text-center mb-2"
          style={{ color: colors.text }}
        >
          No open invites yet
        </Text>
        <Text
          className="text-center leading-6 max-w-xs"
          style={{ color: colors.textSecondary }}
        >
          When your friends share events, they'll show up here. Or be the first to create one!
        </Text>
      </Animated.View>

      {onCreateEvent && (
        <Animated.View entering={FadeInUp.delay(400)}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onCreateEvent();
            }}
            className="mt-6 px-6 py-3 rounded-full flex-row items-center"
            style={{
              backgroundColor: themeColor,
              shadowColor: themeColor,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0.5 : 0.3,
              shadowRadius: 8,
            }}
          >
            <Plus size={18} color="#fff" />
            <Text className="text-white font-semibold ml-2">Create Event</Text>
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

export function FriendsEmptyState({ onAddFriends }: { onAddFriends?: () => void }) {
  const { themeColor, isDark, colors } = useTheme();

  return (
    <Animated.View
      entering={FadeInDown.springify()}
      className="items-center justify-center px-6 py-12"
    >
      {/* People Illustration */}
      <Animated.View
        entering={BounceIn.delay(100)}
        className="flex-row items-center mb-6"
      >
        {/* Person 1 */}
        <Animated.View
          entering={FadeIn.delay(200)}
          className="w-14 h-14 rounded-full items-center justify-center -mr-3 z-10"
          style={{
            backgroundColor: "#4ECDC420",
            borderWidth: 3,
            borderColor: colors.surface,
          }}
        >
          <Text className="text-2xl">👤</Text>
        </Animated.View>
        {/* Person 2 */}
        <Animated.View
          entering={FadeIn.delay(300)}
          className="w-16 h-16 rounded-full items-center justify-center z-20"
          style={{
            backgroundColor: `${themeColor}25`,
            borderWidth: 3,
            borderColor: colors.surface,
          }}
        >
          <Text className="text-3xl">👋</Text>
        </Animated.View>
        {/* Person 3 */}
        <Animated.View
          entering={FadeIn.delay(400)}
          className="w-14 h-14 rounded-full items-center justify-center -ml-3 z-10"
          style={{
            backgroundColor: "#9B59B620",
            borderWidth: 3,
            borderColor: colors.surface,
          }}
        >
          <Text className="text-2xl">👤</Text>
        </Animated.View>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(200)} className="items-center">
        <Text
          className="text-xl font-bold text-center mb-2"
          style={{ color: colors.text }}
        >
          Add your friends
        </Text>
        <Text
          className="text-center leading-6 max-w-xs"
          style={{ color: colors.textSecondary }}
        >
          Connect with friends to see their events and share yours with them!
        </Text>
      </Animated.View>

      {onAddFriends && (
        <Animated.View entering={FadeInUp.delay(400)}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onAddFriends();
            }}
            className="mt-6 px-6 py-3 rounded-full flex-row items-center"
            style={{
              backgroundColor: "#4ECDC4",
              shadowColor: "#4ECDC4",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0.5 : 0.3,
              shadowRadius: 8,
            }}
          >
            <Users size={18} color="#fff" />
            <Text className="text-white font-semibold ml-2">Add Friends</Text>
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

export function NotificationsEmptyState() {
  const { colors } = useTheme();

  return (
    <Animated.View
      entering={FadeInDown.springify()}
      className="items-center justify-center px-6 py-12"
    >
      <Animated.View
        entering={BounceIn.delay(100)}
        className="w-20 h-20 rounded-full items-center justify-center mb-6"
        style={{ backgroundColor: "#9B59B620" }}
      >
        <Text className="text-4xl">🔔</Text>
        {/* Checkmark Badge */}
        <View
          className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full items-center justify-center"
          style={{ backgroundColor: "#22C55E" }}
        >
          <Text className="text-white text-xs">✓</Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(200)} className="items-center">
        <Text
          className="text-xl font-bold text-center mb-2"
          style={{ color: colors.text }}
        >
          All caught up!
        </Text>
        <Text
          className="text-center leading-6 max-w-xs"
          style={{ color: colors.textSecondary }}
        >
          You have no new notifications. Enjoy the calm! 🧘
        </Text>
      </Animated.View>
    </Animated.View>
  );
}
