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
import { Users, Calendar } from "@/ui/icons";
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
export async function markFirstValueNudgeCompleted(): Promise<void> {
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
export async function markFirstValueNudgeDismissed(): Promise<void> {
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
  onPrimary: () => void;
  onSecondary: () => void;
}

export function FirstValueNudge({ visible, onClose, onPrimary, onSecondary }: FirstValueNudgeProps) {
  const { themeColor, colors } = useTheme();
  const [isLoading, setIsLoading] = useState(false);

  const handlePrimary = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    await markFirstValueNudgeCompleted();
    onClose();
    onPrimary();
  };

  const handleSecondary = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    await markFirstValueNudgeCompleted();
    onClose();
    onSecondary();
  };

  const handleNotNow = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    await markFirstValueNudgeDismissed();
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
              onPress={handlePrimary}
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
              onPress={handleSecondary}
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
              onPress={handleNotNow}
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