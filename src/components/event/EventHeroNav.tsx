import React from "react";
import { Pressable, View } from "react-native";
import { BlurView } from "expo-blur";
import { ChevronLeft, MoreHorizontal } from "@/ui/icons";

interface EventHeroNavColors {
  text: string;
}

interface EventHeroNavProps {
  hasPhoto: boolean;
  screenWidth: number;
  topInset: number;
  colors: EventHeroNavColors;
  onBack: () => void;
  onOpenOptions: () => void;
}

export function EventHeroNav({
  hasPhoto,
  screenWidth,
  topInset,
  colors,
  onBack,
  onOpenOptions,
}: EventHeroNavProps) {
  return (
    <View style={{
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingTop: topInset + 6,
      paddingBottom: 6,
      zIndex: 10,
      ...(screenWidth >= 768 ? { maxWidth: 600, alignSelf: "center" as const, width: "100%" } : undefined),
    }}>
      {hasPhoto ? (
        <Pressable
          onPress={onBack}
          style={{ width: 40, height: 40, borderRadius: 20, overflow: "hidden" }}
        >
          <BlurView intensity={30} tint="dark" style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.15)" }}>
            <ChevronLeft size={24} color="#FFFFFF" />
          </BlurView>
        </Pressable>
      ) : (
        <Pressable
          onPress={onBack}
          style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }}
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
      )}
      {hasPhoto ? (
        <Pressable
          testID="event-detail-menu-open"
          onPress={onOpenOptions}
          style={{ width: 40, height: 40, borderRadius: 20, overflow: "hidden" }}
        >
          <BlurView intensity={30} tint="dark" style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.15)" }}>
            <MoreHorizontal size={22} color="#FFFFFF" />
          </BlurView>
        </Pressable>
      ) : (
        <Pressable
          testID="event-detail-menu-open"
          onPress={onOpenOptions}
          style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }}
        >
          <MoreHorizontal size={22} color={colors.text} />
        </Pressable>
      )}
    </View>
  );
}
