import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import {
  ChevronLeft,
  Mail,
  Lock,
  Download,
  Trash2,
  Eye,
  EyeOff,
} from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

import { performLogout } from "@/lib/logout";
import { api } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { BACKEND_URL } from "@/lib/config";
import { useTheme } from "@/lib/ThemeContext";
import { safeToast } from "@/lib/safeToast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { devLog, devError } from "@/lib/devLog";

export default function AccountSettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();

  // Email change state
  const [newEmail, setNewEmail] = useState("");
  const [isChangingEmail, setIsChangingEmail] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Reset password state
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Data export state
  const [isExporting, setIsExporting] = useState(false);

  // Delete account state
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [showFinalDeleteConfirm, setShowFinalDeleteConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const currentEmail = session?.user?.email ?? "";

  // ── Email change handler ──
  const handleChangeEmail = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed) {
      safeToast.error("Missing Email", "Please enter a new email address.");
      return;
    }
    if (trimmed === currentEmail.toLowerCase()) {
      safeToast.error("Same Email", "New email must be different from current.");
      return;
    }

    setIsChangingEmail(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await authClient.$fetch("/api/auth/change-email", {
        method: "POST",
        body: JSON.stringify({ newEmail: trimmed }),
        headers: { "Content-Type": "application/json" },
      });
      safeToast.success("Verification Sent", "Check your new email for a verification link.");
      setNewEmail("");
    } catch (error: any) {
      devError("[AccountSettings] changeEmail error", error);
      const msg = error?.message || "Failed to send verification email.";
      safeToast.error("Email Change Failed", msg);
    } finally {
      setIsChangingEmail(false);
    }
  };

  // ── Password change handler ──
  const handleChangePassword = async () => {
    if (!currentPassword) {
      safeToast.error("Missing Field", "Please enter your current password.");
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      safeToast.error("Weak Password", "New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      safeToast.error("Mismatch", "New passwords do not match.");
      return;
    }

    setIsChangingPassword(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await authClient.$fetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          revokeOtherSessions: false,
        }),
        headers: { "Content-Type": "application/json" },
      });
      safeToast.success("Password Changed", "Your password has been updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      devError("[AccountSettings] changePassword error", error);
      const msg = error?.message || "Failed to change password.";
      safeToast.error("Password Change Failed", msg);
    } finally {
      setIsChangingPassword(false);
    }
  };

  // ── Reset password handler (sends reset email) ──
  const handleResetPassword = async () => {
    if (!currentEmail) {
      safeToast.error("No Email", "Unable to determine your account email.");
      return;
    }

    setIsResettingPassword(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/forget-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: currentEmail,
          redirectTo: "/reset-password",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const msg = errorData?.message || errorData?.error || "Failed to send reset email.";
        if (typeof msg === "string" && msg.includes("EMAIL_PROVIDER_NOT_CONFIGURED")) {
          throw new Error("Password reset is temporarily unavailable. Please contact support@openinvite.cloud");
        }
        throw new Error(msg);
      }

      safeToast.success("Reset Email Sent", "Check your inbox for a password reset link.");
    } catch (error: any) {
      devError("[AccountSettings] resetPassword error", error);
      safeToast.error("Reset Failed", error?.message || "Unable to send reset email.");
    } finally {
      setIsResettingPassword(false);
    }
  };

  // ── Data export handler (reused from privacy-settings) ──
  const handleExportData = async () => {
    setIsExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const exportData = await api.get<Record<string, unknown>>("/api/privacy/export");

      const fileName = `open_invite_data_${new Date().toISOString().split("T")[0]}.json`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(
        filePath,
        JSON.stringify(exportData, null, 2),
        { encoding: FileSystem.EncodingType.UTF8 }
      );

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(filePath, {
          mimeType: "application/json",
          dialogTitle: "Export Your Data",
          UTI: "public.json",
        });
        safeToast.success("Export Complete", "Your data has been exported successfully.");
      } else {
        safeToast.info("Export Ready", `Data saved to ${fileName}`);
      }
    } catch (error) {
      devError("Export error:", error);
      safeToast.error("Export Failed", "Unable to export your data. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  // ── Delete account handlers (reused from privacy-settings) ──
  const handleDeleteAccount = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowDeleteAccountConfirm(true);
  };

  const handleFirstConfirm = () => {
    setShowDeleteAccountConfirm(false);
    setShowFinalDeleteConfirm(true);
  };

  const handleFinalConfirm = async () => {
    setShowFinalDeleteConfirm(false);
    setIsDeletingAccount(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await api.delete<{ success: boolean }>("/api/privacy/account");
      safeToast.success("Account Deleted", "Your account has been permanently deleted.");
      await performLogout({ screen: "privacy_settings", reason: "account_deletion", queryClient, router });
    } catch {
      safeToast.error("Delete Failed", "Failed to delete account. Please try again.");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b" style={{ borderBottomColor: colors.separator }}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          className="mr-3 p-2 -ml-2"
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={{ color: colors.text }} className="text-xl font-bold">Account Settings</Text>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Email Section */}
        <Animated.View entering={FadeInDown.delay(50).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">EMAIL</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden p-4">
            <View className="flex-row items-center mb-3">
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
              >
                <Mail size={20} color={themeColor} />
              </View>
              <View className="flex-1">
                <Text style={{ color: colors.textSecondary }} className="text-xs">Current email</Text>
                <Text style={{ color: colors.text }} className="text-base font-medium">{currentEmail || "Not set"}</Text>
              </View>
            </View>

            <TextInput
              style={{
                backgroundColor: isDark ? "#2C2C2E" : "#F5F5F5",
                color: colors.text,
                borderWidth: 1,
                borderColor: colors.separator,
              }}
              className="rounded-xl px-4 py-3 text-base mb-3"
              placeholder="New email address"
              placeholderTextColor={isDark ? "#636366" : "#9CA3AF"}
              value={newEmail}
              onChangeText={setNewEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Pressable
              onPress={handleChangeEmail}
              disabled={isChangingEmail || !newEmail.trim()}
              className="rounded-xl py-3 items-center"
              style={{
                backgroundColor: !newEmail.trim() ? (isDark ? "#2C2C2E" : "#E5E7EB") : themeColor,
                opacity: isChangingEmail ? 0.6 : 1,
              }}
            >
              {isChangingEmail ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={{ color: !newEmail.trim() ? colors.textTertiary : "#FFFFFF" }} className="text-base font-semibold">
                  Send verification link
                </Text>
              )}
            </Pressable>
          </View>
        </Animated.View>

        {/* Password Section */}
        <Animated.View entering={FadeInDown.delay(100).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">PASSWORD</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden p-4">
            {/* Change Password */}
            <View className="flex-row items-center mb-3">
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
              >
                <Lock size={20} color={themeColor} />
              </View>
              <Text style={{ color: colors.text }} className="text-base font-medium">Change Password</Text>
            </View>

            {/* Current Password */}
            <View className="mb-3">
              <View className="flex-row items-center">
                <TextInput
                  style={{
                    backgroundColor: isDark ? "#2C2C2E" : "#F5F5F5",
                    color: colors.text,
                    borderWidth: 1,
                    borderColor: colors.separator,
                    flex: 1,
                  }}
                  className="rounded-xl px-4 py-3 text-base"
                  placeholder="Current password"
                  placeholderTextColor={isDark ? "#636366" : "#9CA3AF"}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry={!showCurrentPassword}
                  autoCapitalize="none"
                />
                <Pressable
                  onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="ml-2 p-2"
                >
                  {showCurrentPassword ? (
                    <EyeOff size={20} color={colors.textTertiary} />
                  ) : (
                    <Eye size={20} color={colors.textTertiary} />
                  )}
                </Pressable>
              </View>
            </View>

            {/* New Password */}
            <View className="mb-3">
              <View className="flex-row items-center">
                <TextInput
                  style={{
                    backgroundColor: isDark ? "#2C2C2E" : "#F5F5F5",
                    color: colors.text,
                    borderWidth: 1,
                    borderColor: colors.separator,
                    flex: 1,
                  }}
                  className="rounded-xl px-4 py-3 text-base"
                  placeholder="New password"
                  placeholderTextColor={isDark ? "#636366" : "#9CA3AF"}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                />
                <Pressable
                  onPress={() => setShowNewPassword(!showNewPassword)}
                  className="ml-2 p-2"
                >
                  {showNewPassword ? (
                    <EyeOff size={20} color={colors.textTertiary} />
                  ) : (
                    <Eye size={20} color={colors.textTertiary} />
                  )}
                </Pressable>
              </View>
            </View>

            {/* Confirm Password */}
            <TextInput
              style={{
                backgroundColor: isDark ? "#2C2C2E" : "#F5F5F5",
                color: colors.text,
                borderWidth: 1,
                borderColor: colors.separator,
              }}
              className="rounded-xl px-4 py-3 text-base mb-3"
              placeholder="Confirm new password"
              placeholderTextColor={isDark ? "#636366" : "#9CA3AF"}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showNewPassword}
              autoCapitalize="none"
            />

            <Pressable
              onPress={handleChangePassword}
              disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="rounded-xl py-3 items-center mb-4"
              style={{
                backgroundColor: (!currentPassword || !newPassword || !confirmPassword)
                  ? (isDark ? "#2C2C2E" : "#E5E7EB")
                  : themeColor,
                opacity: isChangingPassword ? 0.6 : 1,
              }}
            >
              {isChangingPassword ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text
                  style={{
                    color: (!currentPassword || !newPassword || !confirmPassword)
                      ? colors.textTertiary
                      : "#FFFFFF",
                  }}
                  className="text-base font-semibold"
                >
                  Update Password
                </Text>
              )}
            </Pressable>

            {/* Divider */}
            <View style={{ backgroundColor: colors.separator, height: 1, marginBottom: 16 }} />

            {/* Reset Password */}
            <Pressable
              onPress={handleResetPassword}
              disabled={isResettingPassword}
              className="rounded-xl py-3 items-center"
              style={{
                backgroundColor: isDark ? "#2C2C2E" : "#F5F5F5",
                opacity: isResettingPassword ? 0.6 : 1,
              }}
            >
              {isResettingPassword ? (
                <ActivityIndicator size="small" color={themeColor} />
              ) : (
                <Text style={{ color: themeColor }} className="text-base font-semibold">
                  Send Password Reset Email
                </Text>
              )}
            </Pressable>
          </View>
        </Animated.View>

        {/* Data & Account Section */}
        <Animated.View entering={FadeInDown.delay(150).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">DATA & ACCOUNT</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
            {/* Download Data */}
            <Pressable
              onPress={handleExportData}
              disabled={isExporting}
              className="flex-row items-center p-4"
              style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
              >
                <Download size={20} color="#3B82F6" />
              </View>
              <View className="flex-1">
                <Text style={{ color: colors.text }} className="text-base font-medium">
                  Download My Data
                </Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">
                  Export all your data as JSON
                </Text>
              </View>
              {isExporting ? (
                <ActivityIndicator size="small" color={themeColor} />
              ) : (
                <Text style={{ color: colors.textTertiary }} className="text-lg">{"\u203A"}</Text>
              )}
            </Pressable>

            {/* Delete Account */}
            <Pressable
              onPress={handleDeleteAccount}
              disabled={isDeletingAccount}
              className="flex-row items-center p-4"
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: "#FEE2E2" }}
              >
                <Trash2 size={20} color="#EF4444" />
              </View>
              <View className="flex-1">
                <Text style={{ color: "#EF4444" }} className="text-base font-medium">
                  Delete Account
                </Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">
                  Permanently delete your account and data
                </Text>
              </View>
              {isDeletingAccount ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <Text style={{ color: colors.textTertiary }} className="text-lg">{"\u203A"}</Text>
              )}
            </Pressable>
          </View>
        </Animated.View>

        {/* Warning Notice */}
        <Animated.View entering={FadeInDown.delay(200).springify()} className="mx-4 mt-6 mb-8">
          <View
            className="p-4 rounded-2xl"
            style={{ backgroundColor: isDark ? "#1C1C1E" : "#FEF3C7" }}
          >
            <Text style={{ color: isDark ? "#FCD34D" : "#92400E" }} className="text-sm leading-5">
              <Text className="font-semibold">Note:</Text> Deleting your account is permanent and cannot be undone. All your events, friends, and data will be permanently removed.
            </Text>
          </View>
        </Animated.View>
      </ScrollView>

      <ConfirmModal
        visible={showDeleteAccountConfirm}
        title="Delete Account"
        message="Are you absolutely sure you want to delete your account? This action cannot be undone. All your data including events, friends, and settings will be permanently deleted."
        confirmText="Delete Account"
        isDestructive
        onConfirm={handleFirstConfirm}
        onCancel={() => setShowDeleteAccountConfirm(false)}
      />

      <ConfirmModal
        visible={showFinalDeleteConfirm}
        title="Final Confirmation"
        message="This is your last chance to cancel. Your account will be permanently deleted."
        confirmText="I Understand, Delete"
        isDestructive
        onConfirm={handleFinalConfirm}
        onCancel={() => setShowFinalDeleteConfirm(false)}
      />
    </SafeAreaView>
  );
}
