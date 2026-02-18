/**
 * PostValueInvitePrompt — shown after a positive action (RSVP going, event create)
 * to encourage sharing the app with friends.
 *
 * Cooldown: max once per 7 days via AsyncStorage.
 * Reuses APP_STORE_URL SSOT from ShareApp constants.
 */

import React from "react";
import { View, Text, Pressable, Modal, Share } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "@/lib/ThemeContext";
import { Share2, X } from "@/ui/icons";
import { devLog, devError } from "@/lib/devLog";

const APP_STORE_URL = "https://apps.apple.com/us/app/open-invite-social-calendar/id6757429210";
const SHARE_MESSAGE = "I'm using Open Invite to plan hangouts — join me!";
const STORAGE_KEY = "postValueInvite:lastShownAt";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type PostValueInviteSurface = "rsvp" | "create";

interface PostValueInvitePromptProps {
  visible: boolean;
  surface: PostValueInviteSurface;
  onClose: () => void;
}

export const PostValueInvitePrompt: React.FC<PostValueInvitePromptProps> = ({
  visible,
  surface,
  onClose,
}) => {
  const { colors, themeColor } = useTheme();

  const handleShare = async () => {
    if (__DEV__) {
      devLog("[P1_INVITE_SHARE]", `surface=${surface}`);
    }
    try {
      await Share.share({
        message: `${SHARE_MESSAGE}\n\n${APP_STORE_URL}`,
        url: APP_STORE_URL,
      });
    } catch (error) {
      devError("[PostValueInvitePrompt] share error:", error);
    }
    await markPostValueInviteShown();
    onClose();
  };

  const handleDismiss = async () => {
    await markPostValueInviteShown();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <Pressable
        className="flex-1 justify-center items-center px-6"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
        onPress={handleDismiss}
      >
        <Pressable
          className="rounded-2xl p-6 w-full max-w-sm"
          style={{ backgroundColor: colors.background }}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <Pressable
            onPress={handleDismiss}
            className="absolute top-3 right-3 w-8 h-8 rounded-full items-center justify-center"
            style={{ backgroundColor: colors.surface }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={16} color={colors.textTertiary} />
          </Pressable>

          {/* Icon */}
          <View className="items-center mb-4 mt-1">
            <View
              className="w-16 h-16 rounded-full items-center justify-center"
              style={{ backgroundColor: `${themeColor}20` }}
            >
              <Share2 size={32} color={themeColor} />
            </View>
          </View>

          {/* Copy */}
          <Text
            style={{ color: colors.text }}
            className="text-xl font-bold text-center"
          >
            Enjoying Open Invite?
          </Text>
          <Text
            style={{ color: colors.textSecondary }}
            className="text-center mt-2 leading-5 text-sm"
          >
            Plans are better with more friends. Share the app so your crew can join too.
          </Text>

          {/* Primary CTA */}
          <Pressable
            onPress={handleShare}
            className="rounded-xl p-4 flex-row items-center justify-center mt-5"
            style={{ backgroundColor: themeColor }}
          >
            <Share2 size={20} color="white" />
            <Text className="text-white font-semibold ml-2">
              Share Invite Link
            </Text>
          </Pressable>

          {/* Secondary CTA */}
          <Pressable
            onPress={handleDismiss}
            className="py-3 items-center mt-1"
          >
            <Text
              style={{ color: colors.textSecondary }}
              className="font-medium"
            >
              Not now
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ─── Cooldown helpers ───────────────────────────────────────────────

/**
 * Check if the invite prompt can be shown (respects 7-day cooldown).
 * Also logs the decision in DEV.
 */
export const canShowPostValueInvite = async (
  surface: PostValueInviteSurface,
): Promise<boolean> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      if (__DEV__) {
        devLog("[P1_POST_VALUE_INVITE]", `surface=${surface} shown=true reason=first_time`);
      }
      return true;
    }
    const lastShown = Number(raw);
    const elapsed = Date.now() - lastShown;
    const allowed = elapsed >= COOLDOWN_MS;
    if (__DEV__) {
      devLog(
        "[P1_POST_VALUE_INVITE]",
        `surface=${surface} shown=${allowed} reason=${allowed ? "cooldown_expired" : "cooldown"}`,
      );
    }
    return allowed;
  } catch {
    return false;
  }
};

/** Record that the prompt was shown (resets cooldown timer). */
export const markPostValueInviteShown = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Silently fail
  }
};
