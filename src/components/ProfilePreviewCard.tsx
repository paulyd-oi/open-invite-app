import React from "react";
import { View, Text } from "react-native";
import { resolveBannerUri } from "@/lib/heroSSOT";
import { HeroBannerSurface } from "@/components/HeroBannerSurface";
import { EntityAvatar } from "@/components/EntityAvatar";

export interface ProfilePreviewCardProps {
  /** Profile-like object with bannerPhotoUrl / bannerUrl / avatarUrl / name / handle / calendarBio etc. */
  profile?: Record<string, unknown> | null;
  /** User-level fields (name, image) as fallback when profile sub-object is sparse. */
  userName?: string | null;
  userImage?: string | null;
  /** Current dark-mode flag. */
  isDark: boolean;
  /** SSOT color tokens from useTheme().colors. */
  colors: {
    text: string;
    textSecondary: string;
    textTertiary: string;
    surface: string;
    border: string;
  };
  /** Theme accent color for avatar foreground. */
  themeColor: string;
  /** Minimum hero height (default 200). */
  minHeight?: number;
}

/**
 * Self-contained profile preview card with full-bleed banner + glass panel.
 *
 * Designed for reuse anywhere a profile summary card is needed
 * (friend list, discover, share preview, etc.).
 *
 * Uses HeroBannerSurface + SSOT theme tokens — zero hardcoded colors.
 */
export function ProfilePreviewCard({
  profile,
  userName,
  userImage,
  isDark,
  colors,
  themeColor,
  minHeight = 200,
}: ProfilePreviewCardProps) {
  const bannerUri = resolveBannerUri(profile);
  const avatarUrl = (profile?.avatarUrl as string) ?? userImage ?? null;
  const name =
    (profile?.name as string) ??
    userName ??
    "Unknown";
  const handle = (profile?.handle as string) ?? null;
  const bio = (profile?.calendarBio as string) ?? null;
  const initials = name?.[0]?.toUpperCase() ?? "?";

  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
        backgroundColor: colors.surface,
      }}
    >
      <HeroBannerSurface
        bannerUri={bannerUri}
        isDark={isDark}
        minHeight={minHeight}
        fallbackBg={colors.surface}
      >
        <View style={{ alignItems: "center" }}>
          <EntityAvatar
            photoUrl={avatarUrl}
            initials={initials}
            size={64}
            backgroundColor={isDark ? colors.surface : `${themeColor}15`}
            foregroundColor={themeColor}
            fallbackIcon="person"
          />

          <Text
            style={{
              fontWeight: "700",
              fontSize: 18,
              color: colors.text,
              marginTop: 8,
              letterSpacing: -0.3,
            }}
          >
            {name}
          </Text>

          {handle ? (
            <Text
              style={{
                fontSize: 14,
                color: colors.textSecondary,
                marginTop: 2,
              }}
            >
              @{handle}
            </Text>
          ) : null}

          {bio ? (
            <Text
              style={{
                fontSize: 13,
                color: colors.textTertiary,
                textAlign: "center",
                marginTop: 4,
              }}
              numberOfLines={2}
            >
              {bio}
            </Text>
          ) : null}
        </View>
      </HeroBannerSurface>
    </View>
  );
}

export default ProfilePreviewCard;
