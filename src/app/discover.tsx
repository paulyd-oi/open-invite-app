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
  TrendingUp,
  Plus,
  ChevronDown,
  ChevronUp,
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

export default function DiscoverScreen() {
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();

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

  // ── Section A: Traction (events with 2+ attendees, sorted by attendeeCount desc → recency) ──
  const tractionAll = useMemo(() => {
    return [...enrichedEvents]
      .filter((e) => e.attendeeCount >= 2)
      .sort((a, b) => b.attendeeCount - a.attendeeCount || new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [enrichedEvents]);
  const friendsJoining = useMemo(() => tractionAll.slice(0, PREVIEW_LIMIT), [tractionAll]);

  // ── Section B: Trending (highest attendeeCount, exclude Section A picks) ──
  const trendingAll = useMemo(() => {
    const usedIds = new Set(tractionAll.map((e) => e.id));
    return [...enrichedEvents]
      .filter((e) => !usedIds.has(e.id))
      .sort((a, b) => b.attendeeCount - a.attendeeCount || new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [enrichedEvents, tractionAll]);
  const trending = useMemo(() => trendingAll.slice(0, PREVIEW_LIMIT), [trendingAll]);

  // ── Section C: Recently Created (newest by createdAt, exclude A+B) ──
  const recentAll = useMemo(() => {
    const usedIds = new Set([...tractionAll, ...trendingAll].map((e) => e.id));
    return [...enrichedEvents]
      .filter((e) => !usedIds.has(e.id))
      .sort((a, b) => new Date(b.createdAt ?? b.startTime).getTime() - new Date(a.createdAt ?? a.startTime).getTime());
  }, [enrichedEvents, tractionAll, trendingAll]);
  const recentlyCreated = useMemo(() => recentAll.slice(0, PREVIEW_LIMIT), [recentAll]);

  // Section totals (full counts before PREVIEW_LIMIT)
  const tractionTotal = tractionAll.length;
  const trendingTotal = trendingAll.length;
  const recentTotal = recentAll.length;
  const totalActive = enrichedEvents.length;

  // ── Collapse state ──
  const [collapsed, setCollapsed] = useState({ traction: false, trending: false, recent: false });
  const toggleSection = (key: "traction" | "trending" | "recent") => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (__DEV__) devLog("[DISCOVER_V1_SCALE]", { toggle: true, section: key, collapsed: next[key] });
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const handleViewAll = (section: "traction" | "trending" | "recent", total: number) => {
    if (__DEV__) devLog("[DISCOVER_V1_SCALE]", { viewAll: true, section, total });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/social" as any);
  };

  // [DISCOVER_V1] DEV proof log (mount-once)
  const didLog = useRef(false);
  if (__DEV__ && !didLog.current && !isLoading) {
    didLog.current = true;
    devLog("[DISCOVER_V1]", {
      friendsCount: friendsJoining.length,
      trendingCount: trending.length,
      recentCount: recentlyCreated.length,
      totalEnriched: enrichedEvents.length,
    });
    devLog("[DISCOVER_V1_FRIEND_SIGNAL]", {
      mode: "attendees_proxy",
      field: "attendeeCount",
      reason: "no friend-signal field on event schema",
    });
    devLog("[DISCOVER_V1_SCALE]", {
      tractionTotal,
      trendingTotal,
      recentTotal,
      previewLimit: PREVIEW_LIMIT,
    });
  }

  // ── Featured event (UI-only selection, no data change) ──
  const featured = useMemo(() => {
    if (friendsJoining.length > 0) return { event: friendsJoining[0], source: "traction" as const };
    if (trending.length > 0) return { event: trending[0], source: "trending" as const };
    if (recentlyCreated.length > 0) return { event: recentlyCreated[0], source: "recent" as const };
    return null;
  }, [friendsJoining, trending, recentlyCreated]);

  const didLogFeat = useRef(false);
  if (__DEV__ && !didLogFeat.current && featured && !isLoading) {
    didLogFeat.current = true;
    devLog("[DISCOVER_V1_FEEL]", { featuredId: featured.event.id, source: featured.source });
  }

  // Display-only previews that exclude the featured event
  const tractionPreview = useMemo(
    () => (featured?.source === "traction" ? friendsJoining.filter((e) => e.id !== featured.event.id) : friendsJoining),
    [friendsJoining, featured],
  );
  const trendingPreview = useMemo(
    () => (featured?.source === "trending" ? trending.filter((e) => e.id !== featured.event.id) : trending),
    [trending, featured],
  );
  const recentPreview = useMemo(
    () => (featured?.source === "recent" ? recentlyCreated.filter((e) => e.id !== featured.event.id) : recentlyCreated),
    [recentlyCreated, featured],
  );

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
        style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
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
      <View className="px-5 pt-4 pb-3">
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
                  onPress={() => handleEventPress(featured.event.id)}
                  className="rounded-2xl p-5"
                  style={{ backgroundColor: colors.surface, borderColor: themeColor + "30", borderWidth: 1 }}
                >
                  <View className="flex-row items-center">
                    <View className="w-14 h-14 rounded-2xl items-center justify-center mr-4" style={{ backgroundColor: themeColor + "20" }}>
                      <Text className="text-2xl">{featured.event.emoji || "\uD83D\uDCC5"}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-bold text-lg" style={{ color: colors.text }} numberOfLines={1}>{featured.event.title}</Text>
                      <View className="flex-row items-center mt-1">
                        <Clock size={12} color={colors.textTertiary} />
                        <Text className="text-sm ml-1" style={{ color: colors.textSecondary }} numberOfLines={1}>
                          {new Date(featured.event.startTime).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                          {" at "}
                          {new Date(featured.event.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </Text>
                      </View>
                      {featured.event.location && (
                        <View className="flex-row items-center mt-0.5">
                          <MapPin size={12} color={colors.textTertiary} />
                          <Text className="text-sm ml-1" style={{ color: colors.textTertiary }} numberOfLines={1}>{featured.event.location}</Text>
                        </View>
                      )}
                    </View>
                    <View className="px-3 py-1.5 rounded-full flex-row items-center" style={{ backgroundColor: themeColor + "20" }}>
                      <Users size={14} color={themeColor} />
                      <Text className="font-bold ml-1" style={{ color: themeColor }}>{featured.event.attendeeCount}</Text>
                    </View>
                  </View>
                </Pressable>
              </Animated.View>
            )}

            {/* ═══ Section A: Traction ═══ */}
            <Animated.View entering={FadeInDown.duration(240)} className="mb-1">
              <Pressable onPress={() => toggleSection("traction")} className="flex-row items-center justify-between mb-1">
                <View className="flex-row items-center flex-1">
                  <Users size={15} color={themeColor} />
                  <Text className="font-semibold ml-2 text-sm" style={{ color: colors.text }}>
                    Gaining traction
                  </Text>
                  {tractionTotal > 0 && (
                    <View className="ml-2 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: themeColor + "18" }}>
                      <Text className="text-xs font-medium" style={{ color: themeColor }}>{tractionTotal}</Text>
                    </View>
                  )}
                </View>
                <View className="flex-row items-center">
                  {tractionTotal > 0 && (
                    <Pressable onPress={() => handleViewAll("traction", tractionTotal)} hitSlop={8} className="mr-2">
                      <Text className="text-xs" style={{ color: colors.textTertiary }}>View all</Text>
                    </Pressable>
                  )}
                  {collapsed.traction ? <ChevronDown size={14} color={colors.textTertiary} /> : <ChevronUp size={14} color={colors.textTertiary} />}
                </View>
              </Pressable>
              <Text className="text-xs ml-7 mb-2" style={{ color: colors.textTertiary }}>Events picking up momentum</Text>
            </Animated.View>
            {!collapsed.traction && (
              tractionPreview.length > 0 ? (
                tractionPreview.map((e, i) => renderEventCard(e, i, 40))
              ) : (
                <Animated.View entering={FadeInDown.delay(40).duration(240)} className="mb-3">
                  <Pressable
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/invite"); }}
                    className="flex-row items-center rounded-lg px-4 py-3"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
                  >
                    <Users size={14} color={colors.textTertiary} />
                    <Text className="text-sm flex-1 ml-2" style={{ color: colors.textTertiary }}>No traction yet</Text>
                    <Text className="text-xs font-medium" style={{ color: themeColor }}>Invite</Text>
                  </Pressable>
                </Animated.View>
              )
            )}

            {/* ═══ Section B: Trending ═══ */}
            <Animated.View entering={FadeInDown.delay(120).duration(240)} className="mb-1 mt-3">
              <Pressable onPress={() => toggleSection("trending")} className="flex-row items-center justify-between mb-1">
                <View className="flex-row items-center flex-1">
                  <TrendingUp size={15} color={themeColor} />
                  <Text className="font-semibold ml-2 text-sm" style={{ color: colors.text }}>
                    Trending
                  </Text>
                  {trendingTotal > 0 && (
                    <View className="ml-2 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: themeColor + "18" }}>
                      <Text className="text-xs font-medium" style={{ color: themeColor }}>{trendingTotal}</Text>
                    </View>
                  )}
                </View>
                <View className="flex-row items-center">
                  {trendingTotal > 0 && (
                    <Pressable onPress={() => handleViewAll("trending", trendingTotal)} hitSlop={8} className="mr-2">
                      <Text className="text-xs" style={{ color: colors.textTertiary }}>View all</Text>
                    </Pressable>
                  )}
                  {collapsed.trending ? <ChevronDown size={14} color={colors.textTertiary} /> : <ChevronUp size={14} color={colors.textTertiary} />}
                </View>
              </Pressable>
              <Text className="text-xs ml-7 mb-2" style={{ color: colors.textTertiary }}>Most active right now</Text>
            </Animated.View>
            {!collapsed.trending && (
              trendingPreview.length > 0 ? (
                trendingPreview.map((e, i) => renderEventCard(e, i, 160))
              ) : (
                <Animated.View entering={FadeInDown.delay(160).duration(240)} className="mb-3">
                  <View className="flex-row items-center rounded-lg px-4 py-3" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}>
                    <TrendingUp size={14} color={colors.textTertiary} />
                    <Text className="text-sm flex-1 ml-2" style={{ color: colors.textTertiary }}>Nothing trending yet</Text>
                  </View>
                </Animated.View>
              )
            )}

            {/* ═══ Section C: Recently Created ═══ */}
            <Animated.View entering={FadeInDown.delay(240).duration(240)} className="mb-1 mt-3">
              <Pressable onPress={() => toggleSection("recent")} className="flex-row items-center justify-between mb-1">
                <View className="flex-row items-center flex-1">
                  <Plus size={15} color={themeColor} />
                  <Text className="font-semibold ml-2 text-sm" style={{ color: colors.text }}>
                    New
                  </Text>
                  {recentTotal > 0 && (
                    <View className="ml-2 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: themeColor + "18" }}>
                      <Text className="text-xs font-medium" style={{ color: themeColor }}>{recentTotal}</Text>
                    </View>
                  )}
                </View>
                <View className="flex-row items-center">
                  {recentTotal > 0 && (
                    <Pressable onPress={() => handleViewAll("recent", recentTotal)} hitSlop={8} className="mr-2">
                      <Text className="text-xs" style={{ color: colors.textTertiary }}>View all</Text>
                    </Pressable>
                  )}
                  {collapsed.recent ? <ChevronDown size={14} color={colors.textTertiary} /> : <ChevronUp size={14} color={colors.textTertiary} />}
                </View>
              </Pressable>
              <Text className="text-xs ml-7 mb-2" style={{ color: colors.textTertiary }}>Just created</Text>
            </Animated.View>
            {!collapsed.recent && (
              recentPreview.length > 0 ? (
                recentPreview.map((e, i) => renderEventCard(e, i, 280))
              ) : (
                <Animated.View entering={FadeInDown.delay(280).duration(240)} className="mb-3">
                  <Pressable
                    onPress={() => {
                      if (!guardEmailVerification(session)) return;
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push("/create");
                    }}
                    className="flex-row items-center rounded-lg px-4 py-3"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
                  >
                    <Plus size={14} color={colors.textTertiary} />
                    <Text className="text-sm flex-1 ml-2" style={{ color: colors.textTertiary }}>No new events yet</Text>
                    <Text className="text-xs font-medium" style={{ color: themeColor }}>Create</Text>
                  </Pressable>
                </Animated.View>
              )
            )}
          </>
        )}
      </ScrollView>

      <BottomNavigation />
    </SafeAreaView>
  );
}
