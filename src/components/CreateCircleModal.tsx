import React, { useState } from "react";
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
} from "react-native";
import { X, Check, Users, Search } from "@/ui/icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";

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

const EMOJIS = ["👥", "🎉", "☕", "🏃", "🎮", "🍕", "🎬", "🏀", "🎸", "✈️", "🏖️", "📚"];

export function CreateCircleModal({
  visible,
  onClose,
  onConfirm,
  friends,
  isLoading,
}: CreateCircleModalProps) {
  const { themeColor, isDark, colors } = useTheme();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("👥");
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

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
    if (name.trim() && selectedFriends.size > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onConfirm(name.trim(), emoji, Array.from(selectedFriends));
      // Reset form
      setName("");
      setEmoji("👥");
      setSelectedFriends(new Set());
      setSearchQuery("");
    }
  };

  const handleClose = () => {
    setName("");
    setEmoji("👥");
    setSelectedFriends(new Set());
    setSearchQuery("");
    onClose();
  };

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
            style={{ backgroundColor: colors.background }}
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
                New Circle
              </Text>
              <Pressable
                onPress={handleCreate}
                disabled={!name.trim() || selectedFriends.size === 0 || isLoading}
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{
                  backgroundColor:
                    name.trim() && selectedFriends.size > 0 ? themeColor : isDark ? "#2C2C2E" : "#E5E7EB",
                }}
              >
                <Check
                  size={20}
                  color={name.trim() && selectedFriends.size > 0 ? "#fff" : colors.textTertiary}
                />
              </Pressable>
            </View>

            <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
              {/* Circle Name */}
              <View className="mt-4">
                <Text className="text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                  Circle Name
                </Text>
                <View className="flex-row items-center">
                  {/* Emoji Picker */}
                  <View
                    className="mr-3 rounded-xl p-3"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                  >
                    <Text className="text-2xl">{emoji}</Text>
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

                {/* Emoji Selection */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="mt-3"
                  style={{ flexGrow: 0 }}
                >
                  {EMOJIS.map((e) => (
                    <Pressable
                      key={e}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setEmoji(e);
                      }}
                      className="mr-2 rounded-xl p-2"
                      style={{
                        backgroundColor:
                          emoji === e ? themeColor + "20" : isDark ? "#2C2C2E" : "#F3F4F6",
                        borderWidth: emoji === e ? 1 : 0,
                        borderColor: themeColor,
                      }}
                    >
                      <Text className="text-xl">{e}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
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
                        {searchQuery ? "No friends found" : "Add friends to create a circle"}
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
