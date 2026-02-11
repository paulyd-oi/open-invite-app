/**
 * Add Friends screen — unified page for adding friends + people-you-may-know.
 *
 * Accessible from the Friends header "+ Add" button (any tab).
 * Contains:
 *  1. Import from Contacts + Search (name/email/phone) + direct request
 *  2. People you may know (SSOT queryKey: ["friendSuggestions"])
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
  Share,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { devLog, devError } from "@/lib/devLog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  Search,
  Contact,
  ChevronRight,
  UserPlus,
  Sparkles,
  Check,
  X,
  Users,
  Share2,
  Info,
} from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Contacts from "expo-contacts";

import { EntityAvatar } from "@/components/EntityAvatar";
import { Button } from "@/ui/Button";
import { ShareAppButton } from "@/components/ShareApp";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { guardEmailVerification } from "@/lib/emailVerificationGate";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useNetworkStatus } from "@/lib/networkStatus";
import { safeToast } from "@/lib/safeToast";
import { refreshAfterFriendRequestSent } from "@/lib/refreshAfterMutation";
import { trackFriendAdded } from "@/lib/rateApp";
import type {
  GetFriendSuggestionsResponse,
  FriendSuggestion,
  SendFriendRequestResponse,
  SearchUsersRankedResponse,
  SearchUserResult,
} from "@/shared/contracts";

const MAX_SUGGESTIONS = 12;

export default function AddFriendsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const networkStatus = useNetworkStatus();

  // ── Add Friend search state ──
  const [searchEmail, setSearchEmail] = useState("");
  const searchInputRef = useRef<TextInput>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQueryRef = useRef("");

  // ── Contacts modal state ──
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<Contacts.Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSearch, setContactSearch] = useState("");

  // ── Suggestions state ──
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const enabled = isAuthedForNetwork(bootStatus, session);

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
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["userSearch", debouncedQuery],
    queryFn: () => api.get<SearchUsersRankedResponse>(`/api/profile/search?q=${encodeURIComponent(debouncedQuery)}&limit=15`),
    enabled: enabled && !!debouncedQuery && debouncedQuery.length >= 2 && networkStatus.isOnline,
    staleTime: 30000,
  });

  // ── Friend suggestions (people you may know) ──
  const { data: suggestionsData, isLoading: suggestionsLoading, refetch: refetchSuggestions } = useQuery({
    queryKey: ["friendSuggestions"],
    queryFn: () => api.get<GetFriendSuggestionsResponse>("/api/friends/suggestions"),
    enabled,
    staleTime: 60000,
  });

  // ── Send friend request (by email/phone) ──
  const sendRequestMutation = useMutation({
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
      refreshAfterFriendRequestSent(queryClient);
      trackFriendAdded();
    },
    onError: () => {
      safeToast.error("Request Failed", "Failed to send friend request");
    },
  });

  // ── Send friend request (by userId — for suggestions) ──
  const sendByIdMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post<SendFriendRequestResponse>("/api/friends/request", { userId }),
    onSuccess: (_, userId) => {
      setSentRequests((prev) => new Set(prev).add(userId));
      refreshAfterFriendRequestSent(queryClient, userId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Sent", "Friend request sent!");
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      safeToast.error("Failed", "Could not send request. Try again.");
    },
  });

  const handleDirectFriendRequest = useCallback(() => {
    if (!guardEmailVerification(session)) return;
    if (searchEmail.trim()) {
      const cleaned = searchEmail.trim().replace(/[^\d]/g, "");
      if (cleaned.length >= 7 && cleaned.length === searchEmail.trim().replace(/[\s\-\(\)]/g, "").length) {
        sendRequestMutation.mutate({ phone: searchEmail.trim() });
      } else {
        sendRequestMutation.mutate({ email: searchEmail.trim() });
      }
    }
  }, [session, searchEmail, sendRequestMutation]);

  const handleAddSuggestion = useCallback((suggestion: FriendSuggestion) => {
    if (!guardEmailVerification(session)) return;
    sendByIdMutation.mutate(suggestion.user.id);
  }, [session, sendByIdMutation]);

  // ── Load contacts ──
  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        safeToast.warning("Permission Required", "Please allow access to contacts to add friends.");
        setContactsLoading(false);
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.FirstName, Contacts.Fields.LastName, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Image],
        sort: Contacts.SortTypes.FirstName,
      });
      setPhoneContacts(data.filter((c) => (c.emails && c.emails.length > 0) || (c.phoneNumbers && c.phoneNumbers.length > 0)));
      setShowContactsModal(true);
    } catch (error) {
      devError("Error loading contacts:", error);
      safeToast.error("Contacts Failed", "Failed to load contacts");
    }
    setContactsLoading(false);
  }, []);

  const handleInviteContact = useCallback((contact: Contacts.Contact) => {
    if (!guardEmailVerification(session)) return;
    const email = contact.emails?.[0]?.email;
    const phone = contact.phoneNumbers?.[0]?.number;
    if (email) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sendRequestMutation.mutate({ email });
    } else if (phone) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sendRequestMutation.mutate({ phone });
    } else {
      safeToast.warning("No Contact Info", `${contact.name ?? "This contact"} doesn't have an email or phone.`);
    }
  }, [session, sendRequestMutation]);

  const filteredContacts = phoneContacts.filter((contact) => {
    if (!contactSearch.trim()) return true;
    const search = contactSearch.toLowerCase();
    const name = contact.name?.toLowerCase() ?? "";
    const email = contact.emails?.[0]?.email?.toLowerCase() ?? "";
    return name.includes(search) || email.includes(search);
  });

  const suggestions = suggestionsData?.suggestions?.slice(0, MAX_SUGGESTIONS) ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchSuggestions();
    setRefreshing(false);
  }, [refetchSuggestions]);

  return (
    /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
    /* INVARIANT_ALLOW_INLINE_ARRAY_PROP */
    <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: colors.background }}>
      {/* Header */}
      {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b" style={{ borderBottomColor: colors.separator }}>
        <Pressable
          /* INVARIANT_ALLOW_INLINE_HANDLER */
          onPress={() => {
            Haptics.selectionAsync();
            router.back();
          }}
          className="w-10 h-10 items-center justify-center"
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <Text className="text-lg font-semibold" style={{ color: colors.text }}>
          Add Friends
        </Text>
        <View className="w-10" />
      </View>

      <ScrollView
        className="flex-1"
        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColor} />
        }
      >
        {/* ═══ Section 1: Add Friend ═══ */}
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <View className="rounded-xl p-4 mb-5" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text className="font-semibold mb-3" style={{ color: colors.text }}>Add Friend</Text>

          {/* Import from Contacts */}
          <Pressable
            onPress={loadContacts}
            disabled={contactsLoading}
            className="flex-row items-center rounded-lg p-3 mb-3"
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            style={{ backgroundColor: isDark ? "#0F766E20" : "#CCFBF1" }}
          >
            <View className="w-10 h-10 rounded-full bg-teal-500 items-center justify-center mr-3">
              <Contact size={20} color="#fff" />
            </View>
            <View className="flex-1">
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text className="font-medium" style={{ color: colors.text }}>
                {contactsLoading ? "Loading..." : "Import from Contacts"}
              </Text>
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                Add friends from your phone
              </Text>
            </View>
            <ChevronRight size={20} color={colors.textSecondary} />
          </Pressable>

          {/* Divider */}
          <View className="flex-row items-center mb-3">
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <View className="flex-1 h-px" style={{ backgroundColor: colors.border }} />
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text className="text-sm mx-3" style={{ color: colors.textTertiary }}>or search by</Text>
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <View className="flex-1 h-px" style={{ backgroundColor: colors.border }} />
          </View>

          {/* Search Input */}
          <View className="flex-row items-center">
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <View className="flex-1 flex-row items-center rounded-lg px-3 mr-2" style={{ backgroundColor: colors.inputBg }}>
              <Search size={18} color={colors.textSecondary} />
              <TextInput
                ref={searchInputRef}
                value={searchEmail}
                onChangeText={setSearchEmail}
                placeholder="Name, email, or phone"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                className="flex-1 py-3 px-2"
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                style={{ color: colors.text }}
              />
            </View>
            <Button
              variant="primary"
              label={sendRequestMutation.isPending ? "..." : "Add"}
              onPress={handleDirectFriendRequest}
              disabled={sendRequestMutation.isPending}
              /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
              style={{ borderRadius: 8 }}
            />
          </View>

          {/* Helper text */}
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text className="text-xs mt-2" style={{ color: colors.textTertiary }}>
            Search by name, email address, or phone number to find friends
          </Text>

          {/* Live Search Results */}
          {searchEmail.trim().length >= 2 && (
            <View className="mt-3">
              {/* Offline state */}
              {!networkStatus.isOnline && (
                <View className="py-4 items-center">
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    Offline — search unavailable
                  </Text>
                </View>
              )}

              {/* Loading state */}
              {networkStatus.isOnline && isSearching && (
                <View className="py-4 items-center">
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    Searching...
                  </Text>
                </View>
              )}

              {/* Results */}
              {networkStatus.isOnline && !isSearching && searchResults?.users && searchResults.users.length > 0 && (
                <View>
                  {/* INVARIANT_ALLOW_SMALL_MAP */}
                  {searchResults.users.map((user: SearchUserResult) => (
                    <Pressable
                      key={user.id}
                      /* INVARIANT_ALLOW_INLINE_HANDLER */
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push(`/user/${user.id}` as any);
                      }}
                      className="flex-row items-center py-3 border-t"
                      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                      style={{ borderTopColor: colors.separator }}
                    >
                      <EntityAvatar
                        photoUrl={user.avatarUrl}
                        initials={user.name?.[0]?.toUpperCase() ?? user.handle?.[0]?.toUpperCase() ?? "?"}
                        size={40}
                        backgroundColor={user.avatarUrl ? "transparent" : themeColor + "20"}
                        foregroundColor={themeColor}
                      />
                      <View className="flex-1 ml-3">
                        <View className="flex-row items-center">
                          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                          <Text className="font-medium" style={{ color: colors.text }}>
                            {user.name ?? (user.handle ? `@${user.handle}` : "Unknown")}
                          </Text>
                          {user.isFriend && (
                            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                            <View className="ml-2 px-1.5 py-0.5 rounded" style={{ backgroundColor: themeColor + "20" }}>
                              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                              <Text className="text-[10px] font-medium" style={{ color: themeColor }}>
                                Friend
                              </Text>
                            </View>
                          )}
                        </View>
                        <View className="flex-row items-center">
                          {user.handle && (
                            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                            <Text className="text-sm" style={{ color: colors.textSecondary }}>
                              @{user.handle}
                            </Text>
                          )}
                          {user.handle && (user.mutualCount ?? 0) > 0 && (
                            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                            <Text className="text-sm mx-1" style={{ color: colors.textTertiary }}>•</Text>
                          )}
                          {(user.mutualCount ?? 0) > 0 && (
                            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
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
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    No users found for &quot;{debouncedQuery}&quot;
                  </Text>
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                    Try a different search or add by email/phone
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ═══ Section 2: People You May Know ═══ */}
        <View className="mb-4">
          <View className="flex-row items-center mb-3">
            <Sparkles size={16} color="#9333EA" />
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text className="text-sm font-semibold ml-1" style={{ color: colors.textSecondary }}>
              People you may know{suggestions.length > 0 ? ` (${suggestions.length})` : ""}
            </Text>
          </View>

          {suggestionsLoading ? (
            <View className="py-6 items-center">
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                Finding people…
              </Text>
            </View>
          ) : suggestions.length === 0 ? (
            <View className="py-8 items-center px-6">
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <View className="w-16 h-16 rounded-full items-center justify-center mb-3" style={{ backgroundColor: themeColor + "15" }}>
                <Users size={32} color={themeColor} />
              </View>
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text className="text-base font-semibold text-center mb-1" style={{ color: colors.text }}>
                No suggestions yet
              </Text>
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text className="text-sm text-center leading-5 mb-4" style={{ color: colors.textSecondary }}>
                Suggestions appear as more friends join Open Invite. Invite a few people to grow your network.
              </Text>
              <ShareAppButton variant="full" />
            </View>
          ) : (
            /* INVARIANT_ALLOW_SMALL_MAP */
            suggestions.map((suggestion, index) => {
              const user = suggestion.user;
              const isSent = sentRequests.has(user.id);
              const isPending = sendByIdMutation.isPending && sendByIdMutation.variables === user.id;
              const mutualCount = suggestion.mutualFriendCount;
              const bio = user.calendarBio || user.bio;

              return (
                <Animated.View key={user.id} entering={FadeInDown.delay(index * 40).springify()}>
                  <Pressable
                    /* INVARIANT_ALLOW_INLINE_HANDLER */
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push(`/user/${user.id}` as any);
                    }}
                    className="flex-row items-center rounded-xl p-3 mb-2"
                    /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                    style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  >
                    <EntityAvatar
                      photoUrl={user.avatarUrl}
                      initials={user.name?.charAt(0).toUpperCase() ?? user.handle?.charAt(0).toUpperCase() ?? "?"}
                      size={44}
                      backgroundColor={user.avatarUrl ? "transparent" : "#9333EA20"}
                      foregroundColor="#9333EA"
                    />
                    <View className="flex-1 ml-3 mr-2">
                      {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                      <Text className="font-medium" style={{ color: colors.text }} numberOfLines={1}>
                        {user.name ?? (user.handle ? `@${user.handle}` : "Unknown")}
                      </Text>
                      <View className="flex-row items-center">
                        {user.handle && (
                          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                          <Text className="text-xs" style={{ color: colors.textSecondary }} numberOfLines={1}>
                            @{user.handle}
                          </Text>
                        )}
                        {user.handle && mutualCount > 0 && (
                          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                          <Text className="text-xs mx-1" style={{ color: colors.textTertiary }}>•</Text>
                        )}
                        {mutualCount > 0 && (
                          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                          <Text className="text-xs" style={{ color: colors.textSecondary }}>
                            {mutualCount} mutual{mutualCount === 1 ? "" : "s"}
                          </Text>
                        )}
                      </View>
                      {bio ? (
                        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                        <Text className="text-xs mt-0.5" style={{ color: colors.textTertiary }} numberOfLines={1}>
                          {bio}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      /* INVARIANT_ALLOW_INLINE_HANDLER */
                      onPress={(e) => {
                        e.stopPropagation();
                        if (!isSent && !isPending) handleAddSuggestion(suggestion);
                      }}
                      disabled={isPending || isSent}
                      className="w-9 h-9 rounded-full items-center justify-center"
                      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                      style={{ backgroundColor: isSent ? "#4CAF50" : themeColor, opacity: isPending ? 0.6 : 1 }}
                    >
                      {isPending ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : isSent ? (
                        <Check size={16} color="#fff" />
                      ) : (
                        <UserPlus size={16} color="#fff" />
                      )}
                    </Pressable>
                  </Pressable>
                </Animated.View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ═══ Contacts Modal ═══ */}
      <Modal
        visible={showContactsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowContactsModal(false)}
      >
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        {/* INVARIANT_ALLOW_INLINE_ARRAY_PROP */}
        <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: colors.background }}>
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <View className="flex-row items-center justify-between px-5 py-4" style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Pressable
              /* INVARIANT_ALLOW_INLINE_HANDLER */
              onPress={() => {
                setShowContactsModal(false);
                setContactSearch("");
              }}
              className="w-10"
            >
              {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
              <Text className="text-base" style={{ color: themeColor }}>Cancel</Text>
            </Pressable>
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text className="text-lg font-semibold" style={{ color: colors.text }}>Import from Contacts</Text>
            <View className="w-10" />
          </View>

          {/* Search */}
          <View className="px-4 py-3">
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <View className="flex-row items-center rounded-lg px-3" style={{ backgroundColor: colors.inputBg }}>
              <Search size={18} color={colors.textSecondary} />
              <TextInput
                value={contactSearch}
                onChangeText={setContactSearch}
                placeholder="Search contacts..."
                placeholderTextColor={colors.textTertiary}
                className="flex-1 py-3 px-2"
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                style={{ color: colors.text }}
              />
            </View>
          </View>

          <FlatList
            data={filteredContacts}
            /* INVARIANT_ALLOW_INLINE_HANDLER */
            keyExtractor={(item, index) => item.id ?? `contact-${index}`}
            renderItem={({ item }) => (
              <Pressable
                /* INVARIANT_ALLOW_INLINE_HANDLER */
                onPress={() => handleInviteContact(item)}
                className="flex-row items-center px-4 py-3 border-b"
                /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                style={{ borderBottomColor: colors.separator }}
              >
                {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: themeColor + "20" }}>
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text className="font-semibold" style={{ color: themeColor }}>
                    {item.name?.[0]?.toUpperCase() ?? "?"}
                  </Text>
                </View>
                <View className="flex-1">
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text className="font-medium" style={{ color: colors.text }}>{item.name ?? "Unknown"}</Text>
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    {item.emails?.[0]?.email ?? item.phoneNumbers?.[0]?.number ?? "No contact info"}
                  </Text>
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              <View className="py-12 items-center">
                {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                <Text style={{ color: colors.textSecondary }}>No contacts found</Text>
              </View>
            }
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
