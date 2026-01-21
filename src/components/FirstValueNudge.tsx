/**
 * FirstValueNudge - Prompts brand-new users to take their first value action
 * Only shows when user has no friends, no events, and no RSVPs
 */

import React, { useState } from "react";
import { View, Text, Modal, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInUp, SlideInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Users, Calendar, X } from "@/ui/icons";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/ThemeContext";

// Storage key for nudge state
const NUDGE_STORAGE_KEY = "firstValueNudge:v1";

interface NudgeState {
  lastShownAt?: number;
  completed?: boolean;
}

/**
 * Check if first-value nudge should be shown
 * Returns false if completed or shown within 7 days
 */
export async function canShowFirstValueNudge(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(NUDGE_STORAGE_KEY);
    if (!stored) return true; // First time, show nudge

    const state: NudgeState = JSON.parse(stored);
    
    // Never show if completed
    if (state.completed) return false;
    
    // Don't show if shown within 7 days
    if (state.lastShownAt) {
      const daysSince = (Date.now() - state.lastShownAt) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) return false;
    }
    
    return true;
  } catch {
    return true; // Default to showing if we can't read state
  }
}

/**
 * Mark nudge as completed (never show again)
 */
async function markNudgeCompleted(): Promise<void> {
  try {
    const state: NudgeState = { completed: true };
    await AsyncStorage.setItem(NUDGE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Mark nudge as dismissed for cooldown period
 */
async function markNudgeDismissed(): Promise<void> {
  try {
    const state: NudgeState = { lastShownAt: Date.now() };
    await AsyncStorage.setItem(NUDGE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

interface FirstValueNudgeProps {
  visible: boolean;
  onClose: () => void;
}

export function FirstValueNudge({ visible, onClose }: FirstValueNudgeProps) {
  const { themeColor, colors } = useTheme();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleFindFriends = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    await markNudgeCompleted();
    onClose();
    router.push("/discover");
  };

  const handleCreateEvent = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    await markNudgeCompleted();
    onClose();
    router.push("/create");
  };

  const handleDismiss = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    await markNudgeDismissed();
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
    >
      <View className="flex-1 justify-center items-center px-6">
        {/* Backdrop */}
        <Animated.View
          entering={FadeIn.duration(200)}
          className="absolute inset-0"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
        />

        {/* Modal Content */}
        <Animated.View 
          entering={SlideInUp.delay(100).springify()}
          className="w-full max-w-sm rounded-3xl p-6"
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 20 },
            shadowOpacity: 0.25,
            shadowRadius: 25,
            elevation: 10,
          }}
        >
          {/* Header */}
          <Animated.View 
            entering={FadeInUp.delay(200).springify()}
            className="items-center mb-6"
          >
            <View
              className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
              style={{ backgroundColor: `${themeColor}20` }}
            >
              <LinearGradient
                colors={[themeColor, `${themeColor}CC`]}
                className="w-8 h-8 rounded-xl items-center justify-center"
              >
                <Text className="text-white text-xl">✨</Text>
              </LinearGradient>
            </View>

            <Text
              style={{ color: colors.text }}
              className="text-xl font-sora-bold text-center mb-2"
            >
              Start with one action
            </Text>

            <Text
              style={{ color: colors.textSecondary }}
              className="text-base text-center leading-6"
            >
              Find friends or create your first event to make Open Invite useful fast.
            </Text>
          </Animated.View>

          {/* Action Buttons */}
          <Animated.View 
            entering={FadeInUp.delay(300).springify()}
            className="space-y-3"
          >
            {/* Primary CTA - Find Friends */}
            <Pressable
              onPress={handleFindFriends}
              disabled={isLoading}
              className="rounded-2xl p-4 flex-row items-center"
              style={{
                backgroundColor: themeColor,
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              <View
                className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
              >
                <Users size={20} color="white" />
              </View>
              <Text className="text-white text-base font-sora-semibold flex-1">
                Find friends
              </Text>
            </Pressable>

            {/* Secondary CTA - Create Event */}
            <Pressable
              onPress={handleCreateEvent}
              disabled={isLoading}
              className="rounded-2xl p-4 flex-row items-center"
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              <View
                className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                style={{ backgroundColor: `${themeColor}20` }}
              >
                <Calendar size={20} color={themeColor} />
              </View>
              <Text
                style={{ color: colors.text }}
                className="text-base font-sora-semibold flex-1"
              >
                Create event
              </Text>
            </Pressable>
          </Animated.View>

          {/* Dismiss Button */}
          <Animated.View entering={FadeInUp.delay(400).springify()}>
            <Pressable
              onPress={handleDismiss}
              disabled={isLoading}
              className="mt-4 py-3 items-center"
              style={{ opacity: isLoading ? 0.7 : 1 }}
            >
              <Text
                style={{ color: colors.textTertiary }}
                className="text-sm font-sora-medium"
              >
                Not now
              </Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * Hook to determine if user is eligible for first-value nudge
 * Based on having no friends, no created events, no attending events
 */
export function useFirstValueNudgeEligibility({
  friendsData,
  myEventsData,
  attendingData,
  bootStatus,
}: {
  friendsData?: { friends: any[] } | null;
  myEventsData?: { events: any[] } | null;  
  attendingData?: { events: any[] } | null;
  bootStatus: string;
}) {
  // Only eligible if authed
  if (bootStatus !== 'authed') return false;
  
  // Check if user has zero social connections and events
  const hasFriends = (friendsData?.friends?.length ?? 0) > 0;
  const hasCreatedEvents = (myEventsData?.events?.length ?? 0) > 0;
  const hasAttendingEvents = (attendingData?.events?.length ?? 0) > 0;
  
  return !hasFriends && !hasCreatedEvents && !hasAttendingEvents;
}