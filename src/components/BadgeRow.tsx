import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/lib/ThemeContext";

export interface Badge {
  achievementId: string;
  name: string;
  description?: string | null;
  emoji: string;
  tier: string;
  tierColor: string;
  grantedAt: string;
}

interface BadgeRowProps {
  badges?: Badge[] | null;
  maxBadges?: number;
}

/**
 * Renders a small row of user badges (achievements/awards).
 * - Shows up to maxBadges chips with emoji only or emoji + short name
 * - Renders nothing if badges are missing/empty
 * - Avoids layout shifts with no wrapping container when empty
 * 
 * TODO: Badge data not yet available on:
 * - Friend user cards (FriendUser type missing badges field)
 * - Circle member cards (CircleMember type missing badges field)
 * - Event host card (Event.user missing badges field)
 * These would require new API contract updates to return badges for friend/member profiles.
 */
export function BadgeRow({ badges, maxBadges = 3 }: BadgeRowProps) {
  const { colors } = useTheme();

  // Render nothing if no badges or empty array
  if (!badges || badges.length === 0) {
    return null;
  }

  const displayedBadges = badges.slice(0, maxBadges);

  return (
    <View className="flex-row items-center gap-1 mt-1">
      {displayedBadges.map((badge) => (
        <View
          key={badge.achievementId}
          className="px-2 py-1 rounded-full items-center justify-center"
          style={{ backgroundColor: badge.tierColor + "20", borderWidth: 0.5, borderColor: badge.tierColor }}
        >
          <Text className="text-xs font-semibold">
            {badge.emoji}
          </Text>
        </View>
      ))}
    </View>
  );
}
