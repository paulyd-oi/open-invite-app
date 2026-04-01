import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Platform,
  InteractionManager,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  RefreshCw,
  ChevronDown,
  Check,
  Compass,
  Users,
  Bell,
  BellOff,
  Lock,
  X,
} from "@/ui/icons";
import { CirclePhotoEmoji } from "@/components/CirclePhotoEmoji";
import * as Haptics from "expo-haptics";
import type { Circle } from "@/shared/contracts";

const FREQUENCY_OPTIONS = [
  { value: "once", label: "One Time", icon: "📆" },
  { value: "weekly", label: "Weekly", icon: "🔄" },
  { value: "monthly", label: "Monthly", icon: "📅" },
];

interface SettingsSheetContentProps {
  // Style props
  themed: boolean;
  glassSurface: string;
  glassBorder: string;
  glassText: string;
  glassSecondary: string;
  glassTertiary: string;
  themeColor: string;
  isDark: boolean;
  colors: { background: string; separator: string; text: string; textSecondary: string; textTertiary: string; border: string; surface: string };

  // Frequency
  frequency: "once" | "weekly" | "monthly";
  showFrequencyPicker: boolean;
  startDate: Date;
  isCircleEvent: boolean;
  onFrequencyChange: (f: "once" | "weekly" | "monthly") => void;
  onToggleFrequencyPicker: () => void;

  // Visibility
  visibility: "all_friends" | "specific_groups" | "circle_only";
  onSetVisibility: (v: "all_friends" | "specific_groups" | "circle_only") => void;
  circles: Circle[];
  selectedGroupIds: string[];
  onToggleGroup: (id: string) => void;

  // Notification
  sendNotification: boolean;
  onSetSendNotification: (v: boolean) => void;

  // Capacity
  hasCapacity: boolean;
  onSetHasCapacity: (v: boolean) => void;
  capacityInput: string;
  onSetCapacityInput: (v: string) => void;

  // RSVP Deadline
  hasRsvpDeadline: boolean;
  onSetHasRsvpDeadline: (v: boolean) => void;
  rsvpDeadlineDate: Date;
  onSetRsvpDeadlineDate: (v: Date) => void;

  // Cost Per Person
  costPerPerson: string;
  onSetCostPerPerson: (v: string) => void;

  // Pitch In
  pitchInEnabled: boolean;
  onSetPitchInEnabled: (v: boolean) => void;
  pitchInAmount: string;
  onSetPitchInAmount: (v: string) => void;
  pitchInMethod: "venmo" | "cashapp" | "paypal" | "other";
  onSetPitchInMethod: (v: "venmo" | "cashapp" | "paypal" | "other") => void;
  pitchInHandle: string;
  onSetPitchInHandle: (v: string) => void;
  pitchInNote: string;
  onSetPitchInNote: (v: string) => void;

  // What to Bring
  bringListEnabled: boolean;
  onSetBringListEnabled: (v: boolean) => void;
  bringListItems: string[];
  onSetBringListItems: (v: string[] | ((prev: string[]) => string[])) => void;
  bringListInput: string;
  onSetBringListInput: (v: string) => void;

  // Privacy & Display
  showGuestList: boolean;
  onSetShowGuestList: (v: boolean) => void;
  showGuestCount: boolean;
  onSetShowGuestCount: (v: boolean) => void;
  showLocationPreRsvp: boolean;
  onSetShowLocationPreRsvp: (v: boolean) => void;
  hideWebLocation: boolean;
  onSetHideWebLocation: (v: boolean) => void;

  // Nudge
  showNudgeBanner: boolean;
  onNudgeUpgrade: () => void;
  onNudgeDismiss: () => void;

  // Entitlements timeout
  entitlementsTimedOut: boolean;
  entitlementsLoading: boolean;
  hostingQuotaLoading: boolean;
  onRetryEntitlements: () => void;
}

export function SettingsSheetContent(props: SettingsSheetContentProps) {
  const {
    themed, glassSurface, glassBorder, glassText, glassSecondary, glassTertiary,
    themeColor, isDark, colors,
    frequency, showFrequencyPicker, startDate, isCircleEvent,
    onFrequencyChange, onToggleFrequencyPicker,
    visibility, onSetVisibility, circles, selectedGroupIds, onToggleGroup,
    sendNotification, onSetSendNotification,
    hasCapacity, onSetHasCapacity, capacityInput, onSetCapacityInput,
    hasRsvpDeadline, onSetHasRsvpDeadline, rsvpDeadlineDate, onSetRsvpDeadlineDate,
    costPerPerson, onSetCostPerPerson,
    pitchInEnabled, onSetPitchInEnabled, pitchInAmount, onSetPitchInAmount,
    pitchInMethod, onSetPitchInMethod, pitchInHandle, onSetPitchInHandle,
    pitchInNote, onSetPitchInNote,
    bringListEnabled, onSetBringListEnabled, bringListItems, onSetBringListItems,
    bringListInput, onSetBringListInput,
    showGuestList, onSetShowGuestList, showGuestCount, onSetShowGuestCount,
    showLocationPreRsvp, onSetShowLocationPreRsvp, hideWebLocation, onSetHideWebLocation,
    showNudgeBanner, onNudgeUpgrade, onNudgeDismiss,
    entitlementsTimedOut, entitlementsLoading, hostingQuotaLoading, onRetryEntitlements,
  } = props;

  const router = require("expo-router").useRouter();

  // Defer heavy below-fold sections until after the sheet open animation settles.
  // This eliminates the 5-7s freeze caused by mounting all sections in one frame.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => handle.cancel();
  }, []);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Frequency ── */}
      {!isCircleEvent && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: glassSecondary, fontSize: 13, fontWeight: "500", marginBottom: 6 }}>Frequency</Text>
          <Pressable
            onPress={onToggleFrequencyPicker}
            style={{
              borderRadius: 12,
              padding: 14,
              backgroundColor: glassSurface,
              borderWidth: 1,
              borderColor: glassBorder,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <RefreshCw size={18} color={themeColor} />
                <Text style={{ color: glassText, marginLeft: 10, fontWeight: "500" }}>
                  {FREQUENCY_OPTIONS.find((f) => f.value === frequency)?.label}
                </Text>
              </View>
              <ChevronDown size={20} color={glassTertiary} />
            </View>
          </Pressable>

          {showFrequencyPicker && (
            <View style={{ borderRadius: 12, padding: 8, marginTop: 8, backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
              {FREQUENCY_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onFrequencyChange(option.value as "once" | "weekly" | "monthly");
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 10,
                    borderRadius: 8,
                    marginBottom: 2,
                    backgroundColor: frequency === option.value ? `${themeColor}15` : "transparent",
                  }}
                >
                  <Text style={{ fontSize: 18, marginRight: 10 }}>{option.icon}</Text>
                  <Text style={{ flex: 1, fontWeight: "500", color: frequency === option.value ? themeColor : glassText }}>
                    {option.label}
                  </Text>
                  {frequency === option.value && <Check size={20} color={themeColor} />}
                </Pressable>
              ))}
            </View>
          )}

          {frequency !== "once" && (
            <View style={{ borderRadius: 12, padding: 10, marginTop: 8, flexDirection: "row", alignItems: "center", backgroundColor: `${themeColor}15` }}>
              <RefreshCw size={16} color={themeColor} />
              <Text style={{ color: themeColor, marginLeft: 8, fontSize: 13 }}>
                Repeats {frequency} starting{" "}
                {startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Visibility ── */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ color: glassSecondary, fontSize: 13, fontWeight: "500", marginBottom: 6 }}>Who's Invited?</Text>

        {isCircleEvent ? (
          <View style={{ borderRadius: 12, padding: 10, flexDirection: "row", alignItems: "center", backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
            <Lock size={16} color={glassSecondary} />
            <Text style={{ fontSize: 13, marginLeft: 8, color: glassSecondary }}>
              Only friends in this group can see and join.
            </Text>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: "row", marginBottom: 8 }}>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); onSetVisibility("all_friends"); }}
                style={{
                  flex: 1, borderRadius: 12, padding: 14, marginRight: 8, flexDirection: "row", alignItems: "center", justifyContent: "center",
                  backgroundColor: visibility === "all_friends" ? `${themeColor}15` : glassSurface,
                  borderWidth: 1,
                  borderColor: visibility === "all_friends" ? `${themeColor}40` : glassBorder,
                }}
              >
                <Compass size={18} color={visibility === "all_friends" ? themeColor : glassTertiary} />
                <Text style={{ marginLeft: 8, fontWeight: "500", color: visibility === "all_friends" ? themeColor : glassSecondary }}>All Friends</Text>
              </Pressable>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); onSetVisibility("specific_groups"); }}
                style={{
                  flex: 1, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "center",
                  backgroundColor: visibility === "specific_groups" ? "#4ECDC415" : glassSurface,
                  borderWidth: 1,
                  borderColor: visibility === "specific_groups" ? "#4ECDC440" : glassBorder,
                }}
              >
                <Users size={18} color={visibility === "specific_groups" ? "#4ECDC4" : glassTertiary} />
                <Text style={{ marginLeft: 8, fontWeight: "500", color: visibility === "specific_groups" ? "#4ECDC4" : glassSecondary }}>Circles</Text>
              </Pressable>
            </View>

            {visibility === "specific_groups" && (
              <View style={{ borderRadius: 12, padding: 14, backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
                <Text style={{ color: glassText, fontSize: 13, fontWeight: "500", marginBottom: 10 }}>Select Circles</Text>
                {circles.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 14 }}>
                    <Text style={{ color: glassTertiary, textAlign: "center", marginBottom: 10 }}>No circles yet.</Text>
                    <Pressable
                      onPress={() => router.push("/friends" as any)}
                      style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: themeColor }}
                    >
                      <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "600" }}>Go to Friends</Text>
                    </Pressable>
                  </View>
                ) : (
                  circles.map((circle: Circle) => (
                    <Pressable
                      key={circle.id}
                      onPress={() => onToggleGroup(circle.id)}
                      style={{
                        flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 8, marginBottom: 6,
                        backgroundColor: selectedGroupIds.includes(circle.id) ? `${themeColor}15` : (isDark ? "#2C2C2E" : "#F9FAFB"),
                      }}
                    >
                      <View style={{ width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 10, overflow: "hidden", backgroundColor: `${themeColor}20` }}>
                        <CirclePhotoEmoji photoUrl={circle.photoUrl} emoji={circle.emoji} emojiClassName="text-base" />
                      </View>
                      <Text style={{ color: glassText, flex: 1, fontWeight: "500" }}>{circle.name}</Text>
                      {selectedGroupIds.includes(circle.id) && <Check size={20} color={themeColor} />}
                    </Pressable>
                  ))
                )}
              </View>
            )}
          </>
        )}
      </View>

      {/* ── Send Notification ── */}
      {!isCircleEvent && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: glassSecondary, fontSize: 13, fontWeight: "500", marginBottom: 6 }}>Send Notification</Text>
          <View style={{ flexDirection: "row", marginBottom: 6 }}>
            <Pressable
              onPress={() => { Haptics.selectionAsync(); onSetSendNotification(true); }}
              style={{
                flex: 1, borderRadius: 12, padding: 14, marginRight: 8, flexDirection: "row", alignItems: "center", justifyContent: "center",
                backgroundColor: sendNotification ? `${themeColor}15` : glassSurface,
                borderWidth: 1,
                borderColor: sendNotification ? `${themeColor}40` : glassBorder,
              }}
            >
              <Bell size={18} color={sendNotification ? themeColor : glassTertiary} />
              <Text style={{ marginLeft: 8, fontWeight: "500", color: sendNotification ? themeColor : glassSecondary }}>Yes</Text>
            </Pressable>
            <Pressable
              onPress={() => { Haptics.selectionAsync(); onSetSendNotification(false); }}
              style={{
                flex: 1, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "center",
                backgroundColor: !sendNotification ? `${glassTertiary}15` : glassSurface,
                borderWidth: 1,
                borderColor: !sendNotification ? `${glassTertiary}40` : glassBorder,
              }}
            >
              <BellOff size={18} color={!sendNotification ? glassSecondary : glassTertiary} />
              <Text style={{ marginLeft: 8, fontWeight: "500", color: !sendNotification ? glassSecondary : glassTertiary }}>No</Text>
            </Pressable>
          </View>
          <Text style={{ color: glassTertiary, fontSize: 11, marginLeft: 2 }}>
            {sendNotification
              ? visibility === "specific_groups"
                ? "Friends in selected groups will be notified"
                : "All friends will be notified about this event"
              : "No notifications will be sent"}
          </Text>
        </View>
      )}

      {/* Below-fold sections — deferred until after sheet open animation */}
      {ready && (<>

      {/* ── Capacity ── */}
      <View style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: glassSecondary, fontSize: 13, fontWeight: "500" }}>Limit number of guests</Text>
            <Text style={{ color: glassTertiary, fontSize: 11, marginTop: 2 }}>Once full, RSVPs close automatically.</Text>
          </View>
          <Switch
            value={hasCapacity}
            onValueChange={(value) => {
              Haptics.selectionAsync();
              onSetHasCapacity(value);
              if (!value) onSetCapacityInput("");
              else if (!capacityInput) onSetCapacityInput("6");
            }}
            trackColor={{ false: themed ? "rgba(255,255,255,0.15)" : colors.separator, true: `${themeColor}80` }}
            thumbColor={hasCapacity ? themeColor : glassTertiary}
          />
        </View>
        {hasCapacity && (
          <View style={{ borderRadius: 12, padding: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
            <Text style={{ color: glassSecondary, fontSize: 13 }}>Max guests</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  const current = parseInt(capacityInput) || 2;
                  if (current > 2) onSetCapacityInput(String(current - 1));
                }}
                style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: themed ? "rgba(255,255,255,0.08)" : colors.background }}
              >
                <Text style={{ color: parseInt(capacityInput || "2") <= 2 ? glassTertiary : glassText, fontSize: 18, fontWeight: "500" }}>−</Text>
              </Pressable>
              <Text style={{ color: glassText, fontSize: 17, fontWeight: "600", marginHorizontal: 14, minWidth: 28, textAlign: "center" }}>
                {capacityInput || "2"}
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  const current = parseInt(capacityInput) || 2;
                  if (current < 100) onSetCapacityInput(String(current + 1));
                }}
                style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: themed ? "rgba(255,255,255,0.08)" : colors.background }}
              >
                <Text style={{ color: parseInt(capacityInput || "2") >= 100 ? glassTertiary : themeColor, fontSize: 18, fontWeight: "500" }}>+</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* ── RSVP Deadline ── */}
      <View style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: glassSecondary, fontSize: 13, fontWeight: "500" }}>RSVP Deadline</Text>
            <Text style={{ color: glassTertiary, fontSize: 11, marginTop: 2 }}>RSVPs close after this date.</Text>
          </View>
          <Switch
            value={hasRsvpDeadline}
            onValueChange={(value) => {
              Haptics.selectionAsync();
              onSetHasRsvpDeadline(value);
              if (value && !rsvpDeadlineDate) {
                // Default to event start minus 1 day
                onSetRsvpDeadlineDate(new Date());
              }
            }}
            trackColor={{ false: themed ? "rgba(255,255,255,0.15)" : colors.separator, true: `${themeColor}80` }}
            thumbColor={hasRsvpDeadline ? themeColor : glassTertiary}
          />
        </View>
        {hasRsvpDeadline && (
          <View style={{ borderRadius: 12, padding: 10, backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
            <DateTimePicker
              value={rsvpDeadlineDate}
              mode="datetime"
              display={Platform.OS === "ios" ? "compact" : "default"}
              minimumDate={new Date()}
              onChange={(_, selectedDate) => {
                if (selectedDate) onSetRsvpDeadlineDate(selectedDate);
              }}
              themeVariant={isDark ? "dark" : "light"}
            />
          </View>
        )}
      </View>

      {/* ── Cost Per Person ── */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ color: glassSecondary, fontSize: 13, fontWeight: "500", marginBottom: 6 }}>Cost Per Person</Text>
        <View style={{ borderRadius: 12, padding: 10, backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
          <TextInput
            value={costPerPerson}
            onChangeText={onSetCostPerPerson}
            placeholder="e.g. $20, Free, BYOB"
            placeholderTextColor={glassTertiary}
            style={{ fontSize: 14, color: glassText }}
            maxLength={100}
          />
        </View>
        <Text style={{ color: glassTertiary, fontSize: 11, marginTop: 4, marginLeft: 2 }}>
          Shown on the event page for guests to see.
        </Text>
      </View>

      {/* ── Pitch In ── */}
      <View style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: glassSecondary, fontSize: 13, fontWeight: "500" }}>Pitch In</Text>
            <Text style={{ color: glassTertiary, fontSize: 11, marginTop: 2 }}>Let guests chip in for costs.</Text>
          </View>
          <Switch
            value={pitchInEnabled}
            onValueChange={(value) => {
              Haptics.selectionAsync();
              onSetPitchInEnabled(value);
              if (!value) {
                onSetPitchInHandle("");
                onSetPitchInAmount("");
                onSetPitchInNote("");
              }
            }}
            trackColor={{ false: themed ? "rgba(255,255,255,0.15)" : colors.separator, true: `${themeColor}80` }}
            thumbColor={pitchInEnabled ? themeColor : glassTertiary}
          />
        </View>

        {pitchInEnabled && (
          <View>
            <View style={{ borderRadius: 12, padding: 10, marginBottom: 8, backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
              <TextInput
                value={pitchInAmount}
                onChangeText={onSetPitchInAmount}
                placeholder="Suggested amount (e.g. $10)"
                placeholderTextColor={glassTertiary}
                style={{ fontSize: 14, color: glassText }}
                keyboardType="default"
              />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 8 }} contentContainerStyle={{ gap: 6 }}>
              {([
                { key: "venmo" as const, label: "Venmo" },
                { key: "cashapp" as const, label: "Cash App" },
                { key: "paypal" as const, label: "PayPal" },
                { key: "other" as const, label: "Other" },
              ]).map(({ key, label }) => (
                <Pressable
                  key={key}
                  onPress={() => { Haptics.selectionAsync(); onSetPitchInMethod(key); }}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                    backgroundColor: pitchInMethod === key ? `${themeColor}18` : glassSurface,
                    borderWidth: 1,
                    borderColor: pitchInMethod === key ? themeColor : glassBorder,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: pitchInMethod === key ? "600" : "400", color: pitchInMethod === key ? themeColor : glassSecondary }}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={{ borderRadius: 12, padding: 10, marginBottom: 8, flexDirection: "row", alignItems: "center", backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
              {(pitchInMethod === "venmo" || pitchInMethod === "cashapp") && (
                <Text style={{ fontSize: 14, color: glassTertiary, marginRight: 2 }}>@</Text>
              )}
              <TextInput
                value={pitchInHandle}
                onChangeText={onSetPitchInHandle}
                placeholder={pitchInMethod === "venmo" ? "username" : pitchInMethod === "cashapp" ? "cashtag" : pitchInMethod === "paypal" ? "PayPal email or username" : "Handle or username"}
                placeholderTextColor={glassTertiary}
                style={{ fontSize: 14, color: glassText, flex: 1 }}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 8 }} contentContainerStyle={{ gap: 6 }}>
              {[
                "Help cover snacks and drinks",
                "Help cover venue costs",
                "Help cover supplies",
                "Help support the event",
                "Totally optional, but appreciated",
              ].map((preset) => (
                <Pressable
                  key={preset}
                  onPress={() => { Haptics.selectionAsync(); onSetPitchInNote(preset); }}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
                    backgroundColor: pitchInNote === preset ? `${themeColor}18` : glassSurface,
                    borderWidth: 1,
                    borderColor: pitchInNote === preset ? themeColor : glassBorder,
                  }}
                >
                  <Text style={{ fontSize: 12, color: pitchInNote === preset ? themeColor : glassSecondary }}>{preset}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={{ borderRadius: 12, padding: 10, backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
              <TextInput
                value={pitchInNote}
                onChangeText={onSetPitchInNote}
                placeholder="Note (e.g. for food & drinks)"
                placeholderTextColor={glassTertiary}
                style={{ fontSize: 14, color: glassText }}
                maxLength={100}
              />
            </View>
          </View>
        )}
      </View>

      {/* ── What to Bring ── */}
      <View style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: glassSecondary, fontSize: 13, fontWeight: "500" }}>What to bring</Text>
            <Text style={{ color: glassTertiary, fontSize: 11, marginTop: 2 }}>Guests can claim items to bring.</Text>
          </View>
          <Switch
            value={bringListEnabled}
            onValueChange={(value) => {
              Haptics.selectionAsync();
              onSetBringListEnabled(value);
              if (!value) {
                onSetBringListItems([]);
                onSetBringListInput("");
              }
            }}
            trackColor={{ false: themed ? "rgba(255,255,255,0.15)" : colors.separator, true: `${themeColor}80` }}
            thumbColor={bringListEnabled ? themeColor : glassTertiary}
          />
        </View>

        {bringListEnabled && (
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <View style={{ flex: 1, borderRadius: 12, padding: 10, backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
                <TextInput
                  value={bringListInput}
                  onChangeText={onSetBringListInput}
                  placeholder="e.g. Chips, Ice, Cups..."
                  placeholderTextColor={glassTertiary}
                  style={{ fontSize: 14, color: glassText }}
                  maxLength={60}
                  onSubmitEditing={() => {
                    const trimmed = bringListInput.trim();
                    if (trimmed && bringListItems.length < 20) {
                      onSetBringListItems((prev: string[]) => [...prev, trimmed]);
                      onSetBringListInput("");
                    }
                  }}
                  returnKeyType="done"
                />
              </View>
              <Pressable
                onPress={() => {
                  const trimmed = bringListInput.trim();
                  if (trimmed && bringListItems.length < 20) {
                    Haptics.selectionAsync();
                    onSetBringListItems((prev: string[]) => [...prev, trimmed]);
                    onSetBringListInput("");
                  }
                }}
                style={{
                  width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center",
                  backgroundColor: bringListInput.trim() ? themeColor : glassSurface,
                  borderWidth: 1,
                  borderColor: bringListInput.trim() ? themeColor : glassBorder,
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: "500", color: bringListInput.trim() ? "white" : glassTertiary }}>+</Text>
              </Pressable>
            </View>

            {bringListItems.length > 0 && (
              <View style={{ gap: 6 }}>
                {bringListItems.map((item, index) => (
                  <View
                    key={`${item}-${index}`}
                    style={{
                      flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8,
                      backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder,
                    }}
                  >
                    <Text style={{ fontSize: 14, color: glassText, flex: 1 }}>{item}</Text>
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        onSetBringListItems((prev: string[]) => prev.filter((_: string, i: number) => i !== index));
                      }}
                      hitSlop={8}
                    >
                      <X size={16} color={glassTertiary} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── Privacy & Display ── */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ color: glassSecondary, fontSize: 13, fontWeight: "500", marginBottom: 10 }}>Privacy & Display</Text>

        {/* Show Guest List */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ color: glassText, fontSize: 14, fontWeight: "500" }}>Show Guest List</Text>
            <Text style={{ color: glassTertiary, fontSize: 11, marginTop: 2 }}>Let guests see who else is coming</Text>
          </View>
          <Switch
            value={showGuestList}
            onValueChange={(value) => { Haptics.selectionAsync(); onSetShowGuestList(value); }}
            trackColor={{ false: themed ? "rgba(255,255,255,0.15)" : colors.separator, true: `${themeColor}80` }}
            thumbColor={showGuestList ? themeColor : glassTertiary}
          />
        </View>

        {/* Show Guest Count */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ color: glassText, fontSize: 14, fontWeight: "500" }}>Show Guest Count</Text>
            <Text style={{ color: glassTertiary, fontSize: 11, marginTop: 2 }}>Show how many people are going</Text>
          </View>
          <Switch
            value={showGuestCount}
            onValueChange={(value) => { Haptics.selectionAsync(); onSetShowGuestCount(value); }}
            trackColor={{ false: themed ? "rgba(255,255,255,0.15)" : colors.separator, true: `${themeColor}80` }}
            thumbColor={showGuestCount ? themeColor : glassTertiary}
          />
        </View>

        {/* Show Full Address Before RSVP */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, opacity: hideWebLocation ? 0.4 : 1 }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ color: glassText, fontSize: 14, fontWeight: "500" }}>Show Full Address Before RSVP</Text>
            <Text style={{ color: glassTertiary, fontSize: 11, marginTop: 2 }}>
              {hideWebLocation ? "Location is already hidden on web" : "Show the full event address on the web page before guests RSVP"}
            </Text>
          </View>
          <Switch
            value={showLocationPreRsvp}
            disabled={hideWebLocation}
            onValueChange={(value) => { Haptics.selectionAsync(); onSetShowLocationPreRsvp(value); }}
            trackColor={{ false: themed ? "rgba(255,255,255,0.15)" : colors.separator, true: `${themeColor}80` }}
            thumbColor={showLocationPreRsvp && !hideWebLocation ? themeColor : glassTertiary}
          />
        </View>

        {/* Hide Location on Web */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ color: glassText, fontSize: 14, fontWeight: "500" }}>Hide Location on Web</Text>
            <Text style={{ color: glassTertiary, fontSize: 11, marginTop: 2 }}>Completely hide the location on the shared web page</Text>
          </View>
          <Switch
            value={hideWebLocation}
            onValueChange={(value) => { Haptics.selectionAsync(); onSetHideWebLocation(value); }}
            trackColor={{ false: themed ? "rgba(255,255,255,0.15)" : colors.separator, true: `${themeColor}80` }}
            thumbColor={hideWebLocation ? themeColor : glassTertiary}
          />
        </View>
      </View>

      {/* ── Nudge banner ── */}
      {showNudgeBanner && (
        <View
          style={{
            backgroundColor: isDark ? "#2C2C2E" : "#FFF7ED",
            borderRadius: 12, padding: 14, marginBottom: 16,
            borderWidth: 1, borderColor: isDark ? "#3A3A3C" : "#FDBA74",
          }}
        >
          <Text style={{ color: glassText, fontWeight: "600", fontSize: 14, marginBottom: 4 }}>
            Make your event stand out
          </Text>
          <Text style={{ color: glassSecondary, fontSize: 13, lineHeight: 18, marginBottom: 10 }}>
            Unlock premium themes, effects, and seasonal collections with Pro.
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={onNudgeUpgrade}
              style={{ backgroundColor: themeColor, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 13 }}>Upgrade</Text>
            </Pressable>
            <Pressable onPress={onNudgeDismiss} style={{ borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 }}>
              <Text style={{ color: glassTertiary, fontSize: 13 }}>Not now</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Entitlements timeout ── */}
      {entitlementsTimedOut && (entitlementsLoading || hostingQuotaLoading) && (
        <View style={{ borderRadius: 12, padding: 10, backgroundColor: isDark ? "#332B00" : "#FFFBEB", borderColor: "#F59E0B40", borderWidth: 1 }}>
          <Text style={{ fontSize: 11, textAlign: "center", marginBottom: 6, color: isDark ? "#FCD34D" : "#92400E" }}>
            Still loading your plan details...
          </Text>
          <Pressable
            onPress={onRetryEntitlements}
            style={{ alignSelf: "center", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: "#F59E0B20" }}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#F59E0B" }}>Retry</Text>
          </Pressable>
        </View>
      )}

      </>)}
    </ScrollView>
  );
}
