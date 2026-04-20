import React from "react";
import {
  View,
  Text,
  ScrollView,
} from "react-native";
import BottomSheet from "@/components/BottomSheet";
import { EntityAvatar } from "@/components/EntityAvatar";
import type { CircleMember } from "@/shared/contracts";

interface AvailMember {
  userId: string;
  name: string;
  status: string;
}

interface AvailSummary {
  free: number;
  busy: number;
  tentative?: number;
  unknown: number;
  total: number;
}

interface CircleAvailabilitySheetProps {
  visible: boolean;
  availTonight: AvailSummary | null;
  availMembers: AvailMember[] | null;
  circleMembers: CircleMember[];
  colors: { text: string; textSecondary: string; border: string };
  isDark: boolean;
  themeColor: string;
  onClose: () => void;
}

export function CircleAvailabilitySheet({
  visible,
  availTonight,
  availMembers,
  circleMembers,
  colors,
  isDark,
  themeColor,
  onClose,
}: CircleAvailabilitySheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightPct={0}
      maxHeightPct={0.6}
      backdropOpacity={0.5}
      title="Tonight's Availability"
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* Summary counts */}
        {availTonight && (
          <View style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: 16,
            paddingVertical: 12,
            marginBottom: 8,
            borderBottomWidth: 1,
            borderColor: colors.border,
          }}>
            <Text style={{ fontSize: 14, color: colors.text }}>{"\uD83D\uDFE2"} {availTonight.free} free</Text>
            <Text style={{ fontSize: 14, color: colors.text }}>{"\uD83D\uDFE1"} {availTonight.busy} busy</Text>
            {(availTonight.tentative ?? 0) > 0 && (
              <Text style={{ fontSize: 14, color: colors.text }}>{"\uD83D\uDFE0"} {availTonight.tentative} tentative</Text>
            )}
            <Text style={{ fontSize: 14, color: colors.text }}>{"\u26AA"} {availTonight.unknown} unknown</Text>
          </View>
        )}

        {/* Member-by-member roster */}
        {availMembers && availMembers.length > 0 ? (
          availMembers.map((m) => {
            const statusEmoji = m.status === "free" ? "\uD83D\uDFE2" : m.status === "busy" ? "\uD83D\uDFE1" : m.status === "tentative" ? "\uD83D\uDFE0" : "\u26AA";
            const statusLabel = m.status.charAt(0).toUpperCase() + m.status.slice(1);
            const circleMember = circleMembers.find((cm) => cm.userId === m.userId);
            return (
              <View key={m.userId} style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 10,
                borderBottomWidth: 0.5,
                borderColor: colors.border,
              }}>
                {/* Avatar */}
                <View style={{
                  marginRight: 12,
                }}>
                  <EntityAvatar
                    photoUrl={circleMember?.user?.image}
                    initials={m.name?.[0] ?? "?"}
                    size={36}
                    backgroundColor={circleMember?.user?.image ? (isDark ? "#2C2C2E" : "#E5E7EB") : themeColor + "20"}
                    foregroundColor={themeColor}
                  />
                </View>
                {/* Name */}
                <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: colors.text }}>
                  {m.name}
                </Text>
                {/* Status pill */}
                <View style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 12,
                  backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                  gap: 4,
                }}>
                  <Text style={{ fontSize: 12 }}>{statusEmoji}</Text>
                  <Text style={{ fontSize: 12, fontWeight: "500", color: colors.textSecondary }}>{statusLabel}</Text>
                </View>
              </View>
            );
          })
        ) : (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <Text style={{ fontSize: 14, color: colors.textSecondary }}>
              Member breakdown coming next
            </Text>
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}
