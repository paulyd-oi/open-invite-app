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

interface Friend {
  id: string;
  friendId: string;
  friend: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
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
 * Validates that input contains exactly one emoji grapheme cluster.
 * Handles ZWJ sequences, flags, skin tones, and variation selectors.
 */
function validateSingleEmoji(input: string): { valid: boolean; emoji: string | null; reason: string; clustersCount: number } {
  const trimmed = input.trim();
  
  if (!trimmed) {
    return { valid: false, emoji: null, reason: "empty_input", clustersCount: 0 };
  }
  
  // Use Intl.Segmenter for accurate grapheme cluster segmentation
  // This correctly handles ZWJ sequences, flags, skin tones, etc.
  let clusters: string[] = [];
  
  if (typeof Intl !== "undefined" && typeof (Intl as any).Segmenter !== "undefined") {
    try {
      const segmenter = new (Intl as any).Segmenter("en", { granularity: "grapheme" });
      const segments = [...segmenter.segment(trimmed)];
      clusters = segments.map((s: any) => s.segment);
    } catch {
      // Fallback: split by code points and try to detect emoji boundaries
      clusters = [...trimmed];
    }
  } else {
    // Fallback for environments without Intl.Segmenter
    // Use spread operator which handles surrogate pairs but not ZWJ properly
    clusters = [...trimmed];
  }
  
  if (clusters.length !== 1) {
    return { 
      valid: false, 
      emoji: null, 
      reason: clusters.length === 0 ? "empty_input" : "multiple_characters", 
      clustersCount: clusters.length 
    };
  }
  
  const candidate = clusters[0];
  
  // Check if the single cluster contains emoji codepoints
  // Emoji ranges: 
  // - Basic emoji: U+1F600-U+1F64F (emoticons), U+1F300-U+1F5FF (symbols), 
  //   U+1F680-U+1F6FF (transport), U+1F1E0-U+1F1FF (flags), U+1F900-U+1F9FF (supplemental)
  // - Dingbats: U+2700-U+27BF
  // - Misc symbols: U+2600-U+26FF
  // - Variation selectors and ZWJ are allowed as modifiers
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]/u;
  
  if (!emojiRegex.test(candidate)) {
    return { valid: false, emoji: null, reason: "not_emoji", clustersCount: 1 };
  }
  
  return { valid: true, emoji: candidate, reason: "valid", clustersCount: 1 };
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
      });
    }
    
    if (result.valid && result.emoji) {
      setEmoji(result.emoji);
      setEmojiValid(true);
    } else if (text.length > 0) {
      // Invalid input - show toast for multiple characters
      if (result.clustersCount > 1) {
        safeToast.error("One emoji only", "Choose exactly 1 emoji");
      } else if (result.reason === "not_emoji") {
        safeToast.error("Emoji required", "Pick an emoji, not text");
      }
      setEmojiValid(false);
    } else {
      // Empty input - just mark invalid, don't toast yet
      setEmojiValid(false);
    }
  };

  const filteredFriends = friends.filter(
    (f) =>
      f.friend.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.friend.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
                          <View className="flex-1 ml-3">
                            <Text className="font-medium" style={{ color: colors.text }}>
                              {friendship.friend.name ?? "Unknown"}
                            </Text>
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
