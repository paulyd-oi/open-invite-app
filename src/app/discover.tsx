import React, { useMemo, useRef, useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { devLog } from "@/lib/devLog";
import { useQuery } from "@tanstack/react-query";
import { useRouter, Stack } from "expo-router";
import {
  MapPin,
  Users,
  Clock,
  Plus,
  Sparkles,
} from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { guardEmailVerification } from "@/lib/emailVerificationGate";
import BottomNavigation from "@/components/BottomNavigation";
import { eventKeys, deriveAttendeeCount, logRsvpMismatch } from "@/lib/eventQueryKeys";

interface PopularEvent {
  id: string;
  title: string;
  emoji: string;
  startTime: string;
  endTime?: string | null;
  location: string | null;
  visibility?: string;
  user: { id: string; name: string | null; image: string | null };
  attendeeCount: number;
  capacity?: number | null;
  goingCount?: number;
  displayGoingCount?: number;
  isFull?: boolean;
  viewerRsvpStatus?: "going" | "not_going" | "interested" | null;
  createdAt?: string;
  joinRequests?: Array<{
    id: string;
    userId: string;
    status: string;
    user: { id: string; name: string | null; image: string | null };
  }>;
}

/** Max cards rendered per section on Discover (scale-safety invariant). */
const PREVIEW_LIMIT = 3;

type Lens = "popular" | "best_friends" | "new";
const LENS_OPTIONS: { key: Lens; label: string }[] = [
  { key: "popular", label: "Popular" },
  { key: "best_friends", label: "For you" },
  { key: "new", label: "New" },
];

export default function DiscoverScreen() {
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();

  // ── Lens state ──
  const [lens, setLens] = useState<Lens>("popular");

  // Surface tokens from theme SSOT
  const tileShadow = !isDark
    ? { shadowColor: "#000" as const, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }
    : {};

  // SSOT: two event sources merged into one list
  const { data: feedData, isLoading: loadingFeed, refetch: refetchFeed } = useQuery({
    queryKey: eventKeys.feedPopular(),
    queryFn: () => api.get<{ events: PopularEvent[] }>("/api/events/feed?visibility=open_invite"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  const { data: myEventsData, isLoading: loadingMyEvents, refetch: refetchMyEvents } = useQuery({
    queryKey: eventKeys.myEvents(),
    queryFn: () => api.get<{ events: PopularEvent[] }>("/api/events"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  const isLoading = loadingFeed || loadingMyEvents;
  const handleRefresh = useCallback(() => {
    refetchFeed();
    refetchMyEvents();
  }, [refetchFeed, refetchMyEvents]);

  // ── SSOT: merge + deduplicate + enrich all events ──
  const enrichedEvents = useMemo(() => {
    const feedEvents = feedData?.events ?? [];
    const myEvents = myEventsData?.events ?? [];

    const allEventsMap = new Map<string, PopularEvent>();
    [...feedEvents, ...myEvents].forEach((event) => {
      if (!allEventsMap.has(event.id)) {
        allEventsMap.set(event.id, event);
      }
    });

    const allEvents = Array.from(allEventsMap.values());
    const now = new Date();

    // Enrich with canonical attendee count + filter to upcoming + non-private
    const BLOCKED_VIS = ["circle_only", "specific_groups", "private"];
    return allEvents
      .filter((e) => {
        if (e.visibility && BLOCKED_VIS.includes(e.visibility)) return false;
        return new Date(e.startTime) >= now;
      })
      .map((event) => {
        const derivedCount = deriveAttendeeCount(event);
        const attendeeCount = event.displayGoingCount ?? event.goingCount ?? derivedCount;
        if (__DEV__) logRsvpMismatch(event.id, derivedCount, event.goingCount, "discover_v1");
        return { ...event, attendeeCount };
      });
  }, [feedData?.events, myEventsData?.events]);

  // ── Lens-derived sorted lists (all from enrichedEvents SSOT) ──
  const popularSorted = useMemo(() => {
    return [...enrichedEvents].sort(
      (a, b) => b.attendeeCount - a.attendeeCount || new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );
  }, [enrichedEvents]);

  // best_friends: no friend-signal field exists on events — fallback to "for you" (same popular ranking)
  const forYouSorted = popularSorted; // alias; fallback acknowledged in DEV log

  const newSorted = useMemo(() => {
    return [...enrichedEvents].sort(
      (a, b) => new Date(b.createdAt ?? b.startTime).getTime() - new Date(a.createdAt ?? a.startTime).getTime(),
    );
  }, [enrichedEvents]);

  const totalActive = enrichedEvents.length;

  // ── Active lens feed ──
  const lensAll = lens === "popular" ? popularSorted : lens === "best_friends" ? forYouSorted : newSorted;

  // Featured = first event in lens feed
  const featured = lensAll.length > 0 ? lensAll[0] : null;

  // Preview = remaining events after featured, capped by PREVIEW_LIMIT
  const lensPreview = useMemo(() => {
    return lensAll.slice(featured ? 1 : 0, (featured ? 1 : 0) + PREVIEW_LIMIT);
  }, [lensAll, featured]);

  const lensTotal = lensAll.length;

  // Lens context labels
  const lensLabel = lens === "popular" ? "Popular right now" : lens === "best_friends" ? "From your people" : "New this week";

  const handleViewAll = () => {
    if (__DEV__) devLog("[DISCOVER_LENS]", { viewAll: true, lens, total: lensTotal });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/social" as any);
  };

  // [DISCOVER_LENS] DEV proof logs (once per mount)
  const didLog = useRef(false);
  if (__DEV__ && !didLog.current && !isLoading) {
    didLog.current = true;
    devLog("[DISCOVER_LENS]", {
      lens,
      totalEnriched: enrichedEvents.length,
      previewLimit: PREVIEW_LIMIT,
    });
    devLog("[DISCOVER_LENS]", {
      bestFriendsFallback: true,
      reason: "no_friend_signal",
    });
  }

  const didLogFeat = useRef(false);
  if (__DEV__ && !didLogFeat.current && featured && !isLoading) {
    didLogFeat.current = true;
    devLog("[DISCOVER_V1_FEEL]", { featuredId: featured.id, source: lens });
  }

  const handleEventPress = (eventId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/event/${eventId}` as any);
  };

  if (!session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in to discover events</Text>
        </View>
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  // ── Shared Event Card renderer ──
  const renderEventCard = (event: PopularEvent & { attendeeCount: number }, index: number, sectionDelay: number) => (
    <Animated.View
      key={event.id}
      entering={FadeInDown.delay(sectionDelay + index * 40).duration(240)}
      className="mb-3"
    >
      <Pressable
        onPress={() => handleEventPress(event.id)}
        className="rounded-xl p-4"
        style={{ backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, ...tileShadow }}
      >
        <View className="flex-row items-center">
          <View
            className="w-12 h-12 rounded-xl items-center justify-center mr-3"
            style={{ backgroundColor: themeColor + "20" }}
          >
            <Text className="text-xl">{event.emoji || "📅"}</Text>
          </View>

          <View className="flex-1">
            <Text className="font-semibold text-base" style={{ color: colors.text }} numberOfLines={1}>
              {event.title}
            </Text>
            <View className="flex-row items-center mt-1">
              <Clock size={12} color={colors.textTertiary} />
              <Text className="text-sm ml-1" style={{ color: colors.textSecondary }} numberOfLines={1}>
                {new Date(event.startTime).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                {" at "}
                {new Date(event.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </Text>
            </View>
            {event.location && (
              <View className="flex-row items-center mt-0.5">
                <MapPin size={12} color={colors.textTertiary} />
                <Text className="text-sm ml-1" style={{ color: colors.textTertiary }} numberOfLines={1}>
                  {event.location}
                </Text>
              </View>
            )}
          </View>

          <View className="items-center">
            <View
              className="px-3 py-1.5 rounded-full flex-row items-center"
              style={{ backgroundColor: event.isFull ? "#EF444420" : themeColor + "20" }}
            >
              <Users size={14} color={event.isFull ? "#EF4444" : themeColor} />
              <Text className="font-bold ml-1" style={{ color: event.isFull ? "#EF4444" : themeColor }}>
                {event.capacity != null
                  ? event.isFull ? "Full" : `${event.attendeeCount}/${event.capacity}`
                  : event.attendeeCount}
              </Text>
            </View>
            <Text className="text-xs mt-1" style={{ color: colors.textTertiary }}>
              {event.isFull ? `${event.attendeeCount} going` : "going"}
            </Text>
          </View>
        </View>

        {/* Attendee Avatars */}
        {event.joinRequests && event.joinRequests.filter(r => r.status === "accepted" && r.user != null).length > 0 && (
          <View className="flex-row items-center mt-3 pt-3 border-t" style={{ borderColor: colors.border }}>
            <View className="flex-row">
              {event.joinRequests
                .filter(r => r.status === "accepted" && r.user != null)
                .slice(0, 4)
                .map((request, i) => (
                  <View
                    key={request.id}
                    className="w-7 h-7 rounded-full overflow-hidden border-2"
                    style={{
                      marginLeft: i > 0 ? -8 : 0,
                      borderColor: colors.surface,
                      backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB",
                    }}
                  >
                    {request.user?.image ? (
                      <Image source={{ uri: request.user.image }} className="w-full h-full" />
                    ) : (
                      <View
                        className="w-full h-full items-center justify-center"
                        style={{ backgroundColor: themeColor + "30" }}
                      >
                        <Text className="text-xs font-bold" style={{ color: themeColor }}>
                          {request.user?.name?.[0] ?? "?"}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
            </View>
            <Text className="text-sm ml-2" style={{ color: colors.textSecondary }}>
              {event.joinRequests.filter(r => r.status === "accepted" && r.user != null).slice(0, 2).map(r => r.user?.name?.split(" ")[0] ?? "?").join(", ")}
              {event.joinRequests.filter(r => r.status === "accepted" && r.user != null).length > 2 && ` +${event.joinRequests.filter(r => r.status === "accepted" && r.user != null).length - 2} more`}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="px-5 pt-4 pb-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold" style={{ color: colors.text }}>
            Discover
          </Text>
          <Pressable
            onPress={() => {
              if (!guardEmailVerification(session)) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/create");
            }}
            className="flex-row items-center px-4 py-2 rounded-full"
            style={{ backgroundColor: themeColor }}
          >
            <Text className="text-white font-semibold">Create</Text>
          </Pressable>
        </View>

        {/* ═══ Lens Switcher ═══ */}
        <View className="flex-row mt-3 rounded-full p-0.5" style={{ backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7" }}>
          {LENS_OPTIONS.map((opt) => {
            const active = lens === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => {
                  if (lens !== opt.key) {
                    setLens(opt.key);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (__DEV__) devLog("[DISCOVER_LENS]", { lens: opt.key, totalEnriched: enrichedEvents.length, previewLimit: PREVIEW_LIMIT });
                  }
                }}
                className="flex-1 items-center py-2 rounded-full"
                style={active ? { backgroundColor: colors.surface, ...tileShadow } : undefined}
              >
                <Text
                  className={`text-sm ${active ? "font-semibold" : "font-normal"}`}
                  style={{ color: active ? themeColor : colors.textTertiary }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={handleRefresh}
            tintColor={themeColor}
          />
        }
      >
        {isLoading ? (
          <View className="py-12 items-center">
            <Text style={{ color: colors.textTertiary }}>Loading...</Text>
          </View>
        ) : (
          <>
            {/* ═══ Pulse Row ═══ */}
            <Animated.View entering={FadeInDown.duration(200)} className="mb-4">
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                {totalActive > 0
                  ? `Your week is taking shape \u2014 ${totalActive} event${totalActive !== 1 ? "s" : ""} active`
                  : "No events yet \u2014 create one to start the momentum."}
              </Text>
            </Animated.View>

            {/* ═══ Featured Module ═══ */}
            {featured && (
              <Animated.View entering={FadeInDown.delay(20).duration(260)} className="mb-5">
                <View className="flex-row items-center mb-2">
                  <Sparkles size={14} color={themeColor} />
                  <Text className="font-semibold ml-1.5 text-xs" style={{ color: themeColor, letterSpacing: 0.5 }}>Featured</Text>
                </View>
                <Pressable
                  onPress={() => handleEventPress(featured.id)}
                  className="rounded-2xl p-5"
                  style={{ backgroundColor: colors.surface, borderColor: themeColor + "30", borderWidth: 1, ...tileShadow }}
                >
                  <View className="flex-row items-center">
                    <View className="w-14 h-14 rounded-2xl items-center justify-center mr-4" style={{ backgroundColor: themeColor + "20" }}>
                      <Text className="text-2xl">{featured.emoji || "\uD83D\uDCC5"}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-bold text-lg" style={{ color: colors.text }} numberOfLines={1}>{featured.title}</Text>
                      <View className="flex-row items-center mt-1">
                        <Clock size={12} color={colors.textTertiary} />
                        <Text className="text-sm ml-1" style={{ color: colors.textSecondary }} numberOfLines={1}>
                          {new Date(featured.startTime).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                          {" at "}
                          {new Date(featured.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </Text>
                      </View>
                      {featured.location && (
                        <View className="flex-row items-center mt-0.5">
                          <MapPin size={12} color={colors.textTertiary} />
                          <Text className="text-sm ml-1" style={{ color: colors.textTertiary }} numberOfLines={1}>{featured.location}</Text>
                        </View>
                      )}
                    </View>
                    <View className="px-3 py-1.5 rounded-full flex-row items-center" style={{ backgroundColor: themeColor + "20" }}>
                      <Users size={14} color={themeColor} />
                      <Text className="font-bold ml-1" style={{ color: themeColor }}>{featured.attendeeCount}</Text>
                    </View>
                  </View>
                </Pressable>
              </Animated.View>
            )}

            {/* ═══ Lens Context Label + Count ═══ */}
            <Animated.View entering={FadeInDown.delay(60).duration(240)} className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center">
                <Text className="font-semibold text-sm" style={{ color: colors.text }}>{lensLabel}</Text>
                {lensTotal > 0 && (
                  <View className="ml-2 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: themeColor + "18" }}>
                    <Text className="text-xs font-medium" style={{ color: themeColor }}>{lensTotal}</Text>
                  </View>
                )}
              </View>
              {lensTotal > PREVIEW_LIMIT && (
                <Pressable onPress={handleViewAll} hitSlop={8}>
                  <Text className="text-xs" style={{ color: colors.textTertiary }}>View all</Text>
                </Pressable>
              )}
            </Animated.View>

            {/* ═══ Lens Feed ═══ */}
            {lensPreview.length > 0 ? (
              lensPreview.map((e, i) => renderEventCard(e, i, 80))
            ) : (
              <Animated.View entering={FadeInDown.delay(80).duration(240)} className="mb-3">
                <Pressable
                  onPress={() => {
                    if (!guardEmailVerification(session)) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/create");
                  }}
                  className="flex-row items-center rounded-lg px-4 py-3"
                  style={{ backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, ...tileShadow }}
                >
                  <Plus size={14} color={colors.textTertiary} />
                  <Text className="text-sm flex-1 ml-2" style={{ color: colors.textTertiary }}>No events yet</Text>
                  <Text className="text-xs font-medium" style={{ color: themeColor }}>Create</Text>
                </Pressable>
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>

      <BottomNavigation />
    </SafeAreaView>
  );
}
