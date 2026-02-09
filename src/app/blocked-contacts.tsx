import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  Platform,
  ActivityIndicator,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { isAuthedForNetwork } from "@/lib/authedGate";
import {
  ChevronLeft,
  Search,
  UserX,
  Mail,
  Phone,
  X,
  Plus,
  Shield,
  AlertTriangle,
} from "@/ui/icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { eventKeys } from "@/lib/eventQueryKeys";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { Button } from "@/ui/Button";
import {
  type GetBlockedContactsResponse,
  type BlockContactResponse,
  type UnblockContactResponse,
  type SearchToBlockResponse,
  type BlockedContact,
  type FriendUser,
} from "@/shared/contracts";

type BlockMode = "user" | "email" | "phone";

export default function BlockedContactsScreen() {
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();

  const [showAddBlock, setShowAddBlock] = useState(false);
  const [blockMode, setBlockMode] = useState<BlockMode>("user");
  const [searchQuery, setSearchQuery] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [selectedUser, setSelectedUser] = useState<FriendUser | null>(null);

  // Fetch blocked contacts
  const { data: blockedData, isLoading } = useQuery({
    queryKey: ["blocked-contacts"],
    queryFn: () => api.get<GetBlockedContactsResponse>("/api/blocked"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  // Search users to block
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["block-search", searchQuery],
    queryFn: () =>
      api.post<SearchToBlockResponse>("/api/blocked/search", { query: searchQuery }),
    enabled: isAuthedForNetwork(bootStatus, session) && searchQuery.length >= 2 && blockMode === "user",
  });

  // Block mutation
  const blockMutation = useMutation({
    mutationFn: (data: { userId?: string; email?: string; phone?: string }) =>
      api.post<BlockContactResponse>("/api/blocked", data),
    onSuccess: (response) => {
      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ["blocked-contacts"] });
        queryClient.invalidateQueries({ queryKey: ["friends"] });
        queryClient.invalidateQueries({ queryKey: eventKeys.feed() });
        resetAddBlockForm();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  // Unblock mutation
  const unblockMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete<UnblockContactResponse>(`/api/blocked/${id}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["blocked-contacts"] });
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const resetAddBlockForm = () => {
    setShowAddBlock(false);
    setBlockMode("user");
    setSearchQuery("");
    setEmailInput("");
    setPhoneInput("");
    setSelectedUser(null);
  };

  const handleBlock = () => {
    if (blockMode === "user" && selectedUser) {
      blockMutation.mutate({ userId: selectedUser.id });
    } else if (blockMode === "email" && emailInput.trim()) {
      blockMutation.mutate({ email: emailInput.trim().toLowerCase() });
    } else if (blockMode === "phone" && phoneInput.trim()) {
      blockMutation.mutate({ phone: phoneInput.trim() });
    }
  };

  const handleUnblock = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    unblockMutation.mutate(id);
  };

  const blockedContacts = blockedData?.blockedContacts ?? [];

  if (!session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
        <View className="flex-row items-center px-4 py-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: colors.surface }}
          >
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text style={{ color: colors.text }} className="text-xl font-bold">Blocked Contacts</Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text style={{ color: colors.textSecondary }}>Please sign in to access this feature</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }}>
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
            style={{
              backgroundColor: colors.surface,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: isDark ? 0 : 0.1,
              shadowRadius: 2,
            }}
          >
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <View className="flex-1">
            <Text style={{ color: colors.text }} className="text-xl font-bold">Blocked Contacts</Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowAddBlock(true);
            }}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: themeColor }}
          >
            <Plus size={20} color="#fff" />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info Banner */}
          <Animated.View entering={FadeInDown.delay(0).springify()} className="mx-4 mt-4">
            <View
              className="rounded-2xl p-4 flex-row items-start"
              style={{ backgroundColor: `${themeColor}15` }}
            >
              <Shield size={20} color={themeColor} style={{ marginTop: 2 }} />
              <View className="flex-1 ml-3">
                <Text style={{ color: themeColor }} className="font-semibold mb-1">Privacy Protection</Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm">
                  Blocked contacts cannot see your profile, events, or any trace of your account. They won't know they've been blocked.
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* Add Block Form */}
          {showAddBlock && (
            <Animated.View entering={FadeIn.springify()} className="mx-4 mt-4">
              <View
                className="rounded-2xl p-4"
                style={{
                  backgroundColor: colors.surface,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isDark ? 0 : 0.05,
                  shadowRadius: 8,
                }}
              >
                <View className="flex-row items-center justify-between mb-4">
                  <Text style={{ color: colors.text }} className="text-lg font-semibold">Block Contact</Text>
                  <Pressable onPress={resetAddBlockForm}>
                    <X size={20} color={colors.textTertiary} />
                  </Pressable>
                </View>

                {/* Block Mode Tabs */}
                <View
                  className="flex-row rounded-xl p-1 mb-4"
                  style={{ backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7" }}
                >
                  {[
                    { id: "user" as BlockMode, label: "User", icon: UserX },
                    { id: "email" as BlockMode, label: "Email", icon: Mail },
                    { id: "phone" as BlockMode, label: "Phone", icon: Phone },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = blockMode === tab.id;
                    return (
                      <Pressable
                        key={tab.id}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setBlockMode(tab.id);
                          setSelectedUser(null);
                        }}
                        className="flex-1 flex-row items-center justify-center py-2 rounded-lg"
                        style={{
                          backgroundColor: isActive ? (isDark ? "#3A3A3C" : "#fff") : "transparent",
                        }}
                      >
                        <Icon size={14} color={isActive ? themeColor : colors.textSecondary} />
                        <Text
                          className="text-sm font-medium ml-1"
                          style={{ color: isActive ? themeColor : colors.textSecondary }}
                        >
                          {tab.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* User Search */}
                {blockMode === "user" && (
                  <View>
                    <View
                      className="flex-row items-center rounded-xl px-3 mb-3"
                      style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
                    >
                      <Search size={18} color={colors.textTertiary} />
                      <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search by name, email, or handle..."
                        placeholderTextColor={colors.textTertiary}
                        style={{ color: colors.text }}
                        className="flex-1 py-3 px-2"
                        autoCapitalize="none"
                      />
                      {searchQuery.length > 0 && (
                        <Pressable onPress={() => setSearchQuery("")}>
                          <X size={16} color={colors.textTertiary} />
                        </Pressable>
                      )}
                    </View>

                    {/* Search Results */}
                    {isSearching && (
                      <View className="py-4 items-center">
                        <ActivityIndicator size="small" color={themeColor} />
                      </View>
                    )}

                    {searchQuery.length >= 2 && searchResults?.users && searchResults.users.length > 0 && (
                      <View className="max-h-48">
                        {searchResults.users.map((user) => (
                          <Pressable
                            key={user.id}
                            onPress={() => {
                              Haptics.selectionAsync();
                              setSelectedUser(user);
                            }}
                            className="flex-row items-center p-3 rounded-xl mb-2"
                            style={{
                              backgroundColor: selectedUser?.id === user.id
                                ? `${themeColor}15`
                                : isDark ? "#2C2C2E" : "#F9FAFB",
                              borderWidth: selectedUser?.id === user.id ? 1 : 0,
                              borderColor: themeColor,
                            }}
                          >
                            <View
                              className="w-10 h-10 rounded-full mr-3 overflow-hidden"
                              style={{ backgroundColor: isDark ? "#3A3A3C" : "#E5E7EB" }}
                            >
                              {user.image ? (
                                <Image source={{ uri: user.image }} className="w-full h-full" />
                              ) : (
                                <View className="w-full h-full items-center justify-center" style={{ backgroundColor: `${themeColor}20` }}>
                                  <Text style={{ color: themeColor }} className="font-bold">
                                    {user.name?.[0] ?? user.email?.[0]?.toUpperCase() ?? "?"}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <View className="flex-1">
                              <Text style={{ color: colors.text }} className="font-medium" numberOfLines={1}>
                                {user.name ?? "Unknown"}
                              </Text>
                              <Text style={{ color: colors.textSecondary }} className="text-xs" numberOfLines={1}>
                                {user.email ?? "No email"}
                              </Text>
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    )}

                    {searchQuery.length >= 2 && searchResults?.users?.length === 0 && !isSearching && (
                      <View className="py-4 items-center">
                        <Text style={{ color: colors.textTertiary }}>No users found</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Email Input */}
                {blockMode === "email" && (
                  <View>
                    <TextInput
                      value={emailInput}
                      onChangeText={setEmailInput}
                      placeholder="Enter email address to block"
                      placeholderTextColor={colors.textTertiary}
                      style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB", color: colors.text }}
                      className="rounded-xl px-4 py-3"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                    />
                    <Text style={{ color: colors.textTertiary }} className="text-xs mt-2 ml-2">
                      If this email creates an account, they will be automatically blocked.
                    </Text>
                  </View>
                )}

                {/* Phone Input */}
                {blockMode === "phone" && (
                  <View>
                    <TextInput
                      value={phoneInput}
                      onChangeText={setPhoneInput}
                      placeholder="Enter phone number to block"
                      placeholderTextColor={colors.textTertiary}
                      style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB", color: colors.text }}
                      className="rounded-xl px-4 py-3"
                      keyboardType="phone-pad"
                      autoComplete="tel"
                    />
                    <Text style={{ color: colors.textTertiary }} className="text-xs mt-2 ml-2">
                      If this phone number creates an account, they will be automatically blocked.
                    </Text>
                  </View>
                )}

                {/* Block Button */}
                {(() => {
                  const hasValidInput =
                    (blockMode === "user" && !!selectedUser) ||
                    (blockMode === "email" && !!emailInput.trim()) ||
                    (blockMode === "phone" && !!phoneInput.trim());
                  return (
                    <Button
                      variant="destructive"
                      label="Block Contact"
                      onPress={handleBlock}
                      disabled={!hasValidInput}
                      loading={blockMutation.isPending}
                      leftIcon={<UserX size={18} color={hasValidInput ? "#fff" : colors.textTertiary} />}
                      style={{ marginTop: 16, borderRadius: 12 }}
                    />
                  );
                })()}
              </View>
            </Animated.View>
          )}

          {/* Blocked Contacts List */}
          <Animated.View entering={FadeInDown.delay(100).springify()} className="mx-4 mt-6">
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">
              BLOCKED ({blockedContacts.length})
            </Text>
            <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
              {isLoading ? (
                <View className="py-8 items-center">
                  <ActivityIndicator size="small" color={themeColor} />
                </View>
              ) : blockedContacts.length === 0 ? (
                <View className="py-8 items-center">
                  <Shield size={32} color={colors.textTertiary} />
                  <Text style={{ color: colors.textTertiary }} className="mt-2">No blocked contacts</Text>
                  <Pressable
                    onPress={() => setShowAddBlock(true)}
                    className="flex-row items-center mt-3"
                  >
                    <Plus size={16} color={themeColor} />
                    <Text style={{ color: themeColor }} className="font-medium ml-1">Add block</Text>
                  </Pressable>
                </View>
              ) : (
                blockedContacts.map((contact, index) => (
                  <BlockedContactItem
                    key={contact.id}
                    contact={contact}
                    onUnblock={() => handleUnblock(contact.id)}
                    isUnblocking={unblockMutation.isPending}
                    isDark={isDark}
                    colors={colors}
                    themeColor={themeColor}
                    isLast={index === blockedContacts.length - 1}
                  />
                ))
              )}
            </View>
          </Animated.View>

          {/* Warning */}
          <Animated.View entering={FadeInDown.delay(200).springify()} className="mx-4 mt-6">
            <View
              className="rounded-2xl p-4 flex-row items-start"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#FEF3C7" }}
            >
              <AlertTriangle size={20} color="#D97706" style={{ marginTop: 2 }} />
              <View className="flex-1 ml-3">
                <Text style={{ color: isDark ? "#FBBF24" : "#92400E" }} className="font-semibold mb-1">
                  Important
                </Text>
                <Text style={{ color: isDark ? colors.textSecondary : "#92400E" }} className="text-sm">
                  Unblocking a contact does not restore previous friendships or event access. You'll need to re-add them as a friend if desired.
                </Text>
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function BlockedContactItem({
  contact,
  onUnblock,
  isUnblocking,
  isDark,
  colors,
  themeColor,
  isLast,
}: {
  contact: BlockedContact;
  onUnblock: () => void;
  isUnblocking: boolean;
  isDark: boolean;
  colors: typeof import("@/lib/ThemeContext").DARK_COLORS;
  themeColor: string;
  isLast: boolean;
}) {
  // Determine display info
  const displayName = contact.blockedUser?.name ?? contact.blockedEmail ?? contact.blockedPhone ?? "Unknown";
  const displaySubtitle = contact.blockedUser
    ? contact.blockedUser.email
    : contact.blockedEmail
    ? "Blocked by email"
    : "Blocked by phone";

  return (
    <View
      className="flex-row items-center p-4"
      style={{
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: isDark ? "#38383A" : "#F3F4F6",
      }}
    >
      <View
        className="w-12 h-12 rounded-full mr-3 overflow-hidden"
        style={{ backgroundColor: isDark ? "#3A3A3C" : "#E5E7EB" }}
      >
        {contact.blockedUser?.image ? (
          <Image source={{ uri: contact.blockedUser.image }} className="w-full h-full" />
        ) : (
          <View className="w-full h-full items-center justify-center" style={{ backgroundColor: "#EF444420" }}>
            {contact.blockedEmail ? (
              <Mail size={20} color="#EF4444" />
            ) : contact.blockedPhone ? (
              <Phone size={20} color="#EF4444" />
            ) : (
              <UserX size={20} color="#EF4444" />
            )}
          </View>
        )}
      </View>
      <View className="flex-1">
        <Text style={{ color: colors.text }} className="font-medium" numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={{ color: colors.textSecondary }} className="text-xs" numberOfLines={1}>
          {displaySubtitle}
        </Text>
      </View>
      <Button
        variant="secondary"
        size="sm"
        label="Unblock"
        onPress={onUnblock}
        disabled={isUnblocking}
      />
    </View>
  );
}
