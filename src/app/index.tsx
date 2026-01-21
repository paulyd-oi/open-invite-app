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
import { GettingStartedChecklist } from "@/components/GettingStartedChecklist";
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
import { useRevenueCatSync } from "@/hooks/useRevenueCatSync";
import { useNotifications } from "@/hooks/useNotifications";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { resetSession } from "@/lib/authBootstrap";
import { setLogoutIntent } from "@/lib/logoutIntent";
import { clearSessionCache } from "@/lib/sessionCache";
import { AuthProvider } from "@/lib/AuthContext";
import { type GetEventsFeedResponse, type GetEventsResponse, type Event } from "@/shared/contracts";

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

export default function FeedScreen() {
  const { data: session, isPending: sessionLoading } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const [authBootstrapState, setAuthBootstrapState] = useState<"checking" | "error" | "ready">("checking");
  const [authBootstrapError, setAuthBootstrapError] = useState<{ error?: string; timedOut?: boolean }>();
  const [showVerificationBanner, setShowVerificationBanner] = useState(false);
  const hasBootstrapped = useRef(false);
  const didRedirectToWelcomeRef = useRef(false);

  // Auth gating based on boot status (token validation), not session presence
  const isAuthed = bootStatus === "authed";

  // Sync RevenueCat user ID with authentication
  useRevenueCatSync({
    userId: session?.user?.id,
    isLoggedIn: !!session,
  });

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
  // NOTE: Root-level routing based on auth state is now handled by BootRouter in _layout.tsx
  // This effect only validates that we're in the right place and sets internal UI state.
  // If we're already viewing FeedScreen, we trust that BootRouter put us here correctly.
  useEffect(() => {
    // Critical: do not run FeedScreen bootstrap while we are on /welcome or /login.
    // Otherwise FeedScreen can keep bootstrapping in the background.
    if (pathname === "/welcome" || pathname === "/login") {
      return;
    }

    // GUARD: Only validate if BootRouter has already determined we're authed.
    // Auth truth source is bootStatus (token validation), not session presence.
    if (isAuthed) {
      // bootStatus confirms token is valid
      console.log("[FeedScreen] Auth confirmed via bootStatus; setting bootstrap state to ready");
      setAuthBootstrapState("ready");
    }
  }, [isAuthed, pathname]);

  // Handle retry button
  const handleRetry = useCallback(() => {
    console.log("[FeedScreen] Retrying bootstrap...");
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
      setLogoutIntent();
      await resetSession({ reason: "user_logout", endpoint: "FeedScreen" });
      if (__DEV__) {
        console.log("[Logout] after resetSession");
      }
    } catch (error) {
      console.error("[FeedScreen] Error during resetSession:", error);
    }

    try {
      await clearSessionCache();
      if (__DEV__) {
        console.log("[Logout] after clearSessionCache");
      }
    } catch (error) {
      console.error("[FeedScreen] Error during clearSessionCache:", error);
    }

    try {
      queryClient.clear();
      if (__DEV__) {
        console.log("[Logout] after queryClient.clear");
      }
    } catch (error) {
      console.error("[FeedScreen] Error during queryClient.clear:", error);
    }

    // Route to login exactly once
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
  });

  // Business events feature is disabled (feature flag: businessAccounts = false)
  // Provide empty fallback to prevent network calls
  const businessEventsData = undefined;

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

  const isRefreshing = isRefetchingFeed || isRefetchingMyEvents || isRefetchingAttending;
  const isLoading = feedLoading || myEventsLoading || attendingLoading;

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
          <Pressable
            onPress={() => router.push("/calendar")}
            className="w-10 h-10 rounded-full items-center justify-center ml-2"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <Calendar size={20} color={themeColor} />
          </Pressable>
        </View>
      </View>

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
          <View className="mx-[-20px]">
            <GettingStartedChecklist />
          </View>
          <FeedCalendar
            events={calendarEvents}
            businessEvents={undefined}
            themeColor={themeColor}
            isDark={isDark}
            colors={colors}
            userId={session?.user?.id}
          />
          <EmptyFeed />
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
          <View className="mx-[-20px]">
            <GettingStartedChecklist />
          </View>
          <FeedCalendar
            events={calendarEvents}
            businessEvents={undefined}
            themeColor={themeColor}
            isDark={isDark}
            colors={colors}
            userId={session?.user?.id}
          />
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

      <BottomNavigation />
      </SafeAreaView>
    </AuthProvider>
  );
}
