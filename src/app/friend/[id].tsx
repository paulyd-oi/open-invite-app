import React, { useState, useMemo } from "react";
import { View, Text, ScrollView, Pressable, Image, RefreshControl, Modal, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { MapPin, Clock, Calendar, ChevronRight, ChevronLeft, Users, Plus, X, Check, StickyNote, ChevronDown, Trash2, Trophy } from "@/ui/icons";

// Define the MoreHorizontal icon inline using Ionicons
import { Ionicons } from "@expo/vector-icons";
const MoreHorizontal: React.FC<{ size?: number; color?: string }> = ({ size = 24, color }) => (
  <Ionicons name="ellipsis-horizontal" size={size} color={color as any} />
);
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { safeToast } from "@/lib/safeToast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { type GetFriendEventsResponse, type GetFriendsResponse, type GetGroupsResponse, type FriendGroup, type Event, type ProfileBadge } from "@/shared/contracts";

interface FriendNote {
  id: string;
  content: string;
  createdAt: string;
}

function EventCard({ event, index }: { event: Event; index: number }) {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const startDate = new Date(event.startTime);
  const endDate = event.endTime ? new Date(event.endTime) : null;
  const isToday = new Date().toDateString() === startDate.toDateString();
  const isTomorrow =
    new Date(Date.now() + 86400000).toDateString() === startDate.toDateString();

  const dateLabel = isToday
    ? "Today"
    : isTomorrow
    ? "Tomorrow"
    : startDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  // Show time range if endTime exists
  const timeLabel = endDate
    ? `${startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : startDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

  return (
    <Animated.View entering={FadeInDown.delay(index * 100).springify()}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/event/${event.id}` as any);
        }}
        className="rounded-2xl p-4 mb-3"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <View className="flex-row items-start">
          <View className="w-12 h-12 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: themeColor + "20" }}>
            <Text className="text-xl">{event.emoji}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-lg font-semibold" style={{ color: colors.text }} numberOfLines={1}>
              {event.title}
            </Text>
            <View className="flex-row items-center mt-1">
              <Clock size={14} color={themeColor} />
              <Text className="text-sm ml-1" style={{ color: colors.textSecondary }}>
                {dateLabel} at {timeLabel}
              </Text>
            </View>
          </View>
          <ChevronRight size={20} color={colors.textTertiary} />
        </View>

        {event.location && (
          <View className="flex-row items-center mt-3 pt-3 border-t" style={{ borderColor: colors.border }}>
            <MapPin size={14} color="#4ECDC4" />
            <Text className="text-sm ml-1" style={{ color: colors.textSecondary }} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// Mini Calendar Component
function FriendCalendar({ events, themeColor }: { events: Event[]; themeColor: string }) {
  const router = useRouter();
  const { isDark, colors } = useTheme();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Get events by date for quick lookup
  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    events.forEach((event) => {
      const dateKey = new Date(event.startTime).toDateString();
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(event);
    });
    return map;
  }, [events]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    return { daysInMonth, startingDay };
  };

  const { daysInMonth, startingDay } = getDaysInMonth(currentMonth);
  const today = new Date();

  const goToPrevMonth = () => {
    Haptics.selectionAsync();
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    Haptics.selectionAsync();
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleDayPress = (day: number) => {
    const selectedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const dateKey = selectedDate.toDateString();
    const dayEvents = eventsByDate.get(dateKey);

    if (dayEvents && dayEvents.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Navigate to the first event of that day
      router.push(`/event/${dayEvents[0].id}` as any);
    }
  };

  const renderDays = () => {
    const days = [];
    const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

    // Day headers
    for (let i = 0; i < 7; i++) {
      days.push(
        <View key={`header-${i}`} className="w-[14.28%] items-center py-1">
          <Text className="text-xs font-medium" style={{ color: colors.textTertiary }}>{dayNames[i]}</Text>
        </View>
      );
    }

    // Empty cells for days before month starts
    for (let i = 0; i < startingDay; i++) {
      days.push(<View key={`empty-${i}`} className="w-[14.28%] h-9" />);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
      const dateKey = date.toDateString();
      const dayEvents = eventsByDate.get(dateKey) ?? [];
      const hasEvents = dayEvents.length > 0;
      const isToday = today.toDateString() === dateKey;

      days.push(
        <Pressable
          key={`day-${day}`}
          onPress={() => handleDayPress(day)}
          className="w-[14.28%] h-9 items-center justify-center"
        >
          <View
            className={`w-8 h-8 rounded-full items-center justify-center ${
              isToday ? "border-2" : ""
            } ${hasEvents ? "" : ""}`}
            style={{
              borderColor: isToday ? themeColor : undefined,
              backgroundColor: hasEvents ? themeColor + "20" : undefined,
            }}
          >
            <Text
              className={`text-sm ${
                hasEvents ? "font-semibold" : "font-normal"
              }`}
              style={{ color: hasEvents ? themeColor : isToday ? themeColor : colors.text }}
            >
              {day}
            </Text>
          </View>
          {hasEvents && (
            <View className="absolute bottom-0 flex-row">
              {dayEvents.slice(0, 3).map((_, idx) => (
                <View
                  key={idx}
                  className="w-1 h-1 rounded-full mx-px"
                  style={{ backgroundColor: themeColor }}
                />
              ))}
            </View>
          )}
        </Pressable>
      );
    }

    return days;
  };

  return (
    <View className="rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}>
      {/* Month Header */}
      <View className="flex-row items-center justify-between mb-3">
        <Pressable onPress={goToPrevMonth} className="p-2">
          <ChevronLeft size={20} color={colors.text} />
        </Pressable>
        <Text className="text-base font-semibold" style={{ color: colors.text }}>
          {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </Text>
        <Pressable onPress={goToNextMonth} className="p-2">
          <ChevronRight size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* Calendar Grid */}
      <ScrollView
        horizontal={false}
        showsVerticalScrollIndicator={false}
        style={{ maxHeight: 220 }}
      >
        <View className="flex-row flex-wrap">
          {renderDays()}
        </View>
      </ScrollView>

      {/* Legend */}
      <View className="flex-row items-center justify-center mt-3 pt-3 border-t" style={{ borderColor: colors.border }}>
        <View className="flex-row items-center">
          <View className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: themeColor }} />
          <Text className="text-xs" style={{ color: colors.textSecondary }}>Has events</Text>
        </View>
      </View>
    </View>
  );
}

export default function FriendDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const [showAddToGroupModal, setShowAddToGroupModal] = useState(false);
  const [showNotesSection, setShowNotesSection] = useState(true);
  const [newNoteText, setNewNoteText] = useState("");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["friendEvents", id],
    queryFn: () => api.get<GetFriendEventsResponse>(`/api/friends/${id}/events`),
    enabled: bootStatus === 'authed' && !!id,
  });

  // Fetch friends data to get group memberships for this friendship
  const { data: friendsData, refetch: refetchFriends } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: bootStatus === 'authed',
  });

  // Fetch all groups
  const { data: groupsData, refetch: refetchGroups } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.get<GetGroupsResponse>("/api/groups"),
    enabled: bootStatus === 'authed',
  });

  // Fetch notes for this friend
  const { data: notesData, refetch: refetchNotes } = useQuery({
    queryKey: ["friendNotes", id],
    queryFn: () => api.get<{ notes: FriendNote[] }>(`/api/friends/${id}/notes`),
    enabled: bootStatus === 'authed' && !!id,
  });

  // Fetch the friend's userId from the friendship to get their badge
  const friendUserId = data?.friend?.id;

  // Fetch friend's badge
  const { data: badgeData } = useQuery({
    queryKey: ["userBadge", friendUserId],
    queryFn: () => api.get<{ badge: ProfileBadge | null }>(`/api/achievements/user/${friendUserId}/badge`),
    enabled: bootStatus === 'authed' && !!friendUserId,
  });

  const friendBadge = badgeData?.badge;

  const notes = notesData?.notes ?? [];

  // State for delete confirmation
  const [showDeleteNoteConfirm, setShowDeleteNoteConfirm] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);

  // State for unfriend confirmation
  const [showUnfriendConfirm, setShowUnfriendConfirm] = useState(false);

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: (content: string) =>
      api.post<{ note: FriendNote }>(`/api/friends/${id}/notes`, { content }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewNoteText("");
      refetchNotes();
    },
    onError: (error: any) => {
      // Enhanced error logging for diagnostics
      console.log("[FriendNotes] Add note FAILED:", {
        friendId: id,
        httpStatus: error?.status,
        statusText: error?.statusText,
        message: error?.message,
        responseBody: error?.body ? JSON.stringify(error.body).slice(0, 500) : undefined,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error || {}), 2)?.slice(0, 800),
      });
      safeToast.error("Error", error?.message || "Failed to add note");
    },
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) =>
      api.delete(`/api/friends/${id}/notes/${noteId}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetchNotes();
    },
    onError: (error: any) => {
      // Enhanced error logging for diagnostics
      console.log("[FriendNotes] Delete note FAILED:", {
        friendId: id,
        httpStatus: error?.status,
        message: error?.message,
        responseBody: error?.body ? JSON.stringify(error.body).slice(0, 500) : undefined,
      });
      safeToast.error("Error", error?.message || "Failed to delete note");
    },
  });

  // Unfriend mutation
  const unfriendMutation = useMutation({
    mutationFn: () => api.delete(`/api/friends/${id}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Unfriended", `You and ${friend?.name ?? "this user"} are no longer friends`);
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["friendRequests"] });
      // Navigate back to friends list
      router.replace("/friends" as any);
    },
    onError: () => {
      safeToast.error("Error", "Failed to unfriend");
    },
  });

  const handleAddNote = () => {
    if (newNoteText.trim().length === 0) return;
    addNoteMutation.mutate(newNoteText.trim());
  };

  const handleDeleteNote = (noteId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setNoteToDelete(noteId);
    setShowDeleteNoteConfirm(true);
  };

  const confirmDeleteNote = () => {
    if (noteToDelete) {
      deleteNoteMutation.mutate(noteToDelete);
    }
    setShowDeleteNoteConfirm(false);
    setNoteToDelete(null);
  };

  const handleUnfriend = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowUnfriendConfirm(true);
  };

  const confirmUnfriend = () => {
    unfriendMutation.mutate();
    setShowUnfriendConfirm(false);
  };

  // Find this specific friendship and its group memberships
  const friendship = useMemo(() => {
    return friendsData?.friends?.find(f => f.id === id);
  }, [friendsData?.friends, id]);

  const sharedGroups = useMemo(() => {
    return friendship?.groupMemberships ?? [];
  }, [friendship?.groupMemberships]);

  const groups = groupsData?.groups ?? [];
  const friend = data?.friend;
  const events = data?.events ?? [];

  // Mutations for adding/removing from groups
  const addMemberMutation = useMutation({
    mutationFn: ({ groupId, friendshipId }: { groupId: string; friendshipId: string }) =>
      api.post(`/api/groups/${groupId}/members`, { friendshipId }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetchGroups();
      refetchFriends();
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ groupId, friendshipId }: { groupId: string; friendshipId: string }) =>
      api.delete(`/api/groups/${groupId}/members/${friendshipId}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetchGroups();
      refetchFriends();
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
  });

  const isFriendInGroup = (groupId: string) => {
    return sharedGroups.some(m => m.groupId === groupId);
  };

  const handleToggleGroup = (group: FriendGroup) => {
    if (!id) return;

    const isInGroup = isFriendInGroup(group.id);

    if (isInGroup) {
      removeMemberMutation.mutate({
        groupId: group.id,
        friendshipId: id,
      });
    } else {
      addMemberMutation.mutate({
        groupId: group.id,
        friendshipId: id,
      });
    }
  };

  if (!session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Friend" }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: friend?.name ?? "Friend",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
          headerRight: () => (
            <Pressable
              onPress={handleUnfriend}
              className="w-8 h-8 rounded-full items-center justify-center mr-1"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MoreHorizontal size={18} color={colors.textSecondary} />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={themeColor}
          />
        }
      >
        {/* Friend Info */}
        {friend && (
          <Animated.View entering={FadeInDown.springify()} className="mb-4">
            <View className="rounded-2xl p-5 items-center" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}>
              <View className="relative">
                <View className="w-20 h-20 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
                  {(friend.Profile?.avatarUrl ?? friend.image) ? (
                    <Image source={{ uri: (friend.Profile?.avatarUrl ?? friend.image)! }} className="w-full h-full" />
                  ) : (
                    <View className="w-full h-full items-center justify-center" style={{ backgroundColor: themeColor + "30" }}>
                      <Text className="text-3xl font-bold" style={{ color: themeColor }}>
                        {friend.name?.[0] ?? friend.email?.[0]?.toUpperCase() ?? "?"}
                      </Text>
                    </View>
                  )}
                </View>
                {/* Friend's Badge */}
                {friendBadge && (
                  <View
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: friendBadge.tierColor,
                      borderWidth: 2,
                      borderColor: colors.surface,
                    }}
                  >
                    <Text className="text-sm">{friendBadge.emoji}</Text>
                  </View>
                )}
              </View>
              <View className="flex-row items-center mt-3">
                <Text className="text-xl font-bold" style={{ color: colors.text }}>
                  {friend.name ?? "No name"}
                </Text>
                {friendBadge && (
                  <View
                    className="ml-2 px-2 py-0.5 rounded-full flex-row items-center"
                    style={{ backgroundColor: friendBadge.tierColor + "20" }}
                  >
                    <Trophy size={10} color={friendBadge.tierColor} />
                    <Text className="text-xs font-medium ml-1" style={{ color: friendBadge.tierColor }}>
                      {friendBadge.name}
                    </Text>
                  </View>
                )}
              </View>
              {/* @handle */}
              {friend.Profile?.handle && (
                <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                  @{friend.Profile.handle}
                </Text>
              )}
              {/* Bio (if present) */}
              {friend.Profile?.bio && (
                <Text className="text-sm mt-2 text-center px-4" style={{ color: colors.text }}>
                  {friend.Profile.bio}
                </Text>
              )}
              <View className="flex-row items-center mt-2">
                <Calendar size={14} color={colors.textSecondary} />
                <Text className="ml-1.5 text-sm" style={{ color: colors.textSecondary }}>
                  My calendar looks like...
                </Text>
              </View>
              {friend.Profile?.calendarBio ? (
                <Text className="text-sm mt-1 text-center px-4" style={{ color: colors.text }}>
                  {friend.Profile.calendarBio}
                </Text>
              ) : (
                <Text className="text-sm mt-1 italic" style={{ color: colors.textTertiary }}>
                  Not set yet
                </Text>
              )}
            </View>
          </Animated.View>
        )}

        {/* Notes to Remember Section */}
        <Animated.View entering={FadeInDown.delay(15).springify()} className="mb-4">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowNotesSection(!showNotesSection);
            }}
            className="flex-row items-center justify-between mb-3"
          >
            <View className="flex-row items-center">
              <StickyNote size={18} color="#F59E0B" />
              <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
                Notes to Remember
              </Text>
              {notes.length > 0 && (
                <View
                  className="ml-2 px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: "#F59E0B20" }}
                >
                  <Text className="text-xs font-medium" style={{ color: "#F59E0B" }}>
                    {notes.length}
                  </Text>
                </View>
              )}
            </View>
            <ChevronDown
              size={18}
              color={colors.textTertiary}
              style={{ transform: [{ rotate: showNotesSection ? "0deg" : "-90deg" }] }}
            />
          </Pressable>

          {showNotesSection && (
            <View
              className="rounded-2xl p-4"
              style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
            >
              <Text className="text-xs mb-3" style={{ color: colors.textTertiary }}>
                Private notes only you can see
              </Text>

              {/* Add new note input */}
              <View className="flex-row items-center mb-3">
                <TextInput
                  value={newNoteText}
                  onChangeText={setNewNoteText}
                  placeholder="Add a note about this friend..."
                  placeholderTextColor={colors.textTertiary}
                  className="flex-1 rounded-xl px-4 py-3 mr-2"
                  style={{
                    backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                    color: colors.text,
                  }}
                  onSubmitEditing={handleAddNote}
                  returnKeyType="done"
                />
                <Pressable
                  onPress={handleAddNote}
                  disabled={newNoteText.trim().length === 0 || addNoteMutation.isPending}
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: newNoteText.trim().length > 0 ? themeColor : (isDark ? "#2C2C2E" : "#E5E7EB"),
                    opacity: addNoteMutation.isPending ? 0.5 : 1,
                  }}
                >
                  <Plus size={20} color={newNoteText.trim().length > 0 ? "#fff" : colors.textTertiary} />
                </Pressable>
              </View>

              {/* Notes list */}
              {notes.length === 0 ? (
                <View className="py-4 items-center">
                  <Text className="text-sm" style={{ color: colors.textTertiary }}>
                    No notes yet. Add one above!
                  </Text>
                </View>
              ) : (
                <View>
                  {notes.map((note, index) => (
                    <View
                      key={note.id}
                      className="flex-row items-start py-2"
                      style={{
                        borderTopWidth: index > 0 ? 1 : 0,
                        borderTopColor: colors.separator,
                      }}
                    >
                      <Text className="mr-2 mt-0.5" style={{ color: "#F59E0B" }}>
                        •
                      </Text>
                      <Text className="flex-1 text-sm" style={{ color: colors.text }}>
                        {note.content}
                      </Text>
                      <Pressable
                        onPress={() => handleDeleteNote(note.id)}
                        className="ml-2 p-1"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Trash2 size={14} color={colors.textTertiary} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </Animated.View>

        {/* Shared Circles Section - only show if there are shared circles */}
        {sharedGroups.length > 0 && (
          <Animated.View entering={FadeInDown.delay(25).springify()} className="mb-4">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center">
                <Users size={18} color="#4ECDC4" />
                <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
                  Circles Together
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowAddToGroupModal(true);
                }}
                className="flex-row items-center px-3 py-1.5 rounded-full"
                style={{ backgroundColor: themeColor }}
              >
                <Plus size={14} color="#fff" />
                <Text className="text-white text-sm font-medium ml-1">Add</Text>
              </Pressable>
            </View>

            <View className="flex-row flex-wrap">
              {sharedGroups.map((membership) => (
                <View
                  key={membership.groupId}
                  className="rounded-full px-4 py-2 mr-2 mb-2 flex-row items-center"
                  style={{ backgroundColor: membership.group.color + "20" }}
                >
                  <View
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: membership.group.color }}
                  />
                  <Text className="font-medium text-sm" style={{ color: membership.group.color }}>
                    {membership.group.name}
                  </Text>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        {/* Friend's Calendar */}
        <Animated.View entering={FadeInDown.delay(50).springify()}>
          <View className="flex-row items-center mb-3">
            <Calendar size={18} color={themeColor} />
            <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
              {friend?.name?.split(" ")[0] ?? "Friend"}'s Calendar
            </Text>
          </View>
          <FriendCalendar events={events} themeColor={themeColor} />
        </Animated.View>

        {/* Events Section */}
        <View className="flex-row items-center mb-3">
          <Calendar size={18} color="#4ECDC4" />
          <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
            Open Invites ({events.length})
          </Text>
        </View>

        {isLoading ? (
          <View className="py-8 items-center">
            <Text style={{ color: colors.textTertiary }}>Loading events...</Text>
          </View>
        ) : events.length === 0 ? (
          <View className="rounded-2xl p-6 items-center" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}>
            <Text className="text-4xl mb-3">🎉</Text>
            <Text className="text-center" style={{ color: colors.textSecondary }}>
              No open invites from this friend yet
            </Text>
          </View>
        ) : (
          events.map((event: Event, index: number) => (
            <EventCard key={event.id} event={event} index={index} />
          ))
        )}
      </ScrollView>

      {/* Add to Group Modal */}
      <Modal
        visible={showAddToGroupModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddToGroupModal(false)}
      >
        <View className="flex-1" style={{ backgroundColor: colors.background }}>
          <View className="px-5 py-4 flex-row items-center justify-between border-b" style={{ borderBottomColor: colors.border }}>
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-full mr-3 overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
                {(friend?.Profile?.avatarUrl ?? friend?.image) ? (
                  <Image source={{ uri: (friend?.Profile?.avatarUrl ?? friend?.image)! }} className="w-full h-full" />
                ) : (
                  <View className="w-full h-full items-center justify-center" style={{ backgroundColor: themeColor + "30" }}>
                    <Text className="text-lg font-bold" style={{ color: themeColor }}>
                      {friend?.name?.[0] ?? friend?.email?.[0]?.toUpperCase() ?? "?"}
                    </Text>
                  </View>
                )}
              </View>
              <View>
                <Text className="text-lg font-semibold" style={{ color: colors.text }}>
                  Add to Groups
                </Text>
                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                  {friend?.name ?? "User"}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => setShowAddToGroupModal(false)}
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView className="flex-1 px-5 py-4">
            <Text className="text-sm font-medium mb-3" style={{ color: colors.textSecondary }}>
              Select groups to add or remove this friend
            </Text>

            {groups.length === 0 ? (
              <View className="rounded-xl p-6 border items-center" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
                <Users size={32} color={colors.textTertiary} />
                <Text className="mt-3 mb-1 font-medium" style={{ color: colors.textTertiary }}>No groups yet</Text>
                <Text className="text-sm text-center" style={{ color: colors.textTertiary }}>
                  Create groups from your Profile to organize friends
                </Text>
              </View>
            ) : (
              groups.map((group) => {
                const isInGroup = isFriendInGroup(group.id);
                return (
                  <Pressable
                    key={group.id}
                    onPress={() => handleToggleGroup(group)}
                    className="flex-row items-center rounded-xl p-4 mb-2 border"
                    style={{
                      backgroundColor: isInGroup ? group.color + "10" : colors.surface,
                      borderColor: isInGroup ? group.color + "40" : colors.border,
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
                        {group.memberships?.length ?? 0} members
                      </Text>
                    </View>
                    <View
                      className="w-8 h-8 rounded-full items-center justify-center"
                      style={{
                        backgroundColor: isInGroup ? group.color : (isDark ? "#2C2C2E" : "#F3F4F6"),
                      }}
                    >
                      {isInGroup ? (
                        <Check size={16} color="#fff" />
                      ) : (
                        <Plus size={16} color={colors.textTertiary} />
                      )}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <View className="px-5 py-4 pb-8 border-t" style={{ borderTopColor: colors.border }}>
            <Pressable
              onPress={() => setShowAddToGroupModal(false)}
              className="py-4 rounded-xl"
              style={{ backgroundColor: themeColor }}
            >
              <Text className="text-white text-center font-semibold">Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={showDeleteNoteConfirm}
        title="Delete Note"
        message="Are you sure you want to delete this note?"
        confirmText="Delete"
        isDestructive
        onConfirm={confirmDeleteNote}
        onCancel={() => {
          setShowDeleteNoteConfirm(false);
          setNoteToDelete(null);
        }}
      />

      {/* Unfriend Confirmation Modal */}
      <ConfirmModal
        visible={showUnfriendConfirm}
        title="Unfriend?"
        message="You'll be removed from each other's friends list. You can add them again later."
        confirmText="Unfriend"
        isDestructive
        onConfirm={confirmUnfriend}
        onCancel={() => setShowUnfriendConfirm(false)}
      />
    </SafeAreaView>
  );
}
