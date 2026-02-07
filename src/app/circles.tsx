import React, { useState, useEffect, useRef } from "react";
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
import { Users, Plus, ChevronLeft, BellOff } from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import BottomNavigation from "@/components/BottomNavigation";
import { CreateCircleModal } from "@/components/CreateCircleModal";
import { CircleCard } from "@/components/CircleCard";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { isEmailGateActive } from "@/lib/emailVerificationGate";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { useEntitlements, useIsPro, canCreateCircle, type PaywallContext } from "@/lib/entitlements";
import { loadGuidanceState, shouldShowEmptyGuidanceSync, markGuidanceComplete, setGuidanceUserId } from "@/lib/firstSessionGuidance";
import { type GetCirclesResponse, type Circle, type GetFriendsResponse, type Friendship } from "@/shared/contracts";
import { devLog, devError } from "@/lib/devLog";
import { safeToast } from "@/lib/safeToast";

export default function CirclesScreen() {
  const router = useRouter();
  const { themeColor, colors } = useTheme();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const queryClient = useQueryClient();
  const [showCreateCircle, setShowCreateCircle] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [paywallContext, setPaywallContext] = useState<PaywallContext | null>(null);
  const [guidanceLoaded, setGuidanceLoaded] = useState(false);
  const renderVersion = useRef(0);
  const { data: entitlements, isLoading: entitlementsLoading } = useEntitlements();

  // Load guidance state when user ID is available
  useEffect(() => {
    setGuidanceUserId(session?.user?.id ?? null);
    loadGuidanceState().then(() => setGuidanceLoaded(true));
  }, [session?.user?.id]);

  const { data, isLoading } = useQuery({
    queryKey: ["circles"],
    queryFn: () => api.get<GetCirclesResponse>("/api/circles"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  const { data: friendsData } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<GetFriendsResponse>("/api/friends"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  // Leave circle confirmation state
  const [showLeaveCircleConfirm, setShowLeaveCircleConfirm] = useState(false);
  const [circleToLeave, setCircleToLeave] = useState<{ id: string; name: string } | null>(null);

  // Pin circle mutation
  const pinCircleMutation = useMutation({
    mutationFn: (circleId: string) => {
      devLog("[P1_CIRCLES_CARD]", "action=start", "type=pin", `circleId=${circleId}`);
      return api.put(`/api/circles/${circleId}/pin`, {});
    },
    onMutate: async (circleId: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["circles"] });
      
      // Snapshot previous value
      const previousCircles = queryClient.getQueryData(["circles"]);
      
      // Optimistically update cache
      queryClient.setQueryData(["circles"], (old: any) => {
        if (!old?.circles) return old;
        const circles = old.circles.map((c: Circle) => {
          if (c.id === circleId) {
            return { ...c, isPinned: !c.isPinned };
          }
          return c;
        });
        // Sort pinned circles first
        circles.sort((a: Circle, b: Circle) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return 0;
        });
        return { ...old, circles };
      });
      
      return { previousCircles };
    },
    onSuccess: (_, circleId) => {
      devLog("[P1_CIRCLES_CARD]", "action=success", "type=pin", `circleId=${circleId}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      renderVersion.current += 1;
      if (__DEV__) devLog('[P2_CIRCLES_RERENDER_SOT]', 'pin complete, renderVersion=' + renderVersion.current, 'circleId=' + circleId);
      queryClient.invalidateQueries({ queryKey: ["circles"] });
    },
    onError: (error, circleId, context) => {
      devError("[P1_CIRCLES_CARD]", "action=failure", "type=pin", `circleId=${circleId}`, `error=${error}`);
      // Revert optimistic update
      if (context?.previousCircles) {
        queryClient.setQueryData(["circles"], context.previousCircles);
      }
      safeToast.error("Oops", "Could not pin group");
    },
  });

  // Leave circle mutation
  const leaveCircleMutation = useMutation({
    mutationFn: (circleId: string) => {
      devLog("[P1_CIRCLES_CARD]", "action=start", "type=delete", `circleId=${circleId}`);
      return api.delete(`/api/circles/${circleId}/leave`);
    },
    onMutate: async (circleId: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["circles"] });
      
      // Snapshot previous value
      const previousCircles = queryClient.getQueryData(["circles"]);
      
      // Optimistically remove from cache
      queryClient.setQueryData(["circles"], (old: any) => {
        if (!old?.circles) return old;
        return {
          ...old,
          circles: old.circles.filter((c: Circle) => c.id !== circleId),
        };
      });
      
      return { previousCircles };
    },
    onSuccess: (_, circleId) => {
      devLog("[P1_CIRCLES_CARD]", "action=success", "type=delete", `circleId=${circleId}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      renderVersion.current += 1;
      if (__DEV__) devLog('[P2_CIRCLES_RERENDER_SOT]', 'leave complete, renderVersion=' + renderVersion.current, 'circleId=' + circleId);
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      setShowLeaveCircleConfirm(false);
      setCircleToLeave(null);
    },
    onError: (error, circleId, context) => {
      devError("[P1_CIRCLES_CARD]", "action=failure", "type=delete", `circleId=${circleId}`, `error=${error}`);
      // Revert optimistic update
      if (context?.previousCircles) {
        queryClient.setQueryData(["circles"], context.previousCircles);
      }
      safeToast.error("Oops", "Could not leave group");
    },
  });

  const circles = data?.circles ?? [];
  const friends = friendsData?.friends ?? [];

  // [P1_CIRCLES_RENDER] Proof log: render with current circles state
  if (__DEV__ && circles.length > 0) {
    const renderSnapshot = circles.slice(0, 5).map(c => ({
      id: c.id.slice(0, 6),
      name: c.name,
      isPinned: c.isPinned ?? false,
      isMuted: c.isMuted ?? false,
    }));
    devLog("[P1_CIRCLES_RENDER]", "list render", { count: circles.length, first5: renderSnapshot });
  }

  const createCircleMutation = useMutation({
    mutationFn: ({ name, emoji, memberIds }: { name: string; emoji: string; memberIds: string[] }) =>
      api.post<{ circle: Circle }>("/api/circles", { name, emoji, memberIds }),
    onSuccess: (response: { circle: Circle }) => {
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      setShowCreateCircle(false);
      // Mark guidance complete - user has created their first circle
      markGuidanceComplete("join_circle");
      router.push(`/circle/${response.circle.id}` as any);
    },
    onError: (error: any) => {
      devError("Failed to create circle:", error);
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["circles"] });
    setRefreshing(false);
  };

  const handleCreateCircle = async () => {
    // CRITICAL: Don't gate while entitlements loading - prevents false gates for Pro users
    if (entitlementsLoading) {
      setShowCreateCircle(true);
      return;
    }
    
    const limit = await canCreateCircle(entitlements);
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
    <SafeAreaView testID="circles-screen" className="flex-1" style={{ backgroundColor: colors.background }}>
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
        <View className="px-6 pt-6 pb-6">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Pressable
                onPress={() => router.back()}
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: colors.surface }}
              >
                <ChevronLeft size={24} color={colors.text} />
              </Pressable>
              <View>
                <Text className="text-2xl font-bold tracking-tight" style={{ color: colors.text }}>
                  Groups
                </Text>
                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                  Plan events together
                </Text>
              </View>
            </View>
            <Pressable
              testID="circles-create-button"
              onPress={handleCreateCircle}
              className="flex-row items-center px-4 py-2 rounded-full"
              style={{ backgroundColor: themeColor }}
            >
              <Plus size={16} color="white" />
              <Text className="text-white font-semibold ml-1">New</Text>
            </Pressable>
          </View>
        </View>

        <View testID="circles-list" className="px-6 pb-24">
          {isLoading ? (
            <View className="py-12">
              <Text className="text-center" style={{ color: colors.textTertiary }}>
                Syncing your groups…
              </Text>
            </View>
          ) : circles.length === 0 ? (
            <View className="py-12 items-center">
              <View className="w-20 h-20 rounded-full items-center justify-center mb-4" style={{ backgroundColor: colors.surfaceElevated }}>
                <Users size={32} color={colors.textTertiary} />
              </View>
              <Text className="text-lg font-semibold mb-2" style={{ color: colors.text }}>
                No groups yet
              </Text>
              {guidanceLoaded && !isEmailGateActive(session) && shouldShowEmptyGuidanceSync("join_circle") && (
                <Text className="text-center mb-4 px-8" style={{ color: colors.textSecondary }}>
                  Groups keep invites simple and private.
                </Text>
              )}
              <Pressable onPress={handleCreateCircle} className="px-6 py-3 rounded-full" style={{ backgroundColor: themeColor }}>
                <Text className="text-white font-semibold">Create your first group</Text>
              </Pressable>
            </View>
          ) : (
            <GestureHandlerRootView>
              {circles.map((circle: Circle, index: number) => (
                <CircleCard
                  key={circle.id}
                  circle={circle}
                  index={index}
                  onPin={(id) => pinCircleMutation.mutate(id)}
                  onDelete={(id) => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    setCircleToLeave({ id, name: circle.name });
                    setShowLeaveCircleConfirm(true);
                  }}
                />
              ))}
            </GestureHandlerRootView>
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

      {/* Leave Circle Confirmation Modal */}
      <ConfirmModal
        visible={showLeaveCircleConfirm}
        onCancel={() => {
          setShowLeaveCircleConfirm(false);
          setCircleToLeave(null);
        }}
        onConfirm={() => {
          if (leaveCircleMutation.isPending) {
            if (__DEV__) devLog('[P1_DOUBLE_SUBMIT_GUARD]', 'leaveCircle ignored, circleId=' + circleToLeave?.id);
            return;
          }
          if (circleToLeave) {
            leaveCircleMutation.mutate(circleToLeave.id);
          }
        }}
        title="Leave Group?"
        message={`Are you sure you want to leave ${circleToLeave?.name ?? "this group"}?`}
        confirmText="Leave"
        isDestructive
      />
    </SafeAreaView>
  );
}
