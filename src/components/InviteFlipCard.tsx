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
import { BlurView } from "expo-blur";
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
const FLIP_DURATION = 480;
const FLIP_EASING = Easing.bezier(0.32, 0.0, 0.14, 1);
const CARD_RADIUS = 28;
const MINI_AV = 28;
const MINI_OVERLAP = 8;

// ─── Shadow style (cross-platform) ──────────────────────
// Two-layer shadow: tight contact shadow + broad ambient glow
const CARD_SHADOW = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 36,
  },
  android: {
    elevation: 14,
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
                  {/* Rich gradient overlay — soft top vignette + deep bottom for legibility */}
                  <LinearGradient
                    colors={[
                      "rgba(0,0,0,0.18)",
                      "transparent",
                      "transparent",
                      "rgba(0,0,0,0.45)",
                      "rgba(0,0,0,0.92)",
                    ]}
                    locations={[0, 0.1, 0.35, 0.6, 1]}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                    }}
                  />

                  {/* ── Top-left: countdown chip (frosted glass) ── */}
                  {countdownLabel && (
                    <View
                      style={{
                        position: "absolute",
                        top: 16,
                        left: 16,
                        borderRadius: 14,
                        overflow: "hidden",
                      }}
                    >
                      <BlurView
                        intensity={40}
                        tint="dark"
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 6,
                          backgroundColor:
                            countdownLabel === "Happening now"
                              ? "rgba(34,197,94,0.3)"
                              : "rgba(0,0,0,0.25)",
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
                            letterSpacing: 0.4,
                          }}
                        >
                          {countdownLabel}
                        </Text>
                      </BlurView>
                    </View>
                  )}

                  {/* ── Bottom info block ── */}
                  <View
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      padding: 22,
                      paddingBottom: 24,
                    }}
                  >
                    {/* Host attribution — small, above title */}
                    {hostName && (
                      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                        <View style={{ borderRadius: 12, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
                          <EntityAvatar
                            photoUrl={hostImageUrl}
                            initials={hostName?.[0] ?? "?"}
                            size={22}
                            backgroundColor="rgba(255,255,255,0.15)"
                            foregroundColor="#FFFFFF"
                          />
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.75)", marginLeft: 7 }}>
                          {isMyEvent ? "Your event" : `Hosted by ${hostName.split(" ")[0]}`}
                        </Text>
                      </View>
                    )}

                    {/* Title */}
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

                    {/* Date + Time line */}
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

                    {/* Location line */}
                    {locationDisplay && (
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
                    )}

                    {/* Social proof row — separator + avatar stack */}
                    <View style={{ borderTopWidth: 0.5, borderTopColor: "rgba(255,255,255,0.15)", paddingTop: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        {visibleAvatars.length > 0 && (
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
                                  borderColor: "rgba(255,255,255,0.25)",
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
                              fontSize: 14,
                              fontWeight: "700",
                              color: "rgba(255,255,255,0.95)",
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
                      paddingHorizontal: 26,
                      paddingTop: 32,
                    }}
                  >
                    <Text style={{ fontSize: 72, marginBottom: 20 }}>{emoji}</Text>
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

                    {/* Host attribution */}
                    {hostName && (
                      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
                        <View style={{ borderRadius: 12, borderWidth: 1.5, borderColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)", overflow: "hidden" }}>
                          <EntityAvatar
                            photoUrl={hostImageUrl}
                            initials={hostName?.[0] ?? "?"}
                            size={22}
                            backgroundColor={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"}
                            foregroundColor={colors.textSecondary}
                          />
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginLeft: 7 }}>
                          {isMyEvent ? "Your event" : `Hosted by ${hostName.split(" ")[0]}`}
                        </Text>
                      </View>
                    )}

                    {countdownLabel && (
                      <View
                        style={{
                          backgroundColor:
                            countdownLabel === "Happening now"
                              ? STATUS.going.bgSoft
                              : isDark
                                ? "rgba(255,255,255,0.08)"
                                : "rgba(0,0,0,0.04)",
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
                    <View style={{ alignItems: "center", gap: 5, marginBottom: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Calendar size={13} color={colors.textSecondary} />
                        <Text
                          style={{ fontSize: 14, color: colors.textSecondary, marginLeft: 7, fontWeight: "500" }}
                          numberOfLines={1}
                        >
                          {compactDate} · {timeLabel}
                        </Text>
                      </View>
                      {locationDisplay && (
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <MapPin size={13} color={colors.textSecondary} />
                          <Text
                            style={{ fontSize: 14, color: colors.textSecondary, marginLeft: 7, fontWeight: "500" }}
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
                        <Users size={14} color={STATUS.going.fg} />
                        <Text style={{ fontSize: 14, fontWeight: "600", color: STATUS.going.fg, marginLeft: 6 }}>
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
                backgroundColor: isDark ? "#1C1C1E" : "#FAF9F7",
                borderWidth: 0.5,
                borderColor: isDark
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.06)",
              }}
            >
              {/* Warm accent strip — thicker, more present */}
              <LinearGradient
                colors={[themeColor, `${themeColor}66`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  height: 4,
                  width: "100%",
                }}
              />

              <View style={{ flex: 1, padding: 24, paddingTop: 22, justifyContent: "center" }}>
                {/* Section label */}
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "800",
                    color: themeColor,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    marginBottom: 22,
                  }}
                >
                  The Details
                </Text>

                {/* Host — prominent on back */}
                {hostName && (
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
                    <View style={{ borderRadius: 24, borderWidth: 2.5, borderColor: isDark ? `${themeColor}60` : `${themeColor}40` }}>
                      <EntityAvatar
                        photoUrl={hostImageUrl}
                        initials={hostName?.[0] ?? "?"}
                        size={44}
                        backgroundColor={isDark ? "#2C2C2E" : "#FFF7ED"}
                        foregroundColor={themeColor}
                      />
                    </View>
                    <View style={{ marginLeft: 14, flex: 1 }}>
                      <Text style={{ fontSize: 11, color: colors.textTertiary, letterSpacing: 0.3, marginBottom: 2 }}>
                        Hosted by
                      </Text>
                      <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text }}>
                        {isMyEvent ? "You" : hostName}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Divider */}
                <View style={{ height: 0.5, backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", marginBottom: 18 }} />

                {/* Date + Time */}
                <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 18 }}>
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 11,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: `${themeColor}14`,
                      marginRight: 12,
                    }}
                  >
                    <Calendar size={17} color={themeColor} />
                  </View>
                  <View style={{ flex: 1, justifyContent: "center" }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 2 }} numberOfLines={1}>
                      {dateLabel}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                      {timeLabel}
                    </Text>
                  </View>
                </View>

                {/* Location — labeled detail row */}
                {locationDisplay && (
                  <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 18 }}>
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 11,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)",
                        marginRight: 12,
                      }}
                    >
                      <MapPin size={17} color={colors.textSecondary} />
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
                  <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 18 }}>
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 11,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)",
                        marginRight: 12,
                      }}
                    >
                      <FileText size={17} color={colors.textSecondary} />
                    </View>
                    <View style={{ flex: 1, justifyContent: "center" }}>
                      <Text style={{ fontSize: 11, color: colors.textTertiary, letterSpacing: 0.3, marginBottom: 2 }}>
                        Description
                      </Text>
                      <Text
                        style={{ fontSize: 14, lineHeight: 20, color: colors.text, fontWeight: "500" }}
                        numberOfLines={3}
                      >
                        {description}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {/* Divider before social proof */}
                <View style={{ height: 0.5, backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", marginBottom: 16 }} />

                {/* Social proof — avatar parity with front face */}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
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
                        width: 38,
                        height: 38,
                        borderRadius: 11,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: STATUS.going.bgSoft,
                        marginRight: 12,
                      }}
                    >
                      <Users size={17} color={STATUS.going.fg} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text }}>
                      {currentGoing} going
                    </Text>
                    {capacity != null && (
                      <Text style={{ fontSize: 13, color: capacity - currentGoing <= 0 ? "#EF4444" : colors.textSecondary, fontWeight: capacity - currentGoing <= 0 ? "600" : "400", marginTop: 2 }}>
                        {capacity - currentGoing <= 0 ? "Full" : `${capacity - currentGoing} spots remaining`}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Flip-back hint */}
                <View style={{ alignItems: "center", marginTop: "auto", paddingTop: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", opacity: 0.6 }}>
                    <RefreshCw size={11} color={colors.textTertiary} />
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginLeft: 5, fontWeight: "500" }}>
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
