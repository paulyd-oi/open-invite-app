import React, { useState } from "react";
import { View, Text, Pressable, Modal, Share, Dimensions, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeIn,
  FadeInUp,
  SlideInRight,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { X, Share2, ChevronRight, Calendar, Users, MapPin, Sparkles, Award, Star } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/ThemeContext";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export interface MonthlyRecapData {
  month: string;
  year: number;
  totalEvents: number;
  totalHangouts: number;
  uniqueFriendsMetWith: number;
  topCategory: { name: string; emoji: string; count: number } | null;
  topFriend: { name: string; image: string | null; count: number } | null;
  topLocation: { name: string; count: number } | null;
  busiestDay: { day: string; count: number } | null;
  averagePerWeek: number;
  streak: number;
  rank: "social_butterfly" | "connector" | "rising_star" | "getting_started";
}

const RANK_CONFIG = {
  social_butterfly: {
    title: "Social Butterfly",
    emoji: "🦋",
    description: "You're the life of the party!",
    gradient: ["#FF6B4A", "#FF8C4A"] as [string, string],
  },
  connector: {
    title: "Super Connector",
    emoji: "🔗",
    description: "Bringing people together",
    gradient: ["#9B59B6", "#8E44AD"] as [string, string],
  },
  rising_star: {
    title: "Rising Star",
    emoji: "⭐",
    description: "You're making waves!",
    gradient: ["#F1C40F", "#F39C12"] as [string, string],
  },
  getting_started: {
    title: "Getting Started",
    emoji: "🌱",
    description: "Your social journey begins!",
    gradient: ["#27AE60", "#2ECC71"] as [string, string],
  },
};

interface MonthlyRecapProps {
  data: MonthlyRecapData;
  onClose: () => void;
  visible: boolean;
}

export function MonthlyRecap({ data, onClose, visible }: MonthlyRecapProps) {
  const { themeColor, isDark, colors } = useTheme();
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = buildSlides(data);
  const rankConfig = RANK_CONFIG[data.rank];

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const handlePrev = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleShare = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await Share.share({
        message: `📅 My ${data.month} ${data.year} Recap on Open Invite!\n\n` +
          `🎉 ${data.totalHangouts} hangouts\n` +
          `👥 ${data.uniqueFriendsMetWith} friends met with\n` +
          `${data.topCategory ? `${data.topCategory.emoji} Favorite: ${data.topCategory.name}\n` : ""}` +
          `\nI'm a ${rankConfig.emoji} ${rankConfig.title}!\n\n` +
          `#OpenInvite #MonthlyRecap`,
      });
    } catch (error) {
      console.error("Share error:", error);
    }
  };

  const handleClose = () => {
    setCurrentSlide(0);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View className="flex-1" style={{ backgroundColor: "rgba(0,0,0,0.95)" }}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-12 pb-4">
          <Pressable
            onPress={handleClose}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
          >
            <X size={20} color="#fff" />
          </Pressable>
          <Text className="text-white font-semibold">
            {data.month} {data.year} Recap
          </Text>
          <Pressable
            onPress={handleShare}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
          >
            <Share2 size={20} color="#fff" />
          </Pressable>
        </View>

        {/* Progress dots */}
        <View className="flex-row justify-center mb-4">
          {slides.map((_, idx) => (
            <View
              key={idx}
              className="w-2 h-2 rounded-full mx-1"
              style={{
                backgroundColor: idx === currentSlide ? "#fff" : "rgba(255,255,255,0.3)",
              }}
            />
          ))}
        </View>

        {/* Slide content */}
        <Pressable
          className="flex-1 px-6"
          onPress={handleNext}
        >
          <RecapSlide
            slide={slides[currentSlide]}
            data={data}
            rankConfig={rankConfig}
          />
        </Pressable>

        {/* Navigation hints */}
        <View className="flex-row justify-between items-center px-6 pb-8">
          <Pressable
            onPress={handlePrev}
            disabled={currentSlide === 0}
            className="flex-row items-center"
            style={{ opacity: currentSlide === 0 ? 0.3 : 1 }}
          >
            <Text className="text-white/60">← Previous</Text>
          </Pressable>

          {currentSlide === slides.length - 1 ? (
            <Pressable
              onPress={handleShare}
              className="flex-row items-center px-6 py-3 rounded-full"
              style={{ backgroundColor: themeColor }}
            >
              <Share2 size={18} color="#fff" />
              <Text className="text-white font-semibold ml-2">Share Recap</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleNext}
              className="flex-row items-center"
            >
              <Text className="text-white/60">Tap to continue</Text>
              <ChevronRight size={18} color="rgba(255,255,255,0.6)" />
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

interface SlideConfig {
  type: "intro" | "stat" | "top_friend" | "top_category" | "rank" | "streak";
  title: string;
  value?: string | number;
  subtitle?: string;
  emoji?: string;
  gradient?: [string, string];
}

function buildSlides(data: MonthlyRecapData): SlideConfig[] {
  const slides: SlideConfig[] = [
    {
      type: "intro",
      title: `Your ${data.month}`,
      subtitle: "Let's see what you've been up to!",
      emoji: "🎉",
      gradient: ["#FF6B4A", "#FF8C4A"],
    },
    {
      type: "stat",
      title: "Total Hangouts",
      value: data.totalHangouts,
      subtitle: `You made ${data.totalHangouts} memories this month!`,
      emoji: "📅",
      gradient: ["#4ECDC4", "#45B7AA"],
    },
    {
      type: "stat",
      title: "Friends Met With",
      value: data.uniqueFriendsMetWith,
      subtitle: `You connected with ${data.uniqueFriendsMetWith} amazing people`,
      emoji: "👥",
      gradient: ["#9B59B6", "#8E44AD"],
    },
  ];

  if (data.topFriend) {
    slides.push({
      type: "top_friend",
      title: "Your #1 Friend",
      value: data.topFriend.name,
      subtitle: `You hung out ${data.topFriend.count} times!`,
      emoji: "❤️",
      gradient: ["#E91E63", "#C2185B"],
    });
  }

  if (data.topCategory) {
    slides.push({
      type: "top_category",
      title: "Favorite Activity",
      value: data.topCategory.name,
      subtitle: `${data.topCategory.count} ${data.topCategory.name.toLowerCase()} sessions`,
      emoji: data.topCategory.emoji,
      gradient: ["#FF9800", "#F57C00"],
    });
  }

  if (data.busiestDay) {
    slides.push({
      type: "stat",
      title: "Busiest Day",
      value: data.busiestDay.day,
      subtitle: `${data.busiestDay.count} events on your busiest day!`,
      emoji: "🗓️",
      gradient: ["#3498DB", "#2980B9"],
    });
  }

  if (data.streak > 0) {
    slides.push({
      type: "streak",
      title: "Streak",
      value: data.streak,
      subtitle: `${data.streak} weeks of consistent hangouts!`,
      emoji: "🔥",
      gradient: ["#FF4500", "#FF6B00"],
    });
  }

  slides.push({
    type: "rank",
    title: RANK_CONFIG[data.rank].title,
    subtitle: RANK_CONFIG[data.rank].description,
    emoji: RANK_CONFIG[data.rank].emoji,
    gradient: RANK_CONFIG[data.rank].gradient,
  });

  return slides;
}

function RecapSlide({
  slide,
  data,
  rankConfig,
}: {
  slide: SlideConfig;
  data: MonthlyRecapData;
  rankConfig: typeof RANK_CONFIG[keyof typeof RANK_CONFIG];
}) {
  const numberScale = useSharedValue(0);

  React.useEffect(() => {
    numberScale.value = withDelay(200, withSpring(1, { damping: 8 }));
  }, [slide]);

  const numberStyle = useAnimatedStyle(() => ({
    transform: [{ scale: numberScale.value }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-1 items-center justify-center"
    >
      <LinearGradient
        colors={(slide.gradient || ["#FF6B4A", "#FF8C4A"]) as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          position: "absolute",
          width: SCREEN_WIDTH * 0.9,
          height: SCREEN_WIDTH * 1.2,
          borderRadius: 32,
          opacity: 0.15,
        }}
      />

      {/* Emoji */}
      <Animated.View
        entering={FadeInUp.delay(100).springify()}
        className="mb-6"
      >
        <Text style={{ fontSize: 80 }}>{slide.emoji}</Text>
      </Animated.View>

      {/* Title */}
      <Animated.Text
        entering={FadeInUp.delay(200).springify()}
        className="text-white/60 text-lg font-medium mb-2"
      >
        {slide.title}
      </Animated.Text>

      {/* Value */}
      {slide.value !== undefined && (
        <Animated.View style={numberStyle}>
          <Text className="text-white text-6xl font-black text-center">
            {slide.value}
          </Text>
        </Animated.View>
      )}

      {/* Subtitle */}
      {slide.subtitle && (
        <Animated.Text
          entering={FadeInUp.delay(400).springify()}
          className="text-white/80 text-lg text-center mt-4 px-8"
        >
          {slide.subtitle}
        </Animated.Text>
      )}

      {/* Special content for rank slide */}
      {slide.type === "rank" && (
        <Animated.View
          entering={FadeInUp.delay(500).springify()}
          className="mt-8 items-center"
        >
          <LinearGradient
            colors={rankConfig.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="px-8 py-4 rounded-2xl"
          >
            <View className="flex-row items-center">
              <Award size={24} color="#fff" />
              <Text className="text-white text-xl font-bold ml-2">
                {rankConfig.title}
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>
      )}
    </Animated.View>
  );
}

// Trigger button component
export function MonthlyRecapButton({
  data,
  onPress,
}: {
  data: MonthlyRecapData | null;
  onPress: () => void;
}) {
  const { themeColor, isDark, colors } = useTheme();

  if (!data) return null;

  const rankConfig = RANK_CONFIG[data.rank];

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      className="rounded-2xl overflow-hidden mb-4"
    >
      <LinearGradient
        colors={rankConfig.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="p-4"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="w-12 h-12 rounded-xl bg-white/20 items-center justify-center">
              <Text className="text-2xl">{rankConfig.emoji}</Text>
            </View>
            <View className="ml-3">
              <Text className="text-white/80 text-xs font-medium">
                {data.month} Recap Ready!
              </Text>
              <Text className="text-white text-lg font-bold">
                {data.totalHangouts} Hangouts
              </Text>
            </View>
          </View>
          <View className="flex-row items-center">
            <Sparkles size={16} color="#fff" />
            <Text className="text-white font-semibold ml-1">View</Text>
            <ChevronRight size={18} color="#fff" />
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}
