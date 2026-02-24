import React, { useState } from "react";
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
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import {
  ChevronLeft,
  Users,
  UserPlus,
  Calendar,
  Info,
  ChevronDown,
  Eye,
  EyeOff,
} from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { safeToast } from "@/lib/safeToast";

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
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();

  const [showFriendRequestPicker, setShowFriendRequestPicker] = useState(false);

  // Fetch privacy settings
  const { data: privacyData, isLoading } = useQuery({
    queryKey: ["privacySettings"],
    queryFn: () => api.get<{ settings: PrivacySettings }>("/api/privacy"),
    enabled: isAuthedForNetwork(bootStatus, session),
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
      safeToast.error("Save Failed", "Failed to update settings. Please try again.");
    },
  });

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
                value={settings?.shareCalendarAvailability ?? false}
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

        {/* Bottom spacing */}
        <View className="mb-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
