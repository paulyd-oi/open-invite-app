import React from "react";
import { View, Text, Pressable } from "react-native";
import { BlurView } from "expo-blur";
import Animated, { FadeInRight, FadeInLeft, FadeOutLeft, FadeOutRight } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { EdgeInsets } from "react-native-safe-area-context";

import { AppHeader, HEADER_TITLE_SIZE } from "@/components/AppHeader";
import { HelpSheet, HELP_SHEETS } from "@/components/HelpSheet";
import { Button } from "@/ui/Button";
import { ChevronLeft, ChevronRight, List, LayoutGrid, Layers, AlignJustify } from "@/ui/icons";
import { DARK_COLORS } from "@/lib/ThemeContext";

export type ViewMode = "compact" | "stacked" | "details" | "list";

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Calendar view modes (pinch-to-zoom compatible)
export const CALENDAR_VIEW_MODES: { id: ViewMode; label: string; icon: typeof List }[] = [
  { id: "compact", label: "Compact", icon: LayoutGrid },
  { id: "stacked", label: "Stacked", icon: Layers },
  { id: "details", label: "Details", icon: AlignJustify },
];

interface CalendarHeaderChromeProps {
  currentMonth: number;
  currentYear: number;
  viewMode: ViewMode;
  isListView: boolean;
  themeColor: string;
  colors: typeof DARK_COLORS;
  isDark: boolean;
  calendarInsets: EdgeInsets;
  chromeHeight: number;
  monthNavDirRef: React.MutableRefObject<string>;
  session: any;
  onGoToPrevMonth: () => void;
  onGoToNextMonth: () => void;
  onSetViewMode: (mode: ViewMode) => void;
  onSetListView: () => void;
  onCreateEvent: () => void;
  onChromeLayout: (height: number) => void;
}

export function CalendarHeaderChrome({
  currentMonth,
  currentYear,
  viewMode,
  isListView,
  themeColor,
  colors,
  isDark,
  calendarInsets,
  chromeHeight,
  monthNavDirRef,
  session,
  onGoToPrevMonth,
  onGoToNextMonth,
  onSetViewMode,
  onSetListView,
  onCreateEvent,
  onChromeLayout,
}: CalendarHeaderChromeProps) {
  return (
    <View
      style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        onChromeLayout(h);
      }}
      pointerEvents="box-none"
    >
      <BlurView
        intensity={88}
        tint={isDark ? "dark" : "light"}
        style={{ paddingTop: calendarInsets.top, overflow: "hidden" }}
      >
        <View style={{ borderBottomWidth: 0.5, borderBottomColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }}>
          <AppHeader
            title={`${MONTHS[currentMonth]} ${currentYear}`}
            variant="calendar"
            titleContent={
              <Animated.View
                key={`${currentYear}-${currentMonth}`}
                entering={
                  monthNavDirRef.current === "next"
                    ? FadeInRight.duration(240).withInitialValues({ transform: [{ translateX: 10 }] })
                    : FadeInLeft.duration(240).withInitialValues({ transform: [{ translateX: -10 }] })
                }
                exiting={
                  monthNavDirRef.current === "next"
                    ? FadeOutLeft.duration(180).withInitialValues({ transform: [{ translateX: 0 }] })
                    : FadeOutRight.duration(180).withInitialValues({ transform: [{ translateX: 0 }] })
                }
                className="flex-row items-center"
              >
                {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                <Text className="font-sora-bold" style={{ color: themeColor, fontSize: HEADER_TITLE_SIZE }}>
                  {MONTHS[currentMonth]}
                </Text>
                {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                <Text className="font-sora-bold ml-2" style={{ color: colors.text, fontSize: HEADER_TITLE_SIZE }}>
                  {currentYear}
                </Text>
              </Animated.View>
            }
            left={<HelpSheet screenKey="calendar" config={HELP_SHEETS.calendar} />}
            right={
              <Button
                testID="calendar-create-event"
                variant="primary"
                size="sm"
                label="Create"
                onPress={onCreateEvent}
              />
            }
            bottom={
              <View className="flex-row items-center justify-between mt-3">
                <Pressable onPress={onGoToPrevMonth} className="flex-row items-center p-2">
                  <ChevronLeft size={20} color={themeColor} />
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text className="font-bold ml-1" style={{ color: themeColor, fontSize: 15 }}>
                    {MONTHS[(currentMonth - 1 + 12) % 12].slice(0, 3)}
                  </Text>
                </Pressable>

                {/* View Mode Selector - Calendar modes + separate List button */}
                <View className="flex-row items-center">
                  {/* Calendar view modes (pinch-to-zoom) */}
                  <View
                    className="flex-row rounded-full p-1"
                    /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                    style={{ backgroundColor: colors.segmentBg }}
                  >
                    {/* INVARIANT_ALLOW_SMALL_MAP */}
                    {CALENDAR_VIEW_MODES.map((mode) => {
                      const Icon = mode.icon;
                      const isActive = !isListView && viewMode === mode.id;
                      return (
                        <Pressable
                          key={mode.id}
                          /* INVARIANT_ALLOW_INLINE_HANDLER */
                          onPress={() => {
                            onSetViewMode(mode.id);
                          }}
                          className="px-3 py-1.5 rounded-full"
                          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                          style={{
                            backgroundColor: isActive ? colors.segmentActive : "transparent",
                          }}
                        >
                          <Icon size={16} color={isActive ? themeColor : colors.textTertiary} />
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* List view - separate button */}
                  <Pressable
                    onPress={onSetListView}
                    className="w-8 h-8 rounded-full items-center justify-center ml-2"
                    /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                    style={{
                      backgroundColor: isListView
                        ? colors.segmentActive
                        : colors.segmentBg,
                    }}
                  >
                    <List size={16} color={isListView ? themeColor : colors.textTertiary} />
                  </Pressable>
                </View>

                <Pressable onPress={onGoToNextMonth} className="flex-row items-center p-2">
                  {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                  <Text className="font-bold mr-1" style={{ color: themeColor, fontSize: 15 }}>
                    {MONTHS[(currentMonth + 1) % 12].slice(0, 3)}
                  </Text>
                  <ChevronRight size={20} color={themeColor} />
                </Pressable>
              </View>
            }
          />
        </View>
      </BlurView>
    </View>
  );
}
