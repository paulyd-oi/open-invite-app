import React from "react";
import { View, Text, Pressable } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  Calendar,
  Users,
  Bell,
  Camera,
  Search,
  Sparkles,
  Heart,
  MessageCircle,
  MapPin,
  Star,
} from "@/ui/icons";
import { useTheme } from "@/lib/ThemeContext";

interface EmptyStateProps {
  type: "events" | "friends" | "notifications" | "photos" | "search" | "activity" | "suggestions";
  title?: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

// Animated floating elements for visual interest
function FloatingElement({
  icon: Icon,
  color,
  size,
  delay,
  x,
  y,
}: {
  icon: React.ElementType | undefined;
  color: string;
  size: number;
  delay: number;
  x: number;
  y: number;
}) {
  const translateY = useSharedValue(0);

  React.useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-8, { duration: 1500 }),
          withTiming(8, { duration: 1500 })
        ),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Guard: only render if Icon is a valid component
  if (!Icon || typeof Icon !== 'function') {
    return null;
  }

  return (
    <Animated.View
      entering={FadeIn.delay(delay).duration(600)}
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity: 0.6,
      }}
    >
      <Animated.View style={animatedStyle}>
        <Icon size={size} color={color} />
      </Animated.View>
    </Animated.View>
  );
}

// Pulsing center icon
function PulsingIcon({ icon: Icon, color, backgroundColor }: { icon: React.ElementType | undefined; color: string; backgroundColor: string }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.3);

  React.useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      true
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 1000 }),
        withTiming(0.3, { duration: 1000 })
      ),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  // Guard: only render if Icon is a valid component
  if (!Icon || typeof Icon !== 'function') {
    return (
      <View className="items-center justify-center">
        <View
          style={{
            width: 100,
            height: 100,
            borderRadius: 50,
            backgroundColor: color,
          }}
        />
      </View>
    );
  }

  return (
    <View className="items-center justify-center">
      {/* Pulse ring */}
      <Animated.View
        style={[
          {
            position: "absolute",
            width: 100,
            height: 100,
            borderRadius: 50,
            backgroundColor: color,
          },
          pulseStyle,
        ]}
      />
      {/* Main icon container */}
      <Animated.View
        entering={FadeInDown.springify()}
        className="w-20 h-20 rounded-full items-center justify-center"
        style={{ backgroundColor }}
      >
        <Icon size={36} color={color} />
      </Animated.View>
    </View>
  );
}

export function EmptyState({
  type,
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const { themeColor, isDark, colors } = useTheme();

  // Default content based on type
  const config = {
    events: {
      icon: Calendar,
      defaultTitle: "No events yet",
      defaultSubtitle: "When your friends share events, they'll show up here. Or be the first to create one!",
      emoji: "🎉",
      accentColor: themeColor,
      floatingIcons: [
        { icon: Star, color: "#FFD700", size: 16, delay: 0, x: 20, y: 30 },
        { icon: Heart, color: "#FF6B6B", size: 14, delay: 200, x: 280, y: 50 },
        { icon: MapPin, color: "#4ECDC4", size: 18, delay: 400, x: 50, y: 140 },
      ],
    },
    friends: {
      icon: Users,
      defaultTitle: "Add your first friend",
      defaultSubtitle: "Connect with friends to share events and see what everyone is up to!",
      emoji: "👋",
      accentColor: "#4ECDC4",
      floatingIcons: [
        { icon: Heart, color: "#FF6B6B", size: 14, delay: 0, x: 30, y: 40 },
        { icon: Star, color: "#FFD700", size: 16, delay: 300, x: 270, y: 60 },
        { icon: Sparkles, color: "#9C27B0", size: 14, delay: 500, x: 280, y: 130 },
      ],
    },
    notifications: {
      icon: Bell,
      defaultTitle: "You're all caught up!",
      defaultSubtitle: "When you receive notifications, they'll appear here.",
      emoji: "🔔",
      accentColor: "#FF9800",
      floatingIcons: [
        { icon: MessageCircle, color: "#2196F3", size: 14, delay: 0, x: 40, y: 50 },
        { icon: Heart, color: "#FF6B6B", size: 12, delay: 400, x: 260, y: 40 },
      ],
    },
    photos: {
      icon: Camera,
      defaultTitle: "No photos yet",
      defaultSubtitle: "Share your favorite moments from this event.",
      emoji: "📸",
      accentColor: "#E91E63",
      floatingIcons: [
        { icon: Heart, color: "#FF6B6B", size: 16, delay: 0, x: 25, y: 45 },
        { icon: Star, color: "#FFD700", size: 14, delay: 300, x: 275, y: 55 },
      ],
    },
    search: {
      icon: Search,
      defaultTitle: "No results found",
      defaultSubtitle: "Try adjusting your search or filters.",
      emoji: "🔍",
      accentColor: "#607D8B",
      floatingIcons: [],
    },
    activity: {
      icon: Sparkles,
      defaultTitle: "No activity yet",
      defaultSubtitle: "When your friends create events, join events, or share photos, you'll see their activity here.",
      emoji: "✨",
      accentColor: "#9C27B0",
      floatingIcons: [
        { icon: Calendar, color: "#4CAF50", size: 16, delay: 0, x: 35, y: 35 },
        { icon: Heart, color: "#FF6B6B", size: 14, delay: 200, x: 265, y: 50 },
        { icon: Camera, color: "#FF9800", size: 14, delay: 400, x: 45, y: 130 },
      ],
    },
    suggestions: {
      icon: Users,
      defaultTitle: "No suggestions yet",
      defaultSubtitle: "As you add more friends, we'll suggest people you might know based on mutual connections.",
      emoji: "🤝",
      accentColor: "#2196F3",
      floatingIcons: [
        { icon: Sparkles, color: "#9C27B0", size: 14, delay: 0, x: 40, y: 40 },
        { icon: Heart, color: "#FF6B6B", size: 16, delay: 300, x: 260, y: 55 },
      ],
    },
  }[type];

  const Icon = config.icon;
  const displayTitle = title || config.defaultTitle;
  const displaySubtitle = subtitle || config.defaultSubtitle;

  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      {/* Floating decorative elements */}
      <View className="relative w-full h-40 items-center justify-center">
        {config.floatingIcons.map((floatingIcon, index) => (
          <FloatingElement key={index} {...floatingIcon} />
        ))}

        {/* Main icon with pulse effect */}
        <PulsingIcon
          icon={Icon}
          color={config.accentColor}
          backgroundColor={config.accentColor + "15"}
        />
      </View>

      {/* Emoji */}
      <Animated.Text
        entering={FadeInDown.delay(200).springify()}
        className="text-4xl mt-4 mb-2"
      >
        {config.emoji}
      </Animated.Text>

      {/* Title */}
      <Animated.Text
        entering={FadeInDown.delay(300).springify()}
        className="text-xl font-semibold text-center mb-2"
        style={{ color: colors.text }}
      >
        {displayTitle}
      </Animated.Text>

      {/* Subtitle */}
      <Animated.Text
        entering={FadeInDown.delay(400).springify()}
        className="text-center text-sm leading-5 px-4"
        style={{ color: colors.textSecondary }}
      >
        {displaySubtitle}
      </Animated.Text>

      {/* Action Button */}
      {actionLabel && onAction && (
        <Animated.View entering={FadeInDown.delay(500).springify()}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onAction();
            }}
            className="mt-6 px-6 py-3 rounded-full"
            style={{
              backgroundColor: config.accentColor,
              shadowColor: config.accentColor,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0.5 : 0.3,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <Text className="text-white font-semibold">{actionLabel}</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}
