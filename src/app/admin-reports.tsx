import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ChevronLeft, ChevronRight, AlertTriangle, Shield } from "@/ui/icons";
import { useTheme } from "@/lib/ThemeContext";
import { checkAdminStatus, listReports, type AdminReport } from "@/lib/adminApi";
import { devLog } from "@/lib/devLog";

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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AdminReportsInbox() {
  const router = useRouter();
  const { isDark, colors, themeColor } = useTheme();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<"open" | "resolved">("open");

  // Admin gate
  const { data: adminStatus, isLoading: adminLoading } = useQuery({
    queryKey: ["adminStatus"],
    queryFn: checkAdminStatus,
    retry: false,
  });

  // Reports list
  const {
    data: reportsData,
    isLoading: reportsLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["adminReports", statusFilter],
    queryFn: () => listReports(statusFilter),
    enabled: !!adminStatus?.isAdmin,
  });

  const reports = reportsData?.reports ?? [];

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

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
  // Render
  // -------------------------------------------------------------------------
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <Animated.View
        entering={FadeInDown.delay(100).springify()}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 }}
      >
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}
        >
          <ChevronLeft size={20} color={colors.text} />
        </Pressable>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>Reports Inbox</Text>
        <View style={{ width: 40, height: 40 }} />
      </Animated.View>

      {/* Filter pills */}
      <Animated.View
        entering={FadeInDown.delay(150).springify()}
        style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 10 }}
      >
        {(["open", "resolved"] as const).map((s) => {
          const active = statusFilter === s;
          return (
            <Pressable
              key={s}
              onPress={() => {
                Haptics.selectionAsync();
                setStatusFilter(s);
              }}
              style={{
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 20,
                backgroundColor: active ? themeColor : colors.surface,
              }}
            >
              <Text style={{ color: active ? "#fff" : colors.textSecondary, fontWeight: "600", fontSize: 14, textTransform: "capitalize" }}>
                {s}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>

      {/* Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={themeColor} />}
      >
        {reportsLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <ActivityIndicator size="large" color={themeColor} />
            <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: 14 }}>Loading reports…</Text>
          </View>
        ) : reports.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <Shield size={36} color={colors.textTertiary} />
            <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: "500", marginTop: 16 }}>
              No {statusFilter} reports
            </Text>
            <Text style={{ color: colors.textTertiary, fontSize: 13, marginTop: 4 }}>
              {statusFilter === "open" ? "All clear!" : "No resolved reports yet."}
            </Text>
          </View>
        ) : (
          reports.map((report, idx) => (
            <ReportRow
              key={report.id}
              report={report}
              colors={colors}
              isDark={isDark}
              themeColor={themeColor}
              isLast={idx === reports.length - 1}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/admin-report-detail?reportId=${report.id}` as any);
              }}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

function ReportRow({
  report,
  colors,
  isDark,
  themeColor,
  isLast,
  onPress,
}: {
  report: AdminReport;
  colors: any;
  isDark: boolean;
  themeColor: string;
  isLast: boolean;
  onPress: () => void;
}) {
  const title = report.eventTitle ?? report.event?.title ?? "Unknown Event";
  const reasonLabel = REASON_LABELS[report.reason] ?? report.reason;
  const reasonColor = REASON_COLORS[report.reason] ?? colors.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      {/* Reason badge */}
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: `${reasonColor}20`,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 12,
        }}
      >
        <AlertTriangle size={18} color={reasonColor} />
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500" }} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3, gap: 6 }}>
          <View style={{ backgroundColor: `${reasonColor}20`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
            <Text style={{ color: reasonColor, fontSize: 11, fontWeight: "600" }}>{reasonLabel}</Text>
          </View>
          <Text style={{ color: colors.textTertiary, fontSize: 12 }}>{timeAgo(report.createdAt)}</Text>
        </View>
        {report.notes ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }} numberOfLines={1}>
            {report.notes}
          </Text>
        ) : null}
      </View>

      <ChevronRight size={18} color={colors.textTertiary} />
    </Pressable>
  );
}
