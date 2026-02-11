import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  Switch,
  Platform,
  Linking,
  Modal,
  ActivityIndicator,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { toCloudinaryTransformedUrl, CLOUDINARY_PRESETS } from "@/lib/mediaTransformSSOT";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ChevronLeft,
  Palette,
  Bell,
  Shield,
  HelpCircle,
  Info,
  LogOut,
  Camera,
  Check,
  Sun,
  Moon,
  Smartphone,
  UserX,
  Cake,
  ChevronDown,
  Briefcase,
  Clock,
  Crown,
  RotateCcw,
  FileText,
  Scale,
  ExternalLink,
  Gift,
  Share2,
  BookOpen,
  Phone,
  CalendarDays,
  Users,
  Sparkles,
  Copy,
  Mail,
  Plus,
  X,
  ImagePlus,
  Trash2,
} from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { useNotifications } from "@/hooks/useNotifications";
import { api } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { updateProfileAndSync } from "@/lib/profileSync";
import { invalidateProfileMedia } from "@/lib/mediaInvalidation";
import { getProfileDisplay, getProfileInitial } from "@/lib/profileDisplay";
import { getImageSource } from "@/lib/imageSource";
import { EntityAvatar } from "@/components/EntityAvatar";
import { type UpdateProfileResponse, type GetProfileResponse } from "@/shared/contracts";
import { useTheme, THEME_COLORS, type ThemeMode } from "@/lib/ThemeContext";
import {
  isRevenueCatEnabled,
  hasEntitlement,
  restorePurchases,
} from "@/lib/revenuecatClient";
import { ConfirmModal } from "@/components/ConfirmModal";
import { performLogout } from "@/lib/logout";
import { normalizeHandle, validateHandle, formatHandle } from "@/lib/handleUtils";
import { safeToast } from "@/lib/safeToast";
import { toUserMessage, logError } from "@/lib/errors";
import { uploadImage, uploadBannerPhoto } from "@/lib/imageUpload";
import { Button } from "@/ui/Button";
import { checkAdminStatus } from "@/lib/adminApi";
import { useEntitlements, useRefreshProContract, useIsPro } from "@/lib/entitlements";
import { useSubscription } from "@/lib/SubscriptionContext";
import { REFERRAL_TIERS } from "@/lib/freemiumLimits";

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
  rightElement?: React.ReactNode;
  showArrow?: boolean;
  isDark?: boolean;
}

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

// Referral Counter Component with code display and referrer input
function ReferralCounterSection({
  isDark,
  colors,
  themeColor,
}: {
  isDark: boolean;
  colors: { text: string; textSecondary: string; textTertiary: string; separator: string; surface: string; background: string };
  themeColor: string;
}) {
  const [referrerCodeInput, setReferrerCodeInput] = useState("");
  const [isApplyingCode, setIsApplyingCode] = useState(false);
  const [showReferrerInput, setShowReferrerInput] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const authed = isAuthedForNetwork(bootStatus, session);
  if (__DEV__ && !authed) devLog('[P13_NET_GATE] tag="referralStats" blocked — not authed');

  const { data: referralStats, isLoading } = useQuery({
    queryKey: ["referralStats"],
    queryFn: () => api.get<{
      referralCode: string;
      successfulReferrals: number;
      pendingReferrals: number;
      totalInvites: number;
      hasReferrer: boolean;
      nextReward: { type: string; remaining: number } | null;
    }>("/api/referral/stats"),
    enabled: authed,
  });

  const handleCopyCode = async () => {
    if (!referralStats?.referralCode) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(referralStats.referralCode);
    safeToast.success("Copied!", "Your referral code has been copied to clipboard");
  };

  const handleApplyReferrerCode = async () => {
    if (!referrerCodeInput.trim()) {
      safeToast.warning("Error", "Please enter a referral code");
      return;
    }

    setIsApplyingCode(true);
    try {
      const response = await api.post<{ success: boolean; referrerName: string; welcomeBonus: string }>("/api/referral/apply", {
        referralCode: referrerCodeInput.trim(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success(
        "Success!",
        `${response.referrerName} earned a referral credit.`
      );
      setReferrerCodeInput("");
      setShowReferrerInput(false);
      queryClient.invalidateQueries({ queryKey: ["referralStats"] });
    } catch (error: any) {
      const message = error?.message || "Failed to apply referral code";
      safeToast.error("Referral Failed", message);
    } finally {
      setIsApplyingCode(false);
    }
  };

  const successfulCount = referralStats?.successfulReferrals ?? 0;
  const hasReferrer = referralStats?.hasReferrer ?? false;
  const { isPro } = useIsPro();

  // [P0_REFERRAL_PRO_GATE] DEV proof log
  if (__DEV__) {
    devLog("[P0_REFERRAL_PRO_GATE]", { isPro, screen: "settings" });
  }

  // [P0_REFERRAL_SSOT] DEV proof log
  if (__DEV__) {
    devLog("[P0_REFERRAL_SSOT]", {
      screen: "settings",
      month: REFERRAL_TIERS.MONTH_PRO.count,
      year: REFERRAL_TIERS.YEAR_PRO.count,
      lifetime: REFERRAL_TIERS.LIFETIME_PRO.count,
    });
  }

  return (
    <View className="p-4">
      {/* YOUR REFERRAL CODE - Big and prominent */}
      <View
        className="rounded-xl p-4 mb-4"
        style={{ backgroundColor: isDark ? "#1C2127" : "#F0FDF4", borderWidth: 1, borderColor: "#10B98140" }}
      >
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-sm font-medium" style={{ color: "#10B981" }}>YOUR REFERRAL CODE</Text>
          <Pressable
            onPress={handleCopyCode}
            className="flex-row items-center px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: "#10B98120" }}
          >
            <Copy size={14} color="#10B981" />
            <Text className="ml-1.5 text-sm font-medium" style={{ color: "#10B981" }}>Copy</Text>
          </Pressable>
        </View>
        <Text className="text-2xl font-black tracking-widest" style={{ color: colors.text }}>
          {isLoading ? "..." : referralStats?.referralCode ?? "---"}
        </Text>
        <Text className="text-xs mt-2" style={{ color: colors.textSecondary }}>
          {isPro
            ? "Share your code with friends so they can join you on Open Invite."
            : "Invite friends with your referral code to progress toward milestones. The more friends on Open Invite, the easier planning becomes."}
        </Text>
      </View>

      {/* Referral Progress */}
      <View className="flex-row items-center mb-3">
        <View
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
        >
          <Users size={20} color={themeColor} />
        </View>
        <View className="flex-1">
          <Text style={{ color: colors.text }} className="text-base font-medium">Referral Progress</Text>
          <Text style={{ color: colors.textSecondary }} className="text-sm">
            {isLoading ? "Loading..." : `${successfulCount} friend${successfulCount !== 1 ? "s" : ""} joined`}
          </Text>
        </View>
        <View
          className="px-3 py-1 rounded-full"
          style={{ backgroundColor: successfulCount >= 3 ? "#10B98120" : `${themeColor}20` }}
        >
          <Text
            style={{ color: successfulCount >= REFERRAL_TIERS.MONTH_PRO.count ? "#10B981" : themeColor }}
            className="text-xs font-bold"
          >
            {successfulCount < REFERRAL_TIERS.MONTH_PRO.count
              ? `${successfulCount}/${REFERRAL_TIERS.MONTH_PRO.count}`
              : successfulCount < REFERRAL_TIERS.YEAR_PRO.count
              ? `${successfulCount}/${REFERRAL_TIERS.YEAR_PRO.count}`
              : successfulCount < REFERRAL_TIERS.LIFETIME_PRO.count
              ? `${successfulCount}/${REFERRAL_TIERS.LIFETIME_PRO.count}`
              : `${successfulCount}`}
          </Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View
        className="h-2 rounded-full overflow-hidden mb-2"
        style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}
      >
        <View
          className="h-full rounded-full"
          style={{
            width: `${
              successfulCount < REFERRAL_TIERS.MONTH_PRO.count
                ? (successfulCount / REFERRAL_TIERS.MONTH_PRO.count) * 100
                : successfulCount < REFERRAL_TIERS.YEAR_PRO.count
                ? ((successfulCount - REFERRAL_TIERS.MONTH_PRO.count) / (REFERRAL_TIERS.YEAR_PRO.count - REFERRAL_TIERS.MONTH_PRO.count)) * 100
                : successfulCount < REFERRAL_TIERS.LIFETIME_PRO.count
                ? ((successfulCount - REFERRAL_TIERS.YEAR_PRO.count) / (REFERRAL_TIERS.LIFETIME_PRO.count - REFERRAL_TIERS.YEAR_PRO.count)) * 100
                : 100
            }%`,
            backgroundColor: successfulCount >= REFERRAL_TIERS.MONTH_PRO.count ? "#10B981" : themeColor,
          }}
        />
      </View>

      {/* Reward Status */}
      <Text style={{ color: colors.textTertiary }} className="text-xs text-center mb-3">
        {isPro
          ? "Pro active"
          : successfulCount >= REFERRAL_TIERS.LIFETIME_PRO.count
          ? "Lifetime Pro milestone reached!"
          : successfulCount >= REFERRAL_TIERS.YEAR_PRO.count
          ? `${REFERRAL_TIERS.LIFETIME_PRO.count - successfulCount} more friends toward Lifetime Pro`
          : successfulCount >= REFERRAL_TIERS.MONTH_PRO.count
          ? `${REFERRAL_TIERS.YEAR_PRO.count - successfulCount} more friends toward 1 Year Pro`
          : `${REFERRAL_TIERS.MONTH_PRO.count - successfulCount} more friends toward 1 Month Pro`}
      </Text>

      {/* View Details Link */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/referrals");
        }}
        className="py-2 items-center mb-2"
      >
        <Text className="text-sm font-medium" style={{ color: themeColor }}>
          View Referrals & Rewards →
        </Text>
      </Pressable>

      {/* ENTER REFERRER CODE SECTION */}
      {!hasReferrer && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.separator, paddingTop: 12 }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowReferrerInput(!showReferrerInput);
            }}
            className="flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              <View
                className="w-8 h-8 rounded-full items-center justify-center mr-2"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
              >
                <Gift size={16} color={themeColor} />
              </View>
              <Text className="text-sm font-medium" style={{ color: colors.text }}>
                Enter referrer's code
              </Text>
            </View>
            <ChevronDown
              size={16}
              color={colors.textTertiary}
              style={{ transform: [{ rotate: showReferrerInput ? "180deg" : "0deg" }] }}
            />
          </Pressable>

          {showReferrerInput && (
            <View className="mt-3">
              <Text className="text-xs mb-2" style={{ color: colors.textSecondary }}>
                If someone referred you, enter their code to give them credit.
              </Text>
              <View className="flex-row items-center">
                <TextInput
                  value={referrerCodeInput}
                  onChangeText={setReferrerCodeInput}
                  placeholder="Enter code (e.g. jdoe_a1b2)"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  className="flex-1 px-4 py-3 rounded-xl mr-2"
                  style={{
                    backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                    color: colors.text,
                  }}
                />
                <Pressable
                  onPress={handleApplyReferrerCode}
                  disabled={isApplyingCode || !referrerCodeInput.trim()}
                  className="px-4 py-3 rounded-xl"
                  style={{
                    backgroundColor: referrerCodeInput.trim() ? themeColor : isDark ? "#2C2C2E" : "#E5E7EB",
                  }}
                >
                  <Text
                    className="font-semibold"
                    style={{ color: referrerCodeInput.trim() ? "#FFFFFF" : colors.textTertiary }}
                  >
                    {isApplyingCode ? "..." : "Apply"}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}

      {hasReferrer && (
        <View className="flex-row items-center justify-center pt-2" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
          <Check size={14} color="#10B981" />
          <Text className="ml-1 text-xs" style={{ color: "#10B981" }}>
            You were referred by a friend!
          </Text>
        </View>
      )}
    </View>
  );
}

export default function SettingsScreen() {
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const { runPushDiagnostics, clearMyPushTokens, ensurePushRegistered } = useNotifications();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, setThemeColor, themeColorName, themeMode, setThemeMode, isDark, colors } = useTheme();

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

  const [showEditProfile, setShowEditProfile] = useState(false);
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

  // Profile editing states
  const [editName, setEditName] = useState("");
  const [editImage, setEditImage] = useState("");
  const [editBanner, setEditBanner] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  // null = unchanged, "" = removed, "file://..." or "https://..." = new/existing
  const [editCalendarBio, setEditCalendarBio] = useState("");
  const [editHandle, setEditHandle] = useState("");
  const [handleError, setHandleError] = useState<string | null>(null);

  // Username change info modal
  const [showUsernameInfoModal, setShowUsernameInfoModal] = useState(false);
  const [hasShownUsernameInfo, setHasShownUsernameInfo] = useState(false);

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

  // Work schedule types
  interface WorkScheduleDay {
    id: string;
    dayOfWeek: number;
    dayName: string;
    isEnabled: boolean;
    startTime: string | null;
    endTime: string | null;
    label: string;
    // Split schedule support (optional second block)
    block2StartTime?: string | null;
    block2EndTime?: string | null;
  }

  interface WorkScheduleSettings {
    showOnCalendar: boolean;
  }

  // Fetch work schedule
  // Gate on bootStatus to prevent queries during logout
  const { data: workScheduleData } = useQuery({
    queryKey: ["workSchedule"],
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
    queryKey: ["profile"],
    queryFn: () => api.get<GetProfileResponse>("/api/profile"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  // Check admin status (fail safe - returns isAdmin: false on any error)
  // Gate on bootStatus to prevent queries during logout
  const { data: adminStatus, isLoading: adminStatusLoading } = useQuery({
    queryKey: ["adminStatus"],
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
  const { isPro: userIsPremium, isLoading: entitlementsLoading, entitlements } = useIsPro();
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
      // Sync handle
      if (profileData.profile.handle) {
        // Don't show auto-generated handles (user_xxxxx)
        const handle = profileData.profile.handle;
        if (!handle.startsWith("user_")) {
          setEditHandle(handle);
        }
      }
      // Use shared helper for consistent precedence
      const { displayName, avatarUri } = getProfileDisplay({ profileData, session });
      setEditName(displayName);
      setEditImage(avatarUri || "");
      // Sync calendarBio
      setEditCalendarBio(profileData.profile.calendarBio || "");
    }
    // P0: Phone sync removed - feature deprecated
  }, [profileData, session]);

  // Load avatar source with auth headers
  useEffect(() => {
    const loadAvatar = async () => {
      const { avatarUri } = getProfileDisplay({ profileData, session });
      const source = await getImageSource(avatarUri);
      setAvatarSource(source);
    };
    loadAvatar();
  }, [profileData, session]);

  const updateProfileMutation = useMutation({
    mutationFn: (data: { name?: string; avatarUrl?: string; bannerPhotoUrl?: string | null; calendarBio?: string; phone?: string | null; handle?: string; adminBypassCooldown?: boolean }) =>
      api.put<UpdateProfileResponse>("/api/profile", data),
    onSuccess: async (response, variables) => {
      if (__DEV__) devLog("[EditProfile] Save success", response);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Update cache immediately with response + variables to ensure both profile and user are patched
      queryClient.setQueryData(["profile"], (old: any) => ({
        ...old,
        profile: {
          ...old?.profile,
          ...response.profile,
          // Backend stores name on user, not profile - patch it here for consistent reads
          name: variables?.name ?? old?.profile?.name,
          avatarUrl: response.profile?.avatarUrl ?? variables?.avatarUrl ?? old?.profile?.avatarUrl,
          bannerPhotoUrl: variables?.bannerPhotoUrl !== undefined ? variables.bannerPhotoUrl : old?.profile?.bannerPhotoUrl,
        },
        user: {
          ...old?.user,
          name: variables?.name ?? old?.user?.name,
          image: variables?.avatarUrl ?? old?.user?.image,
        },
      }));
      
      // Use centralized sync helper to refresh both Better Auth session and React Query cache
      await updateProfileAndSync(queryClient);
      // SSOT media invalidation — covers userProfile, profiles, friends
      invalidateProfileMedia(queryClient);
      setShowEditProfile(false);
      setHandleError(null);
      safeToast.success("Success", "Profile updated successfully");
    },
    onError: (error: unknown) => {
      logError("EditProfile Save", error);
      // Check for handle-specific errors
      const errorMessage = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : '';
      const errorCode = error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: string }).code)
        : '';

      if (errorCode === "HANDLE_TAKEN" || errorMessage.includes("taken")) {
        setHandleError("That username is already taken");
        safeToast.error("Username Taken", "That username is already taken");
      } else if (errorCode === "RESERVED" || errorMessage.includes("unavailable")) {
        setHandleError("That username is unavailable");
        safeToast.error("Username Unavailable", "That username is unavailable");
      } else if (errorMessage.includes("Username")) {
        setHandleError(errorMessage);
        safeToast.error("Username Error", errorMessage);
      } else {
        const { title, message } = toUserMessage(error);
        safeToast.error(title, message);
      }
    },
  });

  // P0: Phone number mutation REMOVED - feature deprecated

  const updateBirthdayMutation = useMutation({
    mutationFn: (data: { birthday?: string; showBirthdayToFriends?: boolean; hideBirthdays?: boolean; omitBirthdayYear?: boolean }) =>
      api.put<UpdateProfileResponse>("/api/profile", data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["birthdays"] });
    },
    onError: () => {
      safeToast.error("Save Failed", "Failed to update birthday settings");
    },
  });

  const updateWorkScheduleMutation = useMutation({
    mutationFn: (data: { dayOfWeek: number; isEnabled?: boolean; startTime?: string; endTime?: string; label?: string; block2StartTime?: string | null; block2EndTime?: string | null }) => {
      if (__DEV__ && (data.block2StartTime !== undefined || data.block2EndTime !== undefined)) {
        devLog("[ScheduleBlocks] Saving to server:", {
          dayOfWeek: data.dayOfWeek,
          block2StartTime: data.block2StartTime,
          block2EndTime: data.block2EndTime,
        });
      }
      return api.put<{ schedule: WorkScheduleDay }>(`/api/work-schedule/${data.dayOfWeek}`, data);
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
      queryClient.invalidateQueries({ queryKey: ["workSchedule"] });
    },
    onError: () => {
      safeToast.error("Save Failed", "Failed to update work schedule");
    },
  });

  const updateWorkSettingsMutation = useMutation({
    mutationFn: (data: { showOnCalendar: boolean }) =>
      api.put<{ settings: WorkScheduleSettings }>("/api/work-schedule/settings", data),
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: ["workSchedule"] });
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

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setEditImage(result.assets[0].uri);
      }
    } catch (error) {
      logError("Pick Image", error);
      const { title, message } = toUserMessage(error);
      safeToast.error(title, message || "Failed to pick image. Please try again.");
    }
  };

  const handlePickBanner = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (__DEV__) {
          devLog('[P0_BANNER_UPLOAD]', 'picker_result', {
            uri: asset.uri?.slice(0, 80),
            width: asset.width,
            height: asset.height,
            fileSize: (asset as any).fileSize ?? 'unknown',
            fileName: (asset as any).fileName ?? 'missing',
            mimeType: (asset as any).mimeType ?? (asset as any).type ?? 'missing',
          });
        }
        setEditBanner(asset.uri);
      }
    } catch (error) {
      logError("Pick Banner", error);
      const { title, message } = toUserMessage(error);
      safeToast.error(title, message || "Failed to pick image. Please try again.");
    }
  };

  const handleSaveProfile = async () => {
    // First validate handle if it was changed
    const normalizedEditHandle = normalizeHandle(editHandle);
    const currentHandle = profileData?.profile?.handle ?? "";
    const currentHandleNormalized = currentHandle.startsWith("user_") ? "" : currentHandle;

    if (normalizedEditHandle && normalizedEditHandle !== currentHandleNormalized) {
      const validation = validateHandle(normalizedEditHandle);
      if (!validation.valid) {
        setHandleError(validation.error ?? "Invalid username");
        return;
      }
    }

    setHandleError(null);
    setIsUploading(true);
    if (__DEV__) devLog("[P1_MEDIA_UX]", "upload_start");

    try {
      const updates: { name?: string; avatarUrl?: string; bannerPhotoUrl?: string | null; calendarBio?: string; handle?: string; adminBypassCooldown?: boolean } = {};
      const currentDisplayName = session?.user?.displayName ?? session?.user?.name;
      
      // Handle name change
      if (editName.trim() && editName !== currentDisplayName) {
        updates.name = editName.trim();
      }
      
      // Handle image change - upload if it's a local file URI
      if (editImage && editImage !== session?.user?.image) {
        if (editImage.startsWith("file://")) {
          // Local file - need to upload first
          try {
            if (__DEV__) devLog("[EditProfile] Uploading profile photo...");
            if (__DEV__) devLog("[P1_MEDIA_UX]", "upload_locked", { type: "avatar" });
            const uploadResponse = await uploadImage(editImage, true);
            updates.avatarUrl = uploadResponse.url;
            if (__DEV__) devLog("[EditProfile] Photo uploaded:", uploadResponse.url);
          } catch (uploadError) {
            setIsUploading(false);
            logError("Profile Photo Upload", uploadError);
            safeToast.error("Upload Failed", "Failed to upload profile photo. Please try again.");
            return; // Stop save if upload fails
          }
        } else {
          // Already a URL - just use it
          updates.avatarUrl = editImage;
        }
      }

      // Handle banner change
      if (editBanner !== null) {
        if (editBanner === "") {
          // User wants to remove the banner
          updates.bannerPhotoUrl = null;
          if (__DEV__) devLog('[P0_BANNER_UPLOAD]', 'banner_remove');
        } else if (editBanner.startsWith("file://")) {
          try {
            if (__DEV__) devLog('[P0_BANNER_UPLOAD]', 'upload_start', { uri: editBanner.slice(0, 80) });
            if (__DEV__) devLog("[P1_MEDIA_UX]", "upload_locked", { type: "banner" });
            const bannerResponse = await uploadBannerPhoto(editBanner);
            updates.bannerPhotoUrl = bannerResponse.url;
            if (__DEV__) devLog('[P0_BANNER_UPLOAD]', 'upload_success', { url: bannerResponse.url?.slice(0, 60) });
          } catch (bannerError: any) {
            setIsUploading(false);
            logError("Banner Photo Upload", bannerError);
            const errMsg = bannerError?.message || String(bannerError);
            if (__DEV__) devLog('[P0_BANNER_UPLOAD]', 'upload_FAILED', { error: errMsg, status: bannerError?.status });
            safeToast.error(
              "Upload Failed",
              __DEV__ ? `Banner upload error: ${errMsg}` : "Failed to upload banner photo. Please try again.",
            );
            return;
          }
        } else {
          updates.bannerPhotoUrl = editBanner;
        }
      }
      
      // Always include calendarBio if it changed from the stored value
      const currentCalendarBio = profileData?.profile?.calendarBio ?? "";
      if (editCalendarBio !== currentCalendarBio) {
        updates.calendarBio = editCalendarBio;
      }
      
      // Include handle if it changed
      if (normalizedEditHandle !== currentHandleNormalized) {
        updates.handle = normalizedEditHandle;
        // Admin can bypass cooldown restrictions
        if (adminStatus?.isAdmin) {
          updates.adminBypassCooldown = true;
        }
      }
      
      if (Object.keys(updates).length > 0) {
        if (__DEV__) devLog("[EditProfile] Save payload:", updates);
        if (__DEV__) devLog("[P1_MEDIA_UX]", "upload_success");
        setIsUploading(false);
        updateProfileMutation.mutate(updates);
      } else {
        setIsUploading(false);
        setShowEditProfile(false);
      }
    } catch (error) {
      setIsUploading(false);
      logError("EditProfile Save", error);
      const { title, message } = toUserMessage(error);
      safeToast.error(title, message || "Failed to save profile");
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
  const formatBirthdayDisplay = (date: Date | null): string => {
    if (!date) return "Not set";
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  const handleDateChange = (_event: unknown, selectedDate?: Date) => {
    if (Platform.OS === "android") {
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
  const formatTimeDisplay = (time: string | null): string => {
    if (!time) return "--:--";
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const parseTimeToDate = (time: string | null): Date => {
    const date = new Date();
    if (time) {
      const [hours, minutes] = time.split(":");
      date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    } else {
      date.setHours(9, 0, 0, 0);
    }
    return date;
  };

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

  if (!session) {
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
        {!showEditProfile ? (
          <Animated.View entering={FadeInDown.delay(0).springify()} className="mx-4 mt-4">
            <View
              className="rounded-2xl p-5 flex-row items-center"
              style={{
                backgroundColor: colors.surface,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isDark ? 0 : 0.05,
                shadowRadius: 8,
              }}
            >
              {/* Avatar: admin unlock tap target ONLY — no Edit Profile navigation */}
              <Pressable
                onPress={() => {
                  handleAdminUnlockTap();
                }}
                className="mr-4"
              >
                <EntityAvatar
                  imageSource={avatarSource}
                  initials={getProfileInitial({ profileData, session })}
                  size={64}
                  borderRadius={32}
                  backgroundColor={avatarSource ? (isDark ? "#2C2C2E" : "#E5E7EB") : `${themeColor}20`}
                  foregroundColor={themeColor}
                  fallbackIcon="person-outline"
                />
              </Pressable>
              {/* Right side: Edit Profile navigation */}
              <Pressable
                className="flex-1 flex-row items-center"
                onPress={() => {
                  if (__DEV__) devLog("[P0_SETTINGS_PROFILE_NAV] edit_profile triggered");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const { displayName, avatarUri } = getProfileDisplay({ profileData, session });
                  setEditName(displayName);
                  setEditImage(avatarUri || "");
                  setEditBanner(null); // null = unchanged
                  setEditCalendarBio(profileData?.profile?.calendarBio ?? "");
                  setShowEditProfile(true);
                }}
              >
                <View className="flex-1">
                  <Text style={{ color: colors.text }} className="text-lg font-semibold">
                    {getProfileDisplay({ profileData, session, fallbackName: "Add your name" }).displayName}
                  </Text>
                  <Text style={{ color: colors.textSecondary }} className="text-sm">Tap to edit profile</Text>
                </View>
                <Text style={{ color: colors.textTertiary }} className="text-xl">›</Text>
              </Pressable>
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.springify()} className="mx-4 mt-4">
            <View
              className="rounded-2xl p-5"
              style={{
                backgroundColor: colors.surface,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isDark ? 0 : 0.05,
                shadowRadius: 8,
              }}
            >
              <Text style={{ color: colors.text }} className="text-lg font-semibold mb-4">Edit Profile</Text>

              {/* Profile Picture */}
              <View className="items-center mb-4">
                <Pressable onPress={handlePickImage} disabled={isUploading} className="relative" style={{ opacity: isUploading ? 0.6 : 1 }}>
                  <EntityAvatar
                    photoUrl={editImage || undefined}
                    initials={editName?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "?"}
                    size={96}
                    borderRadius={48}
                    backgroundColor={editImage ? (isDark ? "#2C2C2E" : "#E5E7EB") : `${themeColor}20`}
                    foregroundColor={themeColor}
                    fallbackIcon="person-outline"
                  />
                  {isUploading ? (
                    <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 48 }}>
                      <ActivityIndicator color="#fff" size="small" />
                    </View>
                  ) : (
                    <View
                      className="absolute bottom-0 right-0 w-8 h-8 rounded-full items-center justify-center border-2"
                      style={{ backgroundColor: themeColor, borderColor: colors.surface }}
                    >
                      <Camera size={16} color="#fff" />
                    </View>
                  )}
                </Pressable>
                <Text style={{ color: colors.textSecondary }} className="text-sm mt-2">{isUploading ? "Uploading..." : "Tap to change photo"}</Text>
              </View>

              {/* Profile Banner */}
              <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Profile Banner</Text>
              {(() => {
                const currentBannerUrl = (profileData?.profile as any)?.bannerPhotoUrl;
                const showBanner = editBanner !== null ? (editBanner !== "") : !!currentBannerUrl;
                const bannerSource = editBanner !== null
                  ? (editBanner !== "" ? editBanner : null)
                  : (currentBannerUrl || null);
                return (
                  <View className="mb-4">
                    <Pressable
                      onPress={handlePickBanner}
                      disabled={isUploading}
                      className="rounded-xl overflow-hidden"
                      style={{
                        height: 80,
                        backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderStyle: showBanner ? "solid" : "dashed",
                        opacity: isUploading ? 0.6 : 1,
                      }}
                    >
                      {showBanner && bannerSource ? (
                        <View>
                          {/* INVARIANT_ALLOW_RAW_IMAGE_CONTENT — banner preview thumbnail, Cloudinary-transformed when applicable */}
                          <Image
                            source={{ uri: toCloudinaryTransformedUrl(bannerSource, CLOUDINARY_PRESETS.THUMBNAIL_SQUARE) }}
                            style={{ width: "100%", height: 80 }}
                            resizeMode="cover"
                          />
                          {isUploading && (
                            <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}>
                              <ActivityIndicator color="#fff" size="small" />
                            </View>
                          )}
                        </View>
                      ) : (
                        <View className="flex-1 items-center justify-center">
                          <ImagePlus size={20} color={colors.textTertiary} />
                          <Text style={{ color: colors.textTertiary }} className="text-xs mt-1">Add banner</Text>
                        </View>
                      )}
                    </Pressable>
                    {showBanner && (
                      <View className="flex-row mt-2" style={{ gap: 8, opacity: isUploading ? 0.5 : 1 }}>
                        <Pressable
                          onPress={handlePickBanner}
                          disabled={isUploading}
                          className="flex-1 py-2 rounded-lg items-center"
                          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                        >
                          <Text style={{ color: themeColor }} className="text-sm font-medium">Change Banner</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => { setEditBanner(""); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                          disabled={isUploading}
                          className="flex-1 py-2 rounded-lg items-center flex-row justify-center"
                          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                        >
                          <Trash2 size={14} color="#EF4444" />
                          <Text style={{ color: "#EF4444" }} className="text-sm font-medium ml-1">Remove</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })()}

              {/* Name Input */}
              <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Display Name</Text>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                placeholder="Enter your name"
                placeholderTextColor={colors.textTertiary}
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB", color: colors.text }}
                className="rounded-xl px-4 py-3 mb-4"
              />

              {/* Username Input */}
              <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Username</Text>
              <View className="relative mb-1">
                <View className="absolute left-4 top-0 bottom-0 justify-center z-10">
                  <Text style={{ color: colors.textTertiary }} className="text-base">@</Text>
                </View>
                <TextInput
                  value={editHandle}
                  onChangeText={(text) => {
                    // Remove @ if user types it, normalize input
                    const cleaned = text.replace(/^@+/, "").toLowerCase();
                    setEditHandle(cleaned);
                    setHandleError(null);
                  }}
                  onFocus={() => {
                    // Show username change info modal once per session
                    if (!hasShownUsernameInfo) {
                      setShowUsernameInfoModal(true);
                      setHasShownUsernameInfo(true);
                    }
                  }}
                  placeholder="username"
                  placeholderTextColor={colors.textTertiary}
                  style={{
                    backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB",
                    color: colors.text,
                    paddingLeft: 32,
                  }}
                  className="rounded-xl px-4 py-3"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {handleError ? (
                <Text className="text-red-500 text-xs mb-2">{handleError}</Text>
              ) : (
                <Text style={{ color: colors.textTertiary }} className="text-xs mb-4">
                  This is how people can find you
                </Text>
              )}

              {/* Calendar Bio Input */}
              <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">My calendar looks like...</Text>
              <TextInput
                value={editCalendarBio}
                onChangeText={(text) => setEditCalendarBio(text.slice(0, 300))}
                placeholder="Describe your calendar vibe (e.g., busy weekdays, free weekends...)"
                placeholderTextColor={colors.textTertiary}
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB", color: colors.text }}
                className="rounded-xl px-4 py-3 mb-1"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
              <Text style={{ color: colors.textTertiary }} className="text-xs text-right mb-4">
                {editCalendarBio.length}/300
              </Text>

              {/* Action Buttons */}
              <View className="flex-row">
                <Button
                  variant="secondary"
                  label="Cancel"
                  onPress={() => setShowEditProfile(false)}
                  style={{ flex: 1, borderRadius: 12, marginRight: 8 }}
                />
                <Button
                  variant="primary"
                  label={isUploading ? "Uploading..." : updateProfileMutation.isPending ? "Saving..." : "Save"}
                  onPress={handleSaveProfile}
                  disabled={isUploading || updateProfileMutation.isPending}
                  loading={isUploading || updateProfileMutation.isPending}
                  style={{ flex: 1, borderRadius: 12 }}
                />
              </View>
            </View>
          </Animated.View>
        )}

        {/* Theme Section */}
        <Animated.View entering={FadeInDown.delay(100).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">APPEARANCE</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
            {/* Theme Mode Picker */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowThemeModePicker(!showThemeModePicker);
              }}
              className="flex-row items-center p-4"
              style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
                {getThemeModeIcon(themeMode)}
              </View>
              <View className="flex-1">
                <Text style={{ color: colors.text }} className="text-base font-medium">Theme Mode</Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm">
                  {getThemeModeLabel(themeMode)}
                </Text>
              </View>
              <Text style={{ color: colors.textTertiary }} className="text-lg">{showThemeModePicker ? "‹" : "›"}</Text>
            </Pressable>

            {showThemeModePicker && (
              <View className="px-4 pb-4 pt-2">
                {(["light", "dark", "auto"] as ThemeMode[]).map((mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => handleSaveThemeMode(mode)}
                    className="flex-row items-center py-3 px-2 rounded-xl mb-1"
                    style={{ backgroundColor: themeMode === mode ? `${themeColor}15` : "transparent" }}
                  >
                    <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: themeMode === mode ? `${themeColor}20` : isDark ? "#2C2C2E" : "#F3F4F6" }}>
                      {mode === "light" && <Sun size={18} color={themeMode === mode ? themeColor : colors.textSecondary} />}
                      {mode === "dark" && <Moon size={18} color={themeMode === mode ? themeColor : colors.textSecondary} />}
                      {mode === "auto" && <Smartphone size={18} color={themeMode === mode ? themeColor : colors.textSecondary} />}
                    </View>
                    <Text style={{ color: themeMode === mode ? themeColor : colors.text }} className="flex-1 font-medium">
                      {getThemeModeLabel(mode)}
                    </Text>
                    {themeMode === mode && <Check size={18} color={themeColor} />}
                  </Pressable>
                ))}
              </View>
            )}

            {/* Theme Color Picker */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowThemePicker(!showThemePicker);
              }}
              className="flex-row items-center p-4"
            >
              <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
                <Palette size={20} color={themeColor} />
              </View>
              <View className="flex-1">
                <Text style={{ color: colors.text }} className="text-base font-medium">Theme Color</Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm">
                  {themeColorName}
                </Text>
              </View>
              <View
                className="w-6 h-6 rounded-full border-2"
                style={{ backgroundColor: themeColor, borderColor: colors.border }}
              />
            </Pressable>

            {showThemePicker && (
              <View className="px-4 pb-4">
                <View className="flex-row flex-wrap">
                  {THEME_COLORS.map((theme) => (
                    <Pressable
                      key={theme.color}
                      onPress={() => handleSaveTheme(theme.color)}
                      className="w-1/4 p-2"
                    >
                      <View className="items-center">
                        <View
                          className="w-12 h-12 rounded-full items-center justify-center"
                          style={{
                            backgroundColor: theme.color,
                            borderWidth: themeColor === theme.color ? 2 : 0,
                            borderColor: isDark ? "#FFFFFF" : "#1F2937"
                          }}
                        >
                          {themeColor === theme.color && (
                            <Check size={20} color="#fff" />
                          )}
                        </View>
                        <Text style={{ color: colors.textSecondary }} className="text-xs mt-1 text-center">{theme.name}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Account Section */}
        <Animated.View entering={FadeInDown.delay(120).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">ACCOUNT</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
            <SettingItem
              icon={<Mail size={20} color={session?.user?.emailVerified ? "#10B981" : "#F59E0B"} />}
              title="Email verification"
              subtitle={
                session?.user?.emailVerified 
                  ? "Verified" 
                  : "Not verified • Verify your email to help keep your account secure."
              }
              isDark={isDark}
              onPress={() => {
                if (!session?.user?.emailVerified) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/verify-email");
                }
              }}
              rightElement={
                session?.user?.emailVerified ? (
                  <View className="px-2 py-1 rounded-full" style={{ backgroundColor: "#10B98120" }}>
                    <Text style={{ color: "#10B981" }} className="text-xs font-medium">Verified</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push("/verify-email");
                    }}
                    className="px-3 py-1.5 rounded-lg"
                    style={{ backgroundColor: `${themeColor}20` }}
                  >
                    <Text style={{ color: themeColor }} className="text-sm font-medium">Verify now</Text>
                  </Pressable>
                )
              }
            />
          </View>
        </Animated.View>

        {/* P0: Phone Number Section REMOVED - feature deprecated */}

        {/* Notifications Section */}
        <Animated.View entering={FadeInDown.delay(150).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">NOTIFICATIONS</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
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
            {canShowPushDiagnostics && (
              <>
                {__DEV__ && devLog("[P0_PUSH_DIAG_GONE] rendered=true")}
                <SettingItem
                  icon={<Bell size={20} color="#10B981" />}
                  title="Push Diagnostics"
                  subtitle={isPushDiagRunning ? "Running..." : "Test push token registration"}
                  isDark={isDark}
                  onPress={handlePushDiagnostics}
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
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  devLog("[P0_PUSH_REG] FORCE_REREGISTER triggered from Settings");
                  await ensurePushRegistered({ reason: "settings_force", force: true });
                }}
              />
            )}
          </View>
        </Animated.View>

        {/* Subscription Section - Hidden for launch, will be enabled in future update */}
        {/* <Animated.View entering={FadeInDown.delay(155).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">SUBSCRIPTION</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
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
                    <Text style={{ color: colors.textSecondary }} className="text-sm">Unlock unlimited friends & events</Text>
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
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">INVITE FRIENDS</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
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
                <Text style={{ color: colors.textSecondary }} className="text-sm">10 friends = 1 year FREE!</Text>
              </View>
              <Text style={{ color: colors.textTertiary }} className="text-lg">›</Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* Subscription Section - Between Referral and Birthdays */}
        {/* P0 INVARIANT: Subscription block must never be blank. Always render Free/Pro/Error fallback. */}
        <Animated.View entering={FadeInDown.delay(167).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">SUBSCRIPTION</Text>
          {/* Always render the subscription card - loading state shows "Free" as safe default, not blank */}
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
            {__DEV__ && (() => { devLog("[DEV_DECISION] pro_ui_gate screen=settings state=" + (entitlementsLoading ? "loading_default_free" : userIsPremium ? "pro" : "free") + " reason=" + (entitlementsLoading ? "entitlements_fetching_default_free" : "entitlements_loaded_isPremium=" + userIsPremium)); return null; })()}
            {/* Current Status - Show truthful state */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/subscription?source=settings");
              }}
              className="p-4"
              style={{ borderBottomWidth: !userIsPremium ? 1 : 0, borderBottomColor: colors.separator }}
            >
              <View className="flex-row items-center">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: userIsPremium ? "#FFD70020" : isDark ? "#2C2C2E" : "#F9FAFB" }}
                >
                  <Crown size={20} color={userIsPremium ? "#FFD700" : colors.textSecondary} />
                </View>
                <View className="flex-1">
                  <Text style={{ color: colors.text }} className="text-base font-medium">
                    {userIsPremium ? "Subscription" : "Plan"}
                  </Text>
                  <Text style={{ color: colors.textSecondary }} className="text-sm">
                    {userIsPremium ? "Thank you for your support!" : "Free"}
                  </Text>
                </View>
                {!userIsPremium && <Text style={{ color: colors.textTertiary }} className="text-lg">›</Text>}
              </View>
            </Pressable>

            {/* Upgrade CTA (only show for free users) */}
            {__DEV__ && (() => { devLog("[DEV_DECISION] pro_cta_hidden screen=settings hidden=" + userIsPremium); return null; })()}
            {!userIsPremium && (
              <Pressable
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  const result = await subscription.openPaywall({ source: "settings", preferred: "yearly" });
                  if (!result.ok && result.error && !result.cancelled) {
                    // Fallback to subscription page
                    router.push("/subscription?source=settings");
                  }
                }}
                className="flex-row items-center p-4"
                style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}
              >
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: `${themeColor}20` }}
                >
                  <Sparkles size={20} color={themeColor} />
                </View>
                <View className="flex-1">
                  <Text style={{ color: colors.text }} className="text-base font-medium">Upgrade to Founder Pro</Text>
                  <Text style={{ color: colors.textSecondary }} className="text-sm">Unlock unlimited hosting</Text>
                </View>
                <View className="px-3 py-1 rounded-full" style={{ backgroundColor: `${themeColor}20` }}>
                  <Text style={{ color: themeColor }} className="text-xs font-medium">Upgrade</Text>
                </View>
              </Pressable>
            )}

            {/* Restore Purchases */}
            <Pressable
              onPress={handleRestorePurchases}
              disabled={isRestoringPurchases}
              className="flex-row items-center p-4"
              style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}
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
                <Text style={{ color: colors.textSecondary }} className="text-sm">
                  Recover previous purchases
                </Text>
              </View>
            </Pressable>

            {/* Refresh Status Button */}
            <Pressable
              onPress={handleRefreshEntitlements}
              disabled={isRefreshingEntitlements || entitlementsLoading}
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
                  {isRefreshingEntitlements ? "Refreshing..." : "Refresh Pro Status"}
                </Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm">
                  Sync your Founder Pro status
                </Text>
              </View>
            </Pressable>
          </View>
        </Animated.View>

        {/* Birthdays Section */}
        <Animated.View entering={FadeInDown.delay(175).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">BIRTHDAYS</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
            {/* Birthday Date Picker */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowBirthdaySection(!showBirthdaySection);
              }}
              className="flex-row items-center p-4"
              style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
                <Cake size={20} color={themeColor} />
              </View>
              <View className="flex-1">
                <Text style={{ color: colors.text }} className="text-base font-medium">My Birthday</Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm">
                  {formatBirthdayDisplay(birthday)}
                </Text>
              </View>
              <ChevronDown
                size={18}
                color={colors.textTertiary}
                style={{ transform: [{ rotate: showBirthdaySection ? "180deg" : "0deg" }] }}
              />
            </Pressable>

            {showBirthdaySection && (
              <View className="px-4 py-3">
                {/* Date Picker Button */}
                <Button
                  variant="secondary"
                  label={birthday ? "Change Birthday" : "Set Birthday"}
                  onPress={() => setShowDatePicker(true)}
                  style={{ borderRadius: 12, marginBottom: 16 }}
                />

                {showDatePicker && (
                  <View className="mb-4">
                    <DateTimePicker
                      value={birthday || new Date(2000, 0, 1)}
                      mode="date"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={handleDateChange}
                      maximumDate={new Date()}
                      minimumDate={new Date(1900, 0, 1)}
                      themeVariant={isDark ? "dark" : "light"}
                    />
                    {Platform.OS === "ios" && (
                      <Button
                        variant="primary"
                        label="Done"
                        onPress={() => setShowDatePicker(false)}
                        size="sm"
                        style={{ marginTop: 8, borderRadius: 12 }}
                      />
                    )}
                  </View>
                )}

                {/* Birthday Options */}
                <View style={{ borderTopWidth: 1, borderTopColor: colors.separator, paddingTop: 12 }}>
                  {/* Show to Friends */}
                  <View className="flex-row items-center justify-between py-3">
                    <View className="flex-1 mr-3">
                      <Text style={{ color: colors.text }} className="text-sm font-medium">Show to Friends</Text>
                      <Text style={{ color: colors.textSecondary }} className="text-xs mt-0.5">
                        Your birthday will appear on friends' calendars
                      </Text>
                    </View>
                    <Switch
                      value={showBirthdayToFriends}
                      onValueChange={(value) => handleBirthdayToggle("showBirthdayToFriends", value)}
                      trackColor={{ false: isDark ? "#38383A" : "#E5E7EB", true: themeColor }}
                      thumbColor="#fff"
                    />
                  </View>

                  {/* Omit Birth Year */}
                  <View className="flex-row items-center justify-between py-3" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
                    <View className="flex-1 mr-3">
                      <Text style={{ color: colors.text }} className="text-sm font-medium">Hide Age/Year</Text>
                      <Text style={{ color: colors.textSecondary }} className="text-xs mt-0.5">
                        Only show month and day to friends
                      </Text>
                    </View>
                    <Switch
                      value={omitBirthdayYear}
                      onValueChange={(value) => handleBirthdayToggle("omitBirthdayYear", value)}
                      trackColor={{ false: isDark ? "#38383A" : "#E5E7EB", true: themeColor }}
                      thumbColor="#fff"
                    />
                  </View>

                  {/* Hide Others' Birthdays */}
                  <View className="flex-row items-center justify-between py-3" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
                    <View className="flex-1 mr-3">
                      <Text style={{ color: colors.text }} className="text-sm font-medium">Hide Birthdays</Text>
                      <Text style={{ color: colors.textSecondary }} className="text-xs mt-0.5">
                        Don't show friends' birthdays on my calendar
                      </Text>
                    </View>
                    <Switch
                      value={hideBirthdays}
                      onValueChange={(value) => handleBirthdayToggle("hideBirthdays", value)}
                      trackColor={{ false: isDark ? "#38383A" : "#E5E7EB", true: themeColor }}
                      thumbColor="#fff"
                    />
                  </View>
                </View>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Work Schedule Section */}
        <Animated.View entering={FadeInDown.delay(185).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">WORK SCHEDULE</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
            {/* Work Schedule Header */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowWorkScheduleSection(!showWorkScheduleSection);
              }}
              className="flex-row items-center p-4"
              style={{ borderBottomWidth: showWorkScheduleSection ? 1 : 0, borderBottomColor: colors.separator }}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
                <Briefcase size={20} color={themeColor} />
              </View>
              <View className="flex-1">
                <Text style={{ color: colors.text }} className="text-base font-medium">Weekly Schedule</Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm">
                  {workSchedules.filter((s) => s.isEnabled).length} work days set
                </Text>
              </View>
              <ChevronDown
                size={18}
                color={colors.textTertiary}
                style={{ transform: [{ rotate: showWorkScheduleSection ? "180deg" : "0deg" }] }}
              />
            </Pressable>

            {showWorkScheduleSection && (
              <View className="px-4 py-3">
                <Text style={{ color: colors.textTertiary }} className="text-xs mb-3">
                  Set your regular work hours. These will show as "Busy" on your calendar and help friends see when you're free. Tap (+) to add a second time block for split schedules.
                </Text>

                {/* Day-by-day schedule */}
                {workSchedules.map((schedule, index) => {
                  const hasBlock2 = expandedBlock2Days.has(schedule.dayOfWeek) || 
                    (schedule.block2StartTime && schedule.block2EndTime);
                  
                  return (
                  <View
                    key={schedule.dayOfWeek}
                    className="py-3"
                    style={{ borderTopWidth: index > 0 ? 1 : 0, borderTopColor: colors.separator }}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center flex-1">
                        <Text
                          style={{ color: schedule.isEnabled ? colors.text : colors.textTertiary }}
                          className="text-sm font-medium w-20"
                        >
                          {schedule.dayName}
                        </Text>
                        {schedule.isEnabled && (
                          <View className="flex-row items-center ml-2">
                            <Pressable
                              onPress={() => setShowTimePicker({ day: schedule.dayOfWeek, type: "start" })}
                              className="px-2 py-1 rounded-lg mr-1"
                              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                            >
                              <Text style={{ color: themeColor }} className="text-xs font-medium">
                                {formatTimeDisplay(schedule.startTime)}
                              </Text>
                            </Pressable>
                            <Text style={{ color: colors.textTertiary }} className="text-xs">to</Text>
                            <Pressable
                              onPress={() => setShowTimePicker({ day: schedule.dayOfWeek, type: "end" })}
                              className="px-2 py-1 rounded-lg ml-1"
                              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                            >
                              <Text style={{ color: themeColor }} className="text-xs font-medium">
                                {formatTimeDisplay(schedule.endTime)}
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                      <Switch
                        value={schedule.isEnabled}
                        onValueChange={(value) => handleWorkScheduleToggle(schedule.dayOfWeek, value)}
                        trackColor={{ false: isDark ? "#38383A" : "#E5E7EB", true: themeColor }}
                        thumbColor="#fff"
                      />
                    </View>

                    {/* Block 2 (split schedule) */}
                    {schedule.isEnabled && hasBlock2 && (
                      <View className="flex-row items-center mt-2 ml-20">
                        <Pressable
                          onPress={() => setShowTimePicker({ day: schedule.dayOfWeek, type: "block2Start" })}
                          className="px-2 py-1 rounded-lg mr-1"
                          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                        >
                          <Text style={{ color: themeColor }} className="text-xs font-medium">
                            {formatTimeDisplay(schedule.block2StartTime ?? null)}
                          </Text>
                        </Pressable>
                        <Text style={{ color: colors.textTertiary }} className="text-xs">to</Text>
                        <Pressable
                          onPress={() => setShowTimePicker({ day: schedule.dayOfWeek, type: "block2End" })}
                          className="px-2 py-1 rounded-lg ml-1"
                          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                        >
                          <Text style={{ color: themeColor }} className="text-xs font-medium">
                            {formatTimeDisplay(schedule.block2EndTime ?? null)}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => toggleBlock2(schedule.dayOfWeek)}
                          className="ml-2 w-6 h-6 rounded-full items-center justify-center"
                          style={{ backgroundColor: isDark ? "#3A3A3C" : "#E5E7EB" }}
                        >
                          <X size={14} color={colors.textTertiary} />
                        </Pressable>
                      </View>
                    )}

                    {/* Add Block 2 button */}
                    {schedule.isEnabled && !hasBlock2 && (
                      <Pressable
                        onPress={() => toggleBlock2(schedule.dayOfWeek)}
                        className="flex-row items-center mt-2 ml-20"
                      >
                        <View
                          className="w-5 h-5 rounded-full items-center justify-center mr-1"
                          style={{ backgroundColor: `${themeColor}20` }}
                        >
                          <Plus size={12} color={themeColor} />
                        </View>
                        <Text style={{ color: themeColor }} className="text-xs">
                          Add second block
                        </Text>
                      </Pressable>
                    )}

                    {/* Time Picker for this day */}
                    {showTimePicker?.day === schedule.dayOfWeek && (
                      <View className="mt-3">
                        <DateTimePicker
                          value={parseTimeToDate(
                            showTimePicker.type === "start" ? schedule.startTime :
                            showTimePicker.type === "end" ? schedule.endTime :
                            showTimePicker.type === "block2Start" ? (schedule.block2StartTime ?? null) :
                            (schedule.block2EndTime ?? null)
                          )}
                          mode="time"
                          display={Platform.OS === "ios" ? "spinner" : "default"}
                          onChange={(_event, selectedDate) => {
                            if (Platform.OS === "android") {
                              setShowTimePicker(null);
                            }
                            if (selectedDate) {
                              handleWorkScheduleTimeChange(schedule.dayOfWeek, showTimePicker.type, selectedDate);
                            }
                          }}
                          themeVariant={isDark ? "dark" : "light"}
                          style={{ height: 120 }}
                        />
                        {Platform.OS === "ios" && (
                          <Pressable
                            onPress={() => setShowTimePicker(null)}
                            className="py-2 mt-2 rounded-xl"
                            style={{ backgroundColor: themeColor }}
                          >
                            <Text className="text-center text-white font-medium">Done</Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>
                  );
                })}

                {/* Show on Calendar Toggle */}
                <View
                  className="flex-row items-center justify-between py-3 mt-2"
                  style={{ borderTopWidth: 1, borderTopColor: colors.separator }}
                >
                  <View className="flex-1 mr-3">
                    <Text style={{ color: colors.text }} className="text-sm font-medium">Show on Calendar</Text>
                    <Text style={{ color: colors.textSecondary }} className="text-xs mt-0.5">
                      Display work hours as bubbles on your calendar
                    </Text>
                  </View>
                  <Switch
                    value={workSettings.showOnCalendar}
                    onValueChange={(value) => updateWorkSettingsMutation.mutate({ showOnCalendar: value })}
                    trackColor={{ false: isDark ? "#38383A" : "#E5E7EB", true: themeColor }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Calendar Integration Section */}
        <Animated.View entering={FadeInDown.delay(190).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">CALENDAR</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
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
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">PRIVACY & SECURITY</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
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
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">SUPPORT</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
            <SettingItem
              icon={<BookOpen size={20} color={themeColor} />}
              title="Get Started Guide"
              subtitle="Learn how to use Open Invite"
              isDark={isDark}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/onboarding");
              }}
            />
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
            />
          </View>
        </Animated.View>

        {/* Admin Section - Only visible when unlocked AND admin */}
        {adminUnlocked && adminStatus?.isAdmin && (
          <Animated.View entering={FadeInDown.delay(270).springify()} className="mx-4 mt-6">
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">ADMIN</Text>
            <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
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
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">LEGAL</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
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
            style={{ backgroundColor: colors.surface }}
            className="rounded-2xl p-4 flex-row items-center justify-center"
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

      {/* Username Change Info Modal */}
      <Modal
        visible={showUsernameInfoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUsernameInfoModal(false)}
      >
        <Pressable
          className="flex-1 justify-center items-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setShowUsernameInfoModal(false)}
        >
          <Pressable
            onPress={() => {}}
            className="mx-6 rounded-2xl p-6"
            style={{ backgroundColor: colors.surface, maxWidth: 320 }}
          >
            <Text className="text-lg font-bold text-center mb-3" style={{ color: colors.text }}>
              Username Changes
            </Text>
            <Text className="text-sm text-center mb-5" style={{ color: colors.textSecondary }}>
              {adminStatus?.isAdmin 
                ? "As an admin, you can change your username without cooldown restrictions."
                : "You can change your username up to 2 times every 30 days."
              }
            </Text>
            <Button
              variant="primary"
              label="Got it"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowUsernameInfoModal(false);
              }}
              style={{ borderRadius: 12 }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Admin Unlock Passcode Modal */}
      <Modal
        visible={showPasscodeModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowPasscodeModal(false);
          setPasscodeInput("");
          setPasscodeError(false);
        }}
      >
        <Pressable
          className="flex-1 justify-center items-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => {
            setShowPasscodeModal(false);
            setPasscodeInput("");
            setPasscodeError(false);
          }}
        >
          <Pressable
            onPress={() => {}}
            className="mx-6 rounded-2xl p-6"
            style={{ backgroundColor: colors.surface, maxWidth: 320, width: "85%" }}
          >
            <Text className="text-lg font-bold text-center mb-3" style={{ color: colors.text }}>
              Enter Code
            </Text>
            <Text className="text-sm text-center mb-4" style={{ color: colors.textSecondary }}>
              Enter code to continue
            </Text>
            <TextInput
              value={passcodeInput}
              onChangeText={(text) => {
                setPasscodeInput(text);
                setPasscodeError(false);
              }}
              placeholder="Passcode"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              keyboardType="number-pad"
              autoFocus
              className="rounded-xl px-4 py-3 text-center text-lg mb-3"
              style={{
                backgroundColor: colors.separator,
                color: colors.text,
                borderWidth: passcodeError ? 2 : 0,
                borderColor: passcodeError ? "#EF4444" : "transparent",
              }}
              onSubmitEditing={handlePasscodeSubmit}
            />
            {passcodeError && (
              <Text className="text-sm text-center mb-3" style={{ color: "#EF4444" }}>
                Incorrect passcode
              </Text>
            )}
            <View className="flex-row gap-3">
              <Button
                variant="secondary"
                label="Cancel"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowPasscodeModal(false);
                  setPasscodeInput("");
                  setPasscodeError(false);
                }}
                style={{ flex: 1, borderRadius: 12 }}
              />
              <Button
                variant="primary"
                label="Submit"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handlePasscodeSubmit();
                }}
                style={{ flex: 1, borderRadius: 12 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Push Diagnostics Modal - DEV-only, never shown in production */}
      {canShowPushDiagnostics && (
      <Modal
        visible={showPushDiagModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPushDiagModal(false)}
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
                onPress={() => setShowPushDiagModal(false)}
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
                  onPress={doRunPushDiagnostics}
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
                  onPress={handleClearTokens}
                  loading={isClearingTokens}
                  style={{ flex: 1, borderRadius: 12, paddingVertical: 12 }}
                />
              </View>

              {/* Copy Report Button - shown when we have results */}
              {pushDiagResult && (
                <Pressable
                  onPress={handleCopyReport}
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
      )}
    </SafeAreaView>
  );
}

// Helper component for diagnostic rows
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
