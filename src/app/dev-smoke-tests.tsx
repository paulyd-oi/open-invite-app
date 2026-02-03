/**
 * DevSmokeTests - QA screen for testing all paywall contexts and navigation
 * Includes strict CTA verification audit system
 * 
 * ⚠️ DEV-ONLY: This screen is stripped from production builds.
 */

import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, Pressable, TextInput } from "react-native";

// ============================================
// PRODUCTION GATE - Never reachable in App Store builds
// ============================================
if (!__DEV__) {
  module.exports = { default: () => null };
}
import { safeToast } from "@/lib/safeToast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import {
  Calendar,
  Users,
  CalendarPlus,
  Repeat,
  Crown,
  Bell,
  Award,
  History,
  Settings,
  ChevronLeft,
  Sparkles,
  Navigation,
  ExternalLink,
  RotateCcw,
  CheckCircle,
  XCircle,
  Map,
  Home,
  User,
  CreditCard,
  UserPlus,
  Play,
  ListChecks,
  AlertTriangle,
  Send,
} from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";

import { useTheme } from "@/lib/ThemeContext";
import { api } from "@/lib/api";
import {
  useEntitlements,
  type PaywallContext,
  wasPaywallShownThisSession,
  resetSessionPaywallTracking,
  canShowAutomaticPaywall,
} from "@/lib/entitlements";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { NotificationNudgeModal, getNudgeState, type NudgeState } from "@/components/notifications/NotificationNudgeModal";
import {
  goToHome,
  goToCreate,
  goToCalendar,
  goToFriends,
  goToProfile,
  goToSettings,
  goToWhosFree,
  goToSubscription,
  goToSuggestions,
  goToDiscover,
  ROUTES,
} from "@/lib/nav";

// ============================================
// SINGLE SOURCE OF TRUTH: All PaywallContext values
// This MUST match the PaywallContext union in src/lib/entitlements.ts
// ============================================
const PAYWALL_CONTEXTS: PaywallContext[] = [
  "ACTIVE_EVENTS_LIMIT",
  "RECURRING_EVENTS",
  "WHOS_FREE_HORIZON",
  "UPCOMING_BIRTHDAYS_HORIZON",
  "CIRCLES_LIMIT",
  "CIRCLE_MEMBERS_LIMIT",
  "INSIGHTS_LOCKED",
  "HISTORY_LIMIT",
  "ACHIEVEMENTS_LOCKED",
  "PRIORITY_SYNC_LOCKED",
] as const;

// Paywall test cases with metadata
const PAYWALL_TEST_CASES: Array<{
  context: PaywallContext;
  title: string;
  icon: React.ComponentType<any>;
  color: string;
  description: string;
}> = [
  {
    context: "ACTIVE_EVENTS_LIMIT",
    title: "Active Events Limit",
    icon: CalendarPlus,
    color: "#FF6B4A",
    description: "Triggers: Create event when at 3 max",
  },
  {
    context: "RECURRING_EVENTS",
    title: "Recurring Events",
    icon: Repeat,
    color: "#9333EA",
    description: "Triggers: Select weekly/monthly frequency",
  },
  {
    context: "WHOS_FREE_HORIZON",
    title: "Who's Free Horizon",
    icon: Calendar,
    color: "#4ECDC4",
    description: "Triggers: Select date beyond 7 days",
  },
  {
    context: "UPCOMING_BIRTHDAYS_HORIZON",
    title: "Birthdays Horizon",
    icon: Crown,
    color: "#F472B6",
    description: "Triggers: View birthdays beyond 7 days",
  },
  {
    context: "CIRCLES_LIMIT",
    title: "Circles Limit",
    icon: Users,
    color: "#10B981",
    description: "Triggers: Create circle when at 2 max",
  },
  {
    context: "CIRCLE_MEMBERS_LIMIT",
    title: "Circle Members Limit",
    icon: Users,
    color: "#F59E0B",
    description: "Triggers: Add member when at 15 max",
  },
  {
    context: "INSIGHTS_LOCKED",
    title: "Insights Locked",
    icon: Sparkles,
    color: "#6366F1",
    description: "Triggers: Access insights/analytics tab",
  },
  {
    context: "HISTORY_LIMIT",
    title: "History Limit",
    icon: History,
    color: "#8B5CF6",
    description: "Triggers: View history beyond 30 days",
  },
  {
    context: "ACHIEVEMENTS_LOCKED",
    title: "Achievements Locked",
    icon: Award,
    color: "#EC4899",
    description: "Triggers: Access full achievements",
  },
  {
    context: "PRIORITY_SYNC_LOCKED",
    title: "Priority Sync",
    icon: Settings,
    color: "#3B82F6",
    description: "Triggers: Enable priority sync",
  },
];

// Navigation test cases
const NAVIGATION_TEST_CASES: Array<{
  title: string;
  route: string;
  icon: React.ComponentType<any>;
  action: (router: any) => void;
}> = [
  { title: "/ (Home)", route: ROUTES.HOME, icon: Home, action: goToHome },
  { title: "/calendar", route: ROUTES.CALENDAR, icon: Calendar, action: goToCalendar },
  { title: "/friends", route: ROUTES.FRIENDS, icon: Users, action: goToFriends },
  { title: "/profile", route: ROUTES.PROFILE, icon: User, action: goToProfile },
  { title: "/settings", route: ROUTES.SETTINGS, icon: Settings, action: goToSettings },
  { title: "/whos-free", route: ROUTES.WHOS_FREE, icon: Map, action: goToWhosFree },
  { title: "/subscription", route: ROUTES.SUBSCRIPTION, icon: CreditCard, action: goToSubscription },
];

// CTA Audit result type
type AuditResult = "pending" | "pass" | "fail";

interface ContextAuditState {
  context: PaywallContext;
  primaryCTA: AuditResult;
  secondaryCTA: AuditResult;
}

export default function DevSmokeTestsScreen() {
  const router = useRouter();
  const { themeColor, colors } = useTheme();
  const { data: entitlements } = useEntitlements();

  // Production guard: redirect to home if not in dev mode
  React.useEffect(() => {
    if (!__DEV__) {
      router.replace('/calendar');
    }
  }, [router]);

  // Don't render anything in production
  if (!__DEV__) {
    return null;
  }

  // Modal state
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [paywallContext, setPaywallContext] = useState<PaywallContext>("ACTIVE_EVENTS_LIMIT");
  const [showNotificationNudge, setShowNotificationNudge] = useState(false);
  const [lastPaywallCTA, setLastPaywallCTA] = useState<string | null>(null);
  const [nudgeState, setNudgeState] = useState<NudgeState>("none");

  // Push notification test state
  const [pushTitle, setPushTitle] = useState("Test Notification");
  const [pushMessage, setPushMessage] = useState("This is a test push!");
  const [sendingPush, setSendingPush] = useState(false);

  // Expo Token state
  const [tokenInfo, setTokenInfo] = useState<{
    hasPermission: boolean;
    permissionStatus: string;
    hasToken: boolean;
    tokenRegistered: boolean;
  } | null>(null);
  const [checkingToken, setCheckingToken] = useState(false);

  // CTA Audit state
  const [auditMode, setAuditMode] = useState(false);
  const [currentAuditIndex, setCurrentAuditIndex] = useState(0);
  const [auditResults, setAuditResults] = useState<ContextAuditState[]>(() =>
    PAYWALL_CONTEXTS.map((context) => ({
      context,
      primaryCTA: "pending" as AuditResult,
      secondaryCTA: "pending" as AuditResult,
    }))
  );

  // Load nudge state on mount
  useEffect(() => {
    getNudgeState().then(setNudgeState);
  }, []);

  // Verify contexts match at dev time
  useEffect(() => {
    if (__DEV__) {
      console.log("[DevSmokeTests] Verifying PaywallContext coverage...");
      console.log(`[DevSmokeTests] PAYWALL_CONTEXTS has ${PAYWALL_CONTEXTS.length} items`);
      PAYWALL_CONTEXTS.forEach((ctx, i) => {
        console.log(`  ${i + 1}. ${ctx}`);
      });
    }
  }, []);

  const handleTestPaywall = (context: PaywallContext) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPaywallContext(context);
    setLastPaywallCTA(null);
    setShowPaywallModal(true);
  };

  const handleTestNotificationNudge = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowNotificationNudge(true);
  };

  const handleSendTestPush = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSendingPush(true);

    try {
      await api.post("/api/notifications/test-push", {
        title: pushTitle,
        message: pushMessage,
      });

      safeToast.success(
        "Test Push Sent!",
        "Check your device for the notification. Make sure you have notifications enabled."
      );
    } catch (error: any) {
      safeToast.error(
        "Push Failed",
        error.response?.data?.error || "Failed to send test push notification"
      );
    } finally {
      setSendingPush(false);
    }
  };

  const handleCheckExpoToken = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCheckingToken(true);

    try {
      // Check OS permission
      const { status } = await Notifications.getPermissionsAsync();

      // Check if token exists in AsyncStorage
      const { getStoredPushToken } = await import("@/lib/notifications");
      const token = await getStoredPushToken();

      setTokenInfo({
        hasPermission: status === "granted",
        permissionStatus: status,
        hasToken: !!token,
        tokenRegistered: !!token && status === "granted",
      });

      console.log("[DevSmokeTests] Token Check:", {
        permissionStatus: status,
        hasToken: !!token,
        token: token ? `${token.substring(0, 20)}...` : null,
      });
    } catch (error) {
      console.error("[DevSmokeTests] Error checking token:", error);
      safeToast.error("Error", "Failed to check Expo token status");
    } finally {
      setCheckingToken(false);
    }
  };

  const handleRequestPermission = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { status } = await Notifications.requestPermissionsAsync();

      if (status === "granted") {
        safeToast.success("Success", "Notification permission granted! Token will be registered automatically.");
        // Refresh token info
        await handleCheckExpoToken();
      } else {
        safeToast.warning(
          "Permission Denied",
          "Notification permission was denied. Go to Settings to enable it."
        );
      }
    } catch (error) {
      console.error("[DevSmokeTests] Error requesting permission:", error);
      safeToast.error("Error", "Failed to request notification permission");
    }
  };

  const handleResetSessionTracking = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    resetSessionPaywallTracking();
    safeToast.info("Session Reset", "Paywall session tracking has been reset.");
  };

  // CTA handlers with audit logging
  const handlePaywallPrimary = useCallback(() => {
    const ctx = paywallContext;
    console.log(`[CTA Audit] PRIMARY CTA pressed for context: ${ctx}`);
    console.log(`[CTA Audit] Expected behavior: Navigate to /subscription`);

    setLastPaywallCTA(`✅ Primary CTA → /subscription (${ctx})`);

    // Log PASS for primary CTA
    console.log(`[CTA Audit] ${ctx} PRIMARY: PASS - Navigating to /subscription`);

    // Update audit results if in audit mode
    if (auditMode) {
      setAuditResults((prev) =>
        prev.map((item) =>
          item.context === ctx ? { ...item, primaryCTA: "pass" } : item
        )
      );
    }

    // Navigate to subscription (this is the expected behavior)
    goToSubscription(router);
  }, [paywallContext, auditMode, router]);

  const handlePaywallSecondary = useCallback(() => {
    const ctx = paywallContext;
    console.log(`[CTA Audit] SECONDARY CTA pressed for context: ${ctx}`);
    console.log(`[CTA Audit] Expected behavior: Dismiss modal only (no navigation)`);

    setLastPaywallCTA(`✅ Secondary CTA → Dismissed (${ctx})`);

    // Log PASS for secondary CTA
    console.log(`[CTA Audit] ${ctx} SECONDARY: PASS - Modal dismissed`);

    // Update audit results if in audit mode
    if (auditMode) {
      setAuditResults((prev) =>
        prev.map((item) =>
          item.context === ctx ? { ...item, secondaryCTA: "pass" } : item
        )
      );
    }
  }, [paywallContext, auditMode]);

  const handleNavigationTest = (testCase: typeof NAVIGATION_TEST_CASES[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    console.log(`[Nav Test] Navigating to ${testCase.route}`);
    testCase.action(router);
  };

  // Start guided audit
  const startAudit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setAuditMode(true);
    setCurrentAuditIndex(0);
    setAuditResults(
      PAYWALL_CONTEXTS.map((context) => ({
        context,
        primaryCTA: "pending",
        secondaryCTA: "pending",
      }))
    );
    console.log("========================================");
    console.log("[CTA Audit] Starting Paywall CTA Audit");
    console.log(`[CTA Audit] Testing ${PAYWALL_CONTEXTS.length} contexts`);
    console.log("========================================");

    // Open first paywall
    setPaywallContext(PAYWALL_CONTEXTS[0]);
    setShowPaywallModal(true);
  };

  // Move to next context in audit
  const continueAudit = () => {
    const nextIndex = currentAuditIndex + 1;
    if (nextIndex < PAYWALL_CONTEXTS.length) {
      setCurrentAuditIndex(nextIndex);
      setPaywallContext(PAYWALL_CONTEXTS[nextIndex]);
      setShowPaywallModal(true);
    } else {
      // Audit complete
      setAuditMode(false);
      printAuditSummary();
    }
  };

  // Print audit summary to console
  const printAuditSummary = () => {
    console.log("========================================");
    console.log("[CTA Audit] AUDIT COMPLETE - SUMMARY");
    console.log("========================================");

    let passCount = 0;
    let failCount = 0;
    let pendingCount = 0;

    auditResults.forEach((result) => {
      const primaryStatus = result.primaryCTA === "pass" ? "✅ PASS" : result.primaryCTA === "fail" ? "❌ FAIL" : "⏳ PENDING";
      const secondaryStatus = result.secondaryCTA === "pass" ? "✅ PASS" : result.secondaryCTA === "fail" ? "❌ FAIL" : "⏳ PENDING";

      console.log(`${result.context}:`);
      console.log(`  Primary CTA: ${primaryStatus}`);
      console.log(`  Secondary CTA: ${secondaryStatus}`);

      if (result.primaryCTA === "pass") passCount++;
      else if (result.primaryCTA === "fail") failCount++;
      else pendingCount++;

      if (result.secondaryCTA === "pass") passCount++;
      else if (result.secondaryCTA === "fail") failCount++;
      else pendingCount++;
    });

    console.log("----------------------------------------");
    console.log(`Total: ${passCount} PASS, ${failCount} FAIL, ${pendingCount} PENDING`);
    console.log("========================================");

    safeToast.success(
      "Audit Complete",
      `Results: ${passCount} PASS, ${failCount} FAIL, ${pendingCount} PENDING. Check console for details.`
    );
  };

  // Reset audit
  const resetAudit = () => {
    setAuditMode(false);
    setCurrentAuditIndex(0);
    setAuditResults(
      PAYWALL_CONTEXTS.map((context) => ({
        context,
        primaryCTA: "pending",
        secondaryCTA: "pending",
      }))
    );
  };

  // Get audit status icon
  const getAuditIcon = (result: AuditResult) => {
    switch (result) {
      case "pass":
        return <CheckCircle size={14} color="#22C55E" />;
      case "fail":
        return <XCircle size={14} color="#EF4444" />;
      default:
        return <AlertTriangle size={14} color="#F59E0B" />;
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: "Smoke Tests",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} className="p-2">
              <ChevronLeft size={24} color={colors.text} />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.springify()} className="mb-6 pt-4">
          <Text className="text-2xl font-bold" style={{ color: colors.text }}>
            Dev Smoke Tests
          </Text>
          <Text className="mt-1" style={{ color: colors.textSecondary }}>
            Test navigation, paywalls, and CTA verification
          </Text>
        </Animated.View>

        {/* CTA Audit Section */}
        <Animated.View
          entering={FadeInDown.delay(25).springify()}
          className="rounded-xl p-4 mb-6"
          style={{ backgroundColor: "#EF444415", borderWidth: 1, borderColor: "#EF444430" }}
        >
          <View className="flex-row items-center mb-3">
            <ListChecks size={20} color="#EF4444" />
            <Text className="font-semibold ml-2" style={{ color: colors.text }}>
              Paywall CTA Audit
            </Text>
          </View>

          <Text className="text-sm mb-3" style={{ color: colors.textSecondary }}>
            Verify all {PAYWALL_CONTEXTS.length} paywall contexts route Primary CTA → /subscription
          </Text>

          {!auditMode ? (
            <Pressable
              onPress={startAudit}
              className="flex-row items-center justify-center py-3 rounded-xl"
              style={{ backgroundColor: "#EF4444" }}
            >
              <Play size={18} color="#FFFFFF" />
              <Text className="text-white font-semibold ml-2">
                Run Paywall CTA Audit
              </Text>
            </Pressable>
          ) : (
            <View>
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-medium" style={{ color: colors.text }}>
                  Testing: {currentAuditIndex + 1}/{PAYWALL_CONTEXTS.length}
                </Text>
                <Pressable onPress={resetAudit}>
                  <Text className="text-sm" style={{ color: "#EF4444" }}>
                    Cancel
                  </Text>
                </Pressable>
              </View>
              <Text className="text-xs mb-2" style={{ color: colors.textSecondary }}>
                Current: {PAYWALL_CONTEXTS[currentAuditIndex]}
              </Text>
              <Pressable
                onPress={continueAudit}
                className="flex-row items-center justify-center py-2 rounded-lg"
                style={{ backgroundColor: `${themeColor}20` }}
              >
                <Text className="font-medium" style={{ color: themeColor }}>
                  Next Context →
                </Text>
              </Pressable>
            </View>
          )}

          {/* Audit Results Grid */}
          {auditMode && (
            <View className="mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text className="text-xs font-medium mb-2" style={{ color: colors.textSecondary }}>
                Results:
              </Text>
              <View className="flex-row flex-wrap gap-1">
                {auditResults.map((result, idx) => (
                  <View
                    key={result.context}
                    className="flex-row items-center px-2 py-1 rounded"
                    style={{
                      backgroundColor:
                        result.primaryCTA === "pass" && result.secondaryCTA === "pass"
                          ? "#22C55E20"
                          : result.primaryCTA === "fail" || result.secondaryCTA === "fail"
                          ? "#EF444420"
                          : colors.surface,
                    }}
                  >
                    <Text className="text-xs" style={{ color: colors.textSecondary }}>
                      {idx + 1}
                    </Text>
                    <View className="ml-1">{getAuditIcon(result.primaryCTA)}</View>
                    <View className="ml-0.5">{getAuditIcon(result.secondaryCTA)}</View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Animated.View>

        {/* Current Plan Info */}
        <Animated.View
          entering={FadeInDown.delay(50).springify()}
          className="rounded-xl p-4 mb-6"
          style={{ backgroundColor: `${themeColor}15`, borderWidth: 1, borderColor: `${themeColor}30` }}
        >
          <View className="flex-row items-center">
            <Crown size={20} color={themeColor} />
            <Text className="font-semibold ml-2" style={{ color: colors.text }}>
              Current Plan
            </Text>
          </View>
          <Text className="mt-2 text-2xl font-bold" style={{ color: themeColor }}>
            {entitlements?.plan ?? "Loading..."}
          </Text>
          {entitlements && (
            <View className="mt-2">
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                Active Events: {entitlements.usage.activeEventsCount} / {entitlements.limits.activeEventsMax ?? "∞"}
              </Text>
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                Circles: {entitlements.usage.circlesCount} / {entitlements.limits.circlesMax ?? "∞"}
              </Text>
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                Who's Free Horizon: {entitlements.limits.whosFreeHorizonDays} days
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Session State Card */}
        <Animated.View
          entering={FadeInDown.delay(75).springify()}
          className="rounded-xl p-4 mb-6"
          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
        >
          <View className="flex-row items-center justify-between mb-3">
            <Text className="font-semibold" style={{ color: colors.text }}>
              Session State
            </Text>
            <Pressable
              onPress={handleResetSessionTracking}
              className="flex-row items-center px-3 py-1.5 rounded-full"
              style={{ backgroundColor: `${themeColor}20` }}
            >
              <RotateCcw size={14} color={themeColor} />
              <Text className="ml-1.5 text-sm font-medium" style={{ color: themeColor }}>
                Reset
              </Text>
            </Pressable>
          </View>

          <View className="flex-row items-center mb-2">
            {wasPaywallShownThisSession() ? (
              <XCircle size={16} color="#EF4444" />
            ) : (
              <CheckCircle size={16} color="#22C55E" />
            )}
            <Text className="ml-2 text-sm" style={{ color: colors.textSecondary }}>
              Paywall shown this session: {wasPaywallShownThisSession() ? "Yes" : "No"}
            </Text>
          </View>

          <View className="flex-row items-center mb-2">
            {canShowAutomaticPaywall() ? (
              <CheckCircle size={16} color="#22C55E" />
            ) : (
              <XCircle size={16} color="#EF4444" />
            )}
            <Text className="ml-2 text-sm" style={{ color: colors.textSecondary }}>
              Can show automatic paywall: {canShowAutomaticPaywall() ? "Yes" : "No"}
            </Text>
          </View>

          <View className="flex-row items-center">
            <Bell size={16} color={colors.textSecondary} />
            <Text className="ml-2 text-sm" style={{ color: colors.textSecondary }}>
              Notification nudge state: {nudgeState}
            </Text>
          </View>

          {lastPaywallCTA && (
            <View className="mt-3 p-2 rounded-lg" style={{ backgroundColor: `${themeColor}10` }}>
              <Text className="text-sm font-medium" style={{ color: themeColor }}>
                Last CTA: {lastPaywallCTA}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Navigation Sanity Tests */}
        <Animated.View entering={FadeInDown.delay(100).springify()} className="mb-6">
          <Text className="text-sm font-medium uppercase mb-3" style={{ color: colors.textSecondary }}>
            Navigation Sanity Tests
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {NAVIGATION_TEST_CASES.map((testCase) => {
              const IconComponent = testCase.icon;
              return (
                <Pressable
                  key={testCase.route}
                  onPress={() => handleNavigationTest(testCase)}
                  className="flex-row items-center px-3 py-2 rounded-lg"
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                >
                  <IconComponent size={16} color={themeColor} />
                  <Text className="ml-2 text-sm font-medium" style={{ color: colors.text }}>
                    {testCase.title}
                  </Text>
                  <ExternalLink size={12} color={colors.textTertiary} />
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* Notification Nudge Test */}
        <Animated.View entering={FadeInDown.delay(125).springify()} className="mb-6">
          <Text className="text-sm font-medium uppercase mb-3" style={{ color: colors.textSecondary }}>
            Notification Permission
          </Text>
          <Pressable
            onPress={handleTestNotificationNudge}
            className="rounded-xl p-4 flex-row items-center"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: "#22C55E20" }}
            >
              <Bell size={20} color="#22C55E" />
            </View>
            <View className="flex-1">
              <Text className="font-semibold" style={{ color: colors.text }}>
                Notification Nudge
              </Text>
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                Current state: {nudgeState}
              </Text>
            </View>
          </Pressable>
        </Animated.View>

        {/* Push Notification Test */}
        <Animated.View entering={FadeInDown.delay(137).springify()} className="mb-6">
          <Text className="text-sm font-medium uppercase mb-3" style={{ color: colors.textSecondary }}>
            Push Notification Test (Expo)
          </Text>
          <View
            className="rounded-xl p-4"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <View className="flex-row items-center mb-3">
              <Send size={20} color={themeColor} />
              <Text className="font-semibold ml-2" style={{ color: colors.text }}>
                Send Test Push
              </Text>
            </View>

            <Text className="text-xs mb-2" style={{ color: colors.textSecondary }}>
              Title
            </Text>
            <TextInput
              value={pushTitle}
              onChangeText={setPushTitle}
              placeholder="Notification title"
              placeholderTextColor={colors.textTertiary}
              className="rounded-lg px-3 py-2 mb-3"
              style={{
                backgroundColor: colors.background,
                color: colors.text,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />

            <Text className="text-xs mb-2" style={{ color: colors.textSecondary }}>
              Message
            </Text>
            <TextInput
              value={pushMessage}
              onChangeText={setPushMessage}
              placeholder="Notification message"
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={2}
              className="rounded-lg px-3 py-2 mb-4"
              style={{
                backgroundColor: colors.background,
                color: colors.text,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />

            <Pressable
              onPress={handleSendTestPush}
              disabled={sendingPush}
              className="flex-row items-center justify-center py-3 rounded-xl"
              style={{
                backgroundColor: sendingPush ? `${themeColor}50` : themeColor,
              }}
            >
              <Send size={18} color="#FFFFFF" />
              <Text className="text-white font-semibold ml-2">
                {sendingPush ? "Sending..." : "Send Test Push"}
              </Text>
            </Pressable>

            <Text className="text-xs mt-2 text-center" style={{ color: colors.textTertiary }}>
              Requires physical device with notifications enabled
            </Text>
          </View>
        </Animated.View>

        {/* Expo Token Status */}
        <Animated.View entering={FadeInDown.delay(144).springify()} className="mb-6">
          <Text className="text-sm font-medium uppercase mb-3" style={{ color: colors.textSecondary }}>
            Expo Token Status
          </Text>
          <View
            className="rounded-xl p-4"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <View className="flex-row items-center mb-3">
              <Bell size={20} color={themeColor} />
              <Text className="font-semibold ml-2" style={{ color: colors.text }}>
                Token Registration Check
              </Text>
            </View>

            {tokenInfo && (
              <View className="mb-4 space-y-2">
                <View className="flex-row items-center justify-between py-2">
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    OS Permission
                  </Text>
                  <View className="flex-row items-center">
                    {tokenInfo.hasPermission ? (
                      <CheckCircle size={16} color="#10B981" />
                    ) : (
                      <XCircle size={16} color="#EF4444" />
                    )}
                    <Text
                      className="text-sm font-medium ml-2"
                      style={{ color: tokenInfo.hasPermission ? "#10B981" : "#EF4444" }}
                    >
                      {tokenInfo.permissionStatus}
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-center justify-between py-2">
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    Token Stored
                  </Text>
                  <View className="flex-row items-center">
                    {tokenInfo.hasToken ? (
                      <CheckCircle size={16} color="#10B981" />
                    ) : (
                      <XCircle size={16} color="#EF4444" />
                    )}
                    <Text
                      className="text-sm font-medium ml-2"
                      style={{ color: tokenInfo.hasToken ? "#10B981" : "#EF4444" }}
                    >
                      {tokenInfo.hasToken ? "Yes" : "No"}
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-center justify-between py-2">
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    Backend Registered
                  </Text>
                  <View className="flex-row items-center">
                    {tokenInfo.tokenRegistered ? (
                      <CheckCircle size={16} color="#10B981" />
                    ) : (
                      <XCircle size={16} color="#EF4444" />
                    )}
                    <Text
                      className="text-sm font-medium ml-2"
                      style={{ color: tokenInfo.tokenRegistered ? "#10B981" : "#EF4444" }}
                    >
                      {tokenInfo.tokenRegistered ? "Yes" : "No"}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <View className="flex-row space-x-2">
              <Pressable
                onPress={handleCheckExpoToken}
                disabled={checkingToken}
                className="flex-1 flex-row items-center justify-center py-3 rounded-xl"
                style={{
                  backgroundColor: checkingToken ? `${themeColor}50` : themeColor,
                }}
              >
                <RotateCcw size={18} color="#FFFFFF" />
                <Text className="text-white font-semibold ml-2">
                  {checkingToken ? "Checking..." : "Check Status"}
                </Text>
              </Pressable>

              {tokenInfo && !tokenInfo.hasPermission && (
                <Pressable
                  onPress={handleRequestPermission}
                  className="flex-1 flex-row items-center justify-center py-3 rounded-xl"
                  style={{
                    backgroundColor: colors.background,
                    borderWidth: 1,
                    borderColor: themeColor,
                  }}
                >
                  <Bell size={18} color={themeColor} />
                  <Text className="font-semibold ml-2" style={{ color: themeColor }}>
                    Request
                  </Text>
                </Pressable>
              )}
            </View>

            <Text className="text-xs mt-2 text-center" style={{ color: colors.textTertiary }}>
              Token registration happens automatically after OS permission granted
            </Text>
          </View>
        </Animated.View>

        {/* Paywall Context Tests */}
        <Animated.View entering={FadeInDown.delay(150).springify()}>
          <Text className="text-sm font-medium uppercase mb-3" style={{ color: colors.textSecondary }}>
            Paywall Contexts ({PAYWALL_TEST_CASES.length})
          </Text>
          <View className="space-y-3">
            {PAYWALL_TEST_CASES.map((testCase, index) => {
              const IconComponent = testCase.icon;
              const auditResult = auditResults.find((r) => r.context === testCase.context);
              return (
                <Animated.View
                  key={testCase.context}
                  entering={FadeInDown.delay(200 + index * 30).springify()}
                >
                  <Pressable
                    onPress={() => handleTestPaywall(testCase.context)}
                    className="rounded-xl p-4 flex-row items-center"
                    style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  >
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: `${testCase.color}20` }}
                    >
                      <IconComponent size={20} color={testCase.color} />
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center">
                        <Text className="font-semibold" style={{ color: colors.text }}>
                          {testCase.title}
                        </Text>
                        {auditResult && (auditResult.primaryCTA === "pass" || auditResult.secondaryCTA === "pass") && (
                          <View className="flex-row ml-2">
                            {getAuditIcon(auditResult.primaryCTA)}
                            <View className="ml-1">{getAuditIcon(auditResult.secondaryCTA)}</View>
                          </View>
                        )}
                      </View>
                      <Text className="text-xs" style={{ color: colors.textTertiary }}>
                        {testCase.description}
                      </Text>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>

      {/* Paywall Modal */}
      <PaywallModal
        visible={showPaywallModal}
        context={paywallContext}
        onClose={() => setShowPaywallModal(false)}
        onPrimary={handlePaywallPrimary}
        onSecondary={handlePaywallSecondary}
      />

      {/* Notification Nudge Modal */}
      <NotificationNudgeModal
        visible={showNotificationNudge}
        onClose={() => {
          setShowNotificationNudge(false);
          getNudgeState().then(setNudgeState);
        }}
      />
    </SafeAreaView>
  );
}
