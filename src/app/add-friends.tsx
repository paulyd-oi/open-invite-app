/**
 * Find Friends — unified friend discovery page.
 *
 * Combines:
 * - FriendDiscoverySurface (search by name/email/phone, suggestions, contact import)
 * - Contacts batch scan (hash-match device contacts against backend, SMS invite unmatched)
 *
 * Accessible from: Friends header button, onboarding, discover, social, daily ideas
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Linking,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  UserPlus,
  Send,
  Check,
  Users,
} from "@/ui/icons";
import * as Haptics from "expo-haptics";
import * as Contacts from "expo-contacts";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useMutation } from "@tanstack/react-query";

import { FriendDiscoverySurface } from "@/components/FriendDiscoverySurface";
import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { EntityAvatar } from "@/components/EntityAvatar";
import { api } from "@/lib/api";
import { safeToast } from "@/lib/safeToast";
import { devLog } from "@/lib/devLog";
import { APP_STORE_URL } from "@/lib/config";
import {
  matchContacts,
  type ContactMatchUser,
  type UnmatchedContact,
} from "@/lib/contactsMatch";

export default function FindFriendsScreen() {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const { data: session } = useSession();

  // ── Contacts scan state ──────────────────────────────────────
  const [permissionStatus, setPermissionStatus] = useState<"undetermined" | "granted" | "denied">("undetermined");
  const [isScanning, setIsScanning] = useState(false);
  const [matches, setMatches] = useState<ContactMatchUser[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedContact[]>([]);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [invitedContacts, setInvitedContacts] = useState<Set<string>>(new Set());
  const [hasScanned, setHasScanned] = useState(false);

  // Check contacts permission on mount
  useEffect(() => {
    (async () => {
      const { status } = await Contacts.getPermissionsAsync();
      if (status === "granted") {
        setPermissionStatus("granted");
        scanContacts();
      } else if (status === "denied") {
        setPermissionStatus("denied");
      }
    })();
  }, []);

  const requestPermissionAndScan = useCallback(async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status === "granted") {
      setPermissionStatus("granted");
      scanContacts();
    } else {
      setPermissionStatus("denied");
    }
  }, []);

  const scanContacts = useCallback(async () => {
    setIsScanning(true);
    try {
      const result = await matchContacts();
      setMatches(result.matches);
      setUnmatched(result.unmatched.slice(0, 100));
      setHasScanned(true);
      if (__DEV__) devLog("[FIND_FRIENDS] scan complete", result.matches.length, "matches");
    } catch (err) {
      if (__DEV__) devLog("[FIND_FRIENDS] scan error", err);
      safeToast.error("Couldn't scan contacts", "Please try again.");
    } finally {
      setIsScanning(false);
    }
  }, []);

  // Friend request mutation
  const sendRequestMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post("/api/friends/request", { userId }),
    onSuccess: (_, userId) => {
      setSentRequests((prev) => new Set(prev).add(userId));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      safeToast.error("Request failed", "Please try again.");
    },
  });

  const handleAddFriend = (userId: string) => {
    if (sentRequests.has(userId) || sendRequestMutation.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendRequestMutation.mutate(userId);
  };

  const handleInvite = (contact: UnmatchedContact) => {
    const message = `Join me on Open Invite — see what your friends are up to and make plans together!\n\n${APP_STORE_URL}`;
    if (contact.phone) {
      const cleanPhone = contact.phone.replace(/\D/g, "");
      Linking.openURL(`sms:${cleanPhone}&body=${encodeURIComponent(message)}`);
    } else {
      Share.share({ message });
    }
    setInvitedContacts((prev) => new Set(prev).add(contact.name));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Contacts section (rendered inside FriendDiscoverySurface ScrollView) ──
  const newMatches = matches.filter((m) => !m.isFriend);
  const existingFriends = matches.filter((m) => m.isFriend);
  const hasContactResults = hasScanned && (matches.length > 0 || unmatched.length > 0);

  const contactsSection = (
    <View className="mt-4">
      {/* ── Permission prompt (inline) ── */}
      {permissionStatus !== "granted" && !hasScanned && (
        <Animated.View entering={FadeInDown.duration(200)}>
          <View
            className="mx-4 rounded-2xl p-5 items-center"
            /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <View
              className="w-14 h-14 rounded-full items-center justify-center mb-3"
              /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
              style={{ backgroundColor: `${themeColor}20` }}
            >
              <Users size={28} color={themeColor} />
            </View>
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text className="text-base font-semibold text-center mb-1" style={{ color: colors.text }}>
              Find friends from contacts
            </Text>
            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
            <Text className="text-sm text-center mb-4" style={{ color: colors.textSecondary }}>
              See which contacts are already on Open Invite
            </Text>
            <Pressable
              onPress={requestPermissionAndScan}
              className="rounded-full py-2.5 px-6"
              /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
              style={{ backgroundColor: themeColor }}
            >
              <Text className="text-white text-sm font-semibold">Allow Contacts Access</Text>
            </Pressable>
            {permissionStatus === "denied" && (
              /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
              <Text className="text-xs text-center mt-3" style={{ color: colors.textTertiary }}>
                Contacts access was denied. Enable it in Settings.
              </Text>
            )}
          </View>
        </Animated.View>
      )}

      {/* ── Scanning ── */}
      {isScanning && (
        <View className="py-8 items-center">
          <ActivityIndicator size="small" color={themeColor} />
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text className="mt-2 text-sm" style={{ color: colors.textSecondary }}>
            Scanning contacts...
          </Text>
        </View>
      )}

      {/* ── Contact scan results ── */}
      {hasContactResults && (
        <>
          {/* New matches */}
          {newMatches.length > 0 && (
            <View className="mt-2">
              <Animated.View entering={FadeInDown.delay(100)} className="px-5 pt-4 pb-2">
                {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                <Text className="text-base font-bold" style={{ color: colors.text }}>
                  {newMatches.length} friend{newMatches.length !== 1 ? "s" : ""} already on Open Invite
                </Text>
              </Animated.View>
              {/* INVARIANT_ALLOW_SMALL_MAP */}
              {newMatches.map((user, index) => {
                const isSent = sentRequests.has(user.id) || user.isPending;
                return (
                  <Animated.View key={user.id} entering={FadeInDown.delay(index * 30)}>
                    <Pressable
                      onPress={() => router.push(`/user/${user.id}` as any)}
                      className="flex-row items-center px-5 py-3"
                    >
                      <EntityAvatar
                        photoUrl={user.avatarUrl ?? user.image}
                        initials={user.name?.[0] ?? "?"}
                        size={44}
                        backgroundColor={isDark ? "#2C2C2E" : `${themeColor}20`}
                        foregroundColor={themeColor}
                        fallbackIcon="person"
                      />
                      <View className="flex-1 ml-3">
                        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                        <Text className="text-base font-medium" style={{ color: colors.text }} numberOfLines={1}>
                          {user.name ?? "Open Invite User"}
                        </Text>
                        {user.handle && (
                          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                          <Text className="text-sm" style={{ color: colors.textSecondary }} numberOfLines={1}>
                            @{user.handle}
                          </Text>
                        )}
                      </View>
                      {isSent ? (
                        <View className="flex-row items-center px-3 py-1.5 rounded-full" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" }}>
                          <Check size={14} color={colors.textSecondary} />
                          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                          <Text className="text-xs font-semibold ml-1" style={{ color: colors.textSecondary }}>Sent</Text>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => handleAddFriend(user.id)}
                          className="flex-row items-center px-3 py-1.5 rounded-full"
                          /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                          style={{ backgroundColor: themeColor }}
                        >
                          <UserPlus size={14} color="#fff" />
                          <Text className="text-white text-xs font-semibold ml-1">Add</Text>
                        </Pressable>
                      )}
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          )}

          {/* Already connected */}
          {existingFriends.length > 0 && (
            <View className="mt-2">
              <Animated.View entering={FadeInDown.delay(100)} className="px-5 pt-4 pb-2">
                {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                <Text className="text-base font-bold" style={{ color: colors.text }}>
                  Already connected
                </Text>
              </Animated.View>
              {/* INVARIANT_ALLOW_SMALL_MAP */}
              {existingFriends.map((user, index) => (
                <Animated.View key={user.id} entering={FadeInDown.delay(index * 30)}>
                  <Pressable
                    onPress={() => router.push(`/user/${user.id}` as any)}
                    className="flex-row items-center px-5 py-3"
                  >
                    <EntityAvatar
                      photoUrl={user.avatarUrl ?? user.image}
                      initials={user.name?.[0] ?? "?"}
                      size={44}
                      backgroundColor={isDark ? "#2C2C2E" : `${themeColor}20`}
                      foregroundColor={themeColor}
                      fallbackIcon="person"
                    />
                    <View className="flex-1 ml-3">
                      {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                      <Text className="text-base font-medium" style={{ color: colors.text }} numberOfLines={1}>
                        {user.name ?? "Open Invite User"}
                      </Text>
                      {user.handle && (
                        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                        <Text className="text-sm" style={{ color: colors.textSecondary }} numberOfLines={1}>
                          @{user.handle}
                        </Text>
                      )}
                    </View>
                    <View className="flex-row items-center px-3 py-1.5 rounded-full" style={{ backgroundColor: `${themeColor}15` }}>
                      <Check size={14} color={themeColor} />
                      {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                      <Text className="text-xs font-semibold ml-1" style={{ color: themeColor }}>Friends</Text>
                    </View>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          )}

          {/* Invite unmatched contacts */}
          {unmatched.length > 0 && (
            <View className="mt-2">
              <Animated.View entering={FadeInDown.delay(100)} className="px-5 pt-4 pb-2">
                {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                <Text className="text-base font-bold" style={{ color: colors.text }}>
                  Invite your friends
                </Text>
              </Animated.View>
              {/* INVARIANT_ALLOW_SMALL_MAP */}
              {unmatched.map((contact, index) => {
                const isInvited = invitedContacts.has(contact.name);
                return (
                  <Animated.View key={`invite-${index}`} entering={FadeInDown.delay(index * 20)}>
                    <View className="flex-row items-center px-5 py-3">
                      <View
                        className="w-11 h-11 rounded-full items-center justify-center"
                        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                        style={{ backgroundColor: isDark ? "#2C2C2E" : "rgba(0,0,0,0.06)" }}
                      >
                        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                        <Text className="text-base font-medium" style={{ color: colors.textSecondary }}>
                          {contact.name[0]?.toUpperCase() ?? "?"}
                        </Text>
                      </View>
                      <View className="flex-1 ml-3">
                        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                        <Text className="text-base font-medium" style={{ color: colors.text }} numberOfLines={1}>
                          {contact.name}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleInvite(contact)}
                        className="flex-row items-center px-3 py-1.5 rounded-full"
                        /* INVARIANT_ALLOW_INLINE_OBJECT_PROP */
                        style={{
                          backgroundColor: isInvited
                            ? isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"
                            : `${themeColor}15`,
                        }}
                      >
                        {isInvited ? (
                          <>
                            <Check size={14} color={colors.textSecondary} />
                            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                            <Text className="text-xs font-semibold ml-1" style={{ color: colors.textSecondary }}>Invited</Text>
                          </>
                        ) : (
                          <>
                            <Send size={14} color={themeColor} />
                            {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
                            <Text className="text-xs font-semibold ml-1" style={{ color: themeColor }}>Invite</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          )}
        </>
      )}

      {/* Empty state after scan */}
      {hasScanned && matches.length === 0 && unmatched.length === 0 && !isScanning && (
        <View className="py-6 items-center px-8">
          {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
          <Text className="text-sm text-center" style={{ color: colors.textSecondary }}>
            No contacts found. Try searching above or invite friends directly!
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: colors.background }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b" style={{ borderBottomColor: colors.separator }}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            router.back();
          }}
          className="w-10 h-10 items-center justify-center"
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <Text className="text-lg font-semibold" style={{ color: colors.text }}>
          Find Friends
        </Text>
        <View className="w-10" />
      </View>

      <FriendDiscoverySurface>
        {contactsSection}
      </FriendDiscoverySurface>
    </SafeAreaView>
  );
}
