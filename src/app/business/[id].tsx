import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
  Share,
  Linking,
} from "react-native";
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
  ChevronRight,
  Share2,
  Globe,
  Mail,
  Phone,
  BadgeCheck,
  Bell,
  BellOff,
  Instagram,
  Twitter,
  Facebook,
  ExternalLink,
  Plus,
} from "lucide-react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import {
  type Business,
  type BusinessEvent,
  BUSINESS_CATEGORIES,
} from "../../../shared/contracts";

export default function BusinessProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { themeColor, isDark, colors } = useTheme();

  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");

  // Fetch business data
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["business", id],
    queryFn: () => api.get<{ business: Business; upcomingEvents: BusinessEvent[] }>(`/api/businesses/${id}`),
    enabled: !!id && !!session,
  });

  // Fetch all business events
  const { data: eventsData } = useQuery({
    queryKey: ["businessEvents", id, activeTab],
    queryFn: () => api.get<{ events: BusinessEvent[] }>(`/api/businesses/${id}/events?upcoming=${activeTab === "upcoming"}`),
    enabled: !!id && !!session,
  });

  // Follow/unfollow mutation
  const followMutation = useMutation({
    mutationFn: () => api.post<{ success: boolean; isFollowing: boolean }>(`/api/businesses/${id}/follow`, {}),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["business", id] });
      queryClient.invalidateQueries({ queryKey: ["followedBusinesses"] });
      queryClient.invalidateQueries({ queryKey: ["businesses"] });
    },
  });

  // Attend business event mutation
  const attendMutation = useMutation({
    mutationFn: ({ eventId, status }: { eventId: string; status: "attending" | "interested" | "none" }) =>
      api.post<{ success: boolean; status: string }>(`/api/business-events/${eventId}/attend`, { status }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["business", id] });
      queryClient.invalidateQueries({ queryKey: ["businessEvents", id] });
    },
  });

  const business = data?.business;
  const events = eventsData?.events ?? data?.upcomingEvents ?? [];

  const getCategoryInfo = (category: string) => {
    return BUSINESS_CATEGORIES.find((c) => c.value === category) ?? { label: "Other", emoji: "📌" };
  };

  const handleShare = async () => {
    if (!business) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        message: `Check out ${business.name} on Open Invite! Follow them to see their upcoming events.`,
        title: business.name,
      });
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const openLink = (url: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(url);
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

  if (!business) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center px-8">
          <Building2 size={48} color={colors.textTertiary} />
          <Text className="text-xl font-semibold mt-4" style={{ color: colors.text }}>
            Business Not Found
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

  const categoryInfo = getCategoryInfo(business.category);
  const isOwner = business.ownerId === session.user?.id;

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
        <View className="flex-row items-center">
          {isOwner && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/business/${id}/edit` as any);
              }}
              className="px-4 py-2 rounded-full mr-2"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              <Text className="font-medium" style={{ color: colors.text }}>Edit</Text>
            </Pressable>
          )}
          <Pressable
            onPress={handleShare}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
          >
            <Share2 size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={themeColor} />
        }
      >
        {/* Cover Image or Gradient */}
        {business.coverUrl ? (
          <Image source={{ uri: business.coverUrl }} className="w-full h-40" resizeMode="cover" />
        ) : (
          <View className="w-full h-32" style={{ backgroundColor: "#9333EA20" }} />
        )}

        {/* Business Info Card */}
        <View
          className="mx-4 -mt-12 rounded-2xl p-4"
          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
        >
          {/* Logo & Basic Info */}
          <View className="flex-row items-start">
            <View
              className="w-20 h-20 rounded-xl overflow-hidden"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB", borderWidth: 3, borderColor: colors.surface }}
            >
              {business.logoUrl ? (
                <Image source={{ uri: business.logoUrl }} className="w-full h-full" />
              ) : (
                <View className="w-full h-full items-center justify-center" style={{ backgroundColor: "#9333EA20" }}>
                  <Text className="text-3xl">{categoryInfo.emoji}</Text>
                </View>
              )}
            </View>

            <View className="flex-1 ml-4">
              <View className="flex-row items-center">
                <Text className="text-xl font-bold" style={{ color: colors.text }}>
                  {business.name}
                </Text>
                {business.isVerified && (
                  <BadgeCheck size={18} color="#9333EA" style={{ marginLeft: 6 }} />
                )}
              </View>
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                @{business.handle}
              </Text>
              <View className="flex-row items-center mt-1">
                <Text className="mr-1">{categoryInfo.emoji}</Text>
                <Text className="text-sm" style={{ color: colors.textTertiary }}>
                  {categoryInfo.label}
                </Text>
              </View>
            </View>
          </View>

          {/* Stats */}
          <View className="flex-row mt-4 pt-4 border-t" style={{ borderColor: colors.border }}>
            <View className="flex-1 items-center">
              <Text className="text-xl font-bold" style={{ color: colors.text }}>
                {business.followerCount ?? 0}
              </Text>
              <Text className="text-xs" style={{ color: colors.textSecondary }}>Followers</Text>
            </View>
            <View className="w-px" style={{ backgroundColor: colors.border }} />
            <View className="flex-1 items-center">
              <Text className="text-xl font-bold" style={{ color: colors.text }}>
                {business.eventCount ?? 0}
              </Text>
              <Text className="text-xs" style={{ color: colors.textSecondary }}>Events</Text>
            </View>
          </View>

          {/* Follow Button */}
          {!isOwner && (
            <Pressable
              onPress={() => followMutation.mutate()}
              disabled={followMutation.isPending}
              className="mt-4 py-3 rounded-xl flex-row items-center justify-center"
              style={{
                backgroundColor: business.isFollowing ? (isDark ? "#2C2C2E" : "#F3F4F6") : "#9333EA",
              }}
            >
              {business.isFollowing ? (
                <>
                  <BellOff size={18} color={colors.text} />
                  <Text className="ml-2 font-semibold" style={{ color: colors.text }}>
                    Following
                  </Text>
                </>
              ) : (
                <>
                  <Bell size={18} color="#fff" />
                  <Text className="ml-2 font-semibold text-white">
                    {followMutation.isPending ? "..." : "Follow"}
                  </Text>
                </>
              )}
            </Pressable>
          )}

          {/* Owner Actions */}
          {isOwner && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push(`/business/${id}/create-event` as any);
              }}
              className="mt-4 py-3 rounded-xl flex-row items-center justify-center"
              style={{ backgroundColor: "#9333EA" }}
            >
              <Plus size={18} color="#fff" />
              <Text className="ml-2 font-semibold text-white">Create Event</Text>
            </Pressable>
          )}
        </View>

        {/* Description */}
        {business.description && (
          <View className="mx-4 mt-4">
            <Text style={{ color: colors.text, lineHeight: 22 }}>
              {business.description}
            </Text>
          </View>
        )}

        {/* Location */}
        {business.location && (
          <View className="mx-4 mt-4 flex-row items-center">
            <MapPin size={16} color={colors.textSecondary} />
            <Text className="ml-2" style={{ color: colors.textSecondary }}>
              {business.location}
            </Text>
          </View>
        )}

        {/* Contact & Social Links */}
        <View className="mx-4 mt-4 flex-row flex-wrap">
          {business.website && (
            <Pressable
              onPress={() => openLink(business.website!)}
              className="flex-row items-center mr-4 mb-2 px-3 py-2 rounded-full"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              <Globe size={14} color={colors.textSecondary} />
              <Text className="ml-1.5 text-sm" style={{ color: colors.textSecondary }}>Website</Text>
            </Pressable>
          )}
          {business.email && (
            <Pressable
              onPress={() => openLink(`mailto:${business.email}`)}
              className="flex-row items-center mr-4 mb-2 px-3 py-2 rounded-full"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              <Mail size={14} color={colors.textSecondary} />
              <Text className="ml-1.5 text-sm" style={{ color: colors.textSecondary }}>Email</Text>
            </Pressable>
          )}
          {business.phone && (
            <Pressable
              onPress={() => openLink(`tel:${business.phone}`)}
              className="flex-row items-center mr-4 mb-2 px-3 py-2 rounded-full"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              <Phone size={14} color={colors.textSecondary} />
              <Text className="ml-1.5 text-sm" style={{ color: colors.textSecondary }}>Call</Text>
            </Pressable>
          )}
          {business.instagram && (
            <Pressable
              onPress={() => openLink(`https://instagram.com/${business.instagram}`)}
              className="flex-row items-center mr-4 mb-2 px-3 py-2 rounded-full"
              style={{ backgroundColor: "#E1306C20" }}
            >
              <Instagram size={14} color="#E1306C" />
              <Text className="ml-1.5 text-sm" style={{ color: "#E1306C" }}>Instagram</Text>
            </Pressable>
          )}
          {business.twitter && (
            <Pressable
              onPress={() => openLink(`https://twitter.com/${business.twitter}`)}
              className="flex-row items-center mr-4 mb-2 px-3 py-2 rounded-full"
              style={{ backgroundColor: "#1DA1F220" }}
            >
              <Twitter size={14} color="#1DA1F2" />
              <Text className="ml-1.5 text-sm" style={{ color: "#1DA1F2" }}>Twitter</Text>
            </Pressable>
          )}
          {business.facebook && (
            <Pressable
              onPress={() => openLink(`https://facebook.com/${business.facebook}`)}
              className="flex-row items-center mr-4 mb-2 px-3 py-2 rounded-full"
              style={{ backgroundColor: "#1877F220" }}
            >
              <Facebook size={14} color="#1877F2" />
              <Text className="ml-1.5 text-sm" style={{ color: "#1877F2" }}>Facebook</Text>
            </Pressable>
          )}
        </View>

        {/* Events Section */}
        <View className="mx-4 mt-6">
          {/* Tabs */}
          <View className="flex-row rounded-xl p-1 mb-4" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setActiveTab("upcoming");
              }}
              className="flex-1 py-2.5 rounded-lg"
              style={{ backgroundColor: activeTab === "upcoming" ? colors.surface : "transparent" }}
            >
              <Text
                className="text-center font-medium"
                style={{ color: activeTab === "upcoming" ? "#9333EA" : colors.textSecondary }}
              >
                Upcoming
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setActiveTab("past");
              }}
              className="flex-1 py-2.5 rounded-lg"
              style={{ backgroundColor: activeTab === "past" ? colors.surface : "transparent" }}
            >
              <Text
                className="text-center font-medium"
                style={{ color: activeTab === "past" ? "#9333EA" : colors.textSecondary }}
              >
                Past
              </Text>
            </Pressable>
          </View>

          {/* Events List */}
          {events.length === 0 ? (
            <View
              className="py-12 items-center rounded-xl"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <Calendar size={40} color={colors.textTertiary} />
              <Text className="mt-4 font-semibold" style={{ color: colors.text }}>
                No {activeTab} events
              </Text>
              <Text className="mt-2 text-center px-8" style={{ color: colors.textSecondary }}>
                {activeTab === "upcoming"
                  ? "Follow this business to get notified when they create new events"
                  : "This business hasn't had any events yet"}
              </Text>
            </View>
          ) : (
            events.map((event, index) => (
              <Animated.View
                key={event.id}
                entering={FadeInDown.delay(index * 50).springify()}
                className="mb-3"
              >
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/business-event/${event.id}` as any);
                  }}
                  className="rounded-xl p-4"
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                >
                  <View className="flex-row items-start">
                    {/* Date Badge */}
                    <View
                      className="w-14 h-14 rounded-xl items-center justify-center mr-3"
                      style={{ backgroundColor: "#9333EA15" }}
                    >
                      <Text className="text-xs font-medium" style={{ color: "#9333EA" }}>
                        {new Date(event.startTime).toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
                      </Text>
                      <Text className="text-xl font-bold" style={{ color: "#9333EA" }}>
                        {new Date(event.startTime).getDate()}
                      </Text>
                    </View>

                    <View className="flex-1">
                      <View className="flex-row items-center mb-1">
                        <Text className="text-xl mr-2">{event.emoji}</Text>
                        <Text className="flex-1 font-semibold" style={{ color: colors.text }}>
                          {event.title}
                        </Text>
                      </View>

                      <View className="flex-row items-center mt-1">
                        <Clock size={12} color={colors.textSecondary} />
                        <Text className="ml-1 text-sm" style={{ color: colors.textSecondary }}>
                          {new Date(event.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          {event.endTime && ` – ${new Date(event.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                        </Text>
                      </View>

                      {event.location && (
                        <View className="flex-row items-center mt-1">
                          <MapPin size={12} color={colors.textTertiary} />
                          <Text className="ml-1 text-sm" style={{ color: colors.textTertiary }}>
                            {event.location}
                          </Text>
                        </View>
                      )}

                      {/* Attendee count & RSVP */}
                      <View className="flex-row items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: colors.border }}>
                        <View className="flex-row items-center">
                          <Users size={14} color={colors.textSecondary} />
                          <Text className="ml-1.5 text-sm" style={{ color: colors.textSecondary }}>
                            {event.attendeeCount ?? 0} attending
                          </Text>
                        </View>
                        {activeTab === "upcoming" && (
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              const newStatus = event.userStatus === "attending" ? "none" : "attending";
                              attendMutation.mutate({ eventId: event.id, status: newStatus });
                            }}
                            className="px-4 py-1.5 rounded-full"
                            style={{
                              backgroundColor: event.userStatus === "attending" ? "#9333EA" : (isDark ? "#2C2C2E" : "#F3F4F6"),
                            }}
                          >
                            <Text
                              className="text-sm font-medium"
                              style={{ color: event.userStatus === "attending" ? "#fff" : colors.text }}
                            >
                              {event.userStatus === "attending" ? "Going" : "Attend"}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  </View>
                </Pressable>
              </Animated.View>
            ))
          )}
        </View>

        {/* Bottom padding */}
        <View className="h-20" />
      </ScrollView>
    </SafeAreaView>
  );
}
