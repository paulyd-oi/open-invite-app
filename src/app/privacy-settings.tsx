import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  Users,
  UserPlus,
  Calendar,
  Download,
  Trash2,
  Info,
  ChevronDown,
  Shield,
  Eye,
  EyeOff,
} from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

import { api } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { useTheme } from "@/lib/ThemeContext";
import { safeToast } from "@/lib/safeToast";
import { ConfirmModal } from "@/components/ConfirmModal";

type FriendRequestSetting = "everyone" | "friends_of_friends" | "nobody";

interface PrivacySettings {
  allowFriendRequests: FriendRequestSetting;
  showInFriendSuggestions: boolean;
  shareCalendarAvailability: boolean;
}

const FRIEND_REQUEST_OPTIONS: { value: FriendRequestSetting; label: string; description: string }[] = [
  { value: "everyone", label: "Everyone", description: "Anyone can send you friend requests" },
  { value: "friends_of_friends", label: "Friends of Friends", description: "Only mutual connections can send requests" },
  { value: "nobody", label: "Nobody", description: "No one can send you friend requests" },
];

export default function PrivacySettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();

  const [showFriendRequestPicker, setShowFriendRequestPicker] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Fetch privacy settings
  const { data: privacyData, isLoading } = useQuery({
    queryKey: ["privacySettings"],
    queryFn: () => api.get<{ settings: PrivacySettings }>("/api/privacy"),
  });

  const settings = privacyData?.settings;

  // Update privacy settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: (data: Partial<PrivacySettings>) =>
      api.put<{ success: boolean }>("/api/privacy", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["privacySettings"] });
      safeToast.success("Settings Updated", "Your privacy settings have been saved.");
    },
    onError: () => {
      safeToast.error("Error", "Failed to update settings. Please try again.");
    },
  });

  // Export data mutation
  const handleExportData = async () => {
    setIsExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const exportData = await api.get<Record<string, unknown>>("/api/privacy/export");

      // Create a JSON file
      const fileName = `open_invite_data_${new Date().toISOString().split("T")[0]}.json`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(
        filePath,
        JSON.stringify(exportData, null, 2),
        { encoding: FileSystem.EncodingType.UTF8 }
      );

      // Check if sharing is available
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
      console.error("Export error:", error);
      safeToast.error("Export Failed", "Unable to export your data. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  // Delete account mutation
  const deleteAccountMutation = useMutation({
    mutationFn: () => api.delete<{ success: boolean }>("/api/privacy/account"),
    onSuccess: async () => {
      safeToast.success("Account Deleted", "Your account has been permanently deleted.");
      // Sign out and redirect to welcome
      await authClient.signOut();
      router.replace("/welcome");
    },
    onError: () => {
      safeToast.error("Error", "Failed to delete account. Please try again.");
    },
  });

  // State for delete account confirmation
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [showFinalDeleteConfirm, setShowFinalDeleteConfirm] = useState(false);

  const handleDeleteAccount = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowDeleteAccountConfirm(true);
  };

  const handleFirstConfirm = () => {
    setShowDeleteAccountConfirm(false);
    setShowFinalDeleteConfirm(true);
  };

  const handleFinalConfirm = () => {
    setShowFinalDeleteConfirm(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteAccountMutation.mutate();
  };

  const handleUpdateSetting = (key: keyof PrivacySettings, value: PrivacySettings[typeof key]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateSettingsMutation.mutate({ [key]: value });
  };

  const selectedFriendRequestOption = FRIEND_REQUEST_OPTIONS.find(
    (opt) => opt.value === settings?.allowFriendRequests
  );

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={themeColor} />
        </View>
      </SafeAreaView>
    );
  }

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
        <Text style={{ color: colors.text }} className="text-xl font-bold">Privacy Settings</Text>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Event Privacy Info */}
        <Animated.View entering={FadeInDown.delay(50).springify()} className="mx-4 mt-6">
          <View
            className="p-4 rounded-2xl flex-row"
            style={{ backgroundColor: `${themeColor}15` }}
          >
            <Info size={20} color={themeColor} style={{ marginTop: 2 }} />
            <View className="flex-1 ml-3">
              <Text style={{ color: colors.text }} className="font-semibold text-base mb-1">
                Event Privacy
              </Text>
              <Text style={{ color: colors.textSecondary }} className="text-sm leading-5">
                Events are public to friends unless created in a Circle or Group, which makes them private to those members only.
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Friend Requests & Discovery */}
        <Animated.View entering={FadeInDown.delay(100).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">
            FRIEND REQUESTS & DISCOVERY
          </Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
            {/* Who Can Send Friend Requests */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowFriendRequestPicker(!showFriendRequestPicker);
              }}
              className="flex-row items-center p-4"
              style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
              >
                <UserPlus size={20} color={themeColor} />
              </View>
              <View className="flex-1">
                <Text style={{ color: colors.text }} className="text-base font-medium">
                  Who Can Send Friend Requests
                </Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">
                  {selectedFriendRequestOption?.label ?? "Everyone"}
                </Text>
              </View>
              <ChevronDown
                size={20}
                color={colors.textTertiary}
                style={{ transform: [{ rotate: showFriendRequestPicker ? "180deg" : "0deg" }] }}
              />
            </Pressable>

            {/* Friend Request Options */}
            {showFriendRequestPicker && (
              <View style={{ backgroundColor: isDark ? "#1C1C1E" : "#F9FAFB" }}>
                {FRIEND_REQUEST_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      handleUpdateSetting("allowFriendRequests", option.value);
                      setShowFriendRequestPicker(false);
                    }}
                    className="flex-row items-center p-4"
                    style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}
                  >
                    <View className="flex-1">
                      <Text style={{ color: colors.text }} className="text-base font-medium">
                        {option.label}
                      </Text>
                      <Text style={{ color: colors.textSecondary }} className="text-sm">
                        {option.description}
                      </Text>
                    </View>
                    {settings?.allowFriendRequests === option.value && (
                      <View
                        className="w-6 h-6 rounded-full items-center justify-center"
                        style={{ backgroundColor: themeColor }}
                      >
                        <Text className="text-white text-xs">✓</Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            {/* Show in Friend Suggestions */}
            <View
              className="flex-row items-center p-4"
              style={{ borderBottomWidth: 0 }}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
              >
                <Users size={20} color="#8B5CF6" />
              </View>
              <View className="flex-1">
                <Text style={{ color: colors.text }} className="text-base font-medium">
                  Show in Friend Suggestions
                </Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">
                  Appear in "People you may know"
                </Text>
              </View>
              <Switch
                value={settings?.showInFriendSuggestions ?? true}
                onValueChange={(value) => handleUpdateSetting("showInFriendSuggestions", value)}
                trackColor={{ false: "#767577", true: themeColor }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </Animated.View>

        {/* Calendar */}
        <Animated.View entering={FadeInDown.delay(150).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">
            CALENDAR
          </Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
            <View className="flex-row items-center p-4">
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
              >
                <Calendar size={20} color="#10B981" />
              </View>
              <View className="flex-1">
                <Text style={{ color: colors.text }} className="text-base font-medium">
                  Share Calendar Availability
                </Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">
                  Let friends see when you're free
                </Text>
              </View>
              <Switch
                value={settings?.shareCalendarAvailability ?? true}
                onValueChange={(value) => handleUpdateSetting("shareCalendarAvailability", value)}
                trackColor={{ false: "#767577", true: themeColor }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
          <Text style={{ color: colors.textTertiary }} className="text-xs mt-2 ml-2">
            Location precision is controlled through your device's location permissions.
          </Text>
        </Animated.View>

        {/* Data & Account */}
        <Animated.View entering={FadeInDown.delay(200).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">
            DATA & ACCOUNT
          </Text>
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
                <Text style={{ color: colors.textTertiary }} className="text-lg">›</Text>
              )}
            </Pressable>

            {/* Delete Account */}
            <Pressable
              onPress={handleDeleteAccount}
              disabled={deleteAccountMutation.isPending}
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
              {deleteAccountMutation.isPending ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <Text style={{ color: colors.textTertiary }} className="text-lg">›</Text>
              )}
            </Pressable>
          </View>
        </Animated.View>

        {/* Warning Notice */}
        <Animated.View entering={FadeInDown.delay(250).springify()} className="mx-4 mt-6 mb-8">
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
