import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  RefreshControl,
  Modal,
} from "react-native";
import { toast } from "@/components/Toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  User,
  Crown,
  Shield,
  UserCog,
  Plus,
  MoreHorizontal,
  Mail,
  Trash2,
  Check,
  X,
  Clock,
  UserPlus,
} from "lucide-react-native";
import { BlurView } from "expo-blur";
import Animated, { FadeInDown, SlideInDown, SlideOutDown, FadeIn, FadeOut } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import type {
  GetBusinessTeamResponse,
  TeamMember,
  InviteTeamMemberResponse,
} from "@/shared/contracts";

type TeamMemberRole = "owner" | "admin" | "manager";

interface RoleIconProps {
  role: TeamMemberRole;
  size?: number;
}

function RoleIcon({ role, size = 16 }: RoleIconProps) {
  switch (role) {
    case "owner":
      return <Crown size={size} color="#FFD700" />;
    case "admin":
      return <Shield size={size} color="#6366F1" />;
    case "manager":
      return <UserCog size={size} color="#10B981" />;
    default:
      return <User size={size} color="#6B7280" />;
  }
}

const ROLE_INFO: Record<TeamMemberRole, { label: string; color: string; description: string }> = {
  owner: {
    label: "Owner",
    color: "#FFD700",
    description: "Full control over business and team",
  },
  admin: {
    label: "Admin",
    color: "#6366F1",
    description: "Manage team, events, and settings",
  },
  manager: {
    label: "Manager",
    color: "#10B981",
    description: "Create and edit events only",
  },
};

export default function BusinessTeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const { data: session } = useSession();

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "manager">("manager");
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showMemberActions, setShowMemberActions] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch team data
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["businessTeam", id],
    queryFn: () => api.get<GetBusinessTeamResponse>(`/api/profiles/businesses/${id}/team`),
    enabled: !!id && !!session,
  });

  const owner = data?.owner;
  const teamMembers = data?.teamMembers ?? [];
  const activeMembers = teamMembers.filter((m) => m.status === "active");
  const pendingMembers = teamMembers.filter((m) => m.status === "pending");

  // Check if current user is owner or admin
  const currentUserRole = (() => {
    if (owner?.id === session?.user?.id) return "owner";
    const membership = teamMembers.find((m) => m.userId === session?.user?.id);
    return membership?.role as TeamMemberRole | null;
  })();

  const canManageTeam = currentUserRole === "owner" || currentUserRole === "admin";

  // Invite mutation
  const inviteMutation = useMutation({
    mutationFn: (data: { email: string; role: "admin" | "manager" }) =>
      api.post<InviteTeamMemberResponse>(`/api/profiles/businesses/${id}/team`, data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["businessTeam", id] });
      setShowInviteModal(false);
      setInviteEmail("");
      setInviteRole("manager");
      toast.success("Invitation Sent", "The team member will receive an invitation to join.");
    },
    onError: (error: Error) => {
      toast.error("Error", error.message || "Failed to send invitation");
    },
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: (data: { memberId: string; role: "admin" | "manager" }) =>
      api.put(`/api/profiles/businesses/${id}/team/${data.memberId}`, { role: data.role }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["businessTeam", id] });
      setShowMemberActions(false);
      setSelectedMember(null);
    },
    onError: (error: Error) => {
      toast.error("Error", error.message || "Failed to update role");
    },
  });

  // Remove member mutation
  const removeMutation = useMutation({
    mutationFn: (memberId: string) =>
      api.delete(`/api/profiles/businesses/${id}/team/${memberId}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["businessTeam", id] });
      setShowMemberActions(false);
      setSelectedMember(null);
    },
    onError: (error: Error) => {
      toast.error("Error", error.message || "Failed to remove team member");
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleInvite = () => {
    if (!inviteEmail.trim()) {
      toast.warning("Required", "Please enter an email address");
      return;
    }
    inviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
  };

  const [showRemoveMemberConfirm, setShowRemoveMemberConfirm] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);

  const handleRemoveMember = (member: TeamMember) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setMemberToRemove(member);
    setShowRemoveMemberConfirm(true);
  };

  const confirmRemoveMember = () => {
    if (memberToRemove) {
      removeMutation.mutate(memberToRemove.id);
    }
    setShowRemoveMemberConfirm(false);
    setMemberToRemove(null);
  };

  const handleChangeRole = (member: TeamMember, newRole: "admin" | "manager") => {
    updateRoleMutation.mutate({ memberId: member.id, role: newRole });
  };

  if (!session) {
    return (
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }}
        edges={["top"]}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }}
      edges={["top"]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 py-3"
        style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: colors.surface }}
          >
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text style={{ color: colors.text }} className="text-xl font-bold">
            Team
          </Text>
        </View>

        {canManageTeam && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowInviteModal(true);
            }}
            className="flex-row items-center px-4 py-2 rounded-full"
            style={{ backgroundColor: themeColor }}
          >
            <UserPlus size={18} color="#fff" />
            <Text className="text-white font-semibold ml-2">Invite</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={themeColor}
          />
        }
      >
        {/* Role Legend */}
        <Animated.View
          entering={FadeInDown.delay(0).springify()}
          className="mx-4 mt-4 p-4 rounded-2xl"
          style={{ backgroundColor: colors.surface }}
        >
          <Text
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: colors.textTertiary }}
          >
            Role Permissions
          </Text>
          {(Object.keys(ROLE_INFO) as TeamMemberRole[]).map((role) => (
            <View key={role} className="flex-row items-center mb-2 last:mb-0">
              <View
                className="w-8 h-8 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: `${ROLE_INFO[role].color}20` }}
              >
                <RoleIcon role={role} size={16} />
              </View>
              <View className="flex-1">
                <Text className="font-medium" style={{ color: colors.text }}>
                  {ROLE_INFO[role].label}
                </Text>
                <Text className="text-xs" style={{ color: colors.textSecondary }}>
                  {ROLE_INFO[role].description}
                </Text>
              </View>
            </View>
          ))}
        </Animated.View>

        {/* Owner Section */}
        {owner && (
          <Animated.View
            entering={FadeInDown.delay(100).springify()}
            className="mx-4 mt-6"
          >
            <Text
              className="text-xs font-semibold uppercase tracking-wider mb-2 ml-2"
              style={{ color: colors.textTertiary }}
            >
              Owner
            </Text>
            <View
              className="rounded-2xl p-4"
              style={{ backgroundColor: colors.surface }}
            >
              <View className="flex-row items-center">
                {owner.image ? (
                  <Image
                    source={{ uri: owner.image }}
                    className="w-12 h-12 rounded-full bg-zinc-200"
                  />
                ) : (
                  <View
                    className="w-12 h-12 rounded-full items-center justify-center"
                    style={{ backgroundColor: "#FFD70020" }}
                  >
                    <Crown size={24} color="#FFD700" />
                  </View>
                )}
                <View className="flex-1 ml-3">
                  <Text className="font-semibold" style={{ color: colors.text }}>
                    {owner.name ?? "Unknown"}
                  </Text>
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    {owner.email}
                  </Text>
                </View>
                <View
                  className="px-3 py-1 rounded-full"
                  style={{ backgroundColor: "#FFD70020" }}
                >
                  <Text className="text-xs font-semibold" style={{ color: "#FFD700" }}>
                    Owner
                  </Text>
                </View>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Active Team Members */}
        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          className="mx-4 mt-6"
        >
          <Text
            className="text-xs font-semibold uppercase tracking-wider mb-2 ml-2"
            style={{ color: colors.textTertiary }}
          >
            Team Members ({activeMembers.length})
          </Text>
          <View
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: colors.surface }}
          >
            {activeMembers.length === 0 ? (
              <View className="p-6 items-center">
                <User size={32} color={colors.textTertiary} />
                <Text className="mt-2 text-center" style={{ color: colors.textSecondary }}>
                  No team members yet
                </Text>
                {canManageTeam && (
                  <Pressable
                    onPress={() => setShowInviteModal(true)}
                    className="mt-3 px-4 py-2 rounded-full"
                    style={{ backgroundColor: `${themeColor}20` }}
                  >
                    <Text className="font-medium" style={{ color: themeColor }}>
                      Invite someone
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              activeMembers.map((member, index) => (
                <Pressable
                  key={member.id}
                  onPress={() => {
                    if (canManageTeam) {
                      setSelectedMember(member);
                      setShowMemberActions(true);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  }}
                  className="flex-row items-center p-4"
                  style={{
                    borderBottomWidth: index < activeMembers.length - 1 ? 1 : 0,
                    borderBottomColor: isDark ? "#38383A" : "#F3F4F6",
                  }}
                >
                  {member.user.image ? (
                    <Image
                      source={{ uri: member.user.image }}
                      className="w-11 h-11 rounded-full bg-zinc-200"
                    />
                  ) : (
                    <View
                      className="w-11 h-11 rounded-full items-center justify-center"
                      style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                    >
                      <User size={22} color={colors.textSecondary} />
                    </View>
                  )}
                  <View className="flex-1 ml-3">
                    <Text className="font-medium" style={{ color: colors.text }}>
                      {member.user.name ?? "Unknown"}
                    </Text>
                    <Text className="text-sm" style={{ color: colors.textSecondary }}>
                      {member.user.email}
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <View
                      className="px-2.5 py-1 rounded-full mr-2"
                      style={{ backgroundColor: `${ROLE_INFO[member.role as TeamMemberRole]?.color ?? "#6B7280"}20` }}
                    >
                      <Text
                        className="text-xs font-medium capitalize"
                        style={{ color: ROLE_INFO[member.role as TeamMemberRole]?.color ?? "#6B7280" }}
                      >
                        {member.role}
                      </Text>
                    </View>
                    {canManageTeam && (
                      <MoreHorizontal size={20} color={colors.textTertiary} />
                    )}
                  </View>
                </Pressable>
              ))
            )}
          </View>
        </Animated.View>

        {/* Pending Invitations */}
        {pendingMembers.length > 0 && (
          <Animated.View
            entering={FadeInDown.delay(300).springify()}
            className="mx-4 mt-6"
          >
            <Text
              className="text-xs font-semibold uppercase tracking-wider mb-2 ml-2"
              style={{ color: colors.textTertiary }}
            >
              Pending Invitations ({pendingMembers.length})
            </Text>
            <View
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: colors.surface }}
            >
              {pendingMembers.map((member, index) => (
                <View
                  key={member.id}
                  className="flex-row items-center p-4"
                  style={{
                    borderBottomWidth: index < pendingMembers.length - 1 ? 1 : 0,
                    borderBottomColor: isDark ? "#38383A" : "#F3F4F6",
                  }}
                >
                  <View
                    className="w-11 h-11 rounded-full items-center justify-center"
                    style={{ backgroundColor: "#F59E0B20" }}
                  >
                    <Clock size={22} color="#F59E0B" />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text className="font-medium" style={{ color: colors.text }}>
                      {member.user.name ?? member.user.email ?? "Unknown"}
                    </Text>
                    <Text className="text-xs" style={{ color: colors.textSecondary }}>
                      Invitation pending
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <View
                      className="px-2.5 py-1 rounded-full mr-2"
                      style={{ backgroundColor: `${ROLE_INFO[member.role as TeamMemberRole]?.color ?? "#6B7280"}20` }}
                    >
                      <Text
                        className="text-xs font-medium capitalize"
                        style={{ color: ROLE_INFO[member.role as TeamMemberRole]?.color ?? "#6B7280" }}
                      >
                        {member.role}
                      </Text>
                    </View>
                    {canManageTeam && (
                      <Pressable
                        onPress={() => handleRemoveMember(member)}
                        className="p-2"
                      >
                        <X size={18} color="#EF4444" />
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        )}
      </ScrollView>

      {/* Invite Modal */}
      <Modal
        visible={showInviteModal}
        transparent
        animationType="none"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <Pressable className="flex-1" onPress={() => setShowInviteModal(false)}>
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            className="flex-1 justify-end"
          >
            <BlurView
              intensity={40}
              tint="dark"
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            />
            <Pressable onPress={(e) => e.stopPropagation()}>
              <Animated.View
                entering={SlideInDown.springify().damping(20)}
                exiting={SlideOutDown.springify().damping(20)}
                className="rounded-t-3xl overflow-hidden"
                style={{ backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" }}
              >
                <View className="px-5 pt-4 pb-3 border-b" style={{ borderColor: isDark ? "#38383A" : "#F3F4F6" }}>
                  <View className="w-10 h-1 bg-zinc-700 rounded-full self-center mb-3" />
                  <Text className="text-lg font-semibold text-center" style={{ color: colors.text }}>
                    Invite Team Member
                  </Text>
                </View>

                <View className="px-5 py-4">
                  {/* Email Input */}
                  <Text className="text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                    Email Address
                  </Text>
                  <TextInput
                    value={inviteEmail}
                    onChangeText={setInviteEmail}
                    placeholder="Enter email address"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    className="rounded-xl px-4 py-3 mb-4"
                    style={{
                      backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                      color: colors.text,
                    }}
                  />

                  {/* Role Selection */}
                  <Text className="text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                    Role
                  </Text>
                  <View className="flex-row mb-4">
                    <Pressable
                      onPress={() => setInviteRole("manager")}
                      className="flex-1 py-3 rounded-xl mr-2 flex-row items-center justify-center"
                      style={{
                        backgroundColor: inviteRole === "manager" ? `${ROLE_INFO.manager.color}20` : (isDark ? "#2C2C2E" : "#F3F4F6"),
                        borderWidth: inviteRole === "manager" ? 2 : 0,
                        borderColor: ROLE_INFO.manager.color,
                      }}
                    >
                      <RoleIcon role="manager" size={18} />
                      <Text
                        className="ml-2 font-medium"
                        style={{ color: inviteRole === "manager" ? ROLE_INFO.manager.color : colors.text }}
                      >
                        Manager
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setInviteRole("admin")}
                      className="flex-1 py-3 rounded-xl flex-row items-center justify-center"
                      style={{
                        backgroundColor: inviteRole === "admin" ? `${ROLE_INFO.admin.color}20` : (isDark ? "#2C2C2E" : "#F3F4F6"),
                        borderWidth: inviteRole === "admin" ? 2 : 0,
                        borderColor: ROLE_INFO.admin.color,
                      }}
                    >
                      <RoleIcon role="admin" size={18} />
                      <Text
                        className="ml-2 font-medium"
                        style={{ color: inviteRole === "admin" ? ROLE_INFO.admin.color : colors.text }}
                      >
                        Admin
                      </Text>
                    </Pressable>
                  </View>

                  {/* Role Description */}
                  <View
                    className="rounded-xl p-3 mb-4"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                  >
                    <Text className="text-sm" style={{ color: colors.textSecondary }}>
                      {ROLE_INFO[inviteRole].description}
                    </Text>
                  </View>

                  {/* Action Buttons */}
                  <View className="flex-row">
                    <Pressable
                      onPress={() => setShowInviteModal(false)}
                      className="flex-1 py-3.5 rounded-xl mr-2"
                      style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                    >
                      <Text className="text-center font-semibold" style={{ color: colors.text }}>
                        Cancel
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleInvite}
                      disabled={inviteMutation.isPending}
                      className="flex-1 py-3.5 rounded-xl"
                      style={{ backgroundColor: themeColor }}
                    >
                      <Text className="text-center font-semibold text-white">
                        {inviteMutation.isPending ? "Sending..." : "Send Invite"}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View className="h-8" />
              </Animated.View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Member Actions Modal */}
      <Modal
        visible={showMemberActions}
        transparent
        animationType="none"
        onRequestClose={() => setShowMemberActions(false)}
      >
        <Pressable className="flex-1" onPress={() => setShowMemberActions(false)}>
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            className="flex-1 justify-end"
          >
            <BlurView
              intensity={40}
              tint="dark"
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            />
            <Pressable onPress={(e) => e.stopPropagation()}>
              <Animated.View
                entering={SlideInDown.springify().damping(20)}
                exiting={SlideOutDown.springify().damping(20)}
                className="rounded-t-3xl overflow-hidden"
                style={{ backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" }}
              >
                <View className="px-5 pt-4 pb-3 border-b" style={{ borderColor: isDark ? "#38383A" : "#F3F4F6" }}>
                  <View className="w-10 h-1 bg-zinc-700 rounded-full self-center mb-3" />
                  <Text className="text-lg font-semibold text-center" style={{ color: colors.text }}>
                    {selectedMember?.user.name ?? "Team Member"}
                  </Text>
                  <Text className="text-sm text-center mt-1" style={{ color: colors.textSecondary }}>
                    {selectedMember?.user.email}
                  </Text>
                </View>

                <View className="px-4 py-2">
                  {/* Change Role */}
                  {currentUserRole === "owner" && selectedMember && (
                    <>
                      <Text className="text-xs font-semibold uppercase tracking-wider px-2 pt-3 pb-2" style={{ color: colors.textTertiary }}>
                        Change Role
                      </Text>
                      <Pressable
                        onPress={() => handleChangeRole(selectedMember, "manager")}
                        className="flex-row items-center p-3 rounded-xl active:opacity-70"
                        style={{
                          backgroundColor: selectedMember.role === "manager" ? `${ROLE_INFO.manager.color}15` : "transparent",
                        }}
                      >
                        <View
                          className="w-10 h-10 rounded-full items-center justify-center mr-3"
                          style={{ backgroundColor: `${ROLE_INFO.manager.color}20` }}
                        >
                          <RoleIcon role="manager" size={20} />
                        </View>
                        <View className="flex-1">
                          <Text className="font-medium" style={{ color: colors.text }}>Manager</Text>
                          <Text className="text-xs" style={{ color: colors.textSecondary }}>
                            {ROLE_INFO.manager.description}
                          </Text>
                        </View>
                        {selectedMember.role === "manager" && <Check size={20} color={ROLE_INFO.manager.color} />}
                      </Pressable>
                      <Pressable
                        onPress={() => handleChangeRole(selectedMember, "admin")}
                        className="flex-row items-center p-3 rounded-xl active:opacity-70"
                        style={{
                          backgroundColor: selectedMember.role === "admin" ? `${ROLE_INFO.admin.color}15` : "transparent",
                        }}
                      >
                        <View
                          className="w-10 h-10 rounded-full items-center justify-center mr-3"
                          style={{ backgroundColor: `${ROLE_INFO.admin.color}20` }}
                        >
                          <RoleIcon role="admin" size={20} />
                        </View>
                        <View className="flex-1">
                          <Text className="font-medium" style={{ color: colors.text }}>Admin</Text>
                          <Text className="text-xs" style={{ color: colors.textSecondary }}>
                            {ROLE_INFO.admin.description}
                          </Text>
                        </View>
                        {selectedMember.role === "admin" && <Check size={20} color={ROLE_INFO.admin.color} />}
                      </Pressable>
                    </>
                  )}

                  {/* Remove from team */}
                  <View className="mt-2 pt-2 border-t" style={{ borderColor: isDark ? "#38383A" : "#F3F4F6" }}>
                    <Pressable
                      onPress={() => selectedMember && handleRemoveMember(selectedMember)}
                      className="flex-row items-center p-3 rounded-xl active:opacity-70"
                    >
                      <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: "#EF444420" }}>
                        <Trash2 size={20} color="#EF4444" />
                      </View>
                      <Text className="font-medium" style={{ color: "#EF4444" }}>
                        Remove from Team
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View className="h-8" />
              </Animated.View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      <ConfirmModal
        visible={showRemoveMemberConfirm}
        title="Remove Team Member"
        message={`Are you sure you want to remove ${memberToRemove?.user.name || memberToRemove?.user.email || "this member"} from the team?`}
        confirmText="Remove"
        isDestructive
        onConfirm={confirmRemoveMember}
        onCancel={() => {
          setShowRemoveMemberConfirm(false);
          setMemberToRemove(null);
        }}
      />
    </SafeAreaView>
  );
}
