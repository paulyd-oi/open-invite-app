/**
 * DailyIdeasDeck — SSOT component for the swipeable Ideas deck.
 *
 * Extracted from src/app/suggestions.tsx so it can be reused in both
 * the /suggestions route and the Discover "Ideas" tab.
 *
 * Source of truth: src/lib/ideasEngine.ts
 */
import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  Dimensions,
} from "react-native";
import { devLog } from "@/lib/devLog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Users,
  Check,
  X,
  Sparkles,
  Zap,
  Gift,
  Repeat,
  RefreshCw,
} from "@/ui/icons";
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { MotionDurations } from "@/lib/motionSSOT";
import { toCloudinaryTransformedUrl, CLOUDINARY_PRESETS } from "@/lib/mediaTransformSSOT";
import { buildDailySeed, confidenceToLabel } from "@/lib/ideaScoring";
import { type ScoreBreakdown } from "@/lib/ideaScoring";
import {
  getCompletionCopy,
  getAcceptFeedback,
  getDismissFeedback,
  shouldShowAcceptFeedback,
  formatCountdownLabel,
} from "@/lib/smartMicrocopy";
import {
  generateIdeas,
  getTodayKey,
  type IdeaCard,
  type IdeasContext,
  type ExposureMap,
  type AcceptStats,
  type PatternMemory,
  type SessionSignals,
  updateExposureMap,
  recordSwipeAction,
  maybeResetStats,
  recordPattern,
  prunePatternMemory,
  recordSessionSignal,
  emptySessionSignals,
} from "@/lib/ideasEngine";
import { eventKeys } from "@/lib/eventQueryKeys";
import { circleKeys } from "@/lib/circleQueryKeys";
import type { GetCirclesResponse, GetEventsResponse, GetFriendBirthdaysResponse } from "@/shared/contracts";

import { useSession } from "@/lib/useSession";
import { EntityAvatar } from "@/components/EntityAvatar";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import BottomSheet from "@/components/BottomSheet";

// ─── Storage keys ───────────────────────────────────────────────
function getDeckStorageKey(): string {
  return `ideasDeck_${getTodayKey().replace(/-/g, "_")}`;
}
const EXPOSURE_MAP_KEY = "ideasExposureMap";
const ACCEPT_STATS_KEY = "ideasAcceptStats";
const STATS_RESET_MONTH_KEY = "ideasStatsResetMonth";
const PATTERN_MEMORY_KEY = "ideasPatternMemory";
function getSessionSignalsKey(dayKey?: string): string {
  return `ideasSessionSignals_${(dayKey ?? getTodayKey()).replace(/-/g, "_")}`;
}

/** YYYY_MM_DD for today (local). */
function getDayKeyLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, "0")}_${String(d.getDate()).padStart(2, "0")}`;
}

/** AsyncStorage key for persisted completion timestamp. */
function getCompleteKey(dayKey: string): string {
  return `ideasComplete_${dayKey}`;
}

/** Ms until next local midnight (start of tomorrow). */
function msUntilNextMidnight(): number {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return tomorrow.getTime() - now.getTime();
}

const DECK_SCREEN_W = Dimensions.get("window").width;
const DECK_SWIPE_THRESHOLD = Math.round(DECK_SCREEN_W * 0.33);

// ─── Anti-repeat: prevent consecutive cards of the same category ──
/**
 * Greedy bucket reorder: picks from the largest non-last-used category bucket
 * each round to maximise spacing between same-category cards.
 *
 * Pure function — no side-effects. If perfect interleave is impossible (e.g.
 * one category dominates), the tail will cluster but earlier positions stay
 * spread. O(n·k) where k = number of distinct categories (≤ 5).
 */
function antiRepeatByCategory<T>(items: T[], getCategory: (item: T) => string): T[] {
  if (items.length <= 1) return items;

  // Build category buckets preserving original relative order
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const cat = getCategory(item);
    const arr = buckets.get(cat);
    if (arr) arr.push(item);
    else buckets.set(cat, [item]);
  }

  const result: T[] = [];
  let lastCat: string | null = null;

  while (result.length < items.length) {
    // Find the largest bucket whose category differs from lastCat
    let bestCat: string | null = null;
    let bestLen = -1;
    for (const [cat, arr] of buckets) {
      if (arr.length === 0) continue;
      if (cat !== lastCat && arr.length > bestLen) {
        bestCat = cat;
        bestLen = arr.length;
      }
    }

    // Fallback: if only lastCat remains, pick it (consecutive is unavoidable)
    if (bestCat == null) {
      for (const [cat, arr] of buckets) {
        if (arr.length > 0) { bestCat = cat; break; }
      }
    }
    if (bestCat == null) break; // shouldn't happen

    const bucket = buckets.get(bestCat)!;
    result.push(bucket.shift()!);
    lastCat = bestCat;
  }

  return result;
}

interface DeckReconnectSuggestion {
  friend: { id: string; name: string | null; image: string | null };
  friendshipId: string;
  groups: Array<{ id: string; name: string; color: string }>;
  hangoutCount: number;
  lastHangout: string | null;
  daysSinceHangout: number;
}

const CATEGORY_ACCENT: Record<string, string> = {
  reconnect: "#EC4899",
  low_rsvp: "#3B82F6",
  birthday: "#F59E0B",
  activity_repeat: "#8B5CF6",
  timing: "#10B981",
};

const CATEGORY_PILL: Record<string, { label: string; Icon: typeof Users }> = {
  reconnect: { label: "Reconnect", Icon: RefreshCw },
  low_rsvp: { label: "Join", Icon: Zap },
  birthday: { label: "Birthday", Icon: Gift },
  activity_repeat: { label: "Repeat", Icon: Repeat },
  timing: { label: "Idea", Icon: Sparkles },
};

const HERO_H = 100;

// ─── DeckCardFace ───────────────────────────────────────────────
function DeckCardFace({ card, index, total, onWhyPress }: { card: IdeaCard; index?: number; total?: number; onWhyPress?: () => void }) {
  const { themeColor, colors, isDark } = useTheme();
  const accent = CATEGORY_ACCENT[card.category] ?? themeColor;
  const pill = CATEGORY_PILL[card.category] ?? CATEGORY_PILL.timing;
  const PillIcon = pill.Icon;

  const hasEventPhoto = !!card.eventPhotoUrl;
  const hasAvatar = !!card.friendAvatarUrl;

  if (__DEV__) {
    devLog(`[P1_IDEAS_CARD] render: ${card.id} media=${hasEventPhoto ? "eventPhoto" : hasAvatar ? "avatar" : "gradient"}`);
  }

  return (
    <View
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
      }}
    >
      {/* Header row: pill + progress */}
      <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
        <View
          className="flex-row items-center px-2.5 py-1 rounded-full"
          style={{ backgroundColor: accent + "18" }}
        >
          <PillIcon size={12} color={accent} />
          <Text className="text-[11px] font-semibold ml-1" style={{ color: accent }}>
            {pill.label}
          </Text>
        </View>
        {index != null && total != null && (
          <View className="flex-row items-center" style={{ gap: 8 }}>
            {__DEV__ && onWhyPress && (
              <Pressable onPress={onWhyPress} hitSlop={8}>
                <Text className="text-[10px]" style={{ color: colors.textTertiary }}>Why?</Text>
              </Pressable>
            )}
            <Text className="text-[11px]" style={{ color: colors.textTertiary }}>
              {index + 1} of {total}
            </Text>
          </View>
        )}
      </View>

      {/* Hero / banner area */}
      <View style={{ height: HERO_H, position: "relative" }}>
        {hasEventPhoto ? (
          // INVARIANT_HERO_USES_TRANSFORM_SSOT — suggestion hero decoded via CLOUDINARY_PRESETS.HERO_BANNER
          <Image
            source={{ uri: toCloudinaryTransformedUrl(card.eventPhotoUrl!, CLOUDINARY_PRESETS.HERO_BANNER) }}
            style={{ width: "100%", height: HERO_H }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              width: "100%",
              height: HERO_H,
              backgroundColor: accent + "12",
            }}
          >
            {/* Subtle gradient feel via layered opacity */}
            <View
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: HERO_H * 0.5,
                backgroundColor: isDark ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.4)",
              }}
            />
          </View>
        )}

        {/* Avatar overlay at bottom-left of hero */}
        {(hasAvatar || card.friendId) && (
          <View
            style={{
              position: "absolute",
              bottom: -18,
              left: 16,
              borderRadius: 22,
              borderWidth: 2.5,
              borderColor: colors.surface,
            }}
          >
            <EntityAvatar
              photoUrl={card.friendAvatarUrl ?? undefined}
              initials={card.title.replace(/^(Catch up with |Join |Do )/, "").charAt(0).toUpperCase()}
              size={40}
              backgroundColor={card.friendAvatarUrl ? "transparent" : accent + "20"}
              foregroundColor={accent}
            />
          </View>
        )}
      </View>

      {/* Main content */}
      <View className="px-4 pt-6 pb-4">
        <Text
          className="text-[16px] font-semibold leading-5"
          style={{ color: colors.text }}
          numberOfLines={2}
        >
          {card.title}
        </Text>
        <Text
          className="text-[13px] mt-1"
          style={{ color: colors.textSecondary }}
          numberOfLines={1}
        >
          {card.subtitle}
        </Text>

        {/* Context chips — fully collapsed (incl. margin) when empty */}
        {(() => {
          const chips = card.contextChips?.filter(Boolean) ?? [];
          if (chips.length === 0) return null;
          return (
            <View className="flex-row mt-2.5" style={{ gap: 6 }}>
              {/* INVARIANT_ALLOW_SMALL_MAP */}
              {chips.slice(0, 2).map((chip, i) => (
                <View
                  key={i}
                  className="px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)" }}
                >
                  <Text className="text-[11px]" style={{ color: colors.textSecondary }}>
                    {chip}
                  </Text>
                </View>
              ))}
            </View>
          );
        })()}
      </View>
    </View>
  );
}

const CARD_H = HERO_H + 150; // hero + content area

// ─── DeckSwipeCard ──────────────────────────────────────────────
function DeckSwipeCard({
  card,
  nextCard,
  thirdCard,
  index,
  total,
  onAccept,
  onDismiss,
  onWhyPress,
}: {
  card: IdeaCard;
  nextCard?: IdeaCard;
  thirdCard?: IdeaCard;
  index: number;
  total: number;
  onAccept: () => void;
  onDismiss: () => void;
  onWhyPress?: () => void;
}) {
  const { themeColor, colors, isDark } = useTheme();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isActive = useSharedValue(0);
  const lastHapticAtRef = useRef(0);

  const delayedAccept = useCallback(() => {
    setTimeout(onAccept, 120);
  }, [onAccept]);

  const delayedDismiss = useCallback(() => {
    setTimeout(onDismiss, 120);
  }, [onDismiss]);

  /** Haptic on threshold crossing — 250 ms debounce prevents buzzing. */
  const fireThresholdHaptic = useCallback(() => {
    const now = Date.now();
    if (now - lastHapticAtRef.current > 250) {
      lastHapticAtRef.current = now;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onBegin(() => {
      isActive.value = withTiming(1, { duration: MotionDurations.fast });
    })
    .onFinalize(() => {
      isActive.value = withTiming(0, { duration: MotionDurations.fast });
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.12;
      // Haptic on threshold crossing (250 ms debounce)
      if (Math.abs(e.translationX) >= DECK_SWIPE_THRESHOLD) {
        runOnJS(fireThresholdHaptic)();
      }
    })
    .onEnd((e) => {
      if (e.translationX > DECK_SWIPE_THRESHOLD) {
        translateX.value = withTiming(DECK_SCREEN_W, { duration: MotionDurations.normal });
        runOnJS(delayedAccept)();
      } else if (e.translationX < -DECK_SWIPE_THRESHOLD) {
        translateX.value = withTiming(-DECK_SCREEN_W, { duration: MotionDurations.normal });
        runOnJS(delayedDismiss)();
      } else {
        // Snap back: bouncier spring
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${translateX.value / 32}deg` },
      { scale: 1 + isActive.value * 0.02 },
    ],
  }));

  // Next card (peek #1): scale 0.96→1.0, translateY 6→0
  const peekStyle = useAnimatedStyle(() => {
    const abs = Math.abs(translateX.value);
    const t = Math.min(abs / DECK_SWIPE_THRESHOLD, 1);
    return {
      transform: [
        { scale: 0.96 + 0.04 * t },
        { translateY: 6 * (1 - t) },
      ],
      opacity: 0.65 + 0.35 * t,
    };
  });

  // Third card (peek #2): scale 0.92→0.96, translateY 12→6
  const thirdStyle = useAnimatedStyle(() => {
    const abs = Math.abs(translateX.value);
    const t = Math.min(abs / DECK_SWIPE_THRESHOLD, 1);
    return {
      transform: [
        { scale: 0.92 + 0.04 * t },
        { translateY: 12 - 6 * t },
      ],
      opacity: 0.4 + 0.25 * t,
    };
  });

  const cardW = DECK_SCREEN_W - 32;

  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} className="items-center px-4">
      {/* Card stack — 3 layers for depth */}
      <View style={{ width: cardW, minHeight: CARD_H + 12 }}>
        {thirdCard && (
          <Animated.View
            style={[
              { position: "absolute", top: 0, left: 0, right: 0 },
              thirdStyle,
            ]}
          >
            <DeckCardFace card={thirdCard} />
          </Animated.View>
        )}
        {nextCard && (
          <Animated.View
            style={[
              { position: "absolute", top: 0, left: 0, right: 0 },
              peekStyle,
            ]}
          >
            <DeckCardFace card={nextCard} />
          </Animated.View>
        )}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              { position: "absolute", top: 0, left: 0, right: 0 },
              topStyle,
            ]}
          >
            <DeckCardFace card={card} index={index} total={total} onWhyPress={onWhyPress} />
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Action buttons */}
      <View className="flex-row mt-5" style={{ gap: 12 }}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            translateX.value = withTiming(-DECK_SCREEN_W, { duration: MotionDurations.normal });
            setTimeout(onDismiss, 150);
          }}
          className="flex-row items-center px-6 py-2.5 rounded-full"
          style={{ backgroundColor: isDark ? "#3F3F46" : "#F4F4F5" }}
        >
          <X size={15} color={colors.textSecondary} />
          <Text
            className="text-sm font-medium ml-1.5"
            style={{ color: colors.textSecondary }}
          >
            Pass
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            translateX.value = withTiming(DECK_SCREEN_W, { duration: MotionDurations.normal });
            setTimeout(onAccept, 150);
          }}
          className="flex-row items-center px-6 py-2.5 rounded-full"
          style={{ backgroundColor: themeColor }}
        >
          <Check size={15} color="#fff" />
          <Text className="text-sm font-semibold ml-1.5 text-white">
            {card.category === "low_rsvp" ? "View Event" : "Open Chat"}
          </Text>
        </Pressable>
      </View>

      {/* Swipe hint */}
      <Text className="text-[11px] mt-3" style={{ color: colors.textTertiary }}>
        Swipe left to pass • Swipe right to open
      </Text>
    </Animated.View>
  );
}

// ─── DailyIdeasDeck (main export) ───────────────────────────────

export interface DailyIdeasDeckProps {
  onSwitchToPeople?: () => void;
  peopleCount?: number;
  onProgressChange?: (info: {
    deckReady: boolean;
    deckLength: number;
    currentIndex: number;
    isComplete: boolean;
  }) => void;
}

export function DailyIdeasDeck({
  onSwitchToPeople,
  peopleCount = 0,
  onProgressChange,
}: DailyIdeasDeckProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, colors, isDark } = useTheme();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();

  const [deck, setDeck] = useState<IdeaCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [deckReady, setDeckReady] = useState(false);
  const [storageChecked, setStorageChecked] = useState(false);
  const generatedTodayRef = useRef(false);
  const exposureMapRef = useRef<ExposureMap>({});

  // Session-level swipe counters (for completion copy)
  const sessionAcceptedRef = useRef(0);
  const sessionDismissedRef = useRef(0);

  // DEV-only debugger state for "Why?" overlay
  const [debugCard, setDebugCard] = useState<IdeaCard | null>(null);

  // Transient microcopy feedback
  const [feedbackText, setFeedbackText] = useState<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showFeedback = useCallback((msg: string) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setFeedbackText(msg);
    feedbackTimerRef.current = setTimeout(() => setFeedbackText(null), 1200);
  }, []);

  // Completion card animation
  const completionOpacity = useSharedValue(0);
  const completionScale = useSharedValue(0.96);
  const completionStyle = useAnimatedStyle(() => ({
    opacity: completionOpacity.value,
    transform: [{ scale: completionScale.value }],
  }));

  // ── Completion persistence ──
  const [completedAt, setCompletedAt] = useState<number | null>(null);
  const prevCompleteRef = useRef(false);

  // Canonical completion flag: either swiped through OR restored from storage
  const isComplete = deckReady && (
    (deck.length > 0 && currentIndex >= deck.length) || completedAt != null
  );

  // Detect completion transition exactly once → persist + DEV log
  useEffect(() => {
    if (isComplete && !prevCompleteRef.current) {
      prevCompleteRef.current = true;
      if (completedAt == null) {
        const now = Date.now();
        setCompletedAt(now);
        const dayKey = getDayKeyLocal();
        AsyncStorage.setItem(getCompleteKey(dayKey), JSON.stringify({ completedAt: now })).catch(() => {});
        if (__DEV__) {
          const ms = msUntilNextMidnight();
          devLog("[P1_DECK_COUNTDOWN]", {
            dayKey,
            completedAt: now,
            msRemaining: ms,
            label: formatCountdownLabel(ms),
          });
        }
      }
    }
  }, [isComplete, completedAt]);

  // Completion countdown ("New ideas in Xh Ym")
  const [countdownLabel, setCountdownLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!isComplete) return;
    const tick = () => setCountdownLabel(formatCountdownLabel(msUntilNextMidnight()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [isComplete]);

  // Report progress to parent for tab indicator
  useEffect(() => {
    onProgressChange?.({ deckReady, deckLength: deck.length, currentIndex, isComplete });
  }, [deckReady, deck.length, currentIndex, isComplete, onProgressChange]);

  const acceptStatsRef = useRef<AcceptStats>({});
  const statsResetMonthRef = useRef<string | null>(null);
  const patternMemoryRef = useRef<PatternMemory>({});
  const sessionSignalsRef = useRef<SessionSignals>(emptySessionSignals());
  const yesterdaySignalsRef = useRef<SessionSignals | undefined>(undefined);

  const enabled = isAuthedForNetwork(bootStatus, session);

  // ── Data queries (re-use existing query keys) ──
  const { data: reconnectData, isFetched: reconnectFetched } = useQuery({
    queryKey: ["suggestions"],
    queryFn: () =>
      api.get<{ suggestions: DeckReconnectSuggestion[] }>(
        "/api/events/suggestions",
      ),
    enabled,
    staleTime: 60000,
  });

  const { data: birthdayData, isFetched: birthdayFetched } = useQuery({
    queryKey: ["birthdays"],
    queryFn: () => api.get<GetFriendBirthdaysResponse>("/api/birthdays"),
    enabled,
    staleTime: 60000,
  });

  const { data: feedEventsData, isFetched: feedFetched } = useQuery({
    queryKey: eventKeys.feed(),
    queryFn: () => api.get<GetEventsResponse>("/api/events/feed"),
    enabled,
    staleTime: 30000,
  });

  const { data: myEventsData, isFetched: myEventsFetched } = useQuery({
    queryKey: eventKeys.mine(),
    queryFn: () => api.get<GetEventsResponse>("/api/events/mine"),
    enabled,
    staleTime: 60000,
  });

  // Circles list (for accept → chat flow)
  const { data: circlesData } = useQuery({
    queryKey: circleKeys.all(),
    queryFn: () => api.get<GetCirclesResponse>("/api/circles"),
    enabled,
    staleTime: 60000,
  });

  // Circle creation mutation (for accept → chat when no 1:1 circle exists)
  const createCircleMutation = useMutation({
    mutationFn: (data: { name: string; emoji?: string; memberIds: string[] }) =>
      api.post<{ circle: { id: string } }>("/api/circles", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: circleKeys.all() });
    },
  });

  // ── ideasReady: all key queries have resolved ──
  const ideasReady = enabled && reconnectFetched && birthdayFetched && feedFetched && myEventsFetched;

  // ── Persistence: check storage for today's deck + exposure map ──
  useEffect(() => {
    (async () => {
      try {
        // Load exposure map
        const rawExposure = await AsyncStorage.getItem(EXPOSURE_MAP_KEY);
        if (rawExposure) {
          try { exposureMapRef.current = JSON.parse(rawExposure); } catch { /* ignore */ }
        }

        // Load accept stats + monthly reset check
        const rawStats = await AsyncStorage.getItem(ACCEPT_STATS_KEY);
        const rawMonth = await AsyncStorage.getItem(STATS_RESET_MONTH_KEY);
        if (rawStats) {
          try {
            const parsed = JSON.parse(rawStats);
            const { stats, resetMonth } = maybeResetStats(parsed, rawMonth);
            acceptStatsRef.current = stats;
            statsResetMonthRef.current = resetMonth;
            // Persist if reset happened
            if (rawMonth !== resetMonth) {
              AsyncStorage.setItem(ACCEPT_STATS_KEY, JSON.stringify(stats)).catch(() => {});
              AsyncStorage.setItem(STATS_RESET_MONTH_KEY, resetMonth).catch(() => {});
            }
          } catch { /* ignore */ }
        }

        // Load pattern memory + prune old entries
        const rawPatterns = await AsyncStorage.getItem(PATTERN_MEMORY_KEY);
        if (rawPatterns) {
          try {
            const parsed = JSON.parse(rawPatterns);
            patternMemoryRef.current = prunePatternMemory(parsed, getTodayKey());
          } catch { /* ignore */ }
        }

        // Load today's session signals (for mid-session resumption)
        const rawTodaySignals = await AsyncStorage.getItem(getSessionSignalsKey());
        if (rawTodaySignals) {
          try { sessionSignalsRef.current = JSON.parse(rawTodaySignals); } catch { /* ignore */ }
        }

        // Load yesterday's signals (for next-day generation bias)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
        const rawYesterdaySignals = await AsyncStorage.getItem(getSessionSignalsKey(yKey));
        if (rawYesterdaySignals) {
          try { yesterdaySignalsRef.current = JSON.parse(rawYesterdaySignals); } catch { /* ignore */ }
        }

        const storageKey = getDeckStorageKey();
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (
            Array.isArray(parsed.deck) &&
            parsed.deck.length > 0
          ) {
            setDeck(parsed.deck);
            setCurrentIndex(parsed.index ?? 0);
            generatedTodayRef.current = true;
            setDeckReady(true);
            if (__DEV__) {
              devLog(
                `[P0_IDEAS_BOOT] restored from storage: ${parsed.deck.length} cards, idx=${parsed.index ?? 0}`,
              );
            }
          }
        }

        // Load persisted completion timestamp for today
        const todayComplete = await AsyncStorage.getItem(getCompleteKey(getDayKeyLocal()));
        if (todayComplete) {
          try {
            const parsed = JSON.parse(todayComplete);
            if (parsed.completedAt) {
              setCompletedAt(parsed.completedAt);
              prevCompleteRef.current = true;
            }
          } catch { /* ignore */ }
        }
      } catch {
        /* ignore corrupt storage */
      }
      setStorageChecked(true);
    })();
  }, []);

  // ── Build deck: only after storage checked + all data ready + not already generated ──
  useEffect(() => {
    if (!storageChecked) return;
    if (generatedTodayRef.current) return;
    if (!ideasReady) return;

    const myId = (session as any)?.user?.id as string | undefined;

    const context: IdeasContext = {
      reconnects: (reconnectData?.suggestions ?? []).map((s) => ({
        friendId: s.friend.id,
        friendName: s.friend.name,
        daysSinceHangout: s.daysSinceHangout,
        avatarUrl: s.friend.image,
      })),
      birthdays: (birthdayData?.birthdays ?? []).map((b) => ({
        friendId: b.id,
        friendName: b.name,
        birthday: b.birthday,
        avatarUrl: (b as any).image as string | null | undefined,
      })),
      upcomingFriendEvents: (feedEventsData?.events ?? [])
        .filter((ev) => !myId || ev.userId !== myId)
        .map((ev) => ({
          id: ev.id,
          title: ev.title,
          hostName: ev.user?.name ?? null,
          hostId: ev.userId,
          startTime: ev.startTime,
          goingCount: (ev as any).goingCount as number | undefined,
          capacity: (ev as any).capacity as number | null | undefined,
          hostAvatarUrl: ev.user?.image ?? null,
          eventPhotoUrl: (ev as any).eventPhotoUrl as string | null | undefined,
        })),
      myRecentEvents: (myEventsData?.events ?? []).map((ev) => ({
        title: ev.title,
        startTime: ev.startTime,
      })),
    };

    // Build birthday proximity map for context boosts
    const birthdayMap: Record<string, number> = {};
    const todayMs = new Date(getTodayKey()).getTime();
    const thisYear = new Date().getFullYear();
    for (const b of context.birthdays) {
      if (!b.birthday) continue;
      const bDate = new Date(b.birthday);
      if (isNaN(bDate.getTime())) continue;
      const thisYearBday = new Date(thisYear, bDate.getMonth(), bDate.getDate());
      const diffDays = (thisYearBday.getTime() - todayMs) / (1000 * 60 * 60 * 24);
      if (diffDays >= 0 && diffDays <= 21) {
        birthdayMap[b.friendId] = Math.ceil(diffDays);
      }
    }

    const rawDeck = generateIdeas(context, exposureMapRef.current, acceptStatsRef.current, birthdayMap, patternMemoryRef.current, myId, yesterdaySignalsRef.current);

    // Anti-repeat: prevent consecutive cards of the same category
    const newDeck = antiRepeatByCategory(rawDeck, (c) => c.category);

    if (__DEV__) {
      const beforeCats = rawDeck.slice(0, 12).map((c) => c.category);
      const afterCats = newDeck.slice(0, 12).map((c) => c.category);
      // Count consecutive-same violations before/after
      const countViolations = (cats: string[]) => {
        let v = 0;
        for (let i = 1; i < cats.length; i++) { if (cats[i] === cats[i - 1]) v++; }
        return v;
      };
      devLog("[IDEAS_ANTI_REPEAT]", {
        deckSize: newDeck.length,
        violationsBefore: countViolations(beforeCats),
        violationsAfter: countViolations(afterCats),
        beforeFirst12: beforeCats,
        afterFirst12: afterCats,
      });
    }

    setDeck(newDeck);
    setCurrentIndex(0);
    setDeckReady(true);
    generatedTodayRef.current = true;

    if (__DEV__) {
      devLog(
        `[P0_IDEAS_BOOT] generated: ${newDeck.length} cards (ideasReady=true)`,
      );
    }

    // Update exposure map with new deck ids
    const updatedExposures = updateExposureMap(
      exposureMapRef.current,
      newDeck.map((c) => c.id),
      getTodayKey(),
    );
    exposureMapRef.current = updatedExposures;
    AsyncStorage.setItem(EXPOSURE_MAP_KEY, JSON.stringify(updatedExposures)).catch(() => {});

    AsyncStorage.setItem(
      getDeckStorageKey(),
      JSON.stringify({ deck: newDeck, index: 0 }),
    ).catch(() => {});
  }, [storageChecked, ideasReady, reconnectData, birthdayData, feedEventsData, myEventsData, session]);

  // ── Accept handler: route depends on card category ──
  const handleAccept = useCallback(async () => {
    const card = deck[currentIndex];
    if (!card) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Record accept for learning model
    acceptStatsRef.current = recordSwipeAction(acceptStatsRef.current, card.category, "accepted");
    AsyncStorage.setItem(ACCEPT_STATS_KEY, JSON.stringify(acceptStatsRef.current)).catch(() => {});

    // Record pattern for habit engine
    patternMemoryRef.current = recordPattern(patternMemoryRef.current, card, getTodayKey());
    AsyncStorage.setItem(PATTERN_MEMORY_KEY, JSON.stringify(patternMemoryRef.current)).catch(() => {});

    // Record session signal for next-day learning
    if (card.archetype) {
      sessionSignalsRef.current = recordSessionSignal(sessionSignalsRef.current, card.archetype, "accepted");
      AsyncStorage.setItem(getSessionSignalsKey(), JSON.stringify(sessionSignalsRef.current)).catch(() => {});
    }

    // Session counter + throttled microcopy feedback
    sessionAcceptedRef.current++;
    const myId = (session as any)?.user?.id as string | undefined;
    const dailySeed = myId ? buildDailySeed(myId) : 0;
    const showIt = shouldShowAcceptFeedback(dailySeed, sessionAcceptedRef.current);
    if (showIt) {
      const acceptMsg = getAcceptFeedback({ seed: dailySeed, archetype: card.archetype, category: card.category });
      if (acceptMsg) {
        showFeedback(acceptMsg);
        if (__DEV__) devLog("[P1_MICROCOPY]", { kind: "accept", message: acceptMsg, archetype: card.archetype });
      }
    }
    if (__DEV__ && sessionAcceptedRef.current === 1) {
      devLog("[P1_IDEAS_POLISH]", { acceptedCount: 1, showFeedbackDecision: showIt, peopleCount });
    }

    // low_rsvp → navigate to the event detail screen (so user can RSVP)
    if (card.category === "low_rsvp" && card.eventId) {
      router.push(`/event/${card.eventId}` as any);
    } else if (card.friendId) {
      // reconnect/birthday/repeat with friendId → open circle chat
      const circles = circlesData?.circles ?? [];
      const myUserId = (session as any)?.user?.id as string | undefined;
      let bestCircle: { id: string; memberCount: number } | null = null;
      for (const c of circles) {
        const members = (c as any).members as Array<{ userId: string }> | undefined;
        if (!members) continue;
        const hasFriend = members.some((m) => m.userId === card.friendId);
        const hasMe = myUserId ? members.some((m) => m.userId === myUserId) : true;
        if (hasFriend && hasMe) {
          if (!bestCircle || members.length < bestCircle.memberCount) {
            bestCircle = { id: c.id, memberCount: members.length };
          }
        }
      }

      if (bestCircle) {
        const draftVParam = card.draftVariants ? `&draftVariants=${encodeURIComponent(JSON.stringify(card.draftVariants))}` : "";
        router.push(`/circle/${bestCircle.id}?draftMessage=${encodeURIComponent(card.draftMessage)}${draftVParam}` as any);
      } else {
        try {
          const friendName = card.title.replace(/^(Catch up with |Join |Do )/, "").replace(/[?'].*/, "").trim() || "friend";
          const result = await createCircleMutation.mutateAsync({
            name: friendName,
            emoji: "💬",
            memberIds: [card.friendId],
          });
          const draftVParam2 = card.draftVariants ? `&draftVariants=${encodeURIComponent(JSON.stringify(card.draftVariants))}` : "";
          router.push(`/circle/${result.circle.id}?draftMessage=${encodeURIComponent(card.draftMessage)}${draftVParam2}` as any);
        } catch {
          router.push(`/user/${card.friendId}` as any);
        }
      }
    } else {
      // Activity repeat (no friend): navigate to create
      const title = card.title.replace(/^Do |\?$/g, "").replace(/ again this week$/i, "");
      router.push(`/create?title=${encodeURIComponent(title)}` as any);
    }

    const next = currentIndex + 1;
    setCurrentIndex(next);
    AsyncStorage.setItem(
      getDeckStorageKey(),
      JSON.stringify({ deck, index: next }),
    ).catch(() => {});
  }, [currentIndex, deck, router, circlesData, session, createCircleMutation, showFeedback, peopleCount]);

  // ── Dismiss handler: advance + record dismiss ──
  const handleDismiss = useCallback(() => {
    const card = deck[currentIndex];
    if (card) {
      // Record dismiss for learning model
      acceptStatsRef.current = recordSwipeAction(acceptStatsRef.current, card.category, "dismissed");
      AsyncStorage.setItem(ACCEPT_STATS_KEY, JSON.stringify(acceptStatsRef.current)).catch(() => {});

      // Record session signal for next-day learning
      if (card.archetype) {
        sessionSignalsRef.current = recordSessionSignal(sessionSignalsRef.current, card.archetype, "dismissed");
        AsyncStorage.setItem(getSessionSignalsKey(), JSON.stringify(sessionSignalsRef.current)).catch(() => {});
      }

      // Session counter + rare dismiss feedback
      sessionDismissedRef.current++;
      const myId = (session as any)?.user?.id as string | undefined;
      const dailySeed = myId ? buildDailySeed(myId) : 0;
      const dismissMsg = getDismissFeedback({ seed: dailySeed, archetype: card.archetype, category: card.category, index: currentIndex });
      if (dismissMsg) {
        showFeedback(dismissMsg);
        if (__DEV__) devLog("[P1_MICROCOPY]", { kind: "dismiss", message: dismissMsg, archetype: card.archetype });
      }
    }
    const next = currentIndex + 1;
    setCurrentIndex(next);
    AsyncStorage.setItem(
      getDeckStorageKey(),
      JSON.stringify({ deck, index: next }),
    ).catch(() => {});
  }, [currentIndex, deck, session, showFeedback]);

  // ── Render ──
  if (!deckReady) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <View className="w-full px-4">
          {/* Skeleton card mimicking premium card shape */}
          <View
            className="rounded-2xl overflow-hidden"
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ height: HERO_H, backgroundColor: themeColor + "08" }} />
            <View className="px-4 pt-6 pb-4">
              <View className="h-4 w-3/4 rounded" style={{ backgroundColor: colors.border }} />
              <View className="h-3 w-1/2 rounded mt-2" style={{ backgroundColor: colors.border + "80" }} />
            </View>
          </View>
        </View>
        <Text
          className="text-sm mt-4"
          style={{ color: colors.textSecondary }}
        >
          Building your ideas…
        </Text>
      </View>
    );
  }

  if (deck.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Sparkles size={28} color={colors.textTertiary} />
        <Text
          className="text-base font-semibold mt-3"
          style={{ color: colors.text }}
        >
          No ideas yet
        </Text>
        <Text
          className="text-sm mt-1 text-center"
          style={{ color: colors.textSecondary }}
        >
          Check back tomorrow — we'll find something fun.
        </Text>
      </View>
    );
  }

  if (isComplete) {
    // Trigger entrance animation once
    if (completionOpacity.value === 0) {
      completionOpacity.value = withTiming(1, { duration: MotionDurations.hero });
      completionScale.value = withTiming(1, { duration: MotionDurations.hero });
    }

    const myId = (session as any)?.user?.id as string | undefined;
    const dailySeed = myId ? buildDailySeed(myId) : 0;
    const copy = getCompletionCopy({
      seed: dailySeed,
      acceptedCount: sessionAcceptedRef.current,
      dismissedCount: sessionDismissedRef.current,
      totalCount: deck.length,
    });

    return (
      <View className="flex-1 pt-8 items-center px-4">
        <Animated.View
          style={[
            {
              width: DECK_SCREEN_W - 32,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
              backgroundColor: colors.surface,
              paddingVertical: 32,
              paddingHorizontal: 24,
              alignItems: "center",
            },
            completionStyle,
          ]}
        >
          <Sparkles size={28} color={themeColor} />
          {/* Reward line */}
          <Text
            className="text-[12px] mt-3"
            style={{ color: colors.textTertiary, opacity: 0.6 }}
          >
            Done for today
          </Text>
          <Text
            className="text-lg font-semibold mt-1 text-center"
            style={{ color: colors.text }}
          >
            {copy.title}
          </Text>
          <Text
            className="text-sm mt-2 text-center leading-5"
            style={{ color: colors.textSecondary }}
          >
            {copy.subtitle}
          </Text>

          {/* Primary CTA: switch to People tab */}
          {onSwitchToPeople && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSwitchToPeople?.();
              }}
              className="mt-5 px-6 py-2.5 rounded-full"
              style={{ backgroundColor: themeColor }}
            >
              <Text className="text-sm font-semibold text-white">
                Browse People
              </Text>
            </Pressable>
          )}

          {/* People-empty hint */}
          {onSwitchToPeople && peopleCount === 0 && (
            <Text
              className="text-[11px] mt-2 text-center"
              style={{ color: colors.textTertiary }}
            >
              Add a friend to unlock better ideas.
            </Text>
          )}

          {/* Secondary hint: live countdown to next deck */}
          <Text
            className="text-[11px] mt-2"
            style={{ color: colors.textTertiary }}
          >
            {countdownLabel ?? "New ideas tomorrow"}
          </Text>
        </Animated.View>
      </View>
    );
  }

  const currentCard = deck[currentIndex]!;
  const nextCard = deck[currentIndex + 1];
  const thirdCard = deck[currentIndex + 2];

  return (
    <View className="flex-1 pt-8">
      <DeckSwipeCard
        key={currentCard.id}
        card={currentCard}
        nextCard={nextCard}
        thirdCard={thirdCard}
        index={currentIndex}
        total={deck.length}
        onAccept={handleAccept}
        onDismiss={handleDismiss}
        onWhyPress={__DEV__ ? () => {
          setDebugCard(currentCard);
          devLog("[P1_IDEA_DEBUGGER]", {
            archetype: currentCard.archetype,
            finalScore: currentCard.scoreBreakdown?.final,
            confidence: currentCard.scoreBreakdown?.confidence,
            idx: currentIndex,
            total: deck.length,
          });
        } : undefined}
      />
      {/* Transient microcopy feedback */}
      {feedbackText && (
        <Animated.Text
          entering={FadeIn.duration(MotionDurations.normal)}
          className="text-[12px] text-center mt-1"
          style={{ color: colors.textTertiary }}
        >
          {feedbackText}
        </Animated.Text>
      )}

      {/* DEV-only score debugger overlay */}
      {__DEV__ && (
        <BottomSheet
          visible={!!debugCard}
          onClose={() => setDebugCard(null)}
          heightPct={0}
        >
          {debugCard && (() => {
            const b = debugCard.scoreBreakdown as ScoreBreakdown | undefined;
            const rows: [string, string][] = b ? [
              ["Base", b.base.toFixed(2)],
              ["Context", b.context.toFixed(2)],
              ["Habit", b.habit.toFixed(2)],
              ["Decay", b.decay.toFixed(2)],
              ["Final", b.final.toFixed(2)],
              ["Confidence", `${(b.confidence * 100).toFixed(0)}%`],
            ] : [];
            return (
              <View className="px-5 pb-6 pt-3">
                <Text className="text-base font-semibold mb-1" style={{ color: colors.text }}>
                  Why this idea
                </Text>
                <Text className="text-sm mb-3" style={{ color: colors.textSecondary }}>
                  {debugCard.title}
                </Text>
                {b && (
                  <View className="rounded-lg p-3 mb-3" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)" }}>
                    <Text className="text-xs font-medium mb-2" style={{ color: themeColor }}>
                      {confidenceToLabel(b.confidence)} — {(b.confidence * 100).toFixed(0)}%
                    </Text>
                    {rows.map(([label, val]) => (
                      <View key={label} className="flex-row justify-between py-0.5">
                        <Text className="text-xs" style={{ color: colors.textSecondary }}>{label}</Text>
                        <Text className="text-xs font-mono" style={{ color: colors.text }}>{val}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Text className="text-[11px]" style={{ color: colors.textTertiary }}>
                  Archetype: {debugCard.archetype ?? "none"} • #{currentIndex + 1}/{deck.length}
                </Text>
              </View>
            );
          })()}
        </BottomSheet>
      )}
    </View>
  );
}
