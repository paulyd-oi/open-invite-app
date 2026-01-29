import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter, Stack } from "expo-router";
import {
  MapPin,
  Users,
  Heart,
  ChevronRight,
  Clock,
  Sparkles,
  Plus,
  X,
  TrendingUp,
  Star,
} from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { guardEmailVerification } from "@/lib/emailVerificationGate";
import BottomNavigation from "@/components/BottomNavigation";

// Response from GET /api/friends/reconnect
interface ReconnectFriend {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  lastHangoutAt: string | null;
  daysSinceHangout: number | null;
}

interface NearbyEvent {
  id: string;
  title: string;
  startTime: string;
  user: { id: string; name: string | null; image: string | null };
}

interface PopularEvent {
  id: string;
  title: string;
  emoji: string;
  startTime: string;
  endTime?: string | null;
  location: string | null;
  user: { id: string; name: string | null; image: string | null };
  attendeeCount: number;
  capacity?: number | null;
  goingCount?: number;
  isFull?: boolean;
  viewerRsvpStatus?: "going" | "not_going" | "interested" | null;
  joinRequests?: Array<{
    id: string;
    userId: string;
    status: string;
    user: { id: string; name: string | null; image: string | null };
  }>;
}

type FriendsTab = "suggestions" | "popular" | "top_friends";

// 14-day dismiss cooldown for reconnect tiles
const RECONNECT_DISMISS_DAYS = 14;

export default function DiscoverScreen() {
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();

  const [friendsTab, setFriendsTab] = useState<FriendsTab>("popular");
  const [dismissedFriendIds, setDismissedFriendIds] = useState<Set<string>>(new Set());

  const { data: reconnectData, isLoading: loadingReconnect, refetch: refetchReconnect } = useQuery({
    queryKey: ["reconnect"],
    queryFn: () => api.get<{ friends: ReconnectFriend[] }>("/api/friends/reconnect"),
    enabled: bootStatus === 'authed',
  });

  // Fetch profile stats for top friends
  const { data: topFriendsData, isLoading: loadingTopFriends, refetch: refetchTopFriends } = useQuery({
    queryKey: ["profile-stats"],
    queryFn: () => api.get<{ topFriends: Array<{ id: string; name: string | null; image: string | null; eventsCount: number }> }>("/api/profile/stats"),
    enabled: bootStatus === 'authed',
  });

  // Fetch feed data for popular events (friends' events)
  const { data: feedData, isLoading: loadingFeed, refetch: refetchFeed } = useQuery({
    queryKey: ["events", "feed"],
    queryFn: () => api.get<{ events: PopularEvent[] }>("/api/events/feed"),
    enabled: bootStatus === 'authed',
  });

  // Fetch user's own events to include in popular tab
  const { data: myEventsData, isLoading: loadingMyEvents, refetch: refetchMyEvents } = useQuery({
    queryKey: ["events", "my-events"],
    queryFn: () => api.get<{ events: PopularEvent[] }>("/api/events"),
    enabled: bootStatus === 'authed',
  });

  const loadingPopular = loadingFeed || loadingMyEvents;
  const refetchPopular = () => {
    refetchFeed();
    refetchMyEvents();
  };

  // Load dismissed friend IDs on mount (check cooldown expiry)
  useEffect(() => {
    const loadDismissedFriends = async () => {
      if (!session?.user?.id) return;
      try {
        const keys = await AsyncStorage.getAllKeys();
        const prefix = `reconnect_dismissed_until::${session.user.id}::`;
        const reconnectKeys = keys.filter(k => k.startsWith(prefix));
        
        const now = Date.now();
        const stillDismissed = new Set<string>();
        
        for (const key of reconnectKeys) {
          const value = await AsyncStorage.getItem(key);
          if (value) {
            const until = parseInt(value, 10);
            if (now < until) {
              // Extract friendId from key
              const friendId = key.replace(prefix, "");
              stillDismissed.add(friendId);
            } else {
              // Expired - clean up
              await AsyncStorage.removeItem(key);
            }
          }
        }
        
        setDismissedFriendIds(stillDismissed);
      } catch (error) {
        // Ignore storage errors
      }
    };
    
    loadDismissedFriends();
  }, [session?.user?.id]);

  // Dismiss a friend from reconnect suggestions for 14 days
  const handleDismissFriend = useCallback(async (friendId: string) => {
    if (!session?.user?.id) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Update local state immediately
    setDismissedFriendIds(prev => new Set([...prev, friendId]));
    
    try {
      const until = Date.now() + RECONNECT_DISMISS_DAYS * 24 * 60 * 60 * 1000;
      await AsyncStorage.setItem(
        `reconnect_dismissed_until::${session.user.id}::${friendId}`,
        until.toString()
      );
    } catch (error) {
      // Ignore storage errors
    }
  }, [session?.user?.id]);

  // Filter out dismissed friends and limit to 15 tiles
  const rawReconnectFriends = reconnectData?.friends ?? [];
  const reconnectFriends = useMemo(() => {
    return rawReconnectFriends
      .filter(f => !dismissedFriendIds.has(f.id))
      .slice(0, 15);
  }, [rawReconnectFriends, dismissedFriendIds]);
  
  const topFriends = topFriendsData?.topFriends ?? [];

  // Filter and sort popular events:
  // - Combine friends' events (feed) with user's own events
  // - Only upcoming events (startTime >= now)
  // - Minimum 2 attendees (accepted join requests)
  // - Sorted by attendee count (most first)
  const popularEvents = useMemo(() => {
    const feedEvents = feedData?.events ?? [];
    const myEvents = myEventsData?.events ?? [];

    // Merge and deduplicate by event ID
    const allEventsMap = new Map<string, PopularEvent>();
    [...feedEvents, ...myEvents].forEach((event) => {
      if (!allEventsMap.has(event.id)) {
        allEventsMap.set(event.id, event);
      }
    });

    return Array.from(allEventsMap.values())
      .map((event) => {
        const attendeeCount = (event.joinRequests?.filter((r) => r.status === "accepted")?.length ?? 0) + 1; // +1 for the host
        return { ...event, attendeeCount };
      })
      .filter((event) => {
        const eventDate = new Date(event.startTime);
        const now = new Date();
        // Only upcoming events and minimum 2 attendees
        return eventDate >= now && event.attendeeCount >= 2;
      })
      .sort((a, b) => b.attendeeCount - a.attendeeCount);
  }, [feedData?.events, myEventsData?.events]);

  const handleRefresh = () => {
    if (friendsTab === "suggestions") refetchReconnect();
    else if (friendsTab === "top_friends") refetchTopFriends();
    else refetchPopular();
  };

  const handleFriendPress = (friendshipId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/friend/${friendshipId}` as any);
  };

  const handleEventPress = (eventId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/event/${eventId}` as any);
  };

  const isLoading = friendsTab === "suggestions" ? loadingReconnect : friendsTab === "top_friends" ? loadingTopFriends : loadingPopular;

  if (!session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in</Text>
        </View>
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="px-5 pt-4 pb-3">
        <View className="flex-row items-center justify-between mb-4">
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

        {/* Tab Selector */}
        <View className="flex-row rounded-xl p-1" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
          {[
            { id: "suggestions", label: "Reconnect", icon: Heart },
            { id: "popular", label: "Popular", icon: TrendingUp },
            { id: "top_friends", label: "Top Friends", icon: Star },
          ].map((tab) => {
            const isActive = friendsTab === tab.id;
            const Icon = tab.icon;
            return (
              <Pressable
                key={tab.id}
                onPress={() => {
                  Haptics.selectionAsync();
                  setFriendsTab(tab.id as FriendsTab);
                }}
                className="flex-1 flex-row items-center justify-center py-2.5 rounded-lg"
                style={{ backgroundColor: isActive ? colors.surface : "transparent" }}
              >
                <Icon size={16} color={isActive ? themeColor : colors.textTertiary} />
                <Text
                  className="font-medium ml-1.5"
                  style={{ color: isActive ? themeColor : colors.textTertiary }}
                >
                  {tab.label}
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
        ) : friendsTab === "suggestions" ? (
          /* Reconnection Suggestions */
          <>
            <Animated.View entering={FadeInDown.springify()} className="mb-4">
              <View className="flex-row items-center mb-1">
                <Sparkles size={16} color={themeColor} />
                <Text className="font-medium ml-2" style={{ color: colors.textSecondary }}>
                  Reconnect
                </Text>
              </View>
              <Text className="text-sm ml-6" style={{ color: colors.textTertiary }}>
                Friends you haven't hung out with in 14+ days
              </Text>
            </Animated.View>

            {reconnectFriends.length === 0 ? (
              <View
                className="rounded-xl p-8 items-center"
                style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
              >
                <Heart size={40} color={colors.textTertiary} />
                <Text className="mt-4 text-center font-semibold" style={{ color: colors.text }}>
                  You're doing great!
                </Text>
                <Text className="mt-2 text-center" style={{ color: colors.textSecondary }}>
                  You've been keeping up with all your friends
                </Text>
              </View>
            ) : (
              reconnectFriends.map((friend, index) => (
                <Animated.View
                  key={friend.id}
                  entering={FadeInDown.delay(index * 50).springify()}
                  className="mb-3"
                >
                  <View
                    className="rounded-xl p-4"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
                  >
                    <View className="flex-row items-center">
                      <Pressable
                        onPress={() => router.push(`/user/${friend.id}` as any)}
                        className="flex-row items-center flex-1"
                      >
                        <View
                          className="w-14 h-14 rounded-full overflow-hidden mr-4"
                          style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}
                        >
                          {friend.avatarUrl ? (
                            <Image source={{ uri: friend.avatarUrl }} className="w-full h-full" />
                          ) : (
                            <View
                              className="w-full h-full items-center justify-center"
                              style={{ backgroundColor: themeColor + "30" }}
                            >
                              <Text className="text-xl font-bold" style={{ color: themeColor }}>
                                {friend.displayName?.[0] ?? "?"}
                              </Text>
                            </View>
                          )}
                        </View>
                        <View className="flex-1">
                          <Text className="font-semibold text-base" style={{ color: colors.text }}>
                            {friend.displayName ?? "Unknown"}
                          </Text>
                          <Text className="text-sm mt-0.5" style={{ color: colors.textSecondary }}>
                            {friend.lastHangoutAt
                              ? `Last event: ${new Date(friend.lastHangoutAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                              : "No events yet"}
                          </Text>
                        </View>
                      </Pressable>
                      {/* Dismiss button */}
                      <Pressable
                        onPress={() => handleDismissFriend(friend.id)}
                        hitSlop={12}
                        className="ml-2 p-1"
                        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                      >
                        <X size={18} color={colors.textTertiary} />
                      </Pressable>
                    </View>
                  </View>
                </Animated.View>
              ))
            )}
          </>
        ) : friendsTab === "popular" ? (
          /* Popular Events */
          <>
            <Animated.View entering={FadeInDown.springify()} className="mb-4">
              <View className="flex-row items-center mb-1">
                <TrendingUp size={16} color={themeColor} />
                <Text className="font-medium ml-2" style={{ color: colors.textSecondary }}>
                  Events your friends are joining
                </Text>
              </View>
            </Animated.View>

            {popularEvents.length === 0 ? (
              <View
                className="rounded-xl p-8 items-center"
                style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
              >
                <TrendingUp size={40} color={colors.textTertiary} />
                <Text className="mt-4 text-center font-semibold" style={{ color: colors.text }}>
                  No popular events right now
                </Text>
                <Text className="mt-2 text-center" style={{ color: colors.textSecondary }}>
                  Events with 2+ people joining will appear here
                </Text>
              </View>
            ) : (
              popularEvents.map((event, index) => (
                <Animated.View
                  key={event.id}
                  entering={FadeInDown.delay(index * 50).springify()}
                  className="mb-3"
                >
                  <Pressable
                    onPress={() => handleEventPress(event.id)}
                    className="rounded-xl p-4"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
                  >
                    <View className="flex-row items-center">
                      {/* Event Emoji */}
                      <View
                        className="w-14 h-14 rounded-xl items-center justify-center mr-4"
                        style={{ backgroundColor: themeColor + "20" }}
                      >
                        <Text className="text-2xl">{event.emoji || "📅"}</Text>
                      </View>

                      <View className="flex-1">
                        <Text className="font-semibold text-base" style={{ color: colors.text }}>
                          {event.title}
                        </Text>
                        <View className="flex-row items-center mt-1">
                          <Clock size={12} color={colors.textTertiary} />
                          <Text className="text-sm ml-1" style={{ color: colors.textSecondary }}>
                            {new Date(event.startTime).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                            {" at "}
                            {event.endTime
                              ? `${new Date(event.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – ${new Date(event.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                              : new Date(event.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
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

                      {/* Attendee Count Badge */}
                      <View className="items-center">
                        <View
                          className="px-3 py-1.5 rounded-full flex-row items-center"
                          style={{ backgroundColor: event.isFull ? "#EF444420" : themeColor + "20" }}
                        >
                          <Users size={14} color={event.isFull ? "#EF4444" : themeColor} />
                          <Text className="font-bold ml-1" style={{ color: event.isFull ? "#EF4444" : themeColor }}>
                            {event.capacity != null
                              ? event.isFull
                                ? "Full"
                                : `${event.goingCount ?? event.attendeeCount}/${event.capacity}`
                              : event.attendeeCount
                            }
                          </Text>
                        </View>
                        <Text className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                          {event.isFull ? `${event.goingCount ?? event.attendeeCount} going` : "going"}
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
              ))
            )}
          </>
        ) : (
          /* Top Friends */
          <>
            <Animated.View entering={FadeInDown.springify()} className="mb-4">
              <View className="flex-row items-center mb-1">
                <Star size={16} color="#FFD700" />
                <Text className="font-medium ml-2" style={{ color: colors.textSecondary }}>
                  Friends you hang out with most
                </Text>
              </View>
            </Animated.View>

            {topFriends.length === 0 ? (
              <View
                className="rounded-xl p-8 items-center"
                style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
              >
                <Star size={40} color={colors.textTertiary} />
                <Text className="mt-4 text-center font-semibold" style={{ color: colors.text }}>
                  No top friends yet
                </Text>
                <Text className="mt-2 text-center" style={{ color: colors.textSecondary }}>
                  Attend events with friends to see who you hang out with most!
                </Text>
              </View>
            ) : (
              topFriends.map((friend, index) => (
                <Animated.View
                  key={friend.id}
                  entering={FadeInDown.delay(index * 50).springify()}
                  className="mb-3"
                >
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push(`/friend/${friend.id}`);
                    }}
                    className="rounded-xl p-4"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
                  >
                    <View className="flex-row items-center">
                      <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: index === 0 ? "#FFD70030" : index === 1 ? "#C0C0C030" : index === 2 ? "#CD7F3230" : `${themeColor}20` }}>
                        <Text className="text-lg">{index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}</Text>
                      </View>
                      <View
                        className="w-14 h-14 rounded-full overflow-hidden mr-4"
                        style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}
                      >
                        {friend.image ? (
                          <Image source={{ uri: friend.image }} className="w-full h-full" />
                        ) : (
                          <View
                            className="w-full h-full items-center justify-center"
                            style={{ backgroundColor: themeColor + "30" }}
                          >
                            <Text className="text-xl font-bold" style={{ color: themeColor }}>
                              {friend.name?.[0] ?? "?"}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="font-semibold text-base" style={{ color: colors.text }}>
                          {friend.name ?? "Unknown"}
                        </Text>
                        <Text className="text-sm mt-0.5" style={{ color: colors.textSecondary }}>
                          {friend.eventsCount} events together
                        </Text>
                      </View>
                      <ChevronRight size={20} color={colors.textTertiary} />
                    </View>
                  </Pressable>
                </Animated.View>
              ))
            )}
          </>
        )}
      </ScrollView>

      <BottomNavigation />
    </SafeAreaView>
  );
}
