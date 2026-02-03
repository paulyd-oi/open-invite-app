import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  Modal,
  TextInput,
} from "react-native";
import { safeToast } from "@/lib/safeToast";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Check,
  X,
  Trash2,
  ChevronRight,
  Bell,
  CalendarClock,
} from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { Confetti } from "@/components/Confetti";
import {
  type GetEventRequestResponse,
  type RespondEventRequestResponse,
  type DeleteEventRequestResponse,
  type NudgeEventRequestResponse,
  type SuggestTimeResponse,
} from "@/shared/contracts";

export default function EventRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();

  // State for confetti and suggest time modal
  const [showConfetti, setShowConfetti] = useState(false);
  const [showSuggestTimeModal, setShowSuggestTimeModal] = useState(false);
  const [suggestedDate, setSuggestedDate] = useState(new Date());
  const [suggestMessage, setSuggestMessage] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // State for confirmation modals
  const [showEventConfirmedModal, setShowEventConfirmedModal] = useState(false);
  const [confirmedEventId, setConfirmedEventId] = useState<string | null>(null);
  const [showDeclineOptionsModal, setShowDeclineOptionsModal] = useState(false);
  const [showNudgeConfirm, setShowNudgeConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Fetch event request details
  const { data, isLoading, error } = useQuery({
    queryKey: ["event-request", id],
    queryFn: () => api.get<GetEventRequestResponse>(`/api/event-requests/${id}`),
    enabled: bootStatus === 'authed' && !!id,
  });

  const eventRequest = data?.eventRequest;

  // Respond to event request mutation
  const respondMutation = useMutation({
    mutationFn: (status: "accepted" | "declined") =>
      api.put<RespondEventRequestResponse>(`/api/event-requests/${id}/respond`, { status }),
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["event-request", id] });
      queryClient.invalidateQueries({ queryKey: ["event-requests"] });
      if (data.eventCreated && data.eventId) {
        // Event was created - show confetti and navigate
        setShowConfetti(true);
        setConfirmedEventId(data.eventId);
        setTimeout(() => {
          setShowEventConfirmedModal(true);
        }, 1500);
      } else if (data.success) {
        router.back();
      }
    },
    onError: (error) => {
      devError("Failed to respond:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      safeToast.error("Oops", "That didn't go through. Please try again.");
    },
  });

  // Cancel event request mutation (creator only)
  const cancelMutation = useMutation({
    mutationFn: () => api.delete<DeleteEventRequestResponse>(`/api/event-requests/${id}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["event-requests"] });
      router.back();
    },
    onError: (error) => {
      devError("Failed to cancel:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      safeToast.error("Oops", "That didn't go through. Please try again.");
    },
  });

  // Nudge pending members mutation (creator only)
  const nudgeMutation = useMutation({
    mutationFn: () => api.post<NudgeEventRequestResponse>(`/api/event-requests/${id}/nudge`, {}),
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success(
        "Nudge Sent!",
        `Reminder sent to ${data.nudgedCount} pending ${data.nudgedCount === 1 ? "member" : "members"}.`
      );
    },
    onError: (error) => {
      devError("Failed to nudge:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      safeToast.error("Oops", "That didn't go through. Please try again.");
    },
  });

  // Suggest time mutation
  const suggestTimeMutation = useMutation({
    mutationFn: (data: { suggestedTime: string; message?: string }) =>
      api.post<SuggestTimeResponse>(`/api/event-requests/${id}/suggest-time`, data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowSuggestTimeModal(false);
      setSuggestMessage("");
      safeToast.success("Suggestion Sent!", "Your alternative time suggestion has been sent to the host.");
    },
    onError: (error) => {
      devError("Failed to suggest time:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      safeToast.error("Oops", "That didn't go through. Please try again.");
    },
  });

  const handleAccept = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    respondMutation.mutate("accepted");
  };

  const handleDecline = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowDeclineOptionsModal(true);
  };

  const handleConfirmDecline = () => {
    setShowDeclineOptionsModal(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    respondMutation.mutate("declined");
  };

  const handleSuggestTime = () => {
    suggestTimeMutation.mutate({
      suggestedTime: suggestedDate.toISOString(),
      message: suggestMessage.trim() || undefined,
    });
  };

  const handleNudge = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowNudgeConfirm(true);
  };

  const confirmNudge = () => {
    setShowNudgeConfirm(false);
    nudgeMutation.mutate();
  };

  const handleCancel = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowCancelConfirm(true);
  };

  const confirmCancel = () => {
    setShowCancelConfirm(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    cancelMutation.mutate();
  };

  if (!session) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen
          options={{
            title: "Proposed Event",
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
          }}
        />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in</Text>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen
          options={{
            title: "Proposed Event",
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
          }}
        />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textTertiary }}>Loading...</Text>
        </View>
      </View>
    );
  }

  if (error || !eventRequest) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen
          options={{
            title: "Proposed Event",
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
          }}
        />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-4xl mb-4">😕</Text>
          <Text className="text-center" style={{ color: colors.textSecondary }}>
            Proposed event not found or you don't have access
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-4 px-6 py-3 rounded-full"
            style={{ backgroundColor: themeColor }}
          >
            <Text className="text-white font-semibold">Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const isCreator = eventRequest.creatorId === session.user?.id;
  const members = eventRequest.members ?? [];
  const myMember = members.find((m) => m.userId === session.user?.id);
  const needsResponse = !isCreator && myMember?.status === "pending" && eventRequest.status === "pending";
  const acceptedCount = members.filter((m) => m.status === "accepted").length;
  const totalMembers = members.length;
  const startDate = new Date(eventRequest.startTime);
  const endDate = eventRequest.endTime ? new Date(eventRequest.endTime) : null;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: eventRequest.status === "confirmed" ? "Event Confirmed" : "Proposed Event",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Banner */}
        {eventRequest.status === "confirmed" && (
          <Animated.View entering={FadeInDown.springify()} className="mb-4">
            <View
              className="rounded-2xl p-4 flex-row items-center"
              style={{ backgroundColor: "#22C55E20" }}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: "#22C55E" }}
              >
                <Check size={24} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="font-bold" style={{ color: "#22C55E" }}>
                  Event Confirmed!
                </Text>
                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                  Everyone accepted - the event is on everyone's calendar
                </Text>
              </View>
            </View>
          </Animated.View>
        )}

        {eventRequest.status === "cancelled" && (
          <Animated.View entering={FadeInDown.springify()} className="mb-4">
            <View
              className="rounded-2xl p-4 flex-row items-center"
              style={{ backgroundColor: "#EF444420" }}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: "#EF4444" }}
              >
                <X size={24} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="font-bold" style={{ color: "#EF4444" }}>
                  Event Cancelled
                </Text>
                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                  Someone declined or the host cancelled
                </Text>
              </View>
            </View>
          </Animated.View>
        )}

        {needsResponse && (
          <Animated.View entering={FadeInDown.springify()} className="mb-4">
            <View
              className="rounded-2xl p-4 flex-row items-center"
              style={{ backgroundColor: `${themeColor}15` }}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: themeColor }}
              >
                <Calendar size={24} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="font-bold" style={{ color: themeColor }}>
                  Your Response Needed
                </Text>
                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                  Accept or decline this proposed event
                </Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Event Details */}
        <Animated.View entering={FadeInDown.delay(50).springify()}>
          <View
            className="rounded-2xl p-5 mb-4"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            {/* Header */}
            <View className="flex-row items-start mb-4">
              <View
                className="w-16 h-16 rounded-xl items-center justify-center mr-4"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
              >
                <Text className="text-4xl">{eventRequest.emoji}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-xl font-bold" style={{ color: colors.text }}>
                  {eventRequest.title}
                </Text>
                <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                  {isCreator ? "You created this request" : `Invited by ${eventRequest.creator?.name ?? "Someone"}`}
                </Text>
              </View>
            </View>

            {/* Description */}
            {eventRequest.description && (
              <View className="mb-4 pb-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.text }}>{eventRequest.description}</Text>
              </View>
            )}

            {/* Date & Time */}
            <View className="flex-row items-center mb-3">
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: `${themeColor}15` }}
              >
                <Calendar size={20} color={themeColor} />
              </View>
              <View>
                <Text className="font-semibold" style={{ color: colors.text }}>
                  {startDate.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Text>
                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                  {startDate.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {endDate && ` – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
                </Text>
              </View>
            </View>

            {/* Location */}
            {eventRequest.location && (
              <View className="flex-row items-center">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: "#4ECDC415" }}
                >
                  <MapPin size={20} color="#4ECDC4" />
                </View>
                <Text className="flex-1" style={{ color: colors.text }}>
                  {eventRequest.location}
                </Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Members Section */}
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-semibold" style={{ color: colors.text }}>
              Invitees
            </Text>
            {eventRequest.status === "pending" && (
              <View
                className="px-3 py-1 rounded-full"
                style={{ backgroundColor: `${themeColor}15` }}
              >
                <Text className="text-sm font-medium" style={{ color: themeColor }}>
                  {acceptedCount}/{totalMembers} accepted
                </Text>
              </View>
            )}
          </View>

          <View
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            {/* Creator */}
            <View
              className="flex-row items-center p-4"
              style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <View
                className="w-12 h-12 rounded-full overflow-hidden mr-3"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}
              >
                {eventRequest.creator?.image ? (
                  <Image source={{ uri: eventRequest.creator.image }} className="w-full h-full" />
                ) : (
                  <View
                    className="w-full h-full items-center justify-center"
                    style={{ backgroundColor: `${themeColor}30` }}
                  >
                    <Text className="text-lg font-bold" style={{ color: themeColor }}>
                      {eventRequest.creator?.name?.[0] ?? "?"}
                    </Text>
                  </View>
                )}
              </View>
              <View className="flex-1">
                <Text className="font-semibold" style={{ color: colors.text }}>
                  {eventRequest.creator?.name ?? "Unknown"}
                  {eventRequest.creatorId === session.user?.id && " (You)"}
                </Text>
                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                  Host
                </Text>
              </View>
              <View
                className="px-3 py-1 rounded-full"
                style={{ backgroundColor: `${themeColor}15` }}
              >
                <Text className="text-xs font-medium" style={{ color: themeColor }}>
                  Organizer
                </Text>
              </View>
            </View>

            {/* Members */}
            {members.map((member, idx) => {
              const statusColor =
                member.status === "accepted"
                  ? "#22C55E"
                  : member.status === "declined"
                  ? "#EF4444"
                  : colors.textTertiary;
              const statusBg =
                member.status === "accepted"
                  ? "#22C55E20"
                  : member.status === "declined"
                  ? "#EF444420"
                  : isDark
                  ? "#2C2C2E"
                  : "#F3F4F6";

              return (
                <View
                  key={member.id}
                  className="flex-row items-center p-4"
                  style={{
                    borderBottomWidth: idx < members.length - 1 ? 1 : 0,
                    borderBottomColor: colors.border,
                  }}
                >
                  <View
                    className="w-12 h-12 rounded-full overflow-hidden mr-3"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}
                  >
                    {member.user?.image ? (
                      <Image source={{ uri: member.user.image }} className="w-full h-full" />
                    ) : (
                      <View
                        className="w-full h-full items-center justify-center"
                        style={{ backgroundColor: statusColor + "30" }}
                      >
                        <Text className="text-lg font-bold" style={{ color: statusColor }}>
                          {member.user?.name?.[0] ?? "?"}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold" style={{ color: colors.text }}>
                      {member.user?.name ?? "Unknown"}
                      {member.userId === session.user?.id && " (You)"}
                    </Text>
                    {member.respondedAt && (
                      <Text className="text-xs" style={{ color: colors.textTertiary }}>
                        Responded {new Date(member.respondedAt).toLocaleDateString()}
                      </Text>
                    )}
                  </View>
                  <View
                    className="px-3 py-1 rounded-full flex-row items-center"
                    style={{ backgroundColor: statusBg }}
                  >
                    {member.status === "accepted" && <Check size={12} color={statusColor} />}
                    {member.status === "declined" && <X size={12} color={statusColor} />}
                    <Text
                      className="text-xs font-medium ml-1"
                      style={{ color: statusColor, textTransform: "capitalize" }}
                    >
                      {member.status}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Animated.View>

        {/* Cancel Button (Creator only) */}
        {isCreator && eventRequest.status === "pending" && (
          <Animated.View entering={FadeInDown.delay(150).springify()} className="mt-6">
            {/* Nudge Button */}
            {members.some((m) => m.status === "pending") && (
              <Pressable
                onPress={handleNudge}
                disabled={nudgeMutation.isPending}
                className="flex-row items-center justify-center rounded-xl py-4 mb-3"
                style={{ backgroundColor: `${themeColor}15` }}
              >
                <Bell size={20} color={themeColor} />
                <Text className="font-semibold ml-2" style={{ color: themeColor }}>
                  {nudgeMutation.isPending ? "Sending..." : "Nudge Pending Members"}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={handleCancel}
              disabled={cancelMutation.isPending}
              className="flex-row items-center justify-center rounded-xl py-4"
              style={{ backgroundColor: "#EF444420" }}
            >
              <Trash2 size={20} color="#EF4444" />
              <Text className="font-semibold ml-2" style={{ color: "#EF4444" }}>
                {cancelMutation.isPending ? "Cancelling..." : "Cancel Proposed Event"}
              </Text>
            </Pressable>
          </Animated.View>
        )}

        <View className="h-8" />
      </ScrollView>

      {/* Response Buttons (Non-creator, pending) */}
      {needsResponse && (
        <View
          className="px-5 pb-6 pt-4"
          style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}
        >
          {/* Suggest Time Button */}
          <Pressable
            onPress={() => setShowSuggestTimeModal(true)}
            className="flex-row items-center justify-center rounded-xl py-3 mb-3"
            style={{ backgroundColor: `${themeColor}15` }}
          >
            <CalendarClock size={18} color={themeColor} />
            <Text className="font-medium ml-2" style={{ color: themeColor }}>
              Suggest Different Time
            </Text>
          </Pressable>

          <View className="flex-row gap-3">
            <Pressable
              onPress={handleDecline}
              disabled={respondMutation.isPending}
              className="flex-1 flex-row items-center justify-center rounded-xl py-4"
              style={{ backgroundColor: "#EF444420" }}
            >
              <X size={20} color="#EF4444" />
              <Text className="font-semibold ml-2" style={{ color: "#EF4444" }}>
                Decline
              </Text>
            </Pressable>
            <Pressable
              onPress={handleAccept}
              disabled={respondMutation.isPending}
              className="flex-1 flex-row items-center justify-center rounded-xl py-4"
              style={{ backgroundColor: "#22C55E" }}
            >
              <Check size={20} color="#fff" />
              <Text className="font-semibold text-white ml-2">
                {respondMutation.isPending ? "..." : "Accept"}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Suggest Time Modal */}
      <Modal
        visible={showSuggestTimeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSuggestTimeModal(false)}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setShowSuggestTimeModal(false)}
        >
          <Pressable onPress={() => {}} className="rounded-t-3xl p-6" style={{ backgroundColor: colors.background }}>
            <View className="w-12 h-1 rounded-full self-center mb-4" style={{ backgroundColor: colors.border }} />

            <Text className="text-xl font-bold mb-1" style={{ color: colors.text }}>
              Suggest Different Time
            </Text>
            <Text className="text-sm mb-6" style={{ color: colors.textSecondary }}>
              Let the host know when works better for you
            </Text>

            {/* Date Selection */}
            <Pressable
              onPress={() => setShowDatePicker(true)}
              className="flex-row items-center justify-between p-4 rounded-xl mb-3"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <View className="flex-row items-center">
                <Calendar size={20} color={themeColor} />
                <Text className="font-medium ml-3" style={{ color: colors.text }}>
                  Date
                </Text>
              </View>
              <Text style={{ color: colors.textSecondary }}>
                {suggestedDate.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            </Pressable>

            {/* Time Selection */}
            <Pressable
              onPress={() => setShowTimePicker(true)}
              className="flex-row items-center justify-between p-4 rounded-xl mb-4"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <View className="flex-row items-center">
                <Clock size={20} color={themeColor} />
                <Text className="font-medium ml-3" style={{ color: colors.text }}>
                  Time
                </Text>
              </View>
              <Text style={{ color: colors.textSecondary }}>
                {suggestedDate.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </Text>
            </Pressable>

            {/* Message */}
            <TextInput
              value={suggestMessage}
              onChangeText={setSuggestMessage}
              placeholder="Add a message (optional)"
              placeholderTextColor={colors.textTertiary}
              multiline
              className="p-4 rounded-xl mb-6"
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.text,
                minHeight: 80,
                textAlignVertical: "top",
              }}
            />

            {/* Send Button */}
            <Pressable
              onPress={handleSuggestTime}
              disabled={suggestTimeMutation.isPending}
              className="rounded-xl py-4 items-center"
              style={{ backgroundColor: themeColor }}
            >
              <Text className="font-semibold text-white">
                {suggestTimeMutation.isPending ? "Sending..." : "Send Suggestion"}
              </Text>
            </Pressable>

            {/* Cancel Button */}
            <Pressable
              onPress={() => setShowSuggestTimeModal(false)}
              className="py-4 items-center"
            >
              <Text className="font-medium" style={{ color: colors.textSecondary }}>
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <DateTimePicker
          value={suggestedDate}
          mode="date"
          display="spinner"
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (date) {
              setSuggestedDate(date);
            }
          }}
          minimumDate={new Date()}
        />
      )}

      {/* Time Picker Modal */}
      {showTimePicker && (
        <DateTimePicker
          value={suggestedDate}
          mode="time"
          display="spinner"
          onChange={(event, date) => {
            setShowTimePicker(false);
            if (date) {
              setSuggestedDate(date);
            }
          }}
        />
      )}

      {/* Confetti overlay */}
      {showConfetti && <Confetti onComplete={() => setShowConfetti(false)} />}

      {/* Event Confirmed Modal */}
      <ConfirmModal
        visible={showEventConfirmedModal}
        title="Event Confirmed!"
        message="Everyone accepted! The event has been added to all calendars."
        confirmText="View Event"
        onConfirm={() => {
          setShowEventConfirmedModal(false);
          if (confirmedEventId) {
            router.replace(`/event/${confirmedEventId}` as any);
          }
        }}
        onCancel={() => {
          setShowEventConfirmedModal(false);
          router.back();
        }}
      />

      {/* Decline Options Modal */}
      <Modal
        visible={showDeclineOptionsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeclineOptionsModal(false)}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setShowDeclineOptionsModal(false)}
        >
          <Pressable onPress={() => {}} className="rounded-t-3xl p-6" style={{ backgroundColor: colors.background }}>
            <View className="w-12 h-1 rounded-full self-center mb-4" style={{ backgroundColor: colors.border }} />

            <Text className="text-xl font-bold mb-1" style={{ color: colors.text }}>
              Can't Make It?
            </Text>
            <Text className="text-sm mb-6" style={{ color: colors.textSecondary }}>
              Would you like to suggest a different time or decline?
            </Text>

            <Pressable
              onPress={() => {
                setShowDeclineOptionsModal(false);
                setShowSuggestTimeModal(true);
              }}
              className="flex-row items-center justify-center rounded-xl py-4 mb-3"
              style={{ backgroundColor: `${themeColor}15` }}
            >
              <CalendarClock size={20} color={themeColor} />
              <Text className="font-semibold ml-2" style={{ color: themeColor }}>
                Suggest Different Time
              </Text>
            </Pressable>

            <Pressable
              onPress={handleConfirmDecline}
              className="flex-row items-center justify-center rounded-xl py-4 mb-3"
              style={{ backgroundColor: "#EF444420" }}
            >
              <X size={20} color="#EF4444" />
              <Text className="font-semibold ml-2" style={{ color: "#EF4444" }}>
                Decline
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setShowDeclineOptionsModal(false)}
              className="py-4 items-center"
            >
              <Text className="font-medium" style={{ color: colors.textSecondary }}>
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Nudge Confirm Modal */}
      <ConfirmModal
        visible={showNudgeConfirm}
        title="Send Reminder"
        message="This will send a push notification to members who haven't responded yet."
        confirmText="Send Nudge"
        onConfirm={confirmNudge}
        onCancel={() => setShowNudgeConfirm(false)}
      />

      {/* Cancel Event Request Confirm Modal */}
      <ConfirmModal
        visible={showCancelConfirm}
        title="Cancel Proposed Event"
        message="Are you sure you want to cancel this proposed event?"
        confirmText="Cancel Event"
        isDestructive
        onConfirm={confirmCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </View>
  );
}
