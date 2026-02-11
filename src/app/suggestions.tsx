import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  RefreshControl,
  FlatList,
  Share,
  Modal,
  ActivityIndicator,
  TextInput,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  UserPlus,
  ChevronLeft,
  Users,
  Check,
  Share2,
  Info,
  X,
  Sparkles,
  Search,
  Contact,
  ChevronRight,
  Zap,
} from "@/ui/icons";
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Contacts from "expo-contacts";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  buildDailyDeck,
  getTodayKey,
  type SuggestionCard,
  type DeckInput,
} from "@/lib/suggestionsDeck";
import { eventKeys } from "@/lib/eventQueryKeys";

import { useSession } from "@/lib/useSession";
import { EntityAvatar } from "@/components/EntityAvatar";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useSuggestionsFeed } from "@/hooks/useSuggestionsFeed";
import { guardEmailVerification } from "@/lib/emailVerification";
import { SuggestionsSkeleton } from "@/components/SkeletonLoader";
import { EmptyState as EnhancedEmptyState } from "@/components/EmptyState";
import { SuggestionFeedCard, SuggestionsFeedEmpty } from "@/components/SuggestionFeedCard";
import { safeToast } from "@/lib/safeToast";
import { Button } from "@/ui/Button";
import { useNetworkStatus } from "@/lib/networkStatus";
import {
  type GetFriendSuggestionsResponse,
  type FriendSuggestion,
  type SendFriendRequestResponse,
  type SearchUsersRankedResponse,
  type SearchUserResult,
  type GetEventsResponse,
  type GetFriendBirthdaysResponse,
} from "@/shared/contracts";

// Suggestion Card Component
function SuggestionCard({
  suggestion,
  index,
  onAddFriend,
  isPending,
  isSuccess,
}: {
  suggestion: FriendSuggestion;
  index: number;
  onAddFriend: () => void;
  isPending: boolean;
  isSuccess: boolean;
}) {
  const { themeColor, colors } = useTheme();
  const router = useRouter();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // P1 FIX: Display name + @username separately
  const displayName = suggestion.user?.name || "Unknown";
  const handle = suggestion.user?.handle;
  // P0 FIX: Bio from user object (calendarBio preferred, fallback to bio)
  const bio = suggestion.user?.calendarBio || suggestion.user?.bio;
  const mutualCount = suggestion.mutualFriendCount;

  // P0 DEV: Log bio for debugging
  if (__DEV__ && suggestion.user?.handle) {
    devLog(`[P0_SUGGESTIONS_BIO] username=${suggestion.user.handle} bioLen=${bio?.length ?? 0}`);
  }

  const handlePress = () => {
    scale.value = withSpring(0.98, {}, () => {
      scale.value = withSpring(1);
    });
    router.push(`/user/${suggestion.user.id}`);
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).springify()}
    >
      <Animated.View style={animatedStyle}>
      <Pressable
        onPress={handlePress}
        className="mx-4 mb-3 p-4 rounded-2xl"
        style={{ backgroundColor: colors.surface }}
      >
        <View className="flex-row items-center">
          {/* User Avatar — SSOT via EntityAvatar */}
          <EntityAvatar
            photoUrl={suggestion.user.avatarUrl}
            initials={displayName?.charAt(0).toUpperCase() ?? "?"}
            size={56}
            backgroundColor={suggestion.user.avatarUrl ? "transparent" : themeColor + "20"}
            foregroundColor={themeColor}
          />

          {/* User Info */}
          <View className="flex-1 ml-3">
            {/* Name */}
            <Text
              className="text-base font-semibold"
              style={{ color: colors.text }}
              numberOfLines={1}
            >
              {displayName}
            </Text>

            {/* P1 FIX: @username shown separately */}
            {handle && (
              <Text
                className="text-sm"
                style={{ color: colors.textSecondary }}
                numberOfLines={1}
              >
                @{handle}
              </Text>
            )}

            {/* P1 FIX: Bio if available */}
            {bio && (
              <Text
                className="text-xs mt-1"
                style={{ color: colors.textTertiary }}
                numberOfLines={1}
              >
                {bio}
              </Text>
            )}

            {/* P1 FIX: Muted "mutual friends" descriptor text */}
            <Text
              className="text-xs mt-1"
              style={{ color: colors.textTertiary }}
            >
              {mutualCount} mutual friend{mutualCount !== 1 ? "s" : ""}
            </Text>

            {/* P1 FIX: Removed duplicate mutual friend avatars - the text descriptor is sufficient */}
          </View>

          {/* Add Friend Button */}
          <View
            style={{
              opacity: isPending ? 0.7 : 1,
            }}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onAddFriend();
              }}
              disabled={isPending || isSuccess}
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{
                backgroundColor: isSuccess ? "#4CAF50" : themeColor,
              }}
            >
              {isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : isSuccess ? (
                <Check size={18} color="#fff" />
              ) : (
                <UserPlus size={18} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
      </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

// Empty State Component with Invite CTA
function EmptyState({ onInvite, onInfo }: { onInvite: () => void; onInfo: () => void }) {
  const { colors, themeColor } = useTheme();
  
  return (
    <View className="flex-1 items-center justify-center px-6 py-12">
      <View className="w-20 h-20 rounded-full items-center justify-center mb-4" style={{ backgroundColor: themeColor + "15" }}>
        <Users size={40} color={themeColor} />
      </View>
      
      <Text className="text-xl font-semibold text-center mb-2" style={{ color: colors.text }}>
        People you may know
      </Text>
      
      <Text className="text-center text-sm leading-5 mb-1" style={{ color: colors.textSecondary }}>
        Suggestions appear as more friends join Open Invite.
      </Text>
      
      <Text className="text-center text-sm leading-5 mb-6" style={{ color: colors.textSecondary }}>
        Invite a few people to kickstart your network.
      </Text>
      
      <Button
        variant="primary"
        label="Invite friends"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onInvite();
        }}
        leftIcon={<Share2 size={18} color="#fff" />}
        style={{ marginBottom: 12 }}
      />
      
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          onInfo();
        }}
        className="flex-row items-center"
      >
        <Info size={14} color={colors.textTertiary} />
        <Text className="text-xs ml-1" style={{ color: colors.textTertiary }}>
          How suggestions work
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Daily Ideas Deck (SSOT: src/lib/suggestionsDeck.ts) ─────────
const DECK_STORAGE_KEY = "suggestions_deck_v1";
const DECK_SWIPE_THRESHOLD = 100;
const DECK_SCREEN_W = Dimensions.get("window").width;

interface DeckReconnectSuggestion {
  friend: { id: string; name: string | null; image: string | null };
  friendshipId: string;
  groups: Array<{ id: string; name: string; color: string }>;
  hangoutCount: number;
  lastHangout: string | null;
  daysSinceHangout: number;
}

function DeckCardFace({ card }: { card: SuggestionCard }) {
  const { themeColor, colors } = useTheme();
  const accent =
    card.kind === "open_event"
      ? "#3B82F6"
      : card.kind === "open_profile"
        ? "#EC4899"
        : themeColor;
  return (
    <View
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        height: 88,
      }}
    >
      <View className="flex-row flex-1">
        <View style={{ width: 4, backgroundColor: accent }} />
        <View className="flex-1 px-4 justify-center">
          <Text
            className="text-[15px] font-semibold mb-0.5"
            style={{ color: colors.text }}
            numberOfLines={2}
          >
            {card.title}
          </Text>
          <Text
            className="text-[13px]"
            style={{ color: colors.textSecondary }}
            numberOfLines={2}
          >
            {card.body}
          </Text>
        </View>
      </View>
    </View>
  );
}

function DeckSwipeCard({
  card,
  nextCard,
  index,
  total,
  onAccept,
  onDismiss,
}: {
  card: SuggestionCard;
  nextCard?: SuggestionCard;
  index: number;
  total: number;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const { themeColor, colors, isDark } = useTheme();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const delayedAccept = useCallback(() => {
    setTimeout(onAccept, 120);
  }, [onAccept]);

  const delayedDismiss = useCallback(() => {
    setTimeout(onDismiss, 120);
  }, [onDismiss]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.15;
    })
    .onEnd((e) => {
      if (e.translationX > DECK_SWIPE_THRESHOLD) {
        translateX.value = withTiming(DECK_SCREEN_W, { duration: 200 });
        runOnJS(delayedAccept)();
      } else if (e.translationX < -DECK_SWIPE_THRESHOLD) {
        translateX.value = withTiming(-DECK_SCREEN_W, { duration: 200 });
        runOnJS(delayedDismiss)();
      } else {
        translateX.value = withSpring(0, { damping: 15, stiffness: 150 });
        translateY.value = withSpring(0, { damping: 15, stiffness: 150 });
      }
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${translateX.value / 25}deg` },
    ],
  }));

  const peekStyle = useAnimatedStyle(() => {
    const abs = Math.abs(translateX.value);
    const t = Math.min(abs / DECK_SWIPE_THRESHOLD, 1);
    return {
      transform: [{ scale: 0.95 + 0.05 * t }],
      opacity: 0.6 + 0.4 * t,
    };
  });

  const cardW = DECK_SCREEN_W - 48;

  return (
    <View className="items-center">
      {/* Card stack */}
      <View style={{ width: cardW, height: 88 }}>
        {nextCard && (
          <Animated.View
            style={[
              { position: "absolute", top: 0, left: 0, right: 0 },
              peekStyle,
            ]}
          >
            <DeckCardFace card={nextCard} />
          </Animated.View>
        )}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              { position: "absolute", top: 0, left: 0, right: 0 },
              topStyle,
            ]}
          >
            <DeckCardFace card={card} />
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Progress */}
      <Text
        className="text-xs mt-4"
        style={{ color: colors.textTertiary }}
      >
        {index + 1} of {total}
      </Text>

      {/* Action buttons */}
      <View className="flex-row mt-3" style={{ gap: 12 }}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            translateX.value = withTiming(-DECK_SCREEN_W, { duration: 200 });
            setTimeout(onDismiss, 150);
          }}
          className="flex-row items-center px-5 py-2 rounded-full"
          style={{ backgroundColor: isDark ? "#3F3F46" : "#F4F4F5" }}
        >
          <X size={14} color={colors.textSecondary} />
          <Text
            className="text-sm font-medium ml-1.5"
            style={{ color: colors.textSecondary }}
          >
            No
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            translateX.value = withTiming(DECK_SCREEN_W, { duration: 200 });
            setTimeout(onAccept, 150);
          }}
          className="flex-row items-center px-5 py-2 rounded-full"
          style={{ backgroundColor: themeColor }}
        >
          <Check size={14} color="#fff" />
          <Text className="text-sm font-medium ml-1.5 text-white">Yes</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DailyIdeasDeck() {
  const router = useRouter();
  const { themeColor, colors } = useTheme();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();

  const [deck, setDeck] = useState<SuggestionCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [deckReady, setDeckReady] = useState(false);
  const restoredRef = useRef(false);

  const enabled = isAuthedForNetwork(bootStatus, session);

  // ── Data queries (re-use existing query keys) ──
  const { data: reconnectData } = useQuery({
    queryKey: ["suggestions"],
    queryFn: () =>
      api.get<{ suggestions: DeckReconnectSuggestion[] }>(
        "/api/events/suggestions",
      ),
    enabled,
    staleTime: 60000,
  });

  const { data: birthdayData } = useQuery({
    queryKey: ["birthdays"],
    queryFn: () => api.get<GetFriendBirthdaysResponse>("/api/birthdays"),
    enabled,
    staleTime: 60000,
  });

  const { data: feedEventsData } = useQuery({
    queryKey: eventKeys.feed(),
    queryFn: () => api.get<GetEventsResponse>("/api/events/feed"),
    enabled,
    staleTime: 30000,
  });

  const { data: myEventsData } = useQuery({
    queryKey: eventKeys.mine(),
    queryFn: () => api.get<GetEventsResponse>("/api/events/mine"),
    enabled,
    staleTime: 60000,
  });

  // ── Persistence: load on mount ──
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DECK_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (
          parsed.todayKey === getTodayKey() &&
          Array.isArray(parsed.deck) &&
          parsed.deck.length > 0
        ) {
          setDeck(parsed.deck);
          setCurrentIndex(parsed.currentIndex ?? 0);
          restoredRef.current = true;
          setDeckReady(true);
          if (__DEV__) {
            devLog(
              `[P1_SUGGESTIONS_DECK] restored: ${parsed.deck.length} cards, idx=${parsed.currentIndex ?? 0}`,
            );
          }
        }
      } catch {
        /* ignore corrupt storage */
      }
    })();
  }, []);

  // ── Build deck from query data (skip if restored from storage) ──
  useEffect(() => {
    if (restoredRef.current) return;
    const hasData =
      reconnectData || birthdayData || feedEventsData || myEventsData;
    if (!hasData) return;

    const todayKey = getTodayKey();
    const myId = (session as any)?.user?.id as string | undefined;

    const input: DeckInput = {
      reconnects: (reconnectData?.suggestions ?? []).map((s) => ({
        friendId: s.friend.id,
        friendName: s.friend.name,
        daysSinceHangout: s.daysSinceHangout,
      })),
      birthdays: (birthdayData?.birthdays ?? []).map((b) => ({
        friendId: b.id,
        friendName: b.name,
        birthday: b.birthday,
      })),
      upcomingFriendEvents: (feedEventsData?.events ?? [])
        .filter((ev) => !myId || ev.userId !== myId)
        .map((ev) => ({
          id: ev.id,
          title: ev.title,
          hostName: ev.user?.name ?? null,
          hostId: ev.userId,
          startTime: ev.startTime,
          goingCount: (ev as any).goingCount as number | undefined,
          capacity: (ev as any).capacity as number | null | undefined,
        })),
      myRecentEvents: (myEventsData?.events ?? []).map((ev) => ({
        title: ev.title,
        startTime: ev.startTime,
      })),
    };

    const newDeck = buildDailyDeck(input, todayKey);
    setDeck(newDeck);
    setCurrentIndex(0);
    setDeckReady(true);
    restoredRef.current = true;

    AsyncStorage.setItem(
      DECK_STORAGE_KEY,
      JSON.stringify({ todayKey, deck: newDeck, currentIndex: 0 }),
    ).catch(() => {});
  }, [reconnectData, birthdayData, feedEventsData, myEventsData, session]);

  // ── Accept handler: navigate then advance ──
  const handleAccept = useCallback(() => {
    const card = deck[currentIndex];
    if (!card) return;

    switch (card.kind) {
      case "open_profile":
        if (card.target.profileUserId) {
          router.push(`/user/${card.target.profileUserId}` as any);
        }
        break;
      case "open_event":
        if (card.target.eventId) {
          router.push(`/event/${card.target.eventId}` as any);
        }
        break;
      case "create_event": {
        const p = card.target.createParams;
        const qs = p?.title
          ? `?title=${encodeURIComponent(p.title)}`
          : "";
        router.push(`/create${qs}` as any);
        break;
      }
    }

    const next = currentIndex + 1;
    setCurrentIndex(next);
    AsyncStorage.setItem(
      DECK_STORAGE_KEY,
      JSON.stringify({ todayKey: getTodayKey(), deck, currentIndex: next }),
    ).catch(() => {});
  }, [currentIndex, deck, router]);

  // ── Dismiss handler: advance only ──
  const handleDismiss = useCallback(() => {
    const next = currentIndex + 1;
    setCurrentIndex(next);
    AsyncStorage.setItem(
      DECK_STORAGE_KEY,
      JSON.stringify({ todayKey: getTodayKey(), deck, currentIndex: next }),
    ).catch(() => {});
  }, [currentIndex, deck]);

  // ── Render ──
  if (!deckReady) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <ActivityIndicator size="small" color={themeColor} />
        <Text
          className="text-sm mt-3"
          style={{ color: colors.textSecondary }}
        >
          Building your ideas…
        </Text>
      </View>
    );
  }

  if (deck.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Sparkles size={28} color={colors.textTertiary} />
        <Text
          className="text-sm mt-3 text-center"
          style={{ color: colors.textSecondary }}
        >
          No suggestions right now. Check back later!
        </Text>
      </View>
    );
  }

  if (currentIndex >= deck.length) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Sparkles size={32} color={themeColor} />
        <Text
          className="text-lg font-semibold mt-4"
          style={{ color: colors.text }}
        >
          You're caught up.
        </Text>
        <Text
          className="text-sm mt-1"
          style={{ color: colors.textSecondary }}
        >
          Come back tomorrow.
        </Text>
      </View>
    );
  }

  const currentCard = deck[currentIndex]!;
  const nextCard = deck[currentIndex + 1];

  return (
    <View className="flex-1 pt-8">
      <DeckSwipeCard
        key={currentCard.id}
        card={currentCard}
        nextCard={nextCard}
        index={currentIndex}
        total={deck.length}
        onAccept={handleAccept}
        onDismiss={handleDismiss}
      />
    </View>
  );
}

export default function SuggestionsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, colors, isDark } = useTheme();
  const { data: session, isPending: sessionLoading } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const networkStatus = useNetworkStatus();
  const [refreshing, setRefreshing] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set()); // Track by userId
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"for-you" | "people" | "ideas">("for-you");

  // Add Friend module state (same as Friends page)
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [searchEmail, setSearchEmail] = useState("");
  const searchInputRef = useRef<TextInput>(null);
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<Contacts.Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSearch, setContactSearch] = useState("");

  // Live search state
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQueryRef = useRef("");

  // Debounce search input
  useEffect(() => {
    latestQueryRef.current = searchEmail;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      if (latestQueryRef.current === searchEmail) {
        setDebouncedQuery(searchEmail.trim());
      }
    }, 300);
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchEmail]);

  // Fetch personalized suggestions feed
  const {
    suggestions: feedSuggestions,
    isLoading: feedLoading,
    refetch: refetchFeed,
  } = useSuggestionsFeed();

  // Fetch referral stats for sharing
  const { data: referralStats } = useQuery({
    queryKey: ["referralStats"],
    queryFn: () => api.get<{ referralCode: string; shareLink: string }>("/api/referral/stats"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  // Fetch friend suggestions (people you may know)
  const {
    data: suggestionsData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["friendSuggestions"],
    queryFn: () =>
      api.get<GetFriendSuggestionsResponse>("/api/friends/suggestions"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 60000, // Cache for 1 minute
  });

  // Live search query for Add Friend module
  const { data: searchResults, isFetching: isSearching } = useQuery({
    queryKey: ["searchUsersRanked", debouncedQuery],
    queryFn: () => api.get<SearchUsersRankedResponse>(`/api/users/search/ranked?query=${encodeURIComponent(debouncedQuery)}`),
    enabled: isAuthedForNetwork(bootStatus, session) && debouncedQuery.length >= 2 && networkStatus.isOnline,
    staleTime: 30000,
  });

  // Send friend request mutation - use userId instead of email since email can be null
  const sendRequestMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post<SendFriendRequestResponse>("/api/friends/request", { userId }),
    onSuccess: (_, userId) => {
      setSentRequests((prev) => new Set(prev).add(userId));
      queryClient.invalidateQueries({ queryKey: ["friendRequests"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  // Send friend request by email/phone (for direct input)
  const sendEmailPhoneRequestMutation = useMutation({
    mutationFn: (data: { email?: string; phone?: string }) =>
      api.post<SendFriendRequestResponse>("/api/friends/request", data),
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (data.message) {
        safeToast.info("Info", data.message);
      } else {
        safeToast.success("Success", "Friend request sent!");
      }
      setSearchEmail("");
      setShowAddFriend(false);
      queryClient.invalidateQueries({ queryKey: ["friendRequests"] });
    },
    onError: () => {
      safeToast.error("Request Failed", "Failed to send friend request");
    },
  });

  const suggestions = suggestionsData?.suggestions ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchFeed()]);
    setRefreshing(false);
  }, [refetch, refetchFeed]);

  const handleAddFriend = useCallback((suggestion: FriendSuggestion) => {
    // Guard: require email verification
    if (!guardEmailVerification(session)) {
      return;
    }
    sendRequestMutation.mutate(suggestion.user.id);
  }, [session, sendRequestMutation]);

  // Handle direct friend request by email or phone (for Add Friend module)
  const handleDirectFriendRequest = () => {
    if (!guardEmailVerification(session)) {
      return;
    }
    if (searchEmail.trim()) {
      // Check if it looks like a phone number (mostly digits)
      const cleaned = searchEmail.trim().replace(/[^\d]/g, '');
      if (cleaned.length >= 7 && cleaned.length === searchEmail.trim().replace(/[\s\-\(\)]/g, '').length) {
        sendEmailPhoneRequestMutation.mutate({ phone: searchEmail.trim() });
      } else {
        sendEmailPhoneRequestMutation.mutate({ email: searchEmail.trim() });
      }
    }
  };

  // Load contacts from phone
  const loadContacts = async () => {
    setContactsLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        safeToast.error("Permission Denied", "Please allow access to contacts in Settings");
        setContactsLoading(false);
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });
      setPhoneContacts(data.filter((c) => c.name && (c.emails?.length || c.phoneNumbers?.length)));
      setShowContactsModal(true);
    } catch (error) {
      devError("Error loading contacts:", error);
      safeToast.error("Contacts Failed", "Failed to load contacts");
    } finally {
      setContactsLoading(false);
    }
  };

  // Add friend from contacts
  const handleContactSelect = (contact: Contacts.Contact) => {
    if (!guardEmailVerification(session)) {
      return;
    }
    const email = contact.emails?.[0]?.email;
    const phone = contact.phoneNumbers?.[0]?.number;

    if (email) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sendEmailPhoneRequestMutation.mutate({ email });
      setShowContactsModal(false);
    } else if (phone) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sendEmailPhoneRequestMutation.mutate({ phone });
      setShowContactsModal(false);
    } else {
      safeToast.warning("No Contact Info", `${contact.name ?? "This contact"} doesn't have an email or phone.`);
    }
  };

  // Filter contacts by search
  const filteredContacts = phoneContacts.filter((contact) => {
    if (!contactSearch.trim()) return true;
    const search = contactSearch.toLowerCase();
    const name = contact.name?.toLowerCase() ?? "";
    const email = contact.emails?.[0]?.email?.toLowerCase() ?? "";
    return name.includes(search) || email.includes(search);
  });

  // Toggle Add Friend with focus
  const toggleAddFriend = () => {
    const newShow = !showAddFriend;
    setShowAddFriend(newShow);
    if (newShow) {
      // Focus input after animation
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  };

  const handleInviteFriends = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      let message = "Join me on Open Invite — a social calendar to plan and share events.";
      
      // Prefer using shareLink if available
      if (referralStats?.shareLink) {
        message = `I'm using Open Invite to stay connected in real life — join me: ${referralStats.shareLink}`;
      } else if (referralStats?.referralCode) {
        // Fallback to constructing deep link if shareLink is not available
        const deepLink = `openinvite://?ref=${referralStats.referralCode}`;
        message = `Join me on Open Invite! Use my code ${referralStats.referralCode} or tap ${deepLink}`;
      }
      
      await Share.share({
        message,
        title: "Invite friends to Open Invite",
      });
    } catch (error) {
      devError("Error sharing:", error);
    }
  };

  // Show login prompt if not authenticated
  if (!session && !sessionLoading) {
    return (
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: colors.background }}
      >
        <View className="flex-1 items-center justify-center px-8">
          <Text
            className="text-xl font-semibold text-center mb-2"
            style={{ color: colors.text }}
          >
            Sign in to see suggestions
          </Text>
          <Text
            className="text-center text-sm mb-6"
            style={{ color: colors.textSecondary }}
          >
            Discover people you might know based on mutual friends.
          </Text>
          <Button
            variant="primary"
            label="Sign In"
            onPress={() => router.replace("/login")}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ─── FlatList callbacks (stable identity) ──────────────
  const feedKeyExtractor = useCallback((item: { id: string }) => item.id, []);
  const peopleKeyExtractor = useCallback(
    (item: FriendSuggestion) => item.user.id,
    [],
  );
  const renderFeedItem = useCallback(
    ({ item, index }: { item: any; index: number }) => (
      <SuggestionFeedCard suggestion={item} index={index} />
    ),
    [],
  );
  const renderPeopleItem = useCallback(
    ({ item, index }: { item: FriendSuggestion; index: number }) => (
      <SuggestionCard
        suggestion={item}
        index={index}
        onAddFriend={() => handleAddFriend(item)}
        isPending={
          sendRequestMutation.isPending &&
          sendRequestMutation.variables === item.user.id
        }
        isSuccess={sentRequests.has(item.user.id)}
      />
    ),
    [handleAddFriend, sendRequestMutation.isPending, sendRequestMutation.variables, sentRequests],
  );

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
      edges={["top"]}
    >
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 py-3 border-b"
        style={{ borderBottomColor: colors.separator }}
      >
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            router.back();
          }}
          className="w-10 h-10 items-center justify-center"
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="text-lg font-semibold" style={{ color: colors.text }}>
          Suggestions
        </Text>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            toggleAddFriend();
          }}
          className="w-10 h-10 items-center justify-center rounded-full"
          style={{ backgroundColor: showAddFriend ? themeColor : colors.surface }}
        >
          {showAddFriend ? (
            <UserPlus size={20} color="#fff" />
          ) : (
            <UserPlus size={20} color={colors.text} />
          )}
        </Pressable>
      </View>

      {/* Add Friend Module (same as Friends page) */}
      {showAddFriend && (
        <Animated.View entering={FadeInDown.springify()} className="mx-4 mt-3">
          <View className="rounded-xl p-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <Text className="font-semibold mb-3" style={{ color: colors.text }}>Add Friend</Text>

            {/* Import from Contacts Button */}
            <Pressable
              onPress={loadContacts}
              disabled={contactsLoading}
              className="flex-row items-center rounded-lg p-3 mb-3"
              style={{ backgroundColor: isDark ? "#0F766E20" : "#CCFBF1" }}
            >
              <View className="w-10 h-10 rounded-full bg-teal-500 items-center justify-center mr-3">
                <Contact size={20} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="font-medium" style={{ color: colors.text }}>
                  {contactsLoading ? "Loading..." : "Import from Contacts"}
                </Text>
                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                  Add friends from your phone
                </Text>
              </View>
              <ChevronRight size={20} color={colors.textSecondary} />
            </Pressable>

            {/* Divider */}
            <View className="flex-row items-center mb-3">
              <View className="flex-1 h-px" style={{ backgroundColor: colors.border }} />
              <Text className="text-sm mx-3" style={{ color: colors.textTertiary }}>or search by</Text>
              <View className="flex-1 h-px" style={{ backgroundColor: colors.border }} />
            </View>

            {/* Search Input */}
            <View className="flex-row items-center">
              <View className="flex-1 flex-row items-center rounded-lg px-3 mr-2" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
                <Search size={18} color={colors.textSecondary} />
                <TextInput
                  ref={searchInputRef}
                  value={searchEmail}
                  onChangeText={setSearchEmail}
                  placeholder="Name, email, or phone"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  className="flex-1 py-3 px-2"
                  style={{ color: colors.text }}
                />
              </View>
              <Pressable
                onPress={handleDirectFriendRequest}
                disabled={sendEmailPhoneRequestMutation.isPending}
                className="px-4 py-3 rounded-lg"
                style={{ backgroundColor: themeColor }}
              >
                <Text className="text-white font-medium">
                  {sendEmailPhoneRequestMutation.isPending ? "..." : "Add"}
                </Text>
              </Pressable>
            </View>

            {/* Helper text */}
            <Text className="text-xs mt-2" style={{ color: colors.textTertiary }}>
              Search by name, email address, or phone number to find friends
            </Text>

            {/* Live Search Results */}
            {searchEmail.trim().length >= 2 && (
              <View className="mt-3">
                {/* Offline state */}
                {!networkStatus.isOnline && (
                  <View className="py-4 items-center">
                    <Text className="text-sm" style={{ color: colors.textSecondary }}>
                      Offline — search unavailable
                    </Text>
                  </View>
                )}

                {/* Loading state */}
                {networkStatus.isOnline && isSearching && (
                  <View className="py-4 items-center">
                    <Text className="text-sm" style={{ color: colors.textSecondary }}>
                      Searching...
                    </Text>
                  </View>
                )}

                {/* Results */}
                {networkStatus.isOnline && !isSearching && searchResults?.users && searchResults.users.length > 0 && (
                  <View>
                    {searchResults.users.map((user: SearchUserResult) => (
                      <Pressable
                        key={user.id}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push(`/user/${user.id}` as any);
                        }}
                        className="flex-row items-center py-3 border-t"
                        style={{ borderTopColor: colors.separator }}
                      >
                        {/* Avatar */}
                        <EntityAvatar
                          photoUrl={user.avatarUrl}
                          initials={user.name?.[0]?.toUpperCase() ?? user.handle?.[0]?.toUpperCase() ?? "?"}
                          size={40}
                          backgroundColor={user.avatarUrl ? "transparent" : themeColor + "20"}
                          foregroundColor={themeColor}
                        />

                        {/* User info */}
                        <View className="flex-1 ml-3">
                          <View className="flex-row items-center">
                            <Text className="font-medium" style={{ color: colors.text }}>
                              {user.name ?? (user.handle ? `@${user.handle}` : "Unknown")}
                            </Text>
                            {user.isFriend && (
                              <View className="ml-2 px-1.5 py-0.5 rounded" style={{ backgroundColor: themeColor + "20" }}>
                                <Text className="text-[10px] font-medium" style={{ color: themeColor }}>
                                  Friend
                                </Text>
                              </View>
                            )}
                          </View>
                          <View className="flex-row items-center">
                            {user.handle && (
                              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                                @{user.handle}
                              </Text>
                            )}
                            {user.handle && (user.mutualCount ?? 0) > 0 && (
                              <Text className="text-sm mx-1" style={{ color: colors.textTertiary }}>•</Text>
                            )}
                            {(user.mutualCount ?? 0) > 0 && (
                              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                                {user.mutualCount} mutual{user.mutualCount === 1 ? "" : "s"}
                              </Text>
                            )}
                          </View>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* No results */}
                {networkStatus.isOnline && !isSearching && searchResults?.users && searchResults.users.length === 0 && debouncedQuery.length >= 2 && (
                  <View className="py-4 items-center">
                    <Text className="text-sm" style={{ color: colors.textSecondary }}>
                      No users found for "{debouncedQuery}"
                    </Text>
                    <Text className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                      Try a different search or add by email/phone
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </Animated.View>
      )}

      {/* Segmented Control */}
      <View className="flex-row mx-4 mt-3 p-1 rounded-xl" style={{ backgroundColor: colors.surface }}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab("for-you");
          }}
          className="flex-1 py-2 rounded-lg items-center flex-row justify-center"
          style={{ backgroundColor: activeTab === "for-you" ? themeColor : "transparent" }}
        >
          <Sparkles size={16} color={activeTab === "for-you" ? "#fff" : colors.textSecondary} />
          <Text
            className="font-medium ml-1.5"
            style={{ color: activeTab === "for-you" ? "#fff" : colors.textSecondary }}
          >
            For You
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab("people");
          }}
          className="flex-1 py-2 rounded-lg items-center flex-row justify-center"
          style={{ backgroundColor: activeTab === "people" ? themeColor : "transparent" }}
        >
          <Users size={16} color={activeTab === "people" ? "#fff" : colors.textSecondary} />
          <Text
            className="font-medium ml-1.5"
            style={{ color: activeTab === "people" ? "#fff" : colors.textSecondary }}
          >
            People
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab("ideas");
          }}
          className="flex-1 py-2 rounded-lg items-center flex-row justify-center"
          style={{ backgroundColor: activeTab === "ideas" ? themeColor : "transparent" }}
        >
          <Zap size={16} color={activeTab === "ideas" ? "#fff" : colors.textSecondary} />
          <Text
            className="font-medium ml-1.5"
            style={{ color: activeTab === "ideas" ? "#fff" : colors.textSecondary }}
          >
            Ideas
          </Text>
        </Pressable>
      </View>

      {/* Content based on active tab */}
      {activeTab === "for-you" ? (
        /* Suggestions Feed */
        <FlatList
          data={feedSuggestions}
          keyExtractor={feedKeyExtractor}
          renderItem={renderFeedItem}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          contentContainerStyle={{
            paddingTop: 16,
            paddingBottom: 100,
            flexGrow: feedSuggestions.length === 0 ? 1 : undefined,
          }}
          ListEmptyComponent={
            feedLoading ? (
              <SuggestionsSkeleton />
            ) : (
              <SuggestionsFeedEmpty />
            )
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={themeColor}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      ) : activeTab === "ideas" ? (
        /* Daily Ideas Deck */
        <DailyIdeasDeck />
      ) : (
        /* People You May Know */
        <FlatList
          data={suggestions}
          keyExtractor={peopleKeyExtractor}
          renderItem={renderPeopleItem}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          contentContainerStyle={{
            paddingTop: 16,
            paddingBottom: 100,
            flexGrow: suggestions.length === 0 ? 1 : undefined,
          }}
          ListEmptyComponent={
            isLoading ? (
              <SuggestionsSkeleton />
            ) : (
              <EmptyState onInvite={handleInviteFriends} onInfo={() => setShowInfoModal(true)} />
            )
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={themeColor}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Contacts Modal */}
      <Modal
        visible={showContactsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowContactsModal(false)}
      >
        <View className="flex-1" style={{ backgroundColor: colors.background }}>
          <SafeAreaView className="flex-1" edges={["top"]}>
            {/* Modal Header */}
            <View className="flex-row items-center justify-between px-4 py-3 border-b" style={{ borderBottomColor: colors.separator }}>
              <Pressable onPress={() => setShowContactsModal(false)} className="w-10 h-10 items-center justify-center">
                <X size={24} color={colors.text} />
              </Pressable>
              <Text className="text-lg font-semibold" style={{ color: colors.text }}>Import from Contacts</Text>
              <View className="w-10" />
            </View>

            {/* Search */}
            <View className="px-4 py-3">
              <View className="flex-row items-center rounded-lg px-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
                <Search size={18} color={colors.textSecondary} />
                <TextInput
                  value={contactSearch}
                  onChangeText={setContactSearch}
                  placeholder="Search contacts..."
                  placeholderTextColor={colors.textTertiary}
                  className="flex-1 py-3 px-2"
                  style={{ color: colors.text }}
                />
              </View>
            </View>

            {/* Contacts List */}
            <FlatList
              data={filteredContacts}
              keyExtractor={(item, index) => item.id ?? `contact-${index}`}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handleContactSelect(item)}
                  className="flex-row items-center px-4 py-3 border-b"
                  style={{ borderBottomColor: colors.separator }}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: themeColor + "20" }}
                  >
                    <Text className="font-semibold" style={{ color: themeColor }}>
                      {item.name?.[0]?.toUpperCase() ?? "?"}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-medium" style={{ color: colors.text }}>{item.name ?? "Unknown"}</Text>
                    <Text className="text-sm" style={{ color: colors.textSecondary }}>
                      {item.emails?.[0]?.email ?? item.phoneNumbers?.[0]?.number ?? "No contact info"}
                    </Text>
                  </View>
                </Pressable>
              )}
              ListEmptyComponent={
                <View className="py-12 items-center">
                  <Text style={{ color: colors.textSecondary }}>No contacts found</Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: 40 }}
            />
          </SafeAreaView>
        </View>
      </Modal>

      {/* Info Modal */}
      <Modal
        visible={showInfoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInfoModal(false)}
      >
        <Pressable
          className="flex-1 justify-center items-center px-6"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setShowInfoModal(false)}
        >
          <Pressable
            className="rounded-2xl p-6 w-full max-w-sm"
            style={{ backgroundColor: colors.surface }}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-semibold" style={{ color: colors.text }}>
                How suggestions work
              </Text>
              <Pressable
                onPress={() => setShowInfoModal(false)}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.border }}
              >
                <X size={16} color={colors.text} />
              </Pressable>
            </View>
            
            <View className="mb-3">
              <Text className="text-base leading-6" style={{ color: colors.textSecondary }}>
                • We suggest people based on your connections.
              </Text>
            </View>
            
            <View>
              <Text className="text-base leading-6" style={{ color: colors.textSecondary }}>
                • The list improves as your network grows.
              </Text>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
