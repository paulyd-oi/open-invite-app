import React from "react";
import { View, Text, Pressable, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Share2, Copy, MessageCircle, Mail } from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";
import { toast } from "@/components/Toast";

const APP_STORE_URL = "https://apps.apple.com/app/open-invite"; // Placeholder
const SHARE_MESSAGE = "Check out Open Invite - the easiest way to share plans with friends!";

interface ShareAppButtonProps {
  variant?: "icon" | "compact" | "full";
}

export function ShareAppButton({ variant = "icon" }: ShareAppButtonProps) {
  const { themeColor, colors } = useTheme();

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await Share.share({
        message: `${SHARE_MESSAGE}\n\n${APP_STORE_URL}`,
        url: APP_STORE_URL,
      });
    } catch (error) {
      console.error("Error sharing:", error);
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
      <Pressable
        onPress={handleShare}
        className="flex-row items-center px-4 py-2 rounded-full"
        style={{ backgroundColor: `${themeColor}15` }}
      >
        <Share2 size={16} color={themeColor} />
        <Text style={{ color: themeColor }} className="text-sm font-medium ml-2">
          Share
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handleShare}
      className="flex-row items-center justify-center py-3 rounded-xl"
      style={{ backgroundColor: themeColor }}
    >
      <Share2 size={20} color="#fff" />
      <Text className="text-white font-semibold ml-2">Share Open Invite</Text>
    </Pressable>
  );
}

export function InviteFriendsContent() {
  const { themeColor, isDark, colors } = useTheme();

  const copyLink = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(APP_STORE_URL);
    toast.success("Copied!", "Link copied to clipboard");
  };

  const shareVia = async (method: "message" | "email" | "other") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await Share.share({
        message: `${SHARE_MESSAGE}\n\n${APP_STORE_URL}`,
        url: APP_STORE_URL,
      });
    } catch (error) {
      console.error("Error sharing:", error);
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
        <Pressable
          onPress={copyLink}
          className="px-3 py-1.5 rounded-lg ml-2"
          style={{ backgroundColor: `${themeColor}15` }}
        >
          <View className="flex-row items-center">
            <Copy size={14} color={themeColor} />
            <Text style={{ color: themeColor }} className="text-sm font-medium ml-1">
              Copy
            </Text>
          </View>
        </Pressable>
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
