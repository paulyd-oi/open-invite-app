/**
 * AppHeader – SSOT header component for all main tab screens.
 *
 * Ensures consistent title typography, spacing, and layout across
 * Discover, Social (Open Invites), Friends, and Profile tabs.
 *
 * Variants:
 *   • standard  → single title row with optional subtitle
 *   • calendar  → same top title row + bottom slot for month controls
 */
import React, { useEffect, useRef } from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/lib/ThemeContext";
import { devLog } from "@/lib/devLog";

/* ── SSOT Header Tokens (single definition) ─────────────────────── */
const HEADER_PX = 20;       // paddingHorizontal
const HEADER_PT = 8;        // paddingTop
const HEADER_PB = 16;       // paddingBottom
const HEADER_MIN_H = 44;    // minHeight for title row

export interface AppHeaderProps {
  /** Screen title displayed in the header */
  title: string;
  /** Optional subtitle below the title */
  subtitle?: string;
  /** Content rendered to the left of the title (e.g. HelpSheet) */
  left?: React.ReactNode;
  /** Content rendered on the right side (e.g. Create button, icons) */
  right?: React.ReactNode;
  /** Header variant */
  variant?: "standard" | "calendar";
  /** Extra content below the title row (calendar month controls, etc.) */
  bottom?: React.ReactNode;
}

export function AppHeader({
  title,
  subtitle,
  left,
  right,
  variant = "standard",
  bottom,
}: AppHeaderProps) {
  const { colors } = useTheme();

  // DEV-only render proof log (once per mount)
  const logged = useRef(false);
  useEffect(() => {
    if (__DEV__ && !logged.current) {
      logged.current = true;
      devLog(`[P2_HEADER_SSOT] ${title} using AppHeader ${variant}`);
    }
  }, [title, variant]);

  return (
    <View
      style={{
        paddingHorizontal: HEADER_PX,
        paddingTop: HEADER_PT,
        paddingBottom: HEADER_PB,
      }}
    >
      {/* ── Title row ── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: HEADER_MIN_H,
        }}
      >
        {/* Left cluster: title + optional inline element (HelpSheet, etc.) */}
        <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 1 }}>
          <Text
            className="text-3xl font-sora-bold"
            style={{ color: colors.text }}
          >
            {title}
          </Text>
          {left}
        </View>

        {/* Right cluster */}
        {right ? (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {right}
          </View>
        ) : null}
      </View>

      {/* ── Subtitle ── */}
      {subtitle ? (
        <Text
          className="mt-1 font-sora"
          style={{ color: colors.textSecondary }}
        >
          {subtitle}
        </Text>
      ) : null}

      {/* ── Bottom slot (calendar variant, etc.) ── */}
      {bottom}
    </View>
  );
}
