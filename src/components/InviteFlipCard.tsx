/**
 * InviteFlipCard V5 — Premium 3D tap-to-flip invite card for Event Detail.
 *
 * Front: hero image + title + host + countdown + date + location + social proof.
 *        Reads as a crafted invitation at a glance.
 * Back:  the details side — host, date/time, location, description, capacity.
 *
 * Card themes: resolved from eventThemes.ts SSOT (neutral fallback for unthemed events).
 * Card floats with depth shadow. Tap to flip with premium 3D rotation.
 *
 * Proof tag: [EVENT_DETAIL_V5_FLIP_CARD]
 */

import React, { useCallback, useMemo, useRef } from "react";
import { View, Text, Pressable, useWindowDimensions } from "react-native";
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
import { resolveEventTheme } from "@/lib/eventThemes";
import { softenColor } from "@/lib/softenColor";

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
  coHostNames?: string[];
  eventHook?: string | null;
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

  // Event Themes V1
  themeId?: string | null;

  // Card Color — explicit hex override for card backgrounds (null = use theme default)
  cardColor?: string | null;

  // Host edit button (rendered on front)
  editButton?: React.ReactNode;

  // Photo nudge (rendered on front, no-photo only)
  photoNudge?: React.ReactNode;

  // Called on the first flip (front → back)
  onFirstFlip?: () => void;
}

// ─── Helpers ────────────────────────────────────────────

/** WCAG relative-luminance check — returns black or white for best contrast. */
function getTextColorForBg(hex: string): "#000000" | "#FFFFFF" {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

// ─── Constants ───────────────────────────────────────────
const FLIP_DURATION = 480;
const FLIP_EASING = Easing.bezier(0.32, 0.0, 0.14, 1);
const CARD_RADIUS = 28;
const MINI_AV = 28;
const MINI_OVERLAP = 8;

// ─── Shadow style (cross-platform) ──────────────────────
const CARD_SHADOW = {} as Record<string, unknown>;

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
  coHostNames = [],
  eventHook,
  isMyEvent,
  capacity,
  currentGoing,
  themeColor,
  isDark,
  colors,
  themeId,
  cardColor,
  editButton,
  photoNudge,
  onFirstFlip,
}: InviteFlipCardProps) {
  const { width: screenWidth } = useWindowDimensions();
  const isWide = screenWidth >= 768;
  const flipProgress = useSharedValue(0);

  // ── Card theme (always resolves — neutral fallback for unthemed events) ──
  const ct = useMemo(() => resolveEventTheme(themeId), [themeId]);
  const backAccent = ct.backAccent || themeColor;
  const softCardColor = cardColor ? softenColor(cardColor) : null;
  const themedCardBg = softCardColor || (isDark ? ct.backBgDark : ct.backBgLight);
  const plaqueBg = softCardColor || (isDark ? ct.backBgDark : ct.backBgLight);

  // Auto-contrast text when cardColor overrides the surface
  const contrastText = softCardColor ? getTextColorForBg(softCardColor) : null;
  const cText = contrastText ?? colors.text;
  const cSecondary = contrastText ? `${contrastText}B3` : colors.textSecondary; // 70% opacity
  const cTertiary = contrastText ? `${contrastText}80` : colors.textTertiary;   // 50% opacity

  const hasCalledFirstFlip = useRef(false);
  const handleFlip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const target = flipProgress.value < 0.5 ? 1 : 0;
    // Fire onFirstFlip on the first front→back flip
    if (target === 1 && !hasCalledFirstFlip.current) {
      hasCalledFirstFlip.current = true;
      onFirstFlip?.();
    }
    flipProgress.value = withTiming(target, {
      duration: FLIP_DURATION,
      easing: FLIP_EASING,
    });
  }, [flipProgress, onFirstFlip]);

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

  const visibleAvatars = attendeeAvatars.slice(0, 5);
  const avatarStackWidth = visibleAvatars.length > 0
    ? visibleAvatars.length * (MINI_AV - MINI_OVERLAP) + MINI_OVERLAP
    : 0;

  // ─── Compact date for front (e.g. "Sat, Mar 15") ──
  const compactDate = dateLabel.length > 20
    ? dateLabel.replace(/^(\w+),\s*(\w+)\s+(\d+).*$/, "$1, $2 $3")
    : dateLabel;

  const hostFirst = hostName ? hostName.split(" ")[0] : null;

  // Capacity status text
  const capacityText = capacity != null
    ? (capacity - currentGoing <= 0 ? "Full" : `${capacity - currentGoing} spots left`)
    : null;

  return (
    <View style={{ paddingHorizontal: 16, ...(isWide ? { maxWidth: 480, alignSelf: "center" as const, width: "100%" } : undefined) }}>
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
                backgroundColor: imageUri ? plaqueBg : themedCardBg,
                borderWidth: 2,
                borderColor: `${backAccent}40`,
              }}
            >
              {imageUri ? (
                <>
                  {/* ── Photo zone — top 62% ── */}
                  <View style={{ height: "62%", position: "relative" }}>
                    <ExpoImage
                      source={{ uri: imageUri }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={200}
                      priority="high"
                    />
                    {/* Light vignette for chip readability */}
                    <LinearGradient
                      colors={["rgba(0,0,0,0.35)", "transparent", "transparent"]}
                      locations={[0, 0.5, 1]}
                      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
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
                              : `${backAccent}50`,
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

                  {/* Top-right badge removed — emoji placeholders replaced by theme treatment */}

                  </View>

                  {/* ── Plaque — themed solid surface ── */}
                  <View
                    style={{
                      flex: 1,
                      paddingHorizontal: 20,
                      paddingTop: 14,
                      paddingBottom: 18,
                    }}
                  >
                    {/* Title */}
                    <Text
                      style={{
                        fontSize: 24,
                        fontWeight: "800",
                        color: cText,
                        letterSpacing: -0.5,
                        lineHeight: 29,
                        marginBottom: 10,
                      }}
                      numberOfLines={2}
                    >
                      {title}
                    </Text>

                    {/* Event hook / tagline */}
                    {eventHook ? (
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "500",
                          fontStyle: "italic",
                          color: cSecondary,
                          marginBottom: 8,
                        }}
                        numberOfLines={2}
                      >
                        {eventHook}
                      </Text>
                    ) : null}

                    {/* Date + Time */}
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                      <Calendar size={14} color={contrastText ?? backAccent} />
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: cSecondary,
                          marginLeft: 7,
                          letterSpacing: 0.1,
                        }}
                        numberOfLines={1}
                      >
                        {compactDate} · {timeLabel}
                      </Text>
                    </View>

                    {/* Social proof row */}
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: "auto" }}>
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
                                borderColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)",
                                zIndex: visibleAvatars.length - i,
                              }}
                            >
                              <EntityAvatar
                                photoUrl={a.imageUrl}
                                initials={a.name?.[0] ?? "?"}
                                size={MINI_AV - 3}
                                backgroundColor={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"}
                                foregroundColor={cSecondary}
                              />
                            </View>
                          ))}
                        </View>
                      )}
                      {goingCount > 0 ? (
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={{ fontSize: 14, fontWeight: "700", color: cText }}>
                            {goingCount} going
                          </Text>
                          {capacityText && (
                            <Text style={{ fontSize: 12, color: cTertiary, marginLeft: 6 }}>
                              · {capacityText}
                            </Text>
                          )}
                        </View>
                      ) : (
                        <Text style={{ fontSize: 13, color: cTertiary }}>
                          Be the first to RSVP
                        </Text>
                      )}
                    </View>
                  </View>
                </>
              ) : (
                /* ── No-photo: invitation poster ── */
                <>
                  <LinearGradient
                    colors={[isDark ? `${backAccent}20` : `${backAccent}15`, "transparent"] as any}
                    locations={[0, 1] as any}
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
                      paddingHorizontal: 24,
                      paddingTop: 28,
                      paddingBottom: 24,
                    }}
                  >
                    {/* ── Poster: title + details ── */}

                    <Calendar size={40} color={contrastText ? `${contrastText}50` : `${backAccent}50`} style={{ marginBottom: 14 }} />

                    <Text
                      style={{
                        fontSize: 32,
                        fontWeight: "800",
                        color: cText,
                        letterSpacing: -0.8,
                        lineHeight: 38,
                      }}
                      numberOfLines={3}
                    >
                      {title}
                    </Text>

                    {/* Accent divider */}
                    <View style={{
                      width: 32,
                      height: 3,
                      borderRadius: 1.5,
                      backgroundColor: contrastText ? `${contrastText}50` : `${backAccent}50`,
                      marginTop: 20,
                      marginBottom: 14,
                    }} />

                    {/* Date + Time */}
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                      <Calendar size={14} color={contrastText ?? backAccent} />
                      <Text
                        style={{ fontSize: 14, color: cSecondary, marginLeft: 7, fontWeight: "600" }}
                        numberOfLines={1}
                      >
                        {compactDate} · {timeLabel}
                      </Text>
                    </View>

                    {/* Location */}
                    {locationDisplay && (
                      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                        <MapPin size={14} color={contrastText ?? backAccent} />
                        <Text
                          style={{ fontSize: 14, color: cSecondary, marginLeft: 7, fontWeight: "500" }}
                          numberOfLines={1}
                        >
                          {locationDisplay}
                        </Text>
                      </View>
                    )}

                    {/* Host attribution */}
                    {hostName && (
                      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                        <View style={{ borderRadius: 12, borderWidth: 1.5, borderColor: contrastText ? `${contrastText}30` : `${backAccent}30`, overflow: "hidden" }}>
                          <EntityAvatar
                            photoUrl={hostImageUrl}
                            initials={hostName?.[0] ?? "?"}
                            size={22}
                            backgroundColor={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"}
                            foregroundColor={contrastText ?? backAccent}
                          />
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: cSecondary, marginLeft: 7 }}>
                          {isMyEvent ? "Your event" : coHostNames.length > 0
                            ? `Hosted by ${hostFirst} & ${coHostNames.map(n => n.split(" ")[0]).join(", ")}`
                            : `Hosted by ${hostFirst}`}
                        </Text>
                      </View>
                    )}

                    {/* Event hook tagline */}
                    {eventHook ? (
                      <Text
                        style={{ fontSize: 13, fontWeight: "500", fontStyle: "italic", color: cSecondary, marginBottom: 8 }}
                        numberOfLines={2}
                      >
                        {eventHook}
                      </Text>
                    ) : null}

                    {/* Social proof + countdown */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      {goingCount > 0 ? (
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Users size={13} color={contrastText ?? STATUS.going.fg} />
                          <Text style={{ fontSize: 13, fontWeight: "600", color: contrastText ?? STATUS.going.fg, marginLeft: 5 }}>
                            {goingCount} going
                          </Text>
                        </View>
                      ) : (
                        <Text style={{ fontSize: 12, color: cTertiary }}>
                          Be the first to join
                        </Text>
                      )}
                      {countdownLabel && (
                        <View
                          style={{
                            backgroundColor:
                              countdownLabel === "Happening now"
                                ? STATUS.going.bgSoft
                                : `${backAccent}18`,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 10,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: "600",
                              color:
                                countdownLabel === "Happening now"
                                  ? (contrastText ?? STATUS.going.fg)
                                  : cSecondary,
                            }}
                          >
                            {countdownLabel}
                          </Text>
                        </View>
                      )}
                    </View>
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
                backgroundColor: isDark ? ct.backBgDark : ct.backBgLight,
                borderWidth: 0.5,
                borderColor: isDark
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.06)",
              }}
            >
              {/* Accent strip — themed */}
              <LinearGradient
                colors={[backAccent, `${backAccent}55`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  height: 6,
                  width: "100%",
                }}
              />

              <View style={{ flex: 1, padding: 24, paddingTop: 20 }}>
                {/* Section label */}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "800",
                      color: backAccent,
                      letterSpacing: 2,
                      textTransform: "uppercase",
                    }}
                  >
                    The Details
                  </Text>
                  <Calendar size={14} color={backAccent} style={{ marginLeft: 8 }} />
                </View>

                {/* Host — prominent */}
                {hostName && (
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 18 }}>
                    <View style={{ borderRadius: 24, borderWidth: 2.5, borderColor: `${backAccent}70` }}>
                      <EntityAvatar
                        photoUrl={hostImageUrl}
                        initials={hostName?.[0] ?? "?"}
                        size={42}
                        backgroundColor={isDark ? "#2C2C2E" : "#FFF7ED"}
                        foregroundColor={backAccent}
                      />
                    </View>
                    <View style={{ marginLeft: 14, flex: 1 }}>
                      <Text style={{ fontSize: 11, color: colors.textTertiary, letterSpacing: 0.3, marginBottom: 2 }}>
                        Hosted by
                      </Text>
                      <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text }}>
                        {isMyEvent ? "You" : coHostNames.length > 0
                          ? `${hostName.split(" ")[0]} & ${coHostNames.map(n => n.split(" ")[0]).join(", ")}`
                          : hostName}
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
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: `${backAccent}22`,
                      marginRight: 12,
                    }}
                  >
                    <Calendar size={16} color={backAccent} />
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

                {/* Location */}
                {locationDisplay && (
                  <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 16 }}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: `${backAccent}18`,
                        marginRight: 12,
                      }}
                    >
                      <MapPin size={16} color={backAccent} />
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

                {/* Description */}
                {description ? (
                  <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 16 }}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: `${backAccent}18`,
                        marginRight: 12,
                      }}
                    >
                      <FileText size={16} color={backAccent} />
                    </View>
                    <View style={{ flex: 1, justifyContent: "center" }}>
                      <Text style={{ fontSize: 11, color: colors.textTertiary, letterSpacing: 0.3, marginBottom: 2 }}>
                        About
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

                {/* Bottom section: capacity + social proof */}
                <View style={{ marginTop: "auto" }}>
                  <View style={{ height: 0.5, backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", marginBottom: 14 }} />

                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    {/* Avatars + count */}
                    <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
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
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: STATUS.going.bgSoft,
                            marginRight: 10,
                          }}
                        >
                          <Users size={16} color={STATUS.going.fg} />
                        </View>
                      )}
                      <View>
                        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text }}>
                          {currentGoing} going
                        </Text>
                        {capacity != null && (
                          <Text style={{
                            fontSize: 12,
                            color: capacity - currentGoing <= 0 ? "#EF4444" : colors.textSecondary,
                            fontWeight: capacity - currentGoing <= 0 ? "600" : "400",
                            marginTop: 1,
                          }}>
                            {capacity - currentGoing <= 0 ? "Full" : `${capacity - currentGoing} of ${capacity} spots left`}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Flip-back hint */}
                  <View style={{ alignItems: "center", paddingTop: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", opacity: 0.5 }}>
                      <RefreshCw size={10} color={colors.textTertiary} />
                      <Text style={{ fontSize: 11, color: colors.textTertiary, marginLeft: 5, fontWeight: "500" }}>
                        Tap to flip back
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>
        </View>
      </Pressable>

      {/* Flip hint overlaying card bottom */}
      <Animated.View style={[{ position: "absolute", bottom: 10, left: 0, right: 0, alignItems: "center" }, hintStyle]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <RefreshCw size={11} color={cTertiary} />
          <Text style={{ fontSize: 12, color: cTertiary, fontWeight: "500", marginLeft: 5 }}>
            Tap for details
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}
