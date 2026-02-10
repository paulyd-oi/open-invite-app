import React from "react";
import { View, Text, Pressable } from "react-native";
import { Users } from "@/ui/icons";
import { useTheme } from "@/lib/ThemeContext";
import { EntityAvatar } from "@/components/EntityAvatar";

interface Attendee {
  id: string;
  name: string | null;
  image: string | null;
}

interface SocialProofProps {
  attendees: Attendee[];
  totalCount: number;
  maxDisplay?: number;
  onPress?: () => void;
  mutualFriendsOnly?: boolean;
  size?: "small" | "medium";
}

export function SocialProof({
  attendees,
  totalCount,
  maxDisplay = 3,
  onPress,
  mutualFriendsOnly = false,
  size = "medium",
}: SocialProofProps) {
  const { themeColor, isDark, colors } = useTheme();

  if (totalCount === 0) return null;

  const displayedAttendees = attendees.slice(0, maxDisplay);
  const remaining = totalCount - displayedAttendees.length;

  const avatarSize = size === "small" ? 20 : 24;
  const overlapOffset = size === "small" ? -6 : -8;
  const fontSize = size === "small" ? "text-xs" : "text-sm";

  // Generate compelling copy based on context
  const getCopyText = () => {
    const names = displayedAttendees
      .filter((a) => a.name)
      .map((a) => a.name!.split(" ")[0]);

    if (names.length === 0) {
      return `${totalCount} ${totalCount === 1 ? "friend" : "friends"} going`;
    }

    if (names.length === 1 && remaining === 0) {
      return `${names[0]} is going`;
    }

    if (names.length === 1 && remaining > 0) {
      return `${names[0]} + ${remaining} ${remaining === 1 ? "other" : "others"} going`;
    }

    if (names.length === 2 && remaining === 0) {
      return `${names[0]} & ${names[1]} are going`;
    }

    if (names.length === 2 && remaining > 0) {
      return `${names[0]}, ${names[1]} + ${remaining} going`;
    }

    if (names.length >= 3 && remaining === 0) {
      return `${names[0]}, ${names[1]} & ${names[2]} going`;
    }

    return `${names.slice(0, 2).join(", ")} + ${remaining + (names.length - 2)} going`;
  };

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center"
      disabled={!onPress}
    >
      {/* Avatar stack */}
      <View className="flex-row items-center">
        {displayedAttendees.map((attendee, index) => (
          <View
            key={attendee.id}
            className="rounded-full"
            style={{
              marginLeft: index > 0 ? overlapOffset : 0,
              borderWidth: 2,
              borderColor: isDark ? "#000" : "#fff",
              zIndex: maxDisplay - index,
            }}
          >
            <EntityAvatar
              photoUrl={attendee.image}
              initials={attendee.name?.[0] ?? "?"}
              size={avatarSize - 4}
              backgroundColor={attendee.image ? (isDark ? "#2C2C2E" : "#E5E7EB") : themeColor + "30"}
              foregroundColor={themeColor}
            />
          </View>
        ))}

        {/* Remaining count badge */}
        {remaining > 0 && (
          <View
            className="rounded-full items-center justify-center"
            style={{
              width: avatarSize,
              height: avatarSize,
              marginLeft: overlapOffset,
              borderWidth: 2,
              borderColor: isDark ? "#000" : "#fff",
              backgroundColor: themeColor,
              zIndex: 0,
            }}
          >
            <Text
              className="font-bold text-white"
              style={{ fontSize: avatarSize * 0.35 }}
            >
              +{remaining}
            </Text>
          </View>
        )}
      </View>

      {/* Text */}
      <Text
        className={`${fontSize} ml-2 font-medium`}
        style={{ color: colors.textSecondary }}
      >
        {getCopyText()}
      </Text>
    </Pressable>
  );
}

// FOMO banner for events with many attendees
export function FOMOBanner({
  count,
  eventTitle,
  onPress,
}: {
  count: number;
  eventTitle: string;
  onPress?: () => void;
}) {
  const { themeColor, isDark, colors } = useTheme();

  if (count < 3) return null;

  const getMessage = () => {
    if (count >= 10) return "🔥 This is THE event to be at!";
    if (count >= 5) return "✨ Your friends are all going to this!";
    return "👀 Your friends are interested";
  };

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center rounded-xl px-3 py-2 mb-2"
      style={{
        backgroundColor: `${themeColor}15`,
        borderWidth: 1,
        borderColor: `${themeColor}30`,
      }}
    >
      <Users size={16} color={themeColor} />
      <Text
        className="text-sm font-medium ml-2 flex-1"
        style={{ color: themeColor }}
        numberOfLines={1}
      >
        {count} friends are going to {eventTitle}
      </Text>
      <Text className="text-xs" style={{ color: themeColor }}>
        {getMessage()}
      </Text>
    </Pressable>
  );
}

// "X mutual friends going" for discovery
export function MutualFriendsGoing({
  mutualFriends,
  totalGoing,
  onPress,
}: {
  mutualFriends: Attendee[];
  totalGoing: number;
  onPress?: () => void;
}) {
  const { themeColor, isDark, colors } = useTheme();

  if (mutualFriends.length === 0) return null;

  const names = mutualFriends
    .slice(0, 2)
    .filter((f) => f.name)
    .map((f) => f.name!.split(" ")[0]);

  let message = "";
  if (names.length === 1) {
    message = `${names[0]} is going`;
  } else if (names.length === 2) {
    const othersCount = mutualFriends.length - 2;
    message = othersCount > 0
      ? `${names[0]}, ${names[1]} + ${othersCount} mutual friends`
      : `${names[0]} & ${names[1]} are going`;
  }

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center"
      disabled={!onPress}
    >
      {/* Avatar stack */}
      <View className="flex-row items-center">
        {mutualFriends.slice(0, 3).map((friend, index) => (
          <View
            key={friend.id}
            className="rounded-full"
            style={{
              marginLeft: index > 0 ? -6 : 0,
              borderWidth: 1.5,
              borderColor: "#22C55E",
              zIndex: 3 - index,
            }}
          >
            <EntityAvatar
              photoUrl={friend.image}
              initials={friend.name?.[0] ?? "?"}
              size={17}
              backgroundColor={friend.image ? (isDark ? "#2C2C2E" : "#E5E7EB") : "#22C55E20"}
              foregroundColor="#22C55E"
            />
          </View>
        ))}
      </View>

      <Text className="text-xs ml-1.5" style={{ color: "#22C55E" }}>
        {message}
      </Text>
    </Pressable>
  );
}
