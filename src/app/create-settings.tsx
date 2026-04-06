/**
 * create-settings — Full-screen modal page for event creation settings.
 *
 * Replaces the bottom sheet that caused freeze/hang on open and scroll.
 * Reads/writes the Zustand createSettingsStore directly.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Compass,
  Users,
  Bell,
  BellOff,
  Lock,
  X,
  ChevronLeft,
} from "@/ui/icons";
import { CirclePhotoEmoji } from "@/components/CirclePhotoEmoji";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useCreateSettingsStore } from "@/lib/createSettingsStore";
import type { Circle, GetCirclesResponse } from "@/shared/contracts";

export default function CreateSettingsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { themeColor, isDark, colors } = useTheme();
  const { data: session } = useSession();
  const { isCircleEvent: isCircleParam, themed: themedParam } = useLocalSearchParams<{
    isCircleEvent?: string;
    themed?: string;
  }>();

  const isCircleEvent = isCircleParam === "true";
  const themed = themedParam === "true";

  // Glass treatment (matches create.tsx)
  const glassSurface = themed
    ? (isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.70)")
    : colors.surface;
  const glassBorder = themed
    ? (isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.10)")
    : colors.border;
  const glassText = themed
    ? (isDark ? "#FFFFFF" : "rgba(0,0,0,0.85)")
    : colors.text;
  const glassSecondary = themed
    ? (isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.50)")
    : colors.textSecondary;
  const glassTertiary = themed
    ? (isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.36)")
    : colors.textTertiary;

  // Store state
  const store = useCreateSettingsStore();
  const {
    visibility, selectedGroupIds,
    sendNotification,
    hasCapacity, capacityInput,
    hasRsvpDeadline, rsvpDeadlineDate,
    costPerPerson,
    pitchInEnabled, pitchInAmount, pitchInMethod, pitchInHandle, pitchInNote,
    bringListEnabled, bringListItems, bringListInput,
    showGuestList, showGuestCount, showLocationPreRsvp, hideWebLocation,
  } = store;

  // Local toggle for cost per person (mirrors SettingsSheetContent behavior)
  const [hasCostPerPerson, setHasCostPerPerson] = useState(() => costPerPerson.length > 0);

  // Circles query (same pattern as create.tsx)
  const { data: circlesData } = useQuery({
    queryKey: ["circles", session?.user?.id],
    queryFn: () => api.get<GetCirclesResponse>("/api/circles"),
    enabled: !!session?.user?.id,
  });
  const circles = circlesData?.circles ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      {/* Header */}
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          hitSlop={12}
          style={{ flexDirection: "row", alignItems: "center" }}
        >
          <ChevronLeft size={22} color={themeColor} />
          <Text style={{ color: themeColor, fontSize: 16, fontWeight: "500", marginLeft: 2 }}>Back</Text>
        </Pressable>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: "600" }}>Settings</Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          hitSlop={12}
        >
          <Text style={{ color: themeColor, fontSize: 16, fontWeight: "600" }}>Done</Text>
        </Pressable>
      </View>

      {/* Content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 16 }}
        keyboardShouldPersistTaps="handled"
      >
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
                  onPress={() => { Haptics.selectionAsync(); store.set({ visibility: "all_friends" }); }}
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
                  onPress={() => { Haptics.selectionAsync(); store.set({ visibility: "specific_groups" }); }}
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
                        onPress={() => router.push("/friends")}
                        style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: themeColor }}
                      >
                        <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "600" }}>Go to Friends</Text>
                      </Pressable>
                    </View>
                  ) : (
                    circles.map((circle: Circle) => (
                      <Pressable
                        key={circle.id}
                        onPress={() => store.toggleGroup(circle.id)}
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
                onPress={() => { Haptics.selectionAsync(); store.set({ sendNotification: true }); }}
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
                onPress={() => { Haptics.selectionAsync(); store.set({ sendNotification: false }); }}
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

        {/* ── Capacity ── */}
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: glassText, fontSize: 13, fontWeight: "500" }}>Limit number of guests</Text>
              <Text style={{ color: glassTertiary, fontSize: 11, marginTop: 2 }}>Once full, RSVPs close automatically.</Text>
            </View>
            <Switch
              value={hasCapacity}
              onValueChange={(value) => {
                Haptics.selectionAsync();
                store.set({ hasCapacity: value, ...(!value ? { capacityInput: "" } : capacityInput ? {} : { capacityInput: "6" }) });
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
                    if (current > 2) store.set({ capacityInput: String(current - 1) });
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
                    if (current < 100) store.set({ capacityInput: String(current + 1) });
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
              <Text style={{ color: glassText, fontSize: 13, fontWeight: "500" }}>RSVP Deadline</Text>
              <Text style={{ color: glassTertiary, fontSize: 11, marginTop: 2 }}>RSVPs close after this date.</Text>
            </View>
            <Switch
              value={hasRsvpDeadline}
              onValueChange={(value) => {
                Haptics.selectionAsync();
                store.set({ hasRsvpDeadline: value, ...(value && !rsvpDeadlineDate ? { rsvpDeadlineDate: new Date() } : {}) });
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
                  if (selectedDate) store.set({ rsvpDeadlineDate: selectedDate });
                }}
                themeVariant={isDark ? "dark" : "light"}
              />
            </View>
          )}
        </View>

        {/* ── Cost Per Person ── */}
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: glassText, fontSize: 13, fontWeight: "500" }}>Cost Per Person</Text>
              <Text style={{ color: glassTertiary, fontSize: 11, marginTop: 2 }}>Shown on the event page for guests to see.</Text>
            </View>
            <Switch
              value={hasCostPerPerson}
              onValueChange={(value) => {
                Haptics.selectionAsync();
                setHasCostPerPerson(value);
                if (!value) store.set({ costPerPerson: "" });
              }}
              trackColor={{ false: themed ? "rgba(255,255,255,0.15)" : colors.separator, true: `${themeColor}80` }}
              thumbColor={hasCostPerPerson ? themeColor : glassTertiary}
            />
          </View>
          {hasCostPerPerson && (
            <View style={{ borderRadius: 12, padding: 10, backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
              <TextInput
                value={costPerPerson}
                onChangeText={(v) => store.set({ costPerPerson: v })}
                placeholder="e.g. $20, Free, BYOB"
                placeholderTextColor={glassTertiary}
                style={{ fontSize: 14, color: glassText }}
                maxLength={100}
                autoFocus
              />
            </View>
          )}
        </View>

        {/* ── Pitch In ── */}
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: glassText, fontSize: 13, fontWeight: "500" }}>Pitch In</Text>
              <Text style={{ color: glassTertiary, fontSize: 11, marginTop: 2 }}>Let guests chip in for costs.</Text>
            </View>
            <Switch
              value={pitchInEnabled}
              onValueChange={(value) => {
                Haptics.selectionAsync();
                store.set({
                  pitchInEnabled: value,
                  ...(!value ? { pitchInHandle: "", pitchInAmount: "", pitchInNote: "" } : {}),
                });
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
                  onChangeText={(v) => store.set({ pitchInAmount: v })}
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
                    onPress={() => { Haptics.selectionAsync(); store.set({ pitchInMethod: key }); }}
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
                  onChangeText={(v) => store.set({ pitchInHandle: v })}
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
                    onPress={() => { Haptics.selectionAsync(); store.set({ pitchInNote: preset }); }}
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
                  onChangeText={(v) => store.set({ pitchInNote: v })}
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
              <Text style={{ color: glassText, fontSize: 13, fontWeight: "500" }}>What to bring</Text>
              <Text style={{ color: glassTertiary, fontSize: 11, marginTop: 2 }}>Guests can claim items to bring.</Text>
            </View>
            <Switch
              value={bringListEnabled}
              onValueChange={(value) => {
                Haptics.selectionAsync();
                store.set({
                  bringListEnabled: value,
                  ...(!value ? { bringListItems: [], bringListInput: "" } : {}),
                });
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
                    onChangeText={(v) => store.set({ bringListInput: v })}
                    placeholder="e.g. Chips, Ice, Cups..."
                    placeholderTextColor={glassTertiary}
                    style={{ fontSize: 14, color: glassText }}
                    maxLength={60}
                    onSubmitEditing={() => {
                      const trimmed = bringListInput.trim();
                      if (trimmed && bringListItems.length < 20) {
                        store.set({ bringListItems: [...bringListItems, trimmed], bringListInput: "" });
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
                      store.set({ bringListItems: [...bringListItems, trimmed], bringListInput: "" });
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
                          store.set({ bringListItems: bringListItems.filter((_, i) => i !== index) });
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
              onValueChange={(value) => { Haptics.selectionAsync(); store.set({ showGuestList: value }); }}
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
              onValueChange={(value) => { Haptics.selectionAsync(); store.set({ showGuestCount: value }); }}
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
              onValueChange={(value) => { Haptics.selectionAsync(); store.set({ showLocationPreRsvp: value }); }}
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
              onValueChange={(value) => { Haptics.selectionAsync(); store.set({ hideWebLocation: value }); }}
              trackColor={{ false: themed ? "rgba(255,255,255,0.15)" : colors.separator, true: `${themeColor}80` }}
              thumbColor={hideWebLocation ? themeColor : glassTertiary}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
