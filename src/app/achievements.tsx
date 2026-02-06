import React, { useState, useRef, useEffect } from "react";
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
import { ChevronLeft, Award, Star, Check, X, Lock } from "@/ui/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { safeToast } from "@/lib/safeToast";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { devLog } from "@/lib/devLog";
import { useIsPro } from "@/lib/entitlements";
import {
  getBadgeCatalog,
  setFeaturedBadge,
  BADGE_QUERY_KEYS,
  type BadgeCatalogResponse,
  type BadgeCatalogItem,
} from "@/lib/badgesApi";

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
  const didProRefreshRef = useRef(false);

  // [P1_PRO_BADGES_UI] When Pro status is recognized, invalidate badge catalog once
  const { isPro, isLoading: isProLoading, rcIsPro, backendIsPro, combinedIsPro } = useIsPro();

  // Get viewer userId for invalidation targeting
  const viewerUserId = session?.user?.id;

  useEffect(() => {
    if (!isProLoading && isPro && !didProRefreshRef.current) {
      didProRefreshRef.current = true;
      if (__DEV__) {
        devLog("[P1_PRO_BADGES_UI] triggered invalidate badgeCatalog due to isPro=true");
      }
      queryClient.invalidateQueries({ queryKey: BADGE_QUERY_KEYS.catalog });
    }
  }, [isPro, isProLoading, queryClient]);

  // [P0_BADGE_SOT] Use adapter for catalog fetch with canonical query key
  const { data, isLoading, refetch } = useQuery({
    queryKey: BADGE_QUERY_KEYS.catalog,
    queryFn: async () => {
      const response = await getBadgeCatalog();
      if (__DEV__) {
        devLog("[P0_BADGE_SOT] catalog loaded", {
          badgesCount: response?.badges?.length ?? 0,
          unlockedCount: response?.badges?.filter(b => b.unlocked).length ?? 0,
        });
      }
      return response;
    },
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  // [P0_BADGE_SOT] Use adapter for set featured with canonical invalidation
const setFeaturedMutation = useMutation({
  mutationFn: (badgeKey: string | null) => setFeaturedBadge(badgeKey),

  onSuccess: () => {
    // refresh badge catalog
    queryClient.invalidateQueries({
      queryKey: BADGE_QUERY_KEYS.catalog,
    });

    // refresh profile cache (safe umbrella invalidation)
    queryClient.invalidateQueries({
      queryKey: ["profile"],
    });

    // invalidate ALL featured badge queries (global safety)
    queryClient.invalidateQueries({
      queryKey: ["featuredBadge"],
    });

    // targeted invalidate for viewer profile badge
    if (viewerUserId) {
      queryClient.invalidateQueries({
        queryKey: BADGE_QUERY_KEYS.featured(viewerUserId),
      });
    }

    if (__DEV__) {
      devLog(
        `[P0_BADGE_SOT] setFeatured success invalidated=[catalog,profile,featured(global),featured(viewer)]`
      );
    }

    Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success
    );

    safeToast.success("Featured badge updated");
  },

  onError: (error: unknown) => {
    Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Error
    );

    const errorData =
      error && typeof error === "object" && "data" in error
        ? (error as { data?: { error?: string } }).data
        : null;

    const message =
      errorData?.error?.toLowerCase().includes("not unlocked")
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

  // Pro trio badges unlock via subscription, not progress - hide progress UI
  const isProTrioBadgeKey = (key: string): boolean => {
    return key === "pro_includer" || key === "pro_organizer" || key === "pro_initiator";
  };

  // P0 FIX: Compute effective unlock status (Pro trio unlocked when isPro)
  const isEffectivelyUnlocked = (badge: BadgeCatalogItem): boolean => {
    // If API says unlocked, trust it
    if (badge.unlocked) return true;
    // Pro trio badges are unlocked for Pro users even if API hasn't caught up
    if (isProTrioBadgeKey(badge.badgeKey) && isPro && !isProLoading) return true;
    return false;
  };

  const badges = data?.badges ?? [];
  // P0 FIX: Use effective unlock check instead of raw API value
  const unlockedBadges = badges.filter((b) => isEffectivelyUnlocked(b));
  // Hide Founder badge from locked section (not earnable by regular users)
  const lockedBadges = badges.filter((b) => !isEffectivelyUnlocked(b) && b.badgeKey !== "founder");
  const featuredBadge = badges.find((b) => b.featured);

  // [P0_BADGE_PRO] DEV proof logs for Pro badge selection debug
  if (__DEV__) {
    // [P0_PRO_TRIO_UNLOCK] Log source values for Pro status debugging
    devLog('[P0_PRO_TRIO_UNLOCK] PRO_SOURCE_VALUES', {
      rcIsPro,
      backendIsPro,
      combinedIsPro,
      isPro,
      isProLoading,
    });
    
    badges.filter(b => isProTrioBadgeKey(b.badgeKey)).forEach(badge => {
      devLog('[P0_BADGE_PRO]', {
        badgeKey: badge.badgeKey,
        apiUnlocked: badge.unlocked,
        isPro,
        isProLoading,
        isEffectivelyUnlocked: isEffectivelyUnlocked(badge),
        selectionEnabled: isEffectivelyUnlocked(badge),
        reason: badge.unlocked ? 'api_unlocked' : (isPro && !isProLoading ? 'pro_override' : 'locked'),
      });
    });
  }

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
      // [P1_PRO_BADGES_UI] Log Pro status summary
      devLog("[P1_PRO_BADGES_UI] render summary", {
        isPro,
        isProLoading,
        unlockedCount: unlockedBadges.length,
        lockedCount: lockedBadges.length,
      });
    }
  }, [bootStatus, isLoading, badges.length, unlockedBadges.length, lockedBadges.length, featuredBadge, isPro, isProLoading]);

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
                        overflow: "hidden",
                      }}
                    >
                      {/* Locked overlay */}
                      <View
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: colors.border,
                          opacity: 0.18,
                          borderRadius: 16,
                        }}
                      />
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 mr-3">
                          <View
                            style={{
                              alignSelf: "flex-start",
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 999,
                              backgroundColor: hexToRgba(badge.tierColor, 0.10),
                              marginBottom: 8,
                            }}
                          >
                            <Text style={{ color: colors.textSecondary, fontWeight: "600", fontSize: 14 }}>
                              {badge.name}
                            </Text>
                          </View>
                          <Text className="text-sm mb-2" style={{ color: colors.textTertiary }}>
                            {badge.description}
                          </Text>
                          {badge.unlockTarget !== null && !isProTrioBadgeKey(badge.badgeKey) && (
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
                        <Lock size={18} color={colors.textTertiary} />
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
            {/* P0 FIX: Pro badge copy - show for Pro trio when not effectively unlocked */}
            {selectedBadge && isProTrioBadgeKey(selectedBadge.badgeKey) && !isEffectivelyUnlocked(selectedBadge) && (
              <View className="mt-4 p-3 rounded-lg" style={{ backgroundColor: themeColor + "15" }}>
                <Text className="text-sm font-medium" style={{ color: themeColor }}>
                  Unlock this badge as a Pro subscriber
                </Text>
              </View>
            )}
            {/* Progress bar for non-Pro progress-based badges */}
            {selectedBadge && !isEffectivelyUnlocked(selectedBadge) && selectedBadge.unlockTarget !== null && !isProTrioBadgeKey(selectedBadge.badgeKey) && (
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
            {/* P0 FIX: Set Featured button in modal for effectively unlocked badges */}
            {selectedBadge && isEffectivelyUnlocked(selectedBadge) && !selectedBadge.featured && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  handleSetFeatured(selectedBadge.badgeKey);
                  setSelectedBadge(null);
                }}
                className="mt-4 py-3 rounded-lg items-center"
                style={{ backgroundColor: selectedBadge.tierColor + "20" }}
              >
                <Text className="text-sm font-semibold" style={{ color: selectedBadge.tierColor }}>
                  Set Featured
                </Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
