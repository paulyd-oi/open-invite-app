import React from "react";
import { View, Text, Pressable } from "react-native";
import { ChevronDown, RefreshCw } from "@/ui/icons";

interface CircleChatOverlaysProps {
  showScrollToBottom: boolean;
  unseenCount: number;
  hasFailed: boolean;
  failedBannerVisible: boolean;
  typingNames: string[];
  colors: { textSecondary: string; textTertiary: string };
  isDark: boolean;
  onScrollToBottom: () => void;
  onPillTap: () => void;
  onRetryFailed: () => void;
}

export function CircleChatOverlays({
  showScrollToBottom,
  unseenCount,
  hasFailed,
  failedBannerVisible,
  typingNames,
  colors,
  isDark,
  onScrollToBottom,
  onPillTap,
  onRetryFailed,
}: CircleChatOverlaysProps) {
  return (
    <>
      {/* [P2_CHAT_SCROLL_BTN] Floating scroll-to-bottom button */}
      {showScrollToBottom && unseenCount === 0 ? (
        <Pressable
          onPress={onScrollToBottom}
          style={{
            position: "absolute",
            right: 16,
            bottom: 92,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: isDark ? "rgba(58,58,60,0.9)" : "rgba(255,255,255,0.95)",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 49,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: isDark ? 0.4 : 0.15,
            shadowRadius: 3,
            elevation: 3,
            borderWidth: isDark ? 0 : 0.5,
            borderColor: "rgba(0,0,0,0.08)",
          }}
        >
          <ChevronDown size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}

      {/* [P1_CHAT_PILL] Floating new messages indicator */}
      {unseenCount > 0 ? (
        <Pressable
          onPress={onPillTap}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 92,
            alignItems: "center",
            zIndex: 50,
          }}
        >
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 16,
              backgroundColor: "rgba(0,0,0,0.72)",
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
              New messages
            </Text>
            {unseenCount > 1 ? (
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>
                {unseenCount > 99 ? "99+" : unseenCount}
              </Text>
            ) : null}
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>{"\u2193"}</Text>
          </View>
        </Pressable>
      ) : null}

      {/* [P1_CHAT_SEND_UI] Failed message banner */}
      {hasFailed && failedBannerVisible && (
        <Pressable
          onPress={onRetryFailed}
          style={{
            backgroundColor: "rgba(239,68,68,0.1)",
            borderTopWidth: 1,
            borderColor: "rgba(239,68,68,0.2)",
            paddingVertical: 8,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <RefreshCw size={12} color="#EF4444" />
          <Text style={{ color: "#EF4444", fontSize: 13, fontWeight: "500" }}>
            Message failed to send {"\u00B7"} Tap to retry
          </Text>
        </Pressable>
      )}

      {/* [P0_WS_TYPING_UI] Typing indicator */}
      {typingNames.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
          <Text style={{ color: colors.textTertiary, fontSize: 13, fontStyle: "italic" }}>
            {typingNames.length === 1
              ? `${typingNames[0]} is typing\u2026`
              : typingNames.length === 2
              ? `${typingNames[0]} and ${typingNames[1]} are typing\u2026`
              : `${typingNames.length} people are typing\u2026`}
          </Text>
        </View>
      )}
    </>
  );
}
