import React from "react";
import { Pressable, View, Text, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import * as Haptics from "expo-haptics";
import { UserCheck, X, AlertTriangle, Users, RefreshCw, UserPlus } from "@/ui/icons";
import { RADIUS } from "@/ui/layout";
import { UserListRow } from "@/components/UserListRow";
import BottomSheet from "@/components/BottomSheet";
import { devLog } from "@/lib/devLog";
import { once } from "@/lib/runtimeInvariants";
import type { GuestRsvpItem } from "@/shared/contracts";

interface Attendee {
  id: string;
  name: string | null;
  imageUrl?: string | null;
  isHost?: boolean;
}

interface AttendeesSheetColors {
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
}

interface AttendeesSheetProps {
  visible: boolean;
  isLoading: boolean;
  hasError: boolean;
  isPrivacyDenied: boolean;
  attendees: Attendee[];
  guestGoingList: GuestRsvpItem[];
  effectiveGoingCount: number;
  hostUserId: string | undefined;
  isDark: boolean;
  themeColor: string;
  colors: AttendeesSheetColors;
  onClose: () => void;
  onRetry: () => void;
  onPressAttendee: (userId: string) => void;
}

export function AttendeesSheet({
  visible,
  isLoading,
  hasError,
  isPrivacyDenied,
  attendees,
  guestGoingList,
  effectiveGoingCount,
  hostUserId,
  isDark,
  themeColor,
  colors,
  onClose,
  onRetry,
  onPressAttendee,
}: AttendeesSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightPct={0.65}
      backdropOpacity={0.5}
    >
      {/* Custom title row — uses effectiveGoingCount (SSOT) */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <UserCheck size={20} color="#22C55E" />
          <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text, marginLeft: 8 }}>
            Who's Coming
          </Text>
          <View style={{ backgroundColor: "#DCFCE7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.md, marginLeft: 8 }}>
            <Text style={{ color: "#166534", fontSize: 12, fontWeight: "700" }}>
              {effectiveGoingCount}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={onClose}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Attendees List - P0: guarded for loading / empty / list */}
      <KeyboardAwareScrollView
        style={{ flex: 1, paddingHorizontal: 20 }}
        contentContainerStyle={{ paddingBottom: 36 }}
      >
        {isLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <ActivityIndicator size="large" color={themeColor} />
            <Text style={{ marginTop: 12, fontSize: 14, color: colors.textSecondary }}>Loading attendees…</Text>
          </View>
        ) : hasError && !isPrivacyDenied && attendees.length === 0 && guestGoingList.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 32 }}>
            <AlertTriangle size={32} color={colors.textTertiary} />
            <Text style={{ marginTop: 12, fontSize: 15, fontWeight: "600", color: colors.text, textAlign: "center" }}>
              Couldn't load guest list
            </Text>
            <Text style={{ marginTop: 4, fontSize: 13, color: colors.textSecondary, textAlign: "center" }}>
              Something went wrong — tap to try again
            </Text>
            <Pressable
              onPress={onRetry}
              style={{
                marginTop: 16,
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: themeColor,
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 20,
                gap: 6,
              }}
            >
              <RefreshCw size={14} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>Retry</Text>
            </Pressable>
          </View>
        ) : attendees.length === 0 && guestGoingList.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 32 }}>
            <Users size={32} color={colors.textTertiary} />
            <Text style={{ marginTop: 12, fontSize: 14, color: colors.textSecondary, textAlign: "center" }}>
              No attendees yet
            </Text>
          </View>
        ) : (
          <>
            {__DEV__ && attendees.length > 0 && once('P0_USERROW_SHEET_SOT_event') && void devLog('[P0_USERROW_SHEET_SOT]', { screen: 'event_attendees_sheet', showChevron: false, usesPressedState: true, rowsSampled: attendees.length })}
            {attendees.map((attendee) => (
              <View
                key={attendee.id}
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <UserListRow
                  handle={null}
                  displayName={attendee.name ?? "Guest"}
                  bio={null}
                  avatarUri={attendee.imageUrl}
                  badgeText={(attendee.isHost || attendee.id === hostUserId) ? "Host" : null}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onPressAttendee(attendee.id);
                  }}
                />
              </View>
            ))}

            {/* Guest RSVPs section */}
            {guestGoingList.length > 0 && (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 20, marginBottom: 8 }}>
                  <UserPlus size={16} color="#6B7280" />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.textSecondary, marginLeft: 8 }}>
                    Guests
                  </Text>
                </View>
                {guestGoingList.map((guest) => (
                  <View
                    key={guest.id}
                    style={{
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <UserListRow
                      handle={null}
                      displayName={guest.name}
                      bio={null}
                      avatarUri={null}
                      badgeText="Web guest"
                      onPress={() => {}}
                    />
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </KeyboardAwareScrollView>
    </BottomSheet>
  );
}
