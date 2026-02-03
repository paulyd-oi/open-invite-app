import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  Image,
  ActivityIndicator,
} from "react-native";
import { Clock, Users, Check, ChevronRight, Sparkles, Calendar } from "@/ui/icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { api } from "@/lib/api";

// Define types locally to avoid import issues
interface FriendUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface Friendship {
  id: string;
  friendId: string;
  friend: FriendUser;
}

interface GetFriendsResponse {
  friends: Friendship[];
}

interface TimeSlot {
  start: string;
  end: string;
  availableFriends: Array<{
    id: string;
    name: string | null;
    image: string | null;
  }>;
  totalAvailable: number;
}

interface GetSuggestedTimesResponse {
  slots: TimeSlot[];
}

interface SuggestedTimesPickerProps {
  onSelectTime: (time: Date) => void;
  selectedFriendIds?: string[];
}

export function SuggestedTimesPicker({
  onSelectTime,
  selectedFriendIds: initialFriendIds,
}: SuggestedTimesPickerProps) {
  const { themeColor, isDark, colors } = useTheme();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const [showModal, setShowModal] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>(initialFriendIds ?? []);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d;
  });
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Fetch friends
  const { data: friendsData } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  const friends = friendsData?.friends ?? [];

  // Fetch suggested times
  const {
    data: suggestedTimesData,
    isLoading: isLoadingSuggestions,
    refetch: fetchSuggestions,
  } = useQuery({
    queryKey: ["suggested-times", selectedFriendIds, startDate.toISOString(), endDate.toISOString()],
    queryFn: () =>
      api.post<GetSuggestedTimesResponse>("/api/events/suggested-times", {
        friendIds: selectedFriendIds,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        duration: 60,
      }),
    enabled: selectedFriendIds.length > 0 && showModal,
  });

  const slots = suggestedTimesData?.slots ?? [];

  const toggleFriend = (friendId: string) => {
    Haptics.selectionAsync();
    setSelectedFriendIds((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId]
    );
  };

  const handleSelectSlot = (slot: TimeSlot) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelectTime(new Date(slot.start));
    setShowModal(false);
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

  return (
    <>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          setShowModal(true);
        }}
        className="rounded-xl p-4 flex-row items-center"
        style={{
          backgroundColor: `${themeColor}10`,
          borderWidth: 1,
          borderColor: `${themeColor}30`,
        }}
      >
        <View
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: `${themeColor}20` }}
        >
          <Sparkles size={20} color={themeColor} />
        </View>
        <View className="flex-1">
          <Text className="font-semibold" style={{ color: themeColor }}>
            Find Best Time
          </Text>
          <Text className="text-sm" style={{ color: colors.textSecondary }}>
            See when friends are free
          </Text>
        </View>
        <ChevronRight size={20} color={themeColor} />
      </Pressable>

      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View className="flex-1" style={{ backgroundColor: colors.background }}>
          {/* Header */}
          <View
            className="px-5 pt-14 pb-4 flex-row items-center justify-between"
            style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border }}
          >
            <Pressable onPress={() => setShowModal(false)}>
              <Text style={{ color: colors.textSecondary }}>Cancel</Text>
            </Pressable>
            <Text className="text-lg font-bold" style={{ color: colors.text }}>
              Find Best Time
            </Text>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView className="flex-1 px-5">
            {/* Select Friends */}
            <Animated.View entering={FadeInDown.delay(100)}>
              <Text className="text-sm font-semibold mb-3 mt-5" style={{ color: colors.textSecondary }}>
                WHO'S COMING?
              </Text>
              <View className="flex-row flex-wrap">
                {friends.map((friendship: Friendship) => {
                  const isSelected = selectedFriendIds.includes(friendship.friendId);
                  return (
                    <Pressable
                      key={friendship.id}
                      onPress={() => toggleFriend(friendship.friendId)}
                      className="rounded-full px-3 py-2 mr-2 mb-2 flex-row items-center"
                      style={{
                        backgroundColor: isSelected ? `${themeColor}20` : isDark ? "#2C2C2E" : "#F3F4F6",
                        borderWidth: isSelected ? 1 : 0,
                        borderColor: themeColor,
                      }}
                    >
                      <View
                        className="w-6 h-6 rounded-full overflow-hidden mr-2"
                        style={{ backgroundColor: `${themeColor}30` }}
                      >
                        {friendship.friend.image ? (
                          <Image source={{ uri: friendship.friend.image }} className="w-full h-full" />
                        ) : (
                          <View className="w-full h-full items-center justify-center">
                            <Text className="text-xs font-bold" style={{ color: themeColor }}>
                              {friendship.friend.name?.[0] ?? "?"}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        className="text-sm font-medium"
                        style={{ color: isSelected ? themeColor : colors.text }}
                      >
                        {friendship.friend.name?.split(" ")[0] ?? "Friend"}
                      </Text>
                      {isSelected && (
                        <View
                          className="w-4 h-4 rounded-full items-center justify-center ml-2"
                          style={{ backgroundColor: themeColor }}
                        >
                          <Check size={10} color="#fff" />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
              {friends.length === 0 && (
                <View
                  className="rounded-xl p-4 items-center"
                  style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
                >
                  <Users size={24} color={colors.textTertiary} />
                  <Text className="text-sm mt-2" style={{ color: colors.textSecondary }}>
                    Add friends to find the best time
                  </Text>
                </View>
              )}
            </Animated.View>

            {/* Date Range */}
            <Animated.View entering={FadeInDown.delay(200)} className="mt-6">
              <Text className="text-sm font-semibold mb-3" style={{ color: colors.textSecondary }}>
                DATE RANGE
              </Text>
              <View className="flex-row">
                <Pressable
                  onPress={() => setShowStartPicker(true)}
                  className="flex-1 rounded-xl p-4 mr-2 flex-row items-center"
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                >
                  <Calendar size={18} color={themeColor} />
                  <Text className="ml-2" style={{ color: colors.text }}>
                    {startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowEndPicker(true)}
                  className="flex-1 rounded-xl p-4 flex-row items-center"
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                >
                  <Calendar size={18} color="#4ECDC4" />
                  <Text className="ml-2" style={{ color: colors.text }}>
                    {endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </Text>
                </Pressable>
              </View>
            </Animated.View>

            {showStartPicker && (
              <DateTimePicker
                value={startDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_, date) => {
                  setShowStartPicker(false);
                  if (date) setStartDate(date);
                }}
              />
            )}

            {showEndPicker && (
              <DateTimePicker
                value={endDate}
                mode="date"
                display="spinner"
                minimumDate={startDate}
                onChange={(_, date) => {
                  setShowEndPicker(false);
                  if (date) setEndDate(date);
                }}
              />
            )}

            {/* Suggested Times */}
            {selectedFriendIds.length > 0 && (
              <Animated.View entering={FadeInDown.delay(300)} className="mt-6">
                <Text className="text-sm font-semibold mb-3" style={{ color: colors.textSecondary }}>
                  BEST TIMES
                </Text>

                {isLoadingSuggestions ? (
                  <View className="py-8 items-center">
                    <ActivityIndicator size="large" color={themeColor} />
                    <Text className="mt-3" style={{ color: colors.textSecondary }}>
                      Finding the best times...
                    </Text>
                  </View>
                ) : slots.length === 0 ? (
                  <View
                    className="rounded-xl p-6 items-center"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
                  >
                    <Clock size={32} color={colors.textTertiary} />
                    <Text className="text-center mt-3 font-medium" style={{ color: colors.text }}>
                      No available times found
                    </Text>
                    <Text className="text-center mt-1 text-sm" style={{ color: colors.textSecondary }}>
                      Try a different date range or fewer people
                    </Text>
                  </View>
                ) : (
                  slots.slice(0, 10).map((slot, index) => {
                    const { date, time } = formatTimeSlot(slot);
                    return (
                      <Animated.View key={index} entering={FadeIn.delay(index * 50)}>
                        <Pressable
                          onPress={() => handleSelectSlot(slot)}
                          className="rounded-xl p-4 mb-2 flex-row items-center"
                          style={{
                            backgroundColor: colors.surface,
                            borderWidth: 1,
                            borderColor: colors.border,
                          }}
                        >
                          <View
                            className="w-12 h-12 rounded-xl items-center justify-center mr-3"
                            style={{ backgroundColor: `${themeColor}15` }}
                          >
                            <Clock size={24} color={themeColor} />
                          </View>
                          <View className="flex-1">
                            <Text className="font-semibold" style={{ color: colors.text }}>
                              {date}
                            </Text>
                            <Text className="text-sm" style={{ color: colors.textSecondary }}>
                              {time}
                            </Text>
                          </View>
                          <View className="items-end">
                            <View className="flex-row items-center">
                              <Users size={14} color="#22C55E" />
                              <Text className="ml-1 font-semibold" style={{ color: "#22C55E" }}>
                                {slot.totalAvailable}
                              </Text>
                            </View>
                            <Text className="text-xs" style={{ color: colors.textTertiary }}>
                              available
                            </Text>
                          </View>
                        </Pressable>
                      </Animated.View>
                    );
                  })
                )}
              </Animated.View>
            )}

            <View className="h-24" />
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
