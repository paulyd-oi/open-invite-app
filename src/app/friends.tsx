import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  RefreshControl,
  Modal,
  FlatList,
  Platform,
} from "react-native";
import { safeToast } from "@/lib/safeToast";
import { ConfirmModal } from "@/components/ConfirmModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  Search,
  UserPlus,
  ChevronRight,
  ChevronDown,
  Users,
  Check,
  X,
  Bell,
  Contact,
  Phone,
  Mail,
  FlaskConical,
  Calendar,
  Clock,
  MapPin,
  List,
  LayoutGrid,
  Filter,
  Activity,
  Sparkles,
  Building2,
  BadgeCheck,
  Plus,
  Pin,
  Trash2,
  ChevronUp,
} from "@/ui/icons";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  withSpring,
  runOnJS,
  FadeIn,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import * as Contacts from "expo-contacts";

import BottomNavigation from "@/components/BottomNavigation";
import { FriendsListSkeleton } from "@/components/SkeletonLoader";
import { CircleCard } from "@/components/CircleCard";
import { CreateCircleModal } from "@/components/CreateCircleModal";
import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { trackFriendAdded } from "@/lib/rateApp";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { useEntitlements, canCreateCircle, type PaywallContext } from "@/lib/entitlements";
import {
  type GetFriendsResponse,
  type GetFriendRequestsResponse,
  type SendFriendRequestResponse,
  type Friendship,
  type FriendRequest,
  type GetFriendEventsResponse,
  type Event,
  type GetGroupsResponse,
  type FriendGroup,
  type Circle,
  type GetCirclesResponse,
  type SearchUsersRankedResponse,
  type SearchUserResult,
} from "@/shared/contracts";
import { type Business, type BusinessEvent, BUSINESS_CATEGORIES } from "../../shared/contracts";
import { useNetworkStatus } from "@/lib/networkStatus";

// Mini calendar component for friend cards
function MiniCalendar({ friendshipId }: { friendshipId: string }) {
  const { themeColor, isDark, colors } = useTheme();
  const { data: session } = useSession();

  const { data } = useQuery({
    queryKey: ["friendEvents", friendshipId],
    queryFn: () => api.get<GetFriendEventsResponse>(`/api/friends/${friendshipId}/events`),
    enabled: !!session && !!friendshipId,
    staleTime: 60000, // Cache for 1 minute to avoid too many requests
  });

  const events = data?.events ?? [];

  // Get current month's calendar
  const today = new Date();
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const startingDay = currentMonth.getDay();

  // Create a set of days that have events
  const eventDays = new Set<number>();
  events.forEach((event) => {
    const eventDate = new Date(event.startTime);
    if (
      eventDate.getMonth() === today.getMonth() &&
      eventDate.getFullYear() === today.getFullYear()
    ) {
      eventDays.add(eventDate.getDate());
    }
  });

  const dayNames = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <View className="mt-2 pt-2 border-t" style={{ borderTopColor: colors.separator }}>
      {/* Day headers */}
      <View className="flex-row mb-1">
        {dayNames.map((day, i) => (
          <View key={i} className="flex-1 items-center">
            <Text className="text-[8px]" style={{ color: colors.textTertiary }}>{day}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid - compact version showing only necessary rows */}
      <View className="flex-row flex-wrap">
        {/* Empty cells for days before month starts */}
        {Array.from({ length: startingDay }).map((_, i) => (
          <View key={`empty-${i}`} className="w-[14.28%] h-4" />
        ))}

        {/* Days of the month */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const hasEvent = eventDays.has(day);
          const isToday = day === today.getDate();

          return (
            <View key={day} className="w-[14.28%] h-4 items-center justify-center">
              <View
                className="w-3.5 h-3.5 rounded-full items-center justify-center"
                style={{
                  backgroundColor: hasEvent ? themeColor : "transparent",
                  borderWidth: isToday ? 1 : 0,
                  borderColor: isToday ? themeColor : "transparent",
                }}
              >
                <Text
                  className="text-[7px]"
                  style={{
                    color: hasEvent ? "#fff" : isToday ? themeColor : colors.textTertiary,
                    fontWeight: hasEvent || isToday ? "600" : "400",
                  }}
                >
                  {day}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Event count indicator */}
      {events.length > 0 && (
        <View className="flex-row items-center justify-center mt-1">
          <View className="w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: themeColor }} />
          <Text className="text-[9px]" style={{ color: colors.textSecondary }}>
            {events.length} open invite{events.length !== 1 ? "s" : ""}
          </Text>
        </View>
      )}
    </View>
  );
}


function FriendCard({ friendship, index }: { friendship: Friendship; index: number }) {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const friend = friendship.friend;

  // Guard against undefined friend
  if (!friend) {
    return null;
  }

  const bio = friend.Profile?.calendarBio || friend.Profile?.bio;

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/friend/${friendship.id}` as any);
        }}
        className="rounded-xl p-3 mb-2"
        style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
      >
        <View className="flex-row items-start">
          <View className="w-12 h-12 rounded-full mr-3 overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
            {friend.image ? (
              <Image source={{ uri: friend.image }} className="w-full h-full" />
            ) : (
              <View className="w-full h-full items-center justify-center" style={{ backgroundColor: themeColor + "20" }}>
                <Text className="text-lg font-semibold" style={{ color: themeColor }}>
                  {friend.name?.[0] ?? friend.email?.[0]?.toUpperCase() ?? "?"}
                </Text>
              </View>
            )}
          </View>
          <View className="flex-1">
            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>
              {friend.name ?? friend.email ?? "Unknown"}
            </Text>
            {bio && (
              <Text
                className="mt-0.5"
                style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }}
                numberOfLines={2}
              >
                {bio}
              </Text>
            )}
            {friendship.groupMemberships && friendship.groupMemberships.length > 0 && (
              <View className="flex-row flex-wrap mt-1.5">
                {friendship.groupMemberships.slice(0, 2).map((m) => (
                  <View
                    key={m.groupId}
                    className="px-2 py-0.5 rounded-full mr-1"
                    style={{ backgroundColor: m.group.color + "20" }}
                  >
                    <Text className="text-xs" style={{ color: m.group.color }}>
                      {m.group.name}
                    </Text>
                  </View>
                ))}
                {friendship.groupMemberships.length > 2 && (
                  <Text className="text-xs" style={{ color: colors.textTertiary }}>
                    +{friendship.groupMemberships.length - 2}
                  </Text>
                )}
              </View>
            )}
          </View>
          <ChevronRight size={20} color={colors.textTertiary} style={{ marginTop: 2 }} />
        </View>

        {/* Mini Calendar */}
        <MiniCalendar friendshipId={friendship.id} />
      </Pressable>
    </Animated.View>
  );
}

// Collapsible List Item for "list" view mode
function FriendListItem({ friendship, index }: { friendship: Friendship; index: number }) {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const friend = friendship.friend;
  const [isExpanded, setIsExpanded] = useState(false);
  const rotation = useSharedValue(0);
  const height = useSharedValue(0);

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotation.value, [0, 1], [0, 180])}deg` }],
  }));

  const calendarStyle = useAnimatedStyle(() => ({
    opacity: height.value,
    maxHeight: interpolate(height.value, [0, 1], [0, 200]),
    overflow: "hidden" as const,
  }));

  // Guard against undefined friend - must be after all hooks
  if (!friend) {
    return null;
  }

  const toggleExpand = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsExpanded(!isExpanded);
    rotation.value = withTiming(isExpanded ? 0 : 1, { duration: 200 });
    height.value = withTiming(isExpanded ? 0 : 1, { duration: 250 });
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 30).springify()}>
      <View
        className="rounded-xl mb-2 overflow-hidden"
        style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
      >
        {/* Main row */}
        <View className="flex-row items-center p-3">
          {/* Avatar - taps to profile */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/friend/${friendship.id}` as any);
            }}
            className="flex-row items-center flex-1"
          >
            <View className="w-10 h-10 rounded-full mr-3 overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
              {friend.image ? (
                <Image source={{ uri: friend.image }} className="w-full h-full" />
              ) : (
                <View className="w-full h-full items-center justify-center" style={{ backgroundColor: themeColor + "20" }}>
                  <Text className="font-semibold" style={{ color: themeColor }}>
                    {friend.name?.[0] ?? friend.email?.[0]?.toUpperCase() ?? "?"}
                  </Text>
                </View>
              )}
            </View>
            <View className="flex-1">
              <Text className="text-base font-sora-medium" style={{ color: colors.text }}>
                {friend.name ?? friend.email ?? "Unknown"}
              </Text>
              {friendship.groupMemberships && friendship.groupMemberships.length > 0 && (
                <View className="flex-row flex-wrap mt-0.5">
                  {friendship.groupMemberships.slice(0, 2).map((m) => (
                    <View
                      key={m.groupId}
                      className="px-1.5 py-0.5 rounded-full mr-1"
                      style={{ backgroundColor: m.group.color + "15" }}
                    >
                      <Text className="text-[10px]" style={{ color: m.group.color }}>
                        {m.group.name}
                      </Text>
                    </View>
                  ))}
                  {friendship.groupMemberships.length > 2 && (
                    <Text className="text-[10px]" style={{ color: colors.textTertiary }}>
                      +{friendship.groupMemberships.length - 2}
                    </Text>
                  )}
                </View>
              )}
            </View>
          </Pressable>

          {/* Expand/collapse button */}
          <Pressable
            onPress={toggleExpand}
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ backgroundColor: isExpanded ? themeColor + "15" : (isDark ? "#2C2C2E" : "#F3F4F6") }}
          >
            <Animated.View style={arrowStyle}>
              <ChevronDown size={18} color={isExpanded ? themeColor : colors.textSecondary} />
            </Animated.View>
          </Pressable>
        </View>

        {/* Expandable calendar section */}
        <Animated.View style={calendarStyle}>
          <View className="px-3 pb-3">
            <MiniCalendar friendshipId={friendship.id} />
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

function FriendRequestCard({
  request,
  type,
  onAccept,
  onReject,
  themeColor,
  isDark,
  colors,
  onViewProfile,
}: {
  request: FriendRequest;
  type: "received" | "sent";
  onAccept?: () => void;
  onReject?: () => void;
  themeColor: string;
  isDark: boolean;
  colors: any;
  onViewProfile?: () => void;
}) {
  const user = type === "received" ? request.sender : request.receiver;

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onViewProfile?.();
      }}
      className="flex-row items-center rounded-xl p-3 mb-2"
      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
    >
      <View className="w-10 h-10 rounded-full mr-3 overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
        {user?.image ? (
          <Image source={{ uri: user.image }} className="w-full h-full" />
        ) : (
          <View
            className="w-full h-full items-center justify-center"
            style={{ backgroundColor: themeColor + "20" }}
          >
            <Text style={{ color: themeColor }} className="text-sm font-semibold">
              {user?.name?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "?"}
            </Text>
          </View>
        )}
      </View>
      <View className="flex-1">
        <Text className="font-medium" style={{ color: colors.text }}>
          {user?.name ?? user?.email ?? "Unknown"}
        </Text>
        <Text className="text-xs" style={{ color: colors.textTertiary }}>
          {type === "received" ? "Wants to connect" : "Pending"}
        </Text>
      </View>
      {type === "received" && (
        <View className="flex-row">
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onReject?.();
            }}
            className="w-8 h-8 rounded-full items-center justify-center mr-2"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
          >
            <X size={16} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onAccept?.();
            }}
            className="w-8 h-8 rounded-full items-center justify-center"
            style={{ backgroundColor: themeColor }}
          >
            <Check size={16} color="#fff" />
          </Pressable>
        </View>
      )}
      <ChevronRight size={16} color={colors.textTertiary} style={{ marginLeft: 8 }} />
    </Pressable>
  );
}

export default function FriendsScreen() {
  const { data: session } = useSession();
  const router = useRouter();
  const { groupId: initialGroupId } = useLocalSearchParams<{ groupId?: string }>();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const [searchEmail, setSearchEmail] = useState("");
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<Contacts.Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSearch, setContactSearch] = useState("");

  // Live search state
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQueryRef = React.useRef("");
  const networkStatus = useNetworkStatus();

  // View mode and filter states
  const [viewMode, setViewMode] = useState<"list" | "detailed">("detailed");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(initialGroupId ?? null);
  const [showGroupFilter, setShowGroupFilter] = useState(false);

  // Edit group modal state
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<FriendGroup | null>(null);
  const [editGroupColor, setEditGroupColor] = useState("#FF6B6B");

  // Available colors for group color picker
  const GROUP_COLORS = [
    "#FF6B6B", "#FF8C42", "#FFD93D", "#6BCB77", "#4D96FF",
    "#9B59B6", "#E91E63", "#00BCD4", "#795548", "#607D8B",
  ];

  // Set initial group filter from URL params
  useEffect(() => {
    if (initialGroupId) {
      setSelectedGroupId(initialGroupId);
    }
  }, [initialGroupId]);

  // Add to groups modal state (shown after accepting friend request)
  const [showAddToGroupsModal, setShowAddToGroupsModal] = useState(false);
  const [newlyAcceptedFriend, setNewlyAcceptedFriend] = useState<{
    friendshipId: string;
    friendName: string;
    friendImage?: string | null;
  } | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  // Circles (Planning) state
  const [showCreateCircle, setShowCreateCircle] = useState(false);
  const [friendsExpanded, setFriendsExpanded] = useState(true);
  const [planningExpanded, setPlanningExpanded] = useState(true);
  const [requestsExpanded, setRequestsExpanded] = useState(true);
  const [sectionsLoaded, setSectionsLoaded] = useState(false);

  // Paywall state for circles gating
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [paywallContext, setPaywallContext] = useState<PaywallContext>("CIRCLES_LIMIT");

  // Confirm modal state for destructive actions
  const [showLeaveCircleConfirm, setShowLeaveCircleConfirm] = useState(false);
  const [circleToLeave, setCircleToLeave] = useState<{ id: string; name: string } | null>(null);
  const [showDeleteGroupConfirm, setShowDeleteGroupConfirm] = useState(false);

  // Fetch entitlements for gating
  const { data: entitlements } = useEntitlements();

  // Handler for creating circle with gating
  const handleCreateCirclePress = () => {
    const check = canCreateCircle(entitlements);
    if (!check.allowed && check.context) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setPaywallContext(check.context);
      setShowPaywallModal(true);
      return;
    }
    setShowCreateCircle(true);
  };

  // Load section expanded states from AsyncStorage
  useEffect(() => {
    const loadSectionStates = async () => {
      try {
        const stored = await AsyncStorage.getItem("friends_section_states");
        if (stored) {
          const states = JSON.parse(stored);
          if (typeof states.friendsExpanded === "boolean") setFriendsExpanded(states.friendsExpanded);
          if (typeof states.planningExpanded === "boolean") setPlanningExpanded(states.planningExpanded);
          if (typeof states.requestsExpanded === "boolean") setRequestsExpanded(states.requestsExpanded);
        }
      } catch (e) {
        if (__DEV__) {
          console.error("[Friends] Error loading section states:", e);
        }
      } finally {
        setSectionsLoaded(true);
      }
    };
    loadSectionStates();
  }, []);

  // Save section expanded states to AsyncStorage when they change
  useEffect(() => {
    if (!sectionsLoaded) return; // Don't save until initial load is complete
    const saveSectionStates = async () => {
      try {
        await AsyncStorage.setItem(
          "friends_section_states",
          JSON.stringify({ friendsExpanded, planningExpanded, requestsExpanded })
        );
      } catch (e) {
        if (__DEV__) {
          console.error("[Friends] Error saving section states:", e);
        }
      }
    };
    saveSectionStates();
  }, [friendsExpanded, planningExpanded, requestsExpanded, sectionsLoaded]);

  // Pinned friendships
  const [pinnedFriendshipIds, setPinnedFriendshipIds] = useState<Set<string>>(new Set());

  // Debounce search input for live search
  useEffect(() => {
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = searchEmail.trim();
    latestQueryRef.current = trimmed;

    // Clear results if query is too short
    if (trimmed.length < 2) {
      setDebouncedQuery("");
      return;
    }

    // Set debounced query after 300ms
    debounceTimerRef.current = setTimeout(() => {
      // Only update if this is still the latest query
      if (latestQueryRef.current === trimmed) {
        setDebouncedQuery(trimmed);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchEmail]);

  // Live search query
  const {
    data: searchResults,
    isLoading: isSearching,
    error: searchError
  } = useQuery({
    queryKey: ["userSearch", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return { users: [] };
      const response = await api.get<SearchUsersRankedResponse>(
        `/api/profile/search?q=${encodeURIComponent(debouncedQuery)}&limit=15`
      );
      return response;
    },
    enabled: !!session && !!debouncedQuery && debouncedQuery.length >= 2 && networkStatus.isOnline,
    staleTime: 30000, // Cache for 30 seconds
    gcTime: 60000, // Keep in cache for 1 minute
  });

  const { data: friendsData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: !!session,
  });

  const { data: requestsData, refetch: refetchRequests } = useQuery({
    queryKey: ["friendRequests"],
    queryFn: () => api.get<GetFriendRequestsResponse>("/api/friends/requests"),
    enabled: !!session,
  });

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
      setShowAddFriend(false);
      setShowContactsModal(false);
      refetchRequests();
    },
    onError: () => {
      safeToast.error("Error", "Failed to send friend request");
    },
  });

  const acceptRequestMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.put<{ success: boolean; friendshipId?: string; friend?: { id: string; name: string | null; image: string | null } }>(`/api/friends/request/${requestId}`, { status: "accepted" }),
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetch();
      refetchRequests();

      // Track friend added for rate app prompt
      trackFriendAdded();

      // If we got a friendshipId back, show the add-to-groups modal
      if (data.friendshipId && data.friend) {
        setNewlyAcceptedFriend({
          friendshipId: data.friendshipId,
          friendName: data.friend.name ?? "your new friend",
          friendImage: data.friend.image,
        });
        setSelectedGroupIds([]);
        setShowAddToGroupsModal(true);
      }
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.put(`/api/friends/request/${requestId}`, { status: "rejected" }),
    onSuccess: () => {
      refetchRequests();
    },
  });

  // Add friend to multiple groups mutation
  const addFriendToGroupsMutation = useMutation({
    mutationFn: async ({ friendshipId, groupIds }: { friendshipId: string; groupIds: string[] }) => {
      // Add to each group sequentially
      for (const groupId of groupIds) {
        await api.post(`/api/groups/${groupId}/members`, { friendshipId });
      }
      return { success: true };
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAddToGroupsModal(false);
      setNewlyAcceptedFriend(null);
      setSelectedGroupIds([]);
      refetch(); // Refresh friends list to show group memberships
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: () => {
      safeToast.error("Error", "Failed to add friend to some groups");
    },
  });

  const loadContacts = async () => {
    setContactsLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        safeToast.warning("Permission Required", "Please allow access to contacts to add friends.");
        setContactsLoading(false);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Image,
        ],
        sort: Contacts.SortTypes.FirstName,
      });

      // Filter contacts that have either email or phone
      const validContacts = data.filter(
        (c) => (c.emails && c.emails.length > 0) || (c.phoneNumbers && c.phoneNumbers.length > 0)
      );
      setPhoneContacts(validContacts);
      setShowContactsModal(true);
    } catch (error) {
      console.error("Error loading contacts:", error);
      safeToast.error("Error", "Failed to load contacts");
    }
    setContactsLoading(false);
  };

  const handleInviteContact = (contact: Contacts.Contact) => {
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
  };

  const filteredContacts = phoneContacts.filter((contact) => {
    if (!contactSearch.trim()) return true;
    const search = contactSearch.toLowerCase();
    const name = contact.name?.toLowerCase() ?? "";
    const email = contact.emails?.[0]?.email?.toLowerCase() ?? "";
    return name.includes(search) || email.includes(search);
  });

  const friends = friendsData?.friends ?? [];
  const receivedRequests = requestsData?.received ?? [];

  // Fetch groups for filtering
  const { data: groupsData } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.get<GetGroupsResponse>("/api/groups"),
    enabled: !!session,
  });

  const groups = groupsData?.groups ?? [];

  // Fetch businesses user follows
  const { data: followedBusinessesData } = useQuery({
    queryKey: ["followedBusinesses"],
    queryFn: () => api.get<{ businesses: Business[] }>("/api/businesses/following"),
    enabled: !!session,
  });

  const followedBusinesses = followedBusinessesData?.businesses ?? [];

  // Fetch circles (Planning groups)
  const { data: circlesData, refetch: refetchCircles } = useQuery({
    queryKey: ["circles"],
    queryFn: () => api.get<GetCirclesResponse>("/api/circles"),
    enabled: !!session,
  });

  const circles = circlesData?.circles ?? [];

  // Fetch pinned friendships
  const { data: pinnedData } = useQuery({
    queryKey: ["pinnedFriendships"],
    queryFn: () => api.get<{ pinnedFriendshipIds: string[] }>("/api/circles/friends/pinned"),
    enabled: !!session,
  });

  // Update local state when pinned data loads
  useEffect(() => {
    if (pinnedData?.pinnedFriendshipIds) {
      setPinnedFriendshipIds(new Set(pinnedData.pinnedFriendshipIds));
    }
  }, [pinnedData]);

  // Circle mutations
  const createCircleMutation = useMutation({
    mutationFn: (data: { name: string; emoji?: string; memberIds: string[] }) =>
      api.post("/api/circles", data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetchCircles();
      setShowCreateCircle(false);
    },
    onError: () => {
      safeToast.error("Error", "Failed to create circle");
    },
  });

  const pinCircleMutation = useMutation({
    mutationFn: (circleId: string) => api.post(`/api/circles/${circleId}/pin`, {}),
    onSuccess: () => refetchCircles(),
  });

  const deleteCircleMutation = useMutation({
    mutationFn: (circleId: string) => api.delete(`/api/circles/${circleId}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetchCircles();
    },
  });

  // Pin friendship mutation
  const pinFriendshipMutation = useMutation({
    mutationFn: (friendshipId: string) =>
      api.post<{ isPinned: boolean }>(`/api/circles/friends/${friendshipId}/pin`, {}),
    onSuccess: (data, friendshipId) => {
      const newPinned = new Set(pinnedFriendshipIds);
      if (data.isPinned) {
        newPinned.add(friendshipId);
      } else {
        newPinned.delete(friendshipId);
      }
      setPinnedFriendshipIds(newPinned);
    },
  });

  // Update group mutation (for changing color)
  const updateGroupMutation = useMutation({
    mutationFn: ({ groupId, color }: { groupId: string; color: string }) =>
      api.put<{ group: FriendGroup }>(`/api/groups/${groupId}`, { color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setShowEditGroupModal(false);
      setEditingGroup(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  // Delete group mutation
  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => api.delete(`/api/groups/${groupId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      if (selectedGroupId === editingGroup?.id) {
        setSelectedGroupId(null);
      }
      setShowEditGroupModal(false);
      setEditingGroup(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  // Remove member from group mutation
  const removeMemberFromGroupMutation = useMutation({
    mutationFn: ({ groupId, friendshipId }: { groupId: string; friendshipId: string }) =>
      api.delete(`/api/groups/${groupId}/members/${friendshipId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
  });

  // Filter friends by selected group and sort by pinned status
  // Also filter out any friendships with undefined friend data to prevent crashes
  const filteredFriends = useMemo(() => {
    // First, filter out any friendships where friend is undefined
    let result = friends.filter((friendship) => friendship.friend != null);
    if (selectedGroupId) {
      result = result.filter((friendship) =>
        friendship.groupMemberships?.some((m) => m.groupId === selectedGroupId)
      );
    }
    // Sort pinned friends first
    return result.sort((a, b) => {
      const aPinned = pinnedFriendshipIds.has(a.id);
      const bPinned = pinnedFriendshipIds.has(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });
  }, [friends, selectedGroupId, pinnedFriendshipIds]);

  const selectedGroup = useMemo(() => {
    if (!selectedGroupId) return null;
    return groups.find((g) => g.id === selectedGroupId) ?? null;
  }, [groups, selectedGroupId]);

  if (!session) {
    return (
      <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-xl font-semibold mb-2" style={{ color: colors.text }}>
            Sign in to see your friends
          </Text>
          <Pressable
            onPress={() => router.push("/login")}
            className="px-6 py-3 rounded-full mt-4"
            style={{ backgroundColor: themeColor }}
          >
            <Text className="text-white font-semibold">Sign In</Text>
          </Pressable>
        </View>
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: colors.background }}>
      <View className="px-5 pt-2 pb-4 flex-row items-center justify-between">
        <Text className="text-3xl font-sora-bold" style={{ color: colors.text }}>Friends</Text>
        <View className="flex-row items-center">
          {receivedRequests.length > 0 && (
            <View
              className="w-6 h-6 rounded-full items-center justify-center mr-2"
              style={{ backgroundColor: themeColor }}
            >
              <Text className="text-white text-xs font-bold">{receivedRequests.length}</Text>
            </View>
          )}
          <Pressable
            onPress={() => setShowAddFriend(!showAddFriend)}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: themeColor }}
          >
            <UserPlus size={20} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Social Features Quick Access */}
      <View className="px-5 pb-3">
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/activity");
            }}
            className="flex-1 flex-row items-center justify-center px-3 py-2.5 rounded-xl"
            style={{ backgroundColor: "#2196F320", borderWidth: 1, borderColor: "#2196F330" }}
          >
            <Activity size={16} color="#2196F3" />
            <Text className="text-sm font-medium ml-2" style={{ color: "#2196F3" }}>
              Activity
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/suggestions");
            }}
            className="flex-1 flex-row items-center justify-center px-3 py-2.5 rounded-xl"
            style={{ backgroundColor: "#9C27B020", borderWidth: 1, borderColor: "#9C27B030" }}
          >
            <Sparkles size={16} color="#9C27B0" />
            <Text className="text-sm font-medium ml-2" style={{ color: "#9C27B0" }}>
              Suggestions
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={themeColor}
          />
        }
      >
        {/* Add Friend Section */}
        {showAddFriend && (
          <Animated.View entering={FadeInDown.springify()} className="mb-4">
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

              {/* Search Input - supports name, email, or phone */}
              <View className="flex-row items-center">
                <View className="flex-1 flex-row items-center rounded-lg px-3 mr-2" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
                  <Search size={18} color={colors.textSecondary} />
                  <TextInput
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
                  onPress={() => {
                    if (searchEmail.trim()) {
                      // Check if it looks like a phone number (mostly digits)
                      const cleaned = searchEmail.trim().replace(/[^\d]/g, '');
                      if (cleaned.length >= 7 && cleaned.length === searchEmail.trim().replace(/[\s\-\(\)]/g, '').length) {
                        sendRequestMutation.mutate({ phone: searchEmail.trim() });
                      } else {
                        sendRequestMutation.mutate({ email: searchEmail.trim() });
                      }
                    }
                  }}
                  disabled={sendRequestMutation.isPending}
                  className="px-4 py-3 rounded-lg"
                  style={{ backgroundColor: themeColor }}
                >
                  <Text className="text-white font-medium">
                    {sendRequestMutation.isPending ? "..." : "Add"}
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

                          <ChevronRight size={16} color={colors.textTertiary} />
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

        {/* Friend Requests */}
        {receivedRequests.length > 0 && (
          <View className="mb-4">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setRequestsExpanded(!requestsExpanded);
              }}
              className="flex-row items-center justify-between mb-2"
            >
              <View className="flex-row items-center">
                <Bell size={16} color={themeColor} />
                <Text className="text-sm font-semibold ml-1" style={{ color: colors.textSecondary }}>
                  Friend Requests ({receivedRequests.length})
                </Text>
              </View>
              {requestsExpanded ? (
                <ChevronUp size={18} color={colors.textTertiary} />
              ) : (
                <ChevronDown size={18} color={colors.textTertiary} />
              )}
            </Pressable>
            {requestsExpanded && (
              <Animated.View entering={FadeInDown.duration(200)}>
                {receivedRequests.map((request: FriendRequest) => {
                  const senderId = request.sender?.id;
                  return (
                    <FriendRequestCard
                      key={request.id}
                      request={request}
                      type="received"
                      themeColor={themeColor}
                      isDark={isDark}
                      colors={colors}
                      onAccept={() => acceptRequestMutation.mutate(request.id)}
                      onReject={() => rejectRequestMutation.mutate(request.id)}
                      onViewProfile={() => {
                        if (senderId) {
                          router.push(`/user/${senderId}` as any);
                        }
                      }}
                    />
                  );
                })}
              </Animated.View>
            )}
          </View>
        )}

        {/* Planning Section (Circles) */}
        <View className="mb-4">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setPlanningExpanded(!planningExpanded);
            }}
            className="flex-row items-center justify-between mb-2"
          >
            <View className="flex-row items-center">
              <Calendar size={16} color="#9333EA" />
              <Text className="text-sm font-semibold ml-1" style={{ color: colors.textSecondary }}>
                Planning ({circles.length})
              </Text>
            </View>
            <View className="flex-row items-center">
              {circles.length > 0 && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/circles" as any);
                  }}
                  className="mr-2"
                >
                  <Text className="text-xs font-medium" style={{ color: "#9333EA" }}>
                    View All
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  handleCreateCirclePress();
                }}
                className="w-7 h-7 rounded-full items-center justify-center mr-2"
                style={{ backgroundColor: "#9333EA" }}
              >
                <Plus size={14} color="#fff" />
              </Pressable>
              {planningExpanded ? (
                <ChevronUp size={18} color={colors.textTertiary} />
              ) : (
                <ChevronDown size={18} color={colors.textTertiary} />
              )}
            </View>
          </Pressable>

          {planningExpanded && (
            <Animated.View entering={FadeInDown.duration(200)}>
              {circles.length === 0 ? (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleCreateCirclePress();
                  }}
                  className="rounded-xl p-4 mb-2 border border-dashed items-center"
                  style={{ borderColor: "#9333EA50" }}
                >
                  <View
                    className="w-12 h-12 rounded-full items-center justify-center mb-2"
                    style={{ backgroundColor: "#9333EA20" }}
                  >
                    <Plus size={24} color="#9333EA" />
                  </View>
                  <Text className="font-medium text-center" style={{ color: colors.text }}>
                    Create a Circle
                  </Text>
                  <Text className="text-xs text-center mt-1" style={{ color: colors.textSecondary }}>
                    Group chat with calendar overlay to plan events together
                  </Text>
                </Pressable>
              ) : (
                circles.map((circle, index) => (
                  <CircleCard
                    key={circle.id}
                    circle={circle}
                    index={index}
                    onPin={(id) => pinCircleMutation.mutate(id)}
                    onDelete={(id) => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                      setCircleToLeave({ id, name: circle.name });
                      setShowLeaveCircleConfirm(true);
                    }}
                  />
                ))
              )}
            </Animated.View>
          )}
        </View>

        {/* Friends List - Collapsible */}
        <View className="mb-2">
          {/* Section Header Row */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setFriendsExpanded(!friendsExpanded);
            }}
            className="flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              <Users size={16} color="#4ECDC4" />
              <Text className="text-sm font-semibold ml-1" style={{ color: colors.textSecondary }}>
                {selectedGroup ? selectedGroup.name : "Friends"} ({filteredFriends.length})
              </Text>
              {selectedGroupId && filteredFriends.length !== friends.length && (
                <Text className="text-xs ml-1" style={{ color: colors.textTertiary }}>
                  of {friends.length}
                </Text>
              )}
            </View>
            {friendsExpanded ? (
              <ChevronUp size={18} color={colors.textTertiary} />
            ) : (
              <ChevronDown size={18} color={colors.textTertiary} />
            )}
          </Pressable>

          {/* View Mode Toggle & Filter - Only show when expanded */}
          {friendsExpanded && (
            <View className="flex-row items-center justify-between mt-2">
              {/* View Mode Toggle */}
              <View className="flex-row items-center rounded-lg p-0.5" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setViewMode("list");
                  }}
                  className="flex-row items-center px-2.5 py-1 rounded-md"
                  style={{ backgroundColor: viewMode === "list" ? colors.surface : "transparent" }}
                >
                  <List size={14} color={viewMode === "list" ? themeColor : colors.textSecondary} />
                  <Text
                    className="text-xs font-medium ml-1"
                    style={{ color: viewMode === "list" ? themeColor : colors.textSecondary }}
                  >
                    List
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setViewMode("detailed");
                  }}
                  className="flex-row items-center px-2.5 py-1 rounded-md"
                  style={{ backgroundColor: viewMode === "detailed" ? colors.surface : "transparent" }}
                >
                  <LayoutGrid size={14} color={viewMode === "detailed" ? themeColor : colors.textSecondary} />
                  <Text
                    className="text-xs font-medium ml-1"
                    style={{ color: viewMode === "detailed" ? themeColor : colors.textSecondary }}
                  >
                    Detailed
                  </Text>
                </Pressable>
              </View>

              {/* Group Filter Button */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowGroupFilter(true);
                }}
                className="flex-row items-center px-2.5 py-1.5 rounded-lg"
                style={{
                  backgroundColor: selectedGroupId ? (selectedGroup?.color ?? themeColor) + "15" : (isDark ? "#2C2C2E" : "#F3F4F6"),
                  borderWidth: selectedGroupId ? 1 : 0,
                  borderColor: selectedGroupId ? (selectedGroup?.color ?? themeColor) + "40" : "transparent",
                }}
              >
                <Filter size={14} color={selectedGroupId ? (selectedGroup?.color ?? themeColor) : colors.textSecondary} />
                <Text
                  className="text-xs font-medium ml-1"
                  style={{ color: selectedGroupId ? (selectedGroup?.color ?? themeColor) : colors.textSecondary }}
                  numberOfLines={1}
                >
                  {selectedGroup?.name ?? "All"}
                </Text>
                {selectedGroupId && (
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedGroupId(null);
                    }}
                    className="ml-1"
                  >
                    <X size={12} color={selectedGroup?.color ?? themeColor} />
                  </Pressable>
                )}
              </Pressable>
            </View>
          )}
        </View>

        {friendsExpanded && (
          <Animated.View entering={FadeInDown.duration(200)}>
            {isLoading ? (
              <FriendsListSkeleton />
            ) : filteredFriends.length === 0 ? (
              <View className="py-12 items-center px-8">
                <View className="w-20 h-20 rounded-full items-center justify-center mb-4" style={{ backgroundColor: `${themeColor}15` }}>
                  <Users size={36} color={themeColor} />
                </View>
                <Text className="text-xl font-semibold text-center mb-2" style={{ color: colors.text }}>
                  {selectedGroupId ? "No friends in this group" : "Add Your First Friend"}
                </Text>
                <Text className="text-sm text-center leading-5" style={{ color: colors.textSecondary }}>
                  {selectedGroupId
                    ? "Try selecting a different group or add friends to this group"
                    : "Connect with friends to share events and see what everyone is up to. Tap the + button above to get started!"}
                </Text>
                {selectedGroupId ? (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedGroupId(null);
                    }}
                    className="mt-4 px-6 py-3 rounded-full"
                    style={{ backgroundColor: themeColor }}
                  >
                    <Text className="text-white font-medium">Show All Friends</Text>
                  </Pressable>
                ) : (
                  <View className="flex-row mt-4">
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowAddFriend(true);
                      }}
                      className="px-6 py-3 rounded-full mr-2"
                      style={{ backgroundColor: themeColor }}
                    >
                      <Text className="text-white font-medium">+ Add</Text>
                    </Pressable>
                    <Pressable
                      onPress={async () => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        const { status } = await Contacts.requestPermissionsAsync();
                        if (status === "granted") {
                          setShowContactsModal(true);
                        } else {
                          safeToast.warning("Permission Required", "Please allow access to contacts to import friends.");
                        }
                      }}
                      className="px-6 py-3 rounded-full"
                      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                    >
                      <Text style={{ color: colors.text }} className="font-medium">From Contacts</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : viewMode === "list" ? (
              filteredFriends.map((friendship: Friendship, index: number) => (
                <FriendListItem key={friendship.id} friendship={friendship} index={index} />
              ))
            ) : (
              filteredFriends.map((friendship: Friendship, index: number) => (
                <FriendCard key={friendship.id} friendship={friendship} index={index} />
              ))
            )}
          </Animated.View>
        )}

        {/* Businesses You Follow Section - Hidden for now, will be re-enabled in future update */}
        {/* {followedBusinesses.length > 0 && (
          <View className="mt-6">
            ...
          </View>
        )} */}
      </ScrollView>

      {/* Create Circle Modal */}
      <CreateCircleModal
        visible={showCreateCircle}
        onClose={() => setShowCreateCircle(false)}
        onConfirm={(name, emoji, memberIds) => {
          createCircleMutation.mutate({ name, emoji, memberIds });
        }}
        friends={friends.filter((f) => f.friend != null).map((f) => ({
          id: f.id,
          friendId: f.friendId,
          friend: f.friend,
        }))}
        isLoading={createCircleMutation.isPending}
      />

      {/* Contacts Modal */}
      <Modal
        visible={showContactsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowContactsModal(false)}
      >
        <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: isDark ? "#1C1C1E" : "#F5F5F7" }}>
          <View className="flex-row items-center justify-between px-5 py-4" style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Pressable
              onPress={() => {
                setShowContactsModal(false);
                setContactSearch("");
              }}
              className="w-10"
            >
              <X size={24} color={colors.text} />
            </Pressable>
            <Text className="text-lg font-semibold" style={{ color: colors.text }}>
              Phone Contacts
            </Text>
            <View className="w-10" />
          </View>

          {/* Search */}
          <View className="px-4 py-3" style={{ backgroundColor: colors.surface }}>
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
              {contactSearch.length > 0 && (
                <Pressable onPress={() => setContactSearch("")}>
                  <X size={18} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>
          </View>

          <FlatList
            data={filteredContacts}
            keyExtractor={(item) => item.id ?? item.name ?? Math.random().toString()}
            contentContainerStyle={{ paddingVertical: 8 }}
            renderItem={({ item: contact }) => {
              const hasEmail = contact.emails && contact.emails.length > 0;
              const hasPhone = contact.phoneNumbers && contact.phoneNumbers.length > 0;
              const canInvite = hasEmail || hasPhone;
              const email = contact.emails?.[0]?.email;
              const phone = contact.phoneNumbers?.[0]?.number;

              return (
                <Pressable
                  onPress={() => handleInviteContact(contact)}
                  className="flex-row items-center mx-4 mb-2 p-4 rounded-xl"
                  style={{
                    backgroundColor: colors.surface,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05,
                    shadowRadius: 4,
                  }}
                >
                  <View className="w-12 h-12 rounded-full mr-3 items-center justify-center" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
                    {contact.imageAvailable && contact.image?.uri ? (
                      <Image
                        source={{ uri: contact.image.uri }}
                        className="w-full h-full rounded-full"
                      />
                    ) : (
                      <Text className="text-lg font-semibold" style={{ color: colors.textSecondary }}>
                        {contact.name?.[0]?.toUpperCase() ?? "?"}
                      </Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="font-medium" style={{ color: colors.text }}>
                      {contact.name ?? "Unknown"}
                    </Text>
                    {email ? (
                      <View className="flex-row items-center mt-0.5">
                        <Mail size={12} color={colors.textSecondary} />
                        <Text className="text-sm ml-1" style={{ color: colors.textSecondary }}>{email}</Text>
                      </View>
                    ) : phone ? (
                      <View className="flex-row items-center mt-0.5">
                        <Phone size={12} color={colors.textSecondary} />
                        <Text className="text-sm ml-1" style={{ color: colors.textSecondary }}>{phone}</Text>
                      </View>
                    ) : null}
                  </View>
                  {canInvite ? (
                    <View
                      className="px-3 py-1.5 rounded-full"
                      style={{ backgroundColor: themeColor }}
                    >
                      <Text className="text-white text-sm font-medium">Invite</Text>
                    </View>
                  ) : (
                    <View className="px-3 py-1.5 rounded-full" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
                      <Text className="text-sm" style={{ color: colors.textSecondary }}>No info</Text>
                    </View>
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View className="py-12 items-center">
                <Contact size={48} color={colors.border} />
                <Text className="mt-3" style={{ color: colors.textSecondary }}>
                  {contactSearch ? "No contacts found" : "No contacts available"}
                </Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

      {/* Group Filter Modal */}
      <Modal
        visible={showGroupFilter}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowGroupFilter(false)}
      >
        <View className="flex-1" style={{ backgroundColor: colors.background }}>
          <View className="px-5 py-4 flex-row items-center justify-between border-b" style={{ borderBottomColor: colors.border }}>
            <Text className="text-lg font-semibold" style={{ color: colors.text }}>
              Filter by Group
            </Text>
            <Pressable
              onPress={() => setShowGroupFilter(false)}
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView className="flex-1 px-5 py-4">
            {/* All Friends Option */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedGroupId(null);
                setShowGroupFilter(false);
              }}
              className="flex-row items-center rounded-xl p-4 mb-2 border"
              style={{
                backgroundColor: !selectedGroupId ? themeColor + "10" : colors.surface,
                borderColor: !selectedGroupId ? themeColor + "40" : colors.border,
              }}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: themeColor + "20" }}
              >
                <Users size={18} color={themeColor} />
              </View>
              <View className="flex-1">
                <Text className="font-semibold" style={{ color: colors.text }}>
                  All Friends
                </Text>
                <Text className="text-sm" style={{ color: colors.textTertiary }}>
                  {friends.length} friends
                </Text>
              </View>
              {!selectedGroupId && (
                <View
                  className="w-8 h-8 rounded-full items-center justify-center"
                  style={{ backgroundColor: themeColor }}
                >
                  <Check size={16} color="#fff" />
                </View>
              )}
            </Pressable>

            {/* Divider */}
            {groups.length > 0 && (
              <View className="flex-row items-center my-3">
                <View className="flex-1 h-px" style={{ backgroundColor: colors.border }} />
                <Text className="text-xs mx-3" style={{ color: colors.textTertiary }}>Your Groups</Text>
                <View className="flex-1 h-px" style={{ backgroundColor: colors.border }} />
              </View>
            )}

            {/* Groups List */}
            {groups.length === 0 ? (
              <View className="rounded-xl p-6 border items-center" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
                <Users size={32} color={colors.textTertiary} />
                <Text className="mt-3 mb-1 font-medium" style={{ color: colors.textSecondary }}>No groups yet</Text>
                <Text className="text-sm text-center" style={{ color: colors.textTertiary }}>
                  Create groups from your Profile to organize friends
                </Text>
              </View>
            ) : (
              <>
                {groups.map((group) => {
                  const isSelected = selectedGroupId === group.id;
                  const memberCount = group.memberships?.length ?? 0;

                  return (
                    <Pressable
                      key={group.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedGroupId(group.id);
                        setShowGroupFilter(false);
                      }}
                      onLongPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                        setEditingGroup(group);
                        setEditGroupColor(group.color);
                        setShowEditGroupModal(true);
                      }}
                      delayLongPress={400}
                      className="flex-row items-center rounded-xl p-4 mb-2 border"
                      style={{
                        backgroundColor: isSelected ? group.color + "10" : colors.surface,
                        borderColor: isSelected ? group.color + "40" : colors.border,
                      }}
                    >
                      <View
                        className="w-10 h-10 rounded-full items-center justify-center mr-3"
                        style={{ backgroundColor: group.color + "20" }}
                      >
                        <Users size={18} color={group.color} />
                      </View>
                      <View className="flex-1">
                        <Text className="font-semibold" style={{ color: colors.text }}>
                          {group.name}
                        </Text>
                        <Text className="text-sm" style={{ color: colors.textTertiary }}>
                          {memberCount} {memberCount === 1 ? "friend" : "friends"}
                        </Text>
                      </View>
                      {isSelected && (
                        <View
                          className="w-8 h-8 rounded-full items-center justify-center"
                          style={{ backgroundColor: group.color }}
                        >
                          <Check size={16} color="#fff" />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
                {/* Hint text for long-press */}
                <Text className="text-center text-xs mt-2 mb-1" style={{ color: colors.textTertiary }}>
                  Long-press a group to edit color or remove members
                </Text>
              </>
            )}
          </ScrollView>

          <View className="px-5 py-4 pb-8 border-t" style={{ borderTopColor: colors.border }}>
            <Pressable
              onPress={() => setShowGroupFilter(false)}
              className="py-4 rounded-xl"
              style={{ backgroundColor: themeColor }}
            >
              <Text className="text-white text-center font-semibold">Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Add to Groups Modal (shown after accepting friend request) */}
      <Modal
        visible={showAddToGroupsModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowAddToGroupsModal(false);
          setNewlyAcceptedFriend(null);
          setSelectedGroupIds([]);
        }}
      >
        <Pressable
          className="flex-1 justify-center px-5"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => {
            setShowAddToGroupsModal(false);
            setNewlyAcceptedFriend(null);
            setSelectedGroupIds([]);
          }}
        >
          <Pressable onPress={() => {}}>
            <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surface, maxHeight: "80%" }}>
              {/* Header */}
              <View className="px-5 py-4 border-b items-center" style={{ borderColor: colors.border }}>
                {/* Friend Avatar */}
                <View className="w-16 h-16 rounded-full mb-3 items-center justify-center overflow-hidden" style={{ backgroundColor: themeColor + "20" }}>
                  {newlyAcceptedFriend?.friendImage ? (
                    <Image source={{ uri: newlyAcceptedFriend.friendImage }} className="w-full h-full" />
                  ) : (
                    <Text className="text-2xl font-bold" style={{ color: themeColor }}>
                      {newlyAcceptedFriend?.friendName?.[0]?.toUpperCase() ?? "?"}
                    </Text>
                  )}
                </View>
                <Text className="text-lg font-bold text-center" style={{ color: colors.text }}>
                  {newlyAcceptedFriend?.friendName} is now your friend!
                </Text>
                <Text className="text-sm text-center mt-1" style={{ color: colors.textSecondary }}>
                  Add them to groups to see their events
                </Text>
              </View>

              {/* Groups List */}
              <ScrollView className="max-h-80" contentContainerStyle={{ padding: 16 }}>
                {groups.length === 0 ? (
                  <View className="py-6 items-center">
                    <Users size={32} color={colors.textTertiary} />
                    <Text className="mt-3 text-center" style={{ color: colors.textSecondary }}>
                      You don't have any groups yet.
                    </Text>
                    <Text className="text-sm text-center mt-1" style={{ color: colors.textTertiary }}>
                      Create groups from your Profile to organize friends.
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text className="text-sm font-medium mb-3" style={{ color: colors.textSecondary }}>
                      Select groups to add {newlyAcceptedFriend?.friendName?.split(" ")[0] ?? "them"} to:
                    </Text>
                    {groups.map((group) => {
                      const isSelected = selectedGroupIds.includes(group.id);
                      return (
                        <Pressable
                          key={group.id}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (isSelected) {
                              setSelectedGroupIds(selectedGroupIds.filter((id) => id !== group.id));
                            } else {
                              setSelectedGroupIds([...selectedGroupIds, group.id]);
                            }
                          }}
                          className="flex-row items-center rounded-xl p-3 mb-2"
                          style={{
                            backgroundColor: isSelected ? group.color + "15" : (isDark ? "#2C2C2E" : "#F9FAFB"),
                            borderWidth: isSelected ? 1 : 0,
                            borderColor: isSelected ? group.color + "50" : "transparent",
                          }}
                        >
                          <View
                            className="w-10 h-10 rounded-full items-center justify-center mr-3"
                            style={{ backgroundColor: group.color + "20" }}
                          >
                            <Users size={18} color={group.color} />
                          </View>
                          <View className="flex-1">
                            <Text className="font-medium" style={{ color: colors.text }}>
                              {group.name}
                            </Text>
                            <Text className="text-xs" style={{ color: colors.textTertiary }}>
                              {group.memberships?.length ?? 0} friends
                            </Text>
                          </View>
                          <View
                            className="w-6 h-6 rounded-full items-center justify-center"
                            style={{
                              backgroundColor: isSelected ? group.color : (isDark ? "#3C3C3E" : "#E5E7EB"),
                            }}
                          >
                            {isSelected && <Check size={14} color="#fff" />}
                          </View>
                        </Pressable>
                      );
                    })}

                    {/* Select All / Deselect All */}
                    {groups.length > 1 && (
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          if (selectedGroupIds.length === groups.length) {
                            setSelectedGroupIds([]);
                          } else {
                            setSelectedGroupIds(groups.map((g) => g.id));
                          }
                        }}
                        className="mt-2"
                      >
                        <Text className="text-center font-medium" style={{ color: themeColor }}>
                          {selectedGroupIds.length === groups.length ? "Deselect All" : "Select All Groups"}
                        </Text>
                      </Pressable>
                    )}
                  </>
                )}
              </ScrollView>

              {/* Actions */}
              <View className="px-4 py-4 border-t" style={{ borderColor: colors.border }}>
                {groups.length > 0 && selectedGroupIds.length > 0 && (
                  <Pressable
                    onPress={() => {
                      if (newlyAcceptedFriend) {
                        addFriendToGroupsMutation.mutate({
                          friendshipId: newlyAcceptedFriend.friendshipId,
                          groupIds: selectedGroupIds,
                        });
                      }
                    }}
                    disabled={addFriendToGroupsMutation.isPending}
                    className="py-3.5 rounded-xl mb-2"
                    style={{ backgroundColor: themeColor }}
                  >
                    <Text className="text-white text-center font-semibold">
                      {addFriendToGroupsMutation.isPending
                        ? "Adding..."
                        : `Add to ${selectedGroupIds.length} Group${selectedGroupIds.length > 1 ? "s" : ""}`}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => {
                    setShowAddToGroupsModal(false);
                    setNewlyAcceptedFriend(null);
                    setSelectedGroupIds([]);
                  }}
                  className="py-3.5 rounded-xl"
                  style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                >
                  <Text className="text-center font-medium" style={{ color: colors.text }}>
                    {groups.length === 0 || selectedGroupIds.length === 0 ? "Done" : "Skip for Now"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit Group Modal */}
      <Modal
        visible={showEditGroupModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowEditGroupModal(false);
          setEditingGroup(null);
        }}
      >
        <Pressable
          className="flex-1 justify-center px-5"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => {
            setShowEditGroupModal(false);
            setEditingGroup(null);
          }}
        >
          <Pressable onPress={() => {}}>
            <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surface, maxHeight: "80%" }}>
              {/* Header */}
              <View className="px-5 py-4 border-b" style={{ borderColor: colors.border }}>
                <View className="flex-row items-center justify-between">
                  <Text className="text-lg font-bold" style={{ color: colors.text }}>
                    Edit Group
                  </Text>
                  <Pressable
                    onPress={() => {
                      setShowEditGroupModal(false);
                      setEditingGroup(null);
                    }}
                    className="p-2 -mr-2"
                  >
                    <X size={20} color={colors.textTertiary} />
                  </Pressable>
                </View>
                {editingGroup && (
                  <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                    {editingGroup.name}
                  </Text>
                )}
              </View>

              <ScrollView className="p-5" style={{ maxHeight: 400 }}>
                {/* Color Picker Section */}
                <Text className="font-semibold mb-3" style={{ color: colors.text }}>
                  Group Color
                </Text>
                <View className="flex-row flex-wrap mb-6">
                  {GROUP_COLORS.map((color) => (
                    <Pressable
                      key={color}
                      onPress={() => setEditGroupColor(color)}
                      className="mr-3 mb-3"
                    >
                      <View
                        className="w-10 h-10 rounded-full items-center justify-center"
                        style={{
                          backgroundColor: color,
                          borderWidth: editGroupColor === color ? 3 : 0,
                          borderColor: isDark ? "#fff" : "#000",
                        }}
                      >
                        {editGroupColor === color && (
                          <Check size={18} color="#fff" />
                        )}
                      </View>
                    </Pressable>
                  ))}
                </View>

                {/* Save Color Button */}
                {editingGroup && editGroupColor !== editingGroup.color && (
                  <Pressable
                    onPress={() => {
                      if (editingGroup) {
                        updateGroupMutation.mutate({
                          groupId: editingGroup.id,
                          color: editGroupColor,
                        });
                      }
                    }}
                    disabled={updateGroupMutation.isPending}
                    className="py-3 rounded-xl mb-6"
                    style={{ backgroundColor: editGroupColor }}
                  >
                    <Text className="text-white text-center font-semibold">
                      {updateGroupMutation.isPending ? "Saving..." : "Save Color"}
                    </Text>
                  </Pressable>
                )}

                {/* Members Section */}
                {editingGroup && (editingGroup.memberships?.length ?? 0) > 0 && (
                  <>
                    <Text className="font-semibold mb-3" style={{ color: colors.text }}>
                      Members ({editingGroup.memberships?.length ?? 0})
                    </Text>
                    <Text className="text-xs mb-3" style={{ color: colors.textTertiary }}>
                      Tap the X to remove a friend from this group
                    </Text>
                    {editingGroup.memberships?.map((membership) => {
                      // Find the friend data from our friends list
                      const friendData = friends.find(f => f.id === membership.friendshipId)?.friend;
                      return (
                        <View
                          key={membership.friendshipId}
                          className="flex-row items-center p-3 rounded-xl mb-2 border"
                          style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                        >
                          <View
                            className="w-10 h-10 rounded-full mr-3 items-center justify-center overflow-hidden"
                            style={{ backgroundColor: editGroupColor + "20" }}
                          >
                            {friendData?.image ? (
                              <Image source={{ uri: friendData.image }} className="w-full h-full" />
                            ) : (
                              <Text className="font-semibold" style={{ color: editGroupColor }}>
                                {friendData?.name?.[0] ?? "?"}
                              </Text>
                            )}
                          </View>
                          <View className="flex-1">
                            <Text className="font-medium" style={{ color: colors.text }}>
                              {friendData?.name ?? "Unknown"}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => {
                              if (editingGroup) {
                                removeMemberFromGroupMutation.mutate({
                                  groupId: editingGroup.id,
                                  friendshipId: membership.friendshipId,
                                });
                                // Update local state to reflect removal
                                setEditingGroup({
                                  ...editingGroup,
                                  memberships: editingGroup.memberships?.filter(
                                    m => m.friendshipId !== membership.friendshipId
                                  ),
                                });
                              }
                            }}
                            className="p-2 rounded-full"
                            style={{ backgroundColor: isDark ? "#3C3C3E" : "#F3F4F6" }}
                          >
                            <X size={16} color={colors.textTertiary} />
                          </Pressable>
                        </View>
                      );
                    })}
                  </>
                )}

                {/* Delete Group Button */}
                <View className="mt-4 pt-4 border-t" style={{ borderTopColor: colors.border }}>
                  <Pressable
                    onPress={() => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                      setShowDeleteGroupConfirm(true);
                    }}
                    disabled={deleteGroupMutation.isPending}
                    className="py-3 rounded-xl flex-row items-center justify-center"
                    style={{ backgroundColor: "#EF444420" }}
                  >
                    <Trash2 size={18} color="#EF4444" />
                    <Text className="font-semibold ml-2" style={{ color: "#EF4444" }}>
                      {deleteGroupMutation.isPending ? "Deleting..." : "Delete Group"}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Paywall Modal for circles gating */}
      <PaywallModal
        visible={showPaywallModal}
        context={paywallContext}
        onClose={() => setShowPaywallModal(false)}
      />

      {/* Leave Circle Confirmation */}
      <ConfirmModal
        visible={showLeaveCircleConfirm}
        title="Leave Circle"
        message={`Are you sure you want to leave "${circleToLeave?.name}"?`}
        confirmText="Leave"
        isDestructive
        onConfirm={() => {
          if (circleToLeave) {
            deleteCircleMutation.mutate(circleToLeave.id);
          }
          setShowLeaveCircleConfirm(false);
          setCircleToLeave(null);
        }}
        onCancel={() => {
          setShowLeaveCircleConfirm(false);
          setCircleToLeave(null);
        }}
      />

      {/* Delete Group Confirmation */}
      <ConfirmModal
        visible={showDeleteGroupConfirm}
        title="Delete Group"
        message={`Are you sure you want to delete "${editingGroup?.name}"? This cannot be undone.`}
        confirmText="Delete"
        isDestructive
        onConfirm={() => {
          if (editingGroup) {
            deleteGroupMutation.mutate(editingGroup.id);
          }
          setShowDeleteGroupConfirm(false);
        }}
        onCancel={() => setShowDeleteGroupConfirm(false)}
      />

      <BottomNavigation />
    </SafeAreaView>
  );
}
