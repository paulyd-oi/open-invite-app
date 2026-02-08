import React, { useState } from "react";
import { View, Pressable, Text, Image } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { type LucideIcon } from "../ui/icons";
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { api } from "@/lib/api";
import { resolveImageUrl } from "@/lib/imageUrl";
import { type GetFriendRequestsResponse, type GetEventRequestsResponse, type GetProfilesResponse } from "@/shared/contracts";
import { BOTTOM_NAV_TABS, assertTabOrder, type NavTab } from "@/constants/navigation";
import { circleKeys } from "@/lib/circleQueryKeys";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface NavButtonProps {
  Icon: LucideIcon;
  label: string;
  href: string;
  isCenter?: boolean;
  isActive: boolean;
  accentColor?: string;
  isDark: boolean;
  inactiveColor: string;
  badgeCount?: number;
  onLongPress?: () => void;
  customImage?: string | null;
}

function NavButton({
  Icon,
  label,
  href,
  isCenter,
  isActive,
  accentColor = "#FF6B4A",
  isDark,
  inactiveColor,
  badgeCount,
  onLongPress,
  customImage,
  bootStatus,
}: NavButtonProps & { bootStatus: string }) {
  const router = useRouter();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    // Auth guard: explicit bootStatus handling (matches BootRouter behavior)
    if (bootStatus === 'loading') {
      // Ignore tap during boot - don't redirect, let boot complete
      return;
    }
    if (bootStatus === 'onboarding') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.replace('/welcome');
      return;
    }
    if (bootStatus === 'loggedOut' || bootStatus === 'error') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.replace('/login');
      return;
    }

    // Don't navigate if already on this page
    if (isActive) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withTiming(0.9, { duration: 50 }),
      withSpring(1, { damping: 15 })
    );
    router.push(href as any);
  };

  const handleLongPress = () => {
    if (onLongPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      onLongPress();
    }
  };

  if (isCenter) {
    return (
      <View style={{ position: "relative", zIndex: 100 }}>
        <AnimatedPressable
          onPress={handlePress}
          style={[
            animatedStyle,
            {
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: accentColor,
              alignItems: "center",
              justifyContent: "center",
              marginTop: -20,
              shadowColor: accentColor,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0.6 : 0.4,
              shadowRadius: 8,
              elevation: 12,
            },
          ]}
        >
          <Icon size={28} color="#fff" />
        </AnimatedPressable>
      </View>
    );
  }

  // Special rendering for profile with custom avatar
  const showCustomImage = customImage && label === "Profile";

  return (
    <AnimatedPressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={400}
      style={animatedStyle}
      className="flex-1 items-center justify-center py-2"
    >
      <View className="relative">
        <View
          style={
            isActive && !showCustomImage
              ? { backgroundColor: accentColor + "15", borderRadius: 12, padding: 8 }
              : { padding: 8 }
          }
        >
          {showCustomImage ? (
            <View className="relative">
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  borderWidth: isActive ? 2 : 1,
                  borderColor: isActive ? accentColor : (isDark ? "#48484A" : "#D1D5DB"),
                  padding: 1,
                }}
              >
                <Image
                  source={{ uri: customImage }}
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: 12,
                  }}
                />
              </View>
            {/* Business profile indicator hidden for now */}
          </View>
        ) : (
          <View className="relative">
            <Icon size={24} color={isActive ? accentColor : inactiveColor} />
            {/* Business profile indicator hidden for now */}
          </View>
        )}
        </View>
        {/* [UNREAD_DOTS_REMOVED_P2.3] Badge indicators removed pre-launch */}
      </View>
      <Text
        className="text-xs mt-1 font-medium"
        style={{ color: isActive ? accentColor : inactiveColor }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

export default function BottomNavigation() {
  const pathname = usePathname();
  const { themeColor, isDark, colors } = useTheme();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();

  // Fetch friend requests count for notification badge
  const { data: friendRequestsData } = useQuery({
    queryKey: ["friendRequests"],
    queryFn: () => api.get<GetFriendRequestsResponse>("/api/friends/requests"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 300000, // Cache for 5 minutes to reduce query spam on tab switch
  });

  // Fetch event requests count for calendar badge
  const { data: eventRequestsData } = useQuery({
    queryKey: ["event-requests"],
    queryFn: () => api.get<GetEventRequestsResponse>("/api/event-requests"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 300000, // Cache for 5 minutes to reduce query spam on tab switch
  });

  // Fetch circle unread count for friends badge
  const { data: circleUnreadData } = useQuery({
    queryKey: circleKeys.unreadCount(),
    queryFn: () => api.get<{ totalUnread: number }>("/api/circles/unread/count"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 300000, // Cache for 5 minutes to reduce query spam on tab switch
  });

  // Fetch profiles for profile switcher
  const { data: profilesData } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api.get<GetProfilesResponse>("/api/profile"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 60000, // Cache for 1 minute
  });

  const friendRequestCount = Array.isArray(friendRequestsData?.received) ? friendRequestsData.received.length : 0;
  const circleUnreadCount = circleUnreadData?.totalUnread ?? 0;
  const friendsBadgeCount = friendRequestCount + circleUnreadCount;
  const pendingEventRequestCount = eventRequestsData?.pendingCount ?? 0;

  // Get active profile info
  const activeProfile = profilesData?.activeProfile;
  // Canonical avatar precedence: profile.image → session.user.image
  // Use resolveImageUrl to handle both absolute Cloudinary URLs and legacy /uploads/ paths
  const rawProfileImage = activeProfile?.image ?? (session?.user as any)?.image;
  const profileImage = resolveImageUrl(rawProfileImage);

  // Check if user has multiple profiles (show indicator)
  const hasMultipleProfiles = (profilesData?.profiles?.length ?? 0) > 1;

  // Map badge counts to tabs based on badgeKey
  const badgeCounts: Record<string, number> = {
    eventRequests: pendingEventRequestCount,
    friendRequests: friendsBadgeCount,
  };

  // Build navItems from canonical source with badge counts
  const navItems = BOTTOM_NAV_TABS.map(tab => ({
    ...tab,
    badgeCount: tab.badgeKey ? badgeCounts[tab.badgeKey] : undefined,
  }));

  // Dev-only: Assert tab order matches canonical
  assertTabOrder(navItems);

  return (
      <View
        className="absolute bottom-0 left-0 right-0"
        style={{
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingBottom: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: isDark ? 0.2 : 0.05,
          shadowRadius: 12,
          elevation: 12,
          overflow: "visible",
        }}
      >
        <View className="flex-row items-end justify-around px-2 pt-2" style={{ overflow: "visible" }}>
          {navItems.map((item) => (
            <NavButton
              key={item.key}
              Icon={item.Icon}
              label={item.label}
              href={item.href}
              isCenter={item.isCenter}
              isActive={pathname === item.href}
              accentColor={themeColor}
              isDark={isDark}
              inactiveColor={colors.textTertiary}
              badgeCount={item.badgeCount}
              customImage={item.label === "Profile" ? profileImage : undefined}
              bootStatus={bootStatus}
            />
          ))}
        </View>
      </View>

  );
}
