/**
 * FirstTimeCalendarHint — subtle onboarding card shown below DayInsightCard
 * for brand-new users who have not created or RSVPed to any events.
 *
 * Auto-dismisses permanently when:
 *   - User creates their first event
 *   - User RSVPs to any event
 *   - App open count >= 5
 *
 * [P1_FIRST_TIME_HINT] proof tag
 */

import React, { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Compass } from "@/ui/icons";
import { useTheme, TILE_SHADOW } from "@/lib/ThemeContext";
import * as Haptics from "expo-haptics";
import { devLog } from "@/lib/devLog";

const HINT_DISMISSED_KEY = "oi:first_time_hint_dismissed";
const APP_OPEN_COUNT_KEY = "oi:app_open_count";
const MAX_APP_OPENS = 5;

interface FirstTimeCalendarHintProps {
  /** Number of events the user has created (lifetime, from calendar data) */
  createdEventCount: number;
  /** Number of events the user is attending / RSVPed to (lifetime, from calendar data) */
  goingEventCount: number;
  /** Whether selected day has no Open Invite events (same gate as DayInsightCard) */
  selectedDayEmpty: boolean;
  /** Whether user email is verified */
  emailVerified: boolean;
  /** Press handler for the Create CTA (caller should guard with guardEmailVerification) */
  onCreatePress: () => void;
}

export function FirstTimeCalendarHint({
  createdEventCount,
  goingEventCount,
  selectedDayEmpty,
  emailVerified,
  onCreatePress,
}: FirstTimeCalendarHintProps) {
  const { themeColor, colors, isDark } = useTheme();
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);

  // Check display conditions on mount + when props change
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Fast exit: user has events → not a first-timer
        if (createdEventCount > 0 || goingEventCount > 0) {
          // Auto-dismiss permanently
          await AsyncStorage.setItem(HINT_DISMISSED_KEY, "true");
          if (!cancelled) {
            setVisible(false);
            setChecked(true);
          }
          return;
        }

        // Check if already permanently dismissed
        const dismissed = await AsyncStorage.getItem(HINT_DISMISSED_KEY);
        if (dismissed === "true") {
          if (!cancelled) {
            setVisible(false);
            setChecked(true);
          }
          return;
        }

        // Increment + check app open count
        const rawCount = await AsyncStorage.getItem(APP_OPEN_COUNT_KEY);
        const count = rawCount ? parseInt(rawCount, 10) : 0;
        const newCount = count + 1;
        await AsyncStorage.setItem(APP_OPEN_COUNT_KEY, String(newCount));

        if (newCount >= MAX_APP_OPENS) {
          await AsyncStorage.setItem(HINT_DISMISSED_KEY, "true");
          if (!cancelled) {
            setVisible(false);
            setChecked(true);
          }
          return;
        }

        // All conditions met → show hint
        const shouldShow =
          selectedDayEmpty && emailVerified;

        if (__DEV__) {
          devLog("[P1_FIRST_TIME_HINT]", {
            visible: shouldShow ? 1 : 0,
            reason: !shouldShow
              ? !selectedDayEmpty
                ? "day_has_events"
                : "email_not_verified"
              : "first_time_user",
            appOpenCount: newCount,
            createdEventCount,
            goingEventCount,
          });
        }

        if (!cancelled) {
          setVisible(shouldShow);
          setChecked(true);
        }
      } catch {
        // Silently fail — hint is non-critical
        if (!cancelled) {
          setVisible(false);
          setChecked(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [createdEventCount, goingEventCount, selectedDayEmpty, emailVerified]);

  // Don't render until async check completes, and never if not visible
  if (!checked || !visible) return null;

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onCreatePress();
      }}
      className="rounded-2xl px-4 py-4 mb-4"
      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
      style={{
        backgroundColor: isDark ? colors.surface : `${themeColor}06`,
        borderWidth: 1,
        borderColor: isDark ? colors.border : `${themeColor}12`,
        ...(isDark ? {} : TILE_SHADOW),
      }}
    >
      <View className="flex-row items-start">
        <View
          className="w-8 h-8 rounded-full items-center justify-center mr-3 mt-0.5"
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          style={{ backgroundColor: `${themeColor}10` }}
        >
          <Compass size={16} color={themeColor} />
        </View>
        <View className="flex-1">
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text
            className="text-xs font-semibold mb-1"
            style={{ color: themeColor, opacity: 0.8 }}
          >
            Getting started
          </Text>
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text
            className="text-[13px] leading-[18px]"
            style={{ color: colors.textSecondary }}
          >
            Create an event or join one to start seeing activity here.
          </Text>
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text
            className="text-xs mt-1"
            style={{ color: colors.textSecondary, opacity: 0.55 }}
          >
            Your calendar fills up as you plan with friends.
          </Text>
        </View>
        <View className="ml-2 self-center">
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text
            className="text-[13px] font-medium"
            style={{ color: themeColor, minHeight: 44, textAlignVertical: "center", lineHeight: 44 }}
          >
            Create
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
