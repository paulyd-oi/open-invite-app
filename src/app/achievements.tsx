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
import { ChevronLeft, Trophy, Star, Check, X } from "@/ui/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { safeToast } from "@/lib/safeToast";

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

export default function BadgesScreen() {
  const router = useRouter();
  const { colors, themeColor } = useTheme();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<BadgeCatalogItem | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["badgesCatalog"],
    queryFn: () => api.get<BadgeCatalogResponse>("/api/badges/catalog"),
    enabled: !!session,
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
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      safeToast.error("Failed to update featured badge");
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
  const lockedBadges = badges.filter((b) => !b.unlocked);
  const featuredBadge = badges.find((b) => b.featured);

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
        {isLoading ? (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator size="large" color={themeColor} />
          </View>
        ) : badges.length === 0 ? (
          <View className="flex-1 items-center justify-center py-20 px-6">
            <Trophy size={48} color={colors.textTertiary} />
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
                      <Text className="text-lg font-bold mb-1" style={{ color: featuredBadge.tierColor }}>
                        {featuredBadge.name}
                      </Text>
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
                          <View className="flex-row items-center mb-1">
                            <Text className="text-base font-bold mr-2" style={{ color: badge.tierColor }}>
                              {badge.name}
                            </Text>
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
                          <Text className="text-base font-bold mb-1" style={{ color: colors.textSecondary }}>
                            {badge.name}
                          </Text>
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
              <Trophy size={32} color={selectedBadge?.tierColor ?? themeColor} />
              <Pressable
                onPress={() => setSelectedBadge(null)}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.border }}
              >
                <X size={16} color={colors.text} />
              </Pressable>
            </View>
            <Text className="text-2xl font-bold mb-2" style={{ color: selectedBadge?.tierColor ?? colors.text }}>
              {selectedBadge?.name}
            </Text>
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
