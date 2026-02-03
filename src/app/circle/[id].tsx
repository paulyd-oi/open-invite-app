import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  Platform,
  FlatList,
  RefreshControl,
  Modal,
  Keyboard,
  Share,
  Dimensions,
} from "react-native";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { safeToast } from "@/lib/safeToast";
import { shouldMaskEvent, getEventDisplayFields } from "@/lib/eventVisibility";
import { KeyboardAvoidingView, KeyboardStickyView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import {
  ArrowLeft,
  MessageCircle,
  Calendar,
  Clock,
  MapPin,
  Users,
  Plus,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Settings,
  X,
  CalendarPlus,
  UserPlus,
  Check,
  UserCheck,
  type LucideIcon,
} from "@/ui/icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { useEntitlements, canAddCircleMember, type PaywallContext } from "@/lib/entitlements";
import { formatDateTimeRange } from "@/lib/eventTime";
import {
  type GetCircleDetailResponse,
  type CircleMessage,
  type Circle,
  type GetFriendsResponse,
  type Friendship,
} from "@/shared/contracts";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Icon components using Ionicons
const TrashIcon: LucideIcon = ({ color, size = 24, style }) => (
  <Ionicons name="trash-outline" size={size} color={color} style={style} />
);

const WarningIcon: LucideIcon = ({ color, size = 24, style }) => (
  <Ionicons name="warning-outline" size={size} color={color} style={style} />
);

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

// Mini Calendar Component (similar to FeedCalendar)
function MiniCalendar({
  memberEvents,
  members,
  themeColor,
  colors,
  isDark,
  onSelectDate,
  circleId,
  currentUserId,
}: {
  memberEvents: Array<{ userId: string; events: Array<any> }>;
  members: Circle["members"];
  themeColor: string;
  colors: any;
  isDark: boolean;
  onSelectDate?: (date: Date, events: any[]) => void;
  circleId: string;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showDayModal, setShowDayModal] = useState(false);

  // Create member color map
  const memberColors = ["#FF6B4A", "#4ECDC4", "#9333EA", "#F59E0B", "#10B981", "#EC4899"];
  const memberColorMap = useMemo(() =>
    new Map(members.map((m, i) => [m.userId, memberColors[i % memberColors.length]])),
    [members]
  );

  // Get events for a specific date (deduped by event ID)
  const getEventsForDate = useCallback((date: Date) => {
    const eventMap = new Map<string, {
      id: string;
      title: string;
      emoji: string;
      startTime: string;
      endTime: string | null;
      location: string | null;
      userId: string;
      color: string;
      userName: string;
      attendingMemberIds: string[];
      isPrivate: boolean;
    }>();

    memberEvents.forEach((memberData) => {
      memberData.events
        .filter((e) => {
          const eventDate = new Date(e.startTime);
          return eventDate.toDateString() === date.toDateString();
        })
        .forEach((e) => {
          if (!eventMap.has(e.id)) {
            // First time seeing this event - add it
            // P0 PRIVACY: Use centralized masking logic for busy/private events
            const isOwner = memberData.userId === currentUserId;
            const shouldMask = shouldMaskEvent({
              isBusy: e.isBusy,
              isWork: e.isWork,
              isOwn: isOwner,
            }, isOwner);
            
            // Get display fields using centralized helper
            const displayFields = getEventDisplayFields({
              title: e.title,
              emoji: e.emoji,
              location: e.location,
              description: e.description,
              isBusy: e.isBusy,
              isWork: e.isWork,
              isOwn: isOwner,
            }, isOwner);

            eventMap.set(e.id, {
              ...e,
              title: displayFields.displayTitle,
              emoji: displayFields.displayEmoji,
              location: displayFields.displayLocation,
              userId: memberData.userId,
              color: memberColorMap.get(memberData.userId) ?? themeColor,
              userName: members.find(m => m.userId === memberData.userId)?.user.name ?? "Unknown",
              attendingMemberIds: [memberData.userId],
              isPrivate: shouldMask,
            });
          } else {
            // Already have this event - just add this member to attendees
            const existing = eventMap.get(e.id)!;
            if (!existing.attendingMemberIds.includes(memberData.userId)) {
              existing.attendingMemberIds.push(memberData.userId);
            }
          }
        });
    });

    return Array.from(eventMap.values());
  }, [memberEvents, memberColorMap, members, themeColor, currentUserId]);

  // Get event data for current month (deduped by event ID)
  const eventDataByDate = useMemo(() => {
    const data: Record<number, { colors: string[]; count: number; eventIds: Set<string> }> = {};

    memberEvents.forEach((memberData) => {
      memberData.events.forEach((event) => {
        const eventDate = new Date(event.startTime);
        if (eventDate.getMonth() === currentMonth && eventDate.getFullYear() === currentYear) {
          const day = eventDate.getDate();
          if (!data[day]) {
            data[day] = { colors: [], count: 0, eventIds: new Set() };
          }
          // Only count each unique event once
          if (!data[day].eventIds.has(event.id)) {
            data[day].eventIds.add(event.id);
            data[day].count++;
          }
          const color = memberColorMap.get(memberData.userId) ?? themeColor;
          if (data[day].colors.length < 3 && !data[day].colors.includes(color)) {
            data[day].colors.push(color);
          }
        }
      });
    });

    return data;
  }, [memberEvents, currentMonth, currentYear, memberColorMap, themeColor]);

  // Find free times (when all members are free)
  const freeSlots = useMemo(() => {
    const slots: Array<{ date: Date; startHour: number; duration: number }> = [];
    const startDate = new Date();
    const days = Array.from({ length: 14 }, (_, i) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      return date;
    });

    days.forEach((date) => {
      const dayEvents = memberEvents.flatMap((m) =>
        m.events.filter((e) => {
          const eventDate = new Date(e.startTime);
          return eventDate.toDateString() === date.toDateString();
        })
      );

      for (let hour = 9; hour <= 20; hour++) {
        const slotStart = new Date(date);
        slotStart.setHours(hour, 0, 0, 0);
        const slotEnd = new Date(date);
        slotEnd.setHours(hour + 1, 0, 0, 0);

        const hasConflict = dayEvents.some((e) => {
          const eventStart = new Date(e.startTime);
          const eventEnd = e.endTime
            ? new Date(e.endTime)
            : new Date(eventStart.getTime() + 60 * 60 * 1000);
          return eventStart < slotEnd && eventEnd > slotStart;
        });

        if (!hasConflict) {
          const lastSlot = slots[slots.length - 1];
          if (
            lastSlot &&
            lastSlot.date.toDateString() === date.toDateString() &&
            lastSlot.startHour + lastSlot.duration === hour
          ) {
            lastSlot.duration++;
          } else {
            slots.push({ date, startHour: hour, duration: 1 });
          }
        }
      }
    });

    return slots.filter((s) => s.duration >= 1).slice(0, 5);
  }, [memberEvents]);

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayOfMonth = getFirstDayOfMonth(currentYear, currentMonth);

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i);
  }
  const remainingCells = (7 - (calendarDays.length % 7)) % 7;
  for (let i = 0; i < remainingCells; i++) {
    calendarDays.push(null);
  }

  const goToPrevMonth = () => {
    Haptics.selectionAsync();
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    Haptics.selectionAsync();
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handleDayPress = (day: number) => {
    Haptics.selectionAsync();
    const date = new Date(currentYear, currentMonth, day);
    setSelectedDate(date);
    setShowDayModal(true);
  };

  const selectedDateEvents = selectedDate
    ? getEventsForDate(selectedDate).sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      )
    : [];

  return (
    <View className="rounded-xl p-3 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      {/* Header */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center">
          <Calendar size={16} color={themeColor} />
          <Text className="font-semibold ml-2 text-sm" style={{ color: colors.text }}>
            {MONTHS[currentMonth]} {currentYear}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Pressable
            onPress={goToPrevMonth}
            className="w-7 h-7 rounded-full items-center justify-center"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
          >
            <ChevronLeft size={16} color={themeColor} />
          </Pressable>
          <Pressable
            onPress={goToNextMonth}
            className="w-7 h-7 rounded-full items-center justify-center ml-1"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
          >
            <ChevronRight size={16} color={themeColor} />
          </Pressable>
        </View>
      </View>

      {/* Day Labels */}
      <View className="flex-row mb-1">
        {DAYS.map((day, idx) => (
          <View key={idx} style={{ flex: 1, alignItems: "center" }}>
            <Text
              style={{
                fontSize: 10,
                fontWeight: "500",
                color: idx === 0 || idx === 6 ? colors.textTertiary : colors.textSecondary
              }}
            >
              {day}
            </Text>
          </View>
        ))}
      </View>

      {/* Calendar Grid */}
      <View>
        {Array.from({ length: Math.ceil(calendarDays.length / 7) }).map((_, weekIndex) => (
          <View key={weekIndex} className="flex-row">
            {calendarDays.slice(weekIndex * 7, (weekIndex + 1) * 7).map((day, dayIndex) => {
              const index = weekIndex * 7 + dayIndex;
              const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
              const eventData = day ? eventDataByDate[day] : null;
              const dayOfWeek = index % 7;
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

              return (
                <View key={index} style={{ flex: 1, alignItems: "center" }}>
                  {day === null ? (
                    <View style={{ height: 36 }} />
                  ) : (
                    <Pressable
                      onPress={() => handleDayPress(day)}
                      style={{ height: 36, width: "100%", alignItems: "center", justifyContent: "center" }}
                    >
                      <View
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: isToday ? themeColor : "transparent",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: isWeekend ? "400" : "600",
                            color: isToday ? "#fff" : isWeekend ? colors.textTertiary : colors.text,
                          }}
                        >
                          {day}
                        </Text>
                      </View>
                      {/* Event dots */}
                      {eventData && !isToday && (
                        <View style={{ flexDirection: "row", alignItems: "center", position: "absolute", bottom: 2 }}>
                          {eventData.colors.slice(0, 3).map((color, colorIdx) => (
                            <View
                              key={colorIdx}
                              style={{
                                width: 3,
                                height: 3,
                                borderRadius: 1.5,
                                marginHorizontal: 0.5,
                                backgroundColor: color,
                              }}
                            />
                          ))}
                        </View>
                      )}
                      {eventData && isToday && (
                        <View
                          style={{
                            position: "absolute",
                            bottom: 2,
                            width: 4,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: "#fff"
                          }}
                        />
                      )}
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {/* Free Time Slots */}
      {freeSlots.length > 0 && (
        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ fontSize: 12, fontWeight: "500", marginBottom: 6, color: colors.textSecondary }}>
            Everyone is free:
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {freeSlots.map((slot, i) => {
              // Create a date object with the suggested time
              const suggestedStartDate = new Date(slot.date);
              suggestedStartDate.setHours(slot.startHour, 0, 0, 0);
              const suggestedEndDate = new Date(suggestedStartDate);
              suggestedEndDate.setHours(slot.startHour + slot.duration, 0, 0, 0);

              return (
                <Pressable
                  key={i}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    // Navigate to create event page with pre-filled date/time and circleId
                    router.push({
                      pathname: "/create",
                      params: {
                        date: suggestedStartDate.toISOString(),
                        circleId: circleId,
                        duration: String(slot.duration * 60), // duration in minutes
                      },
                    } as any);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderRadius: 12,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    marginRight: 6,
                    marginBottom: 4,
                    backgroundColor: "#10B98120"
                  }}
                >
                  <Clock size={10} color="#10B981" />
                  <Text style={{ fontSize: 10, fontWeight: "500", marginLeft: 4, color: "#10B981" }}>
                    {formatDateTimeRange(suggestedStartDate.toISOString(), suggestedEndDate.toISOString())}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Member Legend */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
        {members.slice(0, 5).map((member) => (
          <View key={member.userId} style={{ flexDirection: "row", alignItems: "center", marginRight: 10, marginBottom: 2 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                marginRight: 4,
                backgroundColor: memberColorMap.get(member.userId)
              }}
            />
            <Text style={{ fontSize: 10, color: colors.textSecondary }}>
              {member.user.name?.split(" ")[0] ?? "Unknown"}
            </Text>
          </View>
        ))}
      </View>

      {/* Day Events Modal */}
      <Modal
        visible={showDayModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDayModal(false)}
      >
        <Pressable
          style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 20 }}
          onPress={() => setShowDayModal(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 400 }}>
            <Animated.View
              entering={FadeIn.duration(200)}
              style={{
                backgroundColor: colors.background,
                borderRadius: 20,
                maxHeight: 450,
                overflow: "hidden",
              }}
            >
              {/* Modal Handle */}
              <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 6 }}>
                <View
                  style={{
                    width: 36,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: colors.textTertiary,
                    opacity: 0.4
                  }}
                />
              </View>

              {/* Modal Header */}
              <View style={{ paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                  <Calendar size={18} color={themeColor} />
                  <Text style={{ fontSize: 16, fontWeight: "600", marginLeft: 8, color: colors.text }} numberOfLines={1}>
                    {selectedDate?.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowDayModal(false)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6"
                  }}
                >
                  <X size={16} color={colors.textSecondary} />
                </Pressable>
              </View>

              {/* Events List */}
              <ScrollView
                style={{ maxHeight: 340 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                showsVerticalScrollIndicator={true}
              >
                {selectedDateEvents.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 32 }}>
                    <Calendar size={36} color={colors.textTertiary} />
                    <Text style={{ fontSize: 14, fontWeight: "500", marginTop: 12, color: colors.textSecondary }}>
                      No events scheduled
                    </Text>
                    <Text style={{ fontSize: 12, marginTop: 4, color: colors.textTertiary }}>
                      Everyone is free on this day!
                    </Text>
                  </View>
                ) : (
                  selectedDateEvents.map((event, index) => {
                    // Check if this is a masked busy block (private event not owned by viewer)
                    const isMaskedBusy = event.isPrivate && event.userId !== currentUserId;
                    
                    return (
                    <Pressable
                      key={event.id}
                      onPress={() => {
                        // Don't navigate to private events that belong to other users
                        if (isMaskedBusy) {
                          if (__DEV__) {
                            devLog('[CircleCalendarPrivacy] Blocked navigation to masked busy block:', event.id);
                          }
                          return;
                        }
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowDayModal(false);
                        // Navigate to event details
                        if (event.id) {
                          router.push(`/event/${event.id}` as any);
                        }
                      }}
                      style={{ opacity: isMaskedBusy ? 0.7 : 1 }}
                    >
                      <Animated.View
                        entering={FadeInDown.delay(index * 50).springify()}
                        style={{
                          borderRadius: 12,
                          padding: 12,
                          marginBottom: 8,
                          backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB"
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <View
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 5,
                              marginRight: 8,
                              backgroundColor: event.color
                            }}
                          />
                          <Text style={{ fontWeight: "500", flex: 1, color: isMaskedBusy ? colors.textSecondary : colors.text }} numberOfLines={1}>
                            {event.title}
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                            {event.endTime
                              ? `${new Date(event.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${new Date(event.endTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                              : new Date(event.startTime).toLocaleTimeString("en-US", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                          </Text>
                        </View>
                        {/* Only show attendee/location row if not masked */}
                        {!isMaskedBusy && (
                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, marginLeft: 18 }}>
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                            {event.attendingMemberIds.length > 1
                              ? `${event.attendingMemberIds.length} attending`
                              : event.userName}
                          </Text>
                          {event.location && (
                            <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 10, flex: 1 }}>
                              <MapPin size={10} color={colors.textTertiary} />
                              <Text style={{ fontSize: 11, marginLeft: 3, color: colors.textTertiary }} numberOfLines={1}>
                                {event.location}
                              </Text>
                            </View>
                          )}
                        </View>
                        )}
                      </Animated.View>
                    </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// Message Bubble Component
function MessageBubble({
  message,
  isOwn,
  themeColor,
  colors,
  isDark,
}: {
  message: CircleMessage;
  isOwn: boolean;
  themeColor: string;
  colors: any;
  isDark: boolean;
}) {
  const isSystemMessage = message.content.startsWith("📅");

  if (isSystemMessage) {
    return (
      <View className="items-center my-2">
        <View className="rounded-full px-3 py-1" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
          <Text className="text-xs" style={{ color: colors.textSecondary }}>
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className={`mb-3 ${isOwn ? "items-end" : "items-start"}`}>
      <View className={`flex-row items-end ${isOwn ? "flex-row-reverse" : ""}`}>
        {!isOwn && (
          <View
            className="w-7 h-7 rounded-full overflow-hidden mr-2"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}
          >
            {message.user.image ? (
              <Image source={{ uri: message.user.image }} className="w-full h-full" />
            ) : (
              <View
                className="w-full h-full items-center justify-center"
                style={{ backgroundColor: themeColor + "20" }}
              >
                <Text className="text-xs font-bold" style={{ color: themeColor }}>
                  {message.user.name?.[0] ?? "?"}
                </Text>
              </View>
            )}
          </View>
        )}
        <View style={{ maxWidth: "75%" }}>
          {!isOwn && (
            <Text className="text-xs mb-1 ml-1" style={{ color: colors.textTertiary }}>
              {message.user.name?.split(" ")[0] ?? "Unknown"}
            </Text>
          )}
          <View
            className={`rounded-2xl px-4 py-2.5 ${isOwn ? "rounded-br-md" : "rounded-bl-md"}`}
            style={{
              backgroundColor: isOwn ? themeColor : isDark ? "#2C2C2E" : "#F3F4F6",
            }}
          >
            <Text style={{ color: isOwn ? "#fff" : colors.text }}>{message.content}</Text>
          </View>
          <Text className={`text-[10px] mt-1 ${isOwn ? "text-right mr-1" : "ml-1"}`} style={{ color: colors.textTertiary }}>
            {new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function CircleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);

  const [message, setMessage] = useState("");
  const [showCalendar, setShowCalendar] = useState(true);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [createEventVisibility, setCreateEventVisibility] = useState<"open_invite" | "circle_only">("circle_only");
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showMembersSheet, setShowMembersSheet] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [selectedMemberToRemove, setSelectedMemberToRemove] = useState<string | null>(null);

  // DEV: Log when selectedMemberToRemove changes
  React.useEffect(() => {
    if (__DEV__) {
      devLog('[CircleRemoveMember] selectedMemberToRemove changed:', {
        selectedMemberToRemove,
        confirmModalShouldBeVisible: !!selectedMemberToRemove,
      });
    }
  }, [selectedMemberToRemove]);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionText, setDescriptionText] = useState("");
  const [friendSuggestions, setFriendSuggestions] = useState<Array<{
    newMemberName: string;
    existingMemberName: string;
    newMemberId: string;
  }>>([]);
  const [showFriendSuggestionModal, setShowFriendSuggestionModal] = useState(false);
  const [calendarCollapsedByKeyboard, setCalendarCollapsedByKeyboard] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Paywall state for member limit gating
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [paywallContext, setPaywallContext] = useState<PaywallContext>("CIRCLE_MEMBERS_LIMIT");

  // Fetch entitlements for gating
  const { data: entitlements } = useEntitlements();

  // Auto-collapse calendar when keyboard shows
  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardWillShow", () => {
      if (showCalendar) {
        setShowCalendar(false);
        setCalendarCollapsedByKeyboard(true);
      }
    });

    const hideSubscription = Keyboard.addListener("keyboardWillHide", () => {
      if (calendarCollapsedByKeyboard) {
        setShowCalendar(true);
        setCalendarCollapsedByKeyboard(false);
      }
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [showCalendar, calendarCollapsedByKeyboard]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["circle", id],
    queryFn: () => api.get<GetCircleDetailResponse>(`/api/circles/${id}`),
    enabled: bootStatus === 'authed' && !!id,
    refetchInterval: 10000, // Poll every 10 seconds for new messages
    refetchIntervalInBackground: false, // Stop polling when app is backgrounded
  });

  // Fetch friends list for adding members
  const { data: friendsData } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: bootStatus === 'authed' && showAddMembers,
  });

  const sendMessageMutation = useMutation({
    mutationFn: (content: string) =>
      api.post(`/api/circles/${id}/messages`, { content }),
    onSuccess: () => {
      setMessage("");
      refetch();
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    },
  });

  // Add members mutation
  const addMembersMutation = useMutation({
    mutationFn: (memberIds: string[]) =>
      api.post<{ success: boolean; addedCount: number }>(`/api/circles/${id}/members`, { memberIds }),
    onSuccess: async (_data, memberIds) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAddMembers(false);
      setSelectedFriends([]);

      // Invalidate and refetch circle data to update calendar with new members
      await queryClient.invalidateQueries({ queryKey: ["circle", id] });
      await queryClient.invalidateQueries({ queryKey: ["circles"] });
      await refetch();

      // Check if new members are friends with all existing circle members
      if (circle && friendsData?.friends) {
        checkFriendSuggestions(memberIds);
      }
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      safeToast.error("Error", "Failed to add members. Please try again.");
    },
  });

  // Remove member mutation (host only)
  const removeMemberMutation = useMutation({
    mutationFn: (memberUserId: string) => {
      if (__DEV__) {
        devLog('[CircleRemoveMember] Mutation executing:', {
          circleId: id,
          memberUserId,
          endpoint: `/api/circles/${id}/members/${memberUserId}`,
        });
      }
      return api.delete(`/api/circles/${id}/members/${memberUserId}`);
    },
    onSuccess: async (_data, memberUserId) => {
      if (__DEV__) {
        devLog('[CircleRemoveMember] Mutation SUCCESS:', { circleId: id, memberUserId });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Removed", "Member has been removed from the circle.");
      setSelectedMemberToRemove(null);
      // Invalidate and refetch circle data
      await queryClient.invalidateQueries({ queryKey: ["circle", id] });
      await queryClient.invalidateQueries({ queryKey: ["circles"] });
      await refetch();
    },
    onError: (error: any, memberUserId) => {
      if (__DEV__) {
        devLog('[CircleRemoveMember] Mutation ERROR:', {
          circleId: id,
          memberUserId,
          status: error?.status,
          message: error?.message,
          body: error?.body,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (error?.status === 403) {
        safeToast.error("Not Allowed", "Only the host can remove members.");
      } else if (error?.status === 400) {
        safeToast.error("Cannot Remove", "The host cannot be removed from the circle.");
      } else {
        safeToast.error("Error", "Failed to remove member. Please try again.");
      }
      setSelectedMemberToRemove(null);
    },
  });

  // Mark circle as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: () => api.post(`/api/circles/${id}/read`, {}),
    onSuccess: () => {
      // Invalidate circles list to update badge counts
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      queryClient.invalidateQueries({ queryKey: ["circleUnreadCount"] });
    },
  });

  // Update circle mutation (for description editing)
  const updateCircleMutation = useMutation({
    mutationFn: (updates: { description?: string }) =>
      api.put<{ circle: Circle }>(`/api/circles/${id}`, updates),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Saved", "Description updated");
      queryClient.invalidateQueries({ queryKey: ["circle", id] });
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      setEditingDescription(false);
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (error?.status === 403) {
        safeToast.error("Not Allowed", "Only the host can edit this.");
      } else {
        safeToast.error("Error", "Failed to update. Please try again.");
      }
    },
  });

  // Mark as read when component mounts or when id changes
  useEffect(() => {
    if (session && id) {
      markAsReadMutation.mutate();
    }
  }, [session, id]);

  const circle = data?.circle;
  const isHost = circle?.createdById === session?.user?.id;

  // Check if new members need friend suggestions
  const checkFriendSuggestions = (newMemberIds: string[]) => {
    if (!circle || !circle.members || !friendsData?.friends) return;

    const existingMemberIds = circle.members.map(m => m.userId);
    const myFriendIds = new Set(friendsData.friends.map(f => f.friendId));
    const suggestions: Array<{
      newMemberName: string;
      existingMemberName: string;
      newMemberId: string;
    }> = [];

    // For each new member, check if they are friends with existing members
    // We can only suggest adding them as friends to the current user
    for (const newMemberId of newMemberIds) {
      const newMember = friendsData.friends.find(f => f.friendId === newMemberId);
      if (!newMember) continue;

      // Check each existing member
      for (const existingMember of circle.members) {
        // Skip if this is the current user
        if (existingMember.userId === session?.user?.id) continue;

        // Check if the existing member is in the new member's potential friends
        // Since we can't check another user's friend list, we note this for the suggestion
        // The suggestion is: "New member might not be friends with existing member"
        if (!myFriendIds.has(existingMember.userId)) {
          // Current user isn't friends with this existing member (shouldn't happen in a circle)
          continue;
        }

        // Add a suggestion that encourages adding each other
        suggestions.push({
          newMemberName: newMember.friend.name ?? "Unknown",
          existingMemberName: existingMember.user.name ?? "Unknown",
          newMemberId: newMemberId,
        });
      }
    }

    // Show unique suggestions (one per new member)
    const uniqueSuggestions = newMemberIds.map(id => {
      const newMember = friendsData.friends.find(f => f.friendId === id);
      if (!newMember) return null;

      return {
        newMemberName: newMember.friend.name ?? "Unknown",
        existingMemberName: "", // Will show general message
        newMemberId: id,
      };
    }).filter((s): s is NonNullable<typeof s> => s !== null);

    if (uniqueSuggestions.length > 0) {
      setFriendSuggestions(uniqueSuggestions);
      // Show suggestion modal after a brief delay
      setTimeout(() => setShowFriendSuggestionModal(true), 500);
    }
  };

  const handleSend = () => {
    if (message.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sendMessageMutation.mutate(message.trim());
    }
  };

  const toggleFriendSelection = (friendId: string) => {
    Haptics.selectionAsync();
    setSelectedFriends(prev =>
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  const handleAddMembers = () => {
    if (selectedFriends.length === 0) {
      safeToast.warning("Select Friends", "Please select at least one friend to add.");
      return;
    }

    // Check member limit before adding
    const currentMembersCount = circle?.members?.length ?? 0;
    const newTotalCount = currentMembersCount + selectedFriends.length;
    const check = canAddCircleMember(entitlements, currentMembersCount);

    if (!check.allowed && check.context) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setPaywallContext(check.context);
      setShowPaywallModal(true);
      return;
    }

    addMembersMutation.mutate(selectedFriends);
  };

  // Filter out friends who are already members
  const availableFriends = useMemo(() => {
    if (!friendsData?.friends || !circle || !circle.members) return [];
    const memberIds = new Set(circle.members.map(m => m.userId));
    return friendsData.friends.filter(f => !memberIds.has(f.friendId));
  }, [friendsData?.friends, circle]);

  if (!session || isLoading || !circle) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const messages = circle.messages ?? [];
  const members = circle.members ?? [];
  const currentUserId = session.user?.id;

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom"]} style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View
        className="flex-row items-center px-4 py-3 border-b"
        style={{ borderColor: colors.border, backgroundColor: colors.surface }}
      >
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
        >
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>

        <Pressable className="flex-1 flex-row items-center">
          <View
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: themeColor + "20" }}
          >
            <Text className="text-xl">{circle.emoji}</Text>
          </View>
          <View className="flex-1">
            <Text className="font-semibold" style={{ color: colors.text }}>
              {circle.name}
            </Text>
            <Text className="text-xs" style={{ color: colors.textTertiary }}>
              {members.length} members
            </Text>
          </View>
        </Pressable>

        {/* Member Avatars - Tappable to open settings */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowGroupSettings(true);
          }}
          className="flex-row mr-3"
        >
          {members.slice(0, 3).map((member, i) => (
            <View
              key={member.userId}
              className="w-8 h-8 rounded-full overflow-hidden border-2"
              style={{
                marginLeft: i > 0 ? -12 : 0,
                borderColor: colors.surface,
                backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB",
              }}
            >
              {member.user.image ? (
                <Image source={{ uri: member.user.image }} className="w-full h-full" />
              ) : (
                <View
                  className="w-full h-full items-center justify-center"
                  style={{ backgroundColor: themeColor + "30" }}
                >
                  <Text className="text-xs font-bold" style={{ color: themeColor }}>
                    {member.user.name?.[0] ?? "?"}
                  </Text>
                </View>
              )}
            </View>
          ))}
          {members.length > 3 && (
            <View
              className="w-8 h-8 rounded-full items-center justify-center border-2"
              style={{
                marginLeft: -12,
                borderColor: colors.surface,
                backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB",
              }}
            >
              <Text className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                +{members.length - 3}
              </Text>
            </View>
          )}
        </Pressable>

        {/* Create Event Button */}
        <View className="items-center">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowCreateEvent(true);
            }}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: themeColor }}
          >
            <CalendarPlus size={18} color="#fff" />
          </Pressable>
          <Text className="text-xs mt-1 font-medium" style={{ color: colors.textSecondary }}>
            Create
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* Calendar Toggle */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowCalendar(!showCalendar);
            setCalendarCollapsedByKeyboard(false);
          }}
          className="flex-row items-center justify-center py-2 border-b"
          style={{ borderColor: colors.border }}
        >
          <Calendar size={14} color={themeColor} />
          <Text className="text-sm font-medium ml-1.5" style={{ color: themeColor }}>
            {showCalendar ? "Hide" : "Show"} Calendar
          </Text>
          {showCalendar ? (
            <ChevronUp size={14} color={themeColor} style={{ marginLeft: 4 }} />
          ) : (
            <ChevronDown size={14} color={themeColor} style={{ marginLeft: 4 }} />
          )}
        </Pressable>

        {/* Mini Calendar */}
        {showCalendar && circle.memberEvents && (() => {
          const totalEvents = circle.memberEvents.reduce((sum, m) => sum + m.events.length, 0);
          
          if (totalEvents === 0) {
            return (
              <Animated.View entering={FadeInDown.duration(200)} className="px-4 pt-3 pb-4">
                <View className="rounded-2xl p-6 items-center" style={{ backgroundColor: colors.surface }}>
                  <View
                    className="w-16 h-16 rounded-full items-center justify-center mb-3"
                    style={{ backgroundColor: colors.surfaceElevated }}
                  >
                    <Calendar size={24} color={colors.textTertiary} />
                  </View>
                  <Text className="text-base font-semibold mb-1" style={{ color: colors.text }}>
                    Nothing planned yet
                  </Text>
                  <Text className="text-center text-sm mb-4" style={{ color: colors.textSecondary }}>
                    Create the first event for this group
                  </Text>
                  <Pressable
                    onPress={() => {
                      router.push({
                        pathname: "/create",
                        params: { circleId: id },
                      } as any);
                    }}
                    className="px-5 py-2.5 rounded-full"
                    style={{ backgroundColor: themeColor }}
                  >
                    <Text className="text-white text-sm font-semibold">Create Event</Text>
                  </Pressable>
                </View>
              </Animated.View>
            );
          }
          
          return (
            <Animated.View entering={FadeInDown.duration(200)} className="px-4 pt-3">
              <MiniCalendar
                memberEvents={circle.memberEvents}
                members={members}
                themeColor={themeColor}
                colors={colors}
                isDark={isDark}
                circleId={id!}
                currentUserId={session?.user?.id ?? null}
              />
            </Animated.View>
          );
        })()}

        {/* Messages List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} tintColor={themeColor} />
          }
          ListEmptyComponent={
            <View className="py-12 items-center">
              <Users size={40} color={colors.textTertiary} />
              <Text className="mt-4 text-center" style={{ color: colors.textSecondary }}>
                Start planning your next hangout!
              </Text>
              <Text className="mt-1 text-center text-sm" style={{ color: colors.textTertiary }}>
                Send a message or create an event
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isOwn={item.userId === currentUserId}
              themeColor={themeColor}
              colors={colors}
              isDark={isDark}
            />
          )}
        />

        {/* Message Input */}
        <View
          className="px-4 py-3 border-t flex-row items-end"
          style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <View
            className="flex-1 flex-row items-end rounded-2xl px-4 py-2 mr-2"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6", minHeight: 44, maxHeight: 100 }}
          >
            <TextInput
              ref={inputRef}
              value={message}
              onChangeText={setMessage}
              placeholder="Message..."
              placeholderTextColor={colors.textTertiary}
              multiline
              className="flex-1 py-1"
              style={{ color: colors.text, fontSize: 16, maxHeight: 80 }}
              onSubmitEditing={handleSend}
            />
          </View>
          <Pressable
            onPress={handleSend}
            disabled={!message.trim() || sendMessageMutation.isPending}
            className="w-11 h-11 rounded-full items-center justify-center"
            style={{
              backgroundColor: message.trim() ? themeColor : isDark ? "#2C2C2E" : "#E5E7EB",
            }}
          >
            <MessageCircle
              size={18}
              color={message.trim() ? "#fff" : colors.textTertiary}
              style={{ marginLeft: 2 }}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Add Members Modal */}
      <Modal
        visible={showAddMembers}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowAddMembers(false);
          setSelectedFriends([]);
        }}
      >
        <Pressable
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => {
            setShowAddMembers(false);
            setSelectedFriends([]);
          }}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <Animated.View
              entering={FadeInDown.duration(200)}
              style={{
                backgroundColor: colors.background,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                maxHeight: "80%",
                minHeight: 300,
              }}
            >
              {/* Modal Handle */}
              <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 8 }}>
                <View
                  style={{
                    width: 36,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: colors.textTertiary,
                    opacity: 0.4,
                  }}
                />
              </View>

              {/* Modal Header */}
              <View style={{ paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <UserPlus size={22} color={themeColor} />
                  <Text style={{ fontSize: 18, fontWeight: "600", marginLeft: 10, color: colors.text }}>
                    Add Members
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setShowAddMembers(false);
                    setSelectedFriends([]);
                  }}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                  }}
                >
                  <X size={18} color={colors.textSecondary} />
                </Pressable>
              </View>

              {/* Friends List */}
              <ScrollView
                style={{ maxHeight: 350 }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
                showsVerticalScrollIndicator={true}
              >
                {availableFriends.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 40 }}>
                    <Users size={40} color={colors.textTertiary} />
                    <Text style={{ fontSize: 16, fontWeight: "500", marginTop: 16, color: colors.textSecondary }}>
                      No more friends to add
                    </Text>
                    <Text style={{ fontSize: 14, marginTop: 6, color: colors.textTertiary, textAlign: "center" }}>
                      All your friends are already in this circle
                    </Text>
                  </View>
                ) : (
                  availableFriends.map((friendship, index) => {
                    const isSelected = selectedFriends.includes(friendship.friendId);
                    return (
                      <Animated.View key={friendship.friendId} entering={FadeInDown.delay(index * 30)}>
                        <Pressable
                          onPress={() => toggleFriendSelection(friendship.friendId)}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingVertical: 12,
                            paddingHorizontal: 12,
                            marginBottom: 8,
                            borderRadius: 12,
                            backgroundColor: isSelected ? `${themeColor}15` : isDark ? "#2C2C2E" : "#F9FAFB",
                            borderWidth: isSelected ? 2 : 1,
                            borderColor: isSelected ? themeColor : colors.border,
                          }}
                        >
                          <View
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 22,
                              overflow: "hidden",
                              backgroundColor: isDark ? "#3C3C3E" : "#E5E7EB",
                            }}
                          >
                            {friendship.friend.image ? (
                              <Image source={{ uri: friendship.friend.image }} style={{ width: "100%", height: "100%" }} />
                            ) : (
                              <View
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  backgroundColor: `${themeColor}30`,
                                }}
                              >
                                <Text style={{ fontSize: 18, fontWeight: "600", color: themeColor }}>
                                  {friendship.friend.name?.[0] ?? "?"}
                                </Text>
                              </View>
                            )}
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={{ fontSize: 16, fontWeight: "500", color: colors.text }}>
                              {friendship.friend.name ?? "Unknown"}
                            </Text>
                            {friendship.friend.Profile?.handle && (
                              <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                                @{friendship.friend.Profile.handle}
                              </Text>
                            )}
                          </View>
                          <View
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 14,
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: isSelected ? themeColor : "transparent",
                              borderWidth: isSelected ? 0 : 2,
                              borderColor: colors.border,
                            }}
                          >
                            {isSelected && <Check size={16} color="#fff" />}
                          </View>
                        </Pressable>
                      </Animated.View>
                    );
                  })
                )}
              </ScrollView>

              {/* Add Button */}
              {availableFriends.length > 0 && (
                <View style={{ paddingHorizontal: 20, paddingBottom: 34, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Pressable
                    onPress={handleAddMembers}
                    disabled={selectedFriends.length === 0 || addMembersMutation.isPending}
                    style={{
                      backgroundColor: selectedFriends.length > 0 ? themeColor : colors.border,
                      paddingVertical: 16,
                      borderRadius: 14,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: "600", color: selectedFriends.length > 0 ? "#fff" : colors.textTertiary }}>
                      {addMembersMutation.isPending
                        ? "Adding..."
                        : selectedFriends.length > 0
                          ? `Add ${selectedFriends.length} Friend${selectedFriends.length > 1 ? "s" : ""}`
                          : "Select Friends to Add"}
                    </Text>
                  </Pressable>
                </View>
              )}
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Friend Suggestion Modal */}
      <Modal
        visible={showFriendSuggestionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFriendSuggestionModal(false)}
      >
        <Pressable
          style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 20 }}
          onPress={() => setShowFriendSuggestionModal(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 340 }}>
            <Animated.View
              entering={FadeIn.duration(200)}
              style={{
                backgroundColor: colors.background,
                borderRadius: 20,
                padding: 24,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: `${themeColor}20`,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <UserCheck size={32} color={themeColor} />
              </View>

              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center", marginBottom: 8 }}>
                Members Added!
              </Text>

              <Text style={{ fontSize: 15, color: colors.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 20 }}>
                {friendSuggestions.length === 1
                  ? `${friendSuggestions[0]?.newMemberName} has been added to the circle.`
                  : `${friendSuggestions.length} new members have been added to the circle.`}
                {"\n\n"}
                <Text style={{ color: colors.text, fontWeight: "500" }}>
                  Tip: Make sure everyone in the circle is friends with each other to see all events!
                </Text>
              </Text>

              <View style={{ flexDirection: "row", width: "100%" }}>
                <Pressable
                  onPress={() => setShowFriendSuggestionModal(false)}
                  style={{
                    flex: 1,
                    backgroundColor: themeColor,
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff" }}>
                    Got it!
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Group Settings Modal */}
      <Modal
        visible={showGroupSettings}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGroupSettings(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <Pressable
            style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}
            onPress={() => setShowGroupSettings(false)}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <Animated.View
                entering={FadeIn.duration(200)}
                style={{
                  backgroundColor: colors.background,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  paddingBottom: Math.max(insets.bottom, 20) + 8,
                  maxHeight: "85%",
                }}
              >
              {/* Handle */}
              <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 8 }}>
                <View style={{ width: 40, height: 4, backgroundColor: colors.textTertiary, borderRadius: 2, opacity: 0.4 }} />
              </View>

              {/* Header */}
              <View style={{ paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center" }}>
                  Group Settings
                </Text>
              </View>

              {/* Scrollable content for keyboard accessibility */}
              <ScrollView 
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
              {/* Group Info */}
              <View style={{ paddingHorizontal: 20, paddingVertical: 16, flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: `${themeColor}20`,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 16,
                  }}
                >
                  <Text style={{ fontSize: 28 }}>{circle?.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>
                    {circle?.name}
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                    {members.length} member{members.length !== 1 ? "s" : ""}
                  </Text>
                </View>
              </View>

              {/* Description Section */}
              <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.textSecondary }}>Description</Text>
                  {isHost && !editingDescription && (
                    <Pressable
                      onPress={() => {
                        setDescriptionText(circle?.description ?? "");
                        setEditingDescription(true);
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "500", color: themeColor }}>Edit</Text>
                    </Pressable>
                  )}
                </View>
                {editingDescription && isHost ? (
                  <View>
                    <TextInput
                      value={descriptionText}
                      onChangeText={(text) => setDescriptionText(text.slice(0, 160))}
                      placeholder="Add a group description..."
                      placeholderTextColor={colors.textTertiary}
                      multiline
                      maxLength={160}
                      style={{
                        backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                        borderRadius: 12,
                        padding: 12,
                        color: colors.text,
                        fontSize: 15,
                        minHeight: 60,
                        textAlignVertical: "top",
                      }}
                    />
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                      <Text style={{ fontSize: 12, color: colors.textTertiary }}>{descriptionText.length}/160</Text>
                      <View style={{ flexDirection: "row" }}>
                        <Pressable
                          onPress={() => setEditingDescription(false)}
                          style={{ paddingHorizontal: 16, paddingVertical: 8, marginRight: 8 }}
                        >
                          <Text style={{ fontSize: 14, fontWeight: "500", color: colors.textSecondary }}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            const newDescription = descriptionText.trim() || undefined;
                            updateCircleMutation.mutate({ description: newDescription ?? "" });
                          }}
                          disabled={updateCircleMutation.isPending}
                          style={{
                            backgroundColor: themeColor,
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                            borderRadius: 8,
                            opacity: updateCircleMutation.isPending ? 0.5 : 1,
                          }}
                        >
                          <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>
                            {updateCircleMutation.isPending ? "Saving..." : "Save"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ) : (
                  <Text style={{ fontSize: 15, color: circle?.description ? colors.text : colors.textTertiary, fontStyle: circle?.description ? "normal" : "italic" }}>
                    {circle?.description ?? (isHost ? "Tap Edit to add a description" : "No description")}
                  </Text>
                )}
              </View>

              {/* Settings Options */}
              <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
                {/* Members List */}
                <Pressable
                  onPress={() => {
                    setShowGroupSettings(false);
                    setShowMembersSheet(true);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Users size={22} color={colors.text} />
                  <View style={{ flex: 1, marginLeft: 16 }}>
                    <Text style={{ fontSize: 16, fontWeight: "500", color: colors.text }}>Members</Text>
                  </View>
                  <ChevronRight size={20} color={colors.textTertiary} />
                </Pressable>

                {/* Share Group */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Share.share({
                      message: `Join my group "${circle?.name}" on Open Invite!`,
                      title: circle?.name,
                    }).catch(() => {
                      // User cancelled share
                    });
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Users size={22} color={themeColor} />
                  <View style={{ flex: 1, marginLeft: 16 }}>
                    <Text style={{ fontSize: 16, fontWeight: "500", color: colors.text }}>Share Group</Text>
                  </View>
                  <ChevronRight size={20} color={colors.textTertiary} />
                </Pressable>

                {/* Leave Group */}
                <Pressable
                  onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    setShowGroupSettings(false);
                    // Navigate back and let the delete happen from friends screen
                    router.back();
                    safeToast.info("Leave Group", "To leave this group, swipe left on it in your Friends tab.");
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 16,
                  }}
                >
                  <X size={22} color="#FF3B30" />
                  <View style={{ flex: 1, marginLeft: 16 }}>
                    <Text style={{ fontSize: 16, fontWeight: "500", color: "#FF3B30" }}>Leave Group</Text>
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>Remove yourself from this group</Text>
                  </View>
                </Pressable>
              </View>
              </ScrollView>
            </Animated.View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Members Sheet Modal */}
      <Modal
        visible={showMembersSheet}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowMembersSheet(false);
          setSelectedFriends([]);
        }}
      >
        <Pressable
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => {
            setShowMembersSheet(false);
            setSelectedFriends([]);
          }}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <Animated.View
              entering={FadeInDown.duration(200)}
              style={{
                backgroundColor: colors.background,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                maxHeight: "90%",
                minHeight: Dimensions.get('window').height * 0.85,
              }}
            >
              {/* Modal Handle */}
              <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 8 }}>
                <View
                  style={{
                    width: 36,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: colors.textTertiary,
                    opacity: 0.4,
                  }}
                />
              </View>

              {/* Modal Header */}
              <View style={{ paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>
                  Members
                </Text>
              </View>

              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 }}>
                {/* Members List */}
                {members.map((member, idx) => {
                  const isHostOfCircle = circle?.createdById === member.userId;
                  return (
                    <Pressable
                      key={member.userId}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowMembersSheet(false);
                        setSelectedFriends([]);
                        router.push(`/user/${member.userId}`);
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 12,
                        borderBottomWidth: idx < members.length - 1 ? 1 : 0,
                        borderBottomColor: colors.border,
                      }}
                    >
                      {/* Avatar */}
                      <View
                        className="w-10 h-10 rounded-full overflow-hidden mr-3"
                        style={{
                          backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB",
                        }}
                      >
                        {member.user.image ? (
                          <Image source={{ uri: member.user.image }} className="w-full h-full" />
                        ) : (
                          <View
                            className="w-full h-full items-center justify-center"
                            style={{ backgroundColor: themeColor + "30" }}
                          >
                            <Text className="text-xs font-bold" style={{ color: themeColor }}>
                              {member.user.name?.[0] ?? "?"}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Name and Host Badge */}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={{ fontSize: 16, fontWeight: "500", color: colors.text }}>
                            {member.user.name}
                          </Text>
                          {isHostOfCircle && (
                            <View style={{ marginLeft: 8, backgroundColor: themeColor + "20", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ fontSize: 11, fontWeight: "600", color: themeColor }}>Host</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      
                      {/* Remove button (host only, cannot remove self) */}
                      {isHost && !isHostOfCircle && (
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            if (__DEV__) {
                              devLog('[CircleRemoveMember] Trash pressed, member snapshot:', {
                                memberId: member.id,
                                memberUserId: member.userId,
                                memberUserIdFromUser: member.user?.id,
                                memberName: member.user?.name,
                                circleId: id,
                              });
                            }
                            // Use member.userId (from schema) for the mutation
                            const targetUserId = member.userId;
                            if (!targetUserId) {
                              devError('[CircleRemoveMember] ERROR: No userId found for member');
                              safeToast.error("Error", "Unable to identify member. Please try again.");
                              return;
                            }
                            // Close the members sheet FIRST, then show confirmation
                            setShowMembersSheet(false);
                            // Small delay to allow sheet animation to start
                            setTimeout(() => {
                              setSelectedMemberToRemove(targetUserId);
                            }, 100);
                          }}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "#FF3B3015",
                            marginRight: 8,
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <TrashIcon size={16} color="#FF3B30" />
                        </Pressable>
                      )}

                      {/* Chevron indicator */}
                      <ChevronRight size={18} color={colors.textTertiary} />
                    </Pressable>
                  );
                })}

                {/* Add Members Section */}
                <View style={{ marginTop: 16, paddingBottom: 16 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text, marginBottom: 12 }}>Add Members</Text>

                  {availableFriends.length > 0 ? (
                    <ScrollView
                      style={{ maxHeight: 300 }}
                      contentContainerStyle={{ paddingBottom: 8 }}
                      showsVerticalScrollIndicator={false}
                    >
                      {availableFriends.map((friend) => {
                        const isSelected = selectedFriends.includes(friend.friendId);
                        return (
                          <Animated.View
                            key={friend.friendId}
                            entering={FadeInDown.springify()}
                          >
                            <Pressable
                              onPress={() => toggleFriendSelection(friend.friendId)}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                paddingVertical: 10,
                                borderBottomWidth: 1,
                                borderBottomColor: colors.border,
                              }}
                            >
                              <View
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: 5,
                                  marginRight: 12,
                                  borderWidth: 2,
                                  borderColor: isSelected ? themeColor : colors.border,
                                  backgroundColor: isSelected ? themeColor : "transparent",
                                }}
                              >
                                {isSelected && <Check size={8} color="#fff" style={{ marginTop: -1 }} />}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: "500", color: colors.text }}>
                                  {friend.friend.name}
                                </Text>
                              </View>
                              <View
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: 10,
                                  borderWidth: 2,
                                  borderColor: colors.border,
                                  backgroundColor: isSelected ? themeColor : "transparent",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {isSelected && <Check size={16} color="#fff" />}
                              </View>
                            </Pressable>
                          </Animated.View>
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>No more friends to add</Text>
                  )}
                </View>
              </ScrollView>

              {/* Add Button */}
              {selectedFriends.length > 0 && (
                <View style={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Pressable
                    onPress={handleAddMembers}
                    disabled={selectedFriends.length === 0 || addMembersMutation.isPending}
                    style={{
                      backgroundColor: selectedFriends.length > 0 ? themeColor : colors.border,
                      paddingVertical: 14,
                      borderRadius: 12,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: "600", color: selectedFriends.length > 0 ? "#fff" : colors.textTertiary }}>
                      {addMembersMutation.isPending
                        ? "Adding..."
                        : `Add ${selectedFriends.length} Friend${selectedFriends.length > 1 ? "s" : ""}`}
                    </Text>
                  </Pressable>
                </View>
              )}
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Remove Member Confirmation Modal */}
      <Modal
        visible={!!selectedMemberToRemove}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSelectedMemberToRemove(null)}
      >
        <Pressable
          style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 20 }}
          onPress={() => setSelectedMemberToRemove(null)}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 340 }}>
            <Animated.View
              entering={FadeIn.duration(200)}
              style={{
                backgroundColor: colors.background,
                borderRadius: 20,
                padding: 24,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: "#FF3B3020",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <WarningIcon size={32} color="#FF3B30" />
              </View>

              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center", marginBottom: 8 }}>
                Remove Member?
              </Text>

              <Text style={{ fontSize: 15, color: colors.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 20 }}>
                {(() => {
                  const memberToRemove = members.find(m => m.userId === selectedMemberToRemove);
                  return `Are you sure you want to remove ${memberToRemove?.user.name ?? "this member"} from the circle?`;
                })()}
              </Text>

              <View style={{ flexDirection: "row", width: "100%" }}>
                <Pressable
                  onPress={() => setSelectedMemberToRemove(null)}
                  style={{
                    flex: 1,
                    backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                    marginRight: 8,
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (selectedMemberToRemove) {
                      if (__DEV__) {
                        devLog('[CircleRemoveMember] Confirm pressed:', {
                          circleId: id,
                          memberUserIdToRemove: selectedMemberToRemove,
                          apiPath: `/api/circles/${id}/members/${selectedMemberToRemove}`,
                        });
                      }
                      removeMemberMutation.mutate(selectedMemberToRemove);
                    }
                  }}
                  disabled={removeMemberMutation.isPending}
                  style={{
                    flex: 1,
                    backgroundColor: "#FF3B30",
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                    opacity: removeMemberMutation.isPending ? 0.5 : 1,
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff" }}>
                    {removeMemberMutation.isPending ? "Removing..." : "Remove"}
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Create Event Modal with visibility tabs */}
      <Modal
        visible={showCreateEvent}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateEvent(false)}
      >
        <Pressable
          onPress={() => setShowCreateEvent(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 20,
              padding: 20,
              width: "85%",
              maxWidth: 340,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text, textAlign: "center", marginBottom: 16 }}>
              Create Event
            </Text>

            {/* Circle Only indicator */}
            <View style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6", borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <Text style={{
                textAlign: "center",
                fontSize: 14,
                fontWeight: "600",
                color: themeColor,
              }}>
                Circle Only
              </Text>
            </View>

            {/* Description text */}
            <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: "center", marginBottom: 20 }}>
              Events created here are only visible to friends in this group.
            </Text>

            {/* Create Button */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowCreateEvent(false);
                router.push(`/create?circleId=${id}&visibility=circle_only` as any);
              }}
              style={{
                backgroundColor: themeColor,
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff" }}>Create</Text>
            </Pressable>

            {/* Cancel Button */}
            <Pressable
              onPress={() => setShowCreateEvent(false)}
              style={{ paddingVertical: 12, marginTop: 8 }}
            >
              <Text style={{ fontSize: 14, fontWeight: "500", color: colors.textSecondary, textAlign: "center" }}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Paywall Modal for member limit gating */}
      <PaywallModal
        visible={showPaywallModal}
        context={paywallContext}
        onClose={() => setShowPaywallModal(false)}
      />
    </SafeAreaView>
  );
}
