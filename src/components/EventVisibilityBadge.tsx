/**
 * EventVisibilityBadge
 *
 * Small inline badge that communicates an event's visibility level.
 * Renders nothing for "all_friends" (the default / public visibility)
 * so it only appears for restricted events.
 *
 * Visibility resolution priority:
 *   1. event.visibility  (authoritative string from backend)
 *   2. event.circleId    (fallback: if present → circle_only)
 *   3. event.isBusy      (fallback: busy blocks are effectively private)
 *
 * Surfaces: SocialFeedCard, CalendarEventListItem, FeedCalendarEventListItem,
 *           EventDetailHeader, CircleDayDetail.
 */

import React, { useRef } from "react";
import { View, Text } from "react-native";
import { Lock, UsersRound, Users } from "@/ui/icons";
import { devLog } from "@/lib/devLog";

// ---------- types ----------

export type ResolvedVisibility = "all_friends" | "specific_groups" | "circle_only" | "private";

interface EventVisibilityBadgeProps {
  /** Raw visibility string from the event, may be undefined. */
  visibility?: string | null;
  /** If present, implies circle_only when visibility is not set. */
  circleId?: string | null;
  /** Busy-block events are private to the owner. */
  isBusy?: boolean;
  /** Circle name for richer label (e.g. "Running Club"). */
  circleName?: string | null;
  /** Identifier used in DEV proof logs. */
  eventId?: string;
  /** Surface name used in DEV proof logs. */
  surface?: string;
  /** Dark-mode flag — adjusts badge colours. */
  isDark?: boolean;
}

// ---------- resolution helper ----------

export function resolveVisibility(
  visibility?: string | null,
  circleId?: string | null,
  isBusy?: boolean,
): ResolvedVisibility {
  if (visibility === "private" || isBusy) return "private";
  if (visibility === "circle_only" || (!visibility && circleId)) return "circle_only";
  if (visibility === "specific_groups") return "specific_groups";
  return "all_friends";
}

// ---------- badge config ----------

const BADGE_CONFIG: Record<
  Exclude<ResolvedVisibility, "all_friends">,
  {
    label: string;
    Icon: React.ComponentType<{ size?: number; color?: string }>;
    bgLight: string;
    bgDark: string;
    fgLight: string;
    fgDark: string;
  }
> = {
  circle_only: {
    label: "Circle",
    Icon: UsersRound,
    bgLight: "#E0E7FF",
    bgDark: "rgba(99,102,241,0.2)",
    fgLight: "#4338CA",
    fgDark: "#A5B4FC",
  },
  specific_groups: {
    label: "Groups",
    Icon: Users,
    bgLight: "#FEF3C7",
    bgDark: "rgba(245,158,11,0.2)",
    fgLight: "#B45309",
    fgDark: "#FCD34D",
  },
  private: {
    label: "Private",
    Icon: Lock,
    bgLight: "#FEE2E2",
    bgDark: "rgba(239,68,68,0.15)",
    fgLight: "#B91C1C",
    fgDark: "#FCA5A5",
  },
};

// ---------- component ----------

export function EventVisibilityBadge({
  visibility,
  circleId,
  isBusy,
  circleName,
  eventId,
  surface,
  isDark = false,
}: EventVisibilityBadgeProps) {
  const resolved = resolveVisibility(visibility, circleId, isBusy);

  // DEV proof log — emit once per mount to avoid spam
  const loggedRef = useRef(false);
  if (__DEV__ && !loggedRef.current && eventId) {
    loggedRef.current = true;
    devLog(`[P1_PRIVACY_BADGE] surface=${surface ?? "unknown"} eventId=${eventId} visibility=${resolved}`);
  }

  // Don't render badge for default public events
  if (resolved === "all_friends") return null;

  const config = BADGE_CONFIG[resolved];
  const { Icon } = config;
  const bg = isDark ? config.bgDark : config.bgLight;
  const fg = isDark ? config.fgDark : config.fgLight;

  // Use circleName if available and visibility is circle_only
  const label = resolved === "circle_only" && circleName ? circleName : config.label;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        backgroundColor: bg,
        marginLeft: 6,
        alignSelf: "center",
      }}
    >
      <Icon size={10} color={fg} />
      <Text
        style={{
          fontSize: 10,
          fontWeight: "600",
          color: fg,
          marginLeft: 3,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}
