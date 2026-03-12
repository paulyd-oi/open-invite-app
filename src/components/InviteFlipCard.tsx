/**
 * InviteFlipCard V4.2 — 3D tap-to-flip invite card for Event Detail.
 *
 * Front: hero image + title + countdown + location + date + social proof.
 *        Self-explanatory at a glance — feels like an invitation poster.
 * Back:  host, full date/time, capacity, add-to-calendar hint.
 *
 * Card floats with shadow + depth. Tap to flip with premium 3D rotation.
 *
 * Proof tag: [EVENT_DETAIL_V4_FLIP_CARD]
 */

import React, { useCallback } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { MapPin, Calendar, Users, RefreshCw, FileText } from "@/ui/icons";
import { EntityAvatar } from "@/components/EntityAvatar";
import { RADIUS } from "@/ui/layout";
import { STATUS } from "@/ui/tokens";

// ─── Types ───────────────────────────────────────────────

export interface AttendeeAvatar {
  id: string;
  name?: string | null;
  imageUrl?: string | null;
}

export interface InviteFlipCardProps {
  // Front data
  title: string;
  imageUri: string | null;
  emoji: string;
  countdownLabel: string | null;
  dateLabel: string;
  timeLabel: string;
  locationDisplay: string | null;
  goingCount: number;
  attendeeAvatars: AttendeeAvatar[];

  // Back data
  description: string | null;
  hostName: string | null;
  hostImageUrl: string | null;
  isMyEvent: boolean;
  capacity: number | null;
  currentGoing: number;

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

  // Host edit button (rendered on front)
  editButton?: React.ReactNode;

  // Photo nudge (rendered on front, no-photo only)
  photoNudge?: React.ReactNode;
}

// ─── Constants ───────────────────────────────────────────
const FLIP_DURATION = 400;
const FLIP_EASING = Easing.bezier(0.4, 0.0, 0.2, 1);
const CARD_RADIUS = 28;
const MINI_AV = 26;
const MINI_OVERLAP = 7;

// ─── Shadow style (cross-platform) ──────────────────────
// Soft ambient glow — the atmosphere carries depth, not a harsh drop shadow
const CARD_SHADOW = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  android: {
    elevation: 6,
  },
  default: {},
}) as Record<string, unknown>;

// ─── Component ───────────────────────────────────────────

export function InviteFlipCard({
  title,
  imageUri,
  emoji,
  countdownLabel,
  dateLabel,
  timeLabel,
  locationDisplay,
  goingCount,
  attendeeAvatars,
  description,
  hostName,
  hostImageUrl,
  isMyEvent,
  capacity,
  currentGoing,
  themeColor,
  isDark,
  colors,
  heroFallbackBg,
  heroWashColors,
  heroWashLocations,
  editButton,
  photoNudge,
}: InviteFlipCardProps) {
  const flipProgress = useSharedValue(0);

  const handleFlip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const target = flipProgress.value < 0.5 ? 1 : 0;
    flipProgress.value = withTiming(target, {
      duration: FLIP_DURATION,
      easing: FLIP_EASING,
    });
  }, [flipProgress]);

  // Front face (0→90° visible)
  const frontStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [0, 180]);
    const opacity = interpolate(flipProgress.value, [0, 0.5, 0.5, 1], [1, 1, 0, 0]);
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }],
      opacity,
      backfaceVisibility: "hidden" as const,
    };
  });

  // Back face (90→180° visible)
  const backStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [-180, 0]);
    const opacity = interpolate(flipProgress.value, [0, 0.5, 0.5, 1], [0, 0, 1, 1]);
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }],
      opacity,
      backfaceVisibility: "hidden" as const,
    };
  });

  // Flip hint fades when card is mid-rotation
  const hintStyle = useAnimatedStyle(() => {
    const opacity = interpolate(flipProgress.value, [0, 0.15, 0.85, 1], [0.5, 0, 0, 0.5]);
    return { opacity };
  });

  const visibleAvatars = attendeeAvatars.slice(0, 4);
  const avatarStackWidth = visibleAvatars.length > 0
    ? visibleAvatars.length * (MINI_AV - MINI_OVERLAP) + MINI_OVERLAP
    : 0;

  // ─── Compact date for front (e.g. "Sat, Mar 15") ──
  const compactDate = dateLabel.length > 20
    ? dateLabel.replace(/^(\w+),\s*(\w+)\s+(\d+).*$/, "$1, $2 $3")
    : dateLabel;

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <Pressable onPress={handleFlip}>
        {/* Floating shadow container */}
        <View style={{ ...CARD_SHADOW, borderRadius: CARD_RADIUS }}>

          {/* ─── FRONT FACE ─── */}
          <Animated.View style={[{ width: "100%" }, frontStyle]}>
            <View
              style={{
                width: "100%",
                aspectRatio: 3 / 4,
                borderRadius: CARD_RADIUS,
                overflow: "hidden",
                backgroundColor: heroFallbackBg,
              }}
            >
              {imageUri ? (
                <>
                  <ExpoImage
                    source={{ uri: imageUri }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                    priority="high"
                  />
                  {/* Rich gradient overlay — top vignette + bottom info zone */}
                  <LinearGradient
                    colors={[
                      "rgba(0,0,0,0.15)",
                      "transparent",
                      "transparent",
                      "rgba(0,0,0,0.4)",
                      "rgba(0,0,0,0.75)",
                    ]}
                    locations={[0, 0.15, 0.45, 0.7, 1]}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                    }}
                  />

                  {/* ── Top-left: countdown chip ── */}
                  {countdownLabel && (
                    <View
                      style={{
                        position: "absolute",
                        top: 16,
                        left: 16,
                        backgroundColor:
                          countdownLabel === "Happening now"
                            ? "rgba(34,197,94,0.35)"
                            : "rgba(0,0,0,0.45)",
                        paddingHorizontal: 12,
                        paddingVertical: 5,
                        borderRadius: 12,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color:
                            countdownLabel === "Happening now"
                              ? "#4ADE80"
                              : "rgba(255,255,255,0.95)",
                          letterSpacing: 0.3,
                        }}
                      >
                        {countdownLabel}
                      </Text>
                    </View>
                  )}

                  {/* ── Bottom info block ── */}
                  <View
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      padding: 20,
                      paddingBottom: 18,
                    }}
                  >
                    {/* Title */}
                    <Text
                      style={{
                        fontSize: 26,
                        fontWeight: "800",
                        color: "#FFFFFF",
                        letterSpacing: -0.5,
                        lineHeight: 31,
                        textShadowColor: "rgba(0,0,0,0.4)",
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 4,
                        marginBottom: 10,
                      }}
                      numberOfLines={3}
                    >
                      {title}
                    </Text>

                    {/* Date + Time line */}
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                      <Calendar size={13} color="rgba(255,255,255,0.8)" />
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color: "rgba(255,255,255,0.9)",
                          marginLeft: 6,
                        }}
                        numberOfLines={1}
                      >
                        {compactDate} · {timeLabel}
                      </Text>
                    </View>

                    {/* Location line */}
                    {locationDisplay && (
                      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                        <MapPin size={13} color="rgba(255,255,255,0.8)" />
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "500",
                            color: "rgba(255,255,255,0.85)",
                            marginLeft: 6,
                            flex: 1,
                          }}
                          numberOfLines={1}
                        >
                          {locationDisplay}
                        </Text>
                      </View>
                    )}

                    {/* Social proof row */}
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      {visibleAvatars.length > 0 && (
                        <View
                          style={{
                            width: avatarStackWidth,
                            height: MINI_AV,
                            flexDirection: "row",
                            marginRight: 8,
                          }}
                        >
                          {visibleAvatars.map((a, i) => (
                            <View
                              key={a.id}
                              style={{
                                position: "absolute",
                                left: i * (MINI_AV - MINI_OVERLAP),
                                width: MINI_AV,
                                height: MINI_AV,
                                borderRadius: MINI_AV / 2,
                                borderWidth: 1.5,
                                borderColor: "rgba(0,0,0,0.3)",
                                zIndex: visibleAvatars.length - i,
                              }}
                            >
                              <EntityAvatar
                                photoUrl={a.imageUrl}
                                initials={a.name?.[0] ?? "?"}
                                size={MINI_AV - 3}
                                backgroundColor="rgba(255,255,255,0.2)"
                                foregroundColor="#FFFFFF"
                              />
                            </View>
                          ))}
                        </View>
                      )}
                      {goingCount > 0 ? (
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: "rgba(255,255,255,0.9)",
                          }}
                        >
                          {goingCount} going
                        </Text>
                      ) : (
                        <Text
                          style={{
                            fontSize: 13,
                            color: "rgba(255,255,255,0.6)",
                          }}
                        >
                          Be the first to RSVP
                        </Text>
                      )}
                    </View>
                  </View>
                </>
              ) : (
                /* ── No-photo: atmospheric emoji poster ── */
                <>
                  <LinearGradient
                    colors={heroWashColors as any}
                    locations={heroWashLocations as any}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                    }}
                  />
                  <View
                    style={{
                      flex: 1,
                      justifyContent: "center",
                      alignItems: "center",
                      paddingHorizontal: 24,
                      paddingTop: 40,
                    }}
                  >
                    <Text style={{ fontSize: 80, marginBottom: 20 }}>{emoji}</Text>
                    <Text
                      style={{
                        fontSize: 26,
                        fontWeight: "800",
                        color: colors.text,
                        textAlign: "center",
                        letterSpacing: -0.5,
                        lineHeight: 31,
                        marginBottom: 14,
                      }}
                      numberOfLines={3}
                    >
                      {title}
                    </Text>

                    {countdownLabel && (
                      <View
                        style={{
                          backgroundColor:
                            countdownLabel === "Happening now"
                              ? STATUS.going.bgSoft
                              : isDark
                                ? "rgba(255,255,255,0.08)"
                                : "rgba(0,0,0,0.04)",
                          paddingHorizontal: 12,
                          paddingVertical: 5,
                          borderRadius: 12,
                          marginBottom: 12,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "600",
                            color:
                              countdownLabel === "Happening now"
                                ? STATUS.going.fg
                                : colors.textSecondary,
                            letterSpacing: 0.3,
                          }}
                        >
                          {countdownLabel}
                        </Text>
                      </View>
                    )}

                    {/* Date + location on no-photo */}
                    <View style={{ alignItems: "center", gap: 4, marginBottom: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Calendar size={13} color={colors.textSecondary} />
                        <Text
                          style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 6, fontWeight: "500" }}
                          numberOfLines={1}
                        >
                          {compactDate} · {timeLabel}
                        </Text>
                      </View>
                      {locationDisplay && (
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <MapPin size={13} color={colors.textSecondary} />
                          <Text
                            style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 6, fontWeight: "500" }}
                            numberOfLines={1}
                          >
                            {locationDisplay}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Social proof */}
                    {goingCount > 0 && (
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Users size={13} color={STATUS.going.fg} />
                        <Text style={{ fontSize: 13, fontWeight: "600", color: STATUS.going.fg, marginLeft: 5 }}>
                          {goingCount} going
                        </Text>
                      </View>
                    )}
                  </View>
                </>
              )}

              {/* Edit button overlay */}
              {editButton && (
                <View style={{ position: "absolute", top: 14, right: 14 }}>
                  {editButton}
                </View>
              )}
            </View>

            {/* Photo nudge below card */}
            {!imageUri && photoNudge}
          </Animated.View>

          {/* ─── BACK FACE ─── */}
          <Animated.View
            style={[
              {
                width: "100%",
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
              },
              backStyle,
            ]}
          >
            <View
              style={{
                width: "100%",
                aspectRatio: 3 / 4,
                borderRadius: CARD_RADIUS,
                overflow: "hidden",
                backgroundColor: isDark ? "#1A1A1C" : "#F9F8F6",
                borderWidth: 0.5,
                borderColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.04)",
              }}
            >
              {/* Warm accent strip */}
              <LinearGradient
                colors={[themeColor, `${themeColor}55`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  height: 3,
                  width: "100%",
                }}
              />

              <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
                {/* Section label */}
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "800",
                    color: themeColor,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    marginBottom: 20,
                  }}
                >
                  The Details
                </Text>

                {/* Host — prominent on back */}
                {hostName && (
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 18 }}>
                    <View style={{ borderRadius: 24, borderWidth: 2.5, borderColor: isDark ? "#92400E" : "#FDBA74" }}>
                      <EntityAvatar
                        photoUrl={hostImageUrl}
                        initials={hostName?.[0] ?? "?"}
                        size={44}
                        backgroundColor={isDark ? "#2C2C2E" : "#FFF7ED"}
                        foregroundColor="#92400E"
                      />
                    </View>
                    <View style={{ marginLeft: 14, flex: 1 }}>
                      <Text style={{ fontSize: 11, color: colors.textTertiary, letterSpacing: 0.3, marginBottom: 1 }}>
                        Hosted by
                      </Text>
                      <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text }}>
                        {isMyEvent ? "You" : hostName}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Divider */}
                <View style={{ height: 0.5, backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", marginBottom: 16 }} />

                {/* Date + Time */}
                <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 16 }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: `${themeColor}14`,
                      marginRight: 12,
                    }}
                  >
                    <Calendar size={18} color={themeColor} />
                  </View>
                  <View style={{ flex: 1, justifyContent: "center" }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 1 }} numberOfLines={1}>
                      {dateLabel}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                      {timeLabel}
                    </Text>
                  </View>
                </View>

                {/* Location — labeled detail row */}
                {locationDisplay && (
                  <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 16 }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)",
                        marginRight: 12,
                      }}
                    >
                      <MapPin size={18} color={colors.textSecondary} />
                    </View>
                    <View style={{ flex: 1, justifyContent: "center" }}>
                      <Text style={{ fontSize: 11, color: colors.textTertiary, letterSpacing: 0.3, marginBottom: 2 }}>
                        Location
                      </Text>
                      <Text style={{ fontSize: 14, fontWeight: "500", color: colors.text, lineHeight: 20 }} numberOfLines={2}>
                        {locationDisplay}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Description — structured detail row */}
                {description ? (
                  <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 16 }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)",
                        marginRight: 12,
                      }}
                    >
                      <FileText size={18} color={colors.textSecondary} />
                    </View>
                    <View style={{ flex: 1, justifyContent: "center" }}>
                      <Text style={{ fontSize: 11, color: colors.textTertiary, letterSpacing: 0.3, marginBottom: 2 }}>
                        Description
                      </Text>
                      <Text
                        style={{ fontSize: 14, lineHeight: 19, color: colors.text, fontWeight: "500" }}
                        numberOfLines={3}
                      >
                        {description}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {/* Social proof — avatar parity with front face */}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
                  {visibleAvatars.length > 0 ? (
                    <View
                      style={{
                        width: avatarStackWidth,
                        height: MINI_AV,
                        flexDirection: "row",
                        marginRight: 10,
                      }}
                    >
                      {visibleAvatars.map((a, i) => (
                        <View
                          key={a.id}
                          style={{
                            position: "absolute",
                            left: i * (MINI_AV - MINI_OVERLAP),
                            width: MINI_AV,
                            height: MINI_AV,
                            borderRadius: MINI_AV / 2,
                            borderWidth: 1.5,
                            borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
                            zIndex: visibleAvatars.length - i,
                          }}
                        >
                          <EntityAvatar
                            photoUrl={a.imageUrl}
                            initials={a.name?.[0] ?? "?"}
                            size={MINI_AV - 3}
                            backgroundColor={isDark ? "#2C2C2E" : "#F0F0F0"}
                            foregroundColor={colors.textSecondary}
                          />
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: STATUS.going.bgSoft,
                        marginRight: 12,
                      }}
                    >
                      <Users size={18} color={STATUS.going.fg} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text }}>
                      {currentGoing} going
                    </Text>
                    {capacity != null && (
                      <Text style={{ fontSize: 13, color: capacity - currentGoing <= 0 ? "#EF4444" : colors.textSecondary, fontWeight: capacity - currentGoing <= 0 ? "600" : "400", marginTop: 1 }}>
                        {capacity - currentGoing <= 0 ? "Full" : `${capacity - currentGoing} spots remaining`}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Flip-back hint */}
                <View style={{ alignItems: "center", marginTop: "auto", paddingTop: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <RefreshCw size={12} color={colors.textTertiary} />
                    <Text style={{ fontSize: 12, color: colors.textTertiary, marginLeft: 5, fontWeight: "500" }}>
                      Tap to flip back
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>
        </View>
      </Pressable>

      {/* Flip hint below card */}
      <Animated.View style={[{ alignItems: "center", paddingTop: 10 }, hintStyle]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <RefreshCw size={11} color={colors.textTertiary} />
          <Text style={{ fontSize: 12, color: colors.textTertiary, fontWeight: "500", marginLeft: 5 }}>
            Tap for details
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}
