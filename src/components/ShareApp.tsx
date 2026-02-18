import React from "react";
import { View, Text, Pressable, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Share2, Copy, MessageCircle, Mail } from "@/ui/icons";
import { hapticTap, hapticSuccess } from "@/ui/motion";

import { useTheme } from "@/lib/ThemeContext";
import { safeToast } from "@/lib/safeToast";
import { devError } from "@/lib/devLog";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { APP_STORE_URL } from "@/lib/config";
const SHARE_MESSAGE = "Check out Open Invite - the easiest way to share plans with friends!";

interface ShareAppButtonProps {
  variant?: "icon" | "compact" | "full";
}

export function ShareAppButton({ variant = "icon" }: ShareAppButtonProps) {
  const { themeColor, colors } = useTheme();

  const handleShare = async () => {
    hapticTap();

    try {
      await Share.share({
        message: `${SHARE_MESSAGE}\n\n${APP_STORE_URL}`,
        url: APP_STORE_URL,
      });
    } catch (error) {
      devError("Error sharing:", error);
    }
  };

  if (variant === "icon") {
    return (
      <Pressable
        onPress={handleShare}
        className="w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: `${themeColor}15` }}
      >
        <Share2 size={20} color={themeColor} />
      </Pressable>
    );
  }

  if (variant === "compact") {
    return (
      <Chip
        variant="accent"
        label="Share"
        leftIcon={<Share2 size={16} color={themeColor} />}
        onPress={handleShare}
      />
    );
  }

  return (
    <Button
      variant="primary"
      label="Share Open Invite"
      onPress={handleShare}
      leftIcon={<Share2 size={20} color={colors.buttonPrimaryText} />}
      style={{ borderRadius: 12 }}
    />
  );
}

export function InviteFriendsContent() {
  const { themeColor, isDark, colors } = useTheme();

  const copyLink = async () => {
    hapticSuccess();
    await Clipboard.setStringAsync(APP_STORE_URL);
    safeToast.success("Copied!", "Link copied to clipboard");
  };

  const shareVia = async (method: "message" | "email" | "other") => {
    hapticTap();

    try {
      await Share.share({
        message: `${SHARE_MESSAGE}\n\n${APP_STORE_URL}`,
        url: APP_STORE_URL,
      });
    } catch (error) {
      devError("Error sharing:", error);
    }
  };

  return (
    <View>
      {/* Share Link */}
      <View
        className="flex-row items-center rounded-xl p-3 mb-4"
        style={{ backgroundColor: colors.background }}
      >
        <Text
          style={{ color: colors.textSecondary }}
          className="flex-1 text-sm"
          numberOfLines={1}
        >
          {APP_STORE_URL}
        </Text>
        <Chip
          variant="accent"
          label="Copy"
          leftIcon={<Copy size={14} color={themeColor} />}
          onPress={copyLink}
          style={{ marginLeft: 8 }}
        />
      </View>

      {/* Share Options */}
      <View className="flex-row justify-around">
        <Pressable
          onPress={() => shareVia("message")}
          className="items-center"
        >
          <View
            className="w-14 h-14 rounded-full items-center justify-center mb-2"
            style={{ backgroundColor: "#34C759" }}
          >
            <MessageCircle size={24} color="#fff" />
          </View>
          <Text style={{ color: colors.text }} className="text-xs">
            Message
          </Text>
        </Pressable>

        <Pressable
          onPress={() => shareVia("email")}
          className="items-center"
        >
          <View
            className="w-14 h-14 rounded-full items-center justify-center mb-2"
            style={{ backgroundColor: "#007AFF" }}
          >
            <Mail size={24} color="#fff" />
          </View>
          <Text style={{ color: colors.text }} className="text-xs">
            Email
          </Text>
        </Pressable>

        <Pressable
          onPress={() => shareVia("other")}
          className="items-center"
        >
          <View
            className="w-14 h-14 rounded-full items-center justify-center mb-2"
            style={{ backgroundColor: themeColor }}
          >
            <Share2 size={24} color="#fff" />
          </View>
          <Text style={{ color: colors.text }} className="text-xs">
            More
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
