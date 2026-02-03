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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
} from "@/ui/icons";
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Contacts from "expo-contacts";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { useSuggestionsFeed } from "@/hooks/useSuggestionsFeed";
import { guardEmailVerification } from "@/lib/emailVerification";
import { SuggestionsSkeleton } from "@/components/SkeletonLoader";
import { EmptyState as EnhancedEmptyState } from "@/components/EmptyState";
import { SuggestionFeedCard, SuggestionsFeedEmpty } from "@/components/SuggestionFeedCard";
import { safeToast } from "@/lib/safeToast";
import { useNetworkStatus } from "@/lib/networkStatus";
import {
  type GetFriendSuggestionsResponse,
  type FriendSuggestion,
  type SendFriendRequestResponse,
  type SearchUsersRankedResponse,
  type SearchUserResult,
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
  const bio = (suggestion.user as any)?.calendarBio || (suggestion.user as any)?.bio;
  const mutualCount = suggestion.mutualFriendCount;

  const handlePress = () => {
    scale.value = withSpring(0.98, {}, () => {
      scale.value = withSpring(1);
    });
    router.push(`/user/${suggestion.user.id}`);
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).springify()}
      style={animatedStyle}
    >
      <Pressable
        onPress={handlePress}
        className="mx-4 mb-3 p-4 rounded-2xl"
        style={{ backgroundColor: colors.surface }}
      >
        <View className="flex-row items-center">
          {/* User Avatar */}
          {suggestion.user.avatarUrl ? (
            <Image
              source={{ uri: suggestion.user.avatarUrl }}
              className="w-14 h-14 rounded-full"
            />
          ) : (
            <View
              className="w-14 h-14 rounded-full items-center justify-center"
              style={{ backgroundColor: themeColor + "20" }}
            >
              <Text
                className="text-xl font-semibold"
                style={{ color: themeColor }}
              >
                {displayName?.charAt(0).toUpperCase() ?? "?"}
              </Text>
            </View>
          )}

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
      
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onInvite();
        }}
        className="px-6 py-3 rounded-full flex-row items-center mb-3"
        style={{ backgroundColor: themeColor }}
      >
        <Share2 size={18} color="#fff" />
        <Text className="text-white font-semibold ml-2">Invite friends</Text>
      </Pressable>
      
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
  const [activeTab, setActiveTab] = useState<"for-you" | "people">("for-you");

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
    enabled: bootStatus === 'authed',
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
    enabled: bootStatus === 'authed',
    staleTime: 60000, // Cache for 1 minute
  });

  // Live search query for Add Friend module
  const { data: searchResults, isFetching: isSearching } = useQuery({
    queryKey: ["searchUsersRanked", debouncedQuery],
    queryFn: () => api.get<SearchUsersRankedResponse>(`/api/users/search/ranked?query=${encodeURIComponent(debouncedQuery)}`),
    enabled: bootStatus === 'authed' && debouncedQuery.length >= 2 && networkStatus.isOnline,
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
      safeToast.error("Error", "Failed to send friend request");
    },
  });

  const suggestions = suggestionsData?.suggestions ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchFeed()]);
    setRefreshing(false);
  }, [refetch, refetchFeed]);

  const handleAddFriend = (suggestion: FriendSuggestion) => {
    // Guard: require email verification
    if (!guardEmailVerification(session)) {
      return;
    }
    sendRequestMutation.mutate(suggestion.user.id);
  };

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
      console.error("Error loading contacts:", error);
      safeToast.error("Error", "Failed to load contacts");
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
      console.error("Error sharing:", error);
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
          <Pressable
            onPress={() => router.replace("/login")}
            className="px-6 py-3 rounded-full"
            style={{ backgroundColor: themeColor }}
          >
            <Text className="text-white font-semibold">Sign In</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

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
                        {user.avatarUrl ? (
                          <Image
                            source={{ uri: user.avatarUrl }}
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <View
                            className="w-10 h-10 rounded-full items-center justify-center"
                            style={{ backgroundColor: themeColor + "20" }}
                          >
                            <Text className="text-base font-semibold" style={{ color: themeColor }}>
                              {user.name?.[0]?.toUpperCase() ?? user.handle?.[0]?.toUpperCase() ?? "?"}
                            </Text>
                          </View>
                        )}

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
      </View>

      {/* Content based on active tab */}
      {activeTab === "for-you" ? (
        /* Suggestions Feed */
        <FlatList
          data={feedSuggestions}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <SuggestionFeedCard suggestion={item} index={index} />
          )}
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
      ) : (
        /* People You May Know */
        <FlatList
          data={suggestions}
          keyExtractor={(item) => item.user.id}
          renderItem={({ item, index }) => (
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
          )}
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
              keyExtractor={(item) => item.id ?? String(Math.random())}
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
