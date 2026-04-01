import React from "react";
import { View, Text, Image } from "react-native";

export interface EventFlyerData {
  title: string;
  dateStr: string;
  timeStr: string;
  location: string | null;
  hostName: string | null;
  coHostNames: string[];
  coverImageUrl: string | null;
  themeColor: string;
}

interface EventFlyerProps {
  data: EventFlyerData;
  variant: "cover" | "typography";
  width: number;
}

/**
 * Renderable flyer view — captured by react-native-view-shot for sharing.
 * Two variants:
 * - "cover": cover image hero with text overlay
 * - "typography": bold text-forward layout with color accent
 */
export function EventFlyer({ data, variant, width }: EventFlyerProps) {
  const height = Math.round(width * 1.25); // 4:5 aspect ratio for social sharing
  const { title, dateStr, timeStr, location, hostName, coHostNames, coverImageUrl, themeColor } = data;

  const hostLabel = hostName
    ? coHostNames.length > 0
      ? `Hosted by ${hostName.split(" ")[0]} & ${coHostNames.map(n => n.split(" ")[0]).join(", ")}`
      : `Hosted by ${hostName}`
    : null;

  if (variant === "cover" && coverImageUrl) {
    return (
      <View style={{ width, height, borderRadius: 20, overflow: "hidden", backgroundColor: "#000" }}>
        <Image
          source={{ uri: coverImageUrl }}
          style={{ width, height, position: "absolute", opacity: 0.55 }}
          resizeMode="cover"
        />
        {/* Content overlay */}
        <View style={{ flex: 1, justifyContent: "flex-end", padding: 24 }}>
          <Text style={{ color: "#FFF", fontSize: 28, fontWeight: "800", lineHeight: 34, marginBottom: 12 }}>
            {title}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 16, fontWeight: "600", marginBottom: 4 }}>
            {dateStr}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 15, marginBottom: location ? 4 : 8 }}>
            {timeStr}
          </Text>
          {location && (
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginBottom: 8 }} numberOfLines={1}>
              📍 {location}
            </Text>
          )}
          {hostLabel && (
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 16 }}>
              {hostLabel}
            </Text>
          )}
          {/* Branding */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "600", letterSpacing: 0.5 }}>
              OPEN INVITE
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>
              RSVP at openinvite.cloud
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // Typography-forward variant (also used as fallback when no cover image)
  return (
    <View style={{
      width,
      height,
      borderRadius: 20,
      overflow: "hidden",
      backgroundColor: themeColor,
      padding: 28,
      justifyContent: "space-between",
    }}>
      {/* Top — branding */}
      <View>
        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" }}>
          You&apos;re Invited
        </Text>
      </View>

      {/* Center — event info */}
      <View>
        <Text style={{ color: "#FFF", fontSize: 32, fontWeight: "800", lineHeight: 38, marginBottom: 16 }}>
          {title}
        </Text>
        <View style={{
          backgroundColor: "rgba(255,255,255,0.15)",
          borderRadius: 12,
          padding: 14,
          marginBottom: 12,
        }}>
          <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "600", marginBottom: 2 }}>
            {dateStr}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 14 }}>
            {timeStr}
          </Text>
        </View>
        {location && (
          <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, marginBottom: 8 }} numberOfLines={2}>
            📍 {location}
          </Text>
        )}
        {hostLabel && (
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
            {hostLabel}
          </Text>
        )}
      </View>

      {/* Bottom — CTA + branding */}
      <View>
        <View style={{
          backgroundColor: "rgba(255,255,255,0.2)",
          borderRadius: 12,
          paddingVertical: 12,
          paddingHorizontal: 16,
          alignItems: "center",
          marginBottom: 12,
        }}>
          <Text style={{ color: "#FFF", fontSize: 15, fontWeight: "700" }}>
            RSVP on Open Invite
          </Text>
        </View>
        <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textAlign: "center", fontWeight: "600", letterSpacing: 0.5 }}>
          openinvite.cloud
        </Text>
      </View>
    </View>
  );
}
