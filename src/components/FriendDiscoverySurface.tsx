/**
 * Shared Friend Discovery Surface
 *
 * SSOT component for friend discovery UI used in:
 * - Add Friends screen
 * - Onboarding friend step
 *
 * Features:
 * - Import from Contacts
 * - Search by name/email/phone
 * - People You May Know suggestions
 * - Default suggestions for first load (never blank)
 * - Refresh suggestions after adding friends
 */
import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  RefreshControl,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
} from "react-native";
import { devLog, devError } from "@/lib/devLog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Contact,
  ChevronRight,
  UserPlus,
  Sparkles,
  Check,
  X,
  Info,
} from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Contacts from "expo-contacts";

import { EntityAvatar } from "@/components/EntityAvatar";
import { Button } from "@/ui/Button";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/ThemeContext";
import { useNetworkStatus } from "@/lib/networkStatus";
import { api } from "@/lib/api";
import type { SearchUsersRankedResponse, GetFriendSuggestionsResponse } from "@/shared/contracts";

interface FriendDiscoverySurfaceProps {
  showSkipButton?: boolean;
  onSkip?: () => void;
  onFriendAdded?: () => void;
}

export function FriendDiscoverySurface({
  showSkipButton = false,
  onSkip,
  onFriendAdded
}: FriendDiscoverySurfaceProps) {
  // *** PROOF LOG: Component entry - ALWAYS LOG ***
  console.log(`[ADD_FRIENDS_ENTRY] FriendDiscoverySurface component starting render`);
  if (__DEV__) {
    devLog(`[ADD_FRIENDS_ENTRY] FriendDiscoverySurface component starting render`);
  }

  const { colors, isDark } = useTheme();
  const networkStatus = useNetworkStatus();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();

  // ── Search state ──
  const [searchEmail, setSearchEmail] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQueryRef = useRef("");

  // ── Contacts modal state ──
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<Contacts.Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactsPermissionDenied, setContactsPermissionDenied] = useState(false);

  // ── Suggestions state ──
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  // Use canonical auth gate with onboarding allowance for friend discovery flow
  const enabled = isAuthedForNetwork(bootStatus, session, { allowOnboarding: true });
  const themeColor = "#3B82F6";

  // *** PROOF LOG: Always log enabled state - PRODUCTION VISIBLE ***
  const sessionUserId = session?.user?.id || 'none';
  const onboardingAllowed = bootStatus === "onboarding" && !!sessionUserId;

  // *** SESSION CONTRACT VALIDATION ***
  if (bootStatus === "authed" && !sessionUserId) {
    const sessionShape = {
      hasSession: !!session,
      hasUser: !!session?.user,
      userId: sessionUserId,
      userEmail: session?.user?.email ?? "none",
    };
    console.log(`[AUTH_SOT_VIOLATION] FriendDiscoverySurface: bootStatus='authed' but no session userId`, sessionShape);
    if (__DEV__) {
      devLog(`[AUTH_SOT_VIOLATION] FriendDiscoverySurface: bootStatus='authed' but no session userId`, sessionShape);
    }
  }
  console.log(`[FRIEND_DISCOVERY_ENABLED_STATE] enabled=${enabled} bootStatus=${bootStatus} sessionUserId=${sessionUserId} networkOnline=${networkStatus.isOnline} onboardingAllowed=${onboardingAllowed}`);

  if (__DEV__) {
    devLog(`[FRIEND_DISCOVERY_ENABLED_STATE] enabled=${enabled} bootStatus=${bootStatus} sessionUserId=${sessionUserId} networkOnline=${networkStatus.isOnline} onboardingAllowed=${onboardingAllowed}`);
  }

  // DEV: Proof logs for friend discovery debugging
  useEffect(() => {
    if (__DEV__) {
      const sessionUserId = session?.user?.id || 'none';
      devLog(`[FRIEND_DISCOVERY_MOUNT] enabled=${enabled} bootStatus=${bootStatus} userId=${sessionUserId} showSkipButton=${!!showSkipButton}`);
    }
  }, [enabled, bootStatus, session?.user?.id, showSkipButton]);

  const queryClient = useQueryClient();

  // ── Debounce search input ──
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const trimmed = searchEmail.trim();
    latestQueryRef.current = trimmed;
    if (trimmed.length < 2) {
      setDebouncedQuery("");
      return;
    }
    debounceTimerRef.current = setTimeout(() => {
      if (latestQueryRef.current === trimmed) setDebouncedQuery(trimmed);
    }, 300);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [searchEmail]);

  // ── Live search query ──
  const searchQueryEnabled = enabled && !!debouncedQuery && debouncedQuery.length >= 2 && networkStatus.isOnline;
  if (__DEV__) {
    devLog(`[FRIEND_DISCOVERY_QUERY_FIRE search] enabled=${searchQueryEnabled} (enabled=${enabled} debouncedQuery="${debouncedQuery}" networkOnline=${networkStatus.isOnline})`);
  }

  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["userSearch", debouncedQuery],
    queryFn: async () => {
      if (__DEV__) {
        devLog(`[FRIEND_DISCOVERY_SEARCH] firing request for query: "${debouncedQuery}"`);
      }
      const result = await api.get<SearchUsersRankedResponse>(`/api/profile/search?q=${encodeURIComponent(debouncedQuery)}&limit=15`);
      if (__DEV__) {
        devLog(`[FRIEND_DISCOVERY_SEARCH] returned ${result?.users?.length || 0} users for "${debouncedQuery}"`);
      }
      return result;
    },
    enabled: searchQueryEnabled,
    staleTime: 30000,
  });

  // ── Friend suggestions (people you may know + default suggestions) ──
  console.log(`[FRIEND_DISCOVERY_QUERY_FIRE suggestions] enabled=${enabled}`);
  if (__DEV__) {
    devLog(`[FRIEND_DISCOVERY_QUERY_FIRE suggestions] enabled=${enabled}`);
  }

  const { data: suggestionsData, isLoading: suggestionsLoading, refetch: refetchSuggestions } = useQuery({
    queryKey: ["friendSuggestions"],
    queryFn: async () => {
      console.log(`[FRIEND_DISCOVERY_SUGGESTIONS] firing request to /api/friends/suggestions`);
      if (__DEV__) {
        devLog(`[FRIEND_DISCOVERY_SUGGESTIONS] firing request to /api/friends/suggestions`);
      }
      const result = await api.get<GetFriendSuggestionsResponse>("/api/friends/suggestions");
      console.log(`[FRIEND_DISCOVERY_SUGGESTIONS] returned ${result?.suggestions?.length || 0} suggestions`);
      if (__DEV__) {
        devLog(`[FRIEND_DISCOVERY_SUGGESTIONS] returned ${result?.suggestions?.length || 0} suggestions`);
      }
      return result;
    },
    enabled,
    staleTime: 60000,
  });

  // ── Send friend request (by email/phone) ──
  const sendRequestMutation = useMutation({
    mutationFn: async (data: { email?: string; phone?: string }) => {
      devLog(`[AddFriends] Sending friend request:`, data);
      return api.post("/api/friends/request", data);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSearchEmail("");
      onFriendAdded?.();
      refetchSuggestions();
    },
    onError: (error) => {
      devError(`[AddFriends] Error sending friend request:`, error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  // ── Send friend request (by user ID) ──
  const sendByIdMutation = useMutation({
    mutationFn: async (userId: string) => {
      devLog(`[AddFriends] Sending friend request to user:`, userId);
      return api.post("/api/friends/request", { userId });
    },
    onSuccess: (data, userId) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSentRequests(prev => new Set(prev.add(userId)));
      onFriendAdded?.();
      refetchSuggestions();
    },
    onError: (error) => {
      devError(`[AddFriends] Error sending friend request by ID:`, error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const suggestions = suggestionsData?.suggestions || [];

  // *** PROOF LOG: Log suggestions state and empty state reasoning ***
  if (__DEV__) {
    if (suggestionsLoading) {
      devLog(`[FRIEND_DISCOVERY_EMPTY_STATE_REASON] suggestions still loading...`);
    } else if (suggestions.length === 0) {
      devLog(`[FRIEND_DISCOVERY_EMPTY_STATE_REASON] suggestions empty, suggestionsData=${!!suggestionsData}, enabled=${enabled}`);
    } else {
      devLog(`[FRIEND_DISCOVERY_EMPTY_STATE_REASON] suggestions loaded: ${suggestions.length} items`);
    }
  }

  // ── Load phone contacts ──
  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        setContactsPermissionDenied(true);
        setContactsLoading(false);
        return;
      }

      setContactsPermissionDenied(false);
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
        sort: Contacts.SortTypes.FirstName,
      });

      // Filter contacts with email or phone
      const validContacts = data.filter(contact => {
        const hasEmail = contact.emails && contact.emails.length > 0;
        const hasPhone = contact.phoneNumbers && contact.phoneNumbers.length > 0;
        return hasEmail || hasPhone;
      });

      setPhoneContacts(validContacts);
      setShowContactsModal(true);
    } catch (error) {
      devError(`[AddFriends] Error loading contacts:`, error);
    } finally {
      setContactsLoading(false);
    }
  }, []);

  // ── Send request to contact ──
  const sendRequestToContact = useCallback(async (contact: Contacts.Contact) => {
    const email = contact.emails?.[0]?.email;
    const phone = contact.phoneNumbers?.[0]?.number;

    if (email) {
      await sendRequestMutation.mutateAsync({ email });
    } else if (phone) {
      await sendRequestMutation.mutateAsync({ phone });
    }
  }, [sendRequestMutation]);

  // ── Handle search submit ──
  const handleSearchSubmit = useCallback(() => {
    const trimmed = searchEmail.trim();
    if (!trimmed) return;

    const isEmail = trimmed.includes("@");
    const isPhone = /^\+?[\d\s\-\(\)]+$/.test(trimmed);

    if (isEmail) {
      sendRequestMutation.mutate({ email: trimmed });
    } else if (isPhone) {
      sendRequestMutation.mutate({ phone: trimmed });
    }
  }, [searchEmail, sendRequestMutation]);

  // ── Refresh suggestions ──
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchSuggestions();
    } finally {
      setRefreshing(false);
    }
  }, [refetchSuggestions]);

  const filteredContacts = phoneContacts.filter(contact => {
    if (!contactSearch.trim()) return true;
    const query = contactSearch.toLowerCase();
    return contact.name?.toLowerCase().includes(query);
  });

  const searchResultsList = searchResults?.users || [];
  const isValidSearchInput = searchEmail.trim().length >= 2;
  const showSearchResults = isValidSearchInput && searchResultsList.length > 0;
  const showSearchEmpty = isValidSearchInput && !isSearching && searchResultsList.length === 0;

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1 px-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColor} />
        }
      >
        {/* ═══ Section 1: Add Friend ═══ */}
        <View className="rounded-xl p-4 mb-5" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <Text className="font-semibold mb-3" style={{ color: colors.text }}>Add Friend</Text>

          {/* Import from Contacts */}
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
            <View className="flex-1 flex-row items-center rounded-lg px-3 mr-2" style={{ backgroundColor: colors.inputBg }}>
              <Search size={18} color={colors.textSecondary} />
              <TextInput
                className="flex-1 py-3 ml-2"
                placeholder="Name, email, or phone"
                placeholderTextColor={colors.textTertiary}
                value={searchEmail}
                onChangeText={setSearchEmail}
                style={{ color: colors.text }}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleSearchSubmit}
                returnKeyType="search"
              />
              {searchEmail.length > 0 && (
                <Pressable onPress={() => setSearchEmail("")} className="p-1">
                  <X size={16} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>
            <Button
              variant="primary"
              label="Add"
              onPress={handleSearchSubmit}
              disabled={!searchEmail.trim() || sendRequestMutation.isPending}
              loading={sendRequestMutation.isPending}
              size="sm"
              style={{ backgroundColor: themeColor }}
            />
          </View>

          {/* Search Results */}
          {(showSearchResults || showSearchEmpty || isSearching) && (
            <View className="mt-3">
              {isSearching ? (
                <View className="py-4 items-center">
                  <ActivityIndicator color={themeColor} />
                  <Text className="text-sm mt-2" style={{ color: colors.textSecondary }}>
                    Searching...
                  </Text>
                </View>
              ) : showSearchResults ? (
                searchResultsList.map((user: any, index: any) => {
                  const isSent = sentRequests.has(user.id);
                  const isPending = sendByIdMutation.isPending && sendByIdMutation.variables === user.id;

                  // Generate initials for avatar fallback
                  const initials = user.name
                    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
                    : user.handle
                    ? user.handle.slice(0, 2).toUpperCase()
                    : "??";

                  // Canonical profile navigation path
                  const profileRoute = `/user/${user.id}`;

                  // Preview field selection (priority: calendarBio ?? bio ?? mutualCount text)
                  const previewText = user.calendarBio
                    ? user.calendarBio
                    : user.bio
                    ? user.bio
                    : user.mutualCount > 0
                    ? `${user.mutualCount} mutual friend${user.mutualCount !== 1 ? "s" : ""}`
                    : null;

                  // *** PROOF LOGS ***
                  if (index === 0) {
                    const bioPresent = !!user.bio;
                    const calendarBioPresent = !!user.calendarBio;
                    const chosenField = user.calendarBio ? 'calendarBio' : user.bio ? 'bio' : user.mutualCount > 0 ? 'mutualCount' : 'none';
                    console.log(`[SEARCH_ROW_RENDER_FIELDS] id=${user.id} name=${user.name} handle=${user.handle} bioPresent=${bioPresent} calendarBioPresent=${calendarBioPresent} chosenPreviewField=${chosenField}`);
                    console.log(`[SEARCH_ROW_PRESS_READY] id=${user.id} hasOnPress=true routeTarget=${profileRoute}`);
                  }

                  const handleRowPress = () => {
                    console.log(`[SEARCH_ROW_NAVIGATE] id=${user.id} route=${profileRoute}`);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(profileRoute as any);
                  };

                  const handleAddPress = () => {
                    sendByIdMutation.mutate(user.id);
                  };

                  return (
                    <Animated.View key={user.id} entering={FadeInDown.delay(index * 100)}>
                      <View
                        className="flex-row items-center py-2 px-3 rounded-lg"
                        style={{ backgroundColor: colors.surface }}
                      >
                        {/* Tappable profile content area */}
                        <Pressable
                          className="flex-row items-center flex-1"
                          onPress={handleRowPress}
                        >
                          <EntityAvatar
                            photoUrl={user.avatarUrl}
                            initials={initials}
                            size={40}
                          />
                          <View className="flex-1 ml-3">
                            <Text className="font-medium" style={{ color: colors.text }}>
                              {user.name || "Open Invite User"}
                            </Text>
                            {user.handle && (
                              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                                @{user.handle}
                              </Text>
                            )}
                            {previewText && (
                              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                                {previewText}
                              </Text>
                            )}
                          </View>
                        </Pressable>

                        {/* Separate add button */}
                        {isSent ? (
                          <View className="w-8 h-8 rounded-full bg-green-500 items-center justify-center ml-2">
                            <Check size={16} color="#fff" />
                          </View>
                        ) : (
                          <Pressable
                            className="w-8 h-8 rounded-full items-center justify-center ml-2"
                            style={{ backgroundColor: themeColor }}
                            onPress={handleAddPress}
                            disabled={isPending}
                          >
                            {isPending ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <UserPlus size={16} color="#fff" />
                            )}
                          </Pressable>
                        )}
                      </View>
                    </Animated.View>
                  );
                })
              ) : showSearchEmpty ? (
                <View className="py-4 items-center">
                  <Text className="font-medium" style={{ color: colors.text }}>
                    No users found
                  </Text>
                  <Text className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                    Try a different search or add by email/phone
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </View>

        {/* ═══ Section 2: People You May Know ═══ */}
        <View className="mb-4">
          <View className="flex-row items-center mb-3">
            <Sparkles size={16} color="#9333EA" />
            <Text className="text-sm font-semibold ml-1" style={{ color: colors.textSecondary }}>
              People you may know{suggestions.length > 0 ? ` (${suggestions.length})` : ""}
            </Text>
          </View>

          {suggestionsLoading ? (
            <View className="py-6 items-center">
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                Finding people…
              </Text>
            </View>
          ) : suggestions.length === 0 ? (
            <View className="py-6 items-center px-6">
              <Text className="text-sm text-center leading-5" style={{ color: colors.textSecondary }}>
                Suggestions will appear as more friends join.
              </Text>
            </View>
          ) : (
            suggestions.map((suggestion, index) => {
              const user = suggestion.user;
              const isSent = sentRequests.has(user.id);
              const isPending = sendByIdMutation.isPending && sendByIdMutation.variables === user.id;
              const mutualCount = suggestion.mutualFriendCount;

              return (
                <Animated.View key={user.id} entering={FadeInDown.delay(index * 100)}>
                  <Pressable
                    className="flex-row items-center py-3 px-4 rounded-xl mb-2"
                    style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                    onPress={() => sendByIdMutation.mutate(user.id)}
                    disabled={isSent || isPending}
                  >
                    <EntityAvatar
                      photoUrl={user.avatarUrl}
                      initials={user.name ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : "??"}
                      size={48}
                    />
                    <View className="flex-1 ml-3">
                      <Text className="font-medium text-base" style={{ color: colors.text }}>
                        {user.name || "Open Invite User"}
                      </Text>
                      {mutualCount > 0 ? (
                        <Text className="text-sm" style={{ color: colors.textSecondary }}>
                          {mutualCount} mutual friend{mutualCount !== 1 ? "s" : ""}
                        </Text>
                      ) : (
                        <Text className="text-sm" style={{ color: colors.textSecondary }}>
                          Suggested for you
                        </Text>
                      )}
                    </View>
                    {isSent ? (
                      <View className="w-10 h-10 rounded-full bg-green-500 items-center justify-center">
                        <Check size={20} color="#fff" />
                      </View>
                    ) : (
                      <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: themeColor }}>
                        {isPending ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <UserPlus size={20} color="#fff" />
                        )}
                      </View>
                    )}
                  </Pressable>
                </Animated.View>
              );
            })
          )}
        </View>

        {/* Skip button for onboarding */}
        {showSkipButton && (
          <View className="items-center mb-4">
            <Pressable onPress={onSkip} className="py-3 px-6">
              <Text className="text-sm" style={{ color: colors.textTertiary }}>Skip for now</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Contacts Import Modal */}
      <Modal
        visible={showContactsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowContactsModal(false)}
      >
        <View className="flex-1" style={{ backgroundColor: colors.background }}>
          {/* Header */}
          <View className="flex-row items-center justify-between p-4 border-b" style={{ borderBottomColor: colors.border }}>
            <Pressable onPress={() => setShowContactsModal(false)}>
              <Text style={{ color: themeColor }}>Cancel</Text>
            </Pressable>
            <Text className="font-semibold" style={{ color: colors.text }}>Import Contacts</Text>
            <View style={{ width: 50 }} />
          </View>

          {/* Search */}
          <View className="px-4 py-2">
            <View className="flex-row items-center rounded-lg px-3" style={{ backgroundColor: colors.inputBg }}>
              <Search size={18} color={colors.textSecondary} />
              <TextInput
                className="flex-1 py-2 ml-2"
                placeholder="Search contacts"
                placeholderTextColor={colors.textTertiary}
                value={contactSearch}
                onChangeText={setContactSearch}
                style={{ color: colors.text }}
              />
            </View>
          </View>

          {/* Contacts List */}
          <FlatList
            data={filteredContacts}
            keyExtractor={(item) => item.id || String(Math.random())}
            renderItem={({ item: contact }) => (
              <Pressable
                className="flex-row items-center py-3 px-4"
                onPress={() => sendRequestToContact(contact)}
              >
                <View className="w-12 h-12 rounded-full bg-gray-200 items-center justify-center mr-3">
                  <Contact size={24} color="#666" />
                </View>
                <View className="flex-1">
                  <Text className="font-medium" style={{ color: colors.text }}>
                    {contact.name || "Unknown"}
                  </Text>
                  {contact.emails?.[0]?.email && (
                    <Text className="text-sm" style={{ color: colors.textSecondary }}>
                      {contact.emails[0].email}
                    </Text>
                  )}
                  {!contact.emails?.[0]?.email && contact.phoneNumbers?.[0]?.number && (
                    <Text className="text-sm" style={{ color: colors.textSecondary }}>
                      {contact.phoneNumbers[0].number}
                    </Text>
                  )}
                </View>
                <UserPlus size={20} color={themeColor} />
              </Pressable>
            )}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </Modal>
    </View>
  );
}