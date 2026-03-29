import React from "react";
import { Modal, Pressable, View, Text, TextInput } from "react-native";
import * as Haptics from "expo-haptics";
import { Button } from "@/ui/Button";
import { RADIUS } from "@/ui/layout";

type ReportReason = "spam" | "inappropriate" | "safety" | "other";

interface ReportModalColors {
  background: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  surface: string;
  border: string;
}

interface ReportModalProps {
  visible: boolean;
  selectedReportReason: ReportReason | null;
  reportDetails: string;
  isSubmittingReport: boolean;
  themeColor: string;
  colors: ReportModalColors;
  onClose: () => void;
  onSelectReason: (reason: ReportReason) => void;
  onChangeDetails: (text: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  inappropriate: "Inappropriate Content",
  safety: "Safety Concern",
  other: "Other",
};

export function ReportModal({
  visible,
  selectedReportReason,
  reportDetails,
  isSubmittingReport,
  themeColor,
  colors,
  onClose,
  onSelectReason,
  onChangeDetails,
  onSubmit,
  onCancel,
}: ReportModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onPress={onClose}
      >
        <Pressable
          className="rounded-t-3xl p-6 pb-10"
          style={{ backgroundColor: colors.background }}
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="text-xl font-bold mb-2" style={{ color: colors.text }}>
            Report Event
          </Text>
          <Text className="text-sm mb-4" style={{ color: colors.textSecondary }}>
            Select a reason for your report
          </Text>

          {(["spam", "inappropriate", "safety", "other"] as const).map((reason) => {
            const isSelected = selectedReportReason === reason;
            return (
              <Pressable
                key={reason}
                className="flex-row items-center py-3 px-4 rounded-xl mb-2"
                style={{
                  backgroundColor: isSelected ? themeColor + "20" : colors.surface,
                  borderWidth: isSelected ? 2 : 1,
                  borderColor: isSelected ? themeColor : colors.border,
                }}
                onPress={() => {
                  Haptics.selectionAsync();
                  onSelectReason(reason);
                }}
              >
                <View
                  className="w-5 h-5 rounded-full border-2 mr-3 items-center justify-center"
                  style={{ borderColor: isSelected ? themeColor : colors.border }}
                >
                  {isSelected && (
                    <View
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: themeColor }}
                    />
                  )}
                </View>
                <Text style={{ color: colors.text }}>{REASON_LABELS[reason]}</Text>
              </Pressable>
            );
          })}

          {selectedReportReason === "other" && (
            <TextInput
              className="rounded-xl p-4 mt-2"
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.text,
                minHeight: 80,
                textAlignVertical: "top",
              }}
              placeholder="Please describe the issue..."
              placeholderTextColor={colors.textTertiary}
              multiline
              value={reportDetails}
              onChangeText={onChangeDetails}
            />
          )}

          <View className="flex-row mt-4 gap-3">
            <Pressable
              className="flex-1 py-4 rounded-xl items-center"
              style={{ backgroundColor: colors.surface }}
              onPress={onCancel}
            >
              <Text className="text-base font-medium" style={{ color: colors.textSecondary }}>
                Cancel
              </Text>
            </Pressable>

            <Button
              variant="primary"
              label={isSubmittingReport ? "Submitting..." : "Submit Report"}
              onPress={onSubmit}
              disabled={!selectedReportReason || isSubmittingReport}
              loading={isSubmittingReport}
              style={{ flex: 1, borderRadius: RADIUS.md }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
