import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  ChevronLeft,
  AlertTriangle,
  Shield,
  Calendar,
  User,
  FileText,
  CheckCircle,
  Clock,
  MapPin,
  Eye,
} from "@/ui/icons";
import { useTheme } from "@/lib/ThemeContext";
import {
  checkAdminStatus,
  getReport,
  resolveReport,
  type AdminReport,
} from "@/lib/adminApi";
import { safeToast } from "@/lib/safeToast";
import { devLog } from "@/lib/devLog";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  inappropriate: "Inappropriate",
  safety: "Safety Concern",
  other: "Other",
};

const REASON_COLORS: Record<string, string> = {
  spam: "#F59E0B",
  inappropriate: "#EF4444",
  safety: "#DC2626",
  other: "#6B7280",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AdminReportDetail() {
  const router = useRouter();
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const { isDark, colors, themeColor } = useTheme();
  const queryClient = useQueryClient();
  const [resolving, setResolving] = useState(false);
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const authed = isAuthedForNetwork(bootStatus, session);
  if (__DEV__ && !authed) devLog('[P13_NET_GATE] tag="adminStatus" blocked — not authed');

  // Admin gate
  const { data: adminStatus, isLoading: adminLoading } = useQuery({
    queryKey: ["adminStatus"],
    queryFn: checkAdminStatus,
    retry: false,
    enabled: authed,
  });

  // Report detail
  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ["adminReport", reportId],
    queryFn: () => getReport(reportId!),
    enabled: !!adminStatus?.isAdmin && !!reportId,
  });

  // [P0_ADMIN_REPORT_SNAPSHOT_UI] Proof log — fire once per load
  const snapshotLogRef = useRef(false);
  useEffect(() => {
    if (!report || snapshotLogRef.current) return;
    snapshotLogRef.current = true;
    if (report.snapshot) {
      if (__DEV__) devLog(`[P0_ADMIN_REPORT_SNAPSHOT_UI] present reportId=${report.id} capturedAt=${report.snapshot.capturedAt}`);
    } else {
      if (__DEV__) devLog(`[P0_ADMIN_REPORT_SNAPSHOT_UI] missing reportId=${report.id}`);
    }
  }, [report]);

  // Resolve handler
  const handleResolve = useCallback(() => {
    if (!reportId) return;
    Alert.alert(
      "Resolve Report",
      "Dismiss this report and mark it as resolved?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Resolve",
          style: "destructive",
          onPress: async () => {
            setResolving(true);
            try {
              const result = await resolveReport(reportId, "dismiss");
              if (result.success) {
                safeToast.success("Report resolved");
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                queryClient.invalidateQueries({ queryKey: ["adminReports"] });
                queryClient.invalidateQueries({ queryKey: ["adminReport", reportId] });
                router.back();
              } else {
                safeToast.error(result.message || "Failed to resolve");
              }
            } catch (err: any) {
              if (err?.status === 403) {
                safeToast.error("Not authorized");
              } else {
                safeToast.error("Network error");
              }
            } finally {
              setResolving(false);
            }
          },
        },
      ]
    );
  }, [reportId, queryClient, router]);

  // -------------------------------------------------------------------------
  // Auth gate
  // -------------------------------------------------------------------------
  if (adminLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={themeColor} />
          <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Checking permissions…</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (!adminStatus?.isAdmin) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <Shield size={40} color={colors.textTertiary} />
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "600", marginTop: 16 }}>Admin access required</Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 24, backgroundColor: themeColor, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------------------
  // Loading / Missing
  // -------------------------------------------------------------------------
  if (reportLoading || !report) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 }}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}
          >
            <ChevronLeft size={20} color={colors.text} />
          </Pressable>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>Report Detail</Text>
          <View style={{ width: 40, height: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {reportLoading ? (
            <>
              <ActivityIndicator size="large" color={themeColor} />
              <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Loading report…</Text>
            </>
          ) : (
            <>
              <AlertTriangle size={36} color={colors.textTertiary} />
              <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: "500", marginTop: 16 }}>Report not found</Text>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const title = report.eventTitle ?? report.event?.title ?? "Unknown Event";
  const reasonLabel = REASON_LABELS[report.reason] ?? report.reason;
  const reasonColor = REASON_COLORS[report.reason] ?? colors.textSecondary;
  const isResolved = report.status === "resolved";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <Animated.View
        entering={FadeInDown.delay(100).springify()}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 }}
      >
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
          style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}
        >
          <ChevronLeft size={20} color={colors.text} />
        </Pressable>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>Report Detail</Text>
        <View style={{ width: 40, height: 40 }} />
      </Animated.View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60 }}>
        {/* Status badge */}
        <Animated.View entering={FadeInDown.delay(150).springify()} style={{ flexDirection: "row", marginTop: 8, marginBottom: 16 }}>
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 12,
            backgroundColor: isResolved ? "#10B98120" : `${reasonColor}20`,
          }}>
            {isResolved ? <CheckCircle size={14} color="#10B981" /> : <AlertTriangle size={14} color={reasonColor} />}
            <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "600", color: isResolved ? "#10B981" : reasonColor }}>
              {isResolved ? "Resolved" : "Open"}
            </Text>
          </View>
          <View style={{ marginLeft: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: `${reasonColor}20` }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: reasonColor }}>{reasonLabel}</Text>
          </View>
        </Animated.View>

        {/* Event info card */}
        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600", marginBottom: 6, marginLeft: 2 }}>EVENT</Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16 }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: "600" }} numberOfLines={2}>{title}</Text>
            {report.event?.date ? (
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                <Calendar size={14} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginLeft: 6 }}>{formatDate(report.event.date)}</Text>
              </View>
            ) : null}
            {report.event?.hostName ? (
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                <User size={14} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginLeft: 6 }}>Hosted by {report.event.hostName}</Text>
              </View>
            ) : null}
          </View>
        </Animated.View>

        {/* Report details card */}
        <Animated.View entering={FadeInDown.delay(250).springify()} style={{ marginTop: 20 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600", marginBottom: 6, marginLeft: 2 }}>REPORT DETAILS</Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16 }}>
            {/* Reason */}
            <View style={{ flexDirection: "row", marginBottom: 12 }}>
              <AlertTriangle size={16} color={reasonColor} style={{ marginTop: 2 }} />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Reason</Text>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500", marginTop: 2 }}>{reasonLabel}</Text>
              </View>
            </View>

            {/* Notes */}
            {report.notes ? (
              <View style={{ flexDirection: "row", marginBottom: 12 }}>
                <FileText size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Additional Notes</Text>
                  <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20, marginTop: 4 }}>{report.notes}</Text>
                </View>
              </View>
            ) : null}

            {/* Reporter */}
            {report.reporterName ? (
              <View style={{ flexDirection: "row", marginBottom: 12 }}>
                <User size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Reported by</Text>
                  <Text style={{ color: colors.text, fontSize: 14, marginTop: 2 }}>{report.reporterName}</Text>
                </View>
              </View>
            ) : null}

            {/* Timestamps */}
            <View style={{ flexDirection: "row" }}>
              <Clock size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Submitted</Text>
                <Text style={{ color: colors.text, fontSize: 14, marginTop: 2 }}>{formatDate(report.createdAt)}</Text>
                {report.resolvedAt ? (
                  <>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 8 }}>Resolved</Text>
                    <Text style={{ color: "#10B981", fontSize: 14, marginTop: 2 }}>{formatDate(report.resolvedAt)}</Text>
                  </>
                ) : null}
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Snapshot at time of report */}
        <Animated.View entering={FadeInDown.delay(275).springify()} style={{ marginTop: 20 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600", marginBottom: 6, marginLeft: 2 }}>SNAPSHOT AT TIME OF REPORT</Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16 }}>
            {report.snapshot ? (
              <>
                {/* Captured time */}
                {report.snapshot.capturedAt ? (
                  <View style={{ flexDirection: "row", marginBottom: 12 }}>
                    <Clock size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Captured</Text>
                      <Text style={{ color: colors.text, fontSize: 14, marginTop: 2 }}>{formatDate(report.snapshot.capturedAt)}</Text>
                    </View>
                  </View>
                ) : null}

                {/* Title */}
                {report.snapshot.title ? (
                  <View style={{ flexDirection: "row", marginBottom: 12 }}>
                    <FileText size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Title</Text>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500", marginTop: 2 }}>{report.snapshot.title}</Text>
                    </View>
                  </View>
                ) : null}

                {/* Description */}
                {report.snapshot.description ? (
                  <View style={{ flexDirection: "row", marginBottom: 12 }}>
                    <FileText size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Description</Text>
                      <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20, marginTop: 2 }} numberOfLines={6}>{report.snapshot.description}</Text>
                    </View>
                  </View>
                ) : null}

                {/* Location */}
                {report.snapshot.location ? (
                  <View style={{ flexDirection: "row", marginBottom: 12 }}>
                    <MapPin size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Location</Text>
                      <Text style={{ color: colors.text, fontSize: 14, marginTop: 2 }}>{report.snapshot.location}</Text>
                    </View>
                  </View>
                ) : null}

                {/* Start / End */}
                {(report.snapshot.startTime || report.snapshot.endTime) ? (
                  <View style={{ flexDirection: "row", marginBottom: 12 }}>
                    <Calendar size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      {report.snapshot.startTime ? (
                        <>
                          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Start</Text>
                          <Text style={{ color: colors.text, fontSize: 14, marginTop: 2 }}>{formatDate(report.snapshot.startTime)}</Text>
                        </>
                      ) : null}
                      {report.snapshot.endTime ? (
                        <>
                          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: report.snapshot.startTime ? 8 : 0 }}>End</Text>
                          <Text style={{ color: colors.text, fontSize: 14, marginTop: 2 }}>{formatDate(report.snapshot.endTime)}</Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                {/* Visibility */}
                {report.snapshot.visibility ? (
                  <View style={{ flexDirection: "row", marginBottom: 12 }}>
                    <Eye size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Visibility</Text>
                      <Text style={{ color: colors.text, fontSize: 14, marginTop: 2 }}>{report.snapshot.visibility}</Text>
                    </View>
                  </View>
                ) : null}

                {/* Host ID */}
                {report.snapshot.hostId ? (
                  <View style={{ flexDirection: "row" }}>
                    <User size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Host ID</Text>
                      <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 2 }}>{report.snapshot.hostId}</Text>
                    </View>
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={{ color: colors.textTertiary, fontSize: 14, fontStyle: "italic" }}>No snapshot available.</Text>
            )}
          </View>
        </Animated.View>

        {/* Resolve button (only for open reports) */}
        {!isResolved ? (
          <Animated.View entering={FadeInDown.delay(300).springify()} style={{ marginTop: 28 }}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                handleResolve();
              }}
              disabled={resolving}
              style={{
                backgroundColor: "#10B981",
                paddingVertical: 16,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                opacity: resolving ? 0.7 : 1,
              }}
            >
              {resolving ? (
                <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
              ) : (
                <CheckCircle size={18} color="#fff" />
              )}
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600", marginLeft: 8 }}>
                {resolving ? "Resolving…" : "Resolve Report"}
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {/* IDs section (debug helper) */}
        <Animated.View entering={FadeInDown.delay(350).springify()} style={{ marginTop: 24, opacity: 0.5 }}>
          <Text style={{ color: colors.textTertiary, fontSize: 11 }}>Report ID: {report.id}</Text>
          <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 2 }}>Event ID: {report.eventId}</Text>
          {report.reporterId ? <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 2 }}>Reporter ID: {report.reporterId}</Text> : null}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
