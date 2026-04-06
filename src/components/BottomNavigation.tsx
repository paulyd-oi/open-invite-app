import React from "react";
import { View, Pressable, Platform, useWindowDimensions } from "react-native";
import { useRouter, usePathname, type Href } from "expo-router";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { api } from "@/lib/api";
import { resolveImageUrl } from "@/lib/imageUrl";
import { EntityAvatar } from "@/components/EntityAvatar";
import { type GetFriendRequestsResponse, type GetEventRequestsResponse, type GetProfilesResponse } from "@/shared/contracts";
import { BOTTOM_NAV_TABS, assertTabOrder, type NavTab } from "@/constants/navigation";
import { circleKeys } from "@/lib/circleQueryKeys";
import { qk } from "@/lib/queryKeys";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ─── Floating island layout constants ───────────────────────
// Total visual footprint from bottom of screen: inset.bottom + ISLAND_BOTTOM + ISLAND_HEIGHT
// Screens should use FLOATING_TAB_INSET for contentContainerStyle paddingBottom.
const ISLAND_HEIGHT = 56;
const ISLAND_BOTTOM = 8; // gap between island and safe area bottom
const ISLAND_HORIZONTAL = 16; // left/right margin
const ISLAND_RADIUS = 28; // pill shape

/** Minimum paddingBottom screens need to clear the floating tab bar. */
export const FLOATING_TAB_INSET = ISLAND_HEIGHT + ISLAND_BOTTOM + 20;

// ─── Responsive layout (local — no shared hook) ───────────
const WIDE_THRESHOLD = 768; // iPad Mini portrait logical width
const WIDE_MAX_WIDTH = 400; // max pill width on wide layouts

// ─── NavButton ──────────────────────────────────────────────

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
  customInitial?: string;
  testID?: string;
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
  customInitial,
  testID,
  bootStatus,
}: NavButtonProps & { bootStatus: string }) {
  const router = useRouter();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    if (bootStatus === "loading") return;
    if (bootStatus === "onboarding" || bootStatus === "loggedOut" || bootStatus === "error") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.replace("/welcome");
      return;
    }
    if (isActive) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withTiming(0.85, { duration: 50 }),
      withSpring(1, { damping: 15 })
    );
    router.push(href as Href);
  };

  const handleLongPress = () => {
    if (onLongPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      onLongPress();
    }
  };

  const showCustomImage = customImage && label === "Profile";
  const iconSize = isCenter ? 26 : 24;

  return (
    <AnimatedPressable
      testID={testID}
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={400}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
      style={[
        animatedStyle,
        {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          height: ISLAND_HEIGHT,
        },
      ]}
    >
      {/* Active indicator pill behind icon */}
      {isActive && !showCustomImage && (
        <View
          style={{
            position: "absolute",
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: accentColor + "18",
          }}
        />
      )}

      {showCustomImage ? (
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            borderWidth: isActive ? 2 : 1.5,
            borderColor: isActive ? accentColor : (isDark ? "#48484A" : "#D1D5DB"),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <EntityAvatar
            photoUrl={customImage}
            initials={customInitial}
            size={isActive ? 22 : 24}
            foregroundColor={accentColor}
            backgroundColor={isDark ? "#2C2C2E" : "#E5E7EB"}
            fallbackIcon="person-outline"
          />
        </View>
      ) : isCenter ? (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: isActive ? accentColor : (isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)"),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={iconSize} color={isActive ? "#FFFFFF" : inactiveColor} />
        </View>
      ) : (
        <Icon size={iconSize} color={isActive ? accentColor : inactiveColor} />
      )}
    </AnimatedPressable>
  );
}

// ─── BottomNavigation ───────────────────────────────────────

export default function BottomNavigation() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { themeColor, isDark, colors } = useTheme();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();

  // Fetch friend requests count for notification badge
  const { data: friendRequestsData } = useQuery({
    queryKey: qk.friend.requests(),
    queryFn: () => api.get<GetFriendRequestsResponse>("/api/friends/requests"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 300000,
  });

  // Fetch event requests count for calendar badge
  const { data: eventRequestsData } = useQuery({
    queryKey: qk.eventRequests(),
    queryFn: () => api.get<GetEventRequestsResponse>("/api/event-requests"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 300000,
  });

  // Fetch circle unread count for friends badge
  const { data: circleUnreadData } = useQuery({
    queryKey: circleKeys.unreadCount(),
    queryFn: () => api.get<{ totalUnread: number; byCircle: Record<string, number> }>("/api/circles/unread/count"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 300000,
  });

  // Fetch profiles for profile switcher
  const { data: profilesData } = useQuery({
    queryKey: qk.profiles(),
    queryFn: () => api.get<GetProfilesResponse>("/api/profile"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 60000,
  });

  const friendRequestCount = Array.isArray(friendRequestsData?.received) ? friendRequestsData.received.length : 0;
  const circleUnreadCount = circleUnreadData?.totalUnread ?? 0;
  const friendsBadgeCount = friendRequestCount + circleUnreadCount;
  const pendingEventRequestCount = eventRequestsData?.pendingCount ?? 0;

  const activeProfile = profilesData?.activeProfile;
  const rawProfileImage = activeProfile?.image ?? (session?.user as any)?.image;
  const profileImage = resolveImageUrl(rawProfileImage);
  const profileInitial = (activeProfile?.name ?? session?.user?.name)?.[0]?.toUpperCase() ?? "?";

  const badgeCounts: Record<string, number> = {
    eventRequests: pendingEventRequestCount,
    friendRequests: friendsBadgeCount,
  };

  const navItems = BOTTOM_NAV_TABS.map(tab => ({
    ...tab,
    badgeCount: tab.badgeKey ? badgeCounts[tab.badgeKey] : undefined,
  }));

  assertTabOrder(navItems);

  // Safe area bottom: at least 8 on devices without home indicator
  const safeBottom = Math.max(insets.bottom, 8);

  const { width: screenWidth } = useWindowDimensions();
  const isWide = screenWidth >= WIDE_THRESHOLD;

  return (
    <View
      accessibilityRole="tablist"
      style={{
        position: "absolute",
        bottom: safeBottom + ISLAND_BOTTOM,
        ...(isWide
          ? {
              left: Math.max(ISLAND_HORIZONTAL, (screenWidth - WIDE_MAX_WIDTH) / 2),
              right: Math.max(ISLAND_HORIZONTAL, (screenWidth - WIDE_MAX_WIDTH) / 2),
            }
          : { left: ISLAND_HORIZONTAL, right: ISLAND_HORIZONTAL }),
        height: ISLAND_HEIGHT,
        borderRadius: ISLAND_RADIUS,
        backgroundColor: isDark ? "rgba(28,28,30,0.92)" : "rgba(255,255,255,0.92)",
        flexDirection: "row",
        alignItems: "center",
        // Soft shadow
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.35 : 0.12,
        shadowRadius: 16,
        elevation: 16,
        // Subtle border for definition
        borderWidth: isDark ? 0.5 : 0.5,
        borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
      }}
    >
      {navItems.map((item) => (
        <NavButton
          key={item.key}
          testID={`app-tab-${item.key}`}
          Icon={item.Icon}
          label={item.label}
          href={item.href}
          isCenter={item.isCenter}
          isActive={pathname === item.href}
          accentColor={themeColor}
          isDark={isDark}
          inactiveColor={isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)"}
          badgeCount={item.badgeCount}
          customImage={item.label === "Profile" ? profileImage : undefined}
          customInitial={item.label === "Profile" ? profileInitial : undefined}
          bootStatus={bootStatus}
        />
      ))}
    </View>
  );
}
