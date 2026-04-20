import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  Dimensions,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Check } from "@/ui/icons";
import type { LucideIcon } from "@/ui/icons";
import { Ionicons } from "@expo/vector-icons";
import { UserListRow } from "@/components/UserListRow";
import { Button } from "@/ui/Button";
import { devLog } from "@/lib/devLog";
import { once } from "@/lib/runtimeInvariants";
import type { Friendship, CircleMember } from "@/shared/contracts";

const TrashIcon: LucideIcon = ({ color, size = 24, style }) => (
  <Ionicons name="trash-outline" size={size} color={color} style={style} />
);

interface CircleMembersSheetProps {
  visible: boolean;
  members: CircleMember[];
  availableFriends: Friendship[];
  selectedFriends: string[];
  isHost: boolean;
  circleCreatedById: string | undefined;
  isPending: boolean;
  selectedCount: number;
  colors: { background: string; text: string; textSecondary: string; textTertiary: string; border: string };
  isDark: boolean;
  themeColor: string;
  bottomInset: number;
  onClose: () => void;
  onToggleFriend: (friendId: string) => void;
  onAddMembers: () => void;
  onRemoveMember: (userId: string) => void;
  onViewProfile: (userId: string) => void;
}

export function CircleMembersSheet({
  visible,
  members,
  availableFriends,
  selectedFriends,
  isHost,
  circleCreatedById,
  isPending,
  selectedCount,
  colors,
  isDark,
  themeColor,
  bottomInset,
  onClose,
  onToggleFriend,
  onAddMembers,
  onRemoveMember,
  onViewProfile,
}: CircleMembersSheetProps) {
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
              height: Dimensions.get('window').height * 0.92,
              maxHeight: Dimensions.get('window').height * 0.95,
              overflow: "hidden",
            }}
            onLayout={__DEV__ ? (e) => {
              const { height: sheetH } = e.nativeEvent.layout;
              devLog('[P0_MEMBERS_SHEET]', 'sheet_open', { sheetHeight: Math.round(sheetH), windowHeight: Math.round(Dimensions.get('window').height), bottomInset, sheetPct: '92%', maxPct: '95%' });
              devLog('[P2_ANIMATION]', { component: 'members_sheet', animationMounted: true });
              devLog('[P2_CIRCLE_UX]', { polishApplied: true });
            } : undefined}
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
            <View style={{ paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" }}>
              <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>
                Members
              </Text>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(40, bottomInset + 16) }}
              onContentSizeChange={__DEV__ ? (_w, h) => {
                devLog('[P0_MEMBERS_SHEET]', 'scroll_content_size', { contentHeight: Math.round(h), membersCount: members.length, availableFriendsCount: availableFriends.length });
              } : undefined}
            >
              {/* Members List — SSOT via UserRow */}
              {__DEV__ && members.length > 0 && once('P0_USERROW_SHEET_SOT_circle') && void devLog('[P0_USERROW_SHEET_SOT]', { screen: 'circle_members_sheet', showChevron: false, usesPressedState: true, rowsSampled: members.length })}
              {members.map((member) => {
                const isHostOfCircle = circleCreatedById === member.userId;
                return (
                  <View
                    key={member.userId}
                    style={{
                      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#fafaf8",
                      borderRadius: 12,
                      borderWidth: 0.5,
                      borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                      marginBottom: 6,
                    }}
                  >
                    <UserListRow
                      handle={null}
                      displayName={member.user.name}
                      bio={null}
                      avatarUri={member.user.image}
                      badgeText={isHostOfCircle ? "Host" : null}
                      onPress={() => onViewProfile(member.userId)}
                      rightAccessory={
                        isHost && !isHostOfCircle ? (
                            <Pressable
                              onPress={(e) => {
                                e.stopPropagation();
                                onRemoveMember(member.userId);
                              }}
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 16,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: "#FF3B3015",
                              }}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <TrashIcon size={16} color="#FF3B30" />
                            </Pressable>
                        ) : undefined
                      }
                    />
                  </View>
                );
              })}

              {/* Add Members Section */}
              <View style={{ marginTop: 20, paddingTop: 16, paddingBottom: 16, borderTopWidth: 0.5, borderTopColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: isDark ? "rgba(255,255,255,0.4)" : colors.textTertiary, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 12 }}>Add Members</Text>

                {availableFriends.length > 0 ? (
                  <View
                    onLayout={__DEV__ ? (e) => {
                      devLog('[P0_MEMBERS_SHEET]', 'add_members_list_layout', { listHeight: Math.round(e.nativeEvent.layout.height), friendCount: availableFriends.length });
                    } : undefined}
                  >
                    {__DEV__ && availableFriends.length > 0 && once('P0_USERROW_SHEET_SOT_circle_add') && void devLog('[P0_USERROW_SHEET_SOT]', { screen: 'circle_add_members_sheet', showChevron: false, usesPressedState: true, rowsSampled: availableFriends.length })}
                    {availableFriends.map((friend, idx) => {
                      const isSelected = selectedFriends.includes(friend.friendId);
                      return (
                        <Animated.View
                          key={friend.friendId}
                          entering={FadeInDown.delay(idx * 25).springify()}
                        >
                          <Pressable
                            onPress={() => onToggleFriend(friend.friendId)}
                            style={{
                              backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#fafaf8",
                              borderRadius: 12,
                              borderWidth: 0.5,
                              borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                              marginBottom: 6,
                            }}
                          >
                            <UserListRow
                              handle={friend.friend.Profile?.handle}
                              displayName={friend.friend.name}
                              bio={friend.friend.Profile?.calendarBio}
                              avatarUri={friend.friend.image}
                              disablePressFeedback
                              rightAccessory={
                                <View
                                  style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: 10,
                                    borderWidth: 2,
                                    borderColor: colors.border,
                                    backgroundColor: isSelected ? themeColor : "transparent",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  {isSelected && <Check size={16} color="#fff" />}
                                </View>
                              }
                            />
                          </Pressable>
                        </Animated.View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>No more friends to add</Text>
                )}
              </View>
            </ScrollView>

            {/* Add Button */}
            {selectedCount > 0 && (
              <View style={{ paddingHorizontal: 20, paddingBottom: Math.max(24, bottomInset + 8), paddingTop: 12, borderTopWidth: 0.5, borderTopColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" }}>
                <Button
                  variant="primary"
                  label={
                    isPending
                      ? "Adding..."
                      : `Add ${selectedCount} Friend${selectedCount > 1 ? "s" : ""}`
                  }
                  onPress={onAddMembers}
                  disabled={selectedCount === 0 || isPending}
                  loading={isPending}
                  style={{ borderRadius: 12 }}
                />
              </View>
            )}
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
