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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/ThemeContext";
import { devLog } from "@/lib/devLog";

/* ── SSOT Header Tokens (single definition) ─────────────────────── */
const HEADER_PX = 20;       // paddingHorizontal
const HEADER_PT = 8;        // paddingTop (below safe-area, provided by parent)
const HEADER_PB = 16;       // paddingBottom
const HEADER_MIN_H = 44;    // minHeight for title row
/** SSOT title font size (reduced from 30 → 28 for visual balance on long titles) */
export const HEADER_TITLE_SIZE = 28;
/** Minimum width reserved for the right slot so title doesn't shift across tabs */
const RIGHT_SLOT_MIN_W = 48;

export interface AppHeaderProps {
  /** Screen title displayed in the header */
  title: string;
  /** Optional custom title content (overrides default Text rendering of title) */
  titleContent?: React.ReactNode;
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
  /** When true, AppHeader applies safe-area top inset itself (default false — parent handles it) */
  includeSafeAreaTop?: boolean;
}

export function AppHeader({
  title,
  titleContent,
  subtitle,
  left,
  right,
  variant = "standard",
  bottom,
  includeSafeAreaTop = false,
}: AppHeaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const effectivePaddingTop = includeSafeAreaTop ? insets.top + HEADER_PT : HEADER_PT;

  // DEV-only render proof logs (once per mount)
  const logged = useRef(false);
  useEffect(() => {
    if (__DEV__ && !logged.current) {
      logged.current = true;
      devLog(`[P2_HEADER_SSOT] ${title} using AppHeader ${variant}`);
      devLog(`[P2_HEADER_SAFEAREA] ${title} insetTop=${insets.top} paddingTop=${effectivePaddingTop}`);
      devLog(`[P2_HEADER_SAFEAREA_MODE] ${title} includeSafeAreaTop=${includeSafeAreaTop} insetTop=${insets.top} effectivePaddingTop=${effectivePaddingTop}`);
      devLog(`[P2_HEADER_RIGHTSLOT] ${title} rightSlotMinWidth=${RIGHT_SLOT_MIN_W}`);
      devLog(`[P2_HEADER_TYPE_SCALE] AppHeader title font scaled to ${HEADER_TITLE_SIZE}`);
    }
  }, [title, variant, insets.top, includeSafeAreaTop, effectivePaddingTop]);

  return (
    <View
      style={{
        paddingHorizontal: HEADER_PX,
        paddingTop: effectivePaddingTop,
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
        <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 1, overflow: "hidden" }}>
          {titleContent ?? (
            <Text
              className="font-sora-bold"
              style={{ color: colors.text, fontSize: HEADER_TITLE_SIZE }}
            >
              {title}
            </Text>
          )}
          {left}
        </View>

        {/* Right cluster — stable minWidth prevents title shift across tabs */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", minWidth: RIGHT_SLOT_MIN_W }}>
          {right}
        </View>
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
