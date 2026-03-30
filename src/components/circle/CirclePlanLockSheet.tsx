import React from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Switch,
} from "react-native";
import BottomSheet from "@/components/BottomSheet";
import { Button } from "@/ui/Button";
import { RADIUS } from "@/ui/layout";

interface CirclePlanLockSheetProps {
  visible: boolean;
  isLocked: boolean;
  draftNote: string;
  isHost: boolean;
  isPending: boolean;
  colors: { text: string; textSecondary: string; textTertiary: string };
  isDark: boolean;
  themeColor: string;
  onClose: () => void;
  onDraftNoteChange: (text: string) => void;
  onToggleLock: (val: boolean) => void;
  onSave: () => void;
  onUnlock: () => void;
}

export function CirclePlanLockSheet({
  visible,
  isLocked,
  draftNote,
  isHost,
  isPending,
  colors,
  isDark,
  themeColor,
  onClose,
  onDraftNoteChange,
  onToggleLock,
  onSave,
  onUnlock,
}: CirclePlanLockSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightPct={0}
      maxHeightPct={0.5}
      backdropOpacity={0.5}
      keyboardMode="padding"
      title="Plan Lock"
    >
      <View style={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}>
        {/* Toggle */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>
            {isLocked ? "\uD83D\uDD12 Locked" : "\uD83D\uDD13 Unlocked"}
          </Text>
          <Switch
            value={isLocked}
            onValueChange={onToggleLock}
            trackColor={{ false: isDark ? "#3A3A3C" : "#E5E7EB", true: themeColor }}
          />
        </View>

        {/* Note editor */}
        <View>
          <Text style={{ fontSize: 13, fontWeight: "500", color: colors.textSecondary, marginBottom: 6 }}>
            Note (optional)
          </Text>
          <TextInput
            value={draftNote}
            onChangeText={(t) => onDraftNoteChange(t.slice(0, 120))}
            placeholder="e.g. Dinner at 7pm confirmed"
            placeholderTextColor={colors.textTertiary}
            maxLength={120}
            multiline
            style={{
              color: colors.text,
              fontSize: 14,
              backgroundColor: isDark ? "#1c1c1e" : "#f3f4f6",
              borderRadius: 10,
              padding: 12,
              minHeight: 48,
              maxHeight: 100,
              textAlignVertical: "top",
            }}
          />
          <Text style={{ fontSize: 11, color: colors.textTertiary, textAlign: "right", marginTop: 4 }}>
            {draftNote.length}/120
          </Text>
        </View>

        {/* Save */}
        <Button
          variant="primary"
          label={isPending ? "Saving\u2026" : "Save"}
          onPress={onSave}
          disabled={isPending}
          loading={isPending}
          style={{ borderRadius: RADIUS.md }}
        />

        {/* Host-only unlock */}
        {isHost && isLocked && (
          <Pressable
            onPress={onUnlock}
            style={{
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: "center",
              borderWidth: 1,
              borderColor: isDark ? "rgba(255,59,48,0.4)" : "rgba(255,59,48,0.3)",
              backgroundColor: isDark ? "rgba(255,59,48,0.08)" : "rgba(255,59,48,0.06)",
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: "#FF3B30" }}>
              Unlock plan
            </Text>
          </Pressable>
        )}
      </View>
    </BottomSheet>
  );
}
