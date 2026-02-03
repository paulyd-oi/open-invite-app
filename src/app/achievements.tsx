import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ChevronLeft, Award, Star, Check, X } from "@/ui/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { safeToast } from "@/lib/safeToast";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { devLog } from "@/lib/devLog";

interface BadgeCatalogItem {
  badgeKey: string;
  name: string;
  description: string;
  tierColor: string;
  unlockTarget: number | null;
  progressCurrent: number;
  unlocked: boolean;
  featured: boolean;
}

interface BadgeCatalogResponse {
  badges: BadgeCatalogItem[];
}

// Helper to convert hex color to rgba with opacity
function hexToRgba(hex: string, opacity: number): string {
  // Validate hex format (#RRGGBB)
  if (!hex || typeof hex !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return "rgba(255, 255, 255, 0.12)";
  }
  
  // Clamp opacity to [0, 1]
  const clampedOpacity = Math.max(0, Math.min(1, opacity));
  
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${clampedOpacity})`;
}

export default function BadgesScreen() {
  const router = useRouter();
  const { colors, themeColor } = useTheme();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<BadgeCatalogItem | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["badgesCatalog"],
    queryFn: async () => {
      if (__DEV__) {
        devLog("[BADGES_FETCH] Fetching badges catalog...");
      }
      const response = await api.get<BadgeCatalogResponse>("/api/badges/catalog");
      if (__DEV__) {
        devLog("[BADGES_FETCH] Response:", {
          badgesCount: response?.badges?.length ?? 0,
          responseKeys: Object.keys(response || {}),
          unlockedCount: response?.badges?.filter(b => b.unlocked).length ?? 0,
        });
      }
      return response;
    },
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  const setFeaturedMutation = useMutation({
    mutationFn: (badgeKey: string | null) =>
      api.put("/api/profile/featured-badge", { badgeKey }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["badgesCatalog"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Featured badge updated");
    },
    onError: (error: unknown) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Check for specific "badge not unlocked" error from backend
      const errorData = error && typeof error === "object" && "data" in error
        ? (error as { data?: { error?: string } }).data
        : null;
      const message = errorData?.error?.toLowerCase().includes("not unlocked")
        ? "Badge not unlocked yet"
        : "Failed to update featured badge";
      safeToast.error(message);
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleSetFeatured = (badgeKey: string) => {
    setFeaturedMutation.mutate(badgeKey);
  };

  const handleRemoveFeatured = () => {
    setFeaturedMutation.mutate(null);
  };

  const badges = data?.badges ?? [];
  const unlockedBadges = badges.filter((b) => b.unlocked);
  // Hide Founder badge from locked section (not earnable by regular users)
  const lockedBadges = badges.filter((b) => !b.unlocked && b.badgeKey !== "founder");
  const featuredBadge = badges.find((b) => b.featured);

  // DEV logging for render decision
  React.useEffect(() => {
    if (__DEV__) {
      devLog("[BADGES_RENDER]", {
        bootStatus,
        isLoading,
        totalBadges: badges.length,
        unlockedCount: unlockedBadges.length,
        lockedCount: lockedBadges.length,
        featuredBadge: featuredBadge?.name ?? null,
        whyHidden: isLoading ? "loading" : badges.length === 0 ? "no_badges_data" : "showing",
      });
    }
  }, [bootStatus, isLoading, badges.length, unlockedBadges.length, lockedBadges.length, featuredBadge]);

  return (
    <SafeAreaView className="flex-1" edges={["bottom"]} style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: "Badges",
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={themeColor} />
        }
      >
        {/* Explanation Copy */}
        <View className="px-4 pt-4 pb-2">
          <Text className="text-base font-semibold text-center" style={{ color: colors.text }}>
            Badges reflect how you show up in the community.
          </Text>
          <Text className="text-sm mt-1 text-center" style={{ color: colors.textSecondary }}>
            Earn them by hosting, showing up, and inviting others.
          </Text>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator size="large" color={themeColor} />
          </View>
        ) : badges.length === 0 ? (
          <View className="flex-1 items-center justify-center py-20 px-6">
            {/* INVARIANT: No Trophy icons anywhere. Using Award for empty state. */}
            <Award size={48} color={colors.textTertiary} />
            <Text className="text-xl font-bold mt-4 text-center" style={{ color: colors.text }}>
              No Badges Yet
            </Text>
            <Text className="text-base mt-2 text-center leading-6" style={{ color: colors.textSecondary }}>
              Complete activities to unlock badges.
            </Text>
          </View>
        ) : (
          <View className="px-4 py-4">
            {/* Featured Badge Section */}
            {featuredBadge && (
              <View className="mb-6">
                <Text className="text-sm font-semibold mb-2" style={{ color: colors.textSecondary }}>
                  FEATURED BADGE
                </Text>
                <View
                  className="rounded-xl p-4"
                  style={{
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 mr-3">
                      <View
                        style={{
                          alignSelf: "flex-start",
                          paddingHorizontal: 12,
                          paddingVertical: 5,
                          borderRadius: 999,
                          backgroundColor: hexToRgba(featuredBadge.tierColor, 0.15),
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ color: featuredBadge.tierColor, fontWeight: "600", fontSize: 16 }}>
                          {featuredBadge.name}
                        </Text>
                      </View>
                      <Text className="text-sm" style={{ color: colors.textSecondary }}>
                        {featuredBadge.description}
                      </Text>
                    </View>
                    <Pressable
                      onPress={handleRemoveFeatured}
                      className="px-3 py-2 rounded-lg"
                      style={{ backgroundColor: colors.border }}
                    >
                      <Text className="text-xs font-semibold" style={{ color: colors.textSecondary }}>
                        Remove
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            {/* Instructional text when no featured badge */}
            {!featuredBadge && (
              <Text className="text-sm mb-4 px-1" style={{ color: colors.textSecondary, opacity: 0.6 }}>
                Choose one badge to feature on your profile.
              </Text>
            )}

            {/* Unlocked Badges */}
            {unlockedBadges.length > 0 && (
              <View className="mb-6">
                <Text className="text-sm font-semibold mb-2" style={{ color: colors.textSecondary }}>
                  UNLOCKED ({unlockedBadges.length})
                </Text>
                {unlockedBadges.map((badge, index) => (
                  <Animated.View key={badge.badgeKey} entering={FadeInDown.delay(index * 50).springify()}>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedBadge(badge);
                      }}
                      className="rounded-xl p-4 mb-2"
                      style={{
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <View className="flex-row items-center justify-between mb-2">
                        <View className="flex-1 mr-3">
                          <View className="flex-row items-center mb-2">
                            <View
                              style={{
                                alignSelf: "flex-start",
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: 999,
                                backgroundColor: hexToRgba(badge.tierColor, 0.15),
                                marginRight: 8,
                              }}
                            >
                              <Text style={{ color: badge.tierColor, fontWeight: "600", fontSize: 14 }}>
                                {badge.name}
                              </Text>
                            </View>
                            {badge.featured && (
                              <View
                                className="px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: themeColor + "20" }}
                              >
                                <Text className="text-xs font-semibold" style={{ color: themeColor }}>
                                  Featured
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text className="text-sm" style={{ color: colors.textSecondary }}>
                            {badge.description}
                          </Text>
                        </View>
                        <Star size={20} color={badge.tierColor} />
                      </View>
                      {!badge.featured && (
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            handleSetFeatured(badge.badgeKey);
                          }}
                          className="py-2 rounded-lg items-center"
                          style={{ backgroundColor: badge.tierColor + "20" }}
                        >
                          <Text className="text-sm font-semibold" style={{ color: badge.tierColor }}>
                            Set Featured
                          </Text>
                        </Pressable>
                      )}
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            )}

            {/* Locked Badges */}
            {lockedBadges.length > 0 && (
              <View>
                <Text className="text-sm font-semibold mb-2" style={{ color: colors.textSecondary }}>
                  LOCKED ({lockedBadges.length})
                </Text>
                {lockedBadges.map((badge, index) => (
                  <Animated.View key={badge.badgeKey} entering={FadeInDown.delay((unlockedBadges.length + index) * 50).springify()}>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedBadge(badge);
                      }}
                      className="rounded-xl p-4 mb-2"
                      style={{
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                        opacity: 0.6,
                      }}
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 mr-3">
                          <View
                            style={{
                              alignSelf: "flex-start",
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 999,
                              backgroundColor: hexToRgba(badge.tierColor, 0.15),
                              marginBottom: 8,
                            }}
                          >
                            <Text style={{ color: badge.tierColor, fontWeight: "600", fontSize: 14 }}>
                              {badge.name}
                            </Text>
                          </View>
                          <Text className="text-sm mb-2" style={{ color: colors.textTertiary }}>
                            {badge.description}
                          </Text>
                          {badge.unlockTarget !== null && (
                            <View className="flex-row items-center">
                              <View className="flex-1 h-2 rounded-full mr-2" style={{ backgroundColor: colors.border }}>
                                <View
                                  className="h-2 rounded-full"
                                  style={{
                                    backgroundColor: badge.tierColor,
                                    width: `${Math.min((badge.progressCurrent / badge.unlockTarget) * 100, 100)}%`,
                                  }}
                                />
                              </View>
                              <Text className="text-xs font-semibold" style={{ color: colors.textTertiary }}>
                                {badge.progressCurrent}/{badge.unlockTarget}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            )}

            {/* Badge Catalog Footer */}
            <View className="mt-6 pt-4 border-t" style={{ borderTopColor: colors.border }}>
              <Text className="text-xs text-center" style={{ color: colors.textTertiary }}>
                Showing all {badges.length} available badges
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Badge Details Modal */}
      <Modal
        visible={!!selectedBadge}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedBadge(null)}
      >
        <Pressable
          className="flex-1 justify-center items-center px-6"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setSelectedBadge(null)}
        >
          <Pressable
            className="rounded-2xl p-6 w-full max-w-sm"
            style={{ backgroundColor: colors.surface }}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between mb-4">
              {/* INVARIANT: No Trophy icons. Using Award for badge modal. */}
              <Award size={32} color={selectedBadge?.tierColor ?? themeColor} />
              <Pressable
                onPress={() => setSelectedBadge(null)}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.border }}
              >
                <X size={16} color={colors.text} />
              </Pressable>
            </View>
            <View
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: hexToRgba(selectedBadge?.tierColor ?? themeColor, 0.15),
                marginBottom: 12,
              }}
            >
              <Text style={{ color: selectedBadge?.tierColor ?? colors.text, fontWeight: "600", fontSize: 20 }}>
                {selectedBadge?.name}
              </Text>
            </View>
            <Text className="text-base leading-6" style={{ color: colors.textSecondary }}>
              {selectedBadge?.description}
            </Text>
            {selectedBadge && !selectedBadge.unlocked && selectedBadge.unlockTarget !== null && (
              <View className="mt-4">
                <Text className="text-sm font-semibold mb-2" style={{ color: colors.textSecondary }}>
                  Progress: {selectedBadge.progressCurrent}/{selectedBadge.unlockTarget}
                </Text>
                <View className="h-2 rounded-full" style={{ backgroundColor: colors.border }}>
                  <View
                    className="h-2 rounded-full"
                    style={{
                      backgroundColor: selectedBadge.tierColor,
                      width: `${Math.min((selectedBadge.progressCurrent / selectedBadge.unlockTarget) * 100, 100)}%`,
                    }}
                  />
                </View>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
