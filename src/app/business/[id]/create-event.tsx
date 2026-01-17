import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Image,
  ActivityIndicator,
} from "react-native";
import { toast } from "@/components/Toast";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Users,
  Check,
  ChevronDown,
  ImagePlus,
  X,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";

const EVENT_EMOJIS = [
  "📅", "🏃", "🎬", "🎮", "💃", "🍽️", "☕", "🎉", "🏋️", "📚",
  "🎨", "🎵", "🍕", "🍻", "⛳", "🧘", "🚴", "🎤", "🎭", "⛪",
  "🏀", "⚽", "🎾", "🏈", "🎳", "🎯", "🎪", "🌲", "🏖️", "✈️",
];

export default function CreateBusinessEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { themeColor, isDark, colors } = useTheme();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [emoji, setEmoji] = useState("📅");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [startDate, setStartDate] = useState(new Date(Date.now() + 86400000)); // Tomorrow
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [maxAttendees, setMaxAttendees] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState("weekly");

  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const createEventMutation = useMutation({
    mutationFn: (data: {
      title: string;
      description?: string;
      location?: string;
      emoji?: string;
      coverUrl?: string;
      startTime: string;
      endTime?: string;
      maxAttendees?: number;
      isRecurring?: boolean;
      recurrence?: string;
    }) => api.post<{ event: { id: string } }>(`/api/businesses/${id}/events`, data),
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["business", id] });
      queryClient.invalidateQueries({ queryKey: ["businessEvents"] });
      router.replace(`/business-event/${data.event.id}` as any);
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to create event";
      toast.error("Error", message);
    },
  });

  // Pick cover image
  const pickCoverImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      toast.warning("Permission Needed", "Please allow access to your photos to upload a cover image.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      uploadCoverImage(result.assets[0].uri);
    }
  };

  // Upload cover image to server
  const uploadCoverImage = async (uri: string) => {
    setIsUploadingCover(true);
    try {
      const formData = new FormData();
      const filename = uri.split("/").pop() || "cover.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : "image/jpeg";

      formData.append("file", {
        uri,
        name: filename,
        type,
      } as any);

      const response = await api.upload<{ url: string }>("/api/upload", formData);
      setCoverUrl(response.url);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      toast.error("Upload Error", "Failed to upload cover image. Please try again.");
    } finally {
      setIsUploadingCover(false);
    }
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.warning("Required", "Please enter an event title");
      return;
    }
    if (startDate < new Date()) {
      toast.warning("Invalid Date", "Event start time must be in the future");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    createEventMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      emoji,
      coverUrl: coverUrl || undefined,
      startTime: startDate.toISOString(),
      endTime: endDate?.toISOString(),
      maxAttendees: maxAttendees ? parseInt(maxAttendees) : undefined,
      isRecurring: isRecurring || undefined,
      recurrence: isRecurring ? recurrence : undefined,
    });
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

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="px-4 py-3 flex-row items-center justify-between border-b" style={{ borderColor: colors.border }}>
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
        >
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <Text className="text-lg font-semibold" style={{ color: colors.text }}>
          Create Event
        </Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <View className="py-4">
          {/* Cover Image / Emoji Section */}
          <Text className="font-medium mb-2" style={{ color: colors.text }}>
            Event Banner
          </Text>

          {/* Cover Image Preview or Upload */}
          {coverUrl ? (
            <View className="mb-4">
              <View className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: 16/9 }}>
                <Image
                  source={{ uri: coverUrl }}
                  className="w-full h-full"
                  resizeMode="cover"
                />
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCoverUrl(null);
                  }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full items-center justify-center"
                  style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
                >
                  <X size={18} color="#fff" />
                </Pressable>
              </View>
              <Pressable
                onPress={pickCoverImage}
                className="mt-2 py-2 rounded-lg items-center"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
              >
                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                  Change image
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="mb-4">
              {/* Upload Banner Option */}
              <Pressable
                onPress={pickCoverImage}
                disabled={isUploadingCover}
                className="rounded-2xl items-center justify-center border-2 border-dashed"
                style={{
                  backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                  borderColor: isDark ? "#48484A" : "#D1D5DB",
                  height: 120,
                }}
              >
                {isUploadingCover ? (
                  <ActivityIndicator color="#9333EA" />
                ) : (
                  <>
                    <ImagePlus size={32} color="#9333EA" />
                    <Text className="text-sm mt-2" style={{ color: colors.textSecondary }}>
                      Upload banner image (recommended)
                    </Text>
                    <Text className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                      16:9 aspect ratio works best
                    </Text>
                  </>
                )}
              </Pressable>

              {/* Or use emoji */}
              <View className="flex-row items-center my-3">
                <View className="flex-1 h-px" style={{ backgroundColor: colors.border }} />
                <Text className="mx-3 text-xs" style={{ color: colors.textTertiary }}>
                  or use an emoji
                </Text>
                <View className="flex-1 h-px" style={{ backgroundColor: colors.border }} />
              </View>

              {/* Emoji Picker */}
              <View className="items-center">
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowEmojiPicker(!showEmojiPicker);
                  }}
                  className="w-16 h-16 rounded-xl items-center justify-center"
                  style={{ backgroundColor: "#9333EA20" }}
                >
                  <Text className="text-3xl">{emoji}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {showEmojiPicker && !coverUrl && (
            <View
              className="rounded-xl p-3 mb-4"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              <View className="flex-row flex-wrap justify-center">
                {EVENT_EMOJIS.map((e) => (
                  <Pressable
                    key={e}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setEmoji(e);
                      setShowEmojiPicker(false);
                    }}
                    className="w-10 h-10 m-1 rounded-lg items-center justify-center"
                    style={{
                      backgroundColor: emoji === e ? "#9333EA20" : "transparent",
                    }}
                  >
                    <Text className="text-2xl">{e}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Event Title */}
          <Text className="font-medium mb-2" style={{ color: colors.text }}>
            Event Title *
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g., Saturday Morning Run"
            placeholderTextColor={colors.textTertiary}
            className="rounded-xl px-4 py-3 mb-4"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6", color: colors.text }}
          />

          {/* Description */}
          <Text className="font-medium mb-2" style={{ color: colors.text }}>
            Description
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Tell people about this event..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
            className="rounded-xl px-4 py-3 mb-4"
            style={{
              backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
              color: colors.text,
              minHeight: 100,
              textAlignVertical: "top",
            }}
          />

          {/* Location */}
          <Text className="font-medium mb-2" style={{ color: colors.text }}>
            Location
          </Text>
          <View className="flex-row items-center rounded-xl px-4 mb-4" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
            <MapPin size={18} color={colors.textSecondary} />
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Where is this event?"
              placeholderTextColor={colors.textTertiary}
              className="flex-1 py-3 px-3"
              style={{ color: colors.text }}
            />
          </View>

          {/* Start Date & Time */}
          <Text className="font-medium mb-2" style={{ color: colors.text }}>
            When *
          </Text>
          <View className="flex-row mb-4">
            <Pressable
              onPress={() => setShowStartDatePicker(true)}
              className="flex-1 flex-row items-center rounded-xl px-4 py-3 mr-2"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              <Calendar size={18} color="#9333EA" />
              <Text className="ml-2" style={{ color: colors.text }}>
                {startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowStartTimePicker(true)}
              className="flex-1 flex-row items-center rounded-xl px-4 py-3"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              <Clock size={18} color="#9333EA" />
              <Text className="ml-2" style={{ color: colors.text }}>
                {startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </Text>
            </Pressable>
          </View>

          {/* Start Date Picker */}
          {showStartDatePicker && (
            <View className="rounded-xl mb-4 overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
              <DateTimePicker
                value={startDate}
                mode="date"
                display="spinner"
                textColor={isDark ? "#FFFFFF" : "#000000"}
                themeVariant={isDark ? "dark" : "light"}
                minimumDate={new Date()}
                onChange={(event, date) => {
                  if (Platform.OS === "android") setShowStartDatePicker(false);
                  if (date) setStartDate(date);
                }}
                style={{ height: 150 }}
              />
              {Platform.OS === "ios" && (
                <Pressable
                  onPress={() => setShowStartDatePicker(false)}
                  className="py-2 items-center"
                  style={{ backgroundColor: "#9333EA" }}
                >
                  <Text className="text-white font-semibold">Done</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Start Time Picker */}
          {showStartTimePicker && (
            <View className="rounded-xl mb-4 overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
              <DateTimePicker
                value={startDate}
                mode="time"
                display="spinner"
                textColor={isDark ? "#FFFFFF" : "#000000"}
                themeVariant={isDark ? "dark" : "light"}
                onChange={(event, date) => {
                  if (Platform.OS === "android") setShowStartTimePicker(false);
                  if (date) setStartDate(date);
                }}
                style={{ height: 150 }}
              />
              {Platform.OS === "ios" && (
                <Pressable
                  onPress={() => setShowStartTimePicker(false)}
                  className="py-2 items-center"
                  style={{ backgroundColor: "#9333EA" }}
                >
                  <Text className="text-white font-semibold">Done</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* End Time (Optional) */}
          <Text className="font-medium mb-2" style={{ color: colors.text }}>
            End Time (Optional)
          </Text>
          {endDate ? (
            <View className="flex-row mb-4">
              <Pressable
                onPress={() => setShowEndDatePicker(true)}
                className="flex-1 flex-row items-center rounded-xl px-4 py-3 mr-2"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
              >
                <Calendar size={18} color={colors.textSecondary} />
                <Text className="ml-2" style={{ color: colors.text }}>
                  {endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowEndTimePicker(true)}
                className="flex-1 flex-row items-center rounded-xl px-4 py-3"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
              >
                <Clock size={18} color={colors.textSecondary} />
                <Text className="ml-2" style={{ color: colors.text }}>
                  {endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                const defaultEnd = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // +2 hours
                setEndDate(defaultEnd);
              }}
              className="rounded-xl px-4 py-3 mb-4"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              <Text style={{ color: colors.textSecondary }}>+ Add end time</Text>
            </Pressable>
          )}

          {/* End Date Picker */}
          {showEndDatePicker && endDate && (
            <View className="rounded-xl mb-4 overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
              <DateTimePicker
                value={endDate}
                mode="date"
                display="spinner"
                textColor={isDark ? "#FFFFFF" : "#000000"}
                themeVariant={isDark ? "dark" : "light"}
                minimumDate={startDate}
                onChange={(event, date) => {
                  if (Platform.OS === "android") setShowEndDatePicker(false);
                  if (date) setEndDate(date);
                }}
                style={{ height: 150 }}
              />
              {Platform.OS === "ios" && (
                <Pressable
                  onPress={() => setShowEndDatePicker(false)}
                  className="py-2 items-center"
                  style={{ backgroundColor: "#9333EA" }}
                >
                  <Text className="text-white font-semibold">Done</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* End Time Picker */}
          {showEndTimePicker && endDate && (
            <View className="rounded-xl mb-4 overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
              <DateTimePicker
                value={endDate}
                mode="time"
                display="spinner"
                textColor={isDark ? "#FFFFFF" : "#000000"}
                themeVariant={isDark ? "dark" : "light"}
                onChange={(event, date) => {
                  if (Platform.OS === "android") setShowEndTimePicker(false);
                  if (date) setEndDate(date);
                }}
                style={{ height: 150 }}
              />
              {Platform.OS === "ios" && (
                <Pressable
                  onPress={() => setShowEndTimePicker(false)}
                  className="py-2 items-center"
                  style={{ backgroundColor: "#9333EA" }}
                >
                  <Text className="text-white font-semibold">Done</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Max Attendees */}
          <Text className="font-medium mb-2" style={{ color: colors.text }}>
            Max Attendees (Optional)
          </Text>
          <View className="flex-row items-center rounded-xl px-4 mb-4" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
            <Users size={18} color={colors.textSecondary} />
            <TextInput
              value={maxAttendees}
              onChangeText={(text) => setMaxAttendees(text.replace(/[^0-9]/g, ""))}
              placeholder="Unlimited"
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              className="flex-1 py-3 px-3"
              style={{ color: colors.text }}
            />
          </View>

          {/* Recurring Event */}
          <View className="flex-row items-center justify-between mb-4">
            <Text className="font-medium" style={{ color: colors.text }}>
              Recurring Event
            </Text>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setIsRecurring(!isRecurring);
              }}
              className="w-12 h-7 rounded-full justify-center px-0.5"
              style={{ backgroundColor: isRecurring ? "#9333EA" : (isDark ? "#3C3C3E" : "#E5E7EB") }}
            >
              <View
                className="w-6 h-6 rounded-full"
                style={{
                  backgroundColor: "#fff",
                  marginLeft: isRecurring ? "auto" : 0,
                }}
              />
            </Pressable>
          </View>

          {isRecurring && (
            <View className="mb-4">
              <View className="flex-row flex-wrap">
                {["daily", "weekly", "biweekly", "monthly"].map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setRecurrence(r);
                    }}
                    className="mr-2 mb-2 px-4 py-2 rounded-full"
                    style={{
                      backgroundColor: recurrence === r ? "#9333EA" : (isDark ? "#2C2C2E" : "#F3F4F6"),
                    }}
                  >
                    <Text
                      className="capitalize font-medium"
                      style={{ color: recurrence === r ? "#fff" : colors.text }}
                    >
                      {r}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Create Button */}
        <Pressable
          onPress={handleSubmit}
          disabled={createEventMutation.isPending}
          className="py-4 rounded-xl mb-6 flex-row items-center justify-center"
          style={{ backgroundColor: "#9333EA" }}
        >
          {createEventMutation.isPending ? (
            <Text className="text-white font-semibold">Creating...</Text>
          ) : (
            <>
              <Check size={18} color="#fff" />
              <Text className="text-white font-semibold ml-2">Create Event</Text>
            </>
          )}
        </Pressable>

        <Text className="text-xs text-center mb-6" style={{ color: colors.textTertiary }}>
          This event will be public and visible to all users. Your followers will be notified when you create this event.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
