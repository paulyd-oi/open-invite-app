/**
 * DiscoverSwipeCard — immersive event card for swipe mode.
 *
 * Renders a full-height card with hero image (or emoji fallback),
 * gradient overlay, title, date/time, location, and social proof.
 * Feels like a mini invitation, not a generic feed tile.
 */
import React from "react";
import { View, Text, Dimensions } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { MapPin, Clock, Users } from "@/ui/icons";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useTheme } from "@/lib/ThemeContext";
import { toCloudinaryTransformedUrl, CLOUDINARY_PRESETS } from "@/lib/mediaTransformSSOT";

const { width: SCREEN_W } = Dimensions.get("window");
export const CARD_WIDTH = SCREEN_W - 40;
export const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.35);

export interface SwipeEvent {
  id: string;
  title: string;
  emoji: string;
  startTime: string;
  endTime?: string | null;
  location: string | null;
  visibility?: string;
  user: { id: string; name: string | null; image: string | null };
  attendeeCount: number;
  capacity?: number | null;
  isFull?: boolean;
  eventPhotoUrl?: string | null;
  joinRequests?: Array<{
    id: string;
    userId: string;
    status: string;
    user: { id: string; name: string | null; image: string | null };
  }>;
}

interface Props {
  event: SwipeEvent;
  index: number;
  total: number;
}

export const DiscoverSwipeCard = React.memo(function DiscoverSwipeCard({ event, index, total }: Props) {
  const { themeColor, isDark, colors } = useTheme();
  const hasPhoto = !!event.eventPhotoUrl && event.visibility !== "private";

  const dateStr = new Date(event.startTime).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeStr = new Date(event.startTime).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const acceptedAttendees = (event.joinRequests ?? []).filter(
    (r) => r.status === "accepted" && r.user != null,
  );

  return (
    <View
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: 24,
        overflow: "hidden",
        backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
        borderWidth: 1,
        borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
      }}
    >
      {/* Hero area */}
      <View style={{ flex: 1, position: "relative" }}>
        {hasPhoto ? (
          <ExpoImage
            source={{ uri: toCloudinaryTransformedUrl(event.eventPhotoUrl!, CLOUDINARY_PRESETS.HERO_BANNER) }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            priority="high"
          />
        ) : (
          <View
            style={{
              width: "100%",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isDark ? "#2C2C2E" : "#FFF7ED",
            }}
          >
            <Text style={{ fontSize: 80 }}>{event.emoji || "\uD83D\uDCC5"}</Text>
          </View>
        )}

        {/* Gradient overlay for text readability */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.75)"]}
          locations={[0.35, 1]}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "65%",
          }}
        />

        {/* Card index badge */}
        <View
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            backgroundColor: "rgba(0,0,0,0.45)",
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "600" }}>
            {index + 1} / {total}
          </Text>
        </View>

        {/* Bottom content overlay */}
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 20 }}>
          {/* Title */}
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 26,
              fontWeight: "800",
              lineHeight: 32,
            }}
            numberOfLines={2}
          >
            {event.emoji} {event.title}
          </Text>

          {/* Date & Time */}
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
            <Clock size={14} color="rgba(255,255,255,0.8)" />
            <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 14, marginLeft: 6, fontWeight: "500" }}>
              {dateStr} at {timeStr}
            </Text>
          </View>

          {/* Location */}
          {event.location && (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
              <MapPin size={14} color="rgba(255,255,255,0.7)" />
              <Text
                style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, marginLeft: 6 }}
                numberOfLines={1}
              >
                {event.location}
              </Text>
            </View>
          )}

          {/* Social proof row */}
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
            {/* Host avatar */}
            <View
              style={{
                borderRadius: 16,
                borderWidth: 2,
                borderColor: "rgba(255,255,255,0.3)",
              }}
            >
              <EntityAvatar
                photoUrl={event.user.image}
                initials={event.user.name?.[0] ?? "?"}
                size={28}
                backgroundColor="rgba(255,255,255,0.2)"
                foregroundColor="#FFFFFF"
              />
            </View>

            {/* Attendee avatars (overlapping) */}
            {acceptedAttendees.slice(0, 3).map((req, i) => (
              <View
                key={req.id}
                style={{
                  marginLeft: -6,
                  borderRadius: 16,
                  borderWidth: 2,
                  borderColor: "rgba(255,255,255,0.3)",
                }}
              >
                <EntityAvatar
                  photoUrl={req.user?.image}
                  initials={req.user?.name?.[0] ?? "?"}
                  size={28}
                  backgroundColor="rgba(255,255,255,0.2)"
                  foregroundColor="#FFFFFF"
                />
              </View>
            ))}

            <View
              style={{
                marginLeft: 8,
                backgroundColor: "rgba(255,255,255,0.2)",
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 12,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Users size={12} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "600", marginLeft: 4 }}>
                {event.attendeeCount} going
              </Text>
            </View>

            {event.isFull && (
              <View
                style={{
                  marginLeft: 6,
                  backgroundColor: "#EF444440",
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 10,
                }}
              >
                <Text style={{ color: "#FCA5A5", fontSize: 11, fontWeight: "700" }}>Full</Text>
              </View>
            )}
          </View>

          {/* Host label */}
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 6 }}>
            Hosted by {event.user.name?.split(" ")[0] ?? "someone"}
          </Text>
        </View>
      </View>
    </View>
  );
});
