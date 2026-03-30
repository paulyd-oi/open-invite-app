import React from "react";
import { View, Text } from "react-native";
import { EntityAvatar } from "@/components/EntityAvatar";

interface AttendeeInfo {
  id: string;
  name: string | null;
  imageUrl?: string | null;
}

interface SocialProofRowProps {
  attendees: AttendeeInfo[];
  effectiveGoingCount: number;
  isDark: boolean;
  colors: { textSecondary: string };
  /** When true, shows "Be the first to join" fallback when count is 0 */
  showFallback?: boolean;
}

export function SocialProofRow({
  attendees,
  effectiveGoingCount,
  isDark,
  colors,
  showFallback,
}: SocialProofRowProps) {
  if (effectiveGoingCount > 0) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
        <View style={{ flexDirection: "row", marginRight: 8 }}>
          {attendees.slice(0, 4).map((a, i) => (
            <View key={a.id} style={{ marginLeft: i > 0 ? -8 : 0, zIndex: 4 - i }}>
              <EntityAvatar
                photoUrl={a.imageUrl}
                initials={a.name?.[0] ?? "?"}
                size={24}
                backgroundColor={isDark ? "#2C2C2E" : "#DCFCE7"}
                foregroundColor="#166534"
              />
            </View>
          ))}
        </View>
        <Text style={{ fontSize: 13, fontWeight: "500", color: colors.textSecondary }}>
          {effectiveGoingCount} going
        </Text>
      </View>
    );
  }

  if (showFallback) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: "500", color: colors.textSecondary }}>
          Be the first to join
        </Text>
      </View>
    );
  }

  return null;
}
