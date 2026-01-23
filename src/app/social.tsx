import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, usePathname } from "expo-router";
import { MapPin, Clock, UserPlus, ChevronRight, Calendar, Share2, Mail, X } from "@/ui/icons";
import Animated, { FadeInDown, FadeIn, FadeOut } from "react-native-reanimated";
import * as SplashScreen from "expo-splash-screen";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import BottomNavigation from "@/components/BottomNavigation";
import { ShareAppButton } from "@/components/ShareApp";
import { FeedSkeleton } from "@/components/SkeletonLoader";
import { EmptyState } from "@/components/EmptyState";
import { QuickEventButton } from "@/components/QuickEventButton";
import { SocialProof } from "@/components/SocialProof";
import { FeedCalendar } from "@/components/FeedCalendar";
import { AuthErrorUI } from "@/components/AuthErrorUI";
import { useSession } from "@/lib/useSession";
import { authClient } from "@/lib/authClient";
import { api } from "@/lib/api";
import { useTheme, DARK_COLORS } from "@/lib/ThemeContext";
import { useNotifications } from "@/hooks/useNotifications";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { resetSession } from "@/lib/authBootstrap";
import { setLogoutIntent } from "@/lib/logoutIntent";
import { clearSessionCache } from "@/lib/sessionCache";
import { AuthProvider } from "@/lib/AuthContext";
import { FirstValueNudge, canShowFirstValueNudge, markFirstValueNudgeDismissed } from "@/components/FirstValueNudge";
import { PostEventRepeatNudge, canShowPostEventRepeatNudge, markPostEventRepeatNudgeCompleted } from "@/components/PostEventRepeatNudge";
import { SocialMemoryCard } from "@/components/SocialMemoryCard";
import { type GetEventsFeedResponse, type GetEventsResponse, type Event, type GetFriendsResponse } from "@/shared/contracts";

function EventCard({ event, index, isOwn, themeColor, isDark, colors, userImage, userName }: {
  event: Event;
  index: number;
  isOwn?: boolean;
  themeColor: string;
  isDark: boolean;
  colors: typeof DARK_COLORS;
  userImage?: string | null;
  userName?: string | null;
}) {
  const router = useRouter();
  const startDate = new Date(event.startTime);
  const endDate = event.endTime ? new Date(event.endTime) : null;

  const dateLabel = startDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  // Show time range if endTime exists
  const timeLabel = endDate
    ? `${startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : startDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/event/${event.id}` as any);
  };

  // For own events, use the passed user image/name; otherwise use event.user data
  const displayImage = isOwn ? userImage : event.user?.image;
  const displayName = isOwn ? userName : event.user?.name;

  // Get accepted attendees for social proof
  const acceptedAttendees = event.joinRequests?.filter((r) => r.status === "accepted") ?? [];
  const attendeesList = acceptedAttendees.map((r) => ({
    id: r.userId,
    name: r.user?.name ?? "Unknown",
    image: r.user?.image ?? null,
  }));

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <Pressable
        onPress={handlePress}
        className="rounded-2xl p-4 mb-3"
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: isOwn ? `${themeColor}40` : colors.border,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0.2 : 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <View className="flex-row items-start">
          <View
            className="w-14 h-14 rounded-xl items-center justify-center mr-3"
            style={{ backgroundColor: isOwn ? `${themeColor}20` : isDark ? "#2C2C2E" : "#FFF7ED" }}
          >
            <Text className="text-2xl">{event.emoji}</Text>
          </View>
          <View className="flex-1">
            <View className="flex-row items-center">
              <Text style={{ color: colors.text }} className="text-lg font-sora-semibold flex-1" numberOfLines={1}>
                {event.title}
              </Text>
              {isOwn && (
                <View className="px-2 py-0.5 rounded-full ml-2" style={{ backgroundColor: `${themeColor}20` }}>
                  <Text style={{ color: themeColor }} className="text-xs font-medium">You</Text>
                </View>
              )}
            </View>
            {event.description && (
              <Text
                style={{ color: colors.textSecondary }}
                className="text-sm mt-0.5"
                numberOfLines={2}
              >
                {event.description}
              </Text>
            )}
            <View className="flex-row items-center mt-1">
              <View className="w-6 h-6 rounded-full mr-2 overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
                {displayImage ? (
                  <Image source={{ uri: displayImage }} className="w-full h-full" />
                ) : (
                  <View className="w-full h-full items-center justify-center" style={{ backgroundColor: `${themeColor}20` }}>
                    <Text style={{ color: themeColor }} className="text-xs font-medium">
                      {displayName?.[0] ?? "?"}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ color: colors.textSecondary }} className="text-sm">
                {isOwn ? "Your event" : event.user?.name ?? "Someone"}
              </Text>
            </View>
          </View>
          <ChevronRight size={20} color={colors.textTertiary} />
        </View>

        <View className="flex-row mt-3 pt-3 flex-wrap" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
          <View className="flex-row items-center mr-4">
            <Calendar size={14} color="#9CA3AF" />
            <Text style={{ color: colors.textSecondary, fontSize: 14 }} className="ml-1">{dateLabel}</Text>
          </View>
          <View className="flex-row items-center mr-4">
            <Clock size={14} color={themeColor} />
            <Text style={{ color: colors.textSecondary, fontSize: 14 }} className="ml-1">{timeLabel}</Text>
          </View>
          {event.location && (
            <View className="flex-row items-center flex-1">
              <MapPin size={14} color="#4ECDC4" />
              <Text style={{ color: colors.textSecondary, fontSize: 14 }} className="ml-1" numberOfLines={1}>
                {event.location}
              </Text>
            </View>
          )}
        </View>

        {/* Social Proof - Friends Going */}
        {attendeesList.length > 0 && (
          <View className="mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
            <SocialProof
              attendees={attendeesList}
              totalCount={attendeesList.length}
              maxDisplay={3}
              size="small"
            />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

interface GroupedEvents {
  today: Event[];
  tomorrow: Event[];
  thisWeek: Event[];
  upcoming: Event[];
}

function groupEventsByTime(events: Event[], userId?: string): GroupedEvents {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);
  const endOfWeek = new Date(today.getTime() + 7 * 86400000);

  const grouped: GroupedEvents = {
    today: [],
    tomorrow: [],
    thisWeek: [],
    upcoming: [],
  };

  // Sort events by start time
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  sortedEvents.forEach((event) => {
    const eventDate = new Date(event.startTime);
    const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

    if (eventDay.getTime() === today.getTime()) {
      grouped.today.push(event);
    } else if (eventDay.getTime() === tomorrow.getTime()) {
      grouped.tomorrow.push(event);
    } else if (eventDay > tomorrow && eventDay < endOfWeek) {
      grouped.thisWeek.push(event);
    } else if (eventDay >= endOfWeek) {
      grouped.upcoming.push(event);
    }
  });

  return grouped;
}

function EventSection({
  title,
  events,
  startIndex,
  userId,
  themeColor,
  isDark,
  colors,
  userImage,
  userName,
}: {
  title: string;
  events: Event[];
  startIndex: number;
  userId?: string;
  themeColor: string;
  isDark: boolean;
  colors: typeof DARK_COLORS;
  userImage?: string | null;
  userName?: string | null;
}) {
  if (events.length === 0) return null;

  return (
    <View className="mb-4">
      <Text style={{ color: colors.text }} className="text-lg font-sora-semibold mb-3">{title}</Text>
      {events.map((event, index) => (
        <EventCard
          key={event.id}
          event={event}
          index={startIndex + index}
          isOwn={event.userId === userId}
          themeColor={themeColor}
          isDark={isDark}
          colors={colors}
          userImage={userImage}
          userName={userName}
        />
      ))}
    </View>
  );
}

function EmptyFeed() {
  const router = useRouter();

  return (
    <EmptyState
      type="events"
      actionLabel="Create Event"
      onAction={() => router.push("/create")}
    />
  );
}

// Soft banner for users who deferred email verification
function VerificationBanner({
  onDismiss,
  themeColor,
  colors,
}: {
  onDismiss: () => void;
  themeColor: string;
  colors: typeof DARK_COLORS;
}) {
  const router = useRouter();

  const handleVerify = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/settings");
  };

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      className="mx-5 mb-4 rounded-2xl p-4"
      style={{
        backgroundColor: `${themeColor}15`,
        borderWidth: 1,
        borderColor: `${themeColor}30`,
      }}
    >
      <View className="flex-row items-start">
        <View
          className="w-10 h-10 rounded-xl items-center justify-center mr-3"
          style={{ backgroundColor: `${themeColor}25` }}
        >
          <Mail size={20} color={themeColor} />
        </View>
        <View className="flex-1">
          <Text style={{ color: colors.text }} className="text-sm font-sora-semibold">
            Verify your email
          </Text>
          <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">
            Verify to host events and invite friends.
          </Text>
        </View>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          className="p-1"
        >
          <X size={18} color={colors.textTertiary} />
        </Pressable>
      </View>
      <Pressable
        onPress={handleVerify}
        className="mt-3 py-2.5 rounded-xl items-center"
        style={{ backgroundColor: themeColor }}
      >
        <Text className="text-white text-sm font-sora-semibold">
          Verify Now
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export default function SocialScreen() {
  const { data: session, isPending: sessionLoading } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const [authBootstrapState, setAuthBootstrapState] = useState<"checking" | "error" | "ready">("checking");
  const [authBootstrapError, setAuthBootstrapError] = useState<{ error?: string; timedOut?: boolean }>();
  const [showVerificationBanner, setShowVerificationBanner] = useState(false);
  const [showFirstValueNudge, setShowFirstValueNudge] = useState(false);
  const [showPostEventRepeatNudge, setShowPostEventRepeatNudge] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const hasBootstrapped = useRef(false);

  // Auth gating based on boot status (token validation), not session presence
  const isAuthed = bootStatus === "authed";

  // Redirect non-authed users to appropriate auth screen
  useEffect(() => {
    if (bootStatus === 'onboarding') {
      router.replace('/welcome');
    } else if (bootStatus === 'loggedOut' || bootStatus === 'error') {
      router.replace('/login');
    }
  }, [bootStatus, router]);

  // NOTE: useRevenueCatSync is called in _layout.tsx BootRouter (single global call)

  // Initialize push notifications - registers token and sets up listeners
  useNotifications();

  // Check verification deferred status
  useEffect(() => {
    const checkVerificationStatus = async () => {
      try {
        const deferred = await AsyncStorage.getItem("verification_deferred");
        const dismissed = await AsyncStorage.getItem("verification_banner_dismissed");
        if (deferred === "true" && dismissed !== "true") {
          setShowVerificationBanner(true);
        }
      } catch (error) {
        // Ignore errors
      }
    };
    checkVerificationStatus();
  }, []);

  const handleDismissBanner = useCallback(async () => {
    setShowVerificationBanner(false);
    try {
      await AsyncStorage.setItem("verification_banner_dismissed", "true");
    } catch (error) {
      // Ignore
    }
  }, []);

  // Bootstrap authentication on mount
  useEffect(() => {
    // GUARD: Only validate if BootRouter has already determined we're authed.
    // Auth truth source is bootStatus (token validation), not session presence.
    if (isAuthed) {
      // bootStatus confirms token is valid
      console.log("[SocialScreen] Auth confirmed via bootStatus; setting bootstrap state to ready");
      setAuthBootstrapState("ready");
    }
  }, [isAuthed]);

  // Handle retry button
  const handleRetry = useCallback(() => {
    console.log("[SocialScreen] Retrying bootstrap...");
    hasBootstrapped.current = false;
    setAuthBootstrapState("checking");
    setAuthBootstrapError(undefined);
  }, []);

  // Handle reset session button
  const handleResetSession = useCallback(async () => {
    if (__DEV__) {
      console.log("[Logout] begin");
    }
    try {
      // Standardized logout sequence
      setLogoutIntent();
      await resetSession({ reason: "user_logout", endpoint: "SocialScreen" });
      if (__DEV__) {
        console.log("[Logout] after resetSession");
      }

      // Cancel all pending queries
      await queryClient.cancelQueries();
      if (__DEV__) {
        console.log("[Logout] after cancelQueries");
      }

      // Clear React Query cache
      queryClient.clear();
      if (__DEV__) {
        console.log("[Logout] after queryClient.clear");
      }

      // Reset boot authority singleton to trigger bootStatus update to 'loggedOut'
      const { resetBootAuthority } = await import("@/hooks/useBootAuthority");
      resetBootAuthority();
      if (__DEV__) {
        console.log("[Logout] Boot authority reset");
      }
    } catch (error) {
      console.error("[SocialScreen] Error during logout:", error);
      // Try to clear cache anyway
      try {
        await queryClient.cancelQueries();
        queryClient.clear();
        const { resetBootAuthority } = await import("@/hooks/useBootAuthority");
        resetBootAuthority();
      } catch (e) {
        // ignore
      }
    }

    // Hard transition to login
    if (__DEV__) {
      console.log("[Logout] navigating to /login");
    }
    router.replace("/login");
  }, [queryClient, router]);

  // Fetch friend events (feed)
  const {
    data: feedData,
    isLoading: feedLoading,
    refetch: refetchFeed,
    isRefetching: isRefetchingFeed,
  } = useQuery({
    queryKey: ["events", "feed"],
    queryFn: () => api.get<GetEventsFeedResponse>("/api/events/feed"),
    enabled: isAuthed,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchIntervalInBackground: false, // Stop polling when app is backgrounded
  });

  // Also fetch user's own events
  const {
    data: myEventsData,
    isLoading: myEventsLoading,
    refetch: refetchMyEvents,
    isRefetching: isRefetchingMyEvents,
  } = useQuery({
    queryKey: ["events", "mine"],
    queryFn: () => api.get<GetEventsResponse>("/api/events"),
    enabled: isAuthed,
    refetchInterval: 30000,
    refetchIntervalInBackground: false, // Stop polling when app is backgrounded
  });

  // Fetch events user is attending
  const {
    data: attendingData,
    isLoading: attendingLoading,
    refetch: refetchAttending,
    isRefetching: isRefetchingAttending,
  } = useQuery({
    queryKey: ["events", "attending"],
    queryFn: () => api.get<GetEventsResponse>("/api/events/attending"),
    enabled: isAuthed,
    refetchInterval: 30000,
    refetchIntervalInBackground: false, // Stop polling when app is backgrounded
  });

  // Fetch friends for first-value nudge eligibility
  const {
    data: friendsData,
    isLoading: friendsLoading,
  } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: isAuthed,
  });

  // Business events feature is disabled (feature flag: businessAccounts = false)
  // Provide empty fallback to prevent network calls
  const businessEventsData = undefined;

  // Check if user is eligible for first-value nudge
  const isFirstValueNudgeEligible = (() => {
    // Only eligible if authed
    if (bootStatus !== 'authed') return false;
    
    // Check if user has zero social connections and events
    const hasFriends = (friendsData?.friends?.length ?? 0) > 0;
    const hasCreatedEvents = (myEventsData?.events?.length ?? 0) > 0;
    const hasAttendingEvents = (attendingData?.events?.length ?? 0) > 0;
    
    return !hasFriends && !hasCreatedEvents && !hasAttendingEvents;
  })();

  // Show first-value nudge if eligible and not loading
  useEffect(() => {
    const checkFirstValueNudge = async () => {
      if (!isAuthed || !isFirstValueNudgeEligible) return;
      if (feedLoading || myEventsLoading || attendingLoading || friendsLoading) return;

      const canShow = await canShowFirstValueNudge();
      if (canShow) {
        setShowFirstValueNudge(true);
      }
    };

    checkFirstValueNudge();
  }, [isAuthed, isFirstValueNudgeEligible, feedLoading, myEventsLoading, attendingLoading, friendsLoading]);

  // Show post-event repeat nudge for ended events
  useEffect(() => {
    const checkPostEventRepeatNudge = async () => {
      if (!isAuthed) return;
      if (feedLoading || myEventsLoading || attendingLoading || friendsLoading) return;
      if (showFirstValueNudge) return; // Don't show if first-value nudge is active

      const now = Date.now();
      const eligibleEvents: { event: Event; type: 'hosted' | 'attended' }[] = [];

      // Check hosted events
      const myEvents = myEventsData?.events ?? [];
      myEvents.forEach(event => {
        if (event.endTime) {
          const endTime = new Date(event.endTime).getTime();
          const timeSinceEnd = now - endTime;
          const thirtyMinutes = 30 * 60 * 1000;
          const twentyFourHours = 24 * 60 * 60 * 1000;
          
          if (timeSinceEnd >= thirtyMinutes && timeSinceEnd <= twentyFourHours) {
            eligibleEvents.push({ event, type: 'hosted' });
          }
        }
      });

      // Check attended events
      const attendedEvents = attendingData?.events ?? [];
      attendedEvents.forEach(event => {
        if (event.endTime) {
          const endTime = new Date(event.endTime).getTime();
          const timeSinceEnd = now - endTime;
          const thirtyMinutes = 30 * 60 * 1000;
          const twentyFourHours = 24 * 60 * 60 * 1000;
          
          if (timeSinceEnd >= thirtyMinutes && timeSinceEnd <= twentyFourHours) {
            eligibleEvents.push({ event, type: 'attended' });
          }
        }
      });

      // Find the most recent eligible event
      if (eligibleEvents.length > 0) {
        const sortedEvents = eligibleEvents.sort((a, b) => {
          const aEnd = new Date(a.event.endTime!).getTime();
          const bEnd = new Date(b.event.endTime!).getTime();
          return bEnd - aEnd; // Most recent first
        });

        const mostRecentEvent = sortedEvents[0];
        const canShow = await canShowPostEventRepeatNudge(mostRecentEvent.event.id);
        
        if (canShow) {
          setSelectedEventId(mostRecentEvent.event.id);
          setShowPostEventRepeatNudge(true);
        }
      }
    };

    checkPostEventRepeatNudge();
  }, [isAuthed, feedLoading, myEventsLoading, attendingLoading, friendsLoading, showFirstValueNudge, myEventsData, attendingData]);

  // Derive social memory from existing data patterns
  const socialMemory = useMemo(() => {
    if (bootStatus !== 'authed' || feedLoading || myEventsLoading || attendingLoading || friendsLoading) {
      return null;
    }

    const attendingEvents = attendingData?.events || [];
    const myEvents = myEventsData?.events || [];
    const friends = friendsData?.friends || [];

    // Pattern 1: Frequent Event Attendance (≥2 events attending)
    if (attendingEvents.length >= 2) {
      const eventTypes = attendingEvents.map(e => e.title.toLowerCase());
      const hasRepeatedTypes = eventTypes.some(type => 
        eventTypes.filter(t => t.includes(type.split(' ')[0]) || type.includes(t.split(' ')[0])).length > 1
      );
      
      if (hasRepeatedTypes) {
        return {
          memory: "You have a pattern of joining events that align with your interests. Your social connections are building around shared experiences.",
          type: 'events' as const
        };
      } else {
        return {
          memory: "You're exploring diverse social experiences. Each event you join adds a new dimension to your social identity.",
          type: 'events' as const
        };
      }
    }

    // Pattern 2: Active Event Hosting (≥2 events created)
    if (myEvents.length >= 2) {
      const recentEvents = myEvents.filter(e => 
        new Date(e.startTime) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      );
      
      if (recentEvents.length >= 1) {
        return {
          memory: "You're becoming a social catalyst in your community. People look forward to the experiences you create.",
          type: 'hosting' as const
        };
      } else {
        return {
          memory: "Your hosting journey is creating lasting memories for others. Each event you organize strengthens your community.",
          type: 'hosting' as const
        };
      }
    }

    // Pattern 3: Growing Social Network (≥2 friends)
    if (friends.length >= 2) {
      return {
        memory: "Your social circle is growing meaningfully. Each connection represents a shared moment and potential for deeper friendship.",
        type: 'friends' as const
      };
    }

    // No qualifying patterns found
    return null;
  }, [bootStatus, feedLoading, myEventsLoading, attendingLoading, friendsLoading, attendingData, myEventsData, friendsData]);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // Combine and deduplicate events
  const allEvents = useMemo(() => {
    const feedEvents = feedData?.events ?? [];
    const myEvents = myEventsData?.events ?? [];
    const attendingEvents = attendingData?.events ?? [];

    // Create a map to deduplicate by event ID
    const eventMap = new Map<string, Event>();

    // Add my events first (so they show as "own")
    myEvents.forEach((event) => {
      eventMap.set(event.id, event);
    });

    // Add attending events
    attendingEvents.forEach((event) => {
      if (!eventMap.has(event.id)) {
        eventMap.set(event.id, event);
      }
    });

    // Add feed events (won't override my events or attending events)
    feedEvents.forEach((event) => {
      if (!eventMap.has(event.id)) {
        eventMap.set(event.id, event);
      }
    });

    return Array.from(eventMap.values());
  }, [feedData?.events, myEventsData?.events, attendingData?.events]);

  // Prepare events for calendar with metadata
  const calendarEvents = useMemo(() => {
    const myEventIds = new Set(myEventsData?.events?.map((e) => e.id) ?? []);
    const attendingEventIds = new Set(attendingData?.events?.map((e) => e.id) ?? []);

    return allEvents.map((event) => ({
      ...event,
      isOwn: myEventIds.has(event.id),
      isAttending: attendingEventIds.has(event.id),
      hostName: event.user?.name ?? null,
      hostImage: event.user?.image ?? null,
    }));
  }, [allEvents, myEventsData?.events, attendingData?.events]);

  // Group events by time
  const groupedEvents = useMemo(
    () => groupEventsByTime(allEvents, session?.user?.id),
    [allEvents, session?.user?.id]
  );

  const handleRefresh = () => {
    refetchFeed();
    refetchMyEvents();
    refetchAttending();
  };

  // Post-event repeat nudge handlers
  const handlePostEventRepeatNudgePrimary = async () => {
    if (selectedEventId) {
      await markPostEventRepeatNudgeCompleted(selectedEventId);
    }
    setShowPostEventRepeatNudge(false);
    setSelectedEventId(null);
    router.push("/create");
  };

  const handlePostEventRepeatNudgeSecondary = async () => {
    if (selectedEventId) {
      await markPostEventRepeatNudgeCompleted(selectedEventId);
    }
    setShowPostEventRepeatNudge(false);
    setSelectedEventId(null);
    router.push("/social");
  };

  const handlePostEventRepeatNudgeDismiss = async () => {
    if (selectedEventId) {
      await markPostEventRepeatNudgeCompleted(selectedEventId);
    }
    setShowPostEventRepeatNudge(false);
    setSelectedEventId(null);
  };

  const isRefreshing = isRefetchingFeed || isRefetchingMyEvents || isRefetchingAttending;
  const isLoading = feedLoading || myEventsLoading || attendingLoading;

  // Render loading state for non-authed states (redirect useEffect handles routing)
  // Keep BottomNavigation visible for escape route
  if (bootStatus === 'loading' || bootStatus === 'loggedOut' || bootStatus === 'error' || bootStatus === 'onboarding') {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textTertiary }}>Loading...</Text>
        </View>
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  if (sessionLoading) {
    return (
      <AuthProvider state="checking">
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
          <View className="flex-1 items-center justify-center">
            <Text style={{ color: colors.textTertiary }}>Loading...</Text>
          </View>
          <BottomNavigation />
        </SafeAreaView>
      </AuthProvider>
    );
  }

  // Show error UI if bootstrap failed
  if (authBootstrapState === "error") {
    return (
      <AuthProvider state="error">
        <AuthErrorUI
          error={authBootstrapError?.error}
          timedOut={authBootstrapError?.timedOut}
          onRetry={handleRetry}
          onReset={handleResetSession}
        />
      </AuthProvider>
    );
  }

  // Show loading while checking auth state
  if (authBootstrapState === "checking") {
    return (
      <AuthProvider state="checking">
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
          <View className="flex-1 items-center justify-center">
            <Text style={{ color: colors.textTertiary }}>Loading...</Text>
          </View>
        </SafeAreaView>
      </AuthProvider>
    );
  }

  const hasEvents =
    groupedEvents.today.length > 0 ||
    groupedEvents.tomorrow.length > 0 ||
    groupedEvents.thisWeek.length > 0 ||
    groupedEvents.upcoming.length > 0;

  return (
    <AuthProvider state="authed">
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
        <View className="px-5 pt-2 pb-4 flex-row items-center justify-between">
        <View>
          <Text style={{ color: colors.text }} className="text-3xl font-sora-bold">Open Invites</Text>
          <Text style={{ color: colors.textSecondary }} className="mt-1 font-sora">See what's happening</Text>
        </View>
        <View className="flex-row items-center">
          <ShareAppButton variant="icon" />
        </View>
      </View>

      {/* Micro Social Proof Line */}
      {!isLoading && allEvents.length > 0 && (
        <View className="px-5 pb-3">
          <Text
            style={{ color: colors.textSecondary }}
            className="text-sm"
            accessibilityLabel={`${allEvents.length} ${allEvents.length === 1 ? 'plan' : 'plans'} happening soon`}
          >
            {allEvents.length} {allEvents.length === 1 ? 'plan' : 'plans'} happening soon
          </Text>
        </View>
      )}

      {/* Verification banner for users who deferred email verification */}
      {showVerificationBanner && (
        <VerificationBanner
          onDismiss={handleDismissBanner}
          themeColor={themeColor}
          colors={colors}
        />
      )}

      {isLoading ? (
        <FeedSkeleton />
      ) : !hasEvents ? (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {socialMemory && (
            <SocialMemoryCard
              memory={socialMemory.memory}
              type={socialMemory.type}
              themeColor={themeColor}
              isDark={isDark}
              colors={colors}
            />
          )}
          <FeedCalendar
            events={calendarEvents}
            businessEvents={undefined}
            themeColor={themeColor}
            isDark={isDark}
            colors={colors}
            userId={session?.user?.id}
          />
          <View className="py-12 items-center px-8">
            <Text className="text-5xl mb-4">📅</Text>
            <Text className="text-xl font-semibold text-center mb-2" style={{ color: colors.text }}>
              No Open Invites yet
            </Text>
            <Text className="text-center mb-6" style={{ color: colors.textSecondary }}>
              This feed shows plans your friends are opening up
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push("/create");
              }}
              className="px-6 py-3 rounded-full"
              style={{ backgroundColor: themeColor }}
            >
              <Text className="text-white font-semibold">Create an Open Invite</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={themeColor}
            />
          }
        >
          <FeedCalendar
            events={calendarEvents}
            businessEvents={undefined}
            themeColor={themeColor}
            isDark={isDark}
            colors={colors}
            userId={session?.user?.id}
          />
          {socialMemory && (
            <SocialMemoryCard
              memory={socialMemory.memory}
              type={socialMemory.type}
              themeColor={themeColor}
              isDark={isDark}
              colors={colors}
            />
          )}
          <EventSection
            title="Today"
            events={groupedEvents.today}
            startIndex={0}
            userId={session?.user?.id}
            themeColor={themeColor}
            isDark={isDark}
            colors={colors}
            userImage={session?.user?.image}
            userName={session?.user?.name}
          />
          <EventSection
            title="Tomorrow"
            events={groupedEvents.tomorrow}
            startIndex={groupedEvents.today.length}
            userId={session?.user?.id}
            themeColor={themeColor}
            isDark={isDark}
            colors={colors}
            userImage={session?.user?.image}
            userName={session?.user?.name}
          />
          <EventSection
            title="This Week"
            events={groupedEvents.thisWeek}
            startIndex={groupedEvents.today.length + groupedEvents.tomorrow.length}
            userId={session?.user?.id}
            themeColor={themeColor}
            isDark={isDark}
            colors={colors}
            userImage={session?.user?.image}
            userName={session?.user?.name}
          />
          <EventSection
            title="Upcoming"
            events={groupedEvents.upcoming}
            startIndex={
              groupedEvents.today.length +
              groupedEvents.tomorrow.length +
              groupedEvents.thisWeek.length
            }
            userId={session?.user?.id}
            themeColor={themeColor}
            isDark={isDark}
            colors={colors}
            userImage={session?.user?.image}
            userName={session?.user?.name}
          />
        </ScrollView>
      )}

      {/* Quick Event Floating Button */}
      {session && <QuickEventButton />}

      {/* First-Value Nudge for Brand New Users */}
      <FirstValueNudge
        visible={showFirstValueNudge}
        onClose={() => setShowFirstValueNudge(false)}
        onPrimary={() => router.push("/discover")}
        onSecondary={() => router.push("/create")}
      />

      {/* Post-Event Repeat Nudge for Habit Formation */}
      <PostEventRepeatNudge
        visible={showPostEventRepeatNudge}
        onPrimary={handlePostEventRepeatNudgePrimary}
        onSecondary={handlePostEventRepeatNudgeSecondary}
        onDismiss={handlePostEventRepeatNudgeDismiss}
      />

      <BottomNavigation />
      </SafeAreaView>
    </AuthProvider>
  );
}
