import React from "react";
import { View, Text, Pressable, Image } from "react-native";
import { Calendar, ChevronUp, ChevronDown, MapPin } from "@/ui/icons";

interface NextEvent {
  id: string;
  title: string;
  startTime: string;
  endTime?: string | null;
  emoji?: string;
  location?: string | null;
  color?: string;
  coverUrl?: string | null;
  eventPhotoUrl?: string | null;
  description?: string | null;
}

interface CircleNextEventCardProps {
  event: NextEvent;
  expanded: boolean;
  colors: { text: string; textSecondary: string; textTertiary: string };
  isDark: boolean;
  themeColor: string;
  onToggleExpand: () => void;
  onNavigateToEvent: () => void;
}

export function CircleNextEventCard({
  event,
  expanded,
  colors,
  isDark,
  themeColor,
  onToggleExpand,
  onNavigateToEvent,
}: CircleNextEventCardProps) {
  const eventDate = new Date(event.startTime);
  const now = new Date();
  const diffMs = eventDate.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  const diffHours = Math.floor(diffMs / 3_600_000);

  let relativeLabel = "";
  if (diffHours < 1) relativeLabel = "Starting soon";
  else if (diffHours < 24) relativeLabel = `In ${diffHours}h`;
  else if (diffDays === 1) relativeLabel = "Tomorrow";
  else relativeLabel = `In ${diffDays} days`;

  const dateStr = eventDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const timeStr = eventDate.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const accentColor = event.color || themeColor;

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 6,
        marginBottom: 10,
        borderRadius: expanded ? 16 : 12,
        borderWidth: 1.5,
        borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.34)",
        backgroundColor: isDark ? "rgba(20,20,24,0.62)" : "rgba(255,255,255,0.72)",
        overflow: "hidden",
      }}
    >
      {/* Summary row — always visible, toggles expand */}
      <Pressable
        onPress={onToggleExpand}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 9,
          backgroundColor: accentColor + "18",
        }}
      >
        <Calendar size={14} color={accentColor} />
        <Text
          numberOfLines={1}
          style={{ fontSize: 12, fontWeight: "700", color: accentColor, textTransform: "uppercase", letterSpacing: 0.5, marginLeft: 6, flex: 1 }}
        >
          Up Next {"\u00B7"} {relativeLabel}
        </Text>
        {expanded ? (
          <ChevronUp size={14} color={accentColor} />
        ) : (
          <ChevronDown size={14} color={accentColor} />
        )}
      </Pressable>

      {/* Expanded event tile — matches UPCOMING thread card style */}
      {expanded && (
        <Pressable onPress={onNavigateToEvent}>
          {/* Banner photo strip */}
          {event.eventPhotoUrl ? (
            <Image
              source={{ uri: event.eventPhotoUrl }}
              style={{ width: "100%", height: 72, backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" }}
              resizeMode="cover"
            />
          ) : null}
          <View style={{ paddingHorizontal: 18, paddingTop: event.eventPhotoUrl ? 10 : 16, paddingBottom: 18 }}>
            <Text
              numberOfLines={2}
              style={{ fontSize: 17, fontWeight: "700", color: colors.text }}
            >
              {event.emoji ? `${event.emoji} ` : ""}{event.title}
            </Text>
            {event.description ? (
              <Text numberOfLines={2} style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 18 }}>
                {event.description}
              </Text>
            ) : null}
            <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 6 }}>
              {dateStr} {"\u00B7"} {timeStr}
            </Text>
            {event.location ? (
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 }}>
                <MapPin size={12} color={colors.textTertiary} />
                <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textTertiary, flex: 1 }}>
                  {event.location}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      )}
    </View>
  );
}
