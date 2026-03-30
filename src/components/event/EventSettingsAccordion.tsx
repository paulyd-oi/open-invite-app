import React from "react";
import { Pressable, View, Text, ActivityIndicator, Switch } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Settings, ChevronUp, ChevronDown, CalendarCheck, Calendar, RefreshCw, Bell, ChevronRight, NotebookPen } from "@/ui/icons";
import { Button } from "@/ui/Button";
import { EventReminderPicker } from "@/components/EventReminderPicker";

interface EventSettingsAccordionColors {
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
}

interface EventSettingsAccordionProps {
  expanded: boolean;
  isDark: boolean;
  themeColor: string;
  colors: EventSettingsAccordionColors;
  // Calendar sync
  isCheckingSync: boolean;
  isSynced: boolean;
  isSyncing: boolean;
  onSyncToCalendar: () => void;
  onOpenSyncModal: () => void;
  // Event reminders
  eventId: string;
  eventTitle: string;
  eventEmoji?: string | null;
  eventTime: Date;
  selectedReminders: number[];
  onRemindersChange: (reminders: number[]) => void;
  isAttending: boolean;
  // Mute
  isEventMuted: boolean;
  isLoadingMute: boolean;
  isMutePending: boolean;
  onToggleMute: (value: boolean) => void;
  // Reflection (host only)
  showReflectionToggle: boolean;
  reflectionEnabled: boolean;
  isReflectionPending: boolean;
  onToggleReflection: (value: boolean) => void;
  // Toggle accordion
  onToggleExpanded: () => void;
}

export function EventSettingsAccordion({
  expanded,
  isDark,
  themeColor,
  colors,
  isCheckingSync,
  isSynced,
  isSyncing,
  onSyncToCalendar,
  onOpenSyncModal,
  eventId,
  eventTitle,
  eventEmoji,
  eventTime,
  selectedReminders,
  onRemindersChange,
  isAttending,
  isEventMuted,
  isLoadingMute,
  isMutePending,
  onToggleMute,
  showReflectionToggle,
  reflectionEnabled,
  isReflectionPending,
  onToggleReflection,
  onToggleExpanded,
}: EventSettingsAccordionProps) {
  return (
    <Animated.View entering={FadeInDown.delay(140).springify()} style={{ marginHorizontal: 16, marginBottom: 12 }}>
      <View className="rounded-2xl" style={{ backgroundColor: isDark ? "rgba(20,20,24,0.62)" : "rgba(255,255,255,0.82)", borderRadius: 16, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.34)" }}>
        <Pressable
          onPress={onToggleExpanded}
          className="flex-row items-center justify-between p-4"
        >
          <View className="flex-row items-center">
            <Settings size={18} color={colors.textSecondary} />
            <Text className="ml-2 font-semibold text-sm" style={{ color: colors.text }}>
              Event settings
            </Text>
          </View>
          {expanded ? (
            <ChevronUp size={18} color={colors.textTertiary} />
          ) : (
            <ChevronDown size={18} color={colors.textTertiary} />
          )}
        </Pressable>

        {expanded && (
          <View className="px-4 pb-4">
            {/* Sync to Calendar Button / Synced Badge */}
            <View className="py-3 border-t" style={{ borderColor: colors.border }}>
              {isCheckingSync ? (
                <View className="flex-row items-center justify-center">
                  <ActivityIndicator size="small" color={colors.textTertiary} />
                </View>
              ) : isSynced ? (
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <View
                      className="w-8 h-8 rounded-full items-center justify-center mr-2"
                      style={{ backgroundColor: "#22C55E20" }}
                    >
                      <CalendarCheck size={16} color="#22C55E" />
                    </View>
                    <View>
                      <Text className="font-semibold text-sm" style={{ color: "#22C55E" }}>
                        Synced to Calendar
                      </Text>
                      <Text className="text-xs" style={{ color: colors.textTertiary }}>
                        Tap to update
                      </Text>
                    </View>
                  </View>
                  <Button
                    variant="secondary"
                    size="sm"
                    label="Update"
                    onPress={onSyncToCalendar}
                    disabled={isSyncing}
                    loading={isSyncing}
                    leftIcon={!isSyncing ? <RefreshCw size={14} color={themeColor} /> : undefined}
                  />
                </View>
              ) : (
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1">
                    <Calendar size={18} color={themeColor} />
                    <View className="ml-2">
                      <Text className="font-semibold text-sm" style={{ color: colors.text }}>
                        Sync to Calendar
                      </Text>
                      <Text className="text-xs" style={{ color: colors.textSecondary }}>
                        Add to your device calendar
                      </Text>
                    </View>
                  </View>
                  <Button
                    variant="primary"
                    size="sm"
                    label="Sync"
                    onPress={onSyncToCalendar}
                    disabled={isSyncing}
                    loading={isSyncing}
                  />
                </View>
              )}
            </View>

            {/* More Options Button - Opens modal for Google Calendar etc. */}
            <Pressable
              onPress={onOpenSyncModal}
              className="flex-row items-center justify-center py-2"
            >
              <Text className="text-xs" style={{ color: colors.textTertiary }}>
                More calendar options
              </Text>
              <ChevronRight size={14} color={colors.textTertiary} />
            </Pressable>

            {/* Event Reminders */}
            <EventReminderPicker
              eventId={eventId}
              eventTitle={eventTitle}
              eventEmoji={eventEmoji ?? ""}
              eventTime={eventTime}
              selectedReminders={selectedReminders}
              onRemindersChange={onRemindersChange}
              isAttending={isAttending}
              isMuted={isEventMuted}
            />

            {/* Mute Event Notifications */}
            <View className="py-3 border-t" style={{ borderColor: colors.border }}>
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center flex-1 mr-3">
                  <Bell size={18} color={isEventMuted ? colors.textTertiary : themeColor} />
                  <View className="ml-3">
                    <Text className="font-semibold text-sm" style={{ color: colors.text }}>
                      Mute this event
                    </Text>
                    <Text className="text-xs" style={{ color: colors.textSecondary }}>
                      Stops push notifications for this event.{"\n"}Activity will still show updates.
                    </Text>
                  </View>
                </View>
                <Switch
                  value={isEventMuted}
                  onValueChange={onToggleMute}
                  disabled={isLoadingMute || isMutePending}
                  trackColor={{ false: isDark ? "#3C3C3E" : "#E5E7EB", true: themeColor + "80" }}
                  thumbColor={isEventMuted ? themeColor : isDark ? "#6B6B6B" : "#f4f3f4"}
                />
              </View>
            </View>

            {/* Post-event reflection toggle (host only) */}
            {showReflectionToggle && (
              <View className="py-3 border-t" style={{ borderColor: colors.border }}>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1 mr-3">
                    <NotebookPen size={18} color={colors.textSecondary} />
                    <View className="ml-3">
                      <Text className="font-semibold text-sm" style={{ color: colors.text }}>
                        Post-event reflection
                      </Text>
                      <Text className="text-xs" style={{ color: colors.textTertiary }}>
                        Get a reminder to rate and reflect after it ends
                      </Text>
                    </View>
                  </View>
                  <Switch
                    testID="event-detail-settings-reflection"
                    value={reflectionEnabled}
                    onValueChange={onToggleReflection}
                    trackColor={{ false: isDark ? "#3C3C3E" : "#E5E7EB", true: themeColor + "80" }}
                    thumbColor={reflectionEnabled ? themeColor : isDark ? "#6B6B6B" : "#f4f3f4"}
                    disabled={isReflectionPending}
                  />
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  );
}
