import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
} from "react-native";
import { safeToast } from "@/lib/safeToast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  User,
  Settings,
  Users,
  Plus,
  Shield,
  LogOut,
  BadgeCheck,
  Trash2,
  UserPlus,
  Gift,
} from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { performLogout } from "@/lib/logout";

import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { api } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import type { GetProfilesResponse, Profile } from "@/shared/contracts";

interface SectionCardProps {
  children: React.ReactNode;
  isDark: boolean;
  delay?: number;
}

function SectionCard({ children, isDark, delay = 0 }: SectionCardProps) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify()}
      className="mx-4 mt-4"
    >
      <View
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0 : 0.05,
          shadowRadius: 8,
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

interface ProfileRowProps {
  profile: Profile;
  isActive: boolean;
  onPress: () => void;
  isDark: boolean;
  themeColor: string;
  showBorder?: boolean;
}

function ProfileRow({
  profile,
  isActive,
  onPress,
  isDark,
  themeColor,
  showBorder = true,
}: ProfileRowProps) {
  const isPersonal = profile.type === "personal";

  return (
    <View
      style={{
        borderBottomWidth: showBorder ? 1 : 0,
        borderBottomColor: isDark ? "#38383A" : "#F3F4F6",
      }}
    >
      <Pressable
        onPress={onPress}
        className="flex-row items-center p-4 active:opacity-70"
      >
        {/* Avatar */}
        {profile.image ? (
          <Image
            source={{ uri: profile.image }}
            className="w-14 h-14 rounded-full bg-zinc-200"
          />
        ) : (
          <View
            className="w-14 h-14 rounded-full items-center justify-center"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
          >
            <User size={26} color={isDark ? "#8E8E93" : "#6B7280"} />
          </View>
        )}

        {/* Info */}
        <View className="flex-1 ml-3">
          <View className="flex-row items-center">
            <Text
              className="text-base font-semibold"
              style={{ color: isDark ? "#FFFFFF" : "#1F2937" }}
              numberOfLines={1}
            >
              {profile.name ?? "Personal Account"}
            </Text>
          </View>
          <Text
            className="text-sm mt-0.5"
            style={{ color: isDark ? "#8E8E93" : "#6B7280" }}
            numberOfLines={1}
          >
            {profile.handle
                ? `@${profile.handle}`
                : "Your personal profile"}
          </Text>
        </View>

        {/* Active Indicator & Arrow */}
        <View className="flex-row items-center">
          {isActive && (
            <View
              className="px-2 py-1 rounded-full mr-2"
              style={{ backgroundColor: "#10B98120" }}
            >
              <Text className="text-xs font-medium" style={{ color: "#10B981" }}>
                Active
              </Text>
            </View>
          )}
          <ChevronRight size={20} color={isDark ? "#636366" : "#9CA3AF"} />
        </View>
      </Pressable>
    </View>
  );
}

export default function AccountCenterScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();

  const [refreshing, setRefreshing] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  // Fetch profiles
  const { data: profilesData, refetch } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api.get<GetProfilesResponse>("/api/profile"),
    enabled: bootStatus === 'authed',
    staleTime: 1000 * 60 * 5,
  });

  const profiles = profilesData?.profiles ?? [];
  const activeProfileId = profilesData?.activeProfileId ?? null;

  const personalProfile = profiles.find((p) => p.type === "personal");

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleProfileSettings = (profile: Profile) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (profile.type === "personal") {
      router.push("/settings");
    }
  };

  const handleLogout = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowSignOutConfirm(true);
  };

  const confirmSignOut = async () => {
    setShowSignOutConfirm(false);
    await performLogout({ screen: "account_center", queryClient, router });
  };

  if (!session) {
    return (
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }}
        edges={["top"]}
      >
        <View className="flex-row items-center px-4 py-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: colors.surface }}
          >
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text style={{ color: colors.text }} className="text-xl font-bold">
            Account Center
          </Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text style={{ color: colors.textSecondary }}>
            Please sign in to access Account Center
          </Text>
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
          Account Center
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={themeColor}
          />
        }
      >
        {/* Account Overview */}
        <Animated.View entering={FadeInDown.delay(0).springify()} className="px-4 pt-4">
          <View className="items-center">
            {session.user?.image ? (
              <Image
                source={{ uri: session.user.image }}
                className="w-20 h-20 rounded-full bg-zinc-200"
              />
            ) : (
              <View
                className="w-20 h-20 rounded-full items-center justify-center"
                style={{ backgroundColor: `${themeColor}20` }}
              >
                <Text
                  className="text-3xl font-bold"
                  style={{ color: themeColor }}
                >
                  {session.user?.name?.[0]?.toUpperCase() ?? "?"}
                </Text>
              </View>
            )}
            <Text
              className="text-lg font-semibold mt-3"
              style={{ color: colors.text }}
            >
              {session.user?.name ?? "User"}
            </Text>
            {session.user?.handle && (
              <Text
                className="text-sm"
                style={{ color: colors.textSecondary }}
              >
                @{session.user.handle}
              </Text>
            )}
            <Text
              className="text-xs mt-2"
              style={{ color: colors.textTertiary }}
            >
              {profiles.length} {profiles.length === 1 ? "profile" : "profiles"} connected
            </Text>
          </View>
        </Animated.View>

        {/* Personal Profile Section */}
        <SectionCard isDark={isDark} delay={100}>
          <View className="px-4 pt-4 pb-2">
            <Text
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: colors.textTertiary }}
            >
              Personal Account
            </Text>
          </View>
          {personalProfile && (
            <ProfileRow
              profile={personalProfile}
              isActive={activeProfileId === null}
              onPress={() => handleProfileSettings(personalProfile)}
              isDark={isDark}
              themeColor={themeColor}
              showBorder={false}
            />
          )}
        </SectionCard>

        {/* Account Settings */}
        <SectionCard isDark={isDark} delay={200}>
          <View className="px-4 pt-4 pb-2">
            <Text
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: colors.textTertiary }}
            >
              Account Settings
            </Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/settings");
            }}
            className="flex-row items-center p-4 active:opacity-70"
            style={{
              borderBottomWidth: 1,
              borderBottomColor: isDark ? "#38383A" : "#F3F4F6",
            }}
          >
            <View
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              <Settings size={20} color={themeColor} />
            </View>
            <Text
              className="flex-1 ml-3 text-base font-medium"
              style={{ color: colors.text }}
            >
              General Settings
            </Text>
            <ChevronRight size={20} color={isDark ? "#636366" : "#9CA3AF"} />
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/redeem-code");
            }}
            className="flex-row items-center p-4 active:opacity-70"
          >
            <View
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              <Gift size={20} color={themeColor} />
            </View>
            <Text
              className="flex-1 ml-3 text-base font-medium"
              style={{ color: colors.text }}
            >
              Redeem Code
            </Text>
            <ChevronRight size={20} color={isDark ? "#636366" : "#9CA3AF"} />
          </Pressable>
        </SectionCard>

        {/* Sign Out */}
        <Animated.View
          entering={FadeInDown.delay(400).springify()}
          className="mx-4 mt-6"
        >
          <Pressable
            onPress={handleLogout}
            className="rounded-2xl p-4 flex-row items-center justify-center active:opacity-70"
            style={{ backgroundColor: colors.surface }}
          >
            <LogOut size={20} color="#EF4444" />
            <Text className="text-red-500 font-semibold ml-2">
              Sign Out of All Profiles
            </Text>
          </Pressable>
        </Animated.View>

        {/* Footer */}
        <Text
          className="text-center text-sm mt-6"
          style={{ color: colors.textTertiary }}
        >
          Manage all your profiles in one place
        </Text>
      </ScrollView>

      <ConfirmModal
        visible={showSignOutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out of all profiles?"
        confirmText="Sign Out"
        isDestructive
        onConfirm={confirmSignOut}
        onCancel={() => setShowSignOutConfirm(false)}
      />
    </SafeAreaView>
  );
}
