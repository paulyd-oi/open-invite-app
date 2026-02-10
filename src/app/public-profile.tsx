import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter, Stack } from "expo-router";
import { Calendar, ChevronRight, ChevronLeft, Lock, Shield, Eye } from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { EntityAvatar } from "@/components/EntityAvatar";
import { devLog } from "@/lib/devLog";
import { type FriendUser } from "@/shared/contracts";

// ── Minimal Calendar (same as user/[id] PrivateCalendar) ──
function PreviewCalendar({ themeColor }: { themeColor: string }) {
  const { colors } = useTheme();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    return { daysInMonth, startingDay };
  };

  const { daysInMonth, startingDay } = getDaysInMonth(currentMonth);
  const today = new Date();

  const goToPrevMonth = () => {
    Haptics.selectionAsync();
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    Haptics.selectionAsync();
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const renderDays = () => {
    const days = [];
    const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

    for (let i = 0; i < 7; i++) {
      days.push(
        <View key={`header-${i}`} className="w-[14.28%] items-center py-1">
          <Text className="text-xs font-medium" style={{ color: colors.textTertiary }}>{dayNames[i]}</Text>
        </View>
      );
    }

    for (let i = 0; i < startingDay; i++) {
      days.push(<View key={`empty-${i}`} className="w-[14.28%] h-9" />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
      const dateKey = date.toDateString();
      const isToday = today.toDateString() === dateKey;

      days.push(
        <View key={`day-${day}`} className="w-[14.28%] h-9 items-center justify-center">
          <View
            className={`w-8 h-8 rounded-full items-center justify-center ${isToday ? "border-2" : ""}`}
            style={{ borderColor: isToday ? themeColor : undefined }}
          >
            <Text
              className="text-sm font-normal"
              style={{ color: isToday ? themeColor : colors.text }}
            >
              {day}
            </Text>
          </View>
        </View>
      );
    }

    return days;
  };

  return (
    <View className="rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}>
      <View className="flex-row items-center justify-between mb-3">
        <Pressable onPress={goToPrevMonth} className="p-2">
          <ChevronLeft size={20} color={colors.text} />
        </Pressable>
        <Text className="text-base font-semibold" style={{ color: colors.text }}>
          {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </Text>
        <Pressable onPress={goToNextMonth} className="p-2">
          <ChevronRight size={20} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView horizontal={false} showsVerticalScrollIndicator={false} style={{ maxHeight: 220 }}>
        <View className="flex-row flex-wrap">{renderDays()}</View>
      </ScrollView>

      <View className="flex-row items-center justify-center mt-3 pt-3 border-t" style={{ borderColor: colors.border }}>
        <Lock size={12} color={colors.textTertiary} />
        <Text className="text-xs ml-1" style={{ color: colors.textTertiary }}>Events hidden for privacy</Text>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════
// PUBLIC PROFILE PREVIEW — self public view (Instagram-style)
// ══════════════════════════════════════════════════════════
export default function PublicProfileScreen() {
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();

  const viewerId = session?.user?.id;

  // Fetch self via the same endpoint foreign profiles use
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["userProfile", viewerId],
    queryFn: () =>
      api.get<{
        user: FriendUser;
        isFriend: boolean;
        friendshipId: string | null;
        hasPendingRequest: boolean;
        incomingRequestId: string | null;
      }>(`/api/profile/${viewerId}/profile`),
    enabled: isAuthedForNetwork(bootStatus, session) && !!viewerId,
  });

  const user = data?.user;

  // [P0_PUBLIC_PROFILE] DEV proof log
  useEffect(() => {
    if (__DEV__ && viewerId) {
      devLog("[P0_PUBLIC_PROFILE]", {
        viewerId: viewerId?.slice(0, 8),
        mode: "public_preview",
        component: "public-profile.tsx",
        friendActionsHidden: true,
        dataLoaded: !!data,
        userName: user?.name ?? null,
      });
    }
  }, [viewerId, data, user?.name]);

  if (!session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Public Profile" }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: "Public Profile",
          headerBackButtonDisplayMode: "minimal",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={themeColor} />
        }
      >
        {/* Preview banner */}
        <Animated.View entering={FadeInDown.springify()} className="mb-4">
          <View
            className="rounded-2xl px-4 py-3 flex-row items-center"
            style={{ backgroundColor: `${themeColor}15`, borderColor: `${themeColor}40`, borderWidth: 1 }}
          >
            <Eye size={18} color={themeColor} />
            <Text className="ml-2 text-sm font-medium flex-1" style={{ color: themeColor }}>
              This is how others see your profile
            </Text>
          </View>
        </Animated.View>

        {isLoading ? (
          <View className="py-8 items-center">
            <Text style={{ color: colors.textTertiary }}>Loading...</Text>
          </View>
        ) : user ? (
          <>
            {/* User Info Card — matches user/[id] layout, NO friend CTAs */}
            <Animated.View entering={FadeInDown.delay(50).springify()} className="mb-4">
              <View
                className="rounded-2xl p-5 items-center"
                style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
              >
                <EntityAvatar
                  photoUrl={user.Profile?.avatarUrl ?? user.image}
                  initials={user.name?.[0] ?? user.email?.[0]?.toUpperCase() ?? "?"}
                  size={80}
                  backgroundColor={
                    (user.Profile?.avatarUrl ?? user.image)
                      ? (isDark ? "#2C2C2E" : "#E5E7EB")
                      : themeColor + "30"
                  }
                  foregroundColor={themeColor}
                />
                <View className="flex-row items-center mt-3">
                  <Text className="text-xl font-bold" style={{ color: colors.text }}>
                    {user.name ?? "No name"}
                  </Text>
                </View>

                {/* @handle */}
                {user.Profile?.handle && (
                  <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                    @{user.Profile.handle}
                  </Text>
                )}

                {/* Calendar Bio */}
                <View className="flex-row items-center mt-2">
                  <Calendar size={14} color={colors.textSecondary} />
                  <Text className="ml-1.5 text-sm" style={{ color: colors.textSecondary }}>
                    My calendar looks like...
                  </Text>
                </View>
                {user.Profile?.calendarBio ? (
                  <Text className="text-sm mt-1 text-center px-4" style={{ color: colors.text }}>
                    {user.Profile.calendarBio}
                  </Text>
                ) : (
                  <Text className="text-sm mt-1 italic" style={{ color: colors.textTertiary }}>
                    Not set yet
                  </Text>
                )}

                {/* NO friend request / Add Friend CTA — this is self preview */}
              </View>
            </Animated.View>

            {/* Calendar (locked view — same as non-friend sees) */}
            <Animated.View entering={FadeInDown.delay(100).springify()}>
              <View className="flex-row items-center mb-3">
                <Calendar size={18} color={themeColor} />
                <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
                  {user.name?.split(" ")[0] ?? "Your"}&apos;s Calendar
                </Text>
              </View>
              <PreviewCalendar themeColor={themeColor} />
            </Animated.View>

            {/* Privacy Notice — same as non-friend sees, but no CTA buttons */}
            <Animated.View entering={FadeInDown.delay(150).springify()}>
              <View
                className="rounded-2xl p-6 items-center"
                style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
              >
                <View
                  className="w-14 h-14 rounded-full items-center justify-center mb-3"
                  style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                >
                  <Shield size={28} color={colors.textTertiary} />
                </View>
                <Text className="text-lg font-semibold text-center mb-1" style={{ color: colors.text }}>
                  Events are Private
                </Text>
                <Text className="text-sm text-center" style={{ color: colors.textSecondary }}>
                  Only friends can see your open invites and events
                </Text>
                {/* NO friend request CTA — self preview */}
              </View>
            </Animated.View>
          </>
        ) : (
          <View className="py-8 items-center">
            <Text style={{ color: colors.textTertiary }}>Could not load profile</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
