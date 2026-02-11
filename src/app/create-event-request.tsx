import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  Platform,
  ActivityIndicator,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import {
  MapPin,
  Clock,
  Users,
  ChevronDown,
  Check,
  X,
  Calendar,
  Search,
  Navigation,
  Sparkles,
  UserPlus,
} from "@/ui/icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useSession } from "@/lib/useSession";
import { EntityAvatar } from "@/components/EntityAvatar";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { devLog, devError } from "@/lib/devLog";
import { Button } from "@/ui/Button";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import {
  type GetFriendsResponse,
  type Friendship,
  type CreateEventRequestResponse,
  type GetSuggestedTimesResponse,
  type TimeSlot,
} from "@/shared/contracts";

const EMOJI_OPTIONS = ["📅", "🏃", "🎬", "🎮", "💃", "🍽️", "☕", "🎉", "🏋️", "📚", "🎵", "⚽"];

export default function CreateEventRequestScreen() {
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const { themeColor, isDark, colors } = useTheme();

  const getInitialDate = () => {
    if (date) {
      const parsedDate = new Date(date);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    }
    // [P1_AUTOFILL_DEFAULTS] No explicit date param — default to next 6 PM
    const now = new Date();
    const evening = new Date(now);
    evening.setHours(18, 0, 0, 0);
    if (evening.getTime() <= now.getTime()) {
      evening.setDate(evening.getDate() + 1);
    }
    if (__DEV__) {
      devLog('[P1_AUTOFILL_DEFAULTS]', {
        applied: ['startTime'],
        startTime: evening.toISOString(),
        reason: 'no_date_param_next_evening',
        screen: 'create-event-request',
      });
    }
    return evening;
  };

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [emoji, setEmoji] = useState("📅");
  const [startDate, setStartDate] = useState(getInitialDate);
  const [endDate, setEndDate] = useState(() => {
    const initial = getInitialDate();
    return new Date(initial.getTime() + 60 * 60 * 1000); // Default: start + 1 hour
  });
  const [userModifiedEndTime, setUserModifiedEndTime] = useState(false); // Track if user manually changed end time
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [friendSearch, setFriendSearch] = useState("");

  // Auto-update endDate when startDate changes (if user hasn't manually set it)
  useEffect(() => {
    if (!userModifiedEndTime) {
      const newEndDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      setEndDate(newEndDate);
    }
  }, [startDate, userModifiedEndTime]);

  // Fetch friends
  const { data: friendsData } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  const friends = friendsData?.friends ?? [];

  // Filter friends by search
  const filteredFriends = useMemo(() => {
    if (!friendSearch) return friends;
    const search = friendSearch.toLowerCase();
    return friends.filter(
      (f) =>
        f.friend.name?.toLowerCase().includes(search) ||
        f.friend.email?.toLowerCase().includes(search)
    );
  }, [friends, friendSearch]);

  // Fetch suggested times when friends are selected
  const endDateRange = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d;
  }, []);

  const { data: suggestedTimesData, isLoading: isLoadingSuggestions } = useQuery({
    queryKey: ["suggested-times", selectedFriendIds, startDate.toISOString()],
    queryFn: () =>
      api.post<GetSuggestedTimesResponse>("/api/events/suggested-times", {
        friendIds: selectedFriendIds,
        dateRange: {
          start: new Date().toISOString(),
          end: endDateRange.toISOString(),
        },
        duration: 60,
      }),
    enabled: isAuthedForNetwork(bootStatus, session) && selectedFriendIds.length > 0,
  });

  const suggestedSlots = suggestedTimesData?.slots ?? [];

  const toggleFriend = (friendId: string) => {
    Haptics.selectionAsync();
    setSelectedFriendIds((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId]
    );
  };

  const createMutation = useMutation({
    mutationFn: (data: {
      title: string;
      description?: string;
      location?: string;
      emoji?: string;
      startTime: string;
      endTime: string;
      memberIds: string[];
    }) => api.post<CreateEventRequestResponse>("/api/event-requests", data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["event-requests"] });
      router.back();
    },
    onError: (error) => {
      devError("Failed to create event request:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const handleCreate = () => {
    if (!title.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    // Validate endTime > startTime
    if (endDate <= startDate) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    if (selectedFriendIds.length === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      emoji,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      memberIds: selectedFriendIds,
    });
  };

  const handleSelectSlot = (slot: TimeSlot) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStartDate(new Date(slot.start));
  };

  const formatTimeSlot = (slot: TimeSlot) => {
    const start = new Date(slot.start);
    const dateStr = start.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const timeStr = start.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return { date: dateStr, time: timeStr };
  };

  const selectedFriends = friends.filter((f) =>
    selectedFriendIds.includes(f.friendId)
  );

  if (!session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Propose Event" }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in to propose events</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: "Propose Event",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Info */}
          <Animated.View entering={FadeInDown.delay(0).springify()} className="mb-6 mt-4">
            <View
              className="rounded-2xl p-4 flex-row items-center"
              style={{ backgroundColor: `${themeColor}15`, borderWidth: 1, borderColor: `${themeColor}30` }}
            >
              <View
                className="w-12 h-12 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: `${themeColor}20` }}
              >
                <UserPlus size={24} color={themeColor} />
              </View>
              <View className="flex-1">
                <Text className="font-semibold" style={{ color: colors.text }}>
                  Propose Event
                </Text>
                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                  Invite friends - event is created when everyone accepts
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* Emoji Picker */}
          <Animated.View entering={FadeInDown.delay(50).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">
              Event Icon
            </Text>
            <Pressable
              onPress={() => setShowEmojiPicker(!showEmojiPicker)}
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View
                    className="w-12 h-12 rounded-xl items-center justify-center mr-3"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#FFF7ED" }}
                  >
                    <Text className="text-2xl">{emoji}</Text>
                  </View>
                  <Text style={{ color: colors.textSecondary }}>Tap to change icon</Text>
                </View>
                <ChevronDown size={20} color={colors.textTertiary} />
              </View>
            </Pressable>

            {showEmojiPicker && (
              <View
                className="rounded-xl p-4 mb-4"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <View className="flex-row flex-wrap justify-between">
                  {EMOJI_OPTIONS.map((e) => (
                    <Pressable
                      key={e}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setEmoji(e);
                        setShowEmojiPicker(false);
                      }}
                      className="w-12 h-12 rounded-xl items-center justify-center mb-2"
                      style={{
                        backgroundColor:
                          emoji === e ? `${themeColor}20` : isDark ? "#2C2C2E" : "#F9FAFB",
                      }}
                    >
                      <Text className="text-2xl">{e}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </Animated.View>

          {/* Title */}
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">
              Title *
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="What are you planning?"
              placeholderTextColor={colors.textTertiary}
              className="rounded-xl p-4 mb-4"
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.text,
              }}
            />
          </Animated.View>

          {/* Description */}
          <Animated.View entering={FadeInDown.delay(150).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">
              Description
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Add some details..."
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={3}
              className="rounded-xl p-4 mb-4"
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.text,
                minHeight: 80,
                textAlignVertical: "top",
              }}
            />
          </Animated.View>

          {/* Location */}
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">
              Location
            </Text>
            <View
              className="rounded-xl flex-row items-center px-4 mb-4"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <MapPin size={18} color={colors.textTertiary} />
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="Where?"
                placeholderTextColor={colors.textTertiary}
                className="flex-1 p-4"
                style={{ color: colors.text }}
              />
            </View>
          </Animated.View>

          {/* Friends Selection */}
          <Animated.View entering={FadeInDown.delay(250).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">
              Invite Friends *
            </Text>
            <Pressable
              onPress={() => setShowFriendPicker(!showFriendPicker)}
              className="rounded-xl p-4 mb-2"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center flex-1">
                  <Users size={20} color={themeColor} />
                  <Text className="ml-3" style={{ color: colors.text }}>
                    {selectedFriendIds.length === 0
                      ? "Select friends to invite"
                      : `${selectedFriendIds.length} friend${selectedFriendIds.length !== 1 ? "s" : ""} selected`}
                  </Text>
                </View>
                <ChevronDown size={20} color={colors.textTertiary} />
              </View>
            </Pressable>

            {/* Selected Friends Preview */}
            {selectedFriends.length > 0 && (
              <View className="flex-row flex-wrap mb-2">
                {selectedFriends.map((f) => (
                  <Pressable
                    key={f.friendId}
                    onPress={() => toggleFriend(f.friendId)}
                    className="flex-row items-center rounded-full px-3 py-1.5 mr-2 mb-2"
                    style={{ backgroundColor: `${themeColor}20`, borderWidth: 1, borderColor: themeColor }}
                  >
                    <EntityAvatar
                      photoUrl={f.friend.image}
                      initials={f.friend.name?.[0] ?? "?"}
                      size={24}
                      backgroundColor={`${themeColor}30`}
                      foregroundColor={themeColor}
                      style={{ marginRight: 8 }}
                    />
                    <Text className="text-sm font-medium" style={{ color: themeColor }}>
                      {f.friend.name?.split(" ")[0] ?? "Friend"}
                    </Text>
                    <X size={14} color={themeColor} style={{ marginLeft: 6 }} />
                  </Pressable>
                ))}
              </View>
            )}

            {/* Friend Picker Dropdown */}
            {showFriendPicker && (
              <Animated.View
                entering={FadeIn.duration(200)}
                className="rounded-xl mb-4 overflow-hidden"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                {/* Search */}
                <View
                  className="flex-row items-center px-4 py-3"
                  style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
                >
                  <Search size={16} color={colors.textTertiary} />
                  <TextInput
                    value={friendSearch}
                    onChangeText={setFriendSearch}
                    placeholder="Search friends..."
                    placeholderTextColor={colors.textTertiary}
                    className="flex-1 ml-2"
                    style={{ color: colors.text }}
                  />
                </View>

                {/* Friend List */}
                <View style={{ maxHeight: 250 }}>
                  <ScrollView nestedScrollEnabled>
                    {filteredFriends.length === 0 ? (
                      <View className="p-4 items-center">
                        <Text style={{ color: colors.textTertiary }}>No friends found</Text>
                      </View>
                    ) : (
                      filteredFriends.map((f) => {
                        const isSelected = selectedFriendIds.includes(f.friendId);
                        return (
                          <Pressable
                            key={f.friendId}
                            onPress={() => toggleFriend(f.friendId)}
                            className="flex-row items-center p-3"
                            style={{
                              backgroundColor: isSelected ? `${themeColor}10` : "transparent",
                            }}
                          >
                            <EntityAvatar
                              photoUrl={f.friend.image}
                              initials={f.friend.name?.[0] ?? "?"}
                              size={40}
                              backgroundColor={f.friend.image ? (isDark ? "#2C2C2E" : "#E5E7EB") : `${themeColor}30`}
                              foregroundColor={themeColor}
                              style={{ marginRight: 12 }}
                            />
                            <View className="flex-1">
                              <Text className="font-medium" style={{ color: colors.text }}>
                                {f.friend.name ?? "Unknown"}
                              </Text>
                              <Text className="text-xs" style={{ color: colors.textTertiary }}>
                                {f.friend.email}
                              </Text>
                            </View>
                            <View
                              className="w-6 h-6 rounded-full items-center justify-center"
                              style={{
                                backgroundColor: isSelected ? themeColor : colors.border,
                              }}
                            >
                              {isSelected && <Check size={14} color="#fff" />}
                            </View>
                          </Pressable>
                        );
                      })
                    )}
                  </ScrollView>
                </View>

                <Pressable
                  onPress={() => setShowFriendPicker(false)}
                  className="p-3 items-center"
                  style={{ borderTopWidth: 1, borderTopColor: colors.border }}
                >
                  <Text className="font-medium" style={{ color: themeColor }}>
                    Done
                  </Text>
                </Pressable>
              </Animated.View>
            )}
          </Animated.View>

          {/* Date & Time */}
          <Animated.View entering={FadeInDown.delay(300).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">
              Start
            </Text>
            <View className="flex-row mb-3">
              <Pressable
                onPress={() => setShowDatePicker(true)}
                className="flex-1 rounded-xl p-4 mr-2 flex-row items-center"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <Calendar size={18} color={themeColor} />
                <Text style={{ color: colors.text}} className="ml-2">
                  {startDate.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowTimePicker(true)}
                className="flex-1 rounded-xl p-4 flex-row items-center"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <Clock size={18} color="#4ECDC4" />
                <Text style={{ color: colors.text }} className="ml-2">
                  {startDate.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
              </Pressable>
            </View>

            {/* End Date & Time */}
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">
              End
            </Text>
            <View className="flex-row mb-4">
              <Pressable
                onPress={() => setShowEndDatePicker(true)}
                className="flex-1 rounded-xl p-4 mr-2 flex-row items-center"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <Calendar size={18} color={themeColor} />
                <Text style={{ color: colors.text }} className="ml-2">
                  {endDate.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowEndTimePicker(true)}
                className="flex-1 rounded-xl p-4 flex-row items-center"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <Clock size={18} color="#4ECDC4" />
                <Text style={{ color: colors.text }} className="ml-2">
                  {endDate.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
              </Pressable>
            </View>

            {showDatePicker && (
              <View
                className="rounded-xl mb-4 overflow-hidden"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display="spinner"
                  textColor={isDark ? "#FFFFFF" : "#000000"}
                  themeVariant={isDark ? "dark" : "light"}
                  onChange={(event, newDate) => {
                    if (Platform.OS === "android") {
                      setShowDatePicker(false);
                    }
                    if (newDate) setStartDate(newDate);
                  }}
                  style={{ height: 150 }}
                />
                {Platform.OS === "ios" && (
                  <Pressable
                    onPress={() => setShowDatePicker(false)}
                    className="py-3 items-center"
                    style={{ backgroundColor: themeColor }}
                  >
                    <Text className="text-white font-semibold">Done</Text>
                  </Pressable>
                )}
              </View>
            )}

            {showTimePicker && (
              <View
                className="rounded-xl mb-4 overflow-hidden"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <DateTimePicker
                  value={startDate}
                  mode="time"
                  display="spinner"
                  textColor={isDark ? "#FFFFFF" : "#000000"}
                  themeVariant={isDark ? "dark" : "light"}
                  onChange={(event, newDate) => {
                    if (Platform.OS === "android") {
                      setShowTimePicker(false);
                    }
                    if (newDate) setStartDate(newDate);
                  }}
                  style={{ height: 150 }}
                />
                {Platform.OS === "ios" && (
                  <Pressable
                    onPress={() => setShowTimePicker(false)}
                    className="py-3 items-center"
                    style={{ backgroundColor: themeColor }}
                  >
                    <Text className="text-white font-semibold">Done</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* End Date Picker */}
            {showEndDatePicker && (
              <View
                className="rounded-xl mb-4 overflow-hidden"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <DateTimePicker
                  value={endDate}
                  mode="date"
                  display="spinner"
                  textColor={isDark ? "#FFFFFF" : "#000000"}
                  themeVariant={isDark ? "dark" : "light"}
                  onChange={(event, newDate) => {
                    if (Platform.OS === "android") {
                      setShowEndDatePicker(false);
                    }
                    if (newDate) {
                      setEndDate(newDate);
                      setUserModifiedEndTime(true);
                    }
                  }}
                  style={{ height: 150 }}
                />
                {Platform.OS === "ios" && (
                  <Pressable
                    onPress={() => setShowEndDatePicker(false)}
                    className="py-3 items-center"
                    style={{ backgroundColor: themeColor }}
                  >
                    <Text className="text-white font-semibold">Done</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* End Time Picker */}
            {showEndTimePicker && (
              <View
                className="rounded-xl mb-4 overflow-hidden"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <DateTimePicker
                  value={endDate}
                  mode="time"
                  display="spinner"
                  textColor={isDark ? "#FFFFFF" : "#000000"}
                  themeVariant={isDark ? "dark" : "light"}
                  onChange={(event, newDate) => {
                    if (Platform.OS === "android") {
                      setShowEndTimePicker(false);
                    }
                    if (newDate) {
                      setEndDate(newDate);
                      setUserModifiedEndTime(true);
                    }
                  }}
                  style={{ height: 150 }}
                />
                {Platform.OS === "ios" && (
                  <Pressable
                    onPress={() => setShowEndTimePicker(false)}
                    className="py-3 items-center"
                    style={{ backgroundColor: themeColor }}
                  >
                    <Text className="text-white font-semibold">Done</Text>
                  </Pressable>
                )}
              </View>
            )}
          </Animated.View>

          {/* Suggested Times - only show when friends selected */}
          {selectedFriendIds.length > 0 && (
            <Animated.View entering={FadeInDown.delay(350).springify()}>
              <View className="flex-row items-center mb-2">
                <Sparkles size={16} color={themeColor} />
                <Text style={{ color: colors.textSecondary }} className="text-sm font-medium ml-2">
                  Best Times (Everyone Free)
                </Text>
              </View>

              {isLoadingSuggestions ? (
                <View className="p-4 items-center">
                  <ActivityIndicator size="small" color={themeColor} />
                  <Text className="text-sm mt-2" style={{ color: colors.textTertiary }}>
                    Finding best times...
                  </Text>
                </View>
              ) : suggestedSlots.length === 0 ? (
                <View
                  className="rounded-xl p-4 mb-4"
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text className="text-center" style={{ color: colors.textTertiary }}>
                    No common free times found in the next week
                  </Text>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="mb-4"
                  style={{ marginHorizontal: -20, paddingHorizontal: 20 }}
                  contentContainerStyle={{ paddingRight: 40 }}
                >
                  {suggestedSlots.slice(0, 6).map((slot, index) => {
                    const { date: dateStr, time } = formatTimeSlot(slot);
                    const isSelected =
                      startDate.toISOString() === new Date(slot.start).toISOString();
                    return (
                      <Pressable
                        key={index}
                        onPress={() => handleSelectSlot(slot)}
                        className="rounded-xl p-3 mr-3"
                        style={{
                          backgroundColor: isSelected ? `${themeColor}20` : colors.surface,
                          borderWidth: 1,
                          borderColor: isSelected ? themeColor : colors.border,
                          minWidth: 100,
                        }}
                      >
                        <Text
                          className="font-semibold text-center"
                          style={{ color: isSelected ? themeColor : colors.text }}
                        >
                          {dateStr}
                        </Text>
                        <Text
                          className="text-sm text-center mt-1"
                          style={{ color: isSelected ? themeColor : colors.textSecondary }}
                        >
                          {time}
                        </Text>
                        <View className="flex-row items-center justify-center mt-2">
                          <Users size={12} color="#22C55E" />
                          <Text className="text-xs ml-1" style={{ color: "#22C55E" }}>
                            {slot.totalAvailable} free
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </Animated.View>
          )}

          {/* Create Button */}
          <Animated.View entering={FadeInDown.delay(400).springify()}>
            <Button
              variant="primary"
              label={createMutation.isPending ? "Sending Invites..." : "Propose Event"}
              onPress={handleCreate}
              disabled={createMutation.isPending || !title.trim() || selectedFriendIds.length === 0}
              loading={createMutation.isPending}
              style={{ marginTop: 16, borderRadius: 12 }}
            />
            <Text className="text-center text-xs mt-2" style={{ color: colors.textTertiary }}>
              Friends will be notified to accept or decline
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
