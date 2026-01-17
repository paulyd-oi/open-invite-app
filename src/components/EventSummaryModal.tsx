import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Star, Sparkles, NotebookPen, Check } from "lucide-react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  SlideInDown,
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { type UpdateEventSummaryResponse } from "@/shared/contracts";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface EventSummaryModalProps {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle: string;
  eventEmoji: string;
  eventDate: Date;
  attendeeCount?: number;
  existingSummary?: string | null;
  existingRating?: number | null;
}

// Individual star button component
function StarButton({
  starValue,
  isFilled,
  isDark,
  onPress,
}: {
  starValue: number;
  isFilled: boolean;
  isDark: boolean;
  onPress: (value: number) => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSpring(1.2, { damping: 8 }, () => {
      scale.value = withSpring(1);
    });
    onPress(starValue);
  };

  return (
    <AnimatedPressable style={animatedStyle} onPress={handlePress} className="p-1">
      <Star
        size={36}
        color={isFilled ? "#F59E0B" : isDark ? "#3C3C3E" : "#E5E7EB"}
        fill={isFilled ? "#F59E0B" : "transparent"}
      />
    </AnimatedPressable>
  );
}

// Star rating component
function StarRating({
  rating,
  onRatingChange,
  isDark,
}: {
  rating: number;
  onRatingChange: (rating: number) => void;
  isDark: boolean;
}) {
  const stars = [1, 2, 3, 4, 5];

  return (
    <View className="flex-row items-center justify-center gap-2">
      {stars.map((star) => (
        <StarButton
          key={star}
          starValue={star}
          isFilled={star <= rating}
          isDark={isDark}
          onPress={onRatingChange}
        />
      ))}
    </View>
  );
}

// Rating labels
const ratingLabels: { [key: number]: string } = {
  1: "Not great",
  2: "Could be better",
  3: "It was okay",
  4: "Pretty good!",
  5: "Amazing!",
};

export function EventSummaryModal({
  visible,
  onClose,
  eventId,
  eventTitle,
  eventEmoji,
  eventDate,
  attendeeCount = 0,
  existingSummary,
  existingRating,
}: EventSummaryModalProps) {
  const { themeColor, isDark, colors } = useTheme();
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState(existingSummary ?? "");
  const [rating, setRating] = useState(existingRating ?? 0);

  // Update state when props change
  useEffect(() => {
    setSummary(existingSummary ?? "");
    setRating(existingRating ?? 0);
  }, [existingSummary, existingRating, visible]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put<UpdateEventSummaryResponse>(`/api/events/${eventId}/summary`, {
        summary: summary.trim() || undefined,
        rating: rating > 0 ? rating : undefined,
      }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["events"] });
      onClose();
    },
  });

  const dismissMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/events/${eventId}/summary/dismiss`, {}),
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: ["events"] });
      onClose();
    },
  });

  const dateLabel = eventDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const hasChanges = summary.trim() !== (existingSummary ?? "") || rating !== (existingRating ?? 0);
  const isEditing = existingSummary !== null && existingSummary !== undefined;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      >
        <Pressable className="flex-1" onPress={onClose} />

        <Animated.View
          entering={SlideInDown.springify().damping(20)}
          className="rounded-t-3xl"
          style={{ backgroundColor: colors.background, maxHeight: "90%" }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
            <View className="flex-row items-center">
              <View
                className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#FFF7ED" }}
              >
                <NotebookPen size={20} color={themeColor} />
              </View>
              <Text className="text-lg font-bold" style={{ color: colors.text }}>
                {isEditing ? "Edit Reflection" : "How did it go?"}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Event Info */}
          <View className="px-5 pb-4">
            <View
              className="rounded-xl p-4 flex-row items-center"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
            >
              <View
                className="w-12 h-12 rounded-xl items-center justify-center mr-3"
                style={{ backgroundColor: isDark ? "#3C3C3E" : "#FFF7ED" }}
              >
                <Text className="text-2xl">{eventEmoji}</Text>
              </View>
              <View className="flex-1">
                <Text
                  className="font-semibold text-base"
                  style={{ color: colors.text }}
                  numberOfLines={1}
                >
                  {eventTitle}
                </Text>
                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                  {dateLabel}
                  {attendeeCount > 0 && ` • ${attendeeCount} attendee${attendeeCount !== 1 ? "s" : ""}`}
                </Text>
              </View>
            </View>
          </View>

          {/* Rating Section */}
          <Animated.View
            entering={FadeInDown.delay(100).springify()}
            className="px-5 pb-4"
          >
            <Text
              className="text-sm font-medium mb-3 text-center"
              style={{ color: colors.textSecondary }}
            >
              How was the event?
            </Text>
            <StarRating
              rating={rating}
              onRatingChange={setRating}
              isDark={isDark}
            />
            {rating > 0 && (
              <Animated.Text
                entering={FadeIn}
                className="text-center mt-2 font-medium"
                style={{ color: "#F59E0B" }}
              >
                {ratingLabels[rating]}
              </Animated.Text>
            )}
          </Animated.View>

          {/* Notes Section */}
          <Animated.View
            entering={FadeInDown.delay(150).springify()}
            className="px-5 pb-4"
          >
            <Text
              className="text-sm font-medium mb-2"
              style={{ color: colors.textSecondary }}
            >
              Reflection notes (private)
            </Text>
            <View
              className="rounded-xl p-4"
              style={{
                backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB",
                minHeight: 120,
              }}
            >
              <TextInput
                value={summary}
                onChangeText={setSummary}
                placeholder="What went well? What could improve? Any highlights or things to remember..."
                placeholderTextColor={colors.textTertiary}
                multiline
                className="text-base"
                style={{ color: colors.text, flex: 1 }}
                maxLength={2000}
              />
            </View>
            <Text
              className="text-xs text-right mt-1"
              style={{ color: colors.textTertiary }}
            >
              {summary.length}/2000
            </Text>
          </Animated.View>

          {/* Prompts */}
          {!summary && (
            <Animated.View
              entering={FadeInDown.delay(200).springify()}
              className="px-5 pb-4"
            >
              <Text
                className="text-xs font-medium mb-2"
                style={{ color: colors.textTertiary }}
              >
                Quick prompts:
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {[
                  "Great conversations!",
                  "Need more time next time",
                  "Try a different venue",
                  "Perfect turnout",
                  "Everyone had fun!",
                ].map((prompt) => (
                  <Pressable
                    key={prompt}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSummary((prev) =>
                        prev ? `${prev} ${prompt}` : prompt
                      );
                    }}
                    className="rounded-full px-3 py-1.5"
                    style={{
                      backgroundColor: isDark ? "#3C3C3E" : "#F3F4F6",
                    }}
                  >
                    <Text className="text-sm" style={{ color: colors.text }}>
                      {prompt}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          )}

          {/* Actions */}
          <View className="px-5 pb-8 pt-2">
            <Pressable
              onPress={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || (!hasChanges && isEditing)}
              className="rounded-xl py-4 flex-row items-center justify-center mb-3"
              style={{
                backgroundColor:
                  hasChanges || !isEditing ? themeColor : isDark ? "#3C3C3E" : "#E5E7EB",
                opacity: saveMutation.isPending ? 0.7 : 1,
              }}
            >
              {saveMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Check size={20} color="#fff" />
                  <Text className="text-white font-semibold ml-2">
                    {isEditing ? "Save Changes" : "Save Reflection"}
                  </Text>
                </>
              )}
            </Pressable>

            {!isEditing && (
              <Pressable
                onPress={() => dismissMutation.mutate()}
                disabled={dismissMutation.isPending}
                className="rounded-xl py-3 items-center"
              >
                {dismissMutation.isPending ? (
                  <ActivityIndicator color={colors.textSecondary} size="small" />
                ) : (
                  <Text className="font-medium" style={{ color: colors.textSecondary }}>
                    Skip for now
                  </Text>
                )}
              </Pressable>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
