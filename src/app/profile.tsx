import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  Modal,
  RefreshControl,
} from "react-native";
import { toast } from "@/components/Toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Settings,
  LogOut,
  Users,
  Plus,
  Trash2,
  UserPlus,
  X,
  Check,
  Calendar,
  Flame,
  Trophy,
  Star,
  Heart,
  ChevronRight,
} from "@/ui/icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import BottomNavigation from "@/components/BottomNavigation";
import { StreakCounter } from "@/components/StreakCounter";
import { MonthlyRecap, MonthlyRecapButton, type MonthlyRecapData } from "@/components/MonthlyRecap";
import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { useTheme } from "@/lib/ThemeContext";
import { resolveImageUrl } from "@/lib/imageUrl";
import {
  type GetGroupsResponse,
  type GetFriendsResponse,
  type GetProfileResponse,
  type GetProfilesResponse,
  type FriendGroup,
  type Friendship,
  type GetEventsResponse,
  type GetProfileStatsResponse,
  type GetAchievementsResponse,
  EVENT_CATEGORIES,
  TIER_COLORS,
} from "../../shared/contracts";

const GROUP_COLORS = [
  "#FF6B4A", "#4ECDC4", "#45B7D1", "#96CEB4", "#E6A700",
  "#DDA0DD", "#98D8C8", "#D4A017", "#BB8FCE", "#85C1E9",
];

export default function ProfileScreen() {
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState(GROUP_COLORS[0]);
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<FriendGroup | null>(null);
  const [showMonthlyRecap, setShowMonthlyRecap] = useState(false);

  // Edit group modal state
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<FriendGroup | null>(null);
  const [editGroupColor, setEditGroupColor] = useState("#FF6B4A");
  const [refreshing, setRefreshing] = useState(false);

  // Confirm modal states
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showDeleteGroupConfirm, setShowDeleteGroupConfirm] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<FriendGroup | null>(null);

  // Fetch profiles to check if user is in business mode
  const { data: profilesData, refetch: refetchProfiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api.get<GetProfilesResponse>("/api/profiles"),
    enabled: !!session,
  });

  const activeProfile = profilesData?.activeProfile;

  const { data: groupsData, refetch: refetchGroups } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.get<GetGroupsResponse>("/api/groups"),
    enabled: !!session,
  });

  const { data: profileData, refetch: refetchProfile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get<GetProfileResponse>("/api/profile"),
    enabled: !!session,
  });

  const { data: friendsData, refetch: refetchFriends } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: !!session,
  });

  const { data: eventsData, refetch: refetchEvents } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.get<GetEventsResponse>("/api/events"),
    enabled: !!session,
  });

  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ["profileStats"],
    queryFn: () => api.get<GetProfileStatsResponse>("/api/profile/stats"),
    enabled: !!session,
  });

  const { data: achievementsData, refetch: refetchAchievements } = useQuery({
    queryKey: ["achievements"],
    queryFn: () => api.get<GetAchievementsResponse>("/api/achievements"),
    enabled: !!session,
  });

  // Pull to refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Promise.all([
        refetchProfiles(),
        refetchGroups(),
        refetchProfile(),
        refetchFriends(),
        refetchEvents(),
        refetchStats(),
        refetchAchievements(),
        // Also invalidate session to get updated user image
        queryClient.invalidateQueries({ queryKey: ["session"] }),
      ]);
    } catch (error) {
      console.error("Error refreshing profile:", error);
    } finally {
      setRefreshing(false);
    }
  }, [refetchProfiles, refetchGroups, refetchProfile, refetchFriends, refetchEvents, refetchStats, refetchAchievements, queryClient]);

  const createGroupMutation = useMutation({
    mutationFn: (data: { name: string; color: string }) =>
      api.post("/api/groups", data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewGroupName("");
      setShowCreateGroup(false);
      refetchGroups();
    },
    onError: () => {
      toast.error("Error", "Failed to create group");
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => api.delete(`/api/groups/${groupId}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetchGroups();
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ groupId, friendshipId }: { groupId: string; friendshipId: string }) =>
      api.post(`/api/groups/${groupId}/members`, { friendshipId }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetchGroups();
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: () => {
      toast.error("Error", "Failed to add friend to group");
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ groupId, friendshipId }: { groupId: string; friendshipId: string }) =>
      api.delete(`/api/groups/${groupId}/members/${friendshipId}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetchGroups();
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
  });

  // Update group mutation (for changing color)
  const updateGroupMutation = useMutation({
    mutationFn: ({ groupId, color }: { groupId: string; color: string }) =>
      api.put<{ group: FriendGroup }>(`/api/groups/${groupId}`, { color }),
    onSuccess: () => {
      refetchGroups();
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setShowEditGroupModal(false);
      setEditingGroup(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleLogout = () => {
    setShowSignOutConfirm(true);
  };

  const confirmSignOut = () => {
    setShowSignOutConfirm(false);
    authClient.signOut();
    queryClient.clear();
  };

  const handleDeleteGroup = (group: FriendGroup) => {
    setGroupToDelete(group);
    setShowDeleteGroupConfirm(true);
  };

  const confirmDeleteGroup = () => {
    if (groupToDelete) {
      deleteGroupMutation.mutate(groupToDelete.id);
    }
    setShowDeleteGroupConfirm(false);
    setGroupToDelete(null);
  };

  const handleOpenAddMembers = (group: FriendGroup) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedGroup(group);
    setShowAddMembersModal(true);
  };

  const isFriendInGroup = (friendshipId: string, group: FriendGroup | null) => {
    if (!group) return false;
    return group.memberships?.some(m => m.friendshipId === friendshipId) ?? false;
  };

  const handleToggleFriendInGroup = (friendship: Friendship) => {
    if (!selectedGroup) return;

    const isInGroup = isFriendInGroup(friendship.id, selectedGroup);

    if (isInGroup) {
      removeMemberMutation.mutate({
        groupId: selectedGroup.id,
        friendshipId: friendship.id,
      });
      setSelectedGroup(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          memberships: prev.memberships?.filter(m => m.friendshipId !== friendship.id),
        };
      });
    } else {
      addMemberMutation.mutate({
        groupId: selectedGroup.id,
        friendshipId: friendship.id,
      });
      setSelectedGroup(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          memberships: [...(prev.memberships ?? []), { friendshipId: friendship.id }],
        };
      });
    }
  };

  const groups = groupsData?.groups ?? [];
  const friends = (friendsData?.friends ?? []).filter(f => f.friend != null);
  const eventsCount = eventsData?.events?.length ?? 0;
  const friendsCount = friends.length;
  const calendarBio = profileData?.profile?.calendarBio;

  // Stats data
  const stats = statsData?.stats;
  const topFriends = statsData?.topFriends ?? [];

  // Get achievements from the new achievements endpoint
  const achievements = achievementsData?.achievements ?? [];
  const unlockedAchievements = achievements.filter(a => a.unlocked);
  const lockedAchievements = achievements.filter(a => !a.unlocked);
  const selectedBadgeId = achievementsData?.selectedBadgeId ?? null;
  const selectedBadge = selectedBadgeId ? achievements.find(a => a.id === selectedBadgeId) : null;

  // Build monthly recap data
  const now = new Date();

  // Check if we should show the monthly recap (last 2 days of month or first 2 days of next month)
  const currentDay = now.getDate();
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const isEndOfMonth = currentDay >= lastDayOfMonth - 1; // Last 2 days
  const isStartOfMonth = currentDay <= 2; // First 2 days
  const shouldShowMonthlyRecap = isEndOfMonth || isStartOfMonth;

  // For the recap, use previous month if we're at the start of a new month
  const recapMonth = isStartOfMonth
    ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
    : now;

  const monthlyRecapData: MonthlyRecapData | null = stats && shouldShowMonthlyRecap ? {
    month: recapMonth.toLocaleString("en-US", { month: "long" }),
    year: recapMonth.getFullYear(),
    totalEvents: stats.hostedCount + stats.attendedCount,
    totalHangouts: stats.attendedCount,
    uniqueFriendsMetWith: topFriends.length,
    topCategory: stats.categoryBreakdown && Object.keys(stats.categoryBreakdown).length > 0
      ? (() => {
          const sorted = Object.entries(stats.categoryBreakdown).sort((a, b) => b[1] - a[1]);
          const [category, count] = sorted[0];
          const catInfo = EVENT_CATEGORIES.find(c => c.value === category);
          return { name: catInfo?.label ?? category, emoji: catInfo?.emoji ?? "📅", count };
        })()
      : null,
    topFriend: topFriends[0]
      ? { name: topFriends[0].name ?? "Friend", image: topFriends[0].image, count: topFriends[0].eventsCount }
      : null,
    topLocation: null,
    busiestDay: null,
    averagePerWeek: Math.round((stats.attendedCount + stats.hostedCount) / 4),
    streak: stats.currentStreak,
    rank: stats.currentStreak >= 8 ? "social_butterfly"
        : stats.currentStreak >= 4 ? "connector"
        : stats.currentStreak >= 2 ? "rising_star"
        : "getting_started",
  } : null;

  // Get category info
  const getCategoryInfo = (category: string) => {
    return EVENT_CATEGORIES.find(c => c.value === category) ?? { emoji: "📅", label: "Other", color: "#78909C" };
  };

  if (!session) {
    return (
      <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-24 h-24 rounded-full items-center justify-center mb-6" style={{ backgroundColor: isDark ? "#2C2C2E" : "#FFEDD5" }}>
            <Text className="text-5xl">👤</Text>
          </View>
          <Text className="text-2xl font-bold text-center mb-2" style={{ color: colors.text }}>
            Your Profile
          </Text>
          <Text className="text-center mb-8" style={{ color: colors.textSecondary }}>
            Sign in to manage your profile and friend groups
          </Text>
          <Pressable
            onPress={() => router.push("/login")}
            className="px-8 py-4 rounded-full"
            style={{ backgroundColor: themeColor }}
          >
            <Text className="text-white font-semibold text-lg">Sign In</Text>
          </Pressable>
        </View>
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  // Derive user safely - user may be null/undefined in some auth states
  const user = session?.user ?? null;

  // Get display name with proper fallback chain (all null-safe)
  const displayName = user?.name?.trim()
    || (profileData?.profile?.handle ? `@${profileData.profile.handle}` : null)
    || ((user as any)?.email ? (user as any).email.split('@')[0] : null)
    || "Account";

  // Business mode is hidden for now - will be re-enabled in a future update
  // if (isBusinessMode && activeProfile) { ... }

  return (
    <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: colors.background }}>
      <View className="px-5 pt-2 pb-4 flex-row items-center justify-between">
        <Text className="text-3xl font-sora-bold" style={{ color: colors.text }}>Profile</Text>
        <View className="flex-row items-center">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/settings");
            }}
            className="w-10 h-10 rounded-full items-center justify-center mr-2"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
          >
            <Settings size={20} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={handleLogout}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
          >
            <LogOut size={20} color="#EF4444" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={themeColor}
            colors={[themeColor]}
          />
        }
      >
        {/* Profile Card */}
        <Animated.View entering={FadeInDown.delay(0).springify()}>
          <View className="rounded-2xl p-5 border mb-4" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <View className="flex-row items-center">
              <View className="relative">
                <View className="w-16 h-16 rounded-full bg-gray-200 overflow-hidden">
                  {resolveImageUrl((user as any)?.image) ? (
                    <Image source={{ uri: resolveImageUrl((user as any)?.image)! }} className="w-full h-full" />
                  ) : (
                    <View className="w-full h-full items-center justify-center" style={{ backgroundColor: isDark ? "#2C2C2E" : "#FFEDD5" }}>
                      <Text className="text-2xl font-bold" style={{ color: themeColor }}>
                        {user?.name?.[0] ?? (user as any)?.email?.[0]?.toUpperCase() ?? "?"}
                      </Text>
                    </View>
                  )}
                </View>
                {/* Selected Badge */}
                {selectedBadge && (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push("/achievements");
                    }}
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: selectedBadge.tierColor,
                      borderWidth: 2,
                      borderColor: colors.surface,
                    }}
                  >
                    <Text className="text-sm">{selectedBadge.emoji}</Text>
                  </Pressable>
                )}
              </View>
              <View className="flex-1 ml-4">
                <View className="flex-row items-center">
                  <Text className="text-xl font-sora-bold" style={{ color: colors.text }}>
                    {displayName}
                  </Text>
                </View>
                <View className="flex-row items-center mt-1">
                  <Calendar size={14} color={colors.textSecondary} />
                  <Text className="ml-1.5 text-sm" style={{ color: colors.textSecondary }}>
                    My calendar looks like...
                  </Text>
                </View>
                {calendarBio ? (
                  <Text className="text-sm mt-1" style={{ color: colors.text }} numberOfLines={2}>
                    {calendarBio}
                  </Text>
                ) : (
                  <Text className="text-sm mt-1 italic" style={{ color: colors.textTertiary }}>
                    Not set yet
                  </Text>
                )}
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Monthly Recap Button (Spotify Wrapped style) */}
        {monthlyRecapData && monthlyRecapData.totalEvents > 0 && (
          <Animated.View entering={FadeInDown.delay(25).springify()}>
            <MonthlyRecapButton
              data={monthlyRecapData}
              onPress={() => setShowMonthlyRecap(true)}
            />
          </Animated.View>
        )}

        {/* Stats Overview */}
        <Animated.View entering={FadeInDown.delay(50).springify()} className="mb-4">
          <View className="flex-row">
            {/* Hosted Events */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/calendar");
              }}
              className="flex-1 rounded-xl p-4 mr-2 border"
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-3xl font-bold" style={{ color: themeColor }}>
                  {stats?.hostedCount ?? 0}
                </Text>
                <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: themeColor + "20" }}>
                  <Star size={16} color={themeColor} />
                </View>
              </View>
              <Text className="text-sm font-medium" style={{ color: colors.text }}>Hosted</Text>
              <Text className="text-xs" style={{ color: colors.textTertiary }}>events</Text>
            </Pressable>

            {/* Attended Events */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              className="flex-1 rounded-xl p-4 border"
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-3xl font-bold" style={{ color: "#4ECDC4" }}>
                  {stats?.attendedCount ?? 0}
                </Text>
                <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: "#4ECDC420" }}>
                  <Heart size={16} color="#4ECDC4" />
                </View>
              </View>
              <Text className="text-sm font-medium" style={{ color: colors.text }}>Attended</Text>
              <Text className="text-xs" style={{ color: colors.textTertiary }}>events</Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* Streak Counter - Full Width */}
        {(stats?.currentStreak ?? 0) > 0 && (
          <Animated.View entering={FadeInDown.delay(75).springify()} className="mb-4">
            <StreakCounter
              currentStreak={stats?.currentStreak ?? 0}
              longestStreak={stats?.currentStreak ?? 0}
              totalHangouts={stats?.attendedCount ?? 0}
            />
          </Animated.View>
        )}

        {/* Event Types Breakdown */}
        {stats?.categoryBreakdown && Object.keys(stats.categoryBreakdown).length > 0 && (
          <Animated.View entering={FadeInDown.delay(100).springify()} className="mb-4">
            <Text className="text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              Types of Events Hosted
            </Text>
            <View className="rounded-xl p-4 border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              <View className="flex-row flex-wrap">
                {Object.entries(stats.categoryBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([category, count]) => {
                    const catInfo = getCategoryInfo(category);
                    return (
                      <View
                        key={category}
                        className="flex-row items-center mr-4 mb-2 px-3 py-1.5 rounded-full"
                        style={{ backgroundColor: catInfo.color + "20" }}
                      >
                        <Text className="text-base mr-1">{catInfo.emoji}</Text>
                        <Text className="text-sm font-medium" style={{ color: catInfo.color }}>
                          {count}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            </View>
          </Animated.View>
        )}

        {/* Top 3 Friends */}
        {topFriends.length > 0 && (
          <Animated.View entering={FadeInDown.delay(150).springify()} className="mb-4">
            <View className="flex-row items-center mb-2">
              <Heart size={16} color="#FF6B6B" />
              <Text className="text-sm font-medium ml-2" style={{ color: colors.textSecondary }}>
                Top Friends
              </Text>
            </View>
            <View className="rounded-xl p-4 border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              {topFriends.map((friend, index) => (
                <View
                  key={friend.id}
                  className={`flex-row items-center ${index < topFriends.length - 1 ? "mb-3 pb-3 border-b" : ""}`}
                  style={{ borderBottomColor: colors.border }}
                >
                  <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: index === 0 ? "#FFD70030" : index === 1 ? "#C0C0C030" : "#CD7F3230" }}>
                    <Text className="text-lg">{index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}</Text>
                  </View>
                  <View className="w-10 h-10 rounded-full mr-3 overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
                    {friend.image ? (
                      <Image source={{ uri: friend.image }} className="w-full h-full" />
                    ) : (
                      <View className="w-full h-full items-center justify-center" style={{ backgroundColor: themeColor + "20" }}>
                        <Text style={{ color: themeColor }} className="text-sm font-medium">
                          {friend.name?.[0] ?? "?"}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold" style={{ color: colors.text }}>
                      {friend.name ?? "Unknown"}
                    </Text>
                    <Text className="text-xs" style={{ color: colors.textTertiary }}>
                      {friend.eventsCount} events together
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        {/* Achievements */}
        <Animated.View entering={FadeInDown.delay(200).springify()} className="mb-4">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/achievements");
            }}
          >
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center">
                <Trophy size={16} color="#FFD700" />
                <Text className="text-sm font-medium ml-2" style={{ color: colors.textSecondary }}>
                  Achievements
                </Text>
                <View className="ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FFD70020" }}>
                  <Text className="text-xs font-medium" style={{ color: "#FFD700" }}>
                    {unlockedAchievements.length}/{achievements.length}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center">
                <Text className="text-sm mr-1" style={{ color: themeColor }}>View All</Text>
                <ChevronRight size={16} color={themeColor} />
              </View>
            </View>
            <View className="rounded-xl p-4 border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              {achievements.length === 0 ? (
                <Text className="text-center py-4" style={{ color: colors.textTertiary }}>
                  Start hosting events to unlock achievements!
                </Text>
              ) : (
                <View>
                  {/* Top row: first 4-5 achievements */}
                  <View className="flex-row flex-wrap">
                    {achievements.slice(0, 5).map((achievement) => (
                      <View
                        key={achievement.id}
                        className="items-center mb-2 mr-3"
                        style={{ opacity: achievement.unlocked ? 1 : 0.4 }}
                      >
                        <View
                          className="w-11 h-11 rounded-full items-center justify-center"
                          style={{
                            backgroundColor: achievement.unlocked ? achievement.tierColor + "30" : colors.surface,
                            borderWidth: achievement.unlocked ? 2 : 1,
                            borderColor: achievement.unlocked ? achievement.tierColor : colors.border,
                          }}
                        >
                          <Text className="text-lg">{achievement.emoji}</Text>
                        </View>
                      </View>
                    ))}
                    {achievements.length > 5 && (
                      <View className="w-11 h-11 rounded-full items-center justify-center" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                        <Text className="text-xs font-medium" style={{ color: colors.textTertiary }}>
                          +{achievements.length - 5}
                        </Text>
                      </View>
                    )}
                  </View>
                  {/* Tip */}
                  <View className="mt-3 pt-3 border-t flex-row items-center" style={{ borderTopColor: colors.border }}>
                    <Text className="text-xs" style={{ color: colors.textTertiary }}>
                      Tap to select a badge for your profile
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </Pressable>
        </Animated.View>

        {/* Quick Stats Row */}
        <Animated.View entering={FadeInDown.delay(250).springify()} className="mb-4">
          <View className="flex-row">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/friends");
              }}
              className="flex-1 rounded-xl p-4 mr-2 border items-center"
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            >
              <View className="flex-row items-center">
                <Users size={18} color="#4ECDC4" />
                <Text className="text-2xl font-bold ml-2 text-teal-500">{friendsCount}</Text>
              </View>
              <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>Friends</Text>
            </Pressable>
            <View
              className="flex-1 rounded-xl p-4 border items-center"
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            >
              <View className="flex-row items-center">
                <Users size={18} color={themeColor} />
                <Text className="text-2xl font-bold ml-2" style={{ color: themeColor }}>{groups.length}</Text>
              </View>
              <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>Groups</Text>
            </View>
          </View>
        </Animated.View>

        {/* Friend Groups */}
        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center">
              <Users size={18} color="#4ECDC4" />
              <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
                Friend Groups
              </Text>
            </View>
            <Pressable
              onPress={() => setShowCreateGroup(!showCreateGroup)}
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: themeColor }}
            >
              <Plus size={18} color="#fff" />
            </Pressable>
          </View>

          {/* Create Group Form */}
          {showCreateGroup && (
            <View className="rounded-xl p-4 border mb-3" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              <Text className="font-medium mb-2" style={{ color: colors.text }}>New Group</Text>
              <TextInput
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder="Group name (e.g., Dance Friends)"
                placeholderTextColor={colors.textTertiary}
                className="rounded-lg px-4 py-3 mb-3"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB", color: colors.text }}
              />
              <Text className="text-sm mb-2" style={{ color: colors.textSecondary }}>Color</Text>
              <View className="flex-row flex-wrap mb-3">
                {GROUP_COLORS.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setNewGroupColor(color);
                    }}
                    className={`w-8 h-8 rounded-full mr-2 mb-2 items-center justify-center ${
                      newGroupColor === color ? "border-2" : ""
                    }`}
                    style={{
                      backgroundColor: color,
                      borderColor: newGroupColor === color ? colors.textTertiary : "transparent"
                    }}
                  >
                    {newGroupColor === color && (
                      <View className="w-3 h-3 rounded-full bg-white" />
                    )}
                  </Pressable>
                ))}
              </View>
              <View className="flex-row">
                <Pressable
                  onPress={() => setShowCreateGroup(false)}
                  className="flex-1 py-3 rounded-lg mr-2"
                  style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
                >
                  <Text className="text-center font-medium" style={{ color: colors.textSecondary }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (newGroupName.trim()) {
                      createGroupMutation.mutate({
                        name: newGroupName.trim(),
                        color: newGroupColor,
                      });
                    }
                  }}
                  disabled={createGroupMutation.isPending || !newGroupName.trim()}
                  className="flex-1 py-3 rounded-lg"
                  style={{
                    backgroundColor: newGroupName.trim() ? themeColor : (isDark ? "#2C2C2E" : "#E5E7EB")
                  }}
                >
                  <Text className="text-center font-medium" style={{
                    color: newGroupName.trim() ? "#fff" : colors.textTertiary
                  }}>
                    {createGroupMutation.isPending ? "Creating..." : "Create"}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Groups List */}
          {groups.length === 0 ? (
            <View className="rounded-xl p-6 border items-center" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              <Text className="mb-2" style={{ color: colors.textTertiary }}>No groups yet</Text>
              <Text className="text-sm text-center" style={{ color: colors.textTertiary }}>
                Create groups to organize your friends and control who sees your events
              </Text>
            </View>
          ) : (
            <>
              {groups.map((group: FriendGroup) => (
                <Pressable
                  key={group.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/friends?groupId=${group.id}` as any);
                  }}
                  onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    setEditingGroup(group);
                    setEditGroupColor(group.color);
                    setShowEditGroupModal(true);
                  }}
                  delayLongPress={400}
                  className="flex-row items-center rounded-xl p-4 mb-2 border"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: group.color + "20" }}
                  >
                    <Users size={18} color={group.color} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold" style={{ color: colors.text }}>{group.name}</Text>
                    <Text className="text-sm" style={{ color: colors.textTertiary }}>
                      {group.memberships?.length ?? 0} members
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleOpenAddMembers(group)}
                    className="p-2 mr-1"
                  >
                    <UserPlus size={18} color={themeColor} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleDeleteGroup(group)}
                    className="p-2"
                  >
                    <Trash2 size={18} color="#EF4444" />
                  </Pressable>
                </Pressable>
              ))}
              {/* Hint text for long-press */}
              <Text className="text-center text-xs mt-1" style={{ color: colors.textTertiary }}>
                Long-press a group to edit color or members
              </Text>
            </>
          )}
        </Animated.View>
      </ScrollView>

      {/* Add Members Modal */}
      <Modal
        visible={showAddMembersModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddMembersModal(false)}
      >
        <View className="flex-1" style={{ backgroundColor: colors.background }}>
          <View className="px-5 py-4 flex-row items-center justify-between border-b" style={{ borderBottomColor: colors.border }}>
            <View className="flex-row items-center">
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: (selectedGroup?.color ?? themeColor) + "20" }}
              >
                <Users size={18} color={selectedGroup?.color ?? themeColor} />
              </View>
              <View>
                <Text className="text-lg font-semibold" style={{ color: colors.text }}>
                  {selectedGroup?.name ?? "Group"}
                </Text>
                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                  {selectedGroup?.memberships?.length ?? 0} members
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => setShowAddMembersModal(false)}
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView className="flex-1 px-5 py-4">
            <Text className="text-sm font-medium mb-3" style={{ color: colors.textSecondary }}>
              Select friends to add or remove
            </Text>

            {friends.length === 0 ? (
              <View className="rounded-xl p-6 border items-center" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
                <Text className="mb-2" style={{ color: colors.textTertiary }}>No friends yet</Text>
                <Text className="text-sm text-center" style={{ color: colors.textTertiary }}>
                  Add friends to include them in your groups
                </Text>
              </View>
            ) : (
              friends.map((friendship) => {
                const isInGroup = isFriendInGroup(friendship.id, selectedGroup);
                return (
                  <Pressable
                    key={friendship.id}
                    onPress={() => handleToggleFriendInGroup(friendship)}
                    className="flex-row items-center rounded-xl p-4 mb-2 border"
                    style={{
                      backgroundColor: isInGroup ? (selectedGroup?.color ?? themeColor) + "10" : colors.surface,
                      borderColor: isInGroup ? (selectedGroup?.color ?? themeColor) + "40" : colors.border,
                    }}
                  >
                    <View className="w-12 h-12 rounded-full mr-3 overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
                      {friendship.friend?.image ? (
                        <Image source={{ uri: friendship.friend.image }} className="w-full h-full" />
                      ) : (
                        <View className="w-full h-full items-center justify-center" style={{ backgroundColor: `${themeColor}20` }}>
                          <Text style={{ color: themeColor }} className="text-lg font-medium">
                            {friendship.friend?.name?.[0] ?? friendship.friend?.email?.[0]?.toUpperCase() ?? "?"}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="font-semibold" style={{ color: colors.text }}>
                        {friendship.friend?.name ?? friendship.friend?.email ?? "Unknown"}
                      </Text>
                      {friendship.friend?.name && (
                        <Text className="text-sm" style={{ color: colors.textTertiary }}>
                          {friendship.friend?.email}
                        </Text>
                      )}
                    </View>
                    <View
                      className="w-8 h-8 rounded-full items-center justify-center"
                      style={{
                        backgroundColor: isInGroup ? (selectedGroup?.color ?? themeColor) : (isDark ? "#2C2C2E" : "#F3F4F6"),
                      }}
                    >
                      {isInGroup ? (
                        <Check size={16} color="#fff" />
                      ) : (
                        <Plus size={16} color={colors.textTertiary} />
                      )}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <View className="px-5 py-4 pb-8 border-t" style={{ borderTopColor: colors.border }}>
            <Pressable
              onPress={() => setShowAddMembersModal(false)}
              className="py-4 rounded-xl"
              style={{ backgroundColor: themeColor }}
            >
              <Text className="text-white text-center font-semibold">Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Monthly Recap Modal */}
      {monthlyRecapData && (
        <MonthlyRecap
          data={monthlyRecapData}
          visible={showMonthlyRecap}
          onClose={() => setShowMonthlyRecap(false)}
        />
      )}

      {/* Edit Group Modal */}
      <Modal
        visible={showEditGroupModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowEditGroupModal(false);
          setEditingGroup(null);
        }}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View
            className="rounded-t-3xl"
            style={{ backgroundColor: colors.surface, maxHeight: "80%" }}
          >
            <View className="items-center py-3">
              <View className="w-10 h-1 rounded-full" style={{ backgroundColor: colors.border }} />
            </View>

            <View className="px-5 pb-4 border-b" style={{ borderBottomColor: colors.border }}>
              <Text className="text-xl font-bold text-center" style={{ color: colors.text }}>
                Edit Group
              </Text>
              {editingGroup && (
                <Text className="text-center mt-1" style={{ color: colors.textSecondary }}>
                  {editingGroup.name}
                </Text>
              )}
            </View>

            <ScrollView className="px-5 py-4" style={{ maxHeight: 400 }}>
              {/* Color Picker Section */}
              <Text className="font-semibold mb-3" style={{ color: colors.text }}>
                Group Color
              </Text>
              <View className="flex-row flex-wrap gap-3 mb-6">
                {GROUP_COLORS.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => setEditGroupColor(color)}
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: color,
                      borderWidth: editGroupColor === color ? 3 : 0,
                      borderColor: isDark ? "#fff" : "#000",
                    }}
                  >
                    {editGroupColor === color && <Check size={20} color="#fff" />}
                  </Pressable>
                ))}
              </View>

              {/* Members Section */}
              <Text className="font-semibold mb-3" style={{ color: colors.text }}>
                Members ({editingGroup?.memberships?.length ?? 0})
              </Text>
              {editingGroup?.memberships?.length === 0 ? (
                <Text className="py-4 text-center" style={{ color: colors.textTertiary }}>
                  No members in this group
                </Text>
              ) : (
                editingGroup?.memberships?.map((membership) => {
                  const friend = membership.friendship?.friend;
                  if (!friend) return null;
                  return (
                    <View
                      key={membership.friendshipId}
                      className="flex-row items-center py-3 border-b"
                      style={{ borderBottomColor: colors.border }}
                    >
                      <View
                        className="w-10 h-10 rounded-full items-center justify-center mr-3"
                        style={{ backgroundColor: editingGroup.color }}
                      >
                        {friend.image ? (
                          <Image
                            source={{ uri: friend.image }}
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <Text className="text-white font-bold">
                            {(friend.name ?? friend.email ?? "?")[0]?.toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="font-medium" style={{ color: colors.text }}>
                          {friend.name ?? friend.email ?? "Unknown"}
                        </Text>
                        {friend.name && friend.email && (
                          <Text className="text-xs" style={{ color: colors.textTertiary }}>
                            {friend.email}
                          </Text>
                        )}
                      </View>
                      <Pressable
                        onPress={() => {
                          if (editingGroup && membership.friendshipId) {
                            removeMemberMutation.mutate({
                              groupId: editingGroup.id,
                              friendshipId: membership.friendshipId,
                            });
                            // Update local state to remove member
                            setEditingGroup({
                              ...editingGroup,
                              memberships: editingGroup.memberships?.filter((m) => m.friendshipId !== membership.friendshipId) ?? [],
                            });
                          }
                        }}
                        className="p-2"
                      >
                        <X size={20} color={colors.textTertiary} />
                      </Pressable>
                    </View>
                  );
                })
              )}

              {/* Delete Group Button */}
              <Pressable
                onPress={() => {
                  if (editingGroup) {
                    setShowEditGroupModal(false);
                    handleDeleteGroup(editingGroup);
                  }
                }}
                className="mt-6 py-3 rounded-xl items-center"
                style={{ backgroundColor: isDark ? "#3A2020" : "#FEE2E2" }}
              >
                <Text className="font-semibold" style={{ color: "#EF4444" }}>
                  Delete Group
                </Text>
              </Pressable>
            </ScrollView>

            {/* Action Buttons */}
            <View className="px-5 py-4 pb-8 border-t" style={{ borderTopColor: colors.border }}>
              <View className="flex-row gap-3">
                <Pressable
                  onPress={() => {
                    setShowEditGroupModal(false);
                    setEditingGroup(null);
                  }}
                  className="flex-1 py-4 rounded-xl"
                  style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                >
                  <Text className="text-center font-semibold" style={{ color: colors.text }}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (editingGroup && editGroupColor !== editingGroup.color) {
                      updateGroupMutation.mutate({
                        groupId: editingGroup.id,
                        color: editGroupColor,
                      });
                    } else {
                      setShowEditGroupModal(false);
                      setEditingGroup(null);
                    }
                  }}
                  className="flex-1 py-4 rounded-xl"
                  style={{ backgroundColor: themeColor }}
                >
                  <Text className="text-white text-center font-semibold">
                    {updateGroupMutation.isPending ? "Saving..." : "Save"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Sign Out Confirm Modal */}
      <ConfirmModal
        visible={showSignOutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmText="Sign Out"
        cancelText="Cancel"
        isDestructive
        onConfirm={confirmSignOut}
        onCancel={() => setShowSignOutConfirm(false)}
      />

      {/* Delete Group Confirm Modal */}
      <ConfirmModal
        visible={showDeleteGroupConfirm}
        title="Delete Group"
        message={`Are you sure you want to delete "${groupToDelete?.name ?? ""}"?`}
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive
        onConfirm={confirmDeleteGroup}
        onCancel={() => {
          setShowDeleteGroupConfirm(false);
          setGroupToDelete(null);
        }}
      />

      <BottomNavigation />
    </SafeAreaView>
  );
}
