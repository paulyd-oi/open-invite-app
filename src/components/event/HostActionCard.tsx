import React from "react";
import { View, Text, Pressable } from "react-native";
import {
  Copy,
  MessageCircle,
  Share2,
  ListChecks,
  HandCoins,
  UserPlus,
} from "@/ui/icons";

interface HostActionCardProps {
  isDark: boolean;
  colors: any;
  themeColor: string;
  bringListEnabled?: boolean;
  bringListItems?: any[];
  pitchInEnabled?: boolean;
  pitchInHandle?: string | null;
  pitchInMethod?: string | null;
  onCopyLink: () => void;
  onText: () => void;
  onShare: () => void;
  onInviteViaText?: () => void;
  onSendInApp?: () => void;
}

export function HostActionCard({
  isDark,
  colors,
  themeColor,
  bringListEnabled,
  bringListItems = [],
  pitchInEnabled,
  pitchInHandle,
  pitchInMethod,
  onCopyLink,
  onText,
  onShare,
  onInviteViaText,
  onSendInApp,
}: HostActionCardProps) {
  const cardSurfaceBg = isDark ? "rgba(20,20,24,0.62)" : "rgba(255,255,255,0.82)";

  return (
    <View style={{
      backgroundColor: cardSurfaceBg,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.34)",
    }}>
      {/* Header */}
      <View style={{ marginBottom: 10 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>Your event is live</Text>
        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>Invite people to get responses</Text>
      </View>

      {/* Invite actions — Copy Link, Text, More */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
        <Pressable
          onPress={onCopyLink}
          style={{
            flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
            paddingVertical: 10, borderRadius: 12,
            backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
          }}
        >
          <Copy size={14} color={colors.text} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginLeft: 5 }}>Copy Link</Text>
        </Pressable>
        <Pressable
          onPress={onText}
          style={{
            flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
            paddingVertical: 10, borderRadius: 12,
            backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
          }}
        >
          <MessageCircle size={14} color={colors.text} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginLeft: 5 }}>Text</Text>
        </Pressable>
        <Pressable
          onPress={onShare}
          style={{
            flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
            paddingVertical: 10, borderRadius: 12,
            backgroundColor: themeColor,
          }}
        >
          <Share2 size={14} color="#FFFFFF" />
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFFFFF", marginLeft: 5 }}>Share</Text>
        </Pressable>
      </View>

      {/* Second row: Invite via Text + Send in App */}
      {(onInviteViaText || onSendInApp) && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {onInviteViaText && (
            <Pressable
              onPress={onInviteViaText}
              style={{
                flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                paddingVertical: 10, borderRadius: 12,
                backgroundColor: "#34C759",
              }}
            >
              <UserPlus size={14} color="#FFFFFF" />
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFFFFF", marginLeft: 5 }}>Invite via Text</Text>
            </Pressable>
          )}
          {onSendInApp && (
            <Pressable
              onPress={onSendInApp}
              style={{
                flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                paddingVertical: 10, borderRadius: 12,
                backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
              }}
            >
              <MessageCircle size={14} color={colors.text} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginLeft: 5 }}>Send in App</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Coordination summaries — bring list + pitch in */}
      {(!!bringListEnabled && bringListItems.length > 0 || !!pitchInEnabled && !!pitchInHandle) && (
        <View style={{ marginTop: 10 }}>
          {!!bringListEnabled && bringListItems.length > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
              <ListChecks size={13} color={colors.textSecondary} />
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 6 }}>
                What to bring: {bringListItems.filter((i: any) => !!i.claimedByUserId).length}/{bringListItems.length} claimed
              </Text>
            </View>
          )}
          {!!pitchInEnabled && !!pitchInHandle && (
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
              <HandCoins size={13} color={colors.textSecondary} />
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 6 }}>
                Pitch In: {pitchInMethod === "venmo" ? "Venmo" : pitchInMethod === "cashapp" ? "Cash App" : pitchInMethod === "paypal" ? "PayPal" : ""} @{pitchInHandle}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
