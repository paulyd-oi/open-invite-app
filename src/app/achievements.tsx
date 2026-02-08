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
import { BadgePill } from "@/components/BadgePill";
import { getBadgePillVariant } from "@/lib/badges";
import {
  getBadgeCatalog,
  setFeaturedBadge,
  BADGE_QUERY_KEYS,
  isProTrioBadgeKey,
  deriveBadgesWithProOverride,
  type BadgeCatalogResponse,
  type BadgeCatalogItem,
} from "@/lib/badgesApi";
import type { GetProfileResponse } from "../../shared/contracts";

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
    if (isPro && !didProRefreshRef.current) {
      didProRefreshRef.current = true;
      if (__DEV__) {
        devLog("[P0_PRO_TRIO_UI] triggered invalidate badgeCatalog due to isPro=true (isProLoading=" + isProLoading + ")");
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

  onSuccess: (_data, badgeKey) => {
    // [P0_FEATURED_BADGE_UI] Optimistic cache write: push featuredBadge into the
    // ["profile"] cache so Profile screen renders immediately — no refetch needed.
    const catalogData = queryClient.getQueryData<BadgeCatalogResponse>(BADGE_QUERY_KEYS.catalog);
    queryClient.setQueryData<GetProfileResponse>(["profile"], (old) => {
      if (!old) return old;
      if (!badgeKey) {
        return { ...old, featuredBadge: null };
      }
      const badge = catalogData?.badges?.find((b) => b.badgeKey === badgeKey);
      if (badge) {
        return {
          ...old,
          featuredBadge: {
            badgeKey: badge.badgeKey,
            name: badge.name,
            description: badge.description,
            tierColor: badge.tierColor,
          },
        };
      }
      return old;
    });

    if (__DEV__) {
      const badge = catalogData?.badges?.find((b) => b.badgeKey === badgeKey);
      devLog("[P0_FEATURED_BADGE_UI] optimistic cache write", {
        badgeKey: badgeKey ?? "null",
        found: !!badge,
        name: badge?.name ?? "n/a",
        tierColor: badge?.tierColor ?? "n/a",
      });
    }

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

  onError: (error: unknown, variables: string | null) => {
    Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Error
    );

    const errorData =
      error && typeof error === "object" && "data" in error
        ? (error as { data?: { error?: string } }).data
        : null;

    const isNotUnlockedError = errorData?.error?.toLowerCase().includes("not unlocked") ?? false;
    // [P0_BADGE_UNLOCK_PATH] Pro trio SSOT: if derived-unlocked but backend rejects,
    // suppress misleading "not unlocked" and show sync message instead.
    const badgeKey = variables ?? "";
    const isProTrioOverride = isNotUnlockedError && isPro && isProTrioBadgeKey(badgeKey);

    if (__DEV__) {
      devLog("[P0_BADGE_UNLOCK_PATH] setFeatured onError", {
        badgeKey,
        isNotUnlockedError,
        isPro,
        isProTrioOverride,
        backendError: errorData?.error ?? "unknown",
      });
    }

    if (isProTrioOverride) {
      // Backend hasn't synced Pro entitlement yet — retry after catalog refresh
      queryClient.invalidateQueries({ queryKey: BADGE_QUERY_KEYS.catalog });
      safeToast.error("Syncing badge status — please try again");
    } else {
      const message = isNotUnlockedError
        ? "Badge not unlocked yet"
        : "Failed to update featured badge";
      safeToast.error(message);
    }
  },
});

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleSetFeatured = (badgeKey: string) => {
    if (setFeaturedMutation.isPending) {
      if (__DEV__) devLog('[P1_DOUBLE_SUBMIT_GUARD]', 'featuredToggle ignored (set), badgeKey=' + badgeKey);
      return;
    }
    setFeaturedMutation.mutate(badgeKey);
  };

  const handleRemoveFeatured = () => {
    if (setFeaturedMutation.isPending) {
      if (__DEV__) devLog('[P1_DOUBLE_SUBMIT_GUARD]', 'featuredToggle ignored (remove)');
      return;
    }
    setFeaturedMutation.mutate(null);
  };

  // [P0_BADGE_SOT] Pro trio badge helpers imported from badgesApi (shared SSOT).
  // Local isProTrioBadgeKey/isEffectivelyUnlocked REMOVED — use deriveBadgesWithProOverride instead.

  const rawBadges = data?.badges ?? [];

  // [P0_BADGE_SOT] Deterministic derivation: patch Pro trio unlock at the DATA level.
  // When isPro is true (from any settled source), Pro trio badges are guaranteed unlocked.
  // NOTE: No isProLoading guard here — isPro is already false when both sources are loading,
  // and gating on isProLoading caused a race where backend-confirmed Pro was ignored while
  // RevenueCat was still initializing.
  const badges = isPro
    ? deriveBadgesWithProOverride(rawBadges, true)
    : rawBadges;

  // [P0_PRO_TRIO_UI] Canonical trace: isPro source + per-badge unlock state
  if (__DEV__) {
    devLog("[P0_PRO_TRIO_UI] badge derivation", {
      isPro,
      isProLoading,
      rcIsPro,
      backendIsPro,
      combinedIsPro,
      rawCount: rawBadges.length,
      derivedUnlocked: badges.filter((b) => b.unlocked).length,
    });
    // Per-badge trace for the three Pro trio keys
    for (const key of ["pro_includer", "pro_initiator", "pro_organizer"] as const) {
      const raw = rawBadges.find((b) => b.badgeKey === key);
      const derived = badges.find((b) => b.badgeKey === key);
      devLog("[P0_PRO_TRIO_UI]", {
        badgeKey: key,
        rawUnlocked: raw?.unlocked ?? "NOT_IN_CATALOG",
        derivedUnlocked: derived?.unlocked ?? "NOT_IN_CATALOG",
        isPro,
        source: isPro ? (raw?.unlocked ? "api" : "pro_override") : "api_only",
      });
    }
  }

  const unlockedBadges = badges.filter((b) => b.unlocked);
  // Hide Founder badge from locked section (not earnable by regular users)
  const lockedBadges = badges.filter((b) => !b.unlocked && b.badgeKey !== "founder");
  const featuredBadge = badges.find((b) => b.featured);

  // [P0_BADGE_SOT_INVARIANT] Determinism assertion: when Pro is settled,
  // every Pro trio badge in the catalog MUST be unlocked. Fire a warning if not.
  if (__DEV__ && !isProLoading && isPro) {
    const violatingBadges = badges.filter(
      (b) => isProTrioBadgeKey(b.badgeKey) && !b.unlocked,
    );
    if (violatingBadges.length > 0) {
      devLog("[P0_BADGE_SOT_INVARIANT] VIOLATION — Pro trio badge(s) still locked after derivation!", {
        violating: violatingBadges.map((b) => b.badgeKey),
        isPro,
        isProLoading,
        rcIsPro,
        backendIsPro,
        combinedIsPro,
      });
    }
  }

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
        derivedUnlocked: badge.unlocked,
        isPro,
        isProLoading,
        reason: badge.unlocked ? (isPro ? 'pro_derived' : 'api_unlocked') : 'locked',
      });
    });
  }

  // DEV logging for render decision
  React.useEffect(() => {
    if (__DEV__) {
      // [P1_BADGE_CONTRACT] Log badges derived state
      const hasOGBadge = badges.some(b => b.badgeKey === 'og');
      const hasProBadge = badges.some(b => isProTrioBadgeKey(b.badgeKey));
      devLog("[P1_BADGE_CONTRACT]", "badges derived", {
        count: badges.length,
        hasOG: hasOGBadge,
        hasProBadge,
        isPro,
        unlockedCount: unlockedBadges.length,
        lockedCount: lockedBadges.length,
      });
      
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

  // [P0_BADGES_SCREEN] Canonical screen render trace
  if (__DEV__) {
    devLog("[P0_BADGE_APPEARANCE] screen", {
      screenTitle: "Badges",
      ogPillTokens: { bg: "#B8963E", text: "#1A1A1A", border: "#8C6D2A" },
      badgePillSSOT: true,
    });
  }

  return (
    <SafeAreaView testID="achievements-screen" className="flex-1" edges={["bottom"]} style={{ backgroundColor: colors.background }}>
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
        testID="achievements-list"
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
                      <View style={{ alignSelf: "flex-start", marginBottom: 8 }}>
                        <BadgePill
                          name={featuredBadge.name}
                          tierColor={featuredBadge.tierColor}
                          size="medium"
                          variant={getBadgePillVariant(featuredBadge.name)}
                        />
                      </View>
                      <Text className="text-sm" style={{ color: colors.textSecondary }}>
                        {featuredBadge.description}
                      </Text>
                    </View>
                    <Pressable
                      testID="achievements-featured-toggle"
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
                        if (__DEV__) {
                          devLog("[P0_BADGE_UNLOCK_PATH] badge tap", {
                            badgeKey: badge.badgeKey,
                            derivedUnlocked: badge.unlocked,
                            isPro,
                            backendIsPro,
                            rcIsPro,
                            combinedIsPro,
                            source: "unlocked_list",
                          });
                        }
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
                            <View style={{ marginRight: 8 }}>
                              <BadgePill
                                name={badge.name}
                                tierColor={badge.tierColor}
                                size="small"
                                variant={getBadgePillVariant(badge.name)}
                              />
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
                        if (__DEV__) {
                          devLog("[P0_BADGE_UNLOCK_PATH] badge tap", {
                            badgeKey: badge.badgeKey,
                            derivedUnlocked: badge.unlocked,
                            isPro,
                            backendIsPro,
                            rcIsPro,
                            combinedIsPro,
                            source: "locked_list",
                          });
                        }
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
            <View style={{ alignSelf: "flex-start", marginBottom: 12 }}>
              <BadgePill
                name={selectedBadge?.name ?? ""}
                tierColor={selectedBadge?.tierColor ?? themeColor}
                size="medium"
                variant={getBadgePillVariant(selectedBadge?.name)}
              />
            </View>
            <Text className="text-base leading-6" style={{ color: colors.textSecondary }}>
              {selectedBadge?.description}
            </Text>
            {/* [P0_BADGE_SOT] Pro badge copy - show for Pro trio when not unlocked (derived) */}
            {selectedBadge && isProTrioBadgeKey(selectedBadge.badgeKey) && !selectedBadge.unlocked && (
              <View className="mt-4 p-3 rounded-lg" style={{ backgroundColor: themeColor + "15" }}>
                <Text className="text-sm font-medium" style={{ color: themeColor }}>
                  Unlock this badge as a Pro subscriber
                </Text>
              </View>
            )}
            {/* Progress bar for non-Pro progress-based badges */}
            {selectedBadge && !selectedBadge.unlocked && selectedBadge.unlockTarget !== null && !isProTrioBadgeKey(selectedBadge.badgeKey) && (
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
            {/* [P0_BADGE_SOT] Set Featured button for derived-unlocked badges */}
            {selectedBadge && selectedBadge.unlocked && !selectedBadge.featured && (
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
