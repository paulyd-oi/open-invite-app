import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
  Linking,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { devLog, devWarn, devError } from "@/lib/devLog";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ChevronLeft,
  Bell,
  Shield,
  HelpCircle,
  Info,
  LogOut,
  Sun,
  Moon,
  Smartphone,
  UserX,
  Crown,
  RotateCcw,
  FileText,
  Scale,
  ExternalLink,
  Gift,
  CalendarDays,
} from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import DateTimePicker from "@react-native-community/datetimepicker";
import Purchases from "react-native-purchases";

import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useNotifications } from "@/hooks/useNotifications";
import { api } from "@/lib/api";
import { getProfileDisplay, getProfileInitial } from "@/lib/profileDisplay";
import { getImageSource } from "@/lib/imageSource";
import { EntityAvatar } from "@/components/EntityAvatar";
import { trackOfflineQueueReplayResult } from "@/analytics/analyticsEventsSSOT";
import { type UpdateProfileResponse, type GetProfileResponse } from "@/shared/contracts";
import { useTheme, THEME_COLORS, type ThemeMode } from "@/lib/ThemeContext";
import { buildGlassTokens } from "@/ui/glassTokens";
import {
  isRevenueCatEnabled,
  hasEntitlement,
  restorePurchases,
} from "@/lib/revenuecatClient";
import { ConfirmModal } from "@/components/ConfirmModal";
import { performLogout } from "@/lib/logout";
import { safeToast } from "@/lib/safeToast";
import { qk } from "@/lib/queryKeys";
import { APP_STORE_OFFER_CODE_URL } from "@/lib/config";
import { Button } from "@/ui/Button";
import { SettingsThemeSection } from "@/components/settings/SettingsThemeSection";
import { SettingsBirthdaySection } from "@/components/settings/SettingsBirthdaySection";
import { SettingsWorkScheduleSection, type WorkScheduleDay, type WorkScheduleSettings } from "@/components/settings/SettingsWorkScheduleSection";
import { SettingsSubscriptionSection } from "@/components/settings/SettingsSubscriptionSection";
import { SettingsNotificationsDevTools } from "@/components/settings/SettingsNotificationsDevTools";
import { SettingsPushDiagnosticsModal } from "@/components/settings/SettingsPushDiagnosticsModal";
import { SettingsAdminPasscodeModal } from "@/components/settings/SettingsAdminPasscodeModal";
import { ReferralCounterSection } from "@/components/settings/ReferralCounterSection";
import { SettingsProfileCard } from "@/components/settings/SettingsProfileCard";
import { checkAdminStatus } from "@/lib/adminApi";
import { useEntitlements, useRefreshProContract, usePremiumStatusContract } from "@/lib/entitlements";
import { useSubscription } from "@/lib/SubscriptionContext";
import { REFERRAL_TIERS } from "@/lib/freemiumLimits";
import { getRecentReceipts, clearPushReceipts } from "@/lib/push/pushReceiptStore";
import { buildDiagnosticsBundle } from "@/lib/devDiagnosticsBundle";
import { getDeadLetterCount, clearDeadLetterCount, loadQueue } from "@/lib/offlineQueue";
import { replayQueue } from "@/lib/offlineSync";

// Allowlist for Push Diagnostics visibility (TestFlight testers)
const PUSH_DIAG_ALLOWLIST = [
  "pauljdal@gmail.com",
  "paulydal@ymail.com",
  "cryptopdal@gmail.com",
  "pauld@awakenchurch.com",
];

interface SettingItemProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  rightElement?: React.ReactNode;
  showArrow?: boolean;
  isDark?: boolean;
}

function SettingItem({ icon, title, subtitle, onPress, onLongPress, rightElement, showArrow = true, isDark }: SettingItemProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !rightElement}
      className="flex-row items-center p-4"
      style={{ borderBottomWidth: 0.5, borderBottomColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" }}
    >
      <View
        className="w-10 h-10 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)" }}
      >
        {icon}
      </View>
      <View className="flex-1">
        <Text style={{ color: isDark ? "#FFFFFF" : "#1F2937" }} className="text-base font-medium">{title}</Text>
        {subtitle && <Text style={{ color: isDark ? "rgba(255,255,255,0.5)" : "#888" }} className="text-sm mt-0.5">{subtitle}</Text>}
      </View>
      {rightElement}
      {showArrow && onPress && !rightElement && (
        <Text style={{ color: isDark ? "#636366" : "#9CA3AF" }} className="text-lg">›</Text>
      )}
    </Pressable>
  );
}

// DEV-only components (ReplayQueueButton, DeadLetterDebugRow) moved to SettingsNotificationsDevTools
// ReferralCounterSection moved to src/components/settings/ReferralCounterSection.tsx

export default function SettingsScreen() {
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const { runPushDiagnostics, clearMyPushTokens, ensurePushRegistered } = useNotifications();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, setThemeColor, themeColorName, themeMode, setThemeMode, isDark, colors } = useTheme();
  const glass = buildGlassTokens(isDark, colors);

  // Push diagnostics state
  const [isPushDiagRunning, setIsPushDiagRunning] = useState(false);
  const [showPushDiagModal, setShowPushDiagModal] = useState(false);
  const [pushDiagReport, setPushDiagReport] = useState<string>("");  // Always-visible text report
  const [pushDiagResult, setPushDiagResult] = useState<{
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
  } | null>(null);
  const [isClearingTokens, setIsClearingTokens] = useState(false);

  // Check if user is in push diagnostics allowlist
  const userEmail = session?.user?.email?.toLowerCase() ?? "";
  const isPushDiagnosticsAllowed = PUSH_DIAG_ALLOWLIST.some(email => email.toLowerCase() === userEmail);
  // CRITICAL: Production must NEVER show Push Diagnostics - gate with __DEV__
  const canShowPushDiagnostics = __DEV__ && isPushDiagnosticsAllowed;

  // Handle push diagnostics tap - opens modal and runs diagnostic
  const handlePushDiagnostics = async () => {
    // Hard guard: no-op in production even if somehow invoked
    if (!__DEV__) return;
    if (isPushDiagRunning) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPushDiagResult(null);
    setShowPushDiagModal(true);
  };

  // Convert diagnostic result to readable text report
  const formatDiagReport = (r: typeof pushDiagResult): string => {
    if (!r) return "";
    const lines: string[] = [
      `=== PUSH DIAGNOSTICS PROOF REPORT ===`,
      `Status: ${r.ok ? "✅ SUCCESS" : "❌ FAILED: " + r.reason}`,
      `Started: ${r.startedAt ?? "N/A"}`,
      `Completed: ${r.completedAt ?? "N/A"}`,
      `Platform: ${r.platform ?? "N/A"}`,
      `Physical Device: ${r.isPhysicalDevice ? "Yes" : "No (simulator)"}`,
      `Permission: ${r.permission ?? "N/A"}`,
      `Permission Requested: ${r.permissionRequest ?? "No"}`,
      `Project ID: ${r.projectId ?? "NOT_FOUND"}`,
      `Project ID Source: ${r.projectIdSource ?? "N/A"}`,
      `Token Prefix: ${r.tokenPrefix ?? "N/A"}`,
      `Token Length: ${r.tokenLength ?? 0}`,
      `Token Error: ${r.tokenError ?? "None"}`,
      `Valid Token: ${r.isValidToken ? "Yes" : "No"}`,
      `Register URL: ${r.registerUrl ?? "/api/push/register"}`,
      `POST Status: ${r.postStatus ?? "N/A"}`,
      `POST Error: ${r.postError ?? "None"}`,
      `GET Status: ${r.getStatus ?? "N/A"}`,
      `Active Tokens: ${r.backendActiveCount ?? 0}`,
      `Last Registration: ${r.lastRegistrationTime ?? "Never"}`,
    ];
    if (r.exceptionMessage) {
      lines.push(`--- EXCEPTION ---`);
      lines.push(`Message: ${r.exceptionMessage}`);
      if (r.exceptionStack) {
        lines.push(`Stack: ${r.exceptionStack.substring(0, 200)}`);
      }
    }
    if (r.backendTokens && r.backendTokens.length > 0) {
      lines.push(`--- Backend Tokens (${r.backendTokens.length}) ---`);
      r.backendTokens.forEach((t, i) => {
        lines.push(`  ${i + 1}. ${t.tokenPrefix ?? "?"} [${t.isActive ? "ACTIVE" : "INACTIVE"}]`);
      });
    }
    if (r.postBody) {
      lines.push(`--- POST Response ---`);
      lines.push(JSON.stringify(r.postBody, null, 2).substring(0, 300));
    }
    if (r.getBody) {
      lines.push(`--- GET /api/push/me Response ---`);
      lines.push(JSON.stringify(r.getBody, null, 2).substring(0, 300));
    }
    return lines.join("\n");
  };

  // Generate JSON report for copying
  const getJsonReport = (): string => {
    if (!pushDiagResult) return "{}";
    return JSON.stringify(pushDiagResult, null, 2);
  };

  // Copy report to clipboard
  const handleCopyReport = async () => {
    const jsonReport = getJsonReport();
    try {
      await Clipboard.setStringAsync(jsonReport);
      safeToast.success("Copied!", "JSON report copied to clipboard");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      safeToast.error("Copy failed", "Could not copy to clipboard");
    }
  };

  // Actually run the diagnostics (called from modal)
  const doRunPushDiagnostics = async () => {
    // Hard guard: no-op in production even if somehow invoked
    if (!__DEV__) return;
    if (isPushDiagRunning) return;
    
    // PROOF LOG: Handler executed
    if (__DEV__) devLog("[PUSH_DIAG_UI] pressed register");
    
    setIsPushDiagRunning(true);
    setPushDiagResult(null);
    setPushDiagReport("Running diagnostics...");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    let finalResult: typeof pushDiagResult = null;
    
    try {
      const result = await runPushDiagnostics();
      finalResult = result;
      setPushDiagReport(formatDiagReport(result));
      
      if (result.ok) {
        safeToast.success("Push registered ✅", `Active: ${result.backendActiveCount ?? 0}`);
      }
    } catch (e: any) {
      // Capture exception details for debugging
      const exceptionMessage = e?.message || String(e) || "Unknown exception";
      const exceptionStack = e?.stack || "No stack available";
      
      if (__DEV__) devLog("[PUSH_DIAG_UI] exception caught:", exceptionMessage);
      
      finalResult = {
        ok: false,
        reason: "exception",
        isPhysicalDevice: false,
        exceptionMessage,
        exceptionStack,
      };
      setPushDiagReport(formatDiagReport(finalResult));
      safeToast.error("Push diagnostics error", exceptionMessage);
    } finally {
      // ALWAYS set result in finally block to guarantee UI update
      setPushDiagResult(finalResult);
      setIsPushDiagRunning(false);
      
      // PROOF LOG: Result set
      if (__DEV__) devLog("[PUSH_DIAG_UI] result set", JSON.stringify({
        ok: finalResult?.ok,
        reason: finalResult?.reason,
        hasResult: !!finalResult,
      }));
    }
  };

  // Handle clear tokens
  const handleClearTokens = async () => {
    if (isClearingTokens) return;
    setIsClearingTokens(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await clearMyPushTokens();
      if (result.ok) {
        setPushDiagResult(prev => prev ? {
          ...prev,
          backendTokens: result.tokens ?? [],
          backendActiveCount: 0,
        } : null);
        safeToast.success("Tokens cleared", `Remaining: ${result.tokens?.length ?? 0}`);
      } else {
        safeToast.error("Clear failed", result.error || "Unknown");
      }
    } catch (e: any) {
      safeToast.error("Clear error", e?.message || "Unknown");
    } finally {
      setIsClearingTokens(false);
    }
  };

  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showThemeModePicker, setShowThemeModePicker] = useState(false);

  // Confirm modal states
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  // =====================================================
  // P0 ADMIN UNLOCK: Hidden 7-tap unlock mechanism
  // =====================================================
  const ADMIN_UNLOCK_KEY = "@oi_admin_unlocked_v1";
  const ADMIN_TAP_COUNT = 7;
  const ADMIN_TAP_WINDOW_MS = 2500;
  
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [passcodeError, setPasscodeError] = useState(false);
  const adminTapTimestampsRef = useRef<number[]>([]);
  
  // Load persisted unlock state on mount
  useEffect(() => {
    const loadUnlockState = async () => {
      try {
        const stored = await AsyncStorage.getItem(ADMIN_UNLOCK_KEY);
        if (stored === "true") {
          setAdminUnlocked(true);
          if (__DEV__) devLog("[P0_ADMIN_UNLOCK_TRACE] already_unlocked (restored from storage)");
        }
      } catch (e) {
        // Fail silently - default to locked
      }
    };
    loadUnlockState();
  }, []);

  // [P0_ADMIN_UNLOCK_TRACE] Audit passcode config at mount
  useEffect(() => {
    if (__DEV__) {
      const envCode = Constants.expoConfig?.extra?.adminUnlockCode
        ?? process.env.EXPO_PUBLIC_ADMIN_UNLOCK_CODE;
      devLog(
        `[P0_ADMIN_UNLOCK_TRACE] passcode_configured=${!!envCode} source=EXPO_PUBLIC_ADMIN_UNLOCK_CODE length=${envCode?.length ?? 0}`
      );
    }
  }, []);
  
  // Get passcode from env var with DEV fallback
  const getAdminPasscode = useCallback((): string | null => {
    const envCode = Constants.expoConfig?.extra?.adminUnlockCode 
      ?? process.env.EXPO_PUBLIC_ADMIN_UNLOCK_CODE;
    if (envCode) return envCode;
    // DEV-only fallback
    if (__DEV__) return "0000";
    // Production: fail closed
    if (__DEV__) devLog("[P0_ADMIN_UNLOCK_FAIL_CLOSED] no passcode configured in production");
    return null;
  }, []);
  
  // Handle 7-tap detection on avatar (profile card)
  const handleAdminUnlockTap = useCallback(() => {
    const now = Date.now();
    const cutoff = now - ADMIN_TAP_WINDOW_MS;
    
    // Filter to taps within window
    const recentTaps = adminTapTimestampsRef.current.filter(t => t > cutoff);
    recentTaps.push(now);
    adminTapTimestampsRef.current = recentTaps;
    
    const tapNum = recentTaps.length;
    if (__DEV__) devLog(`[P0_ADMIN_UNLOCK_TRACE] tapCount=${tapNum}/${ADMIN_TAP_COUNT}`);
    
    // [P2_TRUST_SWEEP] Only give haptic after tap 5 to avoid signaling to casual users
    if (tapNum >= 5 && tapNum < ADMIN_TAP_COUNT) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    if (tapNum >= ADMIN_TAP_COUNT) {
      // Reset tap counter
      adminTapTimestampsRef.current = [];
      
      // Check if already unlocked
      if (adminUnlocked) {
        if (__DEV__) devLog('[P0_ADMIN_UNLOCK_TRACE] already_unlocked, suppressed');
        return;
      }

      // DEV BYPASS: auto-unlock for admin email without passcode modal
      // This block is tree-shaken in production builds (__DEV__ is false)
      if (__DEV__ && userEmail === "pauljdal@gmail.com") {
        devLog("[P0_ADMIN_UNLOCK_TRACE] dev_bypass email=pauljdal@gmail.com");
        setAdminUnlocked(true);
        (async () => {
          try {
            await AsyncStorage.setItem(ADMIN_UNLOCK_KEY, "true");
            devLog("[P0_ADMIN_UNLOCK_TRACE] persisted to AsyncStorage");
          } catch (e) {
            devLog("[P0_ADMIN_UNLOCK_TRACE] AsyncStorage write failed (non-fatal)");
          }
        })();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeToast.success("Enabled", "");
        devLog("[P0_ADMIN_UNLOCK_TRACE] admin_gate isAdmin=" + String(adminStatus?.isAdmin ?? "unknown"));
        return;
      }
      
      // Check if passcode is configured
      const passcode = getAdminPasscode();
      if (!passcode) {
        if (__DEV__) devLog("[P0_ADMIN_UNLOCK_TRACE] FAIL_CLOSED - no passcode configured");
        // Production: show user-facing toast
        if (!__DEV__) safeToast.warning("Admin unlock unavailable", "");
        return;
      }
      
      if (__DEV__) devLog("[P0_ADMIN_UNLOCK_TRACE] modal_opened");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPasscodeInput("");
      setPasscodeError(false);
      setShowPasscodeModal(true);
    }
  }, [adminUnlocked, getAdminPasscode, userEmail]);
  
  // Handle passcode submission
  const handlePasscodeSubmit = useCallback(async () => {
    const correctCode = getAdminPasscode();
    if (!correctCode) return;
    
    if (passcodeInput === correctCode) {
      // Correct passcode
      if (__DEV__) devLog("[P0_ADMIN_UNLOCK_TRACE] code_ok");
      setAdminUnlocked(true);
      setShowPasscodeModal(false);
      setPasscodeInput("");
      setPasscodeError(false);
      
      // Persist to AsyncStorage
      try {
        await AsyncStorage.setItem(ADMIN_UNLOCK_KEY, "true");
        if (__DEV__) devLog("[P0_ADMIN_UNLOCK_TRACE] persisted to AsyncStorage");
      } catch (e) {
        if (__DEV__) devLog("[P0_ADMIN_UNLOCK_TRACE] AsyncStorage write failed (non-fatal)");
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Enabled", "");
      
      // [P0_ADMIN_UNLOCK_TRACE] Log admin gate status
      if (__DEV__) devLog("[P0_ADMIN_UNLOCK_TRACE] admin_gate isAdmin=" + String(adminStatus?.isAdmin ?? "unknown"));
    } else {
      // Wrong passcode
      setPasscodeError(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (__DEV__) devLog("[P0_ADMIN_UNLOCK_TRACE] code_bad");
    }
  }, [passcodeInput, getAdminPasscode]);
  // =====================================================


  // Birthday states
  const [showBirthdaySection, setShowBirthdaySection] = useState(false);
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showBirthdayToFriends, setShowBirthdayToFriends] = useState(false);
  const [hideBirthdays, setHideBirthdays] = useState(false);
  const [omitBirthdayYear, setOmitBirthdayYear] = useState(false);

  // Avatar source with auth headers
  const [avatarSource, setAvatarSource] = useState<{ uri: string; headers?: { Authorization: string } } | null>(null);

  // Work schedule states
  const [showWorkScheduleSection, setShowWorkScheduleSection] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState<{ day: number; type: "start" | "end" | "block2Start" | "block2End" } | null>(null);
  const [expandedBlock2Days, setExpandedBlock2Days] = useState<Set<number>>(new Set());

  // Fetch work schedule
  // Gate on bootStatus to prevent queries during logout
  const { data: workScheduleData } = useQuery({
    queryKey: qk.workSchedule(),
    queryFn: () => api.get<{ schedules: WorkScheduleDay[]; settings: WorkScheduleSettings }>("/api/work-schedule"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  const workSchedules = workScheduleData?.schedules ?? [];
  const workSettings = workScheduleData?.settings ?? { showOnCalendar: true };

  // DEV: Log schedule data when it changes
  useEffect(() => {
    if (__DEV__ && workScheduleData?.schedules) {
      const block2Data = workScheduleData.schedules
        .filter(s => s.block2StartTime || s.block2EndTime)
        .map(s => ({
          day: s.dayName,
          block2Start: s.block2StartTime,
          block2End: s.block2EndTime,
        }));
      if (block2Data.length > 0) {
        devLog("[ScheduleBlocks] Loaded from server:", block2Data);
      }
    }
  }, [workScheduleData?.schedules]);

  // Track if we've done initial block2 expansion sync (prevents overwriting user changes)
  const didSyncBlock2Ref = useRef(false);

  // Auto-expand block2 UI for days that have saved block2 times (only on first load)
  useEffect(() => {
    if (didSyncBlock2Ref.current || !workScheduleData?.schedules) return;
    const daysWithBlock2 = workScheduleData.schedules
      .filter((s) => s.block2StartTime && s.block2EndTime)
      .map((s) => s.dayOfWeek);
    if (daysWithBlock2.length > 0) {
      setExpandedBlock2Days(new Set(daysWithBlock2));
    }
    didSyncBlock2Ref.current = true;
  }, [workScheduleData?.schedules]);

  // Fetch current profile to get calendarBio
  // Gate on bootStatus to prevent queries during logout
  const { data: profileData } = useQuery({
    queryKey: qk.profile(),
    queryFn: () => api.get<GetProfileResponse>("/api/profile"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  // Check admin status (fail safe - returns isAdmin: false on any error)
  // Gate on bootStatus to prevent queries during logout
  const { data: adminStatus, isLoading: adminStatusLoading } = useQuery({
    queryKey: qk.adminStatus(),
    queryFn: checkAdminStatus,
    enabled: isAuthedForNetwork(bootStatus, session),
    retry: false,
  });

  // DEV logging for admin decision
  const canShowAdminSection = !!adminStatus?.isAdmin;
  React.useEffect(() => {
    if (__DEV__) {
      devLog("[ADMIN_DECISION]", {
        userId: session?.user?.id?.slice(0, 8) ?? "none",
        isAdmin: adminStatus?.isAdmin ?? false,
        canShowAdminSection,
        email: adminStatus?.email ?? "unknown",
        message: adminStatus?.message ?? null,
        adminStatusLoading,
        bootStatus,
        whyShownOrHidden: adminStatusLoading ? "loading" : !adminStatus?.isAdmin ? "not_admin" : "showing_admin_section",
      });
    }
  }, [session?.user?.id, adminStatus, adminStatusLoading, bootStatus, canShowAdminSection]);

  // Entitlements for premium status display
  const { isPro: userIsPremium, isLoading: entitlementsLoading, entitlements } = usePremiumStatusContract();
  const refreshProContract = useRefreshProContract();
  const subscription = useSubscription();
  const [isRefreshingEntitlements, setIsRefreshingEntitlements] = useState(false);
  const [isRestoringPurchases, setIsRestoringPurchases] = useState(false);

  /**
   * CANONICAL SSOT: Uses refreshProContract for all Pro status refresh.
   * Called by: Refresh button
   */
  const handleRefreshEntitlements = async () => {
    setIsRefreshingEntitlements(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // [PRO_SOT] Log BEFORE state
    if (__DEV__) {
      devLog("[PRO_SOT] BEFORE screen=settings userIsPremium=", userIsPremium);
    }
    
    try {
      // CANONICAL: Use refreshProContract for SSOT
      const { rcIsPro, backendIsPro, combinedIsPro } = await refreshProContract({ reason: "manual_refresh:settings" });
      
      // [PRO_SOT] Log AFTER state
      if (__DEV__) {
        devLog("[PRO_SOT] AFTER screen=settings combinedIsPro=", combinedIsPro);
      }
      
      // Show result toast based on COMBINED value
      if (combinedIsPro) {
        safeToast.success("Pro Active", "Your Pro membership is active!");
      } else {
        safeToast.info("Free Plan", "No active Pro membership found.");
      }
    } catch (error) {
      if (__DEV__) {
        devError("[PRO_SOT] ERROR screen=settings", error);
      }
      safeToast.error("Refresh Failed", "Failed to refresh status. Please try again.");
    } finally {
      setIsRefreshingEntitlements(false);
    }
  };

  const handleRestorePurchases = async () => {
    setIsRestoringPurchases(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // [PRO_SOT] Log BEFORE state
    if (__DEV__) {
      devLog("[PRO_SOT] BEFORE screen=settings_restore userIsPremium=", userIsPremium);
    }

    const result = await subscription.restore();
    
    if (result.ok) {
      // CANONICAL: Use refreshProContract for SSOT after restore
      const { rcIsPro, backendIsPro, combinedIsPro } = await refreshProContract({ reason: "restore:settings" });
      
      // [PRO_SOT] Log AFTER state
      if (__DEV__) {
        devLog("[PRO_SOT] AFTER screen=settings_restore combinedIsPro=", combinedIsPro);
      }
      
      setIsRestoringPurchases(false);
      
      if (combinedIsPro) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeToast.success("Restored!", "Your subscription has been restored.");
      } else {
        safeToast.info("No Purchases Found", "We couldn't find any previous purchases.");
      }
    } else {
      setIsRestoringPurchases(false);
      safeToast.error("Restore Failed", result.error || "Failed to restore purchases. Please try again.");
    }
  };

  // Sync birthday state from profile data
  useEffect(() => {
    if (profileData?.profile) {
      if (profileData.profile.birthday) {
        setBirthday(new Date(profileData.profile.birthday));
      }
      setShowBirthdayToFriends(profileData.profile.showBirthdayToFriends);
      setHideBirthdays(profileData.profile.hideBirthdays);
      setOmitBirthdayYear(profileData.profile.omitBirthdayYear);
    }
  }, [profileData]);

  // Load avatar source with auth headers
  useEffect(() => {
    const loadAvatar = async () => {
      const { avatarUri } = getProfileDisplay({ profileData, session });
      const source = await getImageSource(avatarUri);
      setAvatarSource(source);
    };
    loadAvatar();
  }, [profileData, session]);

  const updateBirthdayMutation = useMutation({
    mutationFn: (data: { birthday?: string; showBirthdayToFriends?: boolean; hideBirthdays?: boolean; omitBirthdayYear?: boolean }) =>
      api.put<UpdateProfileResponse>("/api/profile", data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: qk.profile() });
      queryClient.invalidateQueries({ queryKey: qk.birthdays() });
    },
    onError: () => {
      safeToast.error("Save Failed", "Failed to update birthday settings");
    },
  });

  const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  const updateWorkScheduleMutation = useMutation({
    mutationFn: (data: { dayOfWeek: number; isEnabled?: boolean; startTime?: string; endTime?: string; label?: string; block2StartTime?: string | null; block2EndTime?: string | null }) => {
      if (__DEV__ && (data.block2StartTime !== undefined || data.block2EndTime !== undefined)) {
        devLog("[ScheduleBlocks] Saving to server:", {
          dayOfWeek: data.dayOfWeek,
          block2StartTime: data.block2StartTime,
          block2EndTime: data.block2EndTime,
        });
      }
      return api.put<{ schedule: WorkScheduleDay }>(`/api/work-schedule/${data.dayOfWeek}`, { ...data, timezone: deviceTimezone });
    },
    onSuccess: (response) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (__DEV__ && response?.schedule) {
        devLog("[ScheduleBlocks] Server responded:", {
          day: response.schedule.dayName,
          block2StartTime: response.schedule.block2StartTime,
          block2EndTime: response.schedule.block2EndTime,
        });
      }
      queryClient.invalidateQueries({ queryKey: qk.workSchedule() });
    },
    onError: () => {
      safeToast.error("Save Failed", "Failed to update work schedule");
    },
  });

  const updateWorkSettingsMutation = useMutation({
    mutationFn: (data: { showOnCalendar: boolean }) =>
      api.put<{ settings: WorkScheduleSettings }>("/api/work-schedule/settings", { ...data, timezone: deviceTimezone }),
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: qk.workSchedule() });
    },
    onError: () => {
      safeToast.error("Save Failed", "Failed to update work settings");
    },
  });

  const handleSaveTheme = async (color: string) => {
    await setThemeColor(color);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowThemePicker(false);
  };

  const handleSaveThemeMode = async (mode: ThemeMode) => {
    await setThemeMode(mode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowThemeModePicker(false);
  };

  const getThemeModeLabel = (mode: ThemeMode) => {
    switch (mode) {
      case "light": return "Light";
      case "dark": return "Dark";
      case "auto": return "Auto (System)";
    }
  };

  const getThemeModeIcon = (mode: ThemeMode) => {
    switch (mode) {
      case "light": return <Sun size={20} color={themeColor} />;
      case "dark": return <Moon size={20} color={themeColor} />;
      case "auto": return <Smartphone size={20} color={themeColor} />;
    }
  };

  const handleLogout = () => {
    setShowSignOutConfirm(true);
  };

  const confirmSignOut = async () => {
    setShowSignOutConfirm(false);
    await performLogout({ screen: "settings", queryClient, router });
  };

  // Birthday handlers
  const handleDateChange = (_event: unknown, selectedDate?: Date) => {
    if (Platform.OS !== "ios") {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setBirthday(selectedDate);
      updateBirthdayMutation.mutate({ birthday: selectedDate.toISOString() });
    }
  };

  const handleBirthdayToggle = (field: "showBirthdayToFriends" | "hideBirthdays" | "omitBirthdayYear", value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (field === "showBirthdayToFriends") {
      setShowBirthdayToFriends(value);
    } else if (field === "hideBirthdays") {
      setHideBirthdays(value);
    } else {
      setOmitBirthdayYear(value);
    }
    updateBirthdayMutation.mutate({ [field]: value });
  };

  // Work schedule helpers
  const formatDateToTime = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  const handleWorkScheduleToggle = (dayOfWeek: number, isEnabled: boolean) => {
    updateWorkScheduleMutation.mutate({ dayOfWeek, isEnabled });
  };

  const handleWorkScheduleTimeChange = (dayOfWeek: number, type: "start" | "end" | "block2Start" | "block2End", date: Date) => {
    const timeStr = formatDateToTime(date);
    
    // Find current schedule to get existing values for complete updates
    const currentSchedule = workSchedules.find(s => s.dayOfWeek === dayOfWeek);
    
    if (__DEV__) {
      devLog("[ScheduleBlocks] handleWorkScheduleTimeChange", {
        dayOfWeek,
        type,
        newTimeStr: timeStr,
        currentBlock2Start: currentSchedule?.block2StartTime,
        currentBlock2End: currentSchedule?.block2EndTime,
      });
    }
    
    if (type === "start") {
      updateWorkScheduleMutation.mutate({ dayOfWeek, startTime: timeStr });
    } else if (type === "end") {
      updateWorkScheduleMutation.mutate({ dayOfWeek, endTime: timeStr });
    } else if (type === "block2Start") {
      // Send BOTH block2 times to prevent backend from clearing the other field
      const block2EndTime = currentSchedule?.block2EndTime ?? "17:00";
      updateWorkScheduleMutation.mutate({ 
        dayOfWeek, 
        block2StartTime: timeStr,
        block2EndTime: block2EndTime,
      });
    } else if (type === "block2End") {
      // Send BOTH block2 times to prevent backend from clearing the other field
      const block2StartTime = currentSchedule?.block2StartTime ?? "13:00";
      updateWorkScheduleMutation.mutate({ 
        dayOfWeek, 
        block2StartTime: block2StartTime,
        block2EndTime: timeStr,
      });
    }
  };

  // Toggle second block visibility for a day
  const toggleBlock2 = (dayOfWeek: number) => {
    const newSet = new Set(expandedBlock2Days);
    if (newSet.has(dayOfWeek)) {
      newSet.delete(dayOfWeek);
      // Clear block2 times when removing
      updateWorkScheduleMutation.mutate({ dayOfWeek, block2StartTime: null, block2EndTime: null });
      if (__DEV__) {
        devLog("[DEV_DECISION] work_schedule_block2_remove", { dayOfWeek });
      }
    } else {
      newSet.add(dayOfWeek);
      // Save default block2 times immediately so they persist
      // Default to 13:00-17:00 (1pm-5pm) for afternoon block
      updateWorkScheduleMutation.mutate({ dayOfWeek, block2StartTime: "13:00", block2EndTime: "17:00" });
      if (__DEV__) {
        devLog("[DEV_DECISION] work_schedule_block2_add", { dayOfWeek, defaultTimes: "13:00-17:00" });
      }
    }
    setExpandedBlock2Days(newSet);
  };

  // [QA-8] Suppress login flash: only show sign-in prompt when definitively logged out
  if (!session) {
    if (bootStatus !== 'loggedOut') return null;
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
        {/* Custom Header with Back Button */}
        <View className="flex-row items-center px-4 py-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
            style={{
              backgroundColor: colors.surface,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.1,
              shadowRadius: 2,
            }}
          >
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text style={{ color: colors.text }} className="text-xl font-sora-bold">Settings</Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text style={{ color: colors.textSecondary }} className="text-base mb-4">Please sign in to access settings</Text>
          <Button
            variant="primary"
            label="Sign In"
            onPress={() => router.replace("/login")}
          />
        </View>
      </SafeAreaView>
    );
  }

  const user = session?.user ?? null;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }} edges={["top"]}>
      {/* Custom Header with Back Button */}
      <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }}>
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{
            backgroundColor: colors.surface,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: isDark ? 0 : 0.1,
            shadowRadius: 2,
          }}
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={{ color: colors.text, paddingVertical: 4, paddingHorizontal: 4 }} className="text-xl font-sora-bold">Settings</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Section */}
        <SettingsProfileCard
          avatarSource={avatarSource}
          displayName={getProfileDisplay({ profileData, session, fallbackName: "Add your name" }).displayName}
          colors={colors}
          isDark={isDark}
          themeColor={themeColor}
          initials={getProfileInitial({ profileData, session })}
          onAdminUnlockTap={handleAdminUnlockTap}
          onEditProfile={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/edit-profile");
          }}
        />

        {/* Theme Section */}
        <SettingsThemeSection
          themeMode={themeMode}
          themeColor={themeColor}
          themeColorName={themeColorName}
          showThemeModePicker={showThemeModePicker}
          showThemePicker={showThemePicker}
          colors={colors}
          isDark={isDark}
          onToggleModePicker={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowThemeModePicker(!showThemeModePicker);
          }}
          onToggleColorPicker={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowThemePicker(!showThemePicker);
          }}
          onSaveThemeMode={handleSaveThemeMode}
          onSaveTheme={handleSaveTheme}
        />

        {/* Account Section */}
        <Animated.View entering={FadeInDown.delay(120).springify()} className="mx-4 mt-6">
          <Text style={{ color: isDark ? "rgba(255,255,255,0.4)" : "#999", letterSpacing: 0.5 }} className="text-xs font-semibold mb-2 ml-2">ACCOUNT</Text>
          <View style={{ ...glass.card }} className="overflow-hidden">
            <SettingItem
              icon={<Shield size={20} color={themeColor} />}
              title="Account Settings"
              subtitle="Email, password, data & account"
              isDark={isDark}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/account-settings");
              }}
            />
          </View>
        </Animated.View>

        {/* P0: Phone Number Section REMOVED - feature deprecated */}

        {/* Notifications Section */}
        <Animated.View entering={FadeInDown.delay(150).springify()} className="mx-4 mt-6">
          <Text style={{ color: isDark ? "rgba(255,255,255,0.4)" : "#999", letterSpacing: 0.5 }} className="text-xs font-semibold mb-2 ml-2">NOTIFICATIONS</Text>
          <View style={{ ...glass.card }} className="overflow-hidden">
            <SettingItem
              icon={<Bell size={20} color={themeColor} />}
              title="Notification Preferences"
              subtitle="Customize what you get notified about"
              isDark={isDark}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/notification-settings");
              }}
            />
            {/* Push Diagnostics - visible only to allowlisted testers in DEV builds */}
            <SettingsNotificationsDevTools
              canShowPushDiagnostics={canShowPushDiagnostics}
              isPushDiagRunning={isPushDiagRunning}
              isDark={isDark}
              sessionUserId={session?.user?.id ?? null}
              sessionUserEmail={session?.user?.email ?? null}
              onPushDiagnostics={handlePushDiagnostics}
              onForceReregister={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                devLog("[P0_PUSH_REG] FORCE_REREGISTER triggered from Settings");
                await ensurePushRegistered({ reason: "settings_force", force: true });
              }}
            />
          </View>
        </Animated.View>

        {/* Subscription Section - Hidden for launch, will be enabled in future update */}
        {/* <Animated.View entering={FadeInDown.delay(155).springify()} className="mx-4 mt-6">
          <Text style={{ color: isDark ? "rgba(255,255,255,0.4)" : "#999", letterSpacing: 0.5 }} className="text-xs font-semibold mb-2 ml-2">SUBSCRIPTION</Text>
          <View style={{ ...glass.card }} className="overflow-hidden">
            {isPremium ? (
              <View className="p-4">
                <View className="flex-row items-center">
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: "#FFD70020" }}
                  >
                    <Crown size={20} color="#FFD700" />
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: colors.text }} className="text-base font-medium">Premium Member</Text>
                    <Text style={{ color: colors.textSecondary }} className="text-sm">Unlimited access to all features</Text>
                  </View>
                  <View className="px-3 py-1 rounded-full" style={{ backgroundColor: "#10B98120" }}>
                    <Text style={{ color: "#10B981" }} className="text-xs font-medium">Active</Text>
                  </View>
                </View>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/paywall");
                  }}
                  className="flex-row items-center p-4"
                  style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: "#FFD70020" }}
                  >
                    <Crown size={20} color="#FFD700" />
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: colors.text }} className="text-base font-medium">Go Premium</Text>
                    <Text style={{ color: colors.textSecondary }} className="text-sm">Unlock premium themes, effects & more</Text>
                  </View>
                  <View className="px-3 py-1 rounded-full" style={{ backgroundColor: `${themeColor}20` }}>
                    <Text style={{ color: themeColor }} className="text-xs font-medium">Upgrade</Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={handleRestorePurchases}
                  disabled={isRestoringPurchases}
                  className="flex-row items-center p-4"
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
                  >
                    <RotateCcw size={20} color={colors.textSecondary} />
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: colors.text }} className="text-base font-medium">
                      {isRestoringPurchases ? "Restoring..." : "Restore Purchases"}
                    </Text>
                    <Text style={{ color: colors.textSecondary }} className="text-sm">Recover previous subscription</Text>
                  </View>
                </Pressable>
              </>
            )}
          </View>
        </Animated.View> */}

        {/* Invite Friends Section */}
        <Animated.View entering={FadeInDown.delay(160).springify()} className="mx-4 mt-6">
          <Text style={{ color: isDark ? "rgba(255,255,255,0.4)" : "#999", letterSpacing: 0.5 }} className="text-xs font-semibold mb-2 ml-2">INVITE FRIENDS</Text>
          <View style={{ ...glass.card }} className="overflow-hidden">
            {/* Referral Counter */}
            <ReferralCounterSection isDark={isDark} colors={colors} themeColor={themeColor} />

            {/* Invite Friends Button */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/invite");
              }}
              className="flex-row items-center p-4"
              style={{ borderTopWidth: 1, borderTopColor: colors.separator }}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: "#10B98120" }}
              >
                <Gift size={20} color="#10B981" />
              </View>
              <View className="flex-1">
                <Text style={{ color: colors.text }} className="text-base font-medium">Invite More Friends</Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm">Plan better with more friends on Open Invite</Text>
              </View>
              <Text style={{ color: colors.textTertiary }} className="text-lg">›</Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* Subscription Section - Between Referral and Birthdays */}
        {/* P0 INVARIANT: Subscription block must never be blank. Always render Free/Pro/Error fallback. */}
        {__DEV__ && (() => { devLog("[DEV_DECISION] pro_ui_gate screen=settings state=" + (entitlementsLoading ? "loading_default_free" : userIsPremium ? "pro" : "free") + " reason=" + (entitlementsLoading ? "entitlements_fetching_default_free" : "entitlements_loaded_isPremium=" + userIsPremium)); return null; })()}
        {__DEV__ && (() => { devLog("[DEV_DECISION] pro_cta_hidden screen=settings hidden=" + userIsPremium); return null; })()}
        <Animated.View entering={FadeInDown.delay(167).springify()} className="mx-4 mt-6">
          <Text style={{ color: isDark ? "rgba(255,255,255,0.4)" : "#999", letterSpacing: 0.5 }} className="text-xs font-semibold mb-2 ml-2">SUBSCRIPTION</Text>
          {/* Always render the subscription card - loading state shows "Free" as safe default, not blank */}
          <SettingsSubscriptionSection
            userIsPremium={userIsPremium}
            entitlementsLoading={entitlementsLoading}
            isRestoringPurchases={isRestoringPurchases}
            isRefreshingEntitlements={isRefreshingEntitlements}
            colors={colors}
            isDark={isDark}
            themeColor={themeColor}
            onNavigateToSubscription={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/subscription?source=settings");
            }}
            onOpenPaywall={async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const result = await subscription.openPaywall({ source: "settings", preferred: "yearly" });
              if (!result.ok && result.error && !result.cancelled) {
                router.push("/subscription?source=settings");
              }
            }}
            onRestorePurchases={handleRestorePurchases}
            onRefreshEntitlements={handleRefreshEntitlements}
            onRedeemCode={Platform.OS === "ios" ? async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              // Use App Store deep link — reliable on all iOS versions.
              // RevenueCat's presentCodeRedemptionSheet uses deprecated SK1 API
              // that silently fails on iOS 16+.
              Linking.openURL(APP_STORE_OFFER_CODE_URL).catch(() => {});
            } : undefined}
          />
        </Animated.View>

        {/* Birthdays Section */}
        <Animated.View entering={FadeInDown.delay(175).springify()} className="mx-4 mt-6">
          <Text style={{ color: isDark ? "rgba(255,255,255,0.4)" : "#999", letterSpacing: 0.5 }} className="text-xs font-semibold mb-2 ml-2">BIRTHDAYS</Text>
          <SettingsBirthdaySection
            showBirthdaySection={showBirthdaySection}
            birthday={birthday}
            showDatePicker={showDatePicker}
            showBirthdayToFriends={showBirthdayToFriends}
            omitBirthdayYear={omitBirthdayYear}
            hideBirthdays={hideBirthdays}
            colors={colors}
            isDark={isDark}
            themeColor={themeColor}
            onToggleSection={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowBirthdaySection(!showBirthdaySection);
            }}
            onSetShowDatePicker={setShowDatePicker}
            onDateChange={handleDateChange}
            onBirthdayToggle={handleBirthdayToggle}
          />
        </Animated.View>

        {/* Work Schedule Section */}
        <Animated.View entering={FadeInDown.delay(185).springify()} className="mx-4 mt-6">
          <Text style={{ color: isDark ? "rgba(255,255,255,0.4)" : "#999", letterSpacing: 0.5 }} className="text-xs font-semibold mb-2 ml-2">WORK SCHEDULE</Text>
          <SettingsWorkScheduleSection
            showWorkScheduleSection={showWorkScheduleSection}
            workSchedules={workSchedules}
            workSettings={workSettings}
            showTimePicker={showTimePicker}
            expandedBlock2Days={expandedBlock2Days}
            colors={colors}
            isDark={isDark}
            themeColor={themeColor}
            onToggleSection={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowWorkScheduleSection(!showWorkScheduleSection);
            }}
            onSetShowTimePicker={setShowTimePicker}
            onWorkScheduleToggle={handleWorkScheduleToggle}
            onWorkScheduleTimeChange={handleWorkScheduleTimeChange}
            onToggleBlock2={toggleBlock2}
            onUpdateWorkSettings={(data) => updateWorkSettingsMutation.mutate(data)}
          />
        </Animated.View>

        {/* Calendar Integration Section */}
        <Animated.View entering={FadeInDown.delay(190).springify()} className="mx-4 mt-6">
          <Text style={{ color: isDark ? "rgba(255,255,255,0.4)" : "#999", letterSpacing: 0.5 }} className="text-xs font-semibold mb-2 ml-2">CALENDAR</Text>
          <View style={{ ...glass.card }} className="overflow-hidden">
            <SettingItem
              icon={<CalendarDays size={20} color={themeColor} />}
              title="Import Device Calendar"
              subtitle="One-time import from Apple or Google Calendar"
              isDark={isDark}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/import-calendar");
              }}
            />
          </View>
        </Animated.View>

        {/* Privacy Section */}
        <Animated.View entering={FadeInDown.delay(200).springify()} className="mx-4 mt-6">
          <Text style={{ color: isDark ? "rgba(255,255,255,0.4)" : "#999", letterSpacing: 0.5 }} className="text-xs font-semibold mb-2 ml-2">PRIVACY & SECURITY</Text>
          <View style={{ ...glass.card }} className="overflow-hidden">
            <SettingItem
              icon={<UserX size={20} color="#EF4444" />}
              title="Blocked Contacts"
              subtitle="Manage blocked accounts and identifiers"
              isDark={isDark}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/blocked-contacts");
              }}
            />
            <SettingItem
              icon={<Shield size={20} color="#4ECDC4" />}
              title="Privacy Settings"
              subtitle="Control who can see your events"
              isDark={isDark}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/privacy-settings");
              }}
            />
          </View>
        </Animated.View>

        {/* Support Section */}
        <Animated.View entering={FadeInDown.delay(250).springify()} className="mx-4 mt-6">
          <Text style={{ color: isDark ? "rgba(255,255,255,0.4)" : "#999", letterSpacing: 0.5 }} className="text-xs font-semibold mb-2 ml-2">SUPPORT</Text>
          <View style={{ ...glass.card }} className="overflow-hidden">
            <SettingItem
              icon={<HelpCircle size={20} color="#45B7D1" />}
              title="Help & FAQ"
              subtitle="Complete guide to all features"
              isDark={isDark}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/help-faq");
              }}
            />
            <SettingItem
              icon={<Info size={20} color="#9B59B6" />}
              title="About Open Invite"
              subtitle={`Version ${Constants.expoConfig?.version ?? "1.0.0"}`}
              isDark={isDark}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const appVersion = Constants.expoConfig?.version ?? "1.0.0";
                if (__DEV__) devLog("[DEV_DECISION] app_version", { source: "Constants.expoConfig", version: appVersion });
                safeToast.info("About Open Invite", `Version ${appVersion} - Share plans with friends!`);
              }}
              onLongPress={__DEV__ ? () => {
                // [GROWTH_FULLPHASE_B] DEV-only: inject fake weekly_digest notification for visual testing
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                queryClient.setQueryData(
                  [...qk.notifications(), { pageSize: 30 }] as const,
                  (old: any) => {
                    const fakeDigest = {
                      id: `dev_digest_${Date.now()}`,
                      type: "weekly_digest",
                      title: "Your week ahead",
                      body: "3 events from friends this week. Sarah's Beach Day on Saturday has 5 friends going.",
                      data: null,
                      read: false,
                      seen: false,
                      createdAt: new Date().toISOString(),
                    };
                    if (!old?.pages?.[0]) {
                      return { pages: [{ notifications: [fakeDigest], unreadCount: 1 }], pageParams: [undefined] };
                    }
                    const firstPage = { ...old.pages[0] };
                    firstPage.notifications = [fakeDigest, ...(firstPage.notifications ?? [])];
                    firstPage.unreadCount = (firstPage.unreadCount ?? 0) + 1;
                    return { ...old, pages: [firstPage, ...old.pages.slice(1)] };
                  },
                );
                safeToast.success("DEV", "Injected weekly_digest notification");
              } : undefined}
            />
          </View>
        </Animated.View>

        {/* Admin Section - Only visible when unlocked AND admin */}
        {adminUnlocked && adminStatus?.isAdmin && (
          <Animated.View entering={FadeInDown.delay(270).springify()} className="mx-4 mt-6">
            <Text style={{ color: isDark ? "rgba(255,255,255,0.4)" : "#999", letterSpacing: 0.5 }} className="text-xs font-semibold mb-2 ml-2">ADMIN</Text>
            <View style={{ ...glass.card }} className="overflow-hidden">
              <SettingItem
                icon={<Shield size={20} color="#10B981" />}
                title="Admin Console"
                subtitle="Platform administration tools"
                isDark={isDark}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/admin");
                }}
              />
            </View>
          </Animated.View>
        )}

        {/* [P2_TRUST_SWEEP] Non-admin stub removed — unlock produces no visible UI for non-admins */}

        {/* Legal Section */}
        <Animated.View entering={FadeInDown.delay(275).springify()} className="mx-4 mt-6">
          <Text style={{ color: isDark ? "rgba(255,255,255,0.4)" : "#999", letterSpacing: 0.5 }} className="text-xs font-semibold mb-2 ml-2">LEGAL</Text>
          <View style={{ ...glass.card }} className="overflow-hidden">
            <SettingItem
              icon={<FileText size={20} color="#6366F1" />}
              title="Privacy Policy"
              subtitle="How we handle your data"
              isDark={isDark}
              rightElement={<ExternalLink size={16} color={colors.textTertiary} />}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Linking.openURL("https://www.openinvite.cloud/privacy");
              }}
            />
            <SettingItem
              icon={<Scale size={20} color="#F59E0B" />}
              title="Terms of Service"
              subtitle="Rules and conditions"
              isDark={isDark}
              rightElement={<ExternalLink size={16} color={colors.textTertiary} />}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Linking.openURL("https://www.openinvite.cloud/terms");
              }}
            />
          </View>
        </Animated.View>

        {/* Sign Out */}
        <Animated.View entering={FadeInDown.delay(300).springify()} className="mx-4 mt-6">
          <Pressable
            onPress={handleLogout}
            style={{
              backgroundColor: isDark ? "rgba(239,68,68,0.06)" : "rgba(239,68,68,0.04)",
              borderWidth: glass.card.borderWidth,
              borderColor: isDark ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.12)",
              borderRadius: glass.card.borderRadius,
            }}
            className="p-4 flex-row items-center justify-center"
          >
            <LogOut size={20} color="#EF4444" />
            <Text className="text-red-500 font-semibold ml-2">Sign Out</Text>
          </Pressable>
        </Animated.View>

        <Text style={{ color: colors.textTertiary }} className="text-center text-sm mt-6">
          Made with love for sharing plans
        </Text>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Sign Out Confirm Modal */}
      <ConfirmModal
        visible={showSignOutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmText="Sign Out"
        cancelText="Cancel"
        isDestructive
        onConfirm={confirmSignOut}
        onCancel={() => setShowSignOutConfirm(false)}
      />

      {/* P0: Remove Phone Confirm Modal REMOVED - feature deprecated */}

      {/* Admin Unlock Passcode Modal */}
      <SettingsAdminPasscodeModal
        visible={showPasscodeModal}
        passcodeInput={passcodeInput}
        passcodeError={passcodeError}
        colors={colors}
        isDark={isDark}
        onClose={() => {
          setShowPasscodeModal(false);
          setPasscodeInput("");
          setPasscodeError(false);
        }}
        onPasscodeChange={(text) => {
          setPasscodeInput(text);
          setPasscodeError(false);
        }}
        onSubmit={handlePasscodeSubmit}
      />

      {/* Push Diagnostics Modal - DEV-only, never shown in production */}
      {canShowPushDiagnostics && (
        <SettingsPushDiagnosticsModal
          visible={showPushDiagModal}
          pushDiagResult={pushDiagResult}
          pushDiagReport={pushDiagReport}
          isPushDiagRunning={isPushDiagRunning}
          isClearingTokens={isClearingTokens}
          colors={colors}
          isDark={isDark}
          onClose={() => setShowPushDiagModal(false)}
          onRunDiagnostics={doRunPushDiagnostics}
          onClearTokens={handleClearTokens}
          onCopyReport={handleCopyReport}
        />
      )}

    </SafeAreaView>
  );
}

// DiagRow helper moved to SettingsPushDiagnosticsModal
