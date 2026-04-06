import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { ChevronRight, Cake } from "@/ui/icons";
import { useTheme, DARK_COLORS, TILE_SHADOW } from "@/lib/ThemeContext";
import { STATUS } from "@/ui/tokens";

// Upcoming Birthdays Section - Collapsible
export function UpcomingBirthdaysSection({
  upcomingBirthdays,
  colors,
}: {
  upcomingBirthdays: Array<{
    id: string; // This is the friend's userId
    name: string | null;
    image: string | null;
    birthday: string;
    showYear: boolean;
    nextBirthday: Date;
    daysUntil: number;
    isOwnBirthday: boolean;
    turningAge: number;
  }>;
  colors: typeof DARK_COLORS;
}) {
  const router = useRouter();
  const { isDark } = useTheme();
  const [isExpanded, setIsExpanded] = useState(true);

  if (upcomingBirthdays.length === 0) {
    return null;
  }

  return (
    <View className="px-5 mt-6 mb-4">
      {/* Header - Tappable to collapse/expand */}
      <Pressable
        /* INVARIANT_ALLOW_INLINE_HANDLER */
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setIsExpanded(!isExpanded);
        }}
        className="flex-row items-center justify-between mb-3"
      >
        <View className="flex-row items-center">
          <Cake size={18} color={STATUS.birthday.fg} />
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
            Upcoming Birthdays
          </Text>
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <View className="ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: STATUS.birthday.bgSoft }}>
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text className="text-xs font-medium" style={{ color: STATUS.birthday.fg }}>
              {upcomingBirthdays.length}
            </Text>
          </View>
        </View>
        <ChevronRight
          size={18}
          color={colors.textTertiary}
          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
          style={{ transform: [{ rotate: isExpanded ? "90deg" : "0deg" }] }}
        />
      </Pressable>

      {/* Content - Collapsible */}
      {isExpanded && (
        <Animated.View entering={FadeInDown.springify()}>
          <View
            className="rounded-xl overflow-hidden"
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.borderSubtle,
              ...(isDark ? {} : TILE_SHADOW),
            }}
          >
            {/* INVARIANT_ALLOW_SMALL_MAP */}
            {upcomingBirthdays.map((bday, idx) => {
              const isToday = bday.daysUntil === 0;
              const isTomorrow = bday.daysUntil === 1;
              const canNavigate = !bday.isOwnBirthday;

              return (
                <Pressable
                  key={bday.id}
                  /* INVARIANT_ALLOW_INLINE_HANDLER */
                  onPress={() => {
                    if (canNavigate) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      // Navigate to user profile using friend's userId
                      router.push(`/user/${bday.id}`);
                    }
                  }}
                  disabled={!canNavigate}
                  className="flex-row items-center p-3"
                  /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                  style={{
                    borderTopWidth: idx > 0 ? 1 : 0,
                    borderTopColor: colors.separator,
                    backgroundColor: isToday ? STATUS.birthday.bgSoft : "transparent",
                  }}
                >
                  {/* Avatar or cake emoji */}
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                    style={{
                      backgroundColor: isToday ? STATUS.birthday.border : STATUS.birthday.bgSoft,
                    }}
                  >
                    <Text className="text-lg">🎂</Text>
                  </View>

                  {/* Name and age */}
                  <View className="flex-1">
                    {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                    <Text className="font-medium" style={{ color: colors.text }}>
                      {bday.isOwnBirthday ? "My Birthday" : `${bday.name ?? "Friend"}'s Birthday`}
                    </Text>
                    {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                    <Text className="text-xs" style={{ color: colors.textSecondary }}>
                      {bday.showYear ? (bday.isOwnBirthday ? `Turning ${bday.turningAge}` : `Turns ${bday.turningAge}`) : "Birthday!"}
                    </Text>
                  </View>

                  {/* Days until + chevron for navigable */}
                  <View className="flex-row items-center">
                    <View className="items-end">
                      {isToday ? (
                        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                        <View className="px-2 py-1 rounded-full" style={{ backgroundColor: STATUS.birthday.fg }}>
                          <Text className="text-xs font-bold text-white">TODAY!</Text>
                        </View>
                      ) : isTomorrow ? (
                        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                        <View className="px-2 py-1 rounded-full" style={{ backgroundColor: STATUS.birthday.border }}>
                          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                          <Text className="text-xs font-semibold" style={{ color: STATUS.birthday.fg }}>Tomorrow</Text>
                        </View>
                      ) : (
                        <View className="items-end">
                          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                          <Text className="text-sm font-semibold" style={{ color: STATUS.birthday.fg }}>
                            {bday.nextBirthday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </Text>
                          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                          <Text className="text-xs" style={{ color: colors.textTertiary }}>
                            in {bday.daysUntil} days
                          </Text>
                        </View>
                      )}
                    </View>
                    {canNavigate && (
                      /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                      <ChevronRight size={16} color={colors.textTertiary} style={{ marginLeft: 8 }} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      )}
    </View>
  );
}
