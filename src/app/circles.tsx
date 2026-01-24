import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Users, Plus } from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import BottomNavigation from "@/components/BottomNavigation";
import { CreateCircleModal } from "@/components/CreateCircleModal";
import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { useEntitlements, canCreateCircle, type PaywallContext } from "@/lib/entitlements";
import { type GetCirclesResponse, type Circle, type GetFriendsResponse, type Friendship } from "@/shared/contracts";

export default function CirclesScreen() {
  const router = useRouter();
  const { themeColor, colors } = useTheme();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const queryClient = useQueryClient();
  const [showCreateCircle, setShowCreateCircle] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [paywallContext, setPaywallContext] = useState<PaywallContext | null>(null);
  const entitlements = useEntitlements();

  const { data, isLoading } = useQuery({
    queryKey: ["circles"],
    queryFn: () => api.get<GetCirclesResponse>("/api/circles"),
    enabled: bootStatus === 'authed',
  });

  const { data: friendsData } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: bootStatus === 'authed',
  });

  const circles = data?.circles ?? [];
  const friends = friendsData?.friends ?? [];

  const createCircleMutation = useMutation({
    mutationFn: ({ name, emoji, memberIds }: { name: string; emoji: string; memberIds: string[] }) =>
      api.post<{ circle: Circle }>("/api/circles", { name, emoji, memberIds }),
    onSuccess: (response: { circle: Circle }) => {
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      setShowCreateCircle(false);
      router.push(`/circle/${response.circle.id}` as any);
    },
    onError: (error: any) => {
      console.error("Failed to create circle:", error);
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["circles"] });
    setRefreshing(false);
  };

  const handleCreateCircle = async () => {
    const limit = await canCreateCircle(entitlements.data);
    if (!limit.allowed && limit.context) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setPaywallContext(limit.context);
      return;
    }
    setShowCreateCircle(true);
  };

  const handleCircleTap = (circleId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/circle/${circleId}` as any);
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={themeColor}
            colors={[themeColor]}
          />
        }
      >
        <View className="px-6 pt-6 pb-4">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-3xl font-bold tracking-tight" style={{ color: colors.text }}>
                Groups
              </Text>
              <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                Plan events together
              </Text>
            </View>
            <Pressable
              onPress={handleCreateCircle}
              className="flex-row items-center px-4 py-2 rounded-full"
              style={{ backgroundColor: themeColor }}
            >
              <Text className="text-white font-semibold">Create</Text>
            </Pressable>
          </View>
        </View>

        <View className="px-6 pb-24">
          {isLoading ? (
            <View className="py-12">
              <Text className="text-center" style={{ color: colors.textTertiary }}>
                Loading groups...
              </Text>
            </View>
          ) : circles.length === 0 ? (
            <View className="py-12 items-center">
              <View className="w-20 h-20 rounded-full items-center justify-center mb-4" style={{ backgroundColor: colors.surfaceElevated }}>
                <Users size={32} color={colors.textTertiary} />
              </View>
              <Text className="text-lg font-semibold mb-2" style={{ color: colors.text }}>
                No Groups Yet
              </Text>
              <Text className="text-center mb-6 px-8" style={{ color: colors.textSecondary }}>
                Groups help you plan with the same people
              </Text>
              <Pressable onPress={handleCreateCircle} className="px-6 py-3 rounded-full" style={{ backgroundColor: themeColor }}>
                <Text className="text-white font-semibold">Create Your First Group</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {circles.map((circle: Circle, index: number) => (
                <Animated.View key={circle.id} entering={FadeInDown.delay(index * 50)}>
                  <Pressable
                    onPress={() => handleCircleTap(circle.id)}
                    className="rounded-2xl p-4 mb-3"
                    style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  >
                    <View className="flex-row items-center">
                      <Text className="text-3xl mr-3">{circle.emoji}</Text>
                      <View className="flex-1">
                        <Text className="text-lg font-semibold" style={{ color: colors.text }}>
                          {circle.name}
                        </Text>
                        <Text className="text-sm" style={{ color: colors.textSecondary }}>
                          {circle.members?.length ?? 0} member{(circle.members?.length ?? 0) !== 1 ? 's' : ''}
                          {circle.unreadCount ? ` • ${circle.unreadCount} unread` : ''}
                        </Text>
                      </View>
                      {circle.isPinned && (
                        <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: themeColor + "15" }}>
                          <Users size={16} color={themeColor} />
                        </View>
                      )}
                    </View>
                  </Pressable>
                </Animated.View>
              ))}
            </>
          )}
        </View>
      </ScrollView>

      <BottomNavigation />

      {showCreateCircle && (
        <CreateCircleModal
          visible={showCreateCircle}
          onClose={() => setShowCreateCircle(false)}
          onConfirm={(name, emoji, memberIds) => {
            createCircleMutation.mutate({ name, emoji, memberIds });
          }}
          friends={friends.filter((f: Friendship) => f.friend != null).map((f: Friendship) => ({
            id: f.id,
            friendId: f.friendId,
            friend: f.friend,
          }))}
          isLoading={createCircleMutation.isPending}
        />
      )}

      {paywallContext && (
        <PaywallModal
          visible={!!paywallContext}
          onClose={() => setPaywallContext(null)}
          context={paywallContext}
        />
      )}
    </SafeAreaView>
  );
}
