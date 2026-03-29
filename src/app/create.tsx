import React, { useState, useEffect, useCallback } from "react";
import { trackEventCreated as trackEventCreatedAnalytics, trackValueEventCreated } from "@/analytics/analyticsEventsSSOT";
import { View, Text, ScrollView, Pressable, Platform, StyleSheet } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams } from "expo-router";
import { devLog } from "@/lib/devLog";
import { circleKeys } from "@/lib/circleQueryKeys";
import { qk } from "@/lib/queryKeys";
import { trackEventCreated } from "@/lib/rateApp";
import { resolveEventTheme, type ThemeId } from "@/lib/eventThemes";
import type { CustomTheme } from "@/lib/customThemeStorage";
import Animated, { FadeInDown, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { AnimatedGradientLayer } from "@/components/AnimatedGradientLayer";
import { CreateEditorHeader } from "@/components/create/CreateEditorHeader";
import { CreatePreviewHero } from "@/components/create/CreatePreviewHero";
import { CreateBottomDock, type DockMode } from "@/components/create/CreateBottomDock";
import { MotifOverlay } from "@/components/create/MotifOverlay";
import { CreateCoverRow } from "@/components/create/CreateCoverRow";
import { CreateFormFields } from "@/components/create/CreateFormFields";
import { CreateLocationSection } from "@/components/create/CreateLocationSection";
import { CreateDateTimeSection } from "@/components/create/CreateDateTimeSection";
import { CreateSheets } from "@/components/create/CreateSheets";
import { EffectTray } from "@/components/create/EffectTray";
import { ThemeTray } from "@/components/create/ThemeTray";
import { safeParseDate, normalizeLocationString } from "@/components/create/placeSearch";
import * as Haptics from "expo-haptics";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import { useHostingNudge } from "@/hooks/useHostingNudge";
import { useCoverMedia } from "@/hooks/useCoverMedia";
import { useBestTimePick } from "@/hooks/useBestTimePick";
import BottomNavigation from "@/components/BottomNavigation";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { safeToast } from "@/lib/safeToast";
import { Button } from "@/ui/Button";
import { logError, normalizeCreateEventError, type CreateEventErrorReceipt } from "@/lib/errors";
import { guardEmailVerification } from "@/lib/emailVerificationGate";
import { shouldShowNotificationPrompt } from "@/lib/notificationPrompt";
import { useEntitlements, canCreateEvent, usePremiumStatusContract, useHostingQuota, usePremiumDriftGuard, type PaywallContext } from "@/lib/entitlements";
import { useSubscription } from "@/lib/SubscriptionContext";
import { markGuidanceComplete } from "@/lib/firstSessionGuidance";
import { useOnboardingGuide } from "@/hooks/useOnboardingGuide";
import { OnboardingGuideOverlay } from "@/components/OnboardingGuideOverlay";
import { getActiveEventCount } from "@/lib/softLimits";
import { type CreateEventRequest, type CreateEventResponse, type GetCirclesResponse, type GetProfilesResponse, type GetEventsResponse } from "@/shared/contracts";
import { getPendingIcsImport } from "@/lib/deepLinks";
import { eventKeys, invalidateEventKeys, getInvalidateAfterEventCreate } from "@/lib/eventQueryKeys";
import { postIdempotent } from "@/lib/idempotencyKey";

// DEV-only: last create-event error receipt for inspection
let __lastCreateEventReceipt: CreateEventErrorReceipt | null = null;

export default function CreateEventScreen() {
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const onboardingGuide = useOnboardingGuide();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const isSmartMode = params?.mode === "smart";

  const { date, template, emoji: templateEmoji, title: templateTitle, duration, circleId, visibility: visibilityParam, endDate: endDateParam } = useLocalSearchParams<{
    date?: string;
    template?: string;
    emoji?: string;
    title?: string;
    duration?: string;
    circleId?: string;
    visibility?: string;
    endDate?: string;
  }>();
  const { themeColor, isDark, colors } = useTheme();

  const isCircleEvent = !!circleId;

  // ── Queries ──
  const { data: profilesData } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api.get<GetProfilesResponse>("/api/profile"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 60000,
  });
  const activeProfile = profilesData?.activeProfile;

  // ── Extracted hooks ──
  const locationSearch = useLocationSearch();
  const coverMedia = useCoverMedia();

  // ── Form state ──
  const getInitialDate = (): Date => {
    const parsed = safeParseDate(date);
    if (parsed) return parsed;
    const now = new Date();
    const evening = new Date(now);
    evening.setHours(18, 0, 0, 0);
    if (evening.getTime() <= now.getTime()) evening.setDate(evening.getDate() + 1);
    return evening;
  };

  const [chromeHeight, setChromeHeight] = useState(0);
  const [title, setTitle] = useState(templateTitle ?? "");
  const [description, setDescription] = useState("");
  const emoji = templateEmoji ?? "📅";
  const [startDate, setStartDate] = useState(getInitialDate);
  const [endDate, setEndDate] = useState(() => {
    const start = getInitialDate();
    const ONE_HOUR = 60 * 60 * 1000;
    const parsedEnd = safeParseDate(endDateParam);
    if (parsedEnd && parsedEnd.getTime() > start.getTime()) return parsedEnd;
    if (duration) {
      const mins = parseInt(duration, 10);
      if (!isNaN(mins) && mins > 0) return new Date(start.getTime() + mins * 60 * 1000);
    }
    return new Date(start.getTime() + ONE_HOUR);
  });
  const [userModifiedEndTime, setUserModifiedEndTime] = useState(false);
  const [visibility, setVisibility] = useState<"all_friends" | "specific_groups" | "circle_only">(() => {
    if (visibilityParam === "open_invite") return "all_friends";
    if (visibilityParam === "circle_only") return "circle_only";
    return isCircleEvent ? "circle_only" : "all_friends";
  });
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [frequency, setFrequency] = useState<"once" | "weekly" | "monthly">("once");
  const [showFrequencyPicker, setShowFrequencyPicker] = useState(false);
  const [sendNotification, setSendNotification] = useState(true);

  // Capacity state
  const [hasCapacity, setHasCapacity] = useState(false);
  const [capacityInput, setCapacityInput] = useState("");

  // Pitch In V1 state
  const [pitchInEnabled, setPitchInEnabled] = useState(false);
  const [pitchInAmount, setPitchInAmount] = useState("");
  const [pitchInMethod, setPitchInMethod] = useState<"venmo" | "cashapp" | "paypal" | "other">("venmo");
  const [pitchInHandle, setPitchInHandle] = useState("");
  const [pitchInNote, setPitchInNote] = useState("");

  // What to Bring V2 state
  const [bringListEnabled, setBringListEnabled] = useState(false);
  const [bringListItems, setBringListItems] = useState<string[]>([]);
  const [bringListInput, setBringListInput] = useState("");

  // Event Themes V1 state
  const [selectedThemeId, setSelectedThemeId] = useState<ThemeId | null>(null);

  const [selectedCustomTheme, setSelectedCustomTheme] = useState<CustomTheme | null>(null);

  // Live theme preview
  const previewTheme = resolveEventTheme(selectedThemeId);
  const hasTheme = !!selectedThemeId || !!selectedCustomTheme;
  const previewBg = selectedThemeId
    ? (isDark ? previewTheme.backBgDark : previewTheme.backBgLight)
    : selectedCustomTheme
      ? "#0A0A18"
      : colors.background;
  const previewBgStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(previewBg, { duration: 350 }),
  }), [previewBg]);

  // Active gradient config for the page-level visual background
  const activeGradient = selectedThemeId
    ? previewTheme.visualStack?.gradient ?? null
    : selectedCustomTheme?.visualStack?.gradient ?? null;

  // Glass treatment for form fields when theme is active
  const themed = hasTheme;
  const glassSurface = themed
    ? (isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.70)")
    : colors.surface;
  const glassBorder = themed
    ? (isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.10)")
    : colors.border;
  const glassText = themed
    ? (isDark ? "#FFFFFF" : "rgba(0,0,0,0.85)")
    : colors.text;
  const glassSecondary = themed
    ? (isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.50)")
    : colors.textSecondary;
  const glassTertiary = themed
    ? (isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.36)")
    : colors.textTertiary;

  // Effect overlay state (independent of theme)
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [customEffectConfig, setCustomEffectConfig] = useState<import("@/components/create/MotifOverlay").ParticleMotifConfig | null>(null);

  // Bottom dock sheet state
  const [activeDockMode, setActiveDockMode] = useState<DockMode | null>(null);

  // Paywall and notification modal state
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [paywallContext, setPaywallContext] = useState<PaywallContext>("RECURRING_EVENTS");
  type CreatePromptChoice = "share_event" | "post_value_invite" | "notification" | "none";
  const [createPromptChoice, setCreatePromptChoice] = useState<CreatePromptChoice>("none");
  const [createdEvent, setCreatedEvent] = useState<{ id: string; title: string; emoji: string; startTime: string; endTime?: string | null; location?: string | null; description?: string | null } | null>(null);

  // ── Entitlements ──
  const { data: entitlements, refetch: refetchEntitlements } = useEntitlements();
  const premiumStatus = usePremiumStatusContract();
  const { isPro: userIsPro, isLoading: entitlementsLoading } = premiumStatus;
  const { isPremium, openPaywall } = useSubscription();
  const hostingQuota = useHostingQuota();

  // [P0_PREMIUM_DRIFT_GUARD]
  usePremiumDriftGuard(premiumStatus, hostingQuota);

  const [entitlementsTimedOut, setEntitlementsTimedOut] = useState(false);
  useEffect(() => {
    if (!entitlementsLoading && !hostingQuota.isLoading) { setEntitlementsTimedOut(false); return; }
    const timer = setTimeout(() => {
      if (entitlementsLoading || hostingQuota.isLoading) setEntitlementsTimedOut(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, [entitlementsLoading, hostingQuota.isLoading]);

  // ── Hosting nudge (extracted hook) ──
  const { showNudgeBanner, handleNudgeDismiss } = useHostingNudge({
    userId: session?.user?.id,
    userIsPro,
    entitlementsLoading,
    premiumIsFetching: premiumStatus.isFetching,
    hostingQuota,
  });

  const handleNudgeUpgrade = useCallback(() => {
    setPaywallContext("RECURRING_EVENTS");
    setShowPaywallModal(true);
  }, []);

  // [P0_FIND_BEST_TIME_SSOT] Return-flow: pick up time selected in /whos-free
  useBestTimePick(setStartDate, setEndDate);

  // Check for pending ICS import on mount
  useEffect(() => {
    const loadPendingImport = async () => {
      const pendingImport = await getPendingIcsImport();
      if (pendingImport) {
        devLog('[Create Event] Loading ICS import:', pendingImport.title);
        setTitle(pendingImport.title);
        setStartDate(pendingImport.startTime);
        if (pendingImport.endTime) {
          setEndDate(pendingImport.endTime);
          setUserModifiedEndTime(true);
        }
        if (pendingImport.location) {
          locationSearch.setLocation(pendingImport.location);
        }
        if (pendingImport.notes) {
          setDescription(pendingImport.notes);
        }
        safeToast.success('Event imported from calendar', 'Review and create your event');
      }
    };
    loadPendingImport();
  }, []);

  // Auto-update endDate when startDate changes (if user hasn't manually set it)
  useEffect(() => {
    if (!userModifiedEndTime) {
      const newEndDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      setEndDate(newEndDate);
    }
  }, [startDate, userModifiedEndTime]);

  // ── Queries ──
  const { data: circlesData } = useQuery({
    queryKey: circleKeys.all(),
    queryFn: () => api.get<GetCirclesResponse>("/api/circles"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });
  const circles = circlesData?.circles ?? [];

  const { data: myEventsData } = useQuery({
    queryKey: eventKeys.mine(),
    queryFn: () => api.get<GetEventsResponse>("/api/events/mine"),
    enabled: isAuthedForNetwork(bootStatus, session) && !isPremium,
  });
  const myEvents = myEventsData?.events ?? [];
  const activeEventCount = getActiveEventCount(myEvents);

  // ── Mutation ──
  const createMutation = useMutation({
    mutationFn: (data: CreateEventRequest) =>
      postIdempotent<CreateEventResponse>("/api/events", data),
    onSuccess: async (response) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      trackEventCreated();
      trackEventCreatedAnalytics({
        visibility: visibility ?? "unknown",
        hasLocation: locationSearch.location ? 1 : 0,
        hasPhoto: coverMedia.bannerUpload ? 1 : 0,
        isOpenInvite: visibility === "all_friends" ? 1 : 0,
      });
      trackValueEventCreated({
        eventId: response?.event?.id ?? "unknown",
        isOpenInvite: visibility === "all_friends",
        source: circleId ? "circle" : "create",
        hasLocation: !!locationSearch.location,
        hasCoverImage: !!coverMedia.bannerUpload,
        hasGuests: 0,
        ts: new Date().toISOString(),
      });
      markGuidanceComplete("create_invite");
      if (onboardingGuide.shouldShowStep("create_event")) {
        onboardingGuide.completeStep("create_event");
      }
      invalidateEventKeys(queryClient, getInvalidateAfterEventCreate(), "event_create");
      queryClient.invalidateQueries({ queryKey: qk.entitlements() });
      queryClient.invalidateQueries({ queryKey: circleKeys.all() });
      if (circleId) {
        queryClient.invalidateQueries({ queryKey: circleKeys.single(circleId) });
      }

      const evt = response?.event;
      if (evt?.id) {
        setCreatedEvent({
          id: evt.id,
          title: evt.title ?? title,
          emoji: evt.emoji ?? emoji,
          startTime: evt.startTime ?? startDate.toISOString(),
          endTime: evt.endTime ?? endDate?.toISOString() ?? null,
          location: evt.location ?? locationSearch.location ?? null,
          description: evt.description ?? description ?? null,
        });
      }

      let notifEligible = false;
      try {
        notifEligible = await shouldShowNotificationPrompt(session?.user?.id) ?? false;
      } catch {
        notifEligible = false;
      }

      if (evt?.id) {
        router.replace(`/event/${evt.id}` as any);
      } else if (notifEligible) {
        setCreatePromptChoice("notification");
      } else {
        router.back();
      }
    },
    onError: (error: any) => {
      const receipt = normalizeCreateEventError(error, circleId ?? null);
      if (__DEV__) __lastCreateEventReceipt = receipt;
      logError("Create Event", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      safeToast.error(receipt.message, receipt.hint, error);
    },
  });

  // ── Handlers ──
  const handleFrequencyChange = (newFrequency: "once" | "weekly" | "monthly") => {
    if (newFrequency !== "once") {
      const check = canCreateEvent(entitlements, true);
      if (!check.allowed && check.context) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setPaywallContext(check.context);
        setShowPaywallModal(true);
        setFrequency("once");
        return;
      }
    }
    setFrequency(newFrequency);
    setShowFrequencyPicker(false);
  };

  const handleDockMode = useCallback((mode: DockMode) => {
    setActiveDockMode((prev) => (prev === mode ? null : mode));
  }, []);

  const handleThemeSelect = useCallback((id: ThemeId | null) => {
    setSelectedThemeId(id);
    setSelectedCustomTheme(null);
  }, []);

  const handleCustomThemeSelect = useCallback((ct: CustomTheme | null) => {
    setSelectedCustomTheme(ct);
    if (ct) setSelectedThemeId(null);
  }, []);


  const handleEffectSelect = useCallback((effectKey: string | null) => {
    setSelectedEffectId(effectKey);
    // Clear custom config when switching to a preset
    if (effectKey !== "__custom__") setCustomEffectConfig(null);
  }, []);

  const handleCustomEffectConfig = useCallback((config: import("@/components/create/MotifOverlay").ParticleMotifConfig | null) => {
    setCustomEffectConfig(config);
    setSelectedEffectId(config ? "__custom__" : null);
  }, []);

  const handleCreate = () => {
    if (createMutation.isPending) return;
    if (!guardEmailVerification(session)) return;
    if (coverMedia.uploadingBanner) {
      safeToast.warning("Please Wait", "Cover photo is still uploading.");
      return;
    }
    if (!title.trim()) {
      safeToast.warning("Missing Title", "Please enter a title for your event.");
      return;
    }
    if (endDate <= startDate) {
      safeToast.warning("Invalid Time", "End time must be after start time.");
      return;
    }
    if (visibility === "specific_groups" && selectedGroupIds.length === 0) {
      safeToast.warning("No Groups Selected", "Please select at least one group.");
      return;
    }

    const isRecurring = frequency !== "once";
    const anyLoading =
      entitlementsLoading || premiumStatus.isFetching ||
      hostingQuota.isLoading || hostingQuota.isFetching ||
      !!hostingQuota.error;

    if (!anyLoading) {
      const check = canCreateEvent(entitlements, isRecurring);
      if (!check.allowed && check.context) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setPaywallContext(check.context);
        setShowPaywallModal(true);
        return;
      }
    }

    const _normalizedLocation = normalizeLocationString(locationSearch.location) ?? (locationSearch.location.trim() || undefined);

    const createPayload = {
      title: title.trim(),
      description: description.trim() || undefined,
      location: _normalizedLocation,
      emoji,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      visibility,
      groupIds: visibility === "specific_groups" ? selectedGroupIds : undefined,
      circleId: isCircleEvent ? circleId : undefined,
      isPrivateCircleEvent: isCircleEvent ? true : undefined,
      isRecurring,
      recurrence: isRecurring ? frequency : undefined,
      sendNotification,
      capacity: hasCapacity && capacityInput ? parseInt(capacityInput, 10) : null,
      reflectionEnabled: false,
      ...(pitchInEnabled && pitchInHandle.trim() ? {
        pitchInEnabled: true,
        pitchInTone: pitchInAmount.trim() ? "suggested" as const : "optional" as const,
        pitchInAmount: pitchInAmount.trim() || undefined,
        pitchInMethod,
        pitchInHandle: pitchInHandle.trim(),
        pitchInNote: pitchInNote.trim() || undefined,
      } : {}),
      ...(bringListEnabled && bringListItems.length > 0 ? {
        bringListEnabled: true,
        bringListItems: bringListItems.map((label, i) => ({
          id: `item_${i}_${Date.now()}`,
          label,
        })),
      } : {}),
      ...(coverMedia.bannerUpload ? {
        eventPhotoUrl: coverMedia.bannerUpload.url,
        eventPhotoPublicId: coverMedia.bannerUpload.publicId,
      } : {}),
      ...(selectedThemeId
        ? { themeId: selectedThemeId }
        : selectedCustomTheme
          ? { themeId: "custom" as any, customThemeData: { visualStack: selectedCustomTheme.visualStack, name: selectedCustomTheme.name } }
          : {}),
      // Event Effects V1 — persist independently of theme
      ...(selectedEffectId
        ? {
            effectId: selectedEffectId,
            ...(selectedEffectId === "__custom__" && customEffectConfig
              ? { customEffectConfig }
              : {}),
          }
        : {}),
    };
    createMutation.mutate(createPayload);
  };

  const toggleGroup = (groupId: string) => {
    Haptics.selectionAsync();
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  };

  // ── Session guard (all hooks above) ──
  if (!session) {
    if (bootStatus !== 'loggedOut') return null;
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
        <View className="flex-1 items-center justify-center px-8">
          <Text style={{ color: glassText }} className="text-xl font-semibold mb-2">
            Sign in to create events
          </Text>
          <Button
            variant="primary"
            label="Sign In"
            onPress={() => router.replace("/login")}
            style={{ marginTop: 16 }}
          />
        </View>
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  const computedPaddingBottom = 100 + insets.bottom;

  // ── Render ──
  return (
    <Animated.View testID="create-screen" className="flex-1" style={[{ flex: 1 }, previewBgStyle]}>
      {/* ── Page-level themed gradient background ── */}
      {activeGradient && activeGradient.colors.length >= 2 && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <AnimatedGradientLayer config={activeGradient} />
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingTop: chromeHeight, paddingBottom: computedPaddingBottom }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <CreatePreviewHero
            title={title}
            selectedThemeId={selectedThemeId}
            previewTheme={previewTheme}
            selectedCustomTheme={selectedCustomTheme}
            glassText={glassText}
            glassSecondary={glassSecondary}
            themed={themed}
            coverImageUrl={coverMedia.selectedCoverItem?.url ?? coverMedia.bannerLocalUri}
          />

          {isSmartMode && (
            <View
              style={{
                backgroundColor: "#ECFDF5",
                borderRadius: 12,
                padding: 12,
                marginBottom: 16,
                marginHorizontal: 16,
                borderWidth: 1,
                borderColor: "#A7F3D0",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#065F46", marginBottom: 4 }}>
                Best time selected
              </Text>
              <Text style={{ fontSize: 12, color: "#065F46" }}>
                Everyone is available at this time. You can adjust it before sending.
              </Text>
            </View>
          )}

          <View className="px-4">
            <Animated.View entering={FadeInDown.delay(0).springify()}>
              <CreateCoverRow
                hasCover={!!coverMedia.bannerLocalUri}
                glassSurface={glassSurface}
                glassBorder={glassBorder}
                glassSecondary={glassSecondary}
                glassTertiary={glassTertiary}
                onChangeCover={() => coverMedia.setShowCoverPicker(true)}
                onRemoveCover={coverMedia.handleRemoveBanner}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(25).springify()}>
              <CreateFormFields
                title={title}
                description={description}
                onTitleChange={setTitle}
                onDescriptionChange={setDescription}
                glassSurface={glassSurface}
                glassBorder={glassBorder}
                glassText={glassText}
                glassTertiary={glassTertiary}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(75).springify()}>
              <CreateLocationSection
                selectedPlace={locationSearch.selectedPlace}
                showLocationSearch={locationSearch.showLocationSearch}
                locationQuery={locationSearch.locationQuery}
                location={locationSearch.location}
                placeSuggestions={locationSearch.placeSuggestions}
                isSearchingPlaces={locationSearch.isSearchingPlaces}
                isDark={isDark}
                themed={themed}
                glassSurface={glassSurface}
                glassBorder={glassBorder}
                glassText={glassText}
                glassSecondary={glassSecondary}
                glassTertiary={glassTertiary}
                onSelectPlace={locationSearch.handleSelectPlace}
                onLocationInputChange={locationSearch.handleLocationInputChange}
                onLocationFocus={locationSearch.handleLocationFocus}
                onClearPlace={locationSearch.handleClearPlace}
                onCloseSearch={locationSearch.handleCloseSearch}
                onOpenSearch={locationSearch.handleOpenSearch}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(100).springify()}>
              <Text style={{ color: glassTertiary, fontSize: 11, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase" }} className="mb-1.5 ml-1">When</Text>
              <CreateDateTimeSection
                startDate={startDate}
                endDate={endDate}
                isSmartMode={isSmartMode}
                isDark={isDark}
                themeColor={themeColor}
                glassSurface={glassSurface}
                glassBorder={glassBorder}
                glassSecondary={glassSecondary}
                onStartDateChange={setStartDate}
                onEndDateChange={(d) => { setEndDate(d); setUserModifiedEndTime(true); }}
                onFindBestTime={() => {
                  Haptics.selectionAsync();
                  if (__DEV__) devLog('[P0_FIND_BEST_TIME_SSOT] open', { source: 'create' });
                  router.push('/whos-free?source=create' as any);
                }}
              />
            </Animated.View>

            {/* Create Button */}
            <Animated.View entering={FadeInDown.delay(150).springify()}>
              <Button
                testID="create-submit-event"
                variant="primary"
                label={createMutation.isPending ? "Creating..." : "Create Invite"}
                onPress={handleCreate}
                disabled={createMutation.isPending}
                loading={createMutation.isPending}
                style={{
                  borderRadius: 12,
                  paddingVertical: 14,
                  marginTop: 16,
                  shadowColor: themeColor,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: isDark ? 0.5 : 0.3,
                  shadowRadius: 8,
                }}
              />
            </Animated.View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Floating BlurView header chrome ── */}
      <CreateEditorHeader
        onCancel={() => router.back()}
        onSave={handleCreate}
        isPending={createMutation.isPending}
        themed={themed}
        glassText={glassText}
        glassSecondary={glassSecondary}
        themeColor={themeColor}
        onLayout={(h) => { if (h > 0 && h !== chromeHeight) setChromeHeight(h); }}
      />

      {/* ── Page-wide motif overlay ── */}
      {selectedEffectId && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <MotifOverlay presetId={selectedEffectId} customConfig={customEffectConfig} intensity={0.70} />
        </View>
      )}

      {/* ── Bottom Editing Dock ── */}
      <CreateBottomDock
        activeMode={activeDockMode}
        onModeChange={handleDockMode}
        themed={themed}
        isDark={isDark}
        glassText={glassText}
        glassTertiary={glassTertiary}
        themeColor={themeColor}
      />

      {/* ── Effect Tray (inline, not Modal) ── */}
      <EffectTray
        visible={activeDockMode === "effect"}
        selectedEffectId={selectedEffectId}
        themeColor={themeColor}
        isDark={isDark}
        glassText={glassText}
        glassSecondary={glassSecondary}
        glassTertiary={glassTertiary}
        onSelectEffect={handleEffectSelect}
        onCustomEffect={handleCustomEffectConfig}
        onClose={() => setActiveDockMode(null)}
      />

      {/* ── Theme Tray (inline, not Modal) ── */}
      <ThemeTray
        visible={activeDockMode === "theme"}
        selectedThemeId={selectedThemeId}
        selectedCustomTheme={selectedCustomTheme}
        userIsPro={userIsPro}
        isDark={isDark}
        themeColor={themeColor}
        glassText={glassText}
        glassSecondary={glassSecondary}
        glassTertiary={glassTertiary}
        onSelectTheme={handleThemeSelect}
        onSelectCustomTheme={handleCustomThemeSelect}
        onOpenPaywall={(source) => { setPaywallContext("PREMIUM_THEME"); setShowPaywallModal(true); }}
        onClose={() => setActiveDockMode(null)}
      />

      <CreateSheets
        activeDockMode={activeDockMode}
        onCloseDock={() => setActiveDockMode(null)}
        settingsProps={{
          isCircleEvent,
          frequency,
          showFrequencyPicker,
          onToggleFrequencyPicker: () => setShowFrequencyPicker((p) => !p),
          onFrequencyChange: handleFrequencyChange,
          startDate,
          visibility,
          onSetVisibility: setVisibility,
          selectedGroupIds,
          onToggleGroup: toggleGroup,
          circles,
          sendNotification,
          onSetSendNotification: setSendNotification,
          hasCapacity,
          onSetHasCapacity: setHasCapacity,
          capacityInput,
          onSetCapacityInput: setCapacityInput,
          pitchInEnabled,
          onSetPitchInEnabled: setPitchInEnabled,
          pitchInAmount,
          onSetPitchInAmount: setPitchInAmount,
          pitchInMethod,
          onSetPitchInMethod: setPitchInMethod,
          pitchInHandle,
          onSetPitchInHandle: setPitchInHandle,
          pitchInNote,
          onSetPitchInNote: setPitchInNote,
          bringListEnabled,
          onSetBringListEnabled: setBringListEnabled,
          bringListItems,
          onSetBringListItems: setBringListItems,
          bringListInput,
          onSetBringListInput: setBringListInput,
          showNudgeBanner,
          onNudgeUpgrade: handleNudgeUpgrade,
          onNudgeDismiss: handleNudgeDismiss,
          entitlementsTimedOut,
          entitlementsLoading,
          hostingQuotaLoading: hostingQuota.isLoading,
          onRetryEntitlements: () => { setEntitlementsTimedOut(false); refetchEntitlements(); hostingQuota.refetch(); },
          themed,
          isDark,
          themeColor,
          glassText,
          glassSecondary,
          glassTertiary,
          glassSurface,
          glassBorder,
          colors,
        }}
        showCoverPicker={coverMedia.showCoverPicker}
        onCloseCoverPicker={() => coverMedia.setShowCoverPicker(false)}
        onSelectCover={coverMedia.handleCoverSelect}
        onPickLocalImage={coverMedia.handlePickBanner}
        selectedCoverId={coverMedia.selectedCoverItem?.id}
        userUploads={coverMedia.coverUploads}
        showPaywallModal={showPaywallModal}
        paywallContext={paywallContext}
        onClosePaywall={() => setShowPaywallModal(false)}
        showNotificationPrompt={createPromptChoice === "notification"}
        onCloseNotificationPrompt={() => { setCreatePromptChoice("none"); router.back(); }}
        notificationUserId={session?.user?.id}
        showShareModal={createPromptChoice === "share_event"}
        createdEvent={createdEvent}
        onCloseShareModal={() => { setCreatePromptChoice("none"); router.back(); }}
        shareModalBg={colors.background}
        shareModalBorder={colors.border}
        glassText={glassText}
        glassSecondary={glassSecondary}
        themeColor={themeColor}
      />

      {/* Onboarding Guide Overlay */}
      {onboardingGuide.shouldShowStep("create_event") && (
        <OnboardingGuideOverlay
          step="create_event"
          onDismiss={() => onboardingGuide.dismissGuide()}
          onSkipAll={() => onboardingGuide.dismissGuide()}
          themeColor={themeColor}
          isDark={isDark}
          colors={colors}
          position="bottom"
        />
      )}
    </Animated.View>
  );
}
