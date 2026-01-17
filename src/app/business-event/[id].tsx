import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
  Share,
  TextInput,
  Platform,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Users,
  Calendar,
  Clock,
  Share2,
  BadgeCheck,
  Heart,
  MessageCircle,
  Send,
} from "lucide-react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { type BusinessEvent, BUSINESS_CATEGORIES } from "../../../shared/contracts";

interface EventComment {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  user?: { id: string; name: string | null; image: string | null };
}

export default function BusinessEventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { themeColor, isDark, colors } = useTheme();

  const [newComment, setNewComment] = useState("");

  // Fetch event data
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["businessEvent", id],
    queryFn: () => api.get<{ event: BusinessEvent }>(`/api/business-events/${id}`),
    enabled: !!id && !!session,
  });

  // Fetch attendees
  const { data: attendeesData } = useQuery({
    queryKey: ["businessEventAttendees", id],
    queryFn: () => api.get<{ attendees: Array<{ userId: string; status: string; user?: { id: string; name: string | null; image: string | null } }> }>(`/api/business-events/${id}/attendees`),
    enabled: !!id && !!session,
  });

  // Attend/RSVP mutation
  const attendMutation = useMutation({
    mutationFn: (status: "attending" | "interested" | "none") =>
      api.post<{ success: boolean; status: string }>(`/api/business-events/${id}/attend`, { status }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["businessEvent", id] });
      queryClient.invalidateQueries({ queryKey: ["businessEventAttendees", id] });
      queryClient.invalidateQueries({ queryKey: ["businessEvents"] });
    },
  });

  const event = data?.event;
  const attendees = attendeesData?.attendees ?? [];

  const getCategoryEmoji = (category: string) => {
    return BUSINESS_CATEGORIES.find((c) => c.value === category)?.emoji ?? "📌";
  };

  const handleShare = async () => {
    if (!event) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const dateStr = new Date(event.startTime).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      const timeStr = event.endTime
        ? `${new Date(event.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – ${new Date(event.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
        : new Date(event.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      await Share.share({
        message: `${event.emoji} ${event.title}\n📅 ${dateStr} at ${timeStr}${event.location ? `\n📍 ${event.location}` : ""}\n\nJoin me on Open Invite!`,
        title: event.title,
      });
    } catch (error) {
      console.error("Error sharing:", error);
    }
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

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textTertiary }}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center px-8">
          <Calendar size={48} color={colors.textTertiary} />
          <Text className="text-xl font-semibold mt-4" style={{ color: colors.text }}>
            Event Not Found
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-4 px-6 py-3 rounded-full"
            style={{ backgroundColor: themeColor }}
          >
            <Text className="text-white font-semibold">Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isPast = new Date(event.startTime) < new Date();

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="px-4 py-3 flex-row items-center justify-between">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
        >
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={handleShare}
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
        >
          <Share2 size={20} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={themeColor} />
        }
      >
        {/* Cover Image or Emoji Header */}
        {event.coverUrl ? (
          <Image source={{ uri: event.coverUrl }} className="w-full h-48" resizeMode="cover" />
        ) : (
          <View className="w-full h-36 items-center justify-center" style={{ backgroundColor: "#9333EA15" }}>
            <Text className="text-6xl">{event.emoji}</Text>
          </View>
        )}

        {/* Event Info Card */}
        <View className="px-4 -mt-6">
          <View
            className="rounded-2xl p-4"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            {/* Business Info */}
            {event.business && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/business/${event.businessId}` as any);
                }}
                className="flex-row items-center mb-3"
              >
                <View
                  className="w-10 h-10 rounded-full overflow-hidden mr-3"
                  style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}
                >
                  {event.business.logoUrl ? (
                    <Image source={{ uri: event.business.logoUrl }} className="w-full h-full" />
                  ) : (
                    <View className="w-full h-full items-center justify-center" style={{ backgroundColor: "#9333EA20" }}>
                      <Building2 size={18} color="#9333EA" />
                    </View>
                  )}
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <Text className="font-semibold" style={{ color: "#9333EA" }}>
                      {event.business.name}
                    </Text>
                    {event.business.isVerified && (
                      <BadgeCheck size={14} color="#9333EA" style={{ marginLeft: 4 }} />
                    )}
                  </View>
                  <Text className="text-xs" style={{ color: colors.textTertiary }}>
                    @{event.business.handle}
                  </Text>
                </View>
              </Pressable>
            )}

            {/* Event Title */}
            <Text className="text-2xl font-bold" style={{ color: colors.text }}>
              {event.title}
            </Text>

            {/* Date & Time */}
            <View className="mt-4 flex-row">
              <View
                className="w-12 h-12 rounded-xl items-center justify-center mr-3"
                style={{ backgroundColor: "#9333EA15" }}
              >
                <Calendar size={20} color="#9333EA" />
              </View>
              <View>
                <Text className="font-semibold" style={{ color: colors.text }}>
                  {new Date(event.startTime).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Text>
                <Text style={{ color: colors.textSecondary }}>
                  {new Date(event.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  {event.endTime && ` - ${new Date(event.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                </Text>
              </View>
            </View>

            {/* Location */}
            {event.location && (
              <View className="mt-3 flex-row">
                <View
                  className="w-12 h-12 rounded-xl items-center justify-center mr-3"
                  style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                >
                  <MapPin size={20} color={colors.textSecondary} />
                </View>
                <View className="flex-1 justify-center">
                  <Text className="font-medium" style={{ color: colors.text }}>
                    {event.location}
                  </Text>
                </View>
              </View>
            )}

            {/* Description */}
            {event.description && (
              <View className="mt-4 pt-4 border-t" style={{ borderColor: colors.border }}>
                <Text style={{ color: colors.text, lineHeight: 22 }}>
                  {event.description}
                </Text>
              </View>
            )}

            {/* Recurring badge */}
            {event.isRecurring && (
              <View
                className="mt-4 self-start px-3 py-1.5 rounded-full"
                style={{ backgroundColor: "#9333EA15" }}
              >
                <Text className="text-sm font-medium" style={{ color: "#9333EA" }}>
                  🔄 Recurring {event.recurrence}
                </Text>
              </View>
            )}

            {/* Capacity */}
            {event.maxAttendees && (
              <View className="mt-3 flex-row items-center">
                <Users size={14} color={colors.textSecondary} />
                <Text className="ml-2 text-sm" style={{ color: colors.textSecondary }}>
                  {event.attendeeCount ?? 0} / {event.maxAttendees} spots filled
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* RSVP Buttons */}
        {!isPast && (
          <View className="px-4 mt-4 flex-row">
            <Pressable
              onPress={() => {
                const newStatus = event.userStatus === "attending" ? "none" : "attending";
                attendMutation.mutate(newStatus);
              }}
              disabled={attendMutation.isPending}
              className="flex-1 py-4 rounded-xl flex-row items-center justify-center mr-2"
              style={{
                backgroundColor: event.userStatus === "attending" ? "#9333EA" : (isDark ? "#2C2C2E" : "#F3F4F6"),
              }}
            >
              <Users size={18} color={event.userStatus === "attending" ? "#fff" : colors.text} />
              <Text
                className="ml-2 font-semibold"
                style={{ color: event.userStatus === "attending" ? "#fff" : colors.text }}
              >
                {event.userStatus === "attending" ? "Going" : "Attend"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const newStatus = event.userStatus === "interested" ? "none" : "interested";
                attendMutation.mutate(newStatus);
              }}
              disabled={attendMutation.isPending}
              className="flex-1 py-4 rounded-xl flex-row items-center justify-center"
              style={{
                backgroundColor: event.userStatus === "interested" ? "#EC4899" : (isDark ? "#2C2C2E" : "#F3F4F6"),
              }}
            >
              <Heart size={18} color={event.userStatus === "interested" ? "#fff" : colors.text} />
              <Text
                className="ml-2 font-semibold"
                style={{ color: event.userStatus === "interested" ? "#fff" : colors.text }}
              >
                {event.userStatus === "interested" ? "Interested" : "Interested"}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Past Event Banner */}
        {isPast && (
          <View className="mx-4 mt-4 px-4 py-3 rounded-xl" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
            <Text className="text-center font-medium" style={{ color: colors.textSecondary }}>
              This event has already happened
            </Text>
          </View>
        )}

        {/* Attendees Section */}
        <View className="px-4 mt-6">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center">
              <Users size={16} color={colors.textSecondary} />
              <Text className="ml-2 font-semibold" style={{ color: colors.text }}>
                Attendees ({attendees.length})
              </Text>
            </View>
          </View>

          {attendees.length === 0 ? (
            <View
              className="py-8 items-center rounded-xl"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <Users size={32} color={colors.textTertiary} />
              <Text className="mt-3" style={{ color: colors.textSecondary }}>
                No attendees yet
              </Text>
              <Text className="text-sm mt-1" style={{ color: colors.textTertiary }}>
                Be the first to RSVP!
              </Text>
            </View>
          ) : (
            <View className="flex-row flex-wrap">
              {attendees.slice(0, 10).map((attendee, index) => (
                <Animated.View
                  key={attendee.userId}
                  entering={FadeInDown.delay(index * 30).springify()}
                  className="mr-2 mb-2"
                >
                  <View
                    className="w-12 h-12 rounded-full overflow-hidden"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}
                  >
                    {attendee.user?.image ? (
                      <Image source={{ uri: attendee.user.image }} className="w-full h-full" />
                    ) : (
                      <View className="w-full h-full items-center justify-center" style={{ backgroundColor: "#9333EA20" }}>
                        <Text className="font-semibold" style={{ color: "#9333EA" }}>
                          {attendee.user?.name?.[0] ?? "?"}
                        </Text>
                      </View>
                    )}
                  </View>
                </Animated.View>
              ))}
              {attendees.length > 10 && (
                <View
                  className="w-12 h-12 rounded-full items-center justify-center"
                  style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                >
                  <Text className="text-sm font-semibold" style={{ color: colors.textSecondary }}>
                    +{attendees.length - 10}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Bottom padding */}
        <View className="h-20" />
      </ScrollView>
    </SafeAreaView>
  );
}
