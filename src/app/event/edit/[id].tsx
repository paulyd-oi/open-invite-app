import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Switch,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import {
  MapPin,
  Users,
  Compass,
  Check,
  Trash2,
  ChevronLeft,
  HandCoins,
  ListChecks,
  X,
  Plus,
  Crown,
} from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { safeToast } from "@/lib/safeToast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { CirclePhotoEmoji } from "@/components/CirclePhotoEmoji";
import {
  type GetEventsResponse,
  type UpdateEventRequest,
  type UpdateEventResponse,
  type GetCirclesResponse,
  type Circle,
  type DeleteEventResponse,
  type EventVisibility,
} from "@/shared/contracts";
import {
  eventKeys,
  invalidateEventKeys,
  getInvalidateAfterEventEdit,
  getInvalidateAfterEventDelete,
} from "@/lib/eventQueryKeys";
import { circleKeys } from "@/lib/circleQueryKeys";
import { EVENT_THEMES, isPremiumTheme, isValidThemeId, getVisibleThemePacks, type ThemeId } from "@/lib/eventThemes";
import { usePremiumStatusContract } from "@/lib/entitlements";
import { useSubscription } from "@/lib/SubscriptionContext";
import { Lock } from "@/ui/icons";
import EmojiPicker from "rn-emoji-keyboard";

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [emoji, setEmoji] = useState("📅");
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 2);
    return d;
  });
  const [visibility, setVisibility] = useState<EventVisibility>("all_friends");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Capacity state
  const [hasCapacity, setHasCapacity] = useState(false);
  const [capacityInput, setCapacityInput] = useState("");

  // Pitch In state
  const [pitchInEnabled, setPitchInEnabled] = useState(false);
  const [pitchInAmount, setPitchInAmount] = useState("");
  const [pitchInMethod, setPitchInMethod] = useState<"venmo" | "cashapp" | "paypal" | "other">("venmo");
  const [pitchInHandle, setPitchInHandle] = useState("");
  const [pitchInNote, setPitchInNote] = useState("");

  // What to Bring state
  const [bringListEnabled, setBringListEnabled] = useState(false);
  const [bringListItems, setBringListItems] = useState<string[]>([]);
  const [bringListInput, setBringListInput] = useState("");

  // Event Themes V1
  const [selectedThemeId, setSelectedThemeId] = useState<ThemeId | null>(null);
  const [originalThemeId, setOriginalThemeId] = useState<ThemeId | null>(null);
  const premiumStatus = usePremiumStatusContract();
  const { isPro: userIsPro } = premiumStatus;
  const { openPaywall } = useSubscription();
  // Downgrade-safe: event's original premium theme is preserved even without Pro
  const hasPreservedPremiumTheme = !userIsPro && originalThemeId !== null && isPremiumTheme(originalThemeId);

  // Fetch event data
  const { data: myEventsData } = useQuery({
    queryKey: eventKeys.mine(),
    queryFn: () => api.get<GetEventsResponse>("/api/events"),
    enabled: isAuthedForNetwork(bootStatus, session),
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
      // Prefill end time: use event.endTime if available, otherwise default to start + 2 hours
      if (event.endTime) {
        setEndDate(new Date(event.endTime));
      } else {
        const defaultEnd = new Date(event.startTime);
        defaultEnd.setHours(defaultEnd.getHours() + 2);
        setEndDate(defaultEnd);
      }
      setVisibility((event.visibility as EventVisibility) ?? "all_friends");
      if (event.groupVisibility) {
        setSelectedGroupIds(event.groupVisibility.map((g) => g.groupId));
      }
      // Load capacity
      if (event.capacity != null) {
        setHasCapacity(true);
        setCapacityInput(String(event.capacity));
      }
      // Load Pitch In
      if (event.pitchInEnabled) {
        setPitchInEnabled(true);
        setPitchInAmount(event.pitchInAmount ?? "");
        setPitchInMethod((event.pitchInMethod as "venmo" | "cashapp" | "paypal" | "other") ?? "venmo");
        setPitchInHandle(event.pitchInHandle ?? "");
        setPitchInNote(event.pitchInNote ?? "");
      }
      // Load What to Bring
      if (event.bringListEnabled && event.bringListItems && event.bringListItems.length > 0) {
        setBringListEnabled(true);
        setBringListItems(event.bringListItems.map((i: { label: string }) => i.label));
      }
      // Load Event Theme
      const evtThemeId = (event as any).themeId;
      if (isValidThemeId(evtThemeId)) {
        setSelectedThemeId(evtThemeId);
        setOriginalThemeId(evtThemeId);
      }
      setIsLoaded(true);
    }
  }, [event, isLoaded]);

  const { data: circlesData } = useQuery({
    queryKey: circleKeys.all(),
    queryFn: () => api.get<GetCirclesResponse>("/api/circles"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  const circles = circlesData?.circles ?? [];

  const updateMutation = useMutation({
    mutationFn: (data: UpdateEventRequest) =>
      api.put<UpdateEventResponse>(`/api/events/${id}`, data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // P0 FIX: Invalidate using SSOT contract
      invalidateEventKeys(queryClient, getInvalidateAfterEventEdit(id ?? ""), "event_update");
      // P0 FIX: Invalidate circle calendars so updated event reflects in circle views
      queryClient.invalidateQueries({ queryKey: circleKeys.all() });
      safeToast.success("Updated", "Your event has been updated.");
      router.back();
    },
    onError: (error) => {
      safeToast.error("Oops", "That didn't go through. Please try again.");
      devError("[EVENT_EDIT]", "Update failed:", error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete<DeleteEventResponse>(`/api/events/${id}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // P0 FIX: Invalidate using SSOT contract
      invalidateEventKeys(queryClient, getInvalidateAfterEventDelete(), "event_delete");
      // P0 FIX: Invalidate circle calendars so deleted event is removed from circle views
      queryClient.invalidateQueries({ queryKey: circleKeys.all() });
      safeToast.success("Deleted", "Your event has been deleted.");
      router.replace("/calendar");
    },
    onError: () => {
      safeToast.error("Oops", "That didn't go through. Please try again.");
    },
  });

  /**
   * Normalize a location string to prevent duplicated address segments.
   */
  const normalizeLocationString = (raw: string | null | undefined): string | undefined => {
    if (!raw || typeof raw !== "string") return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    const parts = trimmed.split(/,\s*/).map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) return trimmed;

    const deduped: string[] = [parts[0]];
    for (let i = 1; i < parts.length; i++) {
      const prev = deduped[deduped.length - 1].toLowerCase();
      const curr = parts[i].toLowerCase();
      if (curr === prev || prev.includes(curr)) continue;
      deduped.push(parts[i]);
    }

    return deduped.join(", ") || undefined;
  };

  const handleSave = () => {
    if (!title.trim()) {
      safeToast.warning("Missing Title", "Please enter a title for your event.");
      return;
    }

    if (visibility === "specific_groups" && selectedGroupIds.length === 0) {
      safeToast.warning("No Groups Selected", "Please select at least one group.");
      return;
    }

    // Validate endTime > startTime
    if (endDate <= startDate) {
      safeToast.warning("Invalid Time", "End time must be after start time.");
      return;
    }

    // Normalize location to fix any stored duplicated address segments
    const _normalizedLocation = normalizeLocationString(location) ?? (location.trim() || undefined);

    if (__DEV__) {
      devLog("[P0_EVENT_CREATE_LOCATION_PAYLOAD]", {
        rawLocationState: location,
        normalizedLocation: _normalizedLocation,
        context: "edit",
      });
    }

    updateMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      location: _normalizedLocation,
      emoji,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      visibility,
      groupIds: visibility === "specific_groups" ? selectedGroupIds : undefined,
      capacity: hasCapacity && capacityInput ? parseInt(capacityInput, 10) : null,
      // Pitch In V1
      ...(pitchInEnabled && pitchInHandle.trim() ? {
        pitchInEnabled: true,
        pitchInTone: pitchInAmount.trim() ? "suggested" as const : "optional" as const,
        pitchInAmount: pitchInAmount.trim() || undefined,
        pitchInMethod,
        pitchInHandle: pitchInHandle.trim(),
        pitchInNote: pitchInNote.trim() || undefined,
      } : { pitchInEnabled: false }),
      // What to Bring V2
      ...(bringListEnabled && bringListItems.length > 0 ? {
        bringListEnabled: true,
        bringListItems: bringListItems.map((label, i) => ({
          id: `item_${i}_${Date.now()}`,
          label,
        })),
      } : { bringListEnabled: false }),
      // Event Themes V1
      themeId: selectedThemeId ?? null,
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

  // [QA-8] Suppress login flash: only show sign-in prompt when definitively logged out
  if (!session) {
    if (bootStatus !== 'loggedOut') return null;
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in to edit events</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center px-6">
          <Text 
            className="text-xl font-semibold text-center mb-2"
            style={{ color: colors.text }}
          >
            Event not available
          </Text>
          <Text 
            className="text-center mb-4"
            style={{ color: colors.textSecondary }}
          >
            This event may have been deleted or is no longer available.
          </Text>
          <Pressable
            onPress={() => router.canGoBack() ? router.back() : router.replace('/friends')}
            className="py-3 px-6 rounded-full items-center"
            style={{ backgroundColor: colors.surface }}
          >
            <Text className="font-medium" style={{ color: colors.text }}>
              Go Back
            </Text>
          </Pressable>
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
          {/* Emoji Picker — tap to open rn-emoji-keyboard */}
          <Animated.View entering={FadeInDown.delay(0).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 mt-4">Event Icon</Text>
            <Pressable
              onPress={() => setShowEmojiPicker(true)}
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <View className="flex-row items-center">
                <View className="w-12 h-12 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: `${themeColor}20` }}>
                  <Text className="text-2xl">{emoji}</Text>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Tap to change icon</Text>
              </View>
            </Pressable>
          </Animated.View>

          {/* Event Theme Picker — Curated Collections */}
          <Animated.View entering={FadeInDown.delay(25).springify()}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "500", marginBottom: 4, marginTop: 4 }}>Event Theme</Text>
            {hasPreservedPremiumTheme && (
              <Text style={{ color: colors.textTertiary, fontSize: 12, marginBottom: 8, lineHeight: 16 }}>
                This event keeps its premium theme from your previous Pro access. You can keep this look or switch to a free theme.
              </Text>
            )}
            {getVisibleThemePacks(new Date(), originalThemeId).map((pack, packIdx, packs) => {
              const isFirstPremium = pack.premium && (packIdx === 0 || !packs[packIdx - 1].premium);
              return (
                <View key={pack.label}>
                  {/* Premium section divider — shown once before the first premium pack */}
                  {isFirstPremium && (
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12, marginBottom: 2, paddingHorizontal: 4 }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }} />
                      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8 }}>
                        <Crown size={10} color={colors.textTertiary} />
                        <Text style={{ fontSize: 10, fontWeight: "600", color: colors.textTertiary, marginLeft: 3, letterSpacing: 0.5 }}>PRO</Text>
                      </View>
                      <View style={{ flex: 1, height: 1, backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }} />
                    </View>
                  )}
                  <Text style={{ fontSize: 11, fontWeight: "600", color: colors.textTertiary, marginTop: 8, marginBottom: 4, paddingLeft: 4 }}>{pack.label}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 4 }}>
                    <View style={{ flexDirection: "row", gap: 8, paddingRight: 16 }}>
                      {pack.ids.map((tid) => {
                        const t = EVENT_THEMES[tid];
                        const selected = selectedThemeId === tid;
                        const premium = isPremiumTheme(tid);
                        // Preserved: this is the event's original premium theme, kept after downgrade
                        const isPreserved = premium && !userIsPro && tid === originalThemeId;
                        const locked = premium && !userIsPro && !isPreserved;
                        return (
                          <Pressable
                            key={tid}
                            onPress={() => {
                              if (locked) {
                                openPaywall?.({ source: "theme_picker" });
                                return;
                              }
                              Haptics.selectionAsync();
                              setSelectedThemeId(selected ? null : tid);
                            }}
                            style={{
                              width: 72,
                              alignItems: "center",
                              paddingVertical: 10,
                              paddingHorizontal: 4,
                              borderRadius: 14,
                              borderWidth: selected ? 2 : 1,
                              borderColor: selected ? t.backAccent : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"),
                              backgroundColor: selected
                                ? (isDark ? `${t.backAccent}18` : `${t.backAccent}0C`)
                                : (isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"),
                              opacity: locked ? 0.65 : 1,
                            }}
                          >
                            <Text style={{ fontSize: 22, marginBottom: 4 }}>{t.swatch}</Text>
                            <Text style={{ fontSize: 10, fontWeight: "600", color: selected ? t.backAccent : colors.textSecondary, textAlign: "center" }} numberOfLines={1}>
                              {t.label}
                            </Text>
                            {locked && (
                              <View style={{ position: "absolute", top: 4, right: 4 }}>
                                <Lock size={10} color={colors.textTertiary} />
                              </View>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              );
            })}
            <View style={{ height: 12 }} />
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
            <View 
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              {/* Start Row */}
              <View className="flex-row items-center justify-between mb-3">
                <Text style={{ color: colors.textSecondary }} className="text-xs font-medium w-12">START</Text>
                <View className="flex-row flex-1 items-center justify-end">
                  <DateTimePicker
                    value={startDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "compact" : "default"}
                    themeVariant={isDark ? "dark" : "light"}
                    onChange={(_, date) => date && setStartDate(date)}
                  />
                  <DateTimePicker
                    value={startDate}
                    mode="time"
                    display={Platform.OS === "ios" ? "compact" : "default"}
                    themeVariant={isDark ? "dark" : "light"}
                    onChange={(_, date) => date && setStartDate(date)}
                  />
                </View>
              </View>

              {/* End Row */}
              <View className="flex-row items-center justify-between">
                <Text style={{ color: colors.textSecondary }} className="text-xs font-medium w-12">END</Text>
                <View className="flex-row flex-1 items-center justify-end">
                  <DateTimePicker
                    value={endDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "compact" : "default"}
                    themeVariant={isDark ? "dark" : "light"}
                    onChange={(_, date) => date && setEndDate(date)}
                  />
                  <DateTimePicker
                    value={endDate}
                    mode="time"
                    display={Platform.OS === "ios" ? "compact" : "default"}
                    themeVariant={isDark ? "dark" : "light"}
                    onChange={(_, date) => date && setEndDate(date)}
                  />
                </View>
              </View>
            </View>
          </Animated.View>
          {__DEV__ && (() => { devLog("[DEV_DECISION] edit_event_time_ui source=inline_compact_start_end_matching_create"); return null; })()}

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
                  Groups
                </Text>
              </Pressable>
            </View>
            {__DEV__ && (() => { devLog("[DEV_DECISION] edit_event_private_removed true"); return null; })()}

            {/* Group Selection */}
            {visibility === "specific_groups" && (
              <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.text }} className="text-sm font-medium mb-3">Select Groups</Text>
                {circles.length === 0 ? (
                  <Text style={{ color: colors.textTertiary }} className="text-center py-4">
                    No groups yet. Create groups from Friends tab!
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
                        className="w-8 h-8 rounded-lg items-center justify-center mr-3 overflow-hidden"
                        style={{ backgroundColor: `${themeColor}20` }}
                      >
                        <CirclePhotoEmoji photoUrl={circle.photoUrl} emoji={circle.emoji} emojiClassName="text-base" />
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

          {/* Capacity */}
          <Animated.View entering={FadeInDown.delay(285).springify()}>
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-1">
                <Text style={{ color: colors.textSecondary }} className="text-sm font-medium">Limit number of guests</Text>
                <Text style={{ color: colors.textTertiary }} className="text-xs mt-0.5">Once full, RSVPs close automatically.</Text>
              </View>
              <Switch
                value={hasCapacity}
                onValueChange={(value) => {
                  Haptics.selectionAsync();
                  setHasCapacity(value);
                  if (!value) setCapacityInput("");
                }}
                trackColor={{ false: colors.separator, true: `${themeColor}80` }}
                thumbColor={hasCapacity ? themeColor : colors.textTertiary}
              />
            </View>
            {hasCapacity && (
              <View className="rounded-xl p-3 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <TextInput
                  value={capacityInput}
                  onChangeText={(text) => setCapacityInput(text.replace(/[^0-9]/g, ""))}
                  placeholder="e.g. 6"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="number-pad"
                  className="text-base"
                  style={{ color: colors.text }}
                />
              </View>
            )}
          </Animated.View>
          {/* Pitch In V1 */}
          <Animated.View entering={FadeInDown.delay(300).springify()}>
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-1 flex-row items-center">
                <HandCoins size={16} color={colors.textSecondary} />
                <View className="ml-2 flex-1">
                  <Text style={{ color: colors.textSecondary }} className="text-sm font-medium">Pitch In</Text>
                  <Text style={{ color: colors.textTertiary }} className="text-xs mt-0.5">Let guests chip in for costs</Text>
                </View>
              </View>
              <Switch
                value={pitchInEnabled}
                onValueChange={(value) => {
                  Haptics.selectionAsync();
                  setPitchInEnabled(value);
                }}
                trackColor={{ false: colors.separator, true: `${themeColor}80` }}
                thumbColor={pitchInEnabled ? themeColor : colors.textTertiary}
              />
            </View>
            {pitchInEnabled && (
              <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <TextInput
                  value={pitchInAmount}
                  onChangeText={setPitchInAmount}
                  placeholder="Suggested amount (e.g. $10)"
                  placeholderTextColor={colors.textTertiary}
                  className="rounded-lg p-3 mb-3"
                  style={{ backgroundColor: colors.surfaceElevated, color: colors.text }}
                />
                <Text style={{ color: colors.textSecondary }} className="text-xs font-medium mb-2">Payment method</Text>
                <View className="flex-row mb-3">
                  {(["venmo", "cashapp", "paypal", "other"] as const).map((method) => (
                    <Pressable
                      key={method}
                      onPress={() => { Haptics.selectionAsync(); setPitchInMethod(method); }}
                      className="flex-1 py-2 rounded-lg items-center mr-1.5"
                      style={{
                        backgroundColor: pitchInMethod === method ? `${themeColor}20` : colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: pitchInMethod === method ? `${themeColor}60` : "transparent",
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "600", color: pitchInMethod === method ? themeColor : colors.textSecondary }}>
                        {method === "venmo" ? "Venmo" : method === "cashapp" ? "Cash App" : method === "paypal" ? "PayPal" : "Other"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  value={pitchInHandle}
                  onChangeText={setPitchInHandle}
                  placeholder={pitchInMethod === "venmo" || pitchInMethod === "cashapp" ? "@username" : "Payment handle"}
                  placeholderTextColor={colors.textTertiary}
                  className="rounded-lg p-3 mb-3"
                  style={{ backgroundColor: colors.surfaceElevated, color: colors.text }}
                />
                <TextInput
                  value={pitchInNote}
                  onChangeText={(text) => setPitchInNote(text.slice(0, 100))}
                  placeholder="Note (e.g. for food & drinks)"
                  placeholderTextColor={colors.textTertiary}
                  className="rounded-lg p-3"
                  style={{ backgroundColor: colors.surfaceElevated, color: colors.text }}
                />
              </View>
            )}
          </Animated.View>

          {/* What to Bring V2 */}
          <Animated.View entering={FadeInDown.delay(320).springify()}>
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-1 flex-row items-center">
                <ListChecks size={16} color={colors.textSecondary} />
                <View className="ml-2 flex-1">
                  <Text style={{ color: colors.textSecondary }} className="text-sm font-medium">What to bring</Text>
                  <Text style={{ color: colors.textTertiary }} className="text-xs mt-0.5">Guests can claim items to bring</Text>
                </View>
              </View>
              <Switch
                value={bringListEnabled}
                onValueChange={(value) => {
                  Haptics.selectionAsync();
                  setBringListEnabled(value);
                }}
                trackColor={{ false: colors.separator, true: `${themeColor}80` }}
                thumbColor={bringListEnabled ? themeColor : colors.textTertiary}
              />
            </View>
            {bringListEnabled && (
              <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <View className="flex-row items-center mb-3">
                  <TextInput
                    value={bringListInput}
                    onChangeText={setBringListInput}
                    placeholder="e.g. Chips, Ice, Cups..."
                    placeholderTextColor={colors.textTertiary}
                    className="flex-1 rounded-lg p-3 mr-2"
                    style={{ backgroundColor: colors.surfaceElevated, color: colors.text }}
                    onSubmitEditing={() => {
                      const trimmed = bringListInput.trim();
                      if (trimmed && bringListItems.length < 20) {
                        setBringListItems((prev) => [...prev, trimmed]);
                        setBringListInput("");
                      }
                    }}
                  />
                  <Pressable
                    onPress={() => {
                      const trimmed = bringListInput.trim();
                      if (trimmed && bringListItems.length < 20) {
                        Haptics.selectionAsync();
                        setBringListItems((prev) => [...prev, trimmed]);
                        setBringListInput("");
                      }
                    }}
                    className="w-10 h-10 rounded-lg items-center justify-center"
                    style={{ backgroundColor: bringListInput.trim() ? themeColor : colors.surfaceElevated }}
                  >
                    <Plus size={18} color={bringListInput.trim() ? "#FFFFFF" : colors.textTertiary} />
                  </Pressable>
                </View>
                {bringListItems.map((item, index) => (
                  <View key={`${item}-${index}`} className="flex-row items-center py-2 px-3 rounded-lg mb-1.5" style={{ backgroundColor: colors.surfaceElevated }}>
                    <Text className="flex-1" style={{ color: colors.text, fontSize: 14 }}>{item}</Text>
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        setBringListItems((prev) => prev.filter((_, i) => i !== index));
                      }}
                      className="w-7 h-7 rounded-full items-center justify-center"
                    >
                      <X size={14} color={colors.textTertiary} />
                    </Pressable>
                  </View>
                ))}
                {bringListItems.length >= 20 && (
                  <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 4 }}>Maximum 20 items</Text>
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
      <EmojiPicker
        open={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onEmojiSelected={(emojiObject) => {
          setEmoji(emojiObject.emoji);
          Haptics.selectionAsync();
          setShowEmojiPicker(false);
        }}
      />
    </SafeAreaView>
  );
}
