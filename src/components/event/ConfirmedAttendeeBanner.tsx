import React from "react";
import { View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Check } from "@/ui/icons";
import { STATUS } from "@/ui/tokens";
import { RADIUS } from "@/ui/layout";
import { SocialProofRow } from "@/components/event/SocialProofRow";

interface AttendeeInfo {
  id: string;
  name: string | null;
  imageUrl?: string | null;
}

interface ConfirmedAttendeeBannerColors {
  textSecondary: string;
}

interface ConfirmedAttendeeBannerProps {
  effectiveGoingCount: number;
  attendees: AttendeeInfo[];
  isDark: boolean;
  colors: ConfirmedAttendeeBannerColors;
}

export function ConfirmedAttendeeBanner({
  effectiveGoingCount,
  attendees,
  isDark,
  colors,
}: ConfirmedAttendeeBannerProps) {
  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      {/* [GROWTH_SOCIAL_PROOF] Reinforce decision for confirmed attendees */}
      <SocialProofRow
        attendees={attendees}
        effectiveGoingCount={effectiveGoingCount}
        isDark={isDark}
        colors={colors}
      />
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 16,
        paddingHorizontal: 18,
        marginBottom: 18,
        borderRadius: RADIUS.xxl,
        backgroundColor: STATUS.going.bgSoft,
        borderWidth: 0.5,
        borderColor: STATUS.going.border,
      }}>
        <Check size={18} color={STATUS.going.fg} />
        <Text style={{ marginLeft: 8, fontSize: 15, fontWeight: "600", color: STATUS.going.fg }}>You're Attending</Text>
        <Text style={{ marginLeft: 6, fontSize: 13, color: colors.textSecondary }}>{"\u00B7"} on your calendar</Text>
      </View>
    </Animated.View>
  );
}
