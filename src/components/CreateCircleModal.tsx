import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Check, Users, Search } from "@/ui/icons";
import { EntityAvatar } from "@/components/EntityAvatar";
import Animated, { FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";
import { devLog } from "@/lib/devLog";

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
  };
}

interface CreateCircleModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (name: string, emoji: string | undefined, memberIds: string[]) => void;
  friends: Friend[];
  isLoading?: boolean;
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
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

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
      devLog("[P0_CIRCLE_MEMBER_UI]", {
        rows: friends.length,
        hasHandle,
        hasBio,
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
    if (name.trim() && selectedFriends.size > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onConfirm(name.trim(), undefined, Array.from(selectedFriends));
      setName("");
      setSelectedFriends(new Set());
      setSearchQuery("");
    }
  };

  const handleClose = () => {
    setName("");
    setSelectedFriends(new Set());
    setSearchQuery("");
    onClose();
  };

  const canSubmit = name.trim() && selectedFriends.size > 0;

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
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g., Weekend Warriors"
                  placeholderTextColor={colors.textTertiary}
                  className="rounded-xl px-4 py-3"
                  style={{
                    backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                    color: colors.text,
                    fontSize: 16,
                  }}
                  autoFocus
                />
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
                    
                    return (
                      <Animated.View key={friendship.id} entering={FadeIn.delay(i * 30)}>
                        <Pressable
                          onPress={() => toggleFriend(friendship.friend.id)}
                          className="flex-row items-center py-3 border-b"
                          style={{ borderColor: colors.border }}
                        >
                          {/* Avatar — SSOT via EntityAvatar */}
                          <EntityAvatar
                            photoUrl={friendship.friend.image}
                            initials={friendship.friend.name?.[0] ?? "?"}
                            size={44}
                            backgroundColor={friendship.friend.image ? (isDark ? "#2C2C2E" : "#E5E7EB") : themeColor + "20"}
                            foregroundColor={themeColor}
                          />

                          {/* Info */}
                          <View className="flex-1 ml-3 mr-2">
                            {/* Name row */}
                            <View className="flex-row items-center flex-nowrap gap-1.5">
                              <Text 
                                className="font-semibold" 
                                style={{ color: colors.text, fontSize: 15 }}
                                numberOfLines={1}
                              >
                                {friendship.friend.name ?? "Unknown"}
                              </Text>
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
