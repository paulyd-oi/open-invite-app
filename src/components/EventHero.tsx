/**
 * EventHero — Immersive edge-to-edge hero for Event Detail.
 *
 * Replaces the floating flip card with a full-bleed hero that makes
 * the event feel like the page, not a card placed on the page.
 *
 * Photo variant: edge-to-edge image, gradient overlay, embedded metadata.
 * No-photo variant: atmospheric gradient with large emoji + centered metadata.
 *
 * No flip interaction — the back-face details (host, capacity, description)
 * are surfaced inline in the page body where they're more accessible.
 */

import React from "react";
import { View, Text, Pressable, Platform, Dimensions } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Animated, { FadeIn } from "react-native-reanimated";
import { MapPin, Calendar, Users } from "@/ui/icons";
import { EntityAvatar } from "@/components/EntityAvatar";
import { STATUS } from "@/ui/tokens";

// ─── Types ───────────────────────────────────────────────

export interface EventHeroAttendee {
  id: string;
  name?: string | null;
  imageUrl?: string | null;
}

export interface EventHeroProps {
  title: string;
  imageUri: string | null;
  emoji: string;
  countdownLabel: string | null;
  dateLabel: string;
  timeLabel: string;
  locationDisplay: string | null;
  goingCount: number;
  attendeeAvatars: EventHeroAttendee[];
  hostName: string | null;
  hostImageUrl: string | null;
  isMyEvent: boolean;

  // Theme
  themeColor: string;
  isDark: boolean;
  colors: {
    text: string;
    textSecondary: string;
    textTertiary: string;
    background: string;
    surface: string;
    border: string;
  };

  // No-photo hero theme
  heroFallbackBg: string;
  heroWashColors: readonly string[];
  heroWashLocations: readonly number[];

  // Overlay controls (rendered by parent)
  editButton?: React.ReactNode;
  photoNudge?: React.ReactNode;
}

// ─── Constants ───────────────────────────────────────────
const { width: SCREEN_W } = Dimensions.get("window");
const HERO_HEIGHT_PHOTO = Math.round(SCREEN_W * 1.15); // ~115% of width — tall immersive hero
const HERO_HEIGHT_NO_PHOTO = Math.round(SCREEN_W * 0.85);
const AV_SIZE = 28;
const AV_OVERLAP = 8;

// ─── Component ───────────────────────────────────────────

export function EventHero({
  title,
  imageUri,
  emoji,
  countdownLabel,
  dateLabel,
  timeLabel,
  locationDisplay,
  goingCount,
  attendeeAvatars,
  hostName,
  hostImageUrl,
  isMyEvent,
  themeColor,
  isDark,
  colors,
  heroFallbackBg,
  heroWashColors,
  heroWashLocations,
  editButton,
  photoNudge,
}: EventHeroProps) {
  const visibleAvatars = attendeeAvatars.slice(0, 4);
  const avatarStackWidth = visibleAvatars.length > 0
    ? visibleAvatars.length * (AV_SIZE - AV_OVERLAP) + AV_OVERLAP
    : 0;

  // Compact date (e.g. "Sat, Mar 15")
  const compactDate = dateLabel.length > 20
    ? dateLabel.replace(/^(\w+),\s*(\w+)\s+(\d+).*$/, "$1, $2 $3")
    : dateLabel;

  const hostFirst = hostName ? hostName.split(" ")[0] : null;

  if (imageUri) {
    // ─── PHOTO HERO: Full-bleed image with metadata overlay ───
    return (
      <View style={{ height: HERO_HEIGHT_PHOTO, width: "100%" }}>
        <ExpoImage
          source={{ uri: imageUri }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
          priority="high"
        />

        {/* Gradient overlay: subtle top vignette, strong bottom for text */}
        <LinearGradient
          colors={[
            "rgba(0,0,0,0.25)",
            "transparent",
            "transparent",
            "rgba(0,0,0,0.45)",
            "rgba(0,0,0,0.88)",
          ]}
          locations={[0, 0.1, 0.35, 0.6, 1]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />

        {/* Bottom fade to page background for seamless transition */}
        <LinearGradient
          colors={["transparent", colors.background]}
          locations={[0.7, 1]}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 80 }}
        />

        {/* ── Countdown chip (top-left, frosted) ── */}
        {countdownLabel && (
          <Animated.View entering={FadeIn.delay(200)} style={{ position: "absolute", top: 58, left: 16 }}>
            <View style={{ borderRadius: 14, overflow: "hidden" }}>
              <BlurView
                intensity={40}
                tint="dark"
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  backgroundColor:
                    countdownLabel === "Happening now"
                      ? "rgba(34,197,94,0.3)"
                      : "rgba(0,0,0,0.2)",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: countdownLabel === "Happening now" ? "#4ADE80" : "rgba(255,255,255,0.95)",
                    letterSpacing: 0.4,
                  }}
                >
                  {countdownLabel}
                </Text>
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* Edit button overlay */}
        {editButton && (
          <View style={{ position: "absolute", top: 58, right: 16 }}>
            {editButton}
          </View>
        )}

        {/* ── Bottom metadata block ── */}
        <View style={{ position: "absolute", bottom: 20, left: 0, right: 0, paddingHorizontal: 20 }}>
          {/* Host attribution */}
          {hostName && (
            <Animated.View entering={FadeIn.delay(100)}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                <View style={{ borderRadius: 14, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
                  <EntityAvatar
                    photoUrl={hostImageUrl}
                    initials={hostName?.[0] ?? "?"}
                    size={24}
                    backgroundColor="rgba(255,255,255,0.15)"
                    foregroundColor="#FFFFFF"
                  />
                </View>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.8)", marginLeft: 8 }}>
                  {isMyEvent ? "Your event" : `Hosted by ${hostFirst}`}
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Title */}
          <Animated.View entering={FadeIn.delay(50)}>
            <Text
              style={{
                fontSize: 32,
                fontWeight: "800",
                color: "#FFFFFF",
                letterSpacing: -0.8,
                lineHeight: 38,
                textShadowColor: "rgba(0,0,0,0.5)",
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 8,
                marginBottom: 14,
              }}
              numberOfLines={3}
            >
              {title}
            </Text>
          </Animated.View>

          {/* Date + Time */}
          <Animated.View entering={FadeIn.delay(150)}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
              <Calendar size={14} color="rgba(255,255,255,0.7)" />
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "600",
                  color: "rgba(255,255,255,0.92)",
                  marginLeft: 8,
                  letterSpacing: 0.1,
                }}
                numberOfLines={1}
              >
                {compactDate} · {timeLabel}
              </Text>
            </View>
          </Animated.View>

          {/* Location */}
          {locationDisplay && (
            <Animated.View entering={FadeIn.delay(200)}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
                <MapPin size={14} color="rgba(255,255,255,0.7)" />
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "500",
                    color: "rgba(255,255,255,0.88)",
                    marginLeft: 8,
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {locationDisplay}
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Social proof row */}
          <Animated.View entering={FadeIn.delay(250)}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {visibleAvatars.length > 0 && (
                <View style={{ width: avatarStackWidth, height: AV_SIZE, flexDirection: "row", marginRight: 10 }}>
                  {visibleAvatars.map((a, i) => (
                    <View
                      key={a.id}
                      style={{
                        position: "absolute",
                        left: i * (AV_SIZE - AV_OVERLAP),
                        width: AV_SIZE,
                        height: AV_SIZE,
                        borderRadius: AV_SIZE / 2,
                        borderWidth: 1.5,
                        borderColor: "rgba(255,255,255,0.25)",
                        zIndex: visibleAvatars.length - i,
                      }}
                    >
                      <EntityAvatar
                        photoUrl={a.imageUrl}
                        initials={a.name?.[0] ?? "?"}
                        size={AV_SIZE - 3}
                        backgroundColor="rgba(255,255,255,0.2)"
                        foregroundColor="#FFFFFF"
                      />
                    </View>
                  ))}
                </View>
              )}
              {goingCount > 0 ? (
                <Text style={{ fontSize: 14, fontWeight: "700", color: "rgba(255,255,255,0.95)" }}>
                  {goingCount} going
                </Text>
              ) : (
                <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                  Be the first to RSVP
                </Text>
              )}
            </View>
          </Animated.View>
        </View>
      </View>
    );
  }

  // ─── NO-PHOTO HERO: Atmospheric gradient with emoji ───
  return (
    <View style={{ height: HERO_HEIGHT_NO_PHOTO, width: "100%", backgroundColor: heroFallbackBg }}>
      <LinearGradient
        colors={heroWashColors as any}
        locations={heroWashLocations as any}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Bottom fade to page background */}
      <LinearGradient
        colors={["transparent", colors.background]}
        locations={[0.75, 1]}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 60 }}
      />

      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 28, paddingTop: 20 }}>
        <Animated.View entering={FadeIn.delay(50)}>
          <Text style={{ fontSize: 72, marginBottom: 20, textAlign: "center" }}>{emoji}</Text>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(100)}>
          <Text
            style={{
              fontSize: 30,
              fontWeight: "800",
              color: colors.text,
              textAlign: "center",
              letterSpacing: -0.7,
              lineHeight: 36,
              marginBottom: 14,
            }}
            numberOfLines={3}
          >
            {title}
          </Text>
        </Animated.View>

        {/* Host attribution */}
        {hostName && (
          <Animated.View entering={FadeIn.delay(150)}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
              <View style={{ borderRadius: 14, borderWidth: 1.5, borderColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)", overflow: "hidden" }}>
                <EntityAvatar
                  photoUrl={hostImageUrl}
                  initials={hostName?.[0] ?? "?"}
                  size={24}
                  backgroundColor={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"}
                  foregroundColor={colors.textSecondary}
                />
              </View>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary, marginLeft: 8 }}>
                {isMyEvent ? "Your event" : `Hosted by ${hostFirst}`}
              </Text>
            </View>
          </Animated.View>
        )}

        {countdownLabel && (
          <Animated.View entering={FadeIn.delay(200)}>
            <View
              style={{
                backgroundColor: countdownLabel === "Happening now" ? STATUS.going.bgSoft : isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 12,
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: countdownLabel === "Happening now" ? STATUS.going.fg : colors.textSecondary,
                  letterSpacing: 0.3,
                }}
              >
                {countdownLabel}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Date + location */}
        <Animated.View entering={FadeIn.delay(250)}>
          <View style={{ alignItems: "center", gap: 5 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Calendar size={13} color={colors.textSecondary} />
              <Text style={{ fontSize: 14, color: colors.textSecondary, marginLeft: 7, fontWeight: "500" }} numberOfLines={1}>
                {compactDate} · {timeLabel}
              </Text>
            </View>
            {locationDisplay && (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <MapPin size={13} color={colors.textSecondary} />
                <Text style={{ fontSize: 14, color: colors.textSecondary, marginLeft: 7, fontWeight: "500" }} numberOfLines={1}>
                  {locationDisplay}
                </Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Social proof */}
        {goingCount > 0 && (
          <Animated.View entering={FadeIn.delay(300)}>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 14 }}>
              <Users size={14} color={STATUS.going.fg} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: STATUS.going.fg, marginLeft: 6 }}>
                {goingCount} going
              </Text>
            </View>
          </Animated.View>
        )}
      </View>

      {/* Photo nudge for no-photo events */}
      {photoNudge && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
          {photoNudge}
        </View>
      )}
    </View>
  );
}
