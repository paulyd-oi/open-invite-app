import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import {
  MapPin,
  Clock,
  Users,
  Compass,
  ChevronDown,
  Check,
  Trash2,
  Calendar,
  ChevronLeft,
  Lock,
  CloudDownload,
} from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { safeToast } from "@/lib/safeToast";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  type GetEventsResponse,
  type UpdateEventRequest,
  type UpdateEventResponse,
  type GetCirclesResponse,
  type Circle,
  type DeleteEventResponse,
} from "@/shared/contracts";

// Comprehensive emoji preset list - frequently used, well-supported across devices
const EMOJI_OPTIONS = [
  // Activities & Sports
  "🏃", "🚴", "🏊", "⚽", "🏀", "🎾", "🏋️", "🧘", "⛳", "🎳",
  // Food & Drinks
  "🍽️", "☕", "🍕", "🍔", "🍣", "🍜", "🍻", "🍷", "🧁", "🍦",
  // Entertainment
  "🎬", "🎮", "🎤", "🎵", "🎸", "🎨", "🎭", "📺", "🎯", "🎲",
  // Social & Celebrations
  "🎉", "🎂", "🥳", "💃", "🕺", "👯", "🤝", "💬", "❤️", "🔥",
  // Travel & Places
  "✈️", "🚗", "🏖️", "⛰️", "🏕️", "🌴", "🌆", "🏠", "🏢", "🌎",
  // Work & Study
  "📅", "💼", "📚", "✏️", "💻", "📱", "🎓", "📝", "🗓️", "⏰",
  // Nature & Weather
  "☀️", "🌙", "⭐", "🌸", "🌻", "🐶", "🐱", "🦋", "🌈", "❄️",
  // Health & Wellness
  "💪", "🧠", "💊", "🩺", "😴", "🧘", "🏥", "💆", "🛁", "🌿",
];

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [emoji, setEmoji] = useState("📅");
  const [startDate, setStartDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [visibility, setVisibility] = useState<"all_friends" | "specific_groups" | "private">("all_friends");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Fetch event data
  const { data: myEventsData } = useQuery({
    queryKey: ["events", "mine"],
    queryFn: () => api.get<GetEventsResponse>("/api/events"),
    enabled: !!session,
  });

  const event = myEventsData?.events.find((e) => e.id === id);

  // Load event data into form
  useEffect(() => {
    if (event && !isLoaded) {
      setTitle(event.title);
      setDescription(event.description ?? "");
      setLocation(event.location ?? "");
      setEmoji(event.emoji);
      setStartDate(new Date(event.startTime));
      setVisibility((event.visibility as "all_friends" | "specific_groups" | "private") ?? "all_friends");
      if (event.groupVisibility) {
        setSelectedGroupIds(event.groupVisibility.map((g) => g.groupId));
      }
      setIsLoaded(true);
    }
  }, [event, isLoaded]);

  const { data: circlesData } = useQuery({
    queryKey: ["circles"],
    queryFn: () => api.get<GetCirclesResponse>("/api/circles"),
    enabled: !!session,
  });

  const circles = circlesData?.circles ?? [];

  const updateMutation = useMutation({
    mutationFn: (data: UpdateEventRequest) =>
      api.put<UpdateEventResponse>(`/api/events/${id}`, data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["events", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["events", "feed"] });
      router.back();
    },
    onError: (error) => {
      safeToast.error("Error", "Failed to update event. Please try again.");
      console.error(error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete<DeleteEventResponse>(`/api/events/${id}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["events", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["events", "feed"] });
      router.replace("/calendar");
    },
    onError: () => {
      safeToast.error("Error", "Failed to delete event. Please try again.");
    },
  });

  const handleSave = () => {
    if (!title.trim()) {
      safeToast.warning("Missing Title", "Please enter a title for your event.");
      return;
    }

    if (visibility === "specific_groups" && selectedGroupIds.length === 0) {
      safeToast.warning("No Groups Selected", "Please select at least one group.");
      return;
    }

    updateMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      emoji,
      startTime: startDate.toISOString(),
      visibility,
      groupIds: visibility === "specific_groups" ? selectedGroupIds : undefined,
    });
  };

  const handleDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    setShowDeleteConfirm(false);
    deleteMutation.mutate();
  };

  const toggleGroup = (groupId: string) => {
    Haptics.selectionAsync();
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((gid) => gid !== groupId)
        : [...prev, groupId]
    );
  };

  if (!session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Event not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom Header with Back Button */}
      <View className="px-5 py-4 flex-row items-center" style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: colors.surface }}
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={{ color: colors.text }} className="text-xl font-sora-semibold">Edit Event</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Emoji Picker */}
          <Animated.View entering={FadeInDown.delay(0).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 mt-4">Event Icon</Text>
            <Pressable
              onPress={() => setShowEmojiPicker(!showEmojiPicker)}
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="w-12 h-12 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: `${themeColor}20` }}>
                    <Text className="text-2xl">{emoji}</Text>
                  </View>
                  <Text style={{ color: colors.textSecondary }}>Tap to change icon</Text>
                </View>
                <ChevronDown size={20} color={colors.textTertiary} />
              </View>
            </Pressable>

            {showEmojiPicker && (
              <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                  {[
                    { label: "Activities", emojis: EMOJI_OPTIONS.slice(0, 10) },
                    { label: "Food & Drinks", emojis: EMOJI_OPTIONS.slice(10, 20) },
                    { label: "Entertainment", emojis: EMOJI_OPTIONS.slice(20, 30) },
                    { label: "Social", emojis: EMOJI_OPTIONS.slice(30, 40) },
                    { label: "Travel", emojis: EMOJI_OPTIONS.slice(40, 50) },
                    { label: "Work & Study", emojis: EMOJI_OPTIONS.slice(50, 60) },
                    { label: "Nature", emojis: EMOJI_OPTIONS.slice(60, 70) },
                    { label: "Wellness", emojis: EMOJI_OPTIONS.slice(70, 80) },
                  ].map((category) => (
                    <View key={category.label} className="mb-3">
                      <Text style={{ color: colors.textTertiary }} className="text-xs font-medium mb-2 uppercase tracking-wide">
                        {category.label}
                      </Text>
                      <View className="flex-row flex-wrap">
                        {category.emojis.map((e) => (
                          <Pressable
                            key={e}
                            onPress={() => {
                              Haptics.selectionAsync();
                              setEmoji(e);
                              setShowEmojiPicker(false);
                            }}
                            className="w-11 h-11 rounded-xl items-center justify-center mr-2 mb-2"
                            style={{ backgroundColor: emoji === e ? `${themeColor}20` : colors.surfaceElevated }}
                          >
                            <Text className="text-xl">{e}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </Animated.View>

          {/* Title */}
          <Animated.View entering={FadeInDown.delay(50).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Title *</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="What are you doing?"
              placeholderTextColor={colors.textTertiary}
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.text }}
            />
          </Animated.View>

          {/* Description */}
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Add some details..."
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={3}
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.text, minHeight: 80, textAlignVertical: "top" }}
            />
          </Animated.View>

          {/* Location */}
          <Animated.View entering={FadeInDown.delay(150).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Location</Text>
            <View className="rounded-xl mb-4 flex-row items-center px-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
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

          {/* Date & Time */}
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">When</Text>
            <View className="flex-row mb-4">
              <Pressable
                onPress={() => setShowDatePicker(true)}
                className="flex-1 rounded-xl p-4 mr-2 flex-row items-center"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <Calendar size={18} color={themeColor} />
                <Text style={{ color: colors.text }} className="ml-2">
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

            {showDatePicker && (
              <View className="rounded-xl mb-4 overflow-hidden" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display="spinner"
                  textColor={isDark ? "#FFFFFF" : "#000000"}
                  themeVariant={isDark ? "dark" : "light"}
                  onChange={(event, date) => {
                    if (Platform.OS === "android") {
                      setShowDatePicker(false);
                    }
                    if (date) setStartDate(date);
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
              <View className="rounded-xl mb-4 overflow-hidden" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <DateTimePicker
                  value={startDate}
                  mode="time"
                  display="spinner"
                  textColor={isDark ? "#FFFFFF" : "#000000"}
                  themeVariant={isDark ? "dark" : "light"}
                  onChange={(event, date) => {
                    if (Platform.OS === "android") {
                      setShowTimePicker(false);
                    }
                    if (date) setStartDate(date);
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
          </Animated.View>

          {/* Visibility */}
          <Animated.View entering={FadeInDown.delay(250).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Who can see this?</Text>
            <View className="flex-row mb-4 flex-wrap">
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setVisibility("all_friends");
                }}
                className="flex-1 rounded-xl p-4 mr-2 flex-row items-center justify-center mb-2"
                style={{
                  backgroundColor: visibility === "all_friends" ? `${themeColor}15` : colors.surface,
                  borderWidth: 1,
                  borderColor: visibility === "all_friends" ? `${themeColor}40` : colors.border,
                  minWidth: "30%",
                }}
              >
                <Compass size={18} color={visibility === "all_friends" ? themeColor : colors.textTertiary} />
                <Text
                  className="ml-2 font-medium"
                  style={{ color: visibility === "all_friends" ? themeColor : colors.textSecondary }}
                >
                  All Friends
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setVisibility("specific_groups");
                }}
                className="flex-1 rounded-xl p-4 flex-row items-center justify-center mb-2"
                style={{
                  backgroundColor: visibility === "specific_groups" ? "#4ECDC415" : colors.surface,
                  borderWidth: 1,
                  borderColor: visibility === "specific_groups" ? "#4ECDC440" : colors.border,
                  minWidth: "30%",
                }}
              >
                <Users size={18} color={visibility === "specific_groups" ? "#4ECDC4" : colors.textTertiary} />
                <Text
                  className="ml-2 font-medium"
                  style={{ color: visibility === "specific_groups" ? "#4ECDC4" : colors.textSecondary }}
                >
                  Circles
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setVisibility("private");
                }}
                className="rounded-xl p-4 mr-2 flex-row items-center justify-center mb-2"
                style={{
                  backgroundColor: visibility === "private" ? "#EF444415" : colors.surface,
                  borderWidth: 1,
                  borderColor: visibility === "private" ? "#EF444440" : colors.border,
                  minWidth: "30%",
                }}
              >
                <Lock size={18} color={visibility === "private" ? "#EF4444" : colors.textTertiary} />
                <Text
                  className="ml-2 font-medium"
                  style={{ color: visibility === "private" ? "#EF4444" : colors.textSecondary }}
                >
                  Private
                </Text>
              </Pressable>
            </View>

            {/* Circle Selection */}
            {visibility === "specific_groups" && (
              <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.text }} className="text-sm font-medium mb-3">Select Circles</Text>
                {circles.length === 0 ? (
                  <Text style={{ color: colors.textTertiary }} className="text-center py-4">
                    No circles yet. Create circles from Friends tab!
                  </Text>
                ) : (
                  circles.map((circle: Circle) => (
                    <Pressable
                      key={circle.id}
                      onPress={() => toggleGroup(circle.id)}
                      className="flex-row items-center p-3 rounded-lg mb-2"
                      style={{ backgroundColor: selectedGroupIds.includes(circle.id) ? `${themeColor}15` : colors.surfaceElevated }}
                    >
                      <View
                        className="w-8 h-8 rounded-full items-center justify-center mr-3"
                        style={{ backgroundColor: `${themeColor}20` }}
                      >
                        <Text className="text-base">{circle.emoji}</Text>
                      </View>
                      <Text className="flex-1 font-medium" style={{ color: colors.text }}>{circle.name}</Text>
                      {selectedGroupIds.includes(circle.id) && (
                        <Check size={20} color={themeColor} />
                      )}
                    </Pressable>
                  ))
                )}
              </View>
            )}
          </Animated.View>

          {/* Save Button */}
          <Animated.View entering={FadeInDown.delay(300).springify()}>
            <Pressable
              onPress={handleSave}
              disabled={updateMutation.isPending}
              className="rounded-xl p-4 items-center mt-4"
              style={{
                backgroundColor: updateMutation.isPending ? colors.textTertiary : themeColor,
                shadowColor: themeColor,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
              }}
            >
              <Text className="text-white font-semibold text-lg">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Text>
            </Pressable>
          </Animated.View>

          {/* Delete Button */}
          <Animated.View entering={FadeInDown.delay(350).springify()}>
            <Pressable
              onPress={handleDelete}
              disabled={deleteMutation.isPending}
              className="rounded-xl p-4 items-center mt-3 flex-row justify-center"
              style={{ backgroundColor: isDark ? "#7F1D1D30" : "#FEE2E2", borderWidth: 1, borderColor: isDark ? "#7F1D1D" : "#FECACA" }}
            >
              <Trash2 size={18} color="#EF4444" />
              <Text className="font-semibold ml-2" style={{ color: "#EF4444" }}>
                {deleteMutation.isPending ? "Deleting..." : "Delete Event"}
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        visible={showDeleteConfirm}
        title="Delete Event"
        message="Are you sure you want to delete this event? This cannot be undone."
        confirmText="Delete"
        isDestructive
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </SafeAreaView>
  );
}
