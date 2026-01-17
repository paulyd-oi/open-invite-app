import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
} from "react-native";
import { toast } from "@/components/Toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Building2,
  Users,
  Calendar,
  Edit3,
  Trash2,
  BadgeCheck,
  Shield,
  Bell,
} from "lucide-react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import type { Business } from "@/shared/contracts";

interface SettingRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  isDark: boolean;
  showBorder?: boolean;
  danger?: boolean;
}

function SettingRow({
  icon,
  title,
  subtitle,
  onPress,
  rightElement,
  isDark,
  showBorder = true,
  danger = false,
}: SettingRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center p-4 active:opacity-70"
      style={{
        borderBottomWidth: showBorder ? 1 : 0,
        borderBottomColor: isDark ? "#38383A" : "#F3F4F6",
      }}
    >
      <View
        className="w-10 h-10 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: danger ? "#EF444420" : (isDark ? "#2C2C2E" : "#F3F4F6") }}
      >
        {icon}
      </View>
      <View className="flex-1">
        <Text
          className="text-base font-medium"
          style={{ color: danger ? "#EF4444" : (isDark ? "#FFFFFF" : "#1F2937") }}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            className="text-sm mt-0.5"
            style={{ color: isDark ? "#8E8E93" : "#6B7280" }}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {rightElement ?? (onPress && (
        <ChevronRight size={20} color={isDark ? "#636366" : "#9CA3AF"} />
      ))}
    </Pressable>
  );
}

export default function BusinessSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const { data: session } = useSession();

  // Fetch business data
  const { data } = useQuery({
    queryKey: ["business", id],
    queryFn: () => api.get<{ business: Business }>(`/api/businesses/${id}`),
    enabled: !!id && !!session,
  });

  const business = data?.business;
  const isOwner = business?.ownerId === session?.user?.id;

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/businesses/${id}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["businesses"] });
      router.replace("/account-center");
    },
    onError: (error: Error) => {
      toast.error("Error", error.message || "Failed to delete business");
    },
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDeleteBusiness = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    setShowDeleteConfirm(false);
    deleteMutation.mutate();
  };

  if (!session) {
    return (
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }}
        edges={["top"]}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!business) {
    return (
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }}
        edges={["top"]}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-row items-center px-4 py-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: colors.surface }}
          >
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text style={{ color: colors.text }} className="text-xl font-bold">
            Business Settings
          </Text>
        </View>
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }}
      edges={["top"]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View
        className="flex-row items-center px-4 py-3"
        style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }}
      >
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: colors.surface }}
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={{ color: colors.text }} className="text-xl font-bold">
          Business Settings
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Business Preview */}
        <Animated.View
          entering={FadeInDown.delay(0).springify()}
          className="mx-4 mt-4 p-4 rounded-2xl"
          style={{ backgroundColor: colors.surface }}
        >
          <View className="flex-row items-center">
            {business.logoUrl ? (
              <Image
                source={{ uri: business.logoUrl }}
                className="w-16 h-16 rounded-xl bg-zinc-200"
              />
            ) : (
              <View
                className="w-16 h-16 rounded-xl items-center justify-center"
                style={{ backgroundColor: "#9333EA20" }}
              >
                <Building2 size={32} color="#9333EA" />
              </View>
            )}
            <View className="flex-1 ml-4">
              <View className="flex-row items-center">
                <Text className="text-lg font-bold" style={{ color: colors.text }}>
                  {business.name}
                </Text>
                {business.isVerified && (
                  <BadgeCheck size={18} color="#9333EA" style={{ marginLeft: 4 }} />
                )}
              </View>
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                @{business.handle}
              </Text>
              <View className="flex-row mt-1">
                <Text className="text-xs" style={{ color: colors.textTertiary }}>
                  {business.followerCount ?? 0} followers • {business.eventCount ?? 0} events
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Profile Section */}
        <Animated.View
          entering={FadeInDown.delay(100).springify()}
          className="mx-4 mt-6"
        >
          <Text
            className="text-xs font-semibold uppercase tracking-wider mb-2 ml-2"
            style={{ color: colors.textTertiary }}
          >
            Profile
          </Text>
          <View
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: colors.surface }}
          >
            <SettingRow
              icon={<Edit3 size={20} color={themeColor} />}
              title="Edit Profile"
              subtitle="Update name, logo, description"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/business/${id}/edit` as any);
              }}
              isDark={isDark}
            />
            <SettingRow
              icon={<Building2 size={20} color="#6366F1" />}
              title="View Business Page"
              subtitle="See how others view your business"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/business/${id}` as any);
              }}
              isDark={isDark}
              showBorder={false}
            />
          </View>
        </Animated.View>

        {/* Team Section */}
        {isOwner && (
          <Animated.View
            entering={FadeInDown.delay(200).springify()}
            className="mx-4 mt-6"
          >
            <Text
              className="text-xs font-semibold uppercase tracking-wider mb-2 ml-2"
              style={{ color: colors.textTertiary }}
            >
              Team
            </Text>
            <View
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: colors.surface }}
            >
              <SettingRow
                icon={<Users size={20} color="#10B981" />}
                title="Manage Team"
                subtitle="Invite members, manage roles"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/business/${id}/team` as any);
                }}
                isDark={isDark}
                showBorder={false}
              />
            </View>
          </Animated.View>
        )}

        {/* Events Section */}
        <Animated.View
          entering={FadeInDown.delay(300).springify()}
          className="mx-4 mt-6"
        >
          <Text
            className="text-xs font-semibold uppercase tracking-wider mb-2 ml-2"
            style={{ color: colors.textTertiary }}
          >
            Events
          </Text>
          <View
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: colors.surface }}
          >
            <SettingRow
              icon={<Calendar size={20} color="#9333EA" />}
              title="Create Event"
              subtitle="Post a new event for your followers"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/business/${id}/create-event` as any);
              }}
              isDark={isDark}
              showBorder={false}
            />
          </View>
        </Animated.View>

        {/* Notifications Section */}
        <Animated.View
          entering={FadeInDown.delay(350).springify()}
          className="mx-4 mt-6"
        >
          <Text
            className="text-xs font-semibold uppercase tracking-wider mb-2 ml-2"
            style={{ color: colors.textTertiary }}
          >
            Notifications
          </Text>
          <View
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: colors.surface }}
          >
            <SettingRow
              icon={<Bell size={20} color="#F59E0B" />}
              title="Notification Settings"
              subtitle="Configure event and follower alerts"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/notification-settings");
              }}
              isDark={isDark}
              showBorder={false}
            />
          </View>
        </Animated.View>

        {/* Danger Zone */}
        {isOwner && (
          <Animated.View
            entering={FadeInDown.delay(400).springify()}
            className="mx-4 mt-6"
          >
            <Text
              className="text-xs font-semibold uppercase tracking-wider mb-2 ml-2"
              style={{ color: "#EF4444" }}
            >
              Danger Zone
            </Text>
            <View
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: colors.surface }}
            >
              <SettingRow
                icon={<Trash2 size={20} color="#EF4444" />}
                title="Delete Business"
                subtitle="Permanently remove this business"
                onPress={handleDeleteBusiness}
                isDark={isDark}
                showBorder={false}
                danger
              />
            </View>
          </Animated.View>
        )}
      </ScrollView>

      <ConfirmModal
        visible={showDeleteConfirm}
        title="Delete Business"
        message={`Are you sure you want to delete "${business?.name}"? This action cannot be undone. All events, followers, and team members will be removed.`}
        confirmText="Delete"
        isDestructive
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </SafeAreaView>
  );
}
