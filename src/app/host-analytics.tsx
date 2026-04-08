/**
 * host-analytics — Pro-only host analytics dashboard.
 *
 * Shows aggregate stats for the authenticated user's hosted events.
 * Free users see a blurred preview with an upgrade CTA.
 */

import React from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { usePremiumStatusContract } from "@/lib/entitlements";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Crown, ChevronLeft } from "@/ui/icons";
import { RADIUS } from "@/ui/layout";
import type { HostAnalyticsResponse } from "@/shared/contracts";

function StatCard({ label, value, color, isDark, colors }: {
  label: string;
  value: string | number;
  color: string;
  isDark: boolean;
  colors: any;
}) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)",
      borderRadius: 14,
      padding: 14,
      minWidth: 140,
    }}>
      <Text style={{ fontSize: 28, fontWeight: "800", color, letterSpacing: -1 }}>
        {value}
      </Text>
      <Text style={{ fontSize: 12, fontWeight: "500", color: colors.textSecondary, marginTop: 4 }}>
        {label}
      </Text>
    </View>
  );
}

function AttendanceBar({ title, count, maxCount, color, isDark, colors }: {
  title: string;
  count: number;
  maxCount: number;
  color: string;
  isDark: boolean;
  colors: any;
}) {
  const width = maxCount > 0 ? Math.max(8, (count / maxCount) * 100) : 8;
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
        <Text style={{ fontSize: 12, color: colors.textSecondary, flex: 1 }} numberOfLines={1}>{title}</Text>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text, marginLeft: 8 }}>{count}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: color, width: `${width}%` }} />
      </View>
    </View>
  );
}

export default function HostAnalyticsScreen() {
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const { themeColor, isDark, colors } = useTheme();
  const router = useRouter();
  const premiumStatus = usePremiumStatusContract();
  const userIsPro = premiumStatus.isPro;

  const { data, isLoading } = useQuery({
    queryKey: ["host-analytics"],
    queryFn: () => api.get<HostAnalyticsResponse>("/api/events/analytics"),
    enabled: isAuthedForNetwork(bootStatus, session) && userIsPro,
    staleTime: 60_000,
  });

  // Mock data for free users (blurred preview)
  const mockData: HostAnalyticsResponse = {
    totalEvents: 12,
    totalRsvps: 87,
    avgAttendance: 7.3,
    rsvpConversionRate: 68,
    topDay: "Saturday",
    topTime: "7 PM",
    repeatAttendees: [
      { userId: "1", name: "Sarah M.", count: 8 },
      { userId: "2", name: "Alex K.", count: 6 },
      { userId: "3", name: "Jordan L.", count: 5 },
    ],
    eventBreakdown: [
      { eventId: "1", title: "Beach Bonfire", date: "2026-03-28", goingCount: 14, notGoingCount: 3 },
      { eventId: "2", title: "Game Night", date: "2026-03-21", goingCount: 8, notGoingCount: 1 },
      { eventId: "3", title: "Brunch Club", date: "2026-03-15", goingCount: 6, notGoingCount: 2 },
    ],
  };

  const analytics = userIsPro ? data : mockData;
  const maxGoing = Math.max(...(analytics?.eventBreakdown ?? []).map((e) => e.goingCount), 1);

  const content = (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
    >
      {/* Stats Grid */}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
        <StatCard label="Events Hosted" value={analytics?.totalEvents ?? 0} color={themeColor} isDark={isDark} colors={colors} />
        <StatCard label="Total RSVPs" value={analytics?.totalRsvps ?? 0} color={themeColor} isDark={isDark} colors={colors} />
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
        <StatCard label="Avg Attendance" value={analytics?.avgAttendance?.toFixed(1) ?? "0"} color="#22C55E" isDark={isDark} colors={colors} />
        <StatCard label="Conversion Rate" value={`${analytics?.rsvpConversionRate ?? 0}%`} color="#F59E0B" isDark={isDark} colors={colors} />
      </View>

      {/* Insights Row */}
      {(analytics?.topDay || analytics?.topTime) && (
        <View style={{
          flexDirection: "row",
          gap: 10,
          marginBottom: 24,
          backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
          borderRadius: 12,
          padding: 14,
        }}>
          {analytics.topDay && (
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: "500", color: colors.textTertiary }}>Best Day</Text>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 2 }}>{analytics.topDay}</Text>
            </View>
          )}
          {analytics.topTime && (
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: "500", color: colors.textTertiary }}>Best Time</Text>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 2 }}>{analytics.topTime}</Text>
            </View>
          )}
        </View>
      )}

      {/* Attendance per Event */}
      {(analytics?.eventBreakdown?.length ?? 0) > 0 && (
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text, marginBottom: 12 }}>
            Attendance by Event
          </Text>
          {analytics!.eventBreakdown.slice(0, 10).map((evt) => (
            <AttendanceBar
              key={evt.eventId}
              title={evt.title}
              count={evt.goingCount}
              maxCount={maxGoing}
              color={themeColor}
              isDark={isDark}
              colors={colors}
            />
          ))}
        </View>
      )}

      {/* Top Attendees */}
      {(analytics?.repeatAttendees?.length ?? 0) > 0 && (
        <View>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text, marginBottom: 12 }}>
            Your Regulars
          </Text>
          {analytics!.repeatAttendees.map((a, i) => (
            <View key={a.userId} style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 10,
              borderBottomWidth: i < analytics!.repeatAttendees.length - 1 ? 1 : 0,
              borderBottomColor: colors.separator,
            }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.textTertiary, width: 24 }}>
                {i + 1}
              </Text>
              <EntityAvatar
                initials={a.name[0]}
                size={32}
                backgroundColor={`${themeColor}15`}
                foregroundColor={themeColor}
                fallbackIcon="person-outline"
              />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: colors.text, marginLeft: 10 }}>
                {a.name}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: themeColor }}>
                {a.count} events
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{
        headerShown: true,
        headerTitle: "Host Analytics",
        headerTintColor: themeColor,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text },
      }} />

      {isLoading && userIsPro ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="small" color={themeColor} />
        </View>
      ) : !userIsPro ? (
        /* Free user: blurred preview with upgrade overlay */
        <View style={{ flex: 1 }}>
          {content}
          {/* Blur + upgrade overlay */}
          <View style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}>
            <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={{ flex: 1 }} />
          </View>
          <View style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 40,
          }}>
            <View style={{
              backgroundColor: isDark ? "rgba(30,30,30,0.95)" : "rgba(255,255,255,0.95)",
              borderRadius: 20,
              padding: 28,
              alignItems: "center",
              width: "100%",
              maxWidth: 320,
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 8 },
            }}>
              <Crown size={32} color={themeColor} />
              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, marginTop: 12, textAlign: "center" }}>
                Unlock Host Analytics
              </Text>
              <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginTop: 8 }}>
                See who comes to your events, your best days and times, and track your hosting stats over time.
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push("/subscription");
                }}
                style={{
                  backgroundColor: themeColor,
                  paddingHorizontal: 28,
                  paddingVertical: 14,
                  borderRadius: RADIUS.lg,
                  marginTop: 20,
                  width: "100%",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}>Upgrade to Pro</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}
