import React, { useState, useEffect, useMemo } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, Image } from "react-native";
import { resolveBannerUri, getHeroTextColor, getHeroSubTextColor } from "@/lib/heroSSOT";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter, Stack } from "expo-router";
import { Calendar, ChevronRight, ChevronLeft, Lock, Shield, Eye, Clock, MapPin } from "@/ui/icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { EntityAvatar } from "@/components/EntityAvatar";
import { devLog } from "@/lib/devLog";
import { eventKeys } from "@/lib/eventQueryKeys";
import { type FriendUser, type Event, type GetEventsResponse } from "@/shared/contracts";

// ── Owner-aware Calendar (shows event indicators when events available) ──
function PreviewCalendar({
  themeColor,
  events = [],
}: {
  themeColor: string;
  events?: Event[];
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const hasEvents = events.length > 0;

  // Build date→events lookup (same pattern as FriendCalendar in user/[id])
  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    events.forEach((ev) => {
      const dateKey = new Date(ev.startTime).toDateString();
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(ev);
    });
    return map;
  }, [events]);

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

  const handleDayPress = (day: number) => {
    const selectedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const dateKey = selectedDate.toDateString();
    const dayEvents = eventsByDate.get(dateKey);
    if (dayEvents && dayEvents.length > 0) {
      if (__DEV__) {
        devLog("[P1_PUBLIC_PREVIEW_TAP]", {
          dayKey: dateKey,
          count: dayEvents.length,
          chosenEventId: dayEvents[0].id?.slice(0, 8),
          isMultiEvent: dayEvents.length > 1,
        });
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/event/${dayEvents[0].id}` as any);
    }
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
      const dayEvts = eventsByDate.get(dateKey) ?? [];
      const hasDayEvents = dayEvts.length > 0;
      const isToday = today.toDateString() === dateKey;

      const cell = (
        <View
          className={`w-8 h-8 rounded-full items-center justify-center ${isToday ? "border-2" : ""}`}
          style={{
            borderColor: isToday ? themeColor : undefined,
            backgroundColor: hasDayEvents ? themeColor + "20" : undefined,
          }}
        >
          <Text
            className={`text-sm ${hasDayEvents ? "font-semibold" : "font-normal"}`}
            style={{ color: hasDayEvents ? themeColor : isToday ? themeColor : colors.text }}
          >
            {day}
          </Text>
        </View>
      );

      days.push(
        hasDayEvents ? (
          <Pressable
            key={`day-${day}`}
            onPress={() => handleDayPress(day)}
            className="w-[14.28%] h-9 items-center justify-center"
          >
            {cell}
          </Pressable>
        ) : (
          <View key={`day-${day}`} className="w-[14.28%] h-9 items-center justify-center">
            {cell}
          </View>
        )
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

      {/* Footer: hint when events exist, empty state when none */}
      {hasEvents ? (
        <View className="items-center mt-3 pt-3 border-t" style={{ borderColor: colors.border }}>
          <Text className="text-xs" style={{ color: colors.textTertiary }}>Tap a highlighted day to open its first event</Text>
        </View>
      ) : (
        <View className="flex-row items-center justify-center mt-3 pt-3 border-t" style={{ borderColor: colors.border }}>
          <Lock size={12} color={colors.textTertiary} />
          <Text className="text-xs ml-1" style={{ color: colors.textTertiary }}>No upcoming events</Text>
        </View>
      )}
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

  // Fetch owner's own events (self preview — NOT the foreign friend-events endpoint)
  const { data: eventsData } = useQuery({
    queryKey: eventKeys.myEvents(),
    queryFn: () => api.get<GetEventsResponse>("/api/events"),
    enabled: isAuthedForNetwork(bootStatus, session) && !!viewerId,
  });

  // Filter to upcoming events, sorted soonest-first
  const upcomingEvents = useMemo(() => {
    if (!eventsData?.events) return [];
    const now = new Date();
    return eventsData.events
      .filter((e) => new Date(e.startTime) >= now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [eventsData?.events]);

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
      devLog("[P0_PUBLIC_PREVIEW_PRIVACY]", {
        viewerId: viewerId?.slice(0, 8),
        ownerId: viewerId?.slice(0, 8),
        previewMode: true,
        viewerIsOwner: true,
        decision: "show_own_events",
        eventCount: upcomingEvents.length,
        reason: "owner_self_preview_must_not_mask_own_data",
      });
      devLog("[P1_PUBLIC_PREVIEW_CLARITY]", {
        viewerId: viewerId?.slice(0, 8),
        hasEvents: upcomingEvents.length > 0,
        upcomingCount: upcomingEvents.length,
        copyVariant: "pill+helper",
      });
      const pubBannerUri = resolveBannerUri(user?.Profile as Record<string, unknown> | null);
      devLog("[P0_BANNER_RENDER_PUBLIC]", {
        computedBannerUri: pubBannerUri?.slice(0, 60) ?? null,
        source: user?.Profile?.bannerPhotoUrl ? "bannerPhotoUrl" : user?.Profile?.bannerUrl ? "bannerUrl" : "none",
      });
      devLog("[P1_PUBLIC_PREVIEW_UI]", {
        viewerId: viewerId?.slice(0, 8),
        bannerMounted: !!pubBannerUri,
      });
      devLog("[P1_HEADER_SOT]", {
        route: "public-profile",
        resolvedTitle: "Public Profile",
        backMode: "minimal",
      });
      devLog("[P2_ANIMATION]", {
        component: "public-profile",
        animationMounted: true,
      });
    }
  }, [viewerId, data, user?.name, upcomingEvents.length]);

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
        {/* Preview banner + pill */}
        <Animated.View entering={FadeIn.duration(300)} className="mb-4">
          <View
            className="rounded-2xl px-4 py-3"
            style={{ backgroundColor: `${themeColor}15`, borderColor: `${themeColor}40`, borderWidth: 1 }}
          >
            <View className="flex-row items-center">
              <View
                className="w-9 h-9 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: `${themeColor}20` }}
              >
                <Eye size={18} color={themeColor} />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center">
                  <Text className="text-sm font-semibold" style={{ color: themeColor }}>
                    Public Preview
                  </Text>
                  <View
                    className="ml-2 px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${themeColor}25` }}
                  >
                    <Text className="text-xs font-medium" style={{ color: themeColor }}>Preview Mode</Text>
                  </View>
                </View>
                <Text className="text-xs mt-0.5" style={{ color: `${themeColor}CC` }}>
                  This is how others see your profile
                </Text>
              </View>
            </View>
            <Text className="text-xs mt-2" style={{ color: colors.textSecondary }}>
              Only you can see this view. Non-friends see your events as private.
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
              {(() => {
                const pubBannerUri = resolveBannerUri(user.Profile as Record<string, unknown> | null);
                return (
                  <View
                    className="rounded-2xl overflow-hidden"
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderWidth: 1,
                      minHeight: pubBannerUri ? 220 : undefined,
                    }}
                  >
                    {/* Banner as full-bleed background */}
                    {pubBannerUri && (
                      <>
                        <Image
                          source={{ uri: pubBannerUri }}
                          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                          resizeMode="cover"
                        />
                        {/* Subtle global tint */}
                        <View
                          style={{
                            position: "absolute",
                            top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: isDark ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.06)",
                          }}
                        />
                      </>
                    )}

                    {/* Content layer — pushed to bottom when banner present */}
                    <View style={{ flex: 1, justifyContent: pubBannerUri ? "flex-end" : "flex-start", padding: pubBannerUri ? 12 : 24, alignItems: "center" }}>
                      {/* Avatar */}
                      <View style={{ marginBottom: pubBannerUri ? 8 : 0 }}>
                        <EntityAvatar
                          photoUrl={user.Profile?.avatarUrl ?? user.image}
                          initials={user.name?.[0] ?? user.email?.[0]?.toUpperCase() ?? "?"}
                          size={88}
                          backgroundColor={
                            (user.Profile?.avatarUrl ?? user.image)
                              ? (isDark ? "#2C2C2E" : "#E5E7EB")
                              : themeColor + "30"
                          }
                          foregroundColor={themeColor}
                        />
                      </View>

                      {/* Text legibility panel (fake glass when banner present) */}
                      <View
                        style={pubBannerUri ? {
                          backgroundColor: isDark ? "rgba(0,0,0,0.38)" : "rgba(255,255,255,0.72)",
                          borderColor: isDark ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.55)",
                          borderWidth: 1,
                          borderRadius: 16,
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          overflow: "hidden",
                          alignItems: "center",
                          width: "100%",
                        } : { alignItems: "center", marginTop: 16, width: "100%" }}
                      >
                        {/* Legibility boost — subtle bottom deepening */}
                        {pubBannerUri && (
                          <View
                            style={{
                              position: "absolute",
                              bottom: 0,
                              left: 0,
                              right: 0,
                              height: "50%",
                              backgroundColor: isDark ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.18)",
                            }}
                          />
                        )}
                        <View className="flex-row items-center">
                          <Text className="text-xl font-bold" style={{ color: pubBannerUri ? getHeroTextColor(isDark) : colors.text, letterSpacing: -0.3 }}>
                            {user.name ?? "No name"}
                          </Text>
                        </View>

                        {/* @handle — hero contrast when banner present */}
                        {user.Profile?.handle && (
                          <Text className="text-sm" style={{ color: pubBannerUri ? getHeroSubTextColor(isDark) : colors.textSecondary, marginTop: 4 }}>
                            @{user.Profile.handle}
                          </Text>
                        )}

                        {/* Calendar Bio */}
                        <View className="flex-row items-center" style={{ marginTop: 8 }}>
                          <Calendar size={14} color={pubBannerUri ? getHeroSubTextColor(isDark) : colors.textTertiary} />
                          <Text className="ml-1.5 text-sm" style={{ color: pubBannerUri ? getHeroSubTextColor(isDark) : colors.textTertiary }}>
                            My calendar looks like...
                          </Text>
                        </View>
                        {user.Profile?.calendarBio ? (
                          <Text className="text-sm mt-1 text-center px-4" style={{ color: pubBannerUri ? getHeroTextColor(isDark) : colors.text }}>
                            {user.Profile.calendarBio}
                          </Text>
                        ) : (
                          <Text className="text-sm mt-1 italic" style={{ color: pubBannerUri ? getHeroSubTextColor(isDark) : colors.textTertiary }}>
                            Not set yet
                          </Text>
                        )}

                        {/* NO friend request / Add Friend CTA — this is self preview */}
                      </View>
                    </View>
                  </View>
                );
              })()}
            </Animated.View>

            {/* Calendar — owner sees their actual events as indicators */}
            <Animated.View entering={FadeInDown.delay(100).springify()}>
              <View className="flex-row items-center mb-3">
                <Calendar size={18} color={themeColor} />
                <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
                  {user.name?.split(" ")[0] ?? "Your"}&apos;s Calendar
                </Text>
              </View>
              <PreviewCalendar themeColor={themeColor} events={upcomingEvents} />
            </Animated.View>

            {/* Owner's upcoming event cards */}
            {upcomingEvents.length > 0 && (
              <Animated.View entering={FadeInDown.delay(120).springify()}>
                <View className="flex-row items-center mb-3">
                  <Clock size={16} color={themeColor} />
                  <Text className="text-base font-semibold ml-2" style={{ color: colors.text }}>
                    Upcoming Events
                  </Text>
                </View>
                {upcomingEvents.slice(0, 5).map((event, index) => {
                  const startDate = new Date(event.startTime);
                  const isToday = new Date().toDateString() === startDate.toDateString();
                  const isTomorrow = new Date(Date.now() + 86400000).toDateString() === startDate.toDateString();
                  const dateLabel = isToday ? "Today" : isTomorrow ? "Tomorrow" : startDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                  const timeLabel = startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

                  return (
                    <Animated.View key={event.id} entering={FadeInDown.delay(140 + index * 80).springify()}>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push(`/event/${event.id}` as any);
                        }}
                        className="rounded-2xl p-4 mb-3"
                        style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
                      >
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1">
                            <View className="flex-row items-center mb-2">
                              <EntityAvatar
                                photoUrl={event.eventPhotoUrl}
                                emoji={event.emoji ?? "📅"}
                                size={36}
                                borderRadius={10}
                                backgroundColor={`${themeColor}15`}
                                emojiStyle={{ fontSize: 20 }}
                              />
                              <View style={{ width: 8 }} />
                              <View className="flex-1">
                                <Text className="text-lg font-semibold" style={{ color: colors.text }}>
                                  {event.title}
                                </Text>
                                <View className="flex-row items-center mt-1">
                                  <Calendar size={12} color={colors.textSecondary} />
                                  <Text className="text-xs ml-1" style={{ color: colors.textSecondary }}>
                                    {dateLabel}
                                  </Text>
                                </View>
                              </View>
                            </View>

                            <View className="flex-row items-center flex-wrap gap-2">
                              <View className="flex-row items-center">
                                <Clock size={12} color={themeColor} />
                                <Text className="text-xs ml-1 font-medium" style={{ color: themeColor }}>
                                  {timeLabel}
                                </Text>
                              </View>
                              {event.location && (
                                <View className="flex-row items-center">
                                  <MapPin size={12} color={colors.textTertiary} />
                                  <Text className="text-xs ml-1" style={{ color: colors.textTertiary }} numberOfLines={1}>
                                    {event.location}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                          <ChevronRight size={20} color={colors.textTertiary} />
                        </View>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </Animated.View>
            )}

            {/* Non-friend view notice — tells owner what others see */}
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
                  Non-friends see this as private
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
