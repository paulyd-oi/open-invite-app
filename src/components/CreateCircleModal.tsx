import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Check, Users, Search } from "@/ui/icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";
import { safeToast } from "@/lib/safeToast";
import { devLog } from "@/lib/devLog";
import { BadgePill } from "@/components/BadgePill";
import { getBadgePillVariantForBadge } from "@/lib/badges";
import { normalizeFeaturedBadge } from "@/lib/normalizeBadge";

interface Friend {
  id: string;
  friendId: string;
  friend: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    Profile?: {
      handle?: string;
      bio?: string | null;
      calendarBio?: string | null;
    } | null;
    featuredBadge?: {
      name: string;
      tierColor: string;
    } | null;
  };
}

interface CreateCircleModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (name: string, emoji: string, memberIds: string[]) => void;
  friends: Friend[];
  isLoading?: boolean;
}

// ============================================================================
// P0 CIRCLE EMOJI VALIDATION
// ============================================================================

/**
 * Check if a single codepoint is in emoji ranges.
 * Used for fallback validation when Intl.Segmenter unavailable.
 */
function isEmojiCodepoint(codePoint: number): boolean {
  return (
    // Misc symbols: U+2600-U+26FF
    (codePoint >= 0x2600 && codePoint <= 0x26FF) ||
    // Dingbats: U+2700-U+27BF
    (codePoint >= 0x2700 && codePoint <= 0x27BF) ||
    // Supplemental Symbols: U+1F300-U+1FAFF (covers most emoji)
    (codePoint >= 0x1F300 && codePoint <= 0x1FAFF)
  );
}

/**
 * Validates that input contains exactly one emoji grapheme cluster.
 * Handles ZWJ sequences, flags, skin tones, and variation selectors.
 */
function validateSingleEmoji(input: string): { valid: boolean; emoji: string | null; reason: string; clustersCount: number; usedFallback: boolean } {
  const trimmed = input.trim();
  
  if (!trimmed) {
    return { valid: false, emoji: null, reason: "empty_input", clustersCount: 0, usedFallback: false };
  }
  
  // Try Intl.Segmenter for accurate grapheme cluster segmentation
  const hasSegmenter = typeof Intl !== "undefined" && typeof (Intl as any).Segmenter !== "undefined";
  
  if (hasSegmenter) {
    try {
      const segmenter = new (Intl as any).Segmenter("en", { granularity: "grapheme" });
      const segments = [...segmenter.segment(trimmed)];
      const clusters = segments.map((s: any) => s.segment);
      
      if (clusters.length !== 1) {
        return { 
          valid: false, 
          emoji: null, 
          reason: clusters.length === 0 ? "empty_input" : "multiple_characters", 
          clustersCount: clusters.length,
          usedFallback: false,
        };
      }
      
      const candidate = clusters[0];
      
      // Check if the single cluster contains emoji codepoints
      const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]/u;
      
      if (!emojiRegex.test(candidate)) {
        return { valid: false, emoji: null, reason: "not_emoji", clustersCount: 1, usedFallback: false };
      }
      
      return { valid: true, emoji: candidate, reason: "valid", clustersCount: 1, usedFallback: false };
    } catch {
      // Segmenter threw, fall through to fallback
    }
  }
  
  // FALLBACK: Conservative emoji check when Intl.Segmenter unavailable
  // Convert to code points array
  const codePoints = Array.from(trimmed);
  
  if (__DEV__) {
    devLog("[P0_CIRCLE_EMOJI] fallback_used", { reason: "no_segmenter" });
  }
  
  // Fallback is conservative: only accept single codepoint in emoji ranges
  if (codePoints.length !== 1) {
    return { 
      valid: false, 
      emoji: null, 
      reason: codePoints.length === 0 ? "empty_input" : "multiple_characters", 
      clustersCount: codePoints.length,
      usedFallback: true,
    };
  }
  
  const cp = codePoints[0].codePointAt(0);
  if (cp === undefined || !isEmojiCodepoint(cp)) {
    return { valid: false, emoji: null, reason: "not_emoji", clustersCount: 1, usedFallback: true };
  }
  
  return { valid: true, emoji: codePoints[0], reason: "valid", clustersCount: 1, usedFallback: true };
}

export function CreateCircleModal({
  visible,
  onClose,
  onConfirm,
  friends,
  isLoading,
}: CreateCircleModalProps) {
  const { themeColor, isDark, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("👥");
  const [emojiInput, setEmojiInput] = useState("👥");
  const [emojiValid, setEmojiValid] = useState(true);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const emojiInputRef = useRef<TextInput>(null);
  
  // Toast discipline: track last toast reason to prevent spam
  const lastToastReasonRef = useRef<string | null>(null);
  const wasValidRef = useRef<boolean>(true);

  // Handle emoji input change with validation
  const handleEmojiChange = (text: string) => {
    setEmojiInput(text);
    
    const result = validateSingleEmoji(text);
    
    // DEV log only on validation decision (not every keystroke)
    if (__DEV__ && text.length > 0) {
      devLog("[P0_CIRCLE_EMOJI] Validation:", {
        rawInput: text.trim(),
        clustersCount: result.clustersCount,
        acceptedEmoji: result.emoji,
        reason: result.reason,
        usedFallback: result.usedFallback,
      });
    }
    
    if (result.valid && result.emoji) {
      setEmoji(result.emoji);
      setEmojiValid(true);
      // Reset toast tracking when input becomes valid
      lastToastReasonRef.current = null;
      wasValidRef.current = true;
    } else if (text.length > 0) {
      // Toast discipline: only show toast on valid→invalid transition, not on every keystroke
      const shouldToast = wasValidRef.current && lastToastReasonRef.current !== result.reason;
      
      if (shouldToast) {
        if (result.clustersCount > 1) {
          safeToast.error("One emoji only", "Choose exactly 1 emoji");
          lastToastReasonRef.current = "multiple_characters";
          if (__DEV__) {
            devLog("[P0_CIRCLE_EMOJI] toast_shown", { reason: "multiple_characters" });
          }
        } else if (result.reason === "not_emoji") {
          safeToast.error("Emoji required", "Pick an emoji, not text");
          lastToastReasonRef.current = "not_emoji";
          if (__DEV__) {
            devLog("[P0_CIRCLE_EMOJI] toast_shown", { reason: "not_emoji" });
          }
        }
      }
      wasValidRef.current = false;
      setEmojiValid(false);
    } else {
      // Empty input - just mark invalid, don't toast yet
      wasValidRef.current = false;
      setEmojiValid(false);
    }
  };

  const filteredFriends = friends.filter(
    (f) =>
      f.friend.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.friend.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.friend.Profile?.handle?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // DEV proof log once per modal open
  useEffect(() => {
    if (visible && __DEV__) {
      const hasHandle = friends.filter(f => f.friend.Profile?.handle).length;
      const hasBio = friends.filter(f => f.friend.Profile?.calendarBio || f.friend.Profile?.bio).length;
      const hasBadgeLocal = friends.filter(f => f.friend.featuredBadge).length;
      devLog("[P0_CIRCLE_MEMBER_UI]", {
        rows: friends.length,
        hasHandle,
        hasBio,
        hasBadgeLocal,
      });
    }
  }, [visible, friends]);

  const toggleFriend = (friendId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newSelected = new Set(selectedFriends);
    if (newSelected.has(friendId)) {
      newSelected.delete(friendId);
    } else {
      newSelected.add(friendId);
    }
    setSelectedFriends(newSelected);
  };

  const handleCreate = () => {
    // Validate emoji on submit
    if (!emojiValid || !emoji) {
      safeToast.error("Pick an emoji", "Choose exactly 1 emoji for your group");
      if (__DEV__) {
        devLog("[P0_CIRCLE_EMOJI] Submit blocked:", {
          rawInput: emojiInput.trim(),
          acceptedEmoji: null,
          reason: "invalid_emoji_on_submit",
        });
      }
      return;
    }
    
    if (name.trim() && selectedFriends.size > 0) {
      if (__DEV__) {
        devLog("[P0_CIRCLE_EMOJI] Submit accepted:", {
          rawInput: emojiInput.trim(),
          acceptedEmoji: emoji,
          reason: "valid_submission",
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onConfirm(name.trim(), emoji, Array.from(selectedFriends));
      // Reset form
      setName("");
      setEmoji("👥");
      setEmojiInput("👥");
      setEmojiValid(true);
      setSelectedFriends(new Set());
      setSearchQuery("");
    }
  };

  const handleClose = () => {
    setName("");
    setEmoji("👥");
    setEmojiInput("👥");
    setEmojiValid(true);
    setSelectedFriends(new Set());
    setSearchQuery("");
    onClose();
  };

  // Check if form is valid for submit button styling
  const canSubmit = name.trim() && selectedFriends.size > 0 && emojiValid && emoji;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <Pressable
          className="flex-1 bg-black/50"
          onPress={handleClose}
        >
          <Pressable
            onPress={() => {}}
            className="flex-1 mt-20 rounded-t-3xl overflow-hidden"
            style={{ backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 0) }}
          >
            {/* Header */}
            <View
              className="flex-row items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: colors.border }}
            >
              <Pressable
                onPress={handleClose}
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
              >
                <X size={20} color={colors.text} />
              </Pressable>
              <Text className="text-lg font-semibold" style={{ color: colors.text }}>
                New Group
              </Text>
              <Pressable
                onPress={handleCreate}
                disabled={isLoading}
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{
                  backgroundColor: canSubmit ? themeColor : isDark ? "#2C2C2E" : "#E5E7EB",
                  opacity: isLoading ? 0.7 : 1,
                }}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Check
                    size={20}
                    color={canSubmit ? "#fff" : colors.textTertiary}
                  />
                )}
              </Pressable>
            </View>

            <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
              {/* Circle Name */}
              <View className="mt-4">
                <Text className="text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                  Group Name
                </Text>
                <View className="flex-row items-center">
                  {/* Ghost Preview + Emoji Input */}
                  <View className="mr-3 items-center">
                    {/* Ghost preview shows current valid emoji or placeholder */}
                    <View
                      className="rounded-xl p-3 mb-1"
                      style={{ 
                        backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                        borderWidth: emojiValid ? 0 : 1,
                        borderColor: emojiValid ? "transparent" : "#EF4444",
                      }}
                    >
                      <Text 
                        className="text-2xl" 
                        style={{ opacity: emojiValid ? 1 : 0.4 }}
                      >
                        {emojiValid && emoji ? emoji : "🙂"}
                      </Text>
                    </View>
                    {/* Emoji keyboard input */}
                    <TextInput
                      ref={emojiInputRef}
                      value={emojiInput}
                      onChangeText={handleEmojiChange}
                      placeholder="＋"
                      placeholderTextColor={colors.textTertiary}
                      className="text-center rounded-lg px-2 py-1"
                      style={{
                        backgroundColor: isDark ? "#1C1C1E" : "#E5E7EB",
                        color: colors.text,
                        fontSize: 14,
                        width: 56,
                        minHeight: 28,
                      }}
                      keyboardType="default"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g., Weekend Warriors"
                    placeholderTextColor={colors.textTertiary}
                    className="flex-1 rounded-xl px-4 py-3"
                    style={{
                      backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                      color: colors.text,
                      fontSize: 16,
                    }}
                  />
                </View>

                {/* Helper text hint */}
                {(!emojiValid || !emoji) && (
                  <Text 
                    className="text-xs mt-2 ml-1" 
                    style={{ color: colors.textTertiary }}
                  >
                    Pick 1 emoji (no text)
                  </Text>
                )}
              </View>

              {/* Friend Selection */}
              <View className="mt-6">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                    Add Friends
                  </Text>
                  <Text className="text-xs" style={{ color: themeColor }}>
                    {selectedFriends.size} selected
                  </Text>
                </View>

                {/* Search */}
                <View
                  className="flex-row items-center rounded-xl px-4 mb-3"
                  style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                >
                  <Search size={18} color={colors.textTertiary} />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search friends..."
                    placeholderTextColor={colors.textTertiary}
                    className="flex-1 py-3 ml-2"
                    style={{ color: colors.text, fontSize: 15 }}
                  />
                </View>

                {/* Friend List */}
                <View className="pb-8">
                  {filteredFriends.map((friendship, i) => {
                    const isSelected = selectedFriends.has(friendship.friend.id);
                    const handle = friendship.friend.Profile?.handle;
                    const bio = friendship.friend.Profile?.calendarBio || friendship.friend.Profile?.bio;
                    const featuredBadge = normalizeFeaturedBadge(friendship.friend.featuredBadge);
                    
                    return (
                      <Animated.View key={friendship.id} entering={FadeIn.delay(i * 30)}>
                        <Pressable
                          onPress={() => toggleFriend(friendship.friend.id)}
                          className="flex-row items-center py-3 border-b"
                          style={{ borderColor: colors.border }}
                        >
                          {/* Avatar */}
                          <View
                            className="w-11 h-11 rounded-full overflow-hidden"
                            style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}
                          >
                            {friendship.friend.image ? (
                              <Image
                                source={{ uri: friendship.friend.image }}
                                className="w-full h-full"
                              />
                            ) : (
                              <View
                                className="w-full h-full items-center justify-center"
                                style={{ backgroundColor: themeColor + "20" }}
                              >
                                <Text className="text-sm font-bold" style={{ color: themeColor }}>
                                  {friendship.friend.name?.[0] ?? "?"}
                                </Text>
                              </View>
                            )}
                          </View>

                          {/* Info */}
                          <View className="flex-1 ml-3 mr-2">
                            {/* Name row with badge */}
                            <View className="flex-row items-center flex-nowrap gap-1.5">
                              <Text 
                                className="font-semibold" 
                                style={{ color: colors.text, fontSize: 15 }}
                                numberOfLines={1}
                              >
                                {friendship.friend.name ?? "Unknown"}
                              </Text>
                              {featuredBadge && (
                                <BadgePill
                                  name={featuredBadge.name}
                                  tierColor={featuredBadge.tierColor}
                                  size="small"
                                  variant={getBadgePillVariantForBadge(featuredBadge)}
                                />
                              )}
                            </View>
                            {/* Handle */}
                            {handle && (
                              <Text 
                                style={{ color: colors.textSecondary, fontSize: 13 }}
                                numberOfLines={1}
                              >
                                @{handle}
                              </Text>
                            )}
                            {/* Bio */}
                            {bio && (
                              <Text 
                                style={{ color: colors.textTertiary, fontSize: 12, marginTop: 2 }}
                                numberOfLines={1}
                              >
                                {bio}
                              </Text>
                            )}
                          </View>

                          {/* Checkbox */}
                          <View
                            className="w-6 h-6 rounded-full items-center justify-center"
                            style={{
                              backgroundColor: isSelected ? themeColor : "transparent",
                              borderWidth: isSelected ? 0 : 2,
                              borderColor: isSelected ? "transparent" : colors.border,
                            }}
                          >
                            {isSelected && <Check size={14} color="#fff" />}
                          </View>
                        </Pressable>
                      </Animated.View>
                    );
                  })}

                  {filteredFriends.length === 0 && (
                    <View className="py-8 items-center">
                      <Users size={32} color={colors.textTertiary} />
                      <Text className="mt-2 text-center" style={{ color: colors.textSecondary }}>
                        {searchQuery ? "No friends found" : "Add friends to create a group"}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
