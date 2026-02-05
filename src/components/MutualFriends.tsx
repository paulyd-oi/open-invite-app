import React from "react";
import { View, Text, Pressable, Image, ScrollView } from "react-native";
import { Users } from "@/ui/icons";
import Animated, { FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";

import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { api } from "@/lib/api";

// Define types locally to avoid import issues
interface FriendUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface GetMutualFriendsResponse {
  mutualFriends: FriendUser[];
  count: number;
}

interface MutualFriendsProps {
  userId: string;
  userName?: string | null;
}

export function MutualFriends({ userId, userName }: MutualFriendsProps) {
  const { themeColor, isDark, colors } = useTheme();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();

  const isOwnProfile = userId === session?.user?.id;

  // Fetch mutual friends
  const { data: mutualData, isLoading } = useQuery({
    queryKey: ["friends", userId, "mutual"],
    queryFn: () => api.get<GetMutualFriendsResponse>(`/api/friends/${userId}/mutual`),
    enabled: isAuthedForNetwork(bootStatus, session) && !!userId,
  });

  const mutualFriends = mutualData?.mutualFriends ?? [];
  const count = mutualData?.count ?? 0;

  // Don't show for own profile or if no mutual friends
  if (isOwnProfile || isLoading || count === 0) return null;

  return (
    <Animated.View entering={FadeIn}>
      <View
        className="rounded-2xl p-4"
        style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
      >
        <View className="flex-row items-center mb-3">
          <Users size={18} color={themeColor} />
          <Text className="text-sm font-semibold ml-2" style={{ color: colors.text }}>
            {count} Mutual Friend{count !== 1 ? "s" : ""}
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 8 }}
        >
          {mutualFriends.slice(0, 10).map((friend, index) => (
            <Animated.View key={friend.id} entering={FadeIn.delay(index * 50)}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  if (__DEV__) console.log('[P0_PROFILE_AUDIT] source=mutual-friends target=/user/[id] idType=userId');
                  router.push(`/user/${friend.id}` as any);
                }}
                className="items-center mr-3"
                style={{ width: 60 }}
              >
                <View
                  className="w-14 h-14 rounded-full overflow-hidden border-2"
                  style={{ borderColor: `${themeColor}40` }}
                >
                  {friend.image ? (
                    <Image source={{ uri: friend.image }} className="w-full h-full" />
                  ) : (
                    <View
                      className="w-full h-full items-center justify-center"
                      style={{ backgroundColor: `${themeColor}20` }}
                    >
                      <Text className="text-lg font-bold" style={{ color: themeColor }}>
                        {friend.name?.[0] ?? "?"}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  className="text-xs mt-1 text-center"
                  style={{ color: colors.textSecondary }}
                  numberOfLines={1}
                >
                  {friend.name?.split(" ")[0] ?? "Friend"}
                </Text>
              </Pressable>
            </Animated.View>
          ))}

          {count > 10 && (
            <View className="items-center justify-center w-14">
              <View
                className="w-14 h-14 rounded-full items-center justify-center"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
              >
                <Text className="font-semibold" style={{ color: colors.textSecondary }}>
                  +{count - 10}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Animated.View>
  );
}
