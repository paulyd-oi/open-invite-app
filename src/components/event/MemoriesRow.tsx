import React from "react";
import { Pressable, View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Image as ExpoImage } from "expo-image";
import { Camera, ChevronRight } from "@/ui/icons";
import { toCloudinaryTransformedUrl, CLOUDINARY_PRESETS } from "@/lib/mediaTransformSSOT";
import { EventPhotoGallery } from "@/components/EventPhotoGallery";

interface MemoriesRowColors {
  text: string;
  textTertiary: string;
}

interface MemoriesRowProps {
  eventId: string;
  eventTitle: string;
  eventTime: Date;
  isOwner: boolean;
  memoriesPhotos: { imageUrl: string }[];
  isPast: boolean;
  showExpanded: boolean;
  isDark: boolean;
  themeColor: string;
  colors: MemoriesRowColors;
  onExpand: () => void;
}

export function MemoriesRow({
  eventId,
  eventTitle,
  eventTime,
  isOwner,
  memoriesPhotos,
  isPast,
  showExpanded,
  isDark,
  themeColor,
  colors,
  onExpand,
}: MemoriesRowProps) {
  const hasMemories = memoriesPhotos.length > 0;

  // 0 photos AND event hasn't happened yet → hide entirely
  if (!hasMemories && !isPast) return null;

  return (
    <Animated.View entering={FadeInDown.delay(130).springify()}>
      {showExpanded ? (
        <EventPhotoGallery
          eventId={eventId}
          eventTitle={eventTitle}
          eventTime={eventTime}
          isOwner={isOwner}
        />
      ) : (
        <Pressable
          onPress={onExpand}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 12,
            marginBottom: 10,
            borderTopWidth: 0.5,
            borderTopColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
          }}
        >
          {/* Thumbnail preview (first photo or camera icon) */}
          {hasMemories && memoriesPhotos[0]?.imageUrl ? (
            <View style={{ width: 36, height: 36, borderRadius: 10, overflow: "hidden", marginRight: 12 }}>
              <ExpoImage
                source={{ uri: toCloudinaryTransformedUrl(memoriesPhotos[0].imageUrl, CLOUDINARY_PRESETS.AVATAR_THUMB) }}
                style={{ width: 36, height: 36 }}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            </View>
          ) : (
            <View style={{
              width: 36, height: 36, borderRadius: 10, marginRight: 12,
              alignItems: "center", justifyContent: "center",
              backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            }}>
              <Camera size={16} color={colors.textTertiary} />
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
              {hasMemories ? "Memories" : "Add memories"}
            </Text>
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }}>
              {hasMemories
                ? `${memoriesPhotos.length} photo${memoriesPhotos.length !== 1 ? "s" : ""}`
                : "Share moments from this event"}
            </Text>
          </View>

          {hasMemories && (
            <View style={{
              paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
              backgroundColor: `${themeColor}14`,
              marginRight: 4,
            }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: themeColor }}>
                {memoriesPhotos.length}
              </Text>
            </View>
          )}
          <ChevronRight size={16} color={colors.textTertiary} />
        </Pressable>
      )}
    </Animated.View>
  );
}
