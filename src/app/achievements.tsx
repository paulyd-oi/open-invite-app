import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { Trophy, Check, ChevronLeft, Sparkles, Lock, Medal } from "@/ui/icons";
import Animated, { FadeInDown, FadeIn, useAnimatedStyle, withSpring, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { type GetAchievementsResponse, type AchievementProgress, TIER_COLORS } from "@/shared/contracts";

const CATEGORY_INFO = {
  hosting: { label: "Hosting", icon: "🎪", color: "#FF6B4A" },
  attending: { label: "Attending", icon: "🙌", color: "#4ECDC4" },
  streak: { label: "Streaks", icon: "🔥", color: "#FF9800" },
  // Hidden for launch - will be enabled in future update:
  // crowd: { label: "Crowd Size", icon: "👥", color: "#9C27B0" },
  // social: { label: "Social", icon: "🤝", color: "#2196F3" },
} as const;

// Keep for sorting but de-emphasize in UI
const TIER_ORDER = ["bronze", "silver", "gold", "platinum", "diamond"] as const;
const TIER_LABELS = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
  diamond: "Diamond",
} as const;

function AchievementBadge({
  achievement,
  isSelected,
  onSelect,
  index,
}: {
  achievement: AchievementProgress;
  isSelected: boolean;
  onSelect: (id: string) => void;
  index: number;
}) {
  const { isDark, colors, themeColor } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    if (!achievement.unlocked) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withSpring(1)
    );
    onSelect(achievement.id);
  };

  const tierColor = achievement.tierColor;
  const progressPercent = (achievement.progress / achievement.target) * 100;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50).springify()}
      style={animatedStyle}
    >
      <Pressable
        onPress={handlePress}
        className="rounded-2xl p-4 mb-3"
        style={{
          backgroundColor: achievement.unlocked
            ? (isSelected ? tierColor + "30" : tierColor + "15")
            : colors.surface,
          borderWidth: isSelected ? 2 : 1,
          borderColor: isSelected ? tierColor : (achievement.unlocked ? tierColor + "50" : colors.border),
          opacity: achievement.unlocked ? 1 : 0.6,
        }}
      >
        <View className="flex-row items-center">
          {/* Badge Icon */}
          <View
            className="w-16 h-16 rounded-full items-center justify-center mr-4"
            style={{
              backgroundColor: achievement.unlocked ? tierColor + "30" : colors.surface,
              borderWidth: 2,
              borderColor: achievement.unlocked ? tierColor : colors.border,
            }}
          >
            <Text className="text-3xl">{achievement.emoji}</Text>
            {!achievement.unlocked && (
              <View className="absolute inset-0 rounded-full items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
                <Lock size={20} color="#fff" />
              </View>
            )}
          </View>

          {/* Info */}
          <View className="flex-1">
            <View className="flex-row items-center">
              <Text className="font-bold text-base" style={{ color: colors.text }}>
                {achievement.name}
              </Text>
              {isSelected && (
                <View className="ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: tierColor }}>
                  <Text className="text-xs font-medium text-white">EQUIPPED</Text>
                </View>
              )}
            </View>
            <Text className="text-sm mt-0.5" style={{ color: colors.textSecondary }}>
              {achievement.description}
            </Text>

            {/* Tier Badge */}
            <View className="flex-row items-center mt-2">
              <View
                className="px-2 py-0.5 rounded-full mr-2"
                style={{ backgroundColor: tierColor + "30" }}
              >
                <Text className="text-xs font-semibold" style={{ color: tierColor }}>
                  {TIER_LABELS[achievement.tier as keyof typeof TIER_LABELS]}
                </Text>
              </View>

              {/* Progress */}
              {!achievement.unlocked && (
                <View className="flex-1 flex-row items-center">
                  <View className="flex-1 h-1.5 rounded-full mr-2" style={{ backgroundColor: colors.border }}>
                    <View
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(progressPercent, 100)}%`,
                        backgroundColor: tierColor,
                      }}
                    />
                  </View>
                  <Text className="text-xs" style={{ color: colors.textTertiary }}>
                    {achievement.progress}/{achievement.target}
                  </Text>
                </View>
              )}

              {achievement.unlocked && (
                <View className="flex-row items-center">
                  <Check size={14} color={tierColor} />
                  <Text className="text-xs ml-1" style={{ color: tierColor }}>
                    Unlocked
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function CategorySection({
  category,
  achievements,
  selectedBadgeId,
  onSelectBadge,
}: {
  category: keyof typeof CATEGORY_INFO;
  achievements: AchievementProgress[];
  selectedBadgeId: string | null;
  onSelectBadge: (id: string) => void;
}) {
  const { colors } = useTheme();
  const info = CATEGORY_INFO[category];
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  return (
    <View className="mb-6">
      <View className="flex-row items-center mb-3">
        <Text className="text-2xl mr-2">{info.icon}</Text>
        <Text className="text-lg font-bold" style={{ color: colors.text }}>
          {info.label}
        </Text>
        <View className="ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: info.color + "20" }}>
          <Text className="text-xs font-medium" style={{ color: info.color }}>
            {unlockedCount}/{achievements.length}
          </Text>
        </View>
      </View>

      {achievements.map((achievement, index) => (
        <AchievementBadge
          key={achievement.id}
          achievement={achievement}
          isSelected={selectedBadgeId === achievement.id}
          onSelect={onSelectBadge}
          index={index}
        />
      ))}
    </View>
  );
}

export default function AchievementsScreen() {
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const [filter, setFilter] = useState<"all" | "unlocked" | "locked">("all");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["achievements"],
    queryFn: () => api.get<GetAchievementsResponse>("/api/profile/achievements"),
    enabled: !!session,
  });

  const setBadgeMutation = useMutation({
    mutationFn: (achievementId: string | null) =>
      api.put("/api/achievements/badge", { achievementId }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["achievements"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const achievements = data?.achievements ?? [];
  const stats = data?.stats;
  const selectedBadgeId = data?.selectedBadgeId ?? null;

  // Group achievements by category
  const groupedAchievements = useMemo(() => {
    const groups: Record<string, AchievementProgress[]> = {};

    let filtered = achievements;
    if (filter === "unlocked") {
      filtered = achievements.filter(a => a.unlocked);
    } else if (filter === "locked") {
      filtered = achievements.filter(a => !a.unlocked);
    }

    for (const achievement of filtered) {
      if (!groups[achievement.category]) {
        groups[achievement.category] = [];
      }
      groups[achievement.category].push(achievement);
    }

    // Sort by tier order within each category
    for (const category of Object.keys(groups)) {
      groups[category].sort((a, b) => {
        return TIER_ORDER.indexOf(a.tier as any) - TIER_ORDER.indexOf(b.tier as any);
      });
    }

    return groups;
  }, [achievements, filter]);

  const handleSelectBadge = (achievementId: string) => {
    // Toggle off if already selected
    const newId = selectedBadgeId === achievementId ? null : achievementId;
    setBadgeMutation.mutate(newId);
  };

  if (!session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Achievements" }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in</Text>
        </View>
      </SafeAreaView>
    );
  }

  const unlockedCount = stats?.totalUnlocked ?? 0;
  const totalCount = stats?.totalAchievements ?? 0;

  return (
    <SafeAreaView className="flex-1" edges={["bottom"]} style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: "Achievements",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} className="mr-4">
              <ChevronLeft size={24} color={colors.text} />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={themeColor}
          />
        }
      >
        {/* Stats Header */}
        <Animated.View entering={FadeInDown.springify()}>
          <View
            className="rounded-2xl p-5 mb-6"
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center">
                <Trophy size={28} color="#FFD700" />
                <Text className="text-2xl font-bold ml-3" style={{ color: colors.text }}>
                  {unlockedCount}/{totalCount}
                </Text>
              </View>
              <View className="px-3 py-1 rounded-full" style={{ backgroundColor: themeColor + "20" }}>
                <Text className="text-sm font-medium" style={{ color: themeColor }}>
                  {Math.round((unlockedCount / totalCount) * 100)}% Complete
                </Text>
              </View>
            </View>

            {/* Progress Bar */}
            <View className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: colors.border }}>
              <View
                className="h-full rounded-full"
                style={{
                  width: `${(unlockedCount / totalCount) * 100}%`,
                  backgroundColor: "#FFD700",
                }}
              />
            </View>

            {/* Stats Row */}
            <View className="flex-row mt-4 pt-4 border-t" style={{ borderTopColor: colors.border }}>
              <View className="flex-1 items-center">
                <Text className="text-xl font-bold" style={{ color: themeColor }}>
                  {stats?.completedEventsHosted ?? 0}
                </Text>
                <Text className="text-xs" style={{ color: colors.textTertiary }}>Events Hosted</Text>
              </View>
              <View className="flex-1 items-center">
                <Text className="text-xl font-bold" style={{ color: "#4ECDC4" }}>
                  {stats?.completedEventsAttended ?? 0}
                </Text>
                <Text className="text-xs" style={{ color: colors.textTertiary }}>Events Attended</Text>
              </View>
              <View className="flex-1 items-center">
                <Text className="text-xl font-bold" style={{ color: "#FF9800" }}>
                  {stats?.currentStreak ?? 0}
                </Text>
                <Text className="text-xs" style={{ color: colors.textTertiary }}>Week Streak</Text>
              </View>
              <View className="flex-1 items-center">
                <Text className="text-xl font-bold" style={{ color: "#2196F3" }}>
                  {stats?.friendsMade ?? 0}
                </Text>
                <Text className="text-xs" style={{ color: colors.textTertiary }}>Friends</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Selected Badge Info */}
        {selectedBadgeId && (
          <Animated.View entering={FadeIn}>
            <View
              className="rounded-xl p-4 mb-6 flex-row items-center"
              style={{
                backgroundColor: "#FFD70015",
                borderWidth: 1,
                borderColor: "#FFD70040",
              }}
            >
              <Medal size={20} color="#FFD700" />
              <Text className="ml-2 flex-1 text-sm" style={{ color: colors.text }}>
                Your selected badge is displayed on your profile card for friends to see!
              </Text>
              <Pressable
                onPress={() => setBadgeMutation.mutate(null)}
                className="px-3 py-1 rounded-full"
                style={{ backgroundColor: colors.surface }}
              >
                <Text className="text-xs" style={{ color: colors.textSecondary }}>Clear</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}

        {/* Filter Tabs */}
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <View className="flex-row mb-6">
            {(["all", "unlocked", "locked"] as const).map((f) => (
              <Pressable
                key={f}
                onPress={() => {
                  Haptics.selectionAsync();
                  setFilter(f);
                }}
                className="flex-1 py-2.5 rounded-xl mr-2"
                style={{
                  backgroundColor: filter === f ? themeColor : colors.surface,
                  borderWidth: 1,
                  borderColor: filter === f ? themeColor : colors.border,
                }}
              >
                <Text
                  className="text-center text-sm font-medium capitalize"
                  style={{ color: filter === f ? "#fff" : colors.textSecondary }}
                >
                  {f === "all" ? "All" : f === "unlocked" ? `Unlocked (${stats?.totalUnlocked ?? 0})` : `Locked (${(stats?.totalAchievements ?? 0) - (stats?.totalUnlocked ?? 0)})`}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* Achievement Categories */}
        {isLoading ? (
          <View className="py-8 items-center">
            <Text style={{ color: colors.textTertiary }}>Loading achievements...</Text>
          </View>
        ) : Object.keys(groupedAchievements).length === 0 ? (
          <View className="py-8 items-center">
            <Text className="text-4xl mb-3">🎯</Text>
            <Text style={{ color: colors.textTertiary }}>
              {filter === "unlocked" ? "No achievements unlocked yet" : "No achievements found"}
            </Text>
          </View>
        ) : (
          Object.entries(CATEGORY_INFO).map(([category]) => {
            const categoryAchievements = groupedAchievements[category];
            if (!categoryAchievements || categoryAchievements.length === 0) return null;

            return (
              <CategorySection
                key={category}
                category={category as keyof typeof CATEGORY_INFO}
                achievements={categoryAchievements}
                selectedBadgeId={selectedBadgeId}
                onSelectBadge={handleSelectBadge}
              />
            );
          })
        )}

        {/* Tip */}
        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <View
            className="rounded-xl p-4 mt-4 flex-row items-center"
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Sparkles size={20} color={themeColor} />
            <Text className="ml-3 flex-1 text-sm" style={{ color: colors.textSecondary }}>
              Tap any unlocked achievement to set it as your profile badge. Only completed events count toward progress!
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
