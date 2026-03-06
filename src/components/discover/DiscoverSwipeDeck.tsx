/**
 * DiscoverSwipeDeck — 3-card swipe stack for Discover browse mode.
 *
 * Reuses gesture patterns from DailyIdeasDeck (Gesture.Pan, threshold,
 * spring snap-back, fly-off animation) adapted for event cards.
 *
 * Right swipe → mark Interested (existing RSVP endpoint)
 * Left swipe  → skip locally for session
 * Tap         → open event detail
 */
import React, { useState, useCallback, useRef, useMemo } from "react";
import { View, Text, Pressable, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, X, RotateCcw } from "@/ui/icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/ThemeContext";
import { MotionDurations } from "@/lib/motionSSOT";
import { postIdempotent } from "@/lib/idempotencyKey";
import { eventKeys } from "@/lib/eventQueryKeys";
import { devLog } from "@/lib/devLog";
import {
  trackDiscoverSwipeView,
  trackDiscoverSwipeRight,
  trackDiscoverSwipeLeft,
  trackDiscoverSwipeOpen,
  trackDiscoverSwipeSessionEnd,
} from "@/analytics/analyticsEventsSSOT";
import {
  DiscoverSwipeCard,
  CARD_WIDTH,
  CARD_HEIGHT,
  type SwipeEvent,
} from "./DiscoverSwipeCard";

const SCREEN_W = Dimensions.get("window").width;
const SWIPE_THRESHOLD = Math.round(SCREEN_W * 0.3);
const FLY_DURATION = MotionDurations.hero;

interface Props {
  events: SwipeEvent[];
  onSwitchToFeed: () => void;
}

export function DiscoverSwipeDeck({ events, onSwitchToFeed }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Bottom nav is absolutely positioned — reserve space so buttons aren't hidden
  const bottomPad = insets.bottom + 80;

  // Session state: track which cards have been acted on
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const statsRef = useRef({ cardsViewed: 0, cardsRight: 0, cardsLeft: 0 });
  const thresholdHapticRef = useRef(0);

  // Compute active deck from events minus dismissed
  const deck = useMemo(() => {
    return events.filter((e) => !dismissed.has(e.id));
  }, [events, dismissed]);

  const total = events.length;

  // Shared values for gesture
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isActive = useSharedValue(0);

  // RSVP mutation (same endpoint as event detail "Interested")
  const rsvpMutation = useMutation({
    mutationFn: (eventId: string) =>
      postIdempotent(`/api/events/${eventId}/rsvp`, { status: "interested" }),
    onSuccess: () => {
      // Invalidate feed queries so UI stays consistent
      queryClient.invalidateQueries({ queryKey: eventKeys.feedPopular() });
      queryClient.invalidateQueries({ queryKey: eventKeys.myEvents() });
    },
    onError: (err) => {
      if (__DEV__) devLog("[DISCOVER_SWIPE_RSVP_ERR]", err);
    },
  });

  const fireThresholdHaptic = useCallback(() => {
    const now = Date.now();
    if (now - thresholdHapticRef.current > 250) {
      thresholdHapticRef.current = now;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  const handleSwipeRight = useCallback(() => {
    const event = deck[0];
    if (!event) return;
    if (__DEV__) devLog("[DISCOVER_SWIPE_RIGHT]", { eventId: event.id });
    trackDiscoverSwipeRight({ eventId: event.id, cardIndex: statsRef.current.cardsViewed });
    statsRef.current.cardsRight++;
    statsRef.current.cardsViewed++;
    rsvpMutation.mutate(event.id);
    setDismissed((prev) => new Set(prev).add(event.id));
  }, [deck, rsvpMutation]);

  const handleSwipeLeft = useCallback(() => {
    const event = deck[0];
    if (!event) return;
    if (__DEV__) devLog("[DISCOVER_SWIPE_LEFT]", { eventId: event.id });
    trackDiscoverSwipeLeft({ eventId: event.id, cardIndex: statsRef.current.cardsViewed });
    statsRef.current.cardsLeft++;
    statsRef.current.cardsViewed++;
    setDismissed((prev) => new Set(prev).add(event.id));
  }, [deck]);

  const handleTap = useCallback(() => {
    const event = deck[0];
    if (!event) return;
    trackDiscoverSwipeOpen({ eventId: event.id, cardIndex: statsRef.current.cardsViewed });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/event/${event.id}` as any);
  }, [deck, router]);

  const handleResetDeck = useCallback(() => {
    trackDiscoverSwipeSessionEnd(statsRef.current);
    statsRef.current = { cardsViewed: 0, cardsRight: 0, cardsLeft: 0 };
    setDismissed(new Set());
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  // Delayed dispatch helpers (run after fly-off animation completes)
  const delayedRight = useCallback(() => {
    setTimeout(handleSwipeRight, 50);
  }, [handleSwipeRight]);

  const delayedLeft = useCallback(() => {
    setTimeout(handleSwipeLeft, 50);
  }, [handleSwipeLeft]);

  // Track card view
  const lastViewedId = useRef<string | null>(null);
  if (deck[0] && deck[0].id !== lastViewedId.current) {
    lastViewedId.current = deck[0].id;
    trackDiscoverSwipeView({ eventId: deck[0].id, cardIndex: statsRef.current.cardsViewed });
  }

  // Pan gesture (follows DailyIdeasDeck pattern)
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
      if (Math.abs(e.translationX) >= SWIPE_THRESHOLD) {
        runOnJS(fireThresholdHaptic)();
      }
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE_THRESHOLD || (e.velocityX > 500 && e.translationX > 50)) {
        // Fly off right → Interested
        translateX.value = withTiming(SCREEN_W + 100, { duration: FLY_DURATION });
        runOnJS(delayedRight)();
      } else if (e.translationX < -SWIPE_THRESHOLD || (e.velocityX < -500 && e.translationX < -50)) {
        // Fly off left → Skip
        translateX.value = withTiming(-SCREEN_W - 100, { duration: FLY_DURATION });
        runOnJS(delayedLeft)();
      } else {
        // Snap back
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  // Animated styles for top card
  const topCardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${translateX.value / 28}deg` },
      { scale: 1 + isActive.value * 0.015 },
    ],
  }));

  // Peek card 1 (behind top card)
  const peekStyle1 = useAnimatedStyle(() => {
    const progress = interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      transform: [
        { scale: 0.95 + progress * 0.05 },
        { translateY: 8 - progress * 8 },
      ],
      opacity: 0.7 + progress * 0.3,
    };
  });

  // Peek card 2 (deepest)
  const peekStyle2 = useAnimatedStyle(() => {
    const progress = interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      transform: [
        { scale: 0.9 + progress * 0.05 },
        { translateY: 16 - progress * 8 },
      ],
      opacity: 0.45 + progress * 0.25,
    };
  });

  // Swipe feedback overlay opacity
  const rightFeedbackStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));

  const leftFeedbackStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, -SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));

  // Button handlers for accessibility fallback
  const handleButtonRight = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    translateX.value = withTiming(SCREEN_W + 100, { duration: FLY_DURATION });
    setTimeout(handleSwipeRight, FLY_DURATION + 50);
  }, [handleSwipeRight, translateX]);

  const handleButtonLeft = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    translateX.value = withTiming(-SCREEN_W - 100, { duration: FLY_DURATION });
    setTimeout(handleSwipeLeft, FLY_DURATION + 50);
  }, [handleSwipeLeft, translateX]);

  // Empty state
  if (deck.length === 0) {
    trackDiscoverSwipeSessionEnd(statsRef.current);
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingBottom: bottomPad }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>
          {"\u2728"}
        </Text>
        <Text
          style={{
            fontSize: 22,
            fontWeight: "700",
            color: colors.text,
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          You're caught up
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: colors.textSecondary,
            textAlign: "center",
            marginBottom: 28,
            lineHeight: 20,
          }}
        >
          You've seen all {total} event{total !== 1 ? "s" : ""}. Check back later or browse the feed.
        </Text>

        <Pressable
          onPress={handleResetDeck}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: themeColor,
            paddingHorizontal: 24,
            paddingVertical: 14,
            borderRadius: 16,
            marginBottom: 12,
          }}
        >
          <RotateCcw size={16} color="#FFFFFF" />
          <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15, marginLeft: 8 }}>
            Restart deck
          </Text>
        </Pressable>

        <Pressable
          onPress={onSwitchToFeed}
          style={{
            paddingHorizontal: 24,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: themeColor, fontWeight: "500", fontSize: 14 }}>
            Switch to Feed
          </Text>
        </Pressable>
      </View>
    );
  }

  // Visible stack: up to 3 cards
  const visible = deck.slice(0, 3);
  const currentIndex = total - deck.length;

  return (
    <View style={{ flex: 1 }}>
      {/* Card stack */}
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Render bottom to top so top card is last (on top in z-order) */}
        {visible.length >= 3 && (
          <Animated.View
            style={[
              {
                position: "absolute",
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
              },
              peekStyle2,
            ]}
          >
            <DiscoverSwipeCard
              event={visible[2]}
              index={currentIndex + 2}
              total={total}
            />
          </Animated.View>
        )}

        {visible.length >= 2 && (
          <Animated.View
            style={[
              {
                position: "absolute",
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
              },
              peekStyle1,
            ]}
          >
            <DiscoverSwipeCard
              event={visible[1]}
              index={currentIndex + 1}
              total={total}
            />
          </Animated.View>
        )}

        {/* Top card — interactive */}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              {
                position: "absolute",
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
              },
              topCardStyle,
            ]}
          >
            <Pressable
              onPress={handleTap}
              style={{ flex: 1 }}
            >
              <DiscoverSwipeCard
                event={visible[0]}
                index={currentIndex}
                total={total}
              />

              {/* Right swipe feedback overlay */}
              <Animated.View
                style={[
                  {
                    position: "absolute",
                    top: 20,
                    left: 20,
                    backgroundColor: "#22C55E",
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 12,
                    flexDirection: "row",
                    alignItems: "center",
                  },
                  rightFeedbackStyle,
                ]}
              >
                <Heart size={18} color="#FFFFFF" />
                <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 15, marginLeft: 6 }}>
                  Interested
                </Text>
              </Animated.View>

              {/* Left swipe feedback overlay */}
              <Animated.View
                style={[
                  {
                    position: "absolute",
                    top: 20,
                    right: 20,
                    backgroundColor: "rgba(0,0,0,0.6)",
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 12,
                    flexDirection: "row",
                    alignItems: "center",
                  },
                  leftFeedbackStyle,
                ]}
              >
                <X size={18} color="#FFFFFF" />
                <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 15, marginLeft: 6 }}>
                  Skip
                </Text>
              </Animated.View>
            </Pressable>
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Accessibility action buttons */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          paddingBottom: bottomPad,
          paddingTop: 8,
          gap: 24,
        }}
      >
        <Pressable
          onPress={handleButtonLeft}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: isDark ? "#3C3C3E" : "#E5E7EB",
          }}
          accessibilityRole="button"
          accessibilityLabel="Skip event"
        >
          <X size={24} color={colors.textSecondary} />
        </Pressable>

        <Pressable
          onPress={handleButtonRight}
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: "#EC489920",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: "#EC4899",
          }}
          accessibilityRole="button"
          accessibilityLabel="Mark interested"
        >
          <Heart size={28} color="#EC4899" />
        </Pressable>

        <Pressable
          onPress={handleTap}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: isDark ? "#3C3C3E" : "#E5E7EB",
          }}
          accessibilityRole="button"
          accessibilityLabel="Open event details"
        >
          <Text style={{ fontSize: 18 }}>
            {"\u2197\uFE0F"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
