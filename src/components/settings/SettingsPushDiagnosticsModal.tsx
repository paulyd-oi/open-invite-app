import React from "react";
import { View, Text, Modal, Pressable, ScrollView } from "react-native";
import { X } from "@/ui/icons";
import { Button } from "@/ui/Button";

export type PushDiagResult = {
  ok: boolean;
  reason: string;
  startedAt?: string;
  completedAt?: string;
  platform?: string;
  isPhysicalDevice?: boolean;
  permission?: string;
  permissionRequest?: string;
  projectId?: string;
  projectIdSource?: string;
  tokenPrefix?: string;
  tokenLength?: number;
  tokenError?: string;
  isValidToken?: boolean;
  registerUrl?: string;
  postStatus?: number | string;
  postBody?: unknown;
  postError?: string;
  getStatus?: number | string;
  getBody?: unknown;
  backendActiveCount?: number;
  backendTokens?: Array<{ tokenPrefix?: string; isActive?: boolean }>;
  lastRegistrationTime?: string;
  exceptionMessage?: string;
  exceptionStack?: string;
} | null;

function DiagRow({ label, value, good, colors }: { label: string; value: string; good?: boolean; colors: any }) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <Text className="text-sm" style={{ color: colors.textSecondary }}>{label}:</Text>
      <Text
        className="text-sm font-mono"
        style={{ color: good === undefined ? colors.text : good ? "#10B981" : "#EF4444" }}
      >
        {value}
      </Text>
    </View>
  );
}

interface SettingsPushDiagnosticsModalProps {
  visible: boolean;
  pushDiagResult: PushDiagResult;
  pushDiagReport: string;
  isPushDiagRunning: boolean;
  isClearingTokens: boolean;
  colors: { text: string; textSecondary: string; textTertiary: string; separator: string; surface: string; background: string };
  isDark: boolean;
  onClose: () => void;
  onRunDiagnostics: () => void;
  onClearTokens: () => void;
  onCopyReport: () => void;
}

export function SettingsPushDiagnosticsModal({
  visible,
  pushDiagResult,
  pushDiagReport,
  isPushDiagRunning,
  isClearingTokens,
  colors,
  isDark,
  onClose,
  onRunDiagnostics,
  onClearTokens,
  onCopyReport,
}: SettingsPushDiagnosticsModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <View
          className="rounded-t-3xl p-6 pb-10"
          style={{ backgroundColor: colors.surface, maxHeight: "85%" }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xl font-bold" style={{ color: colors.text }}>
              Push Diagnostics
            </Text>
            <Pressable
              onPress={onClose}
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.separator }}
            >
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
            {/* Action Buttons */}
            <View className="flex-row gap-3 mb-4">
              <Pressable
                onPress={onRunDiagnostics}
                disabled={isPushDiagRunning}
                className="flex-1 rounded-xl py-3 items-center"
                style={{ backgroundColor: isPushDiagRunning ? colors.separator : "#10B981" }}
              >
                <Text className="font-semibold" style={{ color: isPushDiagRunning ? colors.textSecondary : "#FFFFFF" }}>
                  {isPushDiagRunning ? "Running..." : "🚀 Register Now"}
                </Text>
              </Pressable>
              <Button
                variant="destructive"
                label="🗑️ Clear Tokens"
                onPress={onClearTokens}
                loading={isClearingTokens}
                style={{ flex: 1, borderRadius: 12, paddingVertical: 12 }}
              />
            </View>

            {/* Copy Report Button - shown when we have results */}
            {pushDiagResult && (
              <Pressable
                onPress={onCopyReport}
                className="rounded-xl py-3 items-center mb-4"
                style={{ backgroundColor: colors.separator }}
              >
                <Text className="font-semibold" style={{ color: colors.text }}>
                  📋 Copy JSON Report
                </Text>
              </Pressable>
            )}

            {/* No Results Yet State */}
            {!pushDiagResult && !isPushDiagRunning && (
              <View
                className="rounded-xl p-4 mb-4"
                style={{ backgroundColor: colors.separator }}
              >
                <Text className="text-center" style={{ color: colors.textSecondary }}>
                  No results yet. Tap "Register Now" to run diagnostics.
                </Text>
              </View>
            )}

            {/* Running State */}
            {isPushDiagRunning && (
              <View
                className="rounded-xl p-4 mb-4"
                style={{ backgroundColor: colors.separator }}
              >
                <Text className="text-center" style={{ color: colors.textSecondary }}>
                  Running diagnostics...
                </Text>
              </View>
            )}

            {/* Results Panel */}
            {pushDiagResult && (
              <View
                className="rounded-xl p-4 mb-4"
                style={{ backgroundColor: pushDiagResult.ok ? "#10B98120" : "#EF444420" }}
              >
                {/* Status */}
                <View className="flex-row items-center mb-3">
                  <Text className="text-2xl mr-2">{pushDiagResult.ok ? "✅" : "❌"}</Text>
                  <Text className="text-lg font-bold" style={{ color: pushDiagResult.ok ? "#10B981" : "#EF4444" }}>
                    {pushDiagResult.ok ? "Registration Successful" : `Failed`}
                  </Text>
                </View>

                {/* Failure reason (if any) */}
                {!pushDiagResult.ok && (
                  <View className="mb-3 p-2 rounded-lg" style={{ backgroundColor: "#EF444410" }}>
                    <Text className="text-sm font-mono" style={{ color: "#EF4444" }}>
                      {pushDiagResult.reason}
                    </Text>
                  </View>
                )}

                {/* Exception details (if any) */}
                {pushDiagResult.exceptionMessage && (
                  <View className="mb-3 p-2 rounded-lg" style={{ backgroundColor: "#EF444410" }}>
                    <Text className="text-xs font-semibold mb-1" style={{ color: "#EF4444" }}>Exception:</Text>
                    <Text className="text-xs font-mono" style={{ color: "#EF4444" }}>
                      {pushDiagResult.exceptionMessage}
                    </Text>
                  </View>
                )}

                {/* Diagnostic Details */}
                <View className="gap-y-1">
                  <DiagRow label="Started" value={pushDiagResult.startedAt ?? "N/A"} colors={colors} />
                  <DiagRow label="Platform" value={pushDiagResult.platform ?? "N/A"} colors={colors} />
                  <DiagRow label="Physical Device" value={pushDiagResult.isPhysicalDevice ? "Yes ✓" : "No (simulator)"} good={pushDiagResult.isPhysicalDevice} colors={colors} />
                  <DiagRow label="Permission" value={pushDiagResult.permission ?? "N/A"} good={pushDiagResult.permission === "granted"} colors={colors} />
                  <DiagRow label="Project ID" value={(pushDiagResult.projectId ?? "NOT_FOUND").substring(0, 20) + "..."} good={!!pushDiagResult.projectId && pushDiagResult.projectId !== "NOT_FOUND" && pushDiagResult.projectId !== "projectId_missing"} colors={colors} />
                  <DiagRow label="ProjectID Source" value={pushDiagResult.projectIdSource ?? "N/A"} good={!!pushDiagResult.projectIdSource && pushDiagResult.projectIdSource !== "not_found"} colors={colors} />
                  <DiagRow label="Token Prefix" value={pushDiagResult.tokenPrefix ?? "N/A"} good={!!pushDiagResult.tokenPrefix && !pushDiagResult.tokenPrefix.includes("test")} colors={colors} />
                  <DiagRow label="Token Length" value={String(pushDiagResult.tokenLength ?? 0)} good={(pushDiagResult.tokenLength ?? 0) >= 30} colors={colors} />
                  {pushDiagResult.tokenError && <DiagRow label="Token Error" value={pushDiagResult.tokenError.substring(0, 50)} good={false} colors={colors} />}
                  <DiagRow label="Valid Token" value={pushDiagResult.isValidToken ? "Yes ✓" : "No"} good={pushDiagResult.isValidToken} colors={colors} />
                  <DiagRow label="Register URL" value={pushDiagResult.registerUrl ?? "/api/push/register"} colors={colors} />
                  <DiagRow label="POST Status" value={String(pushDiagResult.postStatus ?? "N/A")} good={pushDiagResult.postStatus === 200} colors={colors} />
                  {pushDiagResult.postError && <DiagRow label="POST Error" value={pushDiagResult.postError.substring(0, 50)} good={false} colors={colors} />}
                  <DiagRow label="GET Status" value={String(pushDiagResult.getStatus ?? "N/A")} good={pushDiagResult.getStatus === 200} colors={colors} />
                  <DiagRow label="Active Tokens" value={String(pushDiagResult.backendActiveCount ?? 0)} good={(pushDiagResult.backendActiveCount ?? 0) > 0} colors={colors} />
                  <DiagRow label="Last Registration" value={pushDiagResult.lastRegistrationTime ?? "Never"} good={!!pushDiagResult.lastRegistrationTime} colors={colors} />
                </View>

                {/* Backend Tokens List */}
                {pushDiagResult.backendTokens && pushDiagResult.backendTokens.length > 0 && (
                  <View className="mt-4 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
                    <Text className="font-semibold mb-2" style={{ color: colors.text }}>
                      Backend Tokens ({pushDiagResult.backendTokens.length}):
                    </Text>
                    {pushDiagResult.backendTokens.map((t, i) => (
                      <View key={i} className="flex-row items-center py-1">
                        <Text className="text-xs font-mono flex-1" style={{ color: colors.textSecondary }}>
                          {t.tokenPrefix ?? "?"}
                        </Text>
                        <Text
                          className="text-xs font-semibold px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: t.isActive ? "#10B98120" : "#EF444420",
                            color: t.isActive ? "#10B981" : "#EF4444"
                          }}
                        >
                          {t.isActive ? "ACTIVE" : "INACTIVE"}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* POST/GET Bodies (collapsed by default) */}
                {pushDiagResult.postBody ? (
                  <View className="mt-4 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
                    <View className="mb-2">
                      <Text className="text-xs font-semibold mb-1" style={{ color: colors.textSecondary }}>POST Response:</Text>
                      <Text className="text-xs font-mono" style={{ color: colors.textTertiary }}>
                        {JSON.stringify(pushDiagResult.postBody, null, 2).substring(0, 200)}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            )}

            {/* Instructions */}
            {!pushDiagResult && !pushDiagReport && (
              <View className="rounded-xl p-4" style={{ backgroundColor: colors.background }}>
                <Text className="text-sm font-medium mb-2" style={{ color: colors.text }}>
                  How to use:
                </Text>
                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                  1. Tap "Register Now" to fetch token and register with backend{"\n"}
                  2. Check results show valid token + POST 200 + active token in backend{"\n"}
                  3. If testing fresh, tap "Clear Tokens" first, then "Register Now"
                </Text>
              </View>
            )}

            {/* Text Report - Always visible after running */}
            {pushDiagReport ? (
              <View className="rounded-xl p-4 mt-4" style={{ backgroundColor: colors.background }}>
                <Text className="text-sm font-semibold mb-2" style={{ color: colors.text }}>
                  📋 Text Report (Copy for Debug):
                </Text>
                <ScrollView
                  horizontal={false}
                  style={{ maxHeight: 200 }}
                  showsVerticalScrollIndicator={true}
                >
                  <Text
                    className="text-xs font-mono"
                    style={{ color: colors.textSecondary }}
                    selectable={true}
                  >
                    {pushDiagReport}
                  </Text>
                </ScrollView>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
