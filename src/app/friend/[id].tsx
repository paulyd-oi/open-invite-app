/**
 * friend/[id].tsx - Friend Profile Route Wrapper (SSOT Redirect)
 * 
 * [P0_PROFILE_SOT] This route is a thin wrapper that redirects to the canonical
 * profile screen at /user/[userId]. This maintains route compatibility while
 * ensuring ONE profile implementation handles all profile viewing.
 * 
 * The friendshipId is used to look up the friend's userId, then redirects to
 * the canonical profile route with a source param for telemetry.
 */
import React, { useEffect } from "react";
import { View, Text, ActivityIndicator, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, Stack, Redirect } from "expo-router";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { devLog } from "@/lib/devLog";
import { type FriendUser } from "@/shared/contracts";

/**
 * [P0_PROFILE_SOT] Friend Profile Wrapper
 * 
 * This component:
 * 1. Takes a friendshipId from the route param
 * 2. Fetches the friend's userId via the friendship endpoint
 * 3. Redirects to /user/[userId]?source=friend-profile
 * 
 * The canonical ProfileScreen at /user/[id] handles both friend and non-friend
 * states, gating features based on relationship status.
 */
export default function FriendProfileRedirect() {
  const { id: friendshipId } = useLocalSearchParams<{ id: string }>();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const { themeColor, colors } = useTheme();

  // [P0_FRIEND_REDIRECT_GUARD] Track whether friendshipId is valid
  const hasValidId = !!friendshipId && friendshipId.trim().length > 0;

  // Fetch friend data to get the userId (disabled when id is missing)
  const { data, isLoading, error } = useQuery({
    queryKey: ["friendshipLookup", friendshipId],
    queryFn: () => api.get<{ events: any[]; friend: FriendUser }>(`/api/friends/${friendshipId}/events`),
    enabled: isAuthedForNetwork(bootStatus, session) && hasValidId,
  });

  const friendUserId = data?.friend?.id;

  // [P0_PROFILE_SOT] DEV-only proof log
  useEffect(() => {
    if (__DEV__ && data?.friend) {
      devLog("[P0_PROFILE_SOT]", {
        routeSource: "friend/[id]",
        friendshipId,
        resolvedUserId: friendUserId,
        redirectTarget: `/user/${friendUserId}?source=friend-profile`,
        action: "redirecting_to_canonical_profile",
      });
    }
  }, [data, friendshipId, friendUserId]);

  // [P0_FRIEND_REDIRECT_GUARD] Show error UI if friendshipId is missing/invalid
  if (!hasValidId) {
    if (__DEV__) console.log('[P0_FRIEND_REDIRECT_GUARD]', { id: friendshipId, reason: 'missing_id' });
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Profile", headerStyle: { backgroundColor: colors.background } }} />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-lg font-semibold text-center mb-2" style={{ color: colors.text }}>
            Something went wrong
          </Text>
          <Text className="text-sm text-center mb-6" style={{ color: colors.textSecondary }}>
            Could not load this profile.
          </Text>
          <Pressable
            onPress={() => router.replace('/friends')}
            className="px-6 py-3 rounded-full"
            style={{ backgroundColor: themeColor }}
          >
            <Text className="text-white font-semibold">Back to Friends</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Redirect to canonical profile once we have the userId
  if (friendUserId) {
    return <Redirect href={`/user/${friendUserId}?source=friend-profile` as any} />;
  }

  // Loading state while fetching friendship data
  if (isLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Profile", headerStyle: { backgroundColor: colors.background } }} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={themeColor} />
          <Text className="mt-4 text-sm" style={{ color: colors.textSecondary }}>
            Loading profile...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  // [QA-8] Suppress login flash: don't show error/sign-in until boot resolves
  if (!session && bootStatus !== 'loggedOut') return null;
  if (error || !session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Profile", headerStyle: { backgroundColor: colors.background } }} />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-4xl mb-4">😕</Text>
          <Text className="text-lg font-semibold text-center mb-2" style={{ color: colors.text }}>
            Couldn't load profile
          </Text>
          <Text className="text-sm text-center" style={{ color: colors.textSecondary }}>
            {!session ? "Please sign in to view this profile" : "This friend may have been removed"}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Fallback loading (shouldn't reach here normally)
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "Profile" }} />
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={themeColor} />
      </View>
    </SafeAreaView>
  );
}
