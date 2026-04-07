/**
 * EventShareCard — Compact pressable card rendered in circle chat for shared events.
 *
 * Displays: event title, date/time, host name, optional emoji.
 * Pressing navigates to the event detail page.
 */

import React from "react";
import { View, Text, Pressable, Image } from "react-native";
import { Calendar } from "@/ui/icons";

interface EventSharePayload {
  eventId: string;
  title: string;
  startTime: string;
  endTime?: string;
  emoji?: string;
  eventPhotoUrl?: string | null;
  hostName: string;
}

interface EventShareCardProps {
  payload: EventSharePayload;
  themeColor: string;
  colors: {
    text: string;
    textSecondary: string;
    textTertiary: string;
  };
  isDark: boolean;
  onViewEvent?: (eventId: string) => void;
}

/**
 * Parse `__system:event_share:{JSON}` content into a typed payload.
 * Returns null if content doesn't match or JSON is malformed.
 */
export function parseEventSharePayload(content: string): EventSharePayload | null {
  const PREFIX = "__system:event_share:";
  if (!content.startsWith(PREFIX)) return null;
  try {
    const raw = JSON.parse(content.slice(PREFIX.length));
    if (
      raw &&
      typeof raw.eventId === "string" &&
      typeof raw.title === "string" &&
      typeof raw.startTime === "string"
    ) {
      return {
        eventId: raw.eventId,
        title: raw.title,
        startTime: raw.startTime,
        endTime: typeof raw.endTime === "string" ? raw.endTime : undefined,
        emoji: typeof raw.emoji === "string" ? raw.emoji : undefined,
        eventPhotoUrl: raw.eventPhotoUrl ?? null,
        hostName: typeof raw.hostName === "string" ? raw.hostName : "Someone",
      };
    }
  } catch {
    /* malformed JSON — fall through */
  }
  return null;
}

export function EventShareCard({
  payload,
  themeColor,
  colors,
  isDark,
  onViewEvent,
}: EventShareCardProps) {
  const d = new Date(payload.startTime);
  const dateStr = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeStr = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Pressable
      onPress={() => onViewEvent?.(payload.eventId)}
      style={{
        width: "85%",
        borderRadius: 16,
        backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB",
        borderWidth: 1.5,
        borderColor: isDark ? themeColor + "30" : themeColor + "22",
        overflow: "hidden",
      }}
    >
      {/* Header accent bar */}
      <View
        style={{
          backgroundColor: themeColor + "18",
          paddingHorizontal: 14,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Calendar size={14} color={themeColor} />
        <Text
          style={{
            fontSize: 12,
            fontWeight: "700",
            color: themeColor,
            letterSpacing: 0.3,
            textTransform: "uppercase",
          }}
        >
          Shared Event
        </Text>
      </View>

      {/* Optional photo strip */}
      {payload.eventPhotoUrl ? (
        <Image
          source={{ uri: payload.eventPhotoUrl }}
          style={{
            width: "100%",
            height: 60,
            backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
          }}
          resizeMode="cover"
        />
      ) : null}

      {/* Content */}
      <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {payload.emoji ? (
            <Text style={{ fontSize: 16 }}>{payload.emoji}</Text>
          ) : null}
          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: colors.text,
              flex: 1,
            }}
            numberOfLines={2}
          >
            {payload.title}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 13,
            color: colors.textSecondary,
            marginTop: 4,
          }}
        >
          {dateStr} · {timeStr}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: colors.textTertiary,
            marginTop: 2,
          }}
        >
          Shared by {payload.hostName}
        </Text>
      </View>
    </Pressable>
  );
}
