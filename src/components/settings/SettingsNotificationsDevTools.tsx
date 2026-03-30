import React, { useState, useEffect } from "react";
import { Alert } from "react-native";
import { Bell, Trash2, FileText, Copy, RefreshCw } from "@/ui/icons";
import * as Haptics from "expo-haptics";
import { devLog, devError } from "@/lib/devLog";
import { safeToast } from "@/lib/safeToast";
import { getRecentReceipts, clearPushReceipts } from "@/lib/push/pushReceiptStore";
import { buildDiagnosticsBundle } from "@/lib/devDiagnosticsBundle";
import { getDeadLetterCount, clearDeadLetterCount, loadQueue } from "@/lib/offlineQueue";
import { replayQueue } from "@/lib/offlineSync";
import { trackOfflineQueueReplayResult } from "@/analytics/analyticsEventsSSOT";
import * as Clipboard from "expo-clipboard";

// SettingItem is defined in settings.tsx - replicate minimal interface here
interface SettingItemProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  showArrow?: boolean;
  isDark?: boolean;
}

// Local SettingItem clone for use within this component file
import { View, Text, Pressable } from "react-native";

function SettingItem({ icon, title, subtitle, onPress, rightElement, showArrow = true, isDark }: SettingItemProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress && !rightElement}
      className="flex-row items-center p-4"
      style={{ borderBottomWidth: 1, borderBottomColor: isDark ? "#38383A" : "#F3F4F6" }}
    >
      <View
        className="w-10 h-10 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
      >
        {icon}
      </View>
      <View className="flex-1">
        <Text style={{ color: isDark ? "#FFFFFF" : "#1F2937" }} className="text-base font-medium">{title}</Text>
        {subtitle && <Text style={{ color: isDark ? "#8E8E93" : "#6B7280" }} className="text-sm mt-0.5">{subtitle}</Text>}
      </View>
      {rightElement}
      {showArrow && onPress && !rightElement && (
        <Text style={{ color: isDark ? "#636366" : "#9CA3AF" }} className="text-lg">›</Text>
      )}
    </Pressable>
  );
}

function ReplayQueueButton({ isDark }: { isDark: boolean }) {
  const [replaying, setReplaying] = useState(false);

  return (
    <SettingItem
      icon={<RefreshCw size={20} color={replaying ? "#9CA3AF" : "#10B981"} />}
      title={replaying ? "Replaying…" : "Replay Offline Queue"}
      subtitle={replaying ? "In progress — please wait" : "Manually trigger queue replay"}
      isDark={isDark}
      onPress={async () => {
        if (replaying) return;
        setReplaying(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        devLog("[P0_OFFLINE_QUEUE_REPLAY_MANUAL]", "triggered");
        const t0 = Date.now();
        try {
          const result = await replayQueue();
          const durationMs = Date.now() - t0;
          devLog("[P0_OFFLINE_QUEUE_REPLAY_MANUAL]", "done", result);
          trackOfflineQueueReplayResult({
            success: result.success,
            processed: result.failed === 0 ? 1 : 0,
            failed: result.failed,
            durationMs,
          });
          safeToast.success(
            "Queue Replayed",
            result.success
              ? "All actions synced successfully."
              : `Completed with ${result.failed} failed action(s).`,
          );
        } catch (e) {
          devError("[P0_OFFLINE_QUEUE_REPLAY_MANUAL]", "error", e);
          trackOfflineQueueReplayResult({ success: false, processed: 0, failed: 0, durationMs: Date.now() - t0 });
          safeToast.error("Replay Failed", String(e));
        } finally {
          setReplaying(false);
        }
      }}
    />
  );
}

function DeadLetterDebugRow({ isDark }: { isDark: boolean }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    getDeadLetterCount().then((c) => { if (mounted) setCount(c); });
    return () => { mounted = false; };
  }, []);

  return (
    <SettingItem
      icon={<Trash2 size={20} color="#F97316" />}
      title={`Dead Letters: ${count ?? "…"}`}
      subtitle="Offline actions that exceeded max retries"
      isDark={isDark}
      onPress={async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await clearDeadLetterCount();
        setCount(0);
        safeToast.success("Cleared", "Dead letter counter reset to 0.");
      }}
    />
  );
}

interface SettingsNotificationsDevToolsProps {
  canShowPushDiagnostics: boolean;
  isPushDiagRunning: boolean;
  isDark: boolean;
  sessionUserId: string | null;
  sessionUserEmail: string | null;
  onPushDiagnostics: () => void;
  onForceReregister: () => void;
}

export function SettingsNotificationsDevTools({
  canShowPushDiagnostics,
  isPushDiagRunning,
  isDark,
  sessionUserId,
  sessionUserEmail,
  onPushDiagnostics,
  onForceReregister,
}: SettingsNotificationsDevToolsProps) {
  return (
    <>
      {/* Push Diagnostics - visible only to allowlisted testers in DEV builds */}
      {canShowPushDiagnostics && (
        <>
          {__DEV__ && devLog("[P0_PUSH_DIAG_GONE] rendered=true")}
          <SettingItem
            icon={<Bell size={20} color="#10B981" />}
            title="Push Diagnostics"
            subtitle={isPushDiagRunning ? "Running..." : "Test push token registration"}
            isDark={isDark}
            onPress={onPushDiagnostics}
          />
        </>
      )}
      {/* P0_PUSH_REG: Force re-register push token (DEV only) */}
      {__DEV__ && (
        <SettingItem
          icon={<Bell size={20} color="#F59E0B" />}
          title="Force Re-register Push"
          subtitle="Bypass throttle, re-register token now"
          isDark={isDark}
          onPress={onForceReregister}
        />
      )}
      {/* P0_PUSH_TWO_ENDED: View/clear push receipts (DEV only) */}
      {__DEV__ && (
        <SettingItem
          icon={<Bell size={20} color="#8B5CF6" />}
          title="View Push Receipts"
          subtitle="Last 20 registration + delivery events"
          isDark={isDark}
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const entries = await getRecentReceipts();
            if (entries.length === 0) {
              Alert.alert("Push Receipts", "No receipts recorded yet.");
              return;
            }
            const lines = entries.map((r, i) => {
              const t = r.ts.split("T")[1]?.split(".")[0] ?? r.ts;
              const det = Object.entries(r.details).map(([k, v]) => `${k}=${String(v)}`).join(" ");
              return `${i + 1}. [${t}] ${r.kind} u=${r.userId} ${det}`;
            });
            Alert.alert(`Push Receipts (${entries.length})`, lines.join("\n"));
          }}
        />
      )}
      {__DEV__ && (
        <SettingItem
          icon={<Trash2 size={20} color="#EF4444" />}
          title="Clear Push Receipts"
          subtitle="Remove all stored receipt entries"
          isDark={isDark}
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await clearPushReceipts();
            safeToast.success("Cleared", "Push receipts cleared.");
          }}
        />
      )}
      {/* P0_PUSH_UI_INVALIDATION: View query invalidation/refetch receipts (DEV only) */}
      {__DEV__ && (
        <SettingItem
          icon={<FileText size={20} color="#06B6D4" />}
          title="View Query Receipts"
          subtitle="Last 20 invalidation + refetch events"
          isDark={isDark}
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const all = await getRecentReceipts();
            const queryEntries = all.filter((r) => r.kind === "query_invalidate" || r.kind === "query_refetch");
            if (queryEntries.length === 0) {
              Alert.alert("Query Receipts", "No query receipts recorded yet.");
              return;
            }
            const lines = queryEntries.slice(0, 20).map((r, i) => {
              const t = r.ts.split("T")[1]?.split(".")[0] ?? r.ts;
              const qk = String(r.details.queryKeyName ?? "?");
              const rsn = String(r.details.reason ?? "?");
              const cid = r.details.circleId ? ` cid=${String(r.details.circleId).slice(0, 6)}` : "";
              return `${i + 1}. [${t}] ${r.kind} ${qk} reason=${rsn}${cid}`;
            });
            Alert.alert(`Query Receipts (${queryEntries.length})`, lines.join("\n"));
          }}
        />
      )}
      {/* P0_DIAG_BUNDLE: Copy full diagnostics bundle to clipboard (DEV only) */}
      {__DEV__ && (
        <SettingItem
          icon={<Copy size={20} color="#14B8A6" />}
          title="Copy Diagnostics Bundle"
          subtitle="Push + query receipts + device + session → clipboard"
          isDark={isDark}
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              const bundle = await buildDiagnosticsBundle(sessionUserId, sessionUserEmail);
              await Clipboard.setStringAsync(JSON.stringify(bundle, null, 2));
              safeToast.success("Copied", "Diagnostics bundle copied to clipboard.");
            } catch (e) {
              devError("[P0_DIAG_BUNDLE] export failed", e);
              safeToast.error("Export Failed", "Could not build diagnostics bundle.");
            }
          }}
        />
      )}
      {/* P0_OFFLINE_DEAD_LETTER: View/clear dead-lettered offline actions (DEV only) */}
      {__DEV__ && (
        <DeadLetterDebugRow isDark={isDark} />
      )}
      {/* P0_OFFLINE_QUEUE_REPLAY_MANUAL: Replay offline queue (DEV only) */}
      {__DEV__ && (
        <ReplayQueueButton isDark={isDark} />
      )}
      {/* P0_OFFLINE_QUEUE_EXPORT: Export offline queue JSON (DEV only) */}
      {__DEV__ && (
        <SettingItem
          icon={<Copy size={20} color="#6366F1" />}
          title="Export Offline Queue JSON"
          subtitle="Copy queue payload to clipboard"
          isDark={isDark}
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            devLog("[P0_OFFLINE_QUEUE_EXPORT]", "triggered");
            try {
              const queue = await loadQueue();
              const json = JSON.stringify(queue, null, 2);
              await Clipboard.setStringAsync(json);
              devLog("[P0_OFFLINE_QUEUE_EXPORT]", "copied", { count: queue.length });
              safeToast.success(
                "Copied",
                `${queue.length} queued action(s) copied to clipboard.`,
              );
            } catch (e) {
              devError("[P0_OFFLINE_QUEUE_EXPORT]", "error", e);
              safeToast.error("Export Failed", String(e));
            }
          }}
        />
      )}
    </>
  );
}
