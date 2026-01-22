import React, { useState, useEffect } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
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
} from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { resetSession } from "@/lib/authBootstrap";
import { setLogoutIntent } from "@/lib/logoutIntent";
import { updateProfileAndSync } from "@/lib/profileSync";
import { getProfileDisplay, getProfileInitial } from "@/lib/profileDisplay";
import { getImageSource } from "@/lib/imageSource";
import { type UpdateProfileResponse, type GetProfileResponse } from "@/shared/contracts";
import { useTheme, THEME_COLORS, type ThemeMode } from "@/lib/ThemeContext";
import {
  isRevenueCatEnabled,
  hasEntitlement,
  restorePurchases,
} from "@/lib/revenuecatClient";
import { ConfirmModal } from "@/components/ConfirmModal";
import { deactivatePushTokenOnLogout } from "@/lib/pushTokenManager";
import { normalizeHandle, validateHandle, formatHandle } from "@/lib/handleUtils";
import { safeToast } from "@/lib/safeToast";
import { toUserMessage, logError } from "@/lib/errors";
import { uploadImage } from "@/lib/imageUpload";
import { checkAdminStatus } from "@/lib/adminApi";

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
        `${response.referrerName} earned a referral credit. Invite friends to unlock rewards!`
      );
      setReferrerCodeInput("");
      setShowReferrerInput(false);
      queryClient.invalidateQueries({ queryKey: ["referralStats"] });
    } catch (error: any) {
      const message = error?.message || "Failed to apply referral code";
      safeToast.error("Error", message);
    } finally {
      setIsApplyingCode(false);
    }
  };

  const successfulCount = referralStats?.successfulReferrals ?? 0;
  const hasReferrer = referralStats?.hasReferrer ?? false;

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
          Invite friends with your referral code to unlock rewards. The more friends on Open Invite, the easier planning becomes.
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
            style={{ color: successfulCount >= 3 ? "#10B981" : themeColor }}
            className="text-xs font-bold"
          >
            {successfulCount < 3
              ? `${successfulCount}/3`
              : successfulCount < 10
              ? `${successfulCount}/10`
              : successfulCount < 20
              ? `${successfulCount}/20`
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
              successfulCount < 3
                ? (successfulCount / 3) * 100
                : successfulCount < 10
                ? ((successfulCount - 3) / 7) * 100
                : successfulCount < 20
                ? ((successfulCount - 10) / 10) * 100
                : 100
            }%`,
            backgroundColor: successfulCount >= 3 ? "#10B981" : themeColor,
          }}
        />
      </View>

      {/* Reward Status */}
      <Text style={{ color: colors.textTertiary }} className="text-xs text-center mb-3">
        {successfulCount >= 20
          ? "You've earned Lifetime FREE! No more payments needed."
          : successfulCount >= 10
          ? `${20 - successfulCount} more friends to unlock Lifetime FREE`
          : successfulCount >= 3
          ? `${10 - successfulCount} more friends to unlock 1 year FREE`
          : `${3 - successfulCount} more friends to unlock 1 month FREE`}
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
                If someone referred you, enter their code to give them credit and get 1 week free!
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, setThemeColor, themeColorName, themeMode, setThemeMode, isDark, colors } = useTheme();

  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showThemeModePicker, setShowThemeModePicker] = useState(false);

  // Confirm modal states
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showRemovePhoneConfirm, setShowRemovePhoneConfirm] = useState(false);

  // Profile editing states
  const [editName, setEditName] = useState("");
  const [editImage, setEditImage] = useState("");
  const [editCalendarBio, setEditCalendarBio] = useState("");
  const [editHandle, setEditHandle] = useState("");
  const [handleError, setHandleError] = useState<string | null>(null);

  // Phone number states
  const [showPhoneSection, setShowPhoneSection] = useState(false);
  const [editPhone, setEditPhone] = useState("");
  const [isSavingPhone, setIsSavingPhone] = useState(false);

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
  const [showTimePicker, setShowTimePicker] = useState<{ day: number; type: "start" | "end" } | null>(null);

  // Work schedule types
  interface WorkScheduleDay {
    id: string;
    dayOfWeek: number;
    dayName: string;
    isEnabled: boolean;
    startTime: string | null;
    endTime: string | null;
    label: string;
  }

  interface WorkScheduleSettings {
    showOnCalendar: boolean;
  }

  // Subscription state
  const [isPremium, setIsPremium] = useState(false);
  const [isRestoringPurchases, setIsRestoringPurchases] = useState(false);

  // Check premium status on mount
  useEffect(() => {
    const checkPremiumStatus = async () => {
      if (!isRevenueCatEnabled()) return;
      const result = await hasEntitlement("premium");
      if (result.ok) {
        setIsPremium(result.data);
      }
    };
    checkPremiumStatus();
  }, []);

  const handleRestorePurchases = async () => {
    setIsRestoringPurchases(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await restorePurchases();
    if (result.ok) {
      const entitlementResult = await hasEntitlement("premium");
      if (entitlementResult.ok && entitlementResult.data) {
        setIsPremium(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeToast.success("Restored!", "Your premium subscription has been restored.");
      } else {
        safeToast.info("No Purchases Found", "We couldn't find any previous purchases.");
      }
    } else {
      safeToast.error("Error", "Failed to restore purchases. Please try again.");
    }

    setIsRestoringPurchases(false);
  };

  // Fetch work schedule
  const { data: workScheduleData } = useQuery({
    queryKey: ["workSchedule"],
    queryFn: () => api.get<{ schedules: WorkScheduleDay[]; settings: WorkScheduleSettings }>("/api/work-schedule"),
    enabled: !!session,
  });

  const workSchedules = workScheduleData?.schedules ?? [];
  const workSettings = workScheduleData?.settings ?? { showOnCalendar: true };

  // Fetch current profile to get calendarBio
  const { data: profileData } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get<GetProfileResponse>("/api/profile"),
    enabled: !!session,
  });

  // Check admin status (fail safe - returns isAdmin: false on any error)
  const { data: adminStatus } = useQuery({
    queryKey: ["adminStatus"],
    queryFn: checkAdminStatus,
    enabled: !!session,
    retry: false,
  });

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
    // Sync phone from user data
    if (profileData?.user?.phone) {
      setEditPhone(profileData.user.phone);
    }
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
    mutationFn: (data: { name?: string; avatarUrl?: string; calendarBio?: string; phone?: string | null; handle?: string }) =>
      api.put<UpdateProfileResponse>("/api/profile", data),
    onSuccess: async (response, variables) => {
      if (__DEV__) console.log("[EditProfile] Save success", response);
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
        },
        user: {
          ...old?.user,
          name: variables?.name ?? old?.user?.name,
          image: variables?.avatarUrl ?? old?.user?.image,
        },
      }));
      
      // Use centralized sync helper to refresh both Better Auth session and React Query cache
      await updateProfileAndSync(queryClient);
      // Also refetch userProfile for any profile views
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
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

  // Phone number update mutation
  const updatePhoneMutation = useMutation({
    mutationFn: (data: { phone: string | null }) =>
      api.put<UpdateProfileResponse>("/api/profile", data),
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await updateProfileAndSync(queryClient);
      setIsSavingPhone(false);
      safeToast.success("Success", "Phone number updated");
    },
    onError: (error: unknown) => {
      setIsSavingPhone(false);
      // Check for specific error messages from the API
      const errorMessage = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : '';
      if (errorMessage.includes("already in use") || errorMessage.includes("409")) {
        safeToast.error("Phone Taken", "This phone number is already in use by another account");
      } else {
        safeToast.error("Error", "Failed to update phone number");
      }
    },
  });

  const handleSavePhone = () => {
    setIsSavingPhone(true);
    const phoneToSave = editPhone.trim() || null;
    updatePhoneMutation.mutate({ phone: phoneToSave });
  };

  const updateBirthdayMutation = useMutation({
    mutationFn: (data: { birthday?: string; showBirthdayToFriends?: boolean; hideBirthdays?: boolean; omitBirthdayYear?: boolean }) =>
      api.put<UpdateProfileResponse>("/api/profile", data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["birthdays"] });
    },
    onError: () => {
      safeToast.error("Error", "Failed to update birthday settings");
    },
  });

  const updateWorkScheduleMutation = useMutation({
    mutationFn: (data: { dayOfWeek: number; isEnabled?: boolean; startTime?: string; endTime?: string; label?: string }) =>
      api.put<{ schedule: WorkScheduleDay }>(`/api/work-schedule/${data.dayOfWeek}`, data),
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: ["workSchedule"] });
    },
    onError: () => {
      safeToast.error("Error", "Failed to update work schedule");
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
      safeToast.error("Error", "Failed to update work settings");
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

    try {
      const updates: { name?: string; avatarUrl?: string; calendarBio?: string; handle?: string } = {};
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
            if (__DEV__) console.log("[EditProfile] Uploading profile photo...");
            const uploadResponse = await uploadImage(editImage, true);
            updates.avatarUrl = uploadResponse.url;
            if (__DEV__) console.log("[EditProfile] Photo uploaded:", uploadResponse.url);
          } catch (uploadError) {
            logError("Profile Photo Upload", uploadError);
            safeToast.error("Upload Failed", "Failed to upload profile photo. Please try again.");
            return; // Stop save if upload fails
          }
        } else {
          // Already a URL - just use it
          updates.avatarUrl = editImage;
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
      }
      
      if (Object.keys(updates).length > 0) {
        if (__DEV__) console.log("[EditProfile] Save payload:", updates);
        updateProfileMutation.mutate(updates);
      } else {
        setShowEditProfile(false);
      }
    } catch (error) {
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
    console.log("[Settings] Starting logout process...");

    try {
      // Deactivate push token before signing out
      await deactivatePushTokenOnLogout();
      console.log("[Settings] Push token deactivated");

      // Standardized logout sequence
      setLogoutIntent();
      await resetSession({ reason: "user_logout", endpoint: "settings" });
      await queryClient.cancelQueries();
      queryClient.clear();
      console.log("[Settings] Session and cache cleared");

      // Reset boot authority singleton to trigger bootStatus update to 'loggedOut'
      const { resetBootAuthority } = await import("@/hooks/useBootAuthority");
      resetBootAuthority();
      console.log("[Settings] Boot authority reset");

      // Hard transition to login
      router.replace("/login");
      console.log("[Settings] Navigated to login");
    } catch (error) {
      console.error("[Settings] Error during logout:", error);
      // Try to navigate anyway
      try {
        await queryClient.cancelQueries();
        queryClient.clear();
        const { resetBootAuthority } = await import("@/hooks/useBootAuthority");
        resetBootAuthority();
      } catch (e) {
        // ignore
      }
      router.replace("/login");
    }
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

  const handleWorkScheduleTimeChange = (dayOfWeek: number, type: "start" | "end", date: Date) => {
    const timeStr = formatDateToTime(date);
    if (type === "start") {
      updateWorkScheduleMutation.mutate({ dayOfWeek, startTime: timeStr });
    } else {
      updateWorkScheduleMutation.mutate({ dayOfWeek, endTime: timeStr });
    }
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
          <Pressable
            onPress={() => router.push("/login")}
            className="px-6 py-3 rounded-full"
            style={{ backgroundColor: themeColor }}
          >
            <Text className="text-white font-semibold">Sign In</Text>
          </Pressable>
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
        <Text style={{ color: colors.text }} className="text-xl font-sora-bold">Settings</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Section */}
        {!showEditProfile ? (
          <Animated.View entering={FadeInDown.delay(0).springify()} className="mx-4 mt-4">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                // Use shared helper for consistent precedence
                const { displayName, avatarUri } = getProfileDisplay({ profileData, session });
                setEditName(displayName);
                setEditImage(avatarUri || "");
                setEditCalendarBio(profileData?.profile?.calendarBio ?? "");
                setShowEditProfile(true);
              }}
              className="rounded-2xl p-5 flex-row items-center"
              style={{
                backgroundColor: colors.surface,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isDark ? 0 : 0.05,
                shadowRadius: 8,
              }}
            >
              <View className="w-16 h-16 rounded-full mr-4 overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
                {avatarSource ? (
                  <Image source={avatarSource} className="w-full h-full" />
                ) : (
                  <View className="w-full h-full items-center justify-center" style={{ backgroundColor: `${themeColor}20` }}>
                    <Text style={{ color: themeColor }} className="text-2xl font-bold">
                      {getProfileInitial({ profileData, session })}
                    </Text>
                  </View>
                )}
              </View>
              <View className="flex-1">
                <Text style={{ color: colors.text }} className="text-lg font-semibold">
                  {getProfileDisplay({ profileData, session, fallbackName: "Add your name" }).displayName}
                </Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm">Tap to edit profile</Text>
              </View>
              <Text style={{ color: colors.textTertiary }} className="text-xl">›</Text>
            </Pressable>
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
                <Pressable onPress={handlePickImage} className="relative">
                  <View className="w-24 h-24 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}>
                    {editImage ? (
                      <Image source={{ uri: editImage }} className="w-full h-full" />
                    ) : (
                      <View className="w-full h-full items-center justify-center" style={{ backgroundColor: `${themeColor}20` }}>
                        <Text style={{ color: themeColor }} className="text-3xl font-bold">
                          {editName?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "?"}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View
                    className="absolute bottom-0 right-0 w-8 h-8 rounded-full items-center justify-center border-2"
                    style={{ backgroundColor: themeColor, borderColor: colors.surface }}
                  >
                    <Camera size={16} color="#fff" />
                  </View>
                </Pressable>
                <Text style={{ color: colors.textSecondary }} className="text-sm mt-2">Tap to change photo</Text>
              </View>

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
                <Pressable
                  onPress={() => setShowEditProfile(false)}
                  className="flex-1 py-3 rounded-xl mr-2"
                  style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                >
                  <Text style={{ color: colors.textSecondary }} className="text-center font-medium">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveProfile}
                  disabled={updateProfileMutation.isPending}
                  className="flex-1 py-3 rounded-xl"
                  style={{ backgroundColor: themeColor }}
                >
                  <Text className="text-center font-medium text-white">
                    {updateProfileMutation.isPending ? "Saving..." : "Save"}
                  </Text>
                </Pressable>
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

        {/* Phone Number Section */}
        <Animated.View entering={FadeInDown.delay(125).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">PHONE NUMBER</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowPhoneSection(!showPhoneSection);
              }}
              className="flex-row items-center p-4"
              style={{ borderBottomWidth: showPhoneSection ? 1 : 0, borderBottomColor: colors.separator }}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
                <Phone size={20} color={themeColor} />
              </View>
              <View className="flex-1">
                <Text style={{ color: colors.text }} className="text-base font-medium">My Phone Number</Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm">
                  {profileData?.user?.phone || "Not set"}
                </Text>
              </View>
              <ChevronDown
                size={18}
                color={colors.textTertiary}
                style={{ transform: [{ rotate: showPhoneSection ? "180deg" : "0deg" }] }}
              />
            </Pressable>

            {showPhoneSection && (
              <View className="px-4 py-3">
                {/* Disclaimer */}
                <View
                  className="rounded-xl p-3 mb-4"
                  style={{ backgroundColor: isDark ? "#1C1C1E" : "#F3F4F6" }}
                >
                  <Text style={{ color: colors.textSecondary }} className="text-xs leading-5">
                    Your phone number helps friends find you on Open Invite. When someone searches by phone number, they can send you a friend request. Your number is never shared publicly.
                  </Text>
                </View>

                {/* Phone Input */}
                <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Phone Number</Text>
                <TextInput
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="+1 (555) 123-4567"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB", color: colors.text }}
                  className="rounded-xl px-4 py-3 mb-4"
                />

                {/* Save Button */}
                <Pressable
                  onPress={handleSavePhone}
                  disabled={isSavingPhone}
                  className="py-3 rounded-xl items-center"
                  style={{ backgroundColor: themeColor }}
                >
                  <Text className="text-white font-semibold">
                    {isSavingPhone ? "Saving..." : "Save Phone Number"}
                  </Text>
                </Pressable>

                {/* Remove Phone */}
                {profileData?.user?.phone && (
                  <Pressable
                    onPress={() => setShowRemovePhoneConfirm(true)}
                    className="py-3 mt-2 rounded-xl items-center"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                  >
                    <Text style={{ color: "#EF4444" }} className="font-medium">Remove Phone Number</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </Animated.View>

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

            {/* Subscription */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/subscription");
              }}
              className="flex-row items-center p-4"
              style={{ borderTopWidth: 1, borderTopColor: colors.separator }}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: "#FFD70020" }}
              >
                <Crown size={20} color="#FFD700" />
              </View>
              <View className="flex-1">
                <Text style={{ color: colors.text }} className="text-base font-medium">Subscription</Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm">
                  {isPremium ? "Manage your plan" : "Upgrade to Premium"}
                </Text>
              </View>
              {isPremium && (
                <View className="px-2 py-1 rounded-full mr-2" style={{ backgroundColor: "#10B98120" }}>
                  <Text style={{ color: "#10B981" }} className="text-xs font-medium">Active</Text>
                </View>
              )}
              <Text style={{ color: colors.textTertiary }} className="text-lg">›</Text>
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
                <Pressable
                  onPress={() => setShowDatePicker(true)}
                  className="flex-row items-center justify-center py-3 rounded-xl mb-4"
                  style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                >
                  <Text style={{ color: themeColor }} className="font-medium">
                    {birthday ? "Change Birthday" : "Set Birthday"}
                  </Text>
                </Pressable>

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
                      <Pressable
                        onPress={() => setShowDatePicker(false)}
                        className="py-2 mt-2 rounded-xl"
                        style={{ backgroundColor: themeColor }}
                      >
                        <Text className="text-center text-white font-medium">Done</Text>
                      </Pressable>
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
                  Set your regular work hours. These will show as "Busy" on your calendar and help friends see when you're free.
                </Text>

                {/* Day-by-day schedule */}
                {workSchedules.map((schedule, index) => (
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

                    {/* Time Picker for this day */}
                    {showTimePicker?.day === schedule.dayOfWeek && (
                      <View className="mt-3">
                        <DateTimePicker
                          value={parseTimeToDate(
                            showTimePicker.type === "start" ? schedule.startTime : schedule.endTime
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
                ))}

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
              title="Add events from Apple or Google Calendar"
              subtitle="Share calendar events with friends"
              isDark={isDark}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/calendar-import-help");
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
              subtitle="Version 1.0.0"
              isDark={isDark}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                safeToast.info("About Open Invite", "Version 1.0.0 - Share plans with friends!");
              }}
            />
          </View>
        </Animated.View>

        {/* Admin Section - Only visible to admins */}
        {adminStatus?.isAdmin && (
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
                Linking.openURL("https://openinvite.app/privacy");
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
                Linking.openURL("https://openinvite.app/terms");
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

      {/* Remove Phone Confirm Modal */}
      <ConfirmModal
        visible={showRemovePhoneConfirm}
        title="Remove Phone Number"
        message="Are you sure you want to remove your phone number? Friends won't be able to find you by phone."
        confirmText="Remove"
        cancelText="Cancel"
        isDestructive
        onConfirm={() => {
          setShowRemovePhoneConfirm(false);
          setEditPhone("");
          updatePhoneMutation.mutate({ phone: null });
        }}
        onCancel={() => setShowRemovePhoneConfirm(false)}
      />
    </SafeAreaView>
  );
}
