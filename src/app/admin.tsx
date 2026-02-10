import React, { useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { ChevronLeft, ChevronRight, Search, Shield, Megaphone } from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { 
  checkAdminStatus, 
  searchUsers, 
  getUserEntitlements,
  grantEntitlement,
  revokeEntitlement,
  getUserSubscriptionTier,
  type UserSearchResult, 
  type UserEntitlement,
  type AdminUserSubscriptionInfo,
} from "@/lib/adminApi";
import { useTheme } from "@/lib/ThemeContext";
import { BACKEND_URL } from "@/lib/config";
import { safeToast } from "@/lib/safeToast";

export default function AdminConsole() {
  const router = useRouter();
  // P0 FIX: Prevent redirect loop with ref
  const didRedirectRef = useRef(false);
  const { isDark, colors, themeColor } = useTheme();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const authed = isAuthedForNetwork(bootStatus, session);
  if (__DEV__ && !authed) devLog('[P13_NET_GATE] tag="adminStatus" blocked — not authed');
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  
  // Entitlements state
  const [userEntitlements, setUserEntitlements] = useState<UserEntitlement[]>([]);
  const [userPlan, setUserPlan] = useState<AdminUserSubscriptionInfo | null>(null);
  const [isLoadingEntitlements, setIsLoadingEntitlements] = useState(false);
  const [entitlementError, setEntitlementError] = useState<string | null>(null);
  const [entitlementActionLoading, setEntitlementActionLoading] = useState<string | null>(null);
  
  // Endpoint health state
  const [endpointHealth, setEndpointHealth] = useState<{
    adminMe: boolean | null;
  }>({ adminMe: null });

  // Check admin status and redirect if not admin
  const { data: adminStatus, isLoading: adminLoading } = useQuery({
    queryKey: ["adminStatus"],
    queryFn: checkAdminStatus,
    retry: false,
    enabled: authed,
  });

  // [P0_ADMIN_ROUTE] DEV proof logs for admin gating
  React.useEffect(() => {
    if (__DEV__) {
      devLog('[P0_ADMIN_ROUTE] mount', {
        route: '/admin',
        adminLoading,
        hasAdminStatus: !!adminStatus,
      });
    }
  }, []);

  React.useEffect(() => {
    if (__DEV__ && !adminLoading) {
      devLog('[P0_ADMIN_ROUTE] decision', {
        allowed: adminStatus?.isAdmin ?? false,
        reason: adminLoading ? 'loading' : (adminStatus?.isAdmin ? 'is_admin' : 'not_admin'),
        willRedirect: !adminLoading && adminStatus && !adminStatus.isAdmin && !didRedirectRef.current,
        target: !adminStatus?.isAdmin ? '/settings' : 'none',
      });
    }
    // Track endpoint health
    if (!adminLoading) {
      setEndpointHealth(prev => ({
        ...prev,
        adminMe: adminStatus?.isAdmin !== undefined,
      }));
    }
  }, [adminStatus, adminLoading]);

  // Redirect non-admins back to settings (ONCE only - prevent loop)
  React.useEffect(() => {
    if (!adminLoading && adminStatus && !adminStatus.isAdmin && !didRedirectRef.current) {
      didRedirectRef.current = true;
      if (__DEV__) {
        devLog('[P0_ADMIN_ROUTE] redirect fired', { target: '/settings', once: true });
      }
      router.replace("/settings");
    }
  }, [adminStatus, adminLoading, router]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || isSearching) return;

    setIsSearching(true);
    setSelectedUser(null); // Clear selected user on new search
    setSearchError(null); // Clear previous error
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    try {
      const response = await searchUsers(searchQuery);
      if (__DEV__) {
        devLog('[P0_ADMIN_CONSOLE] handleSearch:', { 
          q: searchQuery,
          status: 'ok',
          resultCount: response.users.length,
          firstResultId: response.users[0]?.id ?? null,
        });
      }
      setSearchResults(response.users);
    } catch (error: any) {
      if (__DEV__) {
        devLog('[P0_ADMIN_CONSOLE] handleSearch FAILED:', {
          q: searchQuery,
          status: error?.status ?? 'error',
          resultCount: 0,
          firstResultId: null,
          errorText: error?.message ?? 'Unknown error',
          rawData: error?.data ?? null,
        });
      }
      setSearchResults([]);
      // Surface error to UI - distinguish auth errors from other errors
      if (error?.status === 401 || error?.status === 403) {
        setSearchError("Not authorized for admin access");
        router.replace("/settings");
      } else {
        setSearchError(error?.message || `Search failed (${error?.status || 'network error'})`);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleUserSelect = async (user: UserSearchResult) => {
    setSelectedUser(user);
    setEntitlementError(null);
    setIsLoadingEntitlements(true);
    setUserPlan(null);
    
    try {
      // Load entitlements and plan in parallel
      const [entitlementsResponse, planResponse] = await Promise.all([
        getUserEntitlements(user.id),
        getUserSubscriptionTier(user.id),
      ]);
      
      setUserEntitlements(entitlementsResponse.entitlements);
      setUserPlan(planResponse);
      if (__DEV__) devLog(`[ADMIN_ENTITLEMENTS] initial fetch count=${entitlementsResponse.entitlements.length}`);
      if (__DEV__) devLog(`[ADMIN_PRO_SOT] userId=${user.id.substring(0,8)}... plan=${planResponse.plan} tier=${planResponse.tier} computedIsPro=${planResponse.isPro}`);
    } catch (error: any) {
      if (error?.status === 401 || error?.status === 403) {
        setEntitlementError("Not authorized");
        router.replace("/settings");
      } else {
        setEntitlementError("Failed to load user data - please try again");
      }
    } finally {
      setIsLoadingEntitlements(false);
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

        {/* Reports Inbox Link */}
        <Animated.View entering={FadeInDown.delay(165).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">REPORTS</Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/admin-reports" as any);
            }}
            style={{ backgroundColor: colors.surface }}
            className="rounded-2xl px-4 py-4 flex-row items-center"
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#EF444420", alignItems: "center", justifyContent: "center" }}>
              <Megaphone size={18} color="#EF4444" />
            </View>
            <View className="ml-3 flex-1">
              <Text style={{ color: colors.text }} className="text-base font-medium">Reports Inbox</Text>
              <Text style={{ color: colors.textSecondary }} className="text-sm">Review and resolve event reports</Text>
            </View>
            <ChevronRight size={18} color={colors.textTertiary} />
          </Pressable>
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

            {/* Search Error */}
            {searchError && !isSearching && (
              <View className="px-4 py-6 border-t" style={{ borderColor: isDark ? "#38383A" : "#F3F4F6" }}>
                <Text style={{ color: "#EF4444" }} className="text-center font-medium">
                  {searchError}
                </Text>
              </View>
            )}

            {/* No Results (only show if no error) */}
            {searchResults.length === 0 && searchQuery && !isSearching && !searchError && (
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
              <View className="mb-2">
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

            {/* ENTITLEMENTS Section */}
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">PLAN & ENTITLEMENTS</Text>
            <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden mb-4">
              {/* Plan/Tier SSOT from backend */}
              <View className="px-4 py-3 border-b" style={{ borderColor: isDark ? "#38383A" : "#F3F4F6" }}>
                {userPlan ? (
                  <View className="flex-row items-center">
                    <Text className="text-lg mr-2">{userPlan.isPro ? "⭐" : "👤"}</Text>
                    <View className="flex-1">
                      <Text style={{ color: userPlan.isPro ? "#10B981" : colors.text }} className="font-semibold">
                        Plan: {userPlan.isPro ? "PRO" : "FREE"}
                      </Text>
                      <Text style={{ color: colors.textTertiary }} className="text-xs mt-0.5">
                        {userPlan.tier ? `tier=${userPlan.tier}` : "tier=unknown"}
                        {userPlan.isLifetime ? " (Lifetime)" : ""}
                        {userPlan.expiresAt ? ` expires=${new Date(userPlan.expiresAt).toLocaleDateString()}` : ""}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text style={{ color: colors.textSecondary }} className="text-sm">Plan: loading...</Text>
                )}
              </View>

              {entitlementError && (
                <View className="px-4 py-3 border-b" style={{ borderColor: isDark ? "#38383A" : "#F3F4F6" }}>
                  <Text style={{ color: "#EF4444" }} className="text-sm">
                    {entitlementError}
                  </Text>
                </View>
              )}
              
              {isLoadingEntitlements ? (
                <View className="px-4 py-6">
                  <Text style={{ color: colors.textSecondary }} className="text-center">
                    Loading entitlements...
                  </Text>
                </View>
              ) : (
                <View>
                  {/* Current Entitlements */}
                  {userEntitlements.length === 0 ? (
                    <View className="px-4 py-4 border-b" style={{ borderColor: isDark ? "#38383A" : "#F3F4F6" }}>
                      <Text style={{ color: colors.textSecondary }} className="text-sm">
                        No entitlements granted
                      </Text>
                    </View>
                  ) : (
                    userEntitlements.map((ent, index) => (
                      <View
                        key={ent.id}
                        className="px-4 py-3"
                        style={{ 
                          borderBottomWidth: 1,
                          borderColor: isDark ? "#38383A" : "#F3F4F6" 
                        }}
                      >
                        <View className="flex-row items-center justify-between">
                          <View className="flex-1 mr-3">
                            <View className="flex-row items-center mb-1">
                              <Text className="text-lg mr-2">⭐</Text>
                              <Text style={{ color: colors.text }} className="font-medium">
                                {ent.entitlementKey}
                              </Text>
                            </View>
                            <Text style={{ color: colors.textTertiary }} className="text-xs">
                              Granted: {new Date(ent.grantedAt).toLocaleDateString()}
                              {ent.expiresAt && ` • Expires: ${new Date(ent.expiresAt).toLocaleDateString()}`}
                            </Text>
                            {ent.reason && (
                              <Text style={{ color: colors.textSecondary }} className="text-xs mt-0.5">
                                Reason: {ent.reason}
                              </Text>
                            )}
                          </View>
                          
                          <Pressable
                            onPress={async () => {
                              if (entitlementActionLoading) return;
                              setEntitlementActionLoading(ent.entitlementKey);
                              setEntitlementError(null);
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              
                              try {
                                const response = await revokeEntitlement(selectedUser!.id, ent.entitlementKey);
                                if (response.success) {
                                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                  safeToast.success("Entitlement revoked", `${ent.entitlementKey} removed`);
                                  // Refresh entitlements
                                  const refreshed = await getUserEntitlements(selectedUser!.id);
                                  setUserEntitlements(refreshed.entitlements);
                                  if (__DEV__) devLog(`[ADMIN_ENTITLEMENTS] afterRevoke refetch count=${refreshed.entitlements.length}`);
                                } else {
                                  setEntitlementError(response.message || "Failed to revoke entitlement");
                                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                                  safeToast.error("Revoke failed", response.message || "Failed to revoke entitlement");
                                }
                              } catch (error: any) {
                                if (error?.status === 401 || error?.status === 403) {
                                  setEntitlementError("Not authorized");
                                  router.replace("/settings");
                                } else {
                                  setEntitlementError(error?.message || "Network error");
                                  safeToast.error("Revoke failed", error?.message || "Network error");
                                }
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                              } finally {
                                setEntitlementActionLoading(null);
                              }
                            }}
                            disabled={entitlementActionLoading === ent.entitlementKey}
                            className="px-3 py-1.5 rounded-lg"
                            style={{ 
                              backgroundColor: "#EF444420",
                              opacity: entitlementActionLoading === ent.entitlementKey ? 0.5 : 1
                            }}
                          >
                            <Text style={{ color: "#EF4444" }} className="text-sm font-medium">
                              {entitlementActionLoading === ent.entitlementKey ? "..." : "Revoke"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ))
                  )}
                  
                  {/* Quick Grant PRO Button */}
                  {(() => {
                    const hasPro = userEntitlements.some(e => e.entitlementKey === "pro") || (userPlan?.isPro === true);
                    return (
                      <View className="px-4 py-3">
                        <Pressable
                          onPress={async () => {
                            if (hasPro || entitlementActionLoading) return;
                            setEntitlementActionLoading("pro_grant");
                            setEntitlementError(null);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            
                            try {
                              const response = await grantEntitlement(selectedUser!.id, "pro", undefined, "Admin grant via console");
                              if (response.success) {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                safeToast.success("PRO granted", `PRO entitlement granted to ${selectedUser!.name || selectedUser!.email}`);
                                // Refresh entitlements
                                const refreshed = await getUserEntitlements(selectedUser!.id);
                                setUserEntitlements(refreshed.entitlements);
                                if (__DEV__) devLog(`[ADMIN_ENTITLEMENTS] afterGrant refetch count=${refreshed.entitlements.length}`);
                                // Refresh plan/tier SSOT
                                const planRefreshed = await getUserSubscriptionTier(selectedUser!.id);
                                setUserPlan(planRefreshed);
                                if (__DEV__) devLog(`[ADMIN_PRO_SOT] afterGrant plan=${planRefreshed.plan} isPro=${planRefreshed.isPro}`);
                              } else {
                                setEntitlementError(response.message || "Failed to grant PRO");
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                                safeToast.error("Grant failed", response.message || "Failed to grant PRO");
                              }
                            } catch (error: any) {
                              if (error?.status === 401 || error?.status === 403) {
                                setEntitlementError("Not authorized");
                                router.replace("/settings");
                              } else {
                                setEntitlementError(error?.message || "Network error");
                                safeToast.error("Grant failed", error?.message || "Network error");
                              }
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                            } finally {
                              setEntitlementActionLoading(null);
                            }
                          }}
                          disabled={hasPro || entitlementActionLoading === "pro_grant"}
                          className="py-2.5 rounded-lg items-center flex-row justify-center"
                          style={{ 
                            backgroundColor: hasPro ? "#10B98120" : themeColor,
                            opacity: entitlementActionLoading === "pro_grant" ? 0.5 : 1,
                          }}
                        >
                          {hasPro ? (
                            <Text style={{ color: "#10B981" }} className="font-medium">
                              ✓ PRO Already Granted
                            </Text>
                          ) : (
                            <Text style={{ color: "white" }} className="font-medium">
                              {entitlementActionLoading === "pro_grant" ? "Granting..." : "⭐ Grant PRO"}
                            </Text>
                          )}
                        </Pressable>
                      </View>
                    );
                  })()}
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {/* Admin Endpoints Status */}
        <Animated.View entering={FadeInDown.delay(250).springify()} className="mx-4 mt-6 mb-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">STATUS</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl p-4">
            {/* Admin Me Endpoint */}
            <View className="flex-row items-center mb-2">
              <Text 
                style={{ color: endpointHealth.adminMe === true ? "#10B981" : endpointHealth.adminMe === false ? "#EF4444" : colors.textSecondary }} 
                className="text-sm font-medium"
              >
                {endpointHealth.adminMe === true ? "✓" : endpointHealth.adminMe === false ? "✗" : "◯"} /api/admin/me
              </Text>
            </View>
            <Text style={{ color: colors.textSecondary }} className="text-xs">
              Connected to {BACKEND_URL}
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}