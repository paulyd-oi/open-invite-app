/**
 * Find Friends Screen — Contact matching + SMS invites.
 *
 * Flow:
 * 1. Request contacts permission
 * 2. Hash and match against backend
 * 3. Show matched users (with Add Friend CTA)
 * 4. Show unmatched contacts (with Invite via SMS CTA)
 *
 * Accessible from: post-onboarding, Friends tab header, Settings
 * [GROWTH_P4]
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Linking,
  Share,
  SectionList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import * as Contacts from "expo-contacts";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useMutation } from "@tanstack/react-query";
import {
  ChevronLeft,
  UserPlus,
  Send,
  Check,
  Users,
} from "@/ui/icons";

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

  const [permissionStatus, setPermissionStatus] = useState<"undetermined" | "granted" | "denied">("undetermined");
  const [isLoading, setIsLoading] = useState(false);
  const [matches, setMatches] = useState<ContactMatchUser[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedContact[]>([]);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [invitedContacts, setInvitedContacts] = useState<Set<string>>(new Set());
  const [hasScanned, setHasScanned] = useState(false);

  // Check existing permission on mount
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
    setIsLoading(true);
    try {
      const result = await matchContacts();
      setMatches(result.matches);
      setUnmatched(result.unmatched.slice(0, 100)); // Cap display list
      setHasScanned(true);
      if (__DEV__) devLog("[FIND_FRIENDS] scan complete", result.matches.length, "matches");
    } catch (err) {
      if (__DEV__) devLog("[FIND_FRIENDS] scan error", err);
      safeToast.error("Couldn't scan contacts", "Please try again.");
    } finally {
      setIsLoading(false);
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
    if (sentRequests.has(userId)) return;
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

  // ── Permission prompt ────────────────────────────────────────────────

  if (permissionStatus !== "granted" && !hasScanned) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView edges={["top"]} className="flex-1">
          {/* Header */}
          <View className="flex-row items-center px-4 py-3">
            <Pressable onPress={() => router.back()} hitSlop={12} className="p-2">
              <ChevronLeft size={24} color={colors.text} />
            </Pressable>
            <Text style={{ color: colors.text }} className="text-lg font-bold ml-2">
              Find Friends
            </Text>
          </View>

          <View className="flex-1 items-center justify-center px-8">
            <View
              className="w-20 h-20 rounded-full items-center justify-center mb-6"
              style={{ backgroundColor: `${themeColor}20` }}
            >
              <Users size={36} color={themeColor} />
            </View>
            <Text style={{ color: colors.text }} className="text-2xl font-bold text-center mb-3">
              Find friends on Open Invite
            </Text>
            <Text style={{ color: colors.textSecondary }} className="text-base text-center mb-8">
              See which of your contacts are already here and invite the rest.
            </Text>

            <Pressable
              onPress={requestPermissionAndScan}
              className="rounded-2xl py-4 px-8 mb-4"
              style={{ backgroundColor: themeColor }}
            >
              <Text className="text-white text-base font-semibold">
                Allow Contacts Access
              </Text>
            </Pressable>

            {permissionStatus === "denied" && (
              <Text style={{ color: colors.textTertiary }} className="text-sm text-center mt-2 px-4">
                Contacts access was denied. You can enable it in Settings.
              </Text>
            )}

            <Pressable onPress={() => router.back()} className="mt-4 py-2">
              <Text style={{ color: colors.textSecondary }} className="text-sm">
                Skip for now
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Loading state ────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={themeColor} />
        <Text style={{ color: colors.textSecondary }} className="mt-4 text-base">
          Scanning contacts...
        </Text>
      </View>
    );
  }

  // ── Results ──────────────────────────────────────────────────────────

  const newMatches = matches.filter((m) => !m.isFriend);
  const existingFriends = matches.filter((m) => m.isFriend);

  type SectionItem = (ContactMatchUser | UnmatchedContact) & { _type?: string };
  type Section = { title: string; data: SectionItem[]; type: "match" | "invite" };

  const sections: Section[] = [
    ...(newMatches.length > 0
      ? [{
          title: `${newMatches.length} friend${newMatches.length !== 1 ? "s" : ""} already on Open Invite`,
          data: newMatches as SectionItem[],
          type: "match" as const,
        }]
      : []),
    ...(existingFriends.length > 0
      ? [{
          title: "Already connected",
          data: existingFriends as SectionItem[],
          type: "match" as const,
        }]
      : []),
    ...(unmatched.length > 0
      ? [{
          title: "Invite your friends",
          data: unmatched as SectionItem[],
          type: "invite" as const,
        }]
      : []),
  ];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} className="flex-1">
        {/* Header */}
        <View className="flex-row items-center px-4 py-3" style={{ borderBottomWidth: 0.5, borderBottomColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }}>
          <Pressable onPress={() => router.back()} hitSlop={12} className="p-2">
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text style={{ color: colors.text }} className="text-lg font-bold ml-2">
            Find Friends
          </Text>
        </View>

        {/* Empty state */}
        {hasScanned && matches.length === 0 && unmatched.length === 0 && (
          <View className="flex-1 items-center justify-center px-8">
            <Text style={{ color: colors.textSecondary }} className="text-base text-center">
              No contacts found. Invite friends directly from the app!
            </Text>
          </View>
        )}

        {/* Results list */}
        {sections.length > 0 && (
          <SectionList
            sections={sections}
            keyExtractor={(item, index) => ("id" in item ? item.id : `invite-${index}`)}
            contentContainerStyle={{ paddingBottom: 40 }}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <Animated.View entering={FadeInDown.delay(100)} className="px-5 pt-6 pb-2">
                <Text style={{ color: colors.text }} className="text-base font-bold">
                  {section.title}
                </Text>
              </Animated.View>
            )}
            renderItem={({ item, index, section }: { item: SectionItem; index: number; section: Section }) => {
              if (section.type === "match") {
                const user = item as ContactMatchUser;
                const isSent = sentRequests.has(user.id) || user.isPending;
                const isAlreadyFriend = user.isFriend;
                return (
                  <Animated.View entering={FadeInDown.delay(index * 30)}>
                    <Pressable
                      onPress={() => router.push(`/profile/${user.id}` as any)}
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
                        <Text style={{ color: colors.text }} className="text-base font-medium" numberOfLines={1}>
                          {user.name ?? "Open Invite User"}
                        </Text>
                        {user.handle && (
                          <Text style={{ color: colors.textSecondary }} className="text-sm" numberOfLines={1}>
                            @{user.handle}
                          </Text>
                        )}
                      </View>
                      {isAlreadyFriend ? (
                        <View className="flex-row items-center px-3 py-1.5 rounded-full" style={{ backgroundColor: `${themeColor}15` }}>
                          <Check size={14} color={themeColor} />
                          <Text style={{ color: themeColor }} className="text-xs font-semibold ml-1">Friends</Text>
                        </View>
                      ) : isSent ? (
                        <View className="flex-row items-center px-3 py-1.5 rounded-full" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" }}>
                          <Check size={14} color={colors.textSecondary} />
                          <Text style={{ color: colors.textSecondary }} className="text-xs font-semibold ml-1">Sent</Text>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => handleAddFriend(user.id)}
                          className="flex-row items-center px-3 py-1.5 rounded-full"
                          style={{ backgroundColor: themeColor }}
                        >
                          <UserPlus size={14} color="#fff" />
                          <Text className="text-white text-xs font-semibold ml-1">Add</Text>
                        </Pressable>
                      )}
                    </Pressable>
                  </Animated.View>
                );
              }

              // Invite row
              const contact = item as UnmatchedContact;
              const isInvited = invitedContacts.has(contact.name);
              return (
                <Animated.View entering={FadeInDown.delay(index * 20)}>
                  <View className="flex-row items-center px-5 py-3">
                    <View
                      className="w-11 h-11 rounded-full items-center justify-center"
                      style={{ backgroundColor: isDark ? "#2C2C2E" : "rgba(0,0,0,0.06)" }}
                    >
                      <Text style={{ color: colors.textSecondary }} className="text-base font-medium">
                        {contact.name[0]?.toUpperCase() ?? "?"}
                      </Text>
                    </View>
                    <View className="flex-1 ml-3">
                      <Text style={{ color: colors.text }} className="text-base font-medium" numberOfLines={1}>
                        {contact.name}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleInvite(contact)}
                      className="flex-row items-center px-3 py-1.5 rounded-full"
                      style={{
                        backgroundColor: isInvited
                          ? isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"
                          : `${themeColor}15`,
                      }}
                    >
                      {isInvited ? (
                        <>
                          <Check size={14} color={colors.textSecondary} />
                          <Text style={{ color: colors.textSecondary }} className="text-xs font-semibold ml-1">Invited</Text>
                        </>
                      ) : (
                        <>
                          <Send size={14} color={themeColor} />
                          <Text style={{ color: themeColor }} className="text-xs font-semibold ml-1">Invite</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </Animated.View>
              );
            }}
          />
        )}
      </SafeAreaView>
    </View>
  );
}
