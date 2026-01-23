import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronLeft, Search, Shield, Award } from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { checkAdminStatus, searchUsers, listBadges, getUserBadges, grantUserBadge, revokeUserBadge, type UserSearchResult, type BadgeDef, type GrantedBadge } from "@/lib/adminApi";
import { useTheme } from "@/lib/ThemeContext";
import { BACKEND_URL } from "@/lib/config";

export default function AdminConsole() {
  const router = useRouter();
  const { isDark, colors, themeColor } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [availableBadges, setAvailableBadges] = useState<BadgeDef[]>([]);
  const [userBadges, setUserBadges] = useState<GrantedBadge[]>([]);
  const [isLoadingBadges, setIsLoadingBadges] = useState(false);
  const [badgeActionLoading, setBadgeActionLoading] = useState<string | null>(null);
  const [badgeError, setBadgeError] = useState<string | null>(null);

  // Check admin status and redirect if not admin
  const { data: adminStatus, isLoading: adminLoading } = useQuery({
    queryKey: ["adminStatus"],
    queryFn: checkAdminStatus,
    retry: false,
  });

  // Redirect non-admins back to settings
  React.useEffect(() => {
    if (!adminLoading && adminStatus && !adminStatus.isAdmin) {
      if (__DEV__) {
        console.log("[Admin] Access denied - redirecting to settings");
      }
      router.replace("/settings");
    }
  }, [adminStatus, adminLoading, router]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || isSearching) return;

    setIsSearching(true);
    setSelectedUser(null); // Clear selected user on new search
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    try {
      const response = await searchUsers(searchQuery);
      setSearchResults(response.users);
    } catch (error) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleUserSelect = async (user: UserSearchResult) => {
    setSelectedUser(user);
    setBadgeError(null);
    setIsLoadingBadges(true);
    
    try {
      // Load available badges and user's current badges in parallel
      const [badgesResponse, userBadgesResponse] = await Promise.all([
        listBadges(),
        getUserBadges(user.id)
      ]);
      
      setAvailableBadges(badgesResponse.badges);
      setUserBadges(userBadgesResponse.badges);
    } catch (error: any) {
      if (error?.status === 401 || error?.status === 403) {
        setBadgeError("Not authorized");
        router.replace("/settings");
      } else {
        setBadgeError("Failed to load badges - please try again");
      }
    } finally {
      setIsLoadingBadges(false);
    }
  };

  const handleBadgeToggle = async (badge: BadgeDef) => {
    if (!selectedUser || badgeActionLoading) return;
    
    const isGranted = userBadges.some(ub => ub.achievementId === badge.id);
    setBadgeActionLoading(badge.id);
    setBadgeError(null);
    
    try {
      let response;
      if (isGranted) {
        response = await revokeUserBadge(selectedUser.id, badge.id);
      } else {
        response = await grantUserBadge(selectedUser.id, badge.id);
      }
      
      if (response.success) {
        // Refresh user badges
        const userBadgesResponse = await getUserBadges(selectedUser.id);
        setUserBadges(userBadgesResponse.badges);
        
        if (response.message) {
          // Could show a toast here, but keeping it simple
        }
      } else {
        setBadgeError(response.message || "Action failed");
      }
    } catch (error: any) {
      if (error?.status === 401 || error?.status === 403) {
        setBadgeError("Not authorized");
        router.replace("/settings");
      } else {
        setBadgeError("Network error - please try again");
      }
    } finally {
      setBadgeActionLoading(null);
    }
  };

  // Show loading state during admin check or render null when redirecting
  if (adminLoading || !adminStatus?.isAdmin) {
    if (adminLoading) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View className="flex-1 items-center justify-center">
            <Text style={{ color: colors.textSecondary }} className="text-base">
              Checking permissions...
            </Text>
          </View>
        </SafeAreaView>
      );
    }
    // Redirecting - render null
    return null;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View
          entering={FadeInDown.delay(100).springify()}
          className="flex-row items-center justify-between px-4 py-2"
        >
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: colors.surface }}
          >
            <ChevronLeft size={20} color={colors.text} />
          </Pressable>

          <Text
            style={{ color: colors.text }}
            className="text-xl font-semibold tracking-tight"
          >
            Admin Console
          </Text>

          <View className="w-10 h-10" />
        </Animated.View>

        {/* Overview Section */}
        <Animated.View entering={FadeInDown.delay(150).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">OVERVIEW</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl p-4">
            <View className="flex-row items-center mb-3">
              <Shield size={20} color="#10B981" />
              <Text className="ml-2 text-base font-medium" style={{ color: colors.text }}>
                Platform Admin
              </Text>
            </View>
            
            <View className="space-y-2">
              <View className="flex-row justify-between">
                <Text style={{ color: colors.textSecondary }} className="text-sm">Backend URL</Text>
                <Text style={{ color: colors.text }} className="text-sm font-mono">{BACKEND_URL}</Text>
              </View>
              
              <View className="flex-row justify-between">
                <Text style={{ color: colors.textSecondary }} className="text-sm">App Version</Text>
                <Text style={{ color: colors.text }} className="text-sm">1.0.0</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Badges Management Section */}
        <Animated.View entering={FadeInDown.delay(175).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">BADGES</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
            <View className="p-4">
              <View className="flex-row items-center">
                <View 
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: `${themeColor}20` }}
                >
                  <Award size={20} color={themeColor} />
                </View>
                <View className="flex-1">
                  <Text style={{ color: colors.text }} className="text-base font-medium">
                    Manage User Badges
                  </Text>
                  <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">
                    Search for a user below to grant or revoke badges
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* User Lookup Section */}
        <Animated.View entering={FadeInDown.delay(200).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">USER LOOKUP</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
            <View className="p-4">
              <View className="flex-row space-x-2">
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search by name, username, or email..."
                  placeholderTextColor={colors.textTertiary}
                  className="flex-1 px-3 py-2 rounded-lg text-base"
                  style={{ 
                    backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB",
                    color: colors.text,
                    borderWidth: 1,
                    borderColor: isDark ? "#38383A" : "#E5E7EB",
                  }}
                  onSubmitEditing={handleSearch}
                  returnKeyType="search"
                />
                <Pressable
                  onPress={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-4 py-2 rounded-lg flex-row items-center justify-center"
                  style={{ 
                    backgroundColor: themeColor,
                    opacity: (isSearching || !searchQuery.trim()) ? 0.5 : 1,
                  }}
                >
                  <Search size={16} color="white" />
                  <Text className="ml-1 text-white font-medium">
                    {isSearching ? "..." : "Search"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <View>
                <View className="px-4 py-2 border-t" style={{ borderColor: isDark ? "#38383A" : "#F3F4F6" }}>
                  <Text style={{ color: colors.textSecondary }} className="text-xs font-medium">
                    {searchResults.length} RESULT{searchResults.length !== 1 ? "S" : ""}
                  </Text>
                </View>
                {searchResults.map((user, index) => (
                  <Pressable
                    key={user.id}
                    onPress={() => handleUserSelect(user)}
                    className="px-4 py-3 border-t"
                    style={{ 
                      borderColor: isDark ? "#38383A" : "#F3F4F6",
                      backgroundColor: selectedUser?.id === user.id ? `${themeColor}15` : 'transparent'
                    }}
                  >
                    <Text style={{ color: colors.text }} className="font-medium">
                      {user.name || "No name"}
                    </Text>
                    {user.username && (
                      <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">
                        @{user.username}
                      </Text>
                    )}
                    {user.email && (
                      <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">
                        {user.email}
                      </Text>
                    )}
                    {user.createdAt && (
                      <Text style={{ color: colors.textTertiary }} className="text-xs mt-1">
                        Created: {new Date(user.createdAt).toLocaleDateString()}
                      </Text>
                    )}
                    {selectedUser?.id === user.id && (
                      <Text style={{ color: themeColor }} className="text-xs mt-1 font-medium">
                        Selected
                      </Text>
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            {searchResults.length === 0 && searchQuery && !isSearching && (
              <View className="px-4 py-6 border-t" style={{ borderColor: isDark ? "#38383A" : "#F3F4F6" }}>
                <Text style={{ color: colors.textSecondary }} className="text-center">
                  No users found for "{searchQuery}"
                </Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* User Detail Section */}
        {selectedUser && (
          <Animated.View entering={FadeInDown.delay(250).springify()} className="mx-4 mt-6">
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">USER DETAIL</Text>
            <View style={{ backgroundColor: colors.surface }} className="rounded-2xl p-4 mb-4">
              <View className="mb-4">
                <Text style={{ color: colors.text }} className="text-lg font-semibold">
                  {selectedUser.name || "No name"}
                </Text>
                {selectedUser.username && (
                  <Text style={{ color: colors.textSecondary }} className="text-sm mt-1">
                    @{selectedUser.username}
                  </Text>
                )}
                {selectedUser.email && (
                  <Text style={{ color: colors.textSecondary }} className="text-sm mt-1">
                    {selectedUser.email}
                  </Text>
                )}
                <Text style={{ color: colors.textTertiary }} className="text-xs mt-1">
                  ID: {selectedUser.id}
                </Text>
              </View>
            </View>

            {/* Badges Section */}
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">BADGES</Text>
            <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
              {badgeError && (
                <View className="px-4 py-3 border-b" style={{ borderColor: isDark ? "#38383A" : "#F3F4F6" }}>
                  <Text style={{ color: "#EF4444" }} className="text-sm">
                    {badgeError}
                  </Text>
                </View>
              )}
              
              {isLoadingBadges ? (
                <View className="px-4 py-8">
                  <Text style={{ color: colors.textSecondary }} className="text-center">
                    Loading badges...
                  </Text>
                </View>
              ) : availableBadges.length === 0 ? (
                <View className="px-4 py-8">
                  <Text style={{ color: colors.textSecondary }} className="text-center">
                    No badges available
                  </Text>
                </View>
              ) : (
                <View>
                  {availableBadges.map((badge, index) => {
                    const isGranted = userBadges.some(ub => ub.achievementId === badge.id);
                    const isLoading = badgeActionLoading === badge.id;
                    
                    return (
                      <View
                        key={badge.id}
                        className="px-4 py-3"
                        style={{ 
                          borderBottomWidth: index < availableBadges.length - 1 ? 1 : 0,
                          borderColor: isDark ? "#38383A" : "#F3F4F6" 
                        }}
                      >
                        <View className="flex-row items-center justify-between">
                          <View className="flex-1 mr-3">
                            <View className="flex-row items-center mb-1">
                              <Text className="text-lg mr-2">{badge.emoji}</Text>
                              <Text style={{ color: colors.text }} className="font-medium">
                                {badge.name}
                              </Text>
                              <View 
                                className="ml-2 px-2 py-0.5 rounded"
                                style={{ backgroundColor: `${badge.tierColor}20` }}
                              >
                                <Text 
                                  style={{ color: badge.tierColor }} 
                                  className="text-xs font-medium"
                                >
                                  {badge.tier}
                                </Text>
                              </View>
                            </View>
                            {badge.description && (
                              <Text style={{ color: colors.textSecondary }} className="text-sm">
                                {badge.description}
                              </Text>
                            )}
                            <Text 
                              style={{ color: isGranted ? "#10B981" : colors.textTertiary }} 
                              className="text-xs mt-1 font-medium"
                            >
                              {isGranted ? "Granted" : "Not granted"}
                            </Text>
                          </View>
                          
                          <Pressable
                            onPress={() => handleBadgeToggle(badge)}
                            disabled={isLoading}
                            className="px-3 py-1.5 rounded-lg"
                            style={{ 
                              backgroundColor: isGranted ? "#EF444420" : `${themeColor}20`,
                              opacity: isLoading ? 0.5 : 1
                            }}
                          >
                            <Text 
                              className="text-sm font-medium"
                              style={{ color: isGranted ? "#EF4444" : themeColor }}
                            >
                              {isLoading ? "..." : (isGranted ? "Revoke" : "Grant")}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {/* Admin Endpoints Status */}
        <Animated.View entering={FadeInDown.delay(250).springify()} className="mx-4 mt-6 mb-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">STATUS</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl p-4">
            <Text style={{ color: "#10B981" }} className="text-sm font-medium">
              ✓ Admin endpoints available
            </Text>
            <Text style={{ color: colors.textSecondary }} className="text-xs mt-1">
              Connected to {BACKEND_URL}
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}