import React, { useState } from "react";
import { View, Pressable, Text, Image } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { Calendar, Plus, Sparkles, Users, User, Compass, Building2, type LucideIcon } from "lucide-react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/cn";
import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { type GetFriendRequestsResponse, type GetEventRequestsResponse, type GetProfilesResponse } from "@/shared/contracts";
import { ProfileSwitcher } from "./ProfileSwitcher";

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
  isBusinessProfile?: boolean;
}

function NavButton({ Icon, label, href, isCenter, isActive, accentColor = "#FF6B4A", isDark, inactiveColor, badgeCount, onLongPress, customImage, isBusinessProfile }: NavButtonProps) {
  const router = useRouter();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
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
            elevation: 8,
          },
        ]}
      >
        <Icon size={28} color="#fff" />
      </AnimatedPressable>
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
          className={cn("p-2 rounded-xl")}
          style={isActive && !showCustomImage ? { backgroundColor: accentColor + "15" } : undefined}
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
        {badgeCount !== undefined && badgeCount > 0 && (
          <View
            className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full items-center justify-center px-1"
            style={{ backgroundColor: "#FF3B30" }}
          >
            <Text className="text-white text-xs font-bold">
              {badgeCount > 99 ? "99+" : badgeCount}
            </Text>
          </View>
        )}
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

export function BottomNavigation() {
  const pathname = usePathname();
  const { themeColor, isDark, colors } = useTheme();
  const { data: session } = useSession();
  const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);

  // Fetch friend requests count for notification badge
  const { data: friendRequestsData } = useQuery({
    queryKey: ["friendRequests"],
    queryFn: () => api.get<GetFriendRequestsResponse>("/api/friends/requests"),
    enabled: !!session,
    staleTime: 30000, // Cache for 30 seconds to avoid too many requests
  });

  // Fetch event requests count for calendar badge
  const { data: eventRequestsData } = useQuery({
    queryKey: ["event-requests"],
    queryFn: () => api.get<GetEventRequestsResponse>("/api/event-requests"),
    enabled: !!session,
    staleTime: 30000,
  });

  // Fetch circle unread count for friends badge
  const { data: circleUnreadData } = useQuery({
    queryKey: ["circleUnreadCount"],
    queryFn: () => api.get<{ totalUnread: number }>("/api/circles/unread/count"),
    enabled: !!session,
    staleTime: 30000,
  });

  // Fetch profiles for profile switcher
  const { data: profilesData } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api.get<GetProfilesResponse>("/api/profiles"),
    enabled: !!session,
    staleTime: 60000, // Cache for 1 minute
  });

  const friendRequestCount = friendRequestsData?.received?.length ?? 0;
  const circleUnreadCount = circleUnreadData?.totalUnread ?? 0;
  const friendsBadgeCount = friendRequestCount + circleUnreadCount;
  const pendingEventRequestCount = eventRequestsData?.pendingCount ?? 0;

  // Get active profile info
  const activeProfile = profilesData?.activeProfile;
  const isBusinessProfile = activeProfile?.type === "business";
  const profileImage = activeProfile?.image ?? session?.user?.image;

  // Check if user has multiple profiles (show indicator)
  const hasMultipleProfiles = (profilesData?.profiles?.length ?? 0) > 1;

  const navItems: { Icon: LucideIcon; label: string; href: string; isCenter?: boolean; badgeCount?: number }[] = [
    { Icon: Compass, label: "Discover", href: "/discover" },
    { Icon: Calendar, label: "Calendar", href: "/calendar", badgeCount: pendingEventRequestCount },
    { Icon: Sparkles, label: "Feed", href: "/", isCenter: true },
    { Icon: Users, label: "Friends", href: "/friends", badgeCount: friendsBadgeCount },
    { Icon: User, label: "Profile", href: "/profile" },
  ];

  return (
    <>
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
        }}
      >
        <View className="flex-row items-end justify-around px-2 pt-2">
          {navItems.map((item) => (
            <NavButton
              key={item.href}
              Icon={item.Icon}
              label={item.label}
              href={item.href}
              isCenter={item.isCenter}
              isActive={pathname === item.href}
              accentColor={themeColor}
              isDark={isDark}
              inactiveColor={colors.textTertiary}
              badgeCount={item.badgeCount}
              onLongPress={item.label === "Profile" && hasMultipleProfiles ? () => setShowProfileSwitcher(true) : undefined}
              customImage={item.label === "Profile" ? profileImage : undefined}
              isBusinessProfile={item.label === "Profile" ? isBusinessProfile : undefined}
            />
          ))}
        </View>
      </View>

      {/* Profile Switcher Modal */}
      <ProfileSwitcher
        visible={showProfileSwitcher}
        onClose={() => setShowProfileSwitcher(false)}
      />
    </>
  );
}
