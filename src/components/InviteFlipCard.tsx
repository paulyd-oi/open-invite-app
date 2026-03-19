/**
 * InviteFlipCard V5 — Premium 3D tap-to-flip invite card for Event Detail.
 *
 * Front: hero image + title + host + countdown + date + location + social proof.
 *        Reads as a crafted invitation at a glance.
 * Back:  the details side — host, date/time, location, description, capacity.
 *
 * Card themes: deterministic emoji→vibe mapping tints the card per event mood.
 * Card floats with depth shadow. Tap to flip with premium 3D rotation.
 *
 * Proof tag: [EVENT_DETAIL_V5_FLIP_CARD]
 */

import React, { useCallback, useMemo } from "react";
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
import { resolveEventTheme } from "@/lib/eventThemes";

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

  // Event Themes V1 — explicit theme overrides inferred vibe
  themeId?: string | null;

  // Host edit button (rendered on front)
  editButton?: React.ReactNode;

  // Photo nudge (rendered on front, no-photo only)
  photoNudge?: React.ReactNode;
}

// ─── Card Theme System ──────────────────────────────────
// Deterministic emoji→vibe mapping. Each theme tints the card.
// No backend changes — purely visual, inferred from emoji.

type CardVibe = "party" | "food" | "outdoors" | "sports" | "chill" | "nightlife" | "games" | "neutral";

interface CardThemeTokens {
  /** Gradient tint mixed into photo overlay bottom */
  gradientTint: string;
  /** Back-face accent color (overrides themeColor for back) */
  backAccent: string;
  /** Back-face background */
  backBgDark: string;
  backBgLight: string;
  /** No-photo front label color */
  vibeLabel: string | null;
}

const VIBE_THEMES: Record<CardVibe, CardThemeTokens> = {
  party: {
    gradientTint: "rgba(255,80,60,0.12)",
    backAccent: "#FF6B4A",
    backBgDark: "#1E1614",
    backBgLight: "#FFF8F6",
    vibeLabel: "You're Invited",
  },
  food: {
    gradientTint: "rgba(255,152,0,0.10)",
    backAccent: "#FF9800",
    backBgDark: "#1E1A14",
    backBgLight: "#FFFAF5",
    vibeLabel: "You're Invited",
  },
  outdoors: {
    gradientTint: "rgba(0,188,212,0.08)",
    backAccent: "#00ACC1",
    backBgDark: "#14191E",
    backBgLight: "#F5FBFC",
    vibeLabel: "You're Invited",
  },
  sports: {
    gradientTint: "rgba(76,175,80,0.08)",
    backAccent: "#43A047",
    backBgDark: "#141E15",
    backBgLight: "#F5FAF5",
    vibeLabel: "Game On",
  },
  chill: {
    gradientTint: "rgba(156,39,176,0.08)",
    backAccent: "#AB47BC",
    backBgDark: "#1A141E",
    backBgLight: "#FAF5FC",
    vibeLabel: "You're Invited",
  },
  nightlife: {
    gradientTint: "rgba(99,102,241,0.10)",
    backAccent: "#7C3AED",
    backBgDark: "#16141E",
    backBgLight: "#F8F5FF",
    vibeLabel: "You're Invited",
  },
  games: {
    gradientTint: "rgba(99,102,241,0.08)",
    backAccent: "#6366F1",
    backBgDark: "#14141E",
    backBgLight: "#F5F5FF",
    vibeLabel: "Game Night",
  },
  neutral: {
    gradientTint: "transparent",
    backAccent: "",  // falls back to themeColor
    backBgDark: "#1C1C1E",
    backBgLight: "#FAF9F7",
    vibeLabel: "You're Invited",
  },
};

// Emoji → vibe mapping (covers common event emojis)
const EMOJI_VIBE_MAP: Record<string, CardVibe> = {
  // Party
  "🎉": "party", "🥳": "party", "🎊": "party", "🎂": "party", "🍾": "party",
  "🎁": "party", "🎈": "party", "💃": "party", "🕺": "party", "✨": "party",
  // Food
  "🍽️": "food", "🍕": "food", "🌮": "food", "🍔": "food", "☕": "food",
  "🍣": "food", "🍝": "food", "🥘": "food", "🧁": "food", "🍻": "food",
  "🍷": "food", "🥂": "food", "🍜": "food", "🍱": "food", "🥡": "food",
  // Outdoors
  "🏕️": "outdoors", "🏖️": "outdoors", "🌊": "outdoors", "⛰️": "outdoors",
  "🥾": "outdoors", "🚴": "outdoors", "🏄": "outdoors", "🌳": "outdoors",
  "☀️": "outdoors", "🌅": "outdoors", "🏞️": "outdoors", "🎣": "outdoors",
  // Sports
  "⚽": "sports", "🏀": "sports", "🏈": "sports", "⚾": "sports", "🎾": "sports",
  "🏐": "sports", "🏓": "sports", "🏸": "sports", "🥊": "sports", "🏋️": "sports",
  "🧘": "sports", "🏊": "sports", "🎳": "sports", "🥏": "sports",
  // Chill / study / worship
  "📖": "chill", "✝️": "chill", "⛪": "chill", "🕌": "chill", "🕍": "chill",
  "🙏": "chill", "📚": "chill", "🎧": "chill", "🧘‍♀️": "chill", "🎨": "chill",
  "🎹": "chill", "🎵": "chill", "🎶": "chill",
  // Nightlife
  "🍸": "nightlife", "🪩": "nightlife", "🎤": "nightlife", "🌙": "nightlife",
  "🥃": "nightlife", "🫧": "nightlife",
  // Games
  "🎮": "games", "🎲": "games", "🃏": "games", "🎯": "games", "🎰": "games",
  "♟️": "games", "🎱": "games", "🕹️": "games",
};

function inferCardVibe(emoji: string, title: string): CardVibe {
  // Direct emoji match first
  if (EMOJI_VIBE_MAP[emoji]) return EMOJI_VIBE_MAP[emoji];

  // Keyword fallback from title
  const t = title.toLowerCase();
  if (/party|birthday|celebration|kickback|hangout/.test(t)) return "party";
  if (/dinner|lunch|brunch|bbq|cookout|potluck|coffee/.test(t)) return "food";
  if (/hike|beach|camping|surf|park|outdoor|lake/.test(t)) return "outdoors";
  if (/soccer|basketball|tennis|pickleball|football|gym|workout/.test(t)) return "sports";
  if (/bible|study|church|worship|prayer|book club/.test(t)) return "chill";
  if (/bar|club|drinks|happy hour|brewery|cocktail/.test(t)) return "nightlife";
  if (/game night|board game|trivia|poker/.test(t)) return "games";

  return "neutral";
}

// ─── Constants ───────────────────────────────────────────
const FLIP_DURATION = 480;
const FLIP_EASING = Easing.bezier(0.32, 0.0, 0.14, 1);
const CARD_RADIUS = 28;
const MINI_AV = 28;
const MINI_OVERLAP = 8;

// ─── Shadow style (cross-platform) ──────────────────────
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
  themeId,
  editButton,
  photoNudge,
}: InviteFlipCardProps) {
  const flipProgress = useSharedValue(0);

  // ── Card theme: explicit themeId wins, then inferred vibe fallback ──
  const explicitTheme = useMemo(() => resolveEventTheme(themeId), [themeId]);
  const vibe = useMemo(() => inferCardVibe(emoji, title), [emoji, title]);
  const vibeTokens = VIBE_THEMES[vibe];
  // Merge: explicit theme overrides vibe tokens
  const ct = useMemo(() => {
    if (!explicitTheme) return vibeTokens;
    return {
      gradientTint: explicitTheme.gradientTint,
      backAccent: explicitTheme.backAccent,
      backBgDark: explicitTheme.backBgDark,
      backBgLight: explicitTheme.backBgLight,
      vibeLabel: explicitTheme.vibeLabel,
    };
  }, [explicitTheme, vibeTokens]);
  const backAccent = ct.backAccent || themeColor;

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

                  {/* Gradient overlay — vibe-tinted bottom for theme warmth */}
                  <LinearGradient
                    colors={[
                      "rgba(0,0,0,0.15)",
                      "transparent",
                      "transparent",
                      ct.gradientTint !== "transparent" ? ct.gradientTint : "rgba(0,0,0,0.35)",
                      "rgba(0,0,0,0.55)",
                      "rgba(0,0,0,0.94)",
                    ]}
                    locations={[0, 0.08, 0.3, 0.52, 0.68, 1]}
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

                  {/* ── Top-right: emoji badge ── */}
                  <View
                    style={{
                      position: "absolute",
                      top: 16,
                      right: editButton ? 52 : 16,
                      borderRadius: 14,
                      overflow: "hidden",
                    }}
                  >
                    <BlurView
                      intensity={30}
                      tint="dark"
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        backgroundColor: "rgba(0,0,0,0.15)",
                      }}
                    >
                      <Text style={{ fontSize: 18 }}>{emoji}</Text>
                    </BlurView>
                  </View>

                  {/* ── Bottom info block — the invitation ── */}
                  <View
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      padding: 22,
                      paddingBottom: 22,
                    }}
                  >
                    {/* Host attribution */}
                    {hostName && (
                      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                        <View style={{ borderRadius: 12, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.3)", overflow: "hidden" }}>
                          <EntityAvatar
                            photoUrl={hostImageUrl}
                            initials={hostName?.[0] ?? "?"}
                            size={22}
                            backgroundColor="rgba(255,255,255,0.15)"
                            foregroundColor="#FFFFFF"
                          />
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.8)", marginLeft: 7, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>
                          {isMyEvent ? "Your event" : `Hosted by ${hostFirst}`}
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
                        textShadowColor: "rgba(0,0,0,0.7)",
                        textShadowOffset: { width: 0, height: 2 },
                        textShadowRadius: 12,
                        marginBottom: 14,
                      }}
                      numberOfLines={3}
                    >
                      {title}
                    </Text>

                    {/* Date + Time */}
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                      <Calendar size={14} color="rgba(255,255,255,0.7)" />
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "600",
                          color: "rgba(255,255,255,0.92)",
                          marginLeft: 8,
                          letterSpacing: 0.1,
                          textShadowColor: "rgba(0,0,0,0.5)",
                          textShadowOffset: { width: 0, height: 1 },
                          textShadowRadius: 4,
                        }}
                        numberOfLines={1}
                      >
                        {compactDate} · {timeLabel}
                      </Text>
                    </View>

                    {/* Location */}
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
                            textShadowColor: "rgba(0,0,0,0.5)",
                            textShadowOffset: { width: 0, height: 1 },
                            textShadowRadius: 4,
                          }}
                          numberOfLines={1}
                        >
                          {locationDisplay}
                        </Text>
                      </View>
                    )}

                    {/* Social proof row */}
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
                                  borderColor: "rgba(255,255,255,0.3)",
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
                          <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <Text
                              style={{
                                fontSize: 14,
                                fontWeight: "700",
                                color: "rgba(255,255,255,0.95)",
                                textShadowColor: "rgba(0,0,0,0.5)",
                                textShadowOffset: { width: 0, height: 1 },
                                textShadowRadius: 4,
                              }}
                            >
                              {goingCount} going
                            </Text>
                            {capacityText && (
                              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginLeft: 6 }}>
                                · {capacityText}
                              </Text>
                            )}
                          </View>
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
                      paddingTop: 28,
                    }}
                  >
                    {/* Vibe label */}
                    {ct.vibeLabel && (
                      <Text style={{
                        fontSize: 11,
                        fontWeight: "700",
                        letterSpacing: 1.5,
                        textTransform: "uppercase",
                        color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.22)",
                        marginBottom: 16,
                      }}>
                        {ct.vibeLabel}
                      </Text>
                    )}

                    <Text style={{ fontSize: 72, marginBottom: 18 }}>{emoji}</Text>
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
                          {isMyEvent ? "Your event" : `Hosted by ${hostFirst}`}
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

                    {/* Date + location */}
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
                    {goingCount > 0 ? (
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Users size={14} color={STATUS.going.fg} />
                        <Text style={{ fontSize: 14, fontWeight: "600", color: STATUS.going.fg, marginLeft: 6 }}>
                          {goingCount} going
                        </Text>
                      </View>
                    ) : (
                      <Text style={{ fontSize: 13, color: colors.textTertiary }}>
                        Be the first to join
                      </Text>
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
                  height: 4,
                  width: "100%",
                }}
              />

              <View style={{ flex: 1, padding: 24, paddingTop: 20 }}>
                {/* Section label + emoji */}
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
                  <Text style={{ fontSize: 16, marginLeft: 8 }}>{emoji}</Text>
                </View>

                {/* Host — prominent */}
                {hostName && (
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 18 }}>
                    <View style={{ borderRadius: 24, borderWidth: 2.5, borderColor: isDark ? `${backAccent}60` : `${backAccent}40` }}>
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
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: `${backAccent}14`,
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
                        backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)",
                        marginRight: 12,
                      }}
                    >
                      <MapPin size={16} color={colors.textSecondary} />
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
                        backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)",
                        marginRight: 12,
                      }}
                    >
                      <FileText size={16} color={colors.textSecondary} />
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
