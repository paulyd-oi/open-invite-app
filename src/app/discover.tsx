import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter, Stack } from "expo-router";
import {
  MapPin,
  Users,
  Flame,
  Heart,
  ChevronRight,
  Clock,
  Sparkles,
  Plus,
  X,
  TrendingUp,
} from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import BottomNavigation from "@/components/BottomNavigation";

// Response from GET /api/friends/reconnect
interface ReconnectFriend {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  lastHangoutAt: string | null;
  daysSinceHangout: number | null;
}

interface Streak {
  friend: { id: string; name: string | null; image: string | null };
  friendshipId: string;
  totalHangouts: number;
  lastHangout: string | null;
  currentStreak: number;
  longestStreak: number;
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
  joinRequests?: Array<{
    id: string;
    userId: string;
    status: string;
    user: { id: string; name: string | null; image: string | null };
  }>;
}

interface EventTemplate {
  id: string;
  name: string;
  emoji: string;
  duration: number;
  description: string | null;
  isDefault: boolean;
}

type FriendsTab = "suggestions" | "popular" | "streaks";

// 14-day dismiss cooldown for reconnect tiles
const RECONNECT_DISMISS_DAYS = 14;

export default function DiscoverScreen() {
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();

  const [friendsTab, setFriendsTab] = useState<FriendsTab>("popular");
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [dismissedFriendIds, setDismissedFriendIds] = useState<Set<string>>(new Set());

  const { data: reconnectData, isLoading: loadingReconnect, refetch: refetchReconnect } = useQuery({
    queryKey: ["reconnect"],
    queryFn: () => api.get<{ friends: ReconnectFriend[] }>("/api/friends/reconnect"),
    enabled: bootStatus === 'authed',
  });

  const { data: streaksData, isLoading: loadingStreaks, refetch: refetchStreaks } = useQuery({
    queryKey: ["streaks"],
    queryFn: () => api.get<{ streaks: Streak[] }>("/api/events/streaks"),
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

  const { data: templatesData } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.get<{ templates: EventTemplate[] }>("/api/events/templates"),
    enabled: bootStatus === 'authed',
  });

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
  
  const streaks = (streaksData?.streaks ?? []).filter(s => s.friend != null);
  const templates = templatesData?.templates ?? [];

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
    else if (friendsTab === "streaks") refetchStreaks();
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

  const handleTemplatePress = (template: EventTemplate) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowTemplatesModal(false);
    router.push(`/create?template=${template.id}&emoji=${encodeURIComponent(template.emoji)}&title=${encodeURIComponent(template.name)}&duration=${template.duration}` as any);
  };

  const isLoading = friendsTab === "suggestions" ? loadingReconnect : friendsTab === "streaks" ? loadingStreaks : loadingPopular;

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
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowTemplatesModal(true);
            }}
            className="flex-row items-center px-4 py-2 rounded-full"
            style={{ backgroundColor: themeColor }}
          >
            <Plus size={16} color="#fff" />
            <Text className="text-white font-semibold ml-1.5">Quick Event</Text>
          </Pressable>
        </View>

        {/* Tab Selector */}
        <View className="flex-row rounded-xl p-1" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
          {[
            { id: "suggestions", label: "Reconnect", icon: Heart },
            { id: "popular", label: "Popular", icon: TrendingUp },
            { id: "streaks", label: "Streaks", icon: Flame },
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
                  Haven't hung out in a while
                </Text>
              </View>
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
                        onPress={() => router.push(`/profile/${friend.id}` as any)}
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
                        <ChevronRight size={20} color={colors.textTertiary} />
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
                          style={{ backgroundColor: themeColor + "20" }}
                        >
                          <Users size={14} color={themeColor} />
                          <Text className="font-bold ml-1" style={{ color: themeColor }}>
                            {event.attendeeCount}
                          </Text>
                        </View>
                        <Text className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                          going
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
          /* Hangout Streaks */
          <>
            <Animated.View entering={FadeInDown.springify()} className="mb-4">
              <View className="flex-row items-center mb-1">
                <Flame size={16} color="#F97316" />
                <Text className="font-medium ml-2" style={{ color: colors.textSecondary }}>
                  Keep the momentum going
                </Text>
              </View>
            </Animated.View>

            {streaks.length === 0 ? (
              <View
                className="rounded-xl p-8 items-center"
                style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
              >
                <Flame size={40} color={colors.textTertiary} />
                <Text className="mt-4 text-center font-semibold" style={{ color: colors.text }}>
                  No streaks yet
                </Text>
                <Text className="mt-2 text-center" style={{ color: colors.textSecondary }}>
                  Start hanging out with friends to build streaks!
                </Text>
              </View>
            ) : (
              streaks.map((item, index) => (
                <Animated.View
                  key={item.friendshipId}
                  entering={FadeInDown.delay(index * 50).springify()}
                  className="mb-3"
                >
                  <Pressable
                    onPress={() => handleFriendPress(item.friendshipId)}
                    className="rounded-xl p-4"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
                  >
                    <View className="flex-row items-center">
                      <View
                        className="w-14 h-14 rounded-full overflow-hidden mr-4"
                        style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}
                      >
                        {item.friend?.image ? (
                          <Image source={{ uri: item.friend.image }} className="w-full h-full" />
                        ) : (
                          <View
                            className="w-full h-full items-center justify-center"
                            style={{ backgroundColor: themeColor + "30" }}
                          >
                            <Text className="text-xl font-bold" style={{ color: themeColor }}>
                              {item.friend?.name?.[0] ?? "?"}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="font-semibold text-base" style={{ color: colors.text }}>
                          {item.friend?.name ?? "Unknown"}
                        </Text>
                        <Text className="text-sm mt-0.5" style={{ color: colors.textSecondary }}>
                          {item.totalHangouts} hangouts total
                        </Text>
                      </View>
                      <View className="items-end">
                        <View className="flex-row items-center">
                          <Flame size={18} color="#F97316" />
                          <Text className="text-xl font-bold ml-1" style={{ color: "#F97316" }}>
                            {item.currentStreak}
                          </Text>
                        </View>
                        <Text className="text-xs" style={{ color: colors.textTertiary }}>
                          week streak
                        </Text>
                      </View>
                    </View>
                    {item.longestStreak > item.currentStreak && (
                      <View className="mt-2 pt-2 border-t" style={{ borderColor: colors.border }}>
                        <Text className="text-xs" style={{ color: colors.textTertiary }}>
                          Best streak: {item.longestStreak} weeks
                        </Text>
                      </View>
                    )}
                  </Pressable>
                </Animated.View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Quick Event Templates Modal */}
      <Modal
        visible={showTemplatesModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTemplatesModal(false)}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setShowTemplatesModal(false)}
        >
          <Pressable onPress={() => {}}>
            <View
              className="rounded-t-3xl"
              style={{ backgroundColor: colors.surface, maxHeight: "80%" }}
            >
              {/* Handle */}
              <View className="items-center pt-3 pb-2">
                <View className="w-10 h-1 rounded-full" style={{ backgroundColor: colors.border }} />
              </View>

              {/* Header */}
              <View className="flex-row items-center justify-between px-5 pb-4">
                <Text className="text-xl font-bold" style={{ color: colors.text }}>
                  Quick Event
                </Text>
                <Pressable onPress={() => setShowTemplatesModal(false)}>
                  <X size={24} color={colors.textSecondary} />
                </Pressable>
              </View>

              {/* Templates Grid */}
              <ScrollView className="px-5 pb-8" showsVerticalScrollIndicator={false}>
                <View className="flex-row flex-wrap justify-between">
                  {templates.map((template) => (
                    <Pressable
                      key={template.id}
                      onPress={() => handleTemplatePress(template)}
                      className="w-[48%] rounded-xl p-4 mb-3 items-center"
                      style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
                    >
                      <Text className="text-3xl mb-2">{template.emoji}</Text>
                      <Text className="font-semibold" style={{ color: colors.text }}>
                        {template.name}
                      </Text>
                      <Text className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                        {template.duration} min
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Custom Event Button */}
                <Pressable
                  onPress={() => {
                    setShowTemplatesModal(false);
                    router.push("/create");
                  }}
                  className="mt-2 py-4 rounded-xl border"
                  style={{ borderColor: colors.border }}
                >
                  <Text className="text-center font-semibold" style={{ color: themeColor }}>
                    Create Custom Event
                  </Text>
                </Pressable>
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <BottomNavigation />
    </SafeAreaView>
  );
}
