import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { UserPlus, Users, X, Check } from "@/ui/icons";
import { UserListRow } from "@/components/UserListRow";
import { Button } from "@/ui/Button";
import type { Friendship } from "@/shared/contracts";

interface CircleAddMembersModalProps {
  visible: boolean;
  availableFriends: Friendship[];
  selectedFriends: string[];
  isPending: boolean;
  selectedCount: number;
  colors: { background: string; text: string; textSecondary: string; textTertiary: string; border: string };
  isDark: boolean;
  themeColor: string;
  onClose: () => void;
  onToggleFriend: (friendId: string) => void;
  onAddMembers: () => void;
}

export function CircleAddMembersModal({
  visible,
  availableFriends,
  selectedFriends,
  isPending,
  selectedCount,
  colors,
  isDark,
  themeColor,
  onClose,
  onToggleFriend,
  onAddMembers,
}: CircleAddMembersModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Animated.View
            entering={FadeInDown.springify().damping(20).stiffness(300)}
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: "80%",
              minHeight: 300,
              overflow: "hidden",
            }}
          >
            {/* Modal Handle */}
            <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 8 }}>
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.textTertiary,
                  opacity: 0.4,
                }}
              />
            </View>

            {/* Modal Header */}
            <View style={{ paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <UserPlus size={22} color={themeColor} />
                <Text style={{ fontSize: 18, fontWeight: "600", marginLeft: 10, color: colors.text }}>
                  Add Members
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                }}
              >
                <X size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* Friends List */}
            <ScrollView
              style={{ maxHeight: 350 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
              showsVerticalScrollIndicator={true}
            >
              {availableFriends.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 40 }}>
                  <Users size={40} color={colors.textTertiary} />
                  <Text style={{ fontSize: 16, fontWeight: "500", marginTop: 16, color: colors.textSecondary }}>
                    No more friends to add
                  </Text>
                  <Text style={{ fontSize: 14, marginTop: 6, color: colors.textTertiary, textAlign: "center" }}>
                    All your friends are already in this circle
                  </Text>
                </View>
              ) : (
                availableFriends.map((friendship, index) => {
                  const isSelected = selectedFriends.includes(friendship.friendId);
                  return (
                    <Animated.View key={friendship.friendId} entering={FadeInDown.delay(index * 30)}>
                      <Pressable
                        onPress={() => onToggleFriend(friendship.friendId)}
                        style={{
                          marginBottom: 8,
                          borderRadius: 12,
                          backgroundColor: isSelected ? `${themeColor}15` : isDark ? "#2C2C2E" : "#F9FAFB",
                          borderWidth: isSelected ? 2 : 1,
                          borderColor: isSelected ? themeColor : colors.border,
                          overflow: "hidden",
                        }}
                      >
                        <UserListRow
                          handle={friendship.friend.Profile?.handle}
                          displayName={friendship.friend.name}
                          bio={friendship.friend.Profile?.calendarBio}
                          avatarUri={friendship.friend.image}
                          disablePressFeedback
                          rightAccessory={
                            <View
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 14,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: isSelected ? themeColor : "transparent",
                                borderWidth: isSelected ? 0 : 2,
                                borderColor: colors.border,
                              }}
                            >
                              {isSelected && <Check size={16} color="#fff" />}
                            </View>
                          }
                        />
                      </Pressable>
                    </Animated.View>
                  );
                })
              )}
            </ScrollView>

            {/* Add Button */}
            {availableFriends.length > 0 && (
              <View style={{ paddingHorizontal: 20, paddingBottom: 34, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Button
                  variant="primary"
                  label={
                    isPending
                      ? "Adding..."
                      : selectedCount > 0
                        ? `Add ${selectedCount} Friend${selectedCount > 1 ? "s" : ""}`
                        : "Select Friends to Add"
                  }
                  onPress={onAddMembers}
                  disabled={selectedCount === 0 || isPending}
                  loading={isPending}
                  style={{ borderRadius: 14 }}
                />
              </View>
            )}
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
