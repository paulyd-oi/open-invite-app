import React from "react";
import { Pressable, View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { X, Copy, MessageCircle, Share2 } from "@/ui/icons";
import { RADIUS } from "@/ui/layout";

interface PostCreateNudgeColors {
  text: string;
  textSecondary: string;
  textTertiary: string;
}

interface PostCreateNudgeProps {
  isDark: boolean;
  themeColor: string;
  colors: PostCreateNudgeColors;
  onDismiss: () => void;
  onCopyLink: () => void;
  onSendSms: () => void;
  onShareSheet: () => void;
}

export function PostCreateNudge({
  isDark,
  themeColor,
  colors,
  onDismiss,
  onCopyLink,
  onSendSms,
  onShareSheet,
}: PostCreateNudgeProps) {
  return (
    <Animated.View entering={FadeInDown.delay(200).springify()} style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 4 }}>
      <View style={{
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: RADIUS.xl,
        backgroundColor: isDark ? `${themeColor}18` : `${themeColor}10`,
        borderWidth: 0.5,
        borderColor: isDark ? `${themeColor}30` : `${themeColor}20`,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>Your event is live</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>Invite people to get responses</Text>
          </View>
          <Pressable
            onPress={onDismiss}
            style={{ padding: 6 }}
            hitSlop={8}
          >
            <X size={14} color={colors.textTertiary} />
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {/* Copy Link */}
          <Pressable
            onPress={onCopyLink}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 10,
              borderRadius: RADIUS.lg,
              backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
            }}
          >
            <Copy size={14} color={colors.text} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginLeft: 5 }}>Copy Link</Text>
          </Pressable>
          {/* SMS */}
          <Pressable
            onPress={onSendSms}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 10,
              borderRadius: RADIUS.lg,
              backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
            }}
          >
            <MessageCircle size={14} color={colors.text} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginLeft: 5 }}>Text</Text>
          </Pressable>
          {/* Share Sheet */}
          <Pressable
            onPress={onShareSheet}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 10,
              borderRadius: RADIUS.lg,
              backgroundColor: themeColor,
            }}
          >
            <Share2 size={14} color="#FFFFFF" />
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFFFFF", marginLeft: 5 }}>More</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}
