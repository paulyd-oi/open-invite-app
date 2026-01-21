import React from "react";
import { View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Heart, Users, Calendar } from "@/ui/icons";
import { DARK_COLORS } from "@/lib/ThemeContext";

interface SocialMemoryCardProps {
  memory: string;
  type: 'friends' | 'events' | 'hosting';
  themeColor: string;
  isDark: boolean;
  colors: typeof DARK_COLORS;
}

export function SocialMemoryCard({ memory, type, themeColor, isDark, colors }: SocialMemoryCardProps) {
  const getIcon = () => {
    switch (type) {
      case 'friends':
        return <Heart size={20} color={`${themeColor}CC`} />;
      case 'events':
        return <Calendar size={20} color={`${themeColor}CC`} />;
      case 'hosting':
        return <Users size={20} color={`${themeColor}CC`} />;
      default:
        return <Heart size={20} color={`${themeColor}CC`} />;
    }
  };

  return (
    <Animated.View 
      entering={FadeInDown.delay(50).springify()}
      className="mx-5 mb-4"
    >
      <View
        className="rounded-2xl p-4 border"
        style={{
          backgroundColor: `${themeColor}08`,
          borderColor: `${themeColor}20`,
        }}
      >
        <View className="flex-row items-start">
          <View
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: `${themeColor}15` }}
          >
            {getIcon()}
          </View>
          <View className="flex-1">
            <Text
              className="text-sm leading-5"
              style={{ color: colors.text }}
            >
              {memory}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}