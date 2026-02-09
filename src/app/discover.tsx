import React, { useMemo, useRef, useCallback } from "react";
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

  // ── Section A: Friends Joining (events with 2+ attendees, sorted by attendeeCount desc → recency) ──
  const friendsJoining = useMemo(() => {
    return [...enrichedEvents]
      .filter((e) => e.attendeeCount >= 2)
      .sort((a, b) => b.attendeeCount - a.attendeeCount || new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, 3);
  }, [enrichedEvents]);

  // ── Section B: Trending (highest attendeeCount, exclude Section A picks) ──
  const trending = useMemo(() => {
    const usedIds = new Set(friendsJoining.map((e) => e.id));
    return [...enrichedEvents]
      .filter((e) => !usedIds.has(e.id))
      .sort((a, b) => b.attendeeCount - a.attendeeCount || new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, 3);
  }, [enrichedEvents, friendsJoining]);

  // ── Section C: Recently Created (newest by createdAt, exclude A+B) ──
  const recentlyCreated = useMemo(() => {
    const usedIds = new Set([...friendsJoining, ...trending].map((e) => e.id));
    return [...enrichedEvents]
      .filter((e) => !usedIds.has(e.id))
      .sort((a, b) => new Date(b.createdAt ?? b.startTime).getTime() - new Date(a.createdAt ?? a.startTime).getTime())
      .slice(0, 3);
  }, [enrichedEvents, friendsJoining, trending]);

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
            {/* ═══ Section A: Friends Joining ═══ */}
            <Animated.View entering={FadeInDown.duration(240)} className="mb-2">
              <View className="flex-row items-center mb-3">
                <Users size={16} color={themeColor} />
                <Text className="font-semibold ml-2 text-xs" style={{ color: colors.textTertiary, letterSpacing: 1 }}>
                  EVENTS GAINING TRACTION
                </Text>
              </View>
            </Animated.View>
            {friendsJoining.length > 0 ? (
              friendsJoining.map((e, i) => renderEventCard(e, i, 40))
            ) : (
              <Animated.View entering={FadeInDown.delay(40).duration(240)} className="mb-4">
                <View
                  className="rounded-xl p-5 items-center"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
                >
                  <Text className="text-sm text-center" style={{ color: colors.textTertiary }}>
                    No active events yet — invite someone to start planning.
                  </Text>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push("/invite");
                    }}
                    className="mt-3 px-4 py-2 rounded-full"
                    style={{ backgroundColor: `${themeColor}15` }}
                  >
                    <Text className="text-sm font-medium" style={{ color: themeColor }}>Invite a friend</Text>
                  </Pressable>
                </View>
              </Animated.View>
            )}

            {/* ═══ Section B: Trending ═══ */}
            <Animated.View entering={FadeInDown.delay(120).duration(240)} className="mb-2 mt-2">
              <View className="flex-row items-center mb-3">
                <TrendingUp size={16} color={themeColor} />
                <Text className="font-semibold ml-2 text-xs" style={{ color: colors.textTertiary, letterSpacing: 1 }}>
                  TRENDING WITH YOUR CIRCLE
                </Text>
              </View>
            </Animated.View>
            {trending.length > 0 ? (
              trending.map((e, i) => renderEventCard(e, i, 160))
            ) : (
              <Animated.View entering={FadeInDown.delay(160).duration(240)} className="mb-4">
                <View
                  className="rounded-xl p-5 items-center"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
                >
                  <Text className="text-sm text-center" style={{ color: colors.textTertiary }}>
                    No trending events yet.
                  </Text>
                </View>
              </Animated.View>
            )}

            {/* ═══ Section C: Recently Created ═══ */}
            <Animated.View entering={FadeInDown.delay(240).duration(240)} className="mb-2 mt-2">
              <View className="flex-row items-center mb-3">
                <Plus size={16} color={themeColor} />
                <Text className="font-semibold ml-2 text-xs" style={{ color: colors.textTertiary, letterSpacing: 1 }}>
                  RECENTLY CREATED
                </Text>
              </View>
            </Animated.View>
            {recentlyCreated.length > 0 ? (
              recentlyCreated.map((e, i) => renderEventCard(e, i, 280))
            ) : (
              <Animated.View entering={FadeInDown.delay(280).duration(240)} className="mb-4">
                <View
                  className="rounded-xl p-5 items-center"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
                >
                  <Text className="text-sm text-center" style={{ color: colors.textTertiary }}>
                    No new events — create one to get started.
                  </Text>
                  <Pressable
                    onPress={() => {
                      if (!guardEmailVerification(session)) return;
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push("/create");
                    }}
                    className="mt-3 px-4 py-2 rounded-full"
                    style={{ backgroundColor: `${themeColor}15` }}
                  >
                    <Text className="text-sm font-medium" style={{ color: themeColor }}>Create event</Text>
                  </Pressable>
                </View>
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>

      <BottomNavigation />
    </SafeAreaView>
  );
}
