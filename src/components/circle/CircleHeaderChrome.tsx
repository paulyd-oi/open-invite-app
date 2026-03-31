import React from "react";
import { View, Text, Pressable } from "react-native";
import { BlurView } from "expo-blur";
import { ArrowLeft, CalendarPlus } from "@/ui/icons";
import { CirclePhotoEmoji } from "@/components/CirclePhotoEmoji";
import { EntityAvatar } from "@/components/EntityAvatar";
import { HelpSheet, HELP_SHEETS } from "@/components/HelpSheet";

interface HeaderMember {
  userId: string;
  user: { name: string | null; image: string | null };
}

interface CircleHeaderChromeProps {
  circleName: string | undefined;
  circleEmoji: string | undefined;
  circlePhotoUrl: string | null | undefined;
  members: HeaderMember[];
  insetsTop: number;
  colors: { text: string; textSecondary: string; textTertiary: string; surface: string };
  isDark: boolean;
  themeColor: string;
  onLayout: (height: number) => void;
  onBack: () => void;
  onOpenSettings: () => void;
  onCreateEvent: () => void;
}

export function CircleHeaderChrome({
  circleName,
  circleEmoji,
  circlePhotoUrl,
  members,
  insetsTop,
  colors,
  isDark,
  themeColor,
  onLayout,
  onBack,
  onOpenSettings,
  onCreateEvent,
}: CircleHeaderChromeProps) {
  return (
    <View
      style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0) onLayout(h);
      }}
      pointerEvents="box-none"
    >
      <BlurView
        intensity={88}
        tint={isDark ? "dark" : "light"}
        style={{
          paddingTop: insetsTop,
          overflow: "hidden",
        }}
      >
        <View className="flex-row items-center px-4 py-3">
          <Pressable
            onPress={onBack}
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
          >
            <ArrowLeft size={20} color={colors.text} />
          </Pressable>

          <Pressable className="flex-1 flex-row items-center">
            <View
              className="w-10 h-10 rounded-xl items-center justify-center mr-3 overflow-hidden"
              style={{ backgroundColor: themeColor + "20" }}
            >
              <CirclePhotoEmoji photoUrl={circlePhotoUrl} emoji={circleEmoji} emojiClassName="text-xl" />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center">
                <Text className="font-semibold" style={{ color: colors.text }}>
                  {circleName}
                </Text>
                <HelpSheet screenKey="circles" config={HELP_SHEETS.circles} />
              </View>
              <Text className="text-xs" style={{ color: colors.textTertiary }}>
                {members.length} members
              </Text>
            </View>
          </Pressable>

          {/* Member Avatars - Tappable to open settings */}
          <Pressable
            onPress={onOpenSettings}
            className="flex-row mr-3"
          >
            {members.slice(0, 3).map((member, i) => (
              <View
                key={member.userId}
                className="rounded-full border-2"
                style={{
                  marginLeft: i > 0 ? -12 : 0,
                  borderColor: colors.surface,
                }}
              >
                <EntityAvatar
                  photoUrl={member.user.image}
                  initials={member.user.name?.[0] ?? "?"}
                  size={28}
                  backgroundColor={member.user.image ? (isDark ? "#2C2C2E" : "#E5E7EB") : themeColor + "30"}
                  foregroundColor={themeColor}
                />
              </View>
            ))}
            {members.length > 3 && (
              <View
                className="w-8 h-8 rounded-full items-center justify-center border-2"
                style={{
                  marginLeft: -12,
                  borderColor: colors.surface,
                  backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB",
                }}
              >
                <Text className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                  +{members.length - 3}
                </Text>
              </View>
            )}
          </Pressable>

          {/* Create Event Button */}
          <View className="items-center mr-3">
            <Pressable
              onPress={onCreateEvent}
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: themeColor }}
            >
              <CalendarPlus size={18} color="#fff" />
            </Pressable>
            <Text className="text-xs mt-1 font-medium" style={{ color: colors.textSecondary }}>
              Create
            </Text>
          </View>
        </View>
      </BlurView>
    </View>
  );
}
