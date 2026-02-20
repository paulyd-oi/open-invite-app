/**
 * BottomSheet – shared primitive for all bottom-sheet modals.
 *
 * Contract:
 *   visible        – controls Modal visibility
 *   onClose        – called on backdrop press (if enabled) and system back
 *   title?         – optional centered/left title string
 *   heightPct?     – fraction of screen height (default 0.65), pass 0 for auto-height
 *   maxHeightPct?  – ceiling cap (default 0.85); height never exceeds this
 *   backdropOpacity? – 0 = transparent, 0.5 = dim  (default 0)
 *   enableBackdropClose? – tap-to-dismiss backdrop (default true)
 *   keyboardMode?  – "none" (default) or "padding" (wraps in KAV)
 *   headerRight?   – ReactNode rendered right of the title row
 *   children       – sheet content (rendered inside a flex:1 container)
 *
 * Internals: Modal transparent + Pressable backdrop + Animated.View
 *   borderTopLeft/RightRadius 24, FadeInDown 200ms, safe-area bottom.
 */
import React from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  type ViewStyle,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/ThemeContext";
import { devLog } from "@/lib/devLog";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Fraction of window height, 0-1. Default 0.65. Pass 0 for auto-height. */
  heightPct?: number;
  /** Ceiling cap as fraction of screen height. Default 0.85. */
  maxHeightPct?: number;
  /** Backdrop dim amount 0-1. Default 0 (transparent). */
  backdropOpacity?: number;
  /** Allow tapping backdrop to dismiss. Default true. */
  enableBackdropClose?: boolean;
  /** Keyboard avoidance mode. Default "none". */
  keyboardMode?: "none" | "padding";
  /** ReactNode rendered to the right of the title row. */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BottomSheet({
  visible,
  onClose,
  title,
  heightPct = 0.65,
  maxHeightPct = 0.85,
  backdropOpacity = 0,
  enableBackdropClose = true,
  keyboardMode = "none",
  headerRight,
  children,
}: BottomSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (__DEV__ && visible) {
    devLog("[P0_SHEET_PRIMITIVE] open", { title: title ?? "(no title)", heightPct, maxHeightPct, backdropOpacity });
  }

  const screenH = Dimensions.get("window").height;
  const maxH = Math.round(screenH * maxHeightPct);
  const sheetHeight = heightPct > 0 ? Math.min(Math.round(screenH * heightPct), maxH) : undefined;

  const backdropBg: ViewStyle["backgroundColor"] =
    backdropOpacity > 0 ? `rgba(0,0,0,${backdropOpacity})` : "transparent";

  const backdrop = (
    <Pressable
      style={{ flex: 1, justifyContent: "flex-end", backgroundColor: backdropBg }}
      onPress={enableBackdropClose ? onClose : undefined}
    >
      {/* Prevent inner taps from closing */}
      <Pressable onPress={(e) => e.stopPropagation()}>
        <Animated.View
            entering={FadeInDown.duration(200)}
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              ...(sheetHeight ? { height: sheetHeight } : { maxHeight: maxH }),
              paddingBottom: Math.max(insets.bottom, 20),
              overflow: "hidden",
            }}
          >
            {/* Handle */}
            <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 8 }}>
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.textTertiary,
                  opacity: 0.4,
                }}
              />
            </View>

            {/* Optional title row */}
            {(title || headerRight) && (
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingBottom: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>
                  {title ?? ""}
                </Text>
                {headerRight}
              </View>
            )}

            {/* Content – flex:1 ensures scroll children fill remaining space (fixed height only) */}
            <View style={sheetHeight ? { flex: 1 } : undefined}>
              {children}
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {keyboardMode === "padding" ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          {backdrop}
        </KeyboardAvoidingView>
      ) : (
        backdrop
      )}
    </Modal>
  );
}
