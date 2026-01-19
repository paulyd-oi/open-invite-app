import React from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  Image,
  ScrollView,
} from "react-native";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  User,
  Building2,
  Check,
  Plus,
  Settings,
  BadgeCheck,
  ChevronRight,
} from "@/ui/icons";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api";
import type { Profile, GetProfilesResponse, SwitchProfileResponse } from "../../shared/contracts";

interface ProfileSwitcherProps {
  visible: boolean;
  onClose: () => void;
}

export function ProfileSwitcher({ visible, onClose }: ProfileSwitcherProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Fetch profiles directly
  const { data: profilesData } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api.get<GetProfilesResponse>("/api/profiles"),
    staleTime: 1000 * 60 * 5,
  });

  const profiles = profilesData?.profiles ?? [];
  const activeProfileId = profilesData?.activeProfileId ?? null;

  // Switch profile mutation
  const switchMutation = useMutation({
    mutationFn: async (profileId: string | null) => {
      return api.post<SwitchProfileResponse>("/api/profiles/switch", { profileId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["businesses", "owned"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const handleSelectProfile = async (profile: Profile) => {
    if (switchMutation.isPending) return;

    const newProfileId = profile.type === "personal" ? null : profile.id;

    // Don't switch if already active
    if (newProfileId === activeProfileId) {
      onClose();
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await switchMutation.mutateAsync(newProfileId);
      onClose();
    } catch (error) {
      console.error("Failed to switch profile:", error);
    }
  };

  const handleAccountSettings = () => {
    onClose();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/account-center");
  };

  const personalProfile = profiles.find((p) => p.type === "personal");
  const businessProfiles = profiles.filter((p) => p.type === "business");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1"
        onPress={onClose}
      >
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
              className="bg-zinc-900 rounded-t-3xl overflow-hidden"
            >
              {/* Header */}
              <View className="px-5 pt-4 pb-3 border-b border-zinc-800">
                <View className="w-10 h-1 bg-zinc-700 rounded-full self-center mb-3" />
                <Text className="text-white text-lg font-semibold text-center">
                  Switch Profile
                </Text>
              </View>

              <ScrollView
                className="max-h-96"
                showsVerticalScrollIndicator={false}
              >
                {/* Personal Profile */}
                {personalProfile && (
                  <View className="px-4 pt-4">
                    <Text className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-2 px-1">
                      Personal
                    </Text>
                    <ProfileItem
                      profile={personalProfile}
                      isActive={activeProfileId === null}
                      onSelect={() => handleSelectProfile(personalProfile)}
                      isSwitching={switchMutation.isPending}
                    />
                  </View>
                )}

                {/* Business Profiles */}
                {businessProfiles.length > 0 && (
                  <View className="px-4 pt-4">
                    <Text className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-2 px-1">
                      Businesses
                    </Text>
                    {businessProfiles.map((profile) => (
                      <ProfileItem
                        key={profile.id}
                        profile={profile}
                        isActive={activeProfileId === profile.id}
                        onSelect={() => handleSelectProfile(profile)}
                        isSwitching={switchMutation.isPending}
                      />
                    ))}
                  </View>
                )}

                {/* Actions */}
                <View className="px-4 pt-4 pb-2">
                  <Text className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-2 px-1">
                    Actions
                  </Text>

                  {/* Account Center */}
                  <Pressable
                    onPress={handleAccountSettings}
                    className="flex-row items-center p-3 rounded-xl active:bg-zinc-800"
                  >
                    <View className="w-12 h-12 rounded-full bg-zinc-800 items-center justify-center">
                      <Settings size={22} color="#a1a1aa" />
                    </View>
                    <View className="flex-1 ml-3">
                      <Text className="text-white font-medium">
                        Account Center
                      </Text>
                      <Text className="text-zinc-500 text-sm">
                        Manage all your profiles & settings
                      </Text>
                    </View>
                    <ChevronRight size={20} color="#71717a" />
                  </Pressable>
                </View>

                {/* Safe area padding */}
                <View className="h-8" />
              </ScrollView>
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

interface ProfileItemProps {
  profile: Profile;
  isActive: boolean;
  onSelect: () => void;
  isSwitching: boolean;
}

function ProfileItem({ profile, isActive, onSelect, isSwitching }: ProfileItemProps) {
  const isPersonal = profile.type === "personal";
  const isBusiness = profile.type === "business";

  return (
    <Pressable
      onPress={onSelect}
      disabled={isSwitching}
      className={`flex-row items-center p-3 rounded-xl mb-1 ${
        isActive ? "bg-zinc-800" : "active:bg-zinc-800/50"
      } ${isSwitching ? "opacity-50" : ""}`}
    >
      {/* Avatar */}
      {profile.image ? (
        <Image
          source={{ uri: profile.image }}
          className="w-12 h-12 rounded-full bg-zinc-800"
        />
      ) : (
        <View className="w-12 h-12 rounded-full bg-zinc-800 items-center justify-center">
          {isPersonal ? (
            <User size={24} color="#a1a1aa" />
          ) : (
            <Building2 size={24} color="#a1a1aa" />
          )}
        </View>
      )}

      {/* Info */}
      <View className="flex-1 ml-3">
        <View className="flex-row items-center">
          <Text className="text-white font-medium" numberOfLines={1}>
            {profile.name ?? "Personal"}
          </Text>
          {isBusiness && profile.isVerified && (
            <BadgeCheck size={16} color="#3b82f6" />
          )}
        </View>
        <Text className="text-zinc-500 text-sm" numberOfLines={1}>
          {isPersonal
            ? profile.handle ? `@${profile.handle}` : "Your personal profile"
            : `@${profile.handle}`}
        </Text>
        {isBusiness && (
          <Text className="text-zinc-600 text-xs capitalize mt-0.5">
            {profile.role}
          </Text>
        )}
      </View>

      {/* Active indicator */}
      {isActive && (
        <View className="w-6 h-6 rounded-full bg-emerald-500 items-center justify-center">
          <Check size={14} color="white" />
        </View>
      )}
    </Pressable>
  );
}
