import React, { useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Modal,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { ChevronLeft, ChevronRight, Search, Shield, Award, Plus, Pencil, X, Megaphone } from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { 
  checkAdminStatus, 
  searchUsers, 
  listBadges, 
  getUserBadges, 
  createBadge,
  updateBadge,
  grantBadgeByKey,
  revokeBadgeByKey,
  getUserEntitlements,
  grantEntitlement,
  revokeEntitlement,
  getUserSubscriptionTier,
  type UserSearchResult, 
  type BadgeDef, 
  type GrantedBadge,
  type CreateBadgePayload,
  type UpdateBadgePayload,
  type UserEntitlement,
  type AdminUserSubscriptionInfo,
} from "@/lib/adminApi";
import { useTheme } from "@/lib/ThemeContext";
import { BACKEND_URL } from "@/lib/config";
import { safeToast } from "@/lib/safeToast";

/** Defensively extract a usable badge key from a catalog item.
 *  Backend may return `key`, `slug`, or only `id` instead of `badgeKey`.
 *  listBadges() already normalizes, but this is the last-resort guard. */
function getBadgeCatalogKey(badge: BadgeDef | Record<string, any>): string {
  return (
    (badge as any).badgeKey ||
    (badge as any).key ||
    (badge as any).slug ||
    (badge as any).id ||
    ""
  );
}

export default function AdminConsole() {
  const router = useRouter();
  // P0 FIX: Prevent redirect loop with ref
  const didRedirectRef = useRef(false);
  const { isDark, colors, themeColor } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [availableBadges, setAvailableBadges] = useState<BadgeDef[]>([]);
  const [userBadges, setUserBadges] = useState<GrantedBadge[]>([]);
  const [isLoadingBadges, setIsLoadingBadges] = useState(false);
  const [badgeActionLoading, setBadgeActionLoading] = useState<string | null>(null);
  const [badgeError, setBadgeError] = useState<string | null>(null);
  
  // Badge Definitions state
  const [allBadgeDefinitions, setAllBadgeDefinitions] = useState<BadgeDef[]>([]);
  const [isLoadingDefinitions, setIsLoadingDefinitions] = useState(false);
  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const [editingBadge, setEditingBadge] = useState<BadgeDef | null>(null);
  const [badgeFormError, setBadgeFormError] = useState<string | null>(null);
  const [isSavingBadge, setIsSavingBadge] = useState(false);
  
  // Badge form state
  const [formBadgeKey, setFormBadgeKey] = useState("");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formEmoji, setFormEmoji] = useState("🏆");
  const [formTierColor, setFormTierColor] = useState("#10B981");
  const [formIsExclusive, setFormIsExclusive] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);
  
  // Badge grant state
  const [selectedBadgeToGrant, setSelectedBadgeToGrant] = useState<string>("");
  const [grantBadgeNote, setGrantBadgeNote] = useState("");
  const [isGrantingBadge, setIsGrantingBadge] = useState(false);
  
  // Entitlements state
  const [userEntitlements, setUserEntitlements] = useState<UserEntitlement[]>([]);
  const [userPlan, setUserPlan] = useState<AdminUserSubscriptionInfo | null>(null);
  const [isLoadingEntitlements, setIsLoadingEntitlements] = useState(false);
  const [entitlementError, setEntitlementError] = useState<string | null>(null);
  const [entitlementActionLoading, setEntitlementActionLoading] = useState<string | null>(null);
  
  // Endpoint health state
  const [endpointHealth, setEndpointHealth] = useState<{
    adminMe: boolean | null;
    badges: boolean | null;
    badgeCount: number;
  }>({ adminMe: null, badges: null, badgeCount: 0 });

  // Check admin status and redirect if not admin
  const { data: adminStatus, isLoading: adminLoading } = useQuery({
    queryKey: ["adminStatus"],
    queryFn: checkAdminStatus,
    retry: false,
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
    setBadgeError(null);
    setEntitlementError(null);
    setIsLoadingBadges(true);
    setIsLoadingEntitlements(true);
    setSelectedBadgeToGrant("");
    setGrantBadgeNote("");
    setUserPlan(null);
    
    try {
      // Load available badges, user's current badges, entitlements, and plan in parallel
      const [badgesResponse, userBadgesResponse, entitlementsResponse, planResponse] = await Promise.all([
        listBadges(),
        getUserBadges(user.id),
        getUserEntitlements(user.id),
        getUserSubscriptionTier(user.id),
      ]);
      
      setAvailableBadges(badgesResponse.badges);
      setUserBadges(userBadgesResponse.badges);
      setUserEntitlements(entitlementsResponse.entitlements);
      setUserPlan(planResponse);
      if (__DEV__) devLog(`[ADMIN_ENTITLEMENTS] initial fetch count=${entitlementsResponse.entitlements.length}`);
      if (__DEV__) devLog(`[ADMIN_PRO_SOT] userId=${user.id.substring(0,8)}... plan=${planResponse.plan} tier=${planResponse.tier} computedIsPro=${planResponse.isPro}`);
    } catch (error: any) {
      if (error?.status === 401 || error?.status === 403) {
        setBadgeError("Not authorized");
        router.replace("/settings");
      } else {
        setBadgeError("Failed to load user data - please try again");
      }
    } finally {
      setIsLoadingBadges(false);
      setIsLoadingEntitlements(false);
    }
  };

  // Load all badge definitions for the definitions panel
  const loadBadgeDefinitions = async () => {
    setIsLoadingDefinitions(true);
    try {
      const response = await listBadges();
      setAllBadgeDefinitions(response.badges);
      // Track endpoint health
      setEndpointHealth(prev => ({
        ...prev,
        badges: response.badges.length >= 0,
        badgeCount: response.badges.length,
      }));
      if (__DEV__) {
        const hasConnectLeader = response.badges.some(b => getBadgeCatalogKey(b) === 'connect_leader');
        devLog(`[P0_ADMIN_CONSOLE] loadBadgeDefinitions: count=${response.badges.length} hasConnectLeader=${hasConnectLeader} firstKeys=${response.badges[0] ? Object.keys(response.badges[0]).join(",") : "N/A"}`);
      }
    } catch (error: any) {
      if (__DEV__) {
        devLog("[P0_ADMIN_CONSOLE] loadBadgeDefinitions FAILED:", error?.message);
      }
      setEndpointHealth(prev => ({
        ...prev,
        badges: false,
        badgeCount: 0,
      }));
    } finally {
      setIsLoadingDefinitions(false);
    }
  };

  // Load badge definitions on mount
  React.useEffect(() => {
    if (adminStatus?.isAdmin) {
      loadBadgeDefinitions();
    }
  }, [adminStatus?.isAdmin]);

  // Reset form for new badge
  const openCreateBadgeModal = () => {
    setEditingBadge(null);
    setFormBadgeKey("");
    setFormName("");
    setFormDescription("");
    setFormEmoji("🏆");
    setFormTierColor("#10B981");
    setFormIsExclusive(false);
    setFormIsActive(true);
    setBadgeFormError(null);
    setShowBadgeModal(true);
  };

  // Open modal with existing badge data
  const openEditBadgeModal = (badge: BadgeDef) => {
    setEditingBadge(badge);
    setFormBadgeKey(badge.badgeKey);
    setFormName(badge.name);
    setFormDescription(badge.description || "");
    setFormEmoji(badge.emoji || "🏆");
    setFormTierColor(badge.tierColor);
    setFormIsExclusive(badge.isExclusive === true);
    setFormIsActive(badge.isActive !== false);
    setBadgeFormError(null);
    setShowBadgeModal(true);
  };

  // Validate badge key - matches backend regex: /^[a-z0-9_-]{2,32}$/
  const validateBadgeKey = (key: string): boolean => {
    return /^[a-z0-9_-]{2,32}$/.test(key);
  };

  // Validate hex color
  const validateHexColor = (color: string): boolean => {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
  };

  // Handle save badge (create or update)
  const handleSaveBadge = async () => {
    setBadgeFormError(null);
    
    // Validation
    if (!formBadgeKey.trim()) {
      setBadgeFormError("Badge key is required");
      return;
    }
    if (!editingBadge && !validateBadgeKey(formBadgeKey)) {
      setBadgeFormError("Badge key must be 2-32 chars: lowercase letters, numbers, underscores, and hyphens");
      return;
    }
    if (!formName.trim()) {
      setBadgeFormError("Badge name is required");
      return;
    }
    if (!validateHexColor(formTierColor)) {
      setBadgeFormError("Color must be a valid hex code (e.g., #10B981)");
      return;
    }

    setIsSavingBadge(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (editingBadge) {
        // Update existing badge
        const payload: UpdateBadgePayload = {
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          emoji: formEmoji || "🏆",
          tierColor: formTierColor,
          isExclusive: formIsExclusive,
          isActive: formIsActive,
        };
        const response = await updateBadge(editingBadge.badgeKey, payload);
        if (response.success) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          safeToast.success("Badge updated", `"${formName}" has been updated`);
          setShowBadgeModal(false);
          loadBadgeDefinitions();
        } else {
          setBadgeFormError(response.message || "Failed to update badge");
        }
      } else {
        // Create new badge
        const payload: CreateBadgePayload = {
          badgeKey: formBadgeKey.trim(),
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          emoji: formEmoji || "🏆",
          tierColor: formTierColor,
          isExclusive: formIsExclusive,
          isActive: formIsActive,
        };
        const response = await createBadge(payload);
        if (response.success) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          safeToast.success("Badge created", `"${formName}" has been created`);
          setShowBadgeModal(false);
          loadBadgeDefinitions();
        } else {
          setBadgeFormError(response.message || "Failed to create badge");
        }
      }
    } catch (error: any) {
      if (error?.status === 401 || error?.status === 403) {
        setBadgeFormError("Not authorized");
        router.replace("/settings");
      } else {
        setBadgeFormError(error?.message || "Network error - please try again");
      }
    } finally {
      setIsSavingBadge(false);
    }
  };

  // Handle grant badge by key
  const handleGrantBadge = async () => {
    if (!selectedUser || !selectedBadgeToGrant || isGrantingBadge) return;
    
    if (__DEV__) devLog(`[ADMIN_BADGE_GRANT] submit key=${selectedBadgeToGrant} userId=${selectedUser.id.substring(0,8)}...`);
    setIsGrantingBadge(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBadgeError(null);
    
    try {
      const response = await grantBadgeByKey(selectedUser.id, selectedBadgeToGrant, grantBadgeNote || undefined);
      if (__DEV__) devLog(`[ADMIN_BADGE_GRANT] submit key=${selectedBadgeToGrant} userId=${selectedUser.id.substring(0,8)}... status=${response.success ? 'SUCCESS' : 'FAILED'}`);
      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeToast.success("Badge granted", `Badge granted to ${selectedUser.name || selectedUser.email}`);
        // Refresh badges
        const userBadgesResponse = await getUserBadges(selectedUser.id);
        setUserBadges(userBadgesResponse.badges);
        setSelectedBadgeToGrant("");
        setGrantBadgeNote("");
      } else {
        setBadgeError(response.message || "Failed to grant badge");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (error: any) {
      if (error?.status === 401 || error?.status === 403) {
        setBadgeError("Not authorized");
        router.replace("/settings");
      } else {
        setBadgeError(error?.message || "Network error - please try again");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsGrantingBadge(false);
    }
  };

  // Handle revoke badge by key
  const handleRevokeBadgeByKey = async (badgeKey: string) => {
    if (!selectedUser || badgeActionLoading) return;
    
    setBadgeActionLoading(badgeKey);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBadgeError(null);
    
    try {
      const response = await revokeBadgeByKey(selectedUser.id, badgeKey);
      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeToast.success("Badge revoked", "Badge has been removed");
        // Refresh badges
        const userBadgesResponse = await getUserBadges(selectedUser.id);
        setUserBadges(userBadgesResponse.badges);
      } else {
        setBadgeError(response.message || "Failed to revoke badge");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (error: any) {
      if (error?.status === 401 || error?.status === 403) {
        setBadgeError("Not authorized");
        router.replace("/settings");
      } else {
        setBadgeError(error?.message || "Network error - please try again");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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

        {/* Badge Definitions Section */}
        <Animated.View entering={FadeInDown.delay(185).springify()} className="mx-4 mt-6">
          <View className="flex-row items-center justify-between mb-2 px-2">
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium">BADGE DEFINITIONS</Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                openCreateBadgeModal();
              }}
              className="flex-row items-center px-2 py-1 rounded-lg"
              style={{ backgroundColor: `${themeColor}20` }}
            >
              <Plus size={14} color={themeColor} />
              <Text style={{ color: themeColor }} className="text-sm font-medium ml-1">New Badge</Text>
            </Pressable>
          </View>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
            {isLoadingDefinitions ? (
              <View className="px-4 py-6">
                <Text style={{ color: colors.textSecondary }} className="text-center">
                  Loading badge definitions...
                </Text>
              </View>
            ) : allBadgeDefinitions.length === 0 ? (
              <View className="px-4 py-6">
                <Text style={{ color: colors.textSecondary }} className="text-center">
                  No badges defined yet
                </Text>
              </View>
            ) : (
              <View>
                {allBadgeDefinitions.map((badge, index) => (
                  <Pressable
                    key={badge.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      openEditBadgeModal(badge);
                    }}
                    className="px-4 py-3"
                    style={{ 
                      borderBottomWidth: index < allBadgeDefinitions.length - 1 ? 1 : 0,
                      borderColor: isDark ? "#38383A" : "#F3F4F6" 
                    }}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 mr-3">
                        <View className="flex-row items-center mb-1">
                          <Text className="text-lg mr-2">{badge.emoji || "🏆"}</Text>
                          <Text style={{ color: colors.text }} className="font-medium flex-shrink">
                            {badge.name}
                          </Text>
                          <View 
                            className="ml-2 w-4 h-4 rounded"
                            style={{ backgroundColor: badge.tierColor }}
                          />
                        </View>
                        <Text style={{ color: colors.textTertiary }} className="text-xs font-mono">
                          {getBadgeCatalogKey(badge) || badge.id}
                        </Text>
                      </View>
                      <View className="flex-row items-center">
                        <View 
                          className="px-2 py-0.5 rounded mr-2"
                          style={{ backgroundColor: badge.isExclusive === true ? "#F59E0B20" : "#10B98120" }}
                        >
                          <Text 
                            style={{ color: badge.isExclusive === true ? "#F59E0B" : "#10B981" }} 
                            className="text-xs font-medium"
                          >
                            {badge.isExclusive === true ? "Exclusive" : "Public"}
                          </Text>
                        </View>
                        {badge.isActive === false && (
                          <View 
                            className="px-2 py-0.5 rounded mr-2"
                            style={{ backgroundColor: "#EF444420" }}
                          >
                            <Text style={{ color: "#EF4444" }} className="text-xs font-medium">
                              Inactive
                            </Text>
                          </View>
                        )}
                        <Pencil size={16} color={colors.textSecondary} />
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </Animated.View>

        {/* User Badge Assignment Section */}
        <Animated.View entering={FadeInDown.delay(180).springify()} className="mx-4 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">ASSIGN BADGES</Text>
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

            {/* Granted Badges Section */}
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">GRANTED BADGES</Text>
            <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden mb-4">
              {badgeError && (
                <View className="px-4 py-3 border-b" style={{ borderColor: isDark ? "#38383A" : "#F3F4F6" }}>
                  <Text style={{ color: "#EF4444" }} className="text-sm">
                    {badgeError}
                  </Text>
                </View>
              )}
              
              {isLoadingBadges ? (
                <View className="px-4 py-6">
                  <Text style={{ color: colors.textSecondary }} className="text-center">
                    Loading badges...
                  </Text>
                </View>
              ) : userBadges.length === 0 ? (
                <View className="px-4 py-6">
                  <Text style={{ color: colors.textSecondary }} className="text-center">
                    No badges granted yet
                  </Text>
                </View>
              ) : (
                <View>
                  {userBadges.map((badge, index) => (
                    <View
                      key={badge.achievementId}
                      className="px-4 py-3"
                      style={{ 
                        borderBottomWidth: index < userBadges.length - 1 ? 1 : 0,
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
                          </View>
                          <Text style={{ color: colors.textTertiary }} className="text-xs">
                            Granted: {new Date(badge.grantedAt).toLocaleDateString()}
                          </Text>
                          {badge.note && (
                            <Text style={{ color: colors.textSecondary }} className="text-xs mt-0.5">
                              Note: {badge.note}
                            </Text>
                          )}
                        </View>
                        
                        <Pressable
                          onPress={() => badge.badgeKey && handleRevokeBadgeByKey(badge.badgeKey)}
                          disabled={badgeActionLoading === badge.badgeKey || !badge.badgeKey}
                          className="px-3 py-1.5 rounded-lg"
                          style={{ 
                            backgroundColor: "#EF444420",
                            opacity: badgeActionLoading === badge.badgeKey ? 0.5 : 1
                          }}
                        >
                          <Text style={{ color: "#EF4444" }} className="text-sm font-medium">
                            {badgeActionLoading === badge.badgeKey ? "..." : "Revoke"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Quick Grant Connect Leader */}
            {(() => {
              const connectLeaderBadge = allBadgeDefinitions.find(b => getBadgeCatalogKey(b) === "connect_leader");
              const hasConnectLeader = userBadges.some(ub => (ub.badgeKey || (ub as any).key) === "connect_leader");
              
              if (!connectLeaderBadge) {
                return (
                  <View className="mb-4">
                    <View style={{ backgroundColor: "#F59E0B20" }} className="rounded-2xl p-3">
                      <Text style={{ color: "#F59E0B" }} className="text-sm font-medium">
                        ⚠️ connect_leader not found in badge catalog
                      </Text>
                      <Text style={{ color: colors.textSecondary }} className="text-xs mt-1">
                        Backend migration not deployed yet
                      </Text>
                    </View>
                  </View>
                );
              }
              
              return (
                <View className="mb-4">
                  <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">QUICK GRANT</Text>
                  <Pressable
                    onPress={async () => {
                      if (hasConnectLeader || isGrantingBadge) return;
                      
                      setIsGrantingBadge(true);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setBadgeError(null);
                      
                      try {
                        const response = await grantBadgeByKey(selectedUser.id, "connect_leader");
                        if (response.success) {
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          safeToast.success("Connect Leader granted", `Badge granted to ${selectedUser.name || selectedUser.email}`);
                          const userBadgesResponse = await getUserBadges(selectedUser.id);
                          setUserBadges(userBadgesResponse.badges);
                        } else {
                          setBadgeError(response.message || "Failed to grant Connect Leader");
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                          safeToast.error("Grant failed", response.message || "Failed to grant Connect Leader");
                        }
                      } catch (error: any) {
                        if (error?.status === 401 || error?.status === 403) {
                          setBadgeError("Not authorized");
                          router.replace("/settings");
                        } else {
                          setBadgeError(error?.message || "Network error - please try again");
                          safeToast.error("Grant failed", error?.message || "Network error");
                        }
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                      } finally {
                        setIsGrantingBadge(false);
                      }
                    }}
                    disabled={hasConnectLeader || isGrantingBadge}
                    style={{ backgroundColor: colors.surface }}
                    className="rounded-2xl p-4"
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center flex-1">
                        <View 
                          className="w-10 h-10 rounded-full items-center justify-center mr-3"
                          style={{ backgroundColor: `${connectLeaderBadge.tierColor}20` }}
                        >
                          <Text className="text-xl">{connectLeaderBadge.emoji}</Text>
                        </View>
                        <View className="flex-1">
                          <Text style={{ color: colors.text }} className="font-semibold">
                            {connectLeaderBadge.name}
                          </Text>
                          <Text style={{ color: colors.textSecondary }} className="text-xs mt-0.5">
                            1-click grant
                          </Text>
                        </View>
                      </View>
                      
                      {hasConnectLeader ? (
                        <View 
                          className="px-3 py-1.5 rounded-lg"
                          style={{ backgroundColor: "#10B98120" }}
                        >
                          <Text style={{ color: "#10B981" }} className="text-sm font-medium">
                            Already Granted ✓
                          </Text>
                        </View>
                      ) : (
                        <View 
                          className="px-4 py-2 rounded-lg"
                          style={{ backgroundColor: themeColor }}
                        >
                          <Text className="text-white font-medium">
                            {isGrantingBadge ? "Granting..." : "Grant"}
                          </Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                </View>
              );
            })()}

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

            {/* Grant Badge Section */}
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">GRANT A BADGE</Text>
            <View style={{ backgroundColor: colors.surface }} className="rounded-2xl p-4 mb-4">
              <View className="mb-3">
                <Text style={{ color: colors.textSecondary }} className="text-xs mb-1">Select Badge</Text>
                <View 
                  className="rounded-lg overflow-hidden"
                  style={{ 
                    backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB",
                    borderWidth: 1,
                    borderColor: isDark ? "#38383A" : "#E5E7EB",
                  }}
                >
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="px-2 py-2"
                    {...(Platform.OS === "ios" ? { delaysContentTouches: false, canCancelContentTouches: false } as any : {})}
                  >
                    {allBadgeDefinitions.filter(b => b.isActive !== false && !!getBadgeCatalogKey(b)).map((badge) => {
                      const derivedKey = getBadgeCatalogKey(badge);
                      const isSelected = selectedBadgeToGrant === derivedKey;
                      const isAlreadyGranted = userBadges.some(ub => (ub.badgeKey || (ub as any).key || (ub as any).slug) === derivedKey);
                      return (
                        <Pressable
                          key={derivedKey}
                          onPress={() => {
                            if (isAlreadyGranted) return;
                            if (__DEV__) devLog(`[ADMIN_BADGE_GRANT] select key=${derivedKey}`);
                            setSelectedBadgeToGrant(derivedKey);
                          }}
                          disabled={isAlreadyGranted}
                          className="px-3 py-2 mr-2 rounded-lg flex-row items-center"
                          style={{ 
                            backgroundColor: isSelected ? `${themeColor}20` : 'transparent',
                            borderWidth: isSelected ? 1 : 0,
                            borderColor: themeColor,
                            opacity: isAlreadyGranted ? 0.4 : 1,
                          }}
                        >
                          <Text className="mr-1">{badge.emoji}</Text>
                          <Text style={{ color: isSelected ? themeColor : colors.text }} className="text-sm">
                            {badge.name}
                          </Text>
                          {isAlreadyGranted && (
                            <Text style={{ color: colors.textTertiary }} className="text-xs ml-1">✓</Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
              
              <TextInput
                value={grantBadgeNote}
                onChangeText={setGrantBadgeNote}
                placeholder="Note (optional, e.g., gift reason)"
                placeholderTextColor={colors.textTertiary}
                className="px-3 py-2 rounded-lg text-sm mb-3"
                style={{ 
                  backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB",
                  color: colors.text,
                  borderWidth: 1,
                  borderColor: isDark ? "#38383A" : "#E5E7EB",
                }}
              />
              
              <Pressable
                onPress={handleGrantBadge}
                disabled={!selectedBadgeToGrant || isGrantingBadge}
                className="py-2.5 rounded-lg items-center"
                style={{ 
                  backgroundColor: selectedBadgeToGrant ? themeColor : colors.surface,
                  opacity: !selectedBadgeToGrant || isGrantingBadge ? 0.5 : 1,
                }}
              >
                <Text style={{ color: selectedBadgeToGrant ? "white" : colors.textSecondary }} className="font-medium">
                  {isGrantingBadge ? "Granting..." : "Grant Badge"}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        )}

        {/* Admin Endpoints Status */}
        <Animated.View entering={FadeInDown.delay(250).springify()} className="mx-4 mt-6 mb-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2 ml-2">STATUS</Text>
          <View style={{ backgroundColor: colors.surface }} className="rounded-2xl p-4">
            {/* Admin Me Endpoint */}
            <View className="flex-row items-center mb-1">
              <Text 
                style={{ color: endpointHealth.adminMe === true ? "#10B981" : endpointHealth.adminMe === false ? "#EF4444" : colors.textSecondary }} 
                className="text-sm font-medium"
              >
                {endpointHealth.adminMe === true ? "✓" : endpointHealth.adminMe === false ? "✗" : "◯"} /api/admin/me
              </Text>
            </View>
            {/* Badges Endpoint */}
            <View className="flex-row items-center mb-2">
              <Text 
                style={{ color: endpointHealth.badges === true ? "#10B981" : endpointHealth.badges === false ? "#EF4444" : colors.textSecondary }} 
                className="text-sm font-medium"
              >
                {endpointHealth.badges === true ? "✓" : endpointHealth.badges === false ? "✗" : "◯"} /api/admin/badges ({endpointHealth.badgeCount})
              </Text>
            </View>
            <Text style={{ color: colors.textSecondary }} className="text-xs">
              Connected to {BACKEND_URL}
            </Text>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Badge Create/Edit Modal */}
      <Modal
        visible={showBadgeModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowBadgeModal(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Modal Header */}
          <View 
            className="flex-row items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: isDark ? "#38383A" : "#E5E7EB" }}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowBadgeModal(false);
              }}
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.surface }}
            >
              <X size={20} color={colors.text} />
            </Pressable>
            
            <Text style={{ color: colors.text }} className="text-lg font-semibold">
              {editingBadge ? "Edit Badge" : "Create Badge"}
            </Text>
            
            <Pressable
              onPress={handleSaveBadge}
              disabled={isSavingBadge}
              className="px-4 py-2 rounded-lg"
              style={{ 
                backgroundColor: themeColor,
                opacity: isSavingBadge ? 0.5 : 1
              }}
            >
              <Text className="text-white font-medium">
                {isSavingBadge ? "Saving..." : "Save"}
              </Text>
            </Pressable>
          </View>

          <ScrollView className="flex-1 px-4 py-4">
            {/* Form Error */}
            {badgeFormError && (
              <View 
                className="mb-4 px-4 py-3 rounded-xl"
                style={{ backgroundColor: "#EF444420" }}
              >
                <Text style={{ color: "#EF4444" }} className="text-sm">
                  {badgeFormError}
                </Text>
              </View>
            )}

            {/* Badge Key */}
            <View className="mb-4">
              <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">
                Badge Key {editingBadge ? "(read-only)" : "*"}
              </Text>
              <TextInput
                value={formBadgeKey}
                onChangeText={setFormBadgeKey}
                placeholder="e.g., early_adopter"
                placeholderTextColor={colors.textTertiary}
                editable={!editingBadge}
                autoCapitalize="none"
                autoCorrect={false}
                className="px-4 py-3 rounded-xl text-base"
                style={{ 
                  backgroundColor: colors.surface,
                  color: editingBadge ? colors.textSecondary : colors.text,
                  borderWidth: 1,
                  borderColor: isDark ? "#38383A" : "#E5E7EB",
                }}
              />
              {!editingBadge && (
                <Text style={{ color: colors.textTertiary }} className="text-xs mt-1 ml-1">
                  2-32 chars: lowercase letters, numbers, underscores, hyphens. Cannot change after creation.
                </Text>
              )}
            </View>

            {/* Name */}
            <View className="mb-4">
              <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">
                Display Name *
              </Text>
              <TextInput
                value={formName}
                onChangeText={setFormName}
                placeholder="e.g., Early Adopter"
                placeholderTextColor={colors.textTertiary}
                className="px-4 py-3 rounded-xl text-base"
                style={{ 
                  backgroundColor: colors.surface,
                  color: colors.text,
                  borderWidth: 1,
                  borderColor: isDark ? "#38383A" : "#E5E7EB",
                }}
              />
            </View>

            {/* Description */}
            <View className="mb-4">
              <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">
                Description
              </Text>
              <TextInput
                value={formDescription}
                onChangeText={setFormDescription}
                placeholder="What this badge represents..."
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={2}
                className="px-4 py-3 rounded-xl text-base"
                style={{ 
                  backgroundColor: colors.surface,
                  color: colors.text,
                  borderWidth: 1,
                  borderColor: isDark ? "#38383A" : "#E5E7EB",
                  minHeight: 72,
                  textAlignVertical: "top",
                }}
              />
            </View>

            {/* Emoji & Color Row */}
            <View className="flex-row mb-4">
              <View className="flex-1 mr-2">
                <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">
                  Emoji
                </Text>
                <TextInput
                  value={formEmoji}
                  onChangeText={setFormEmoji}
                  placeholder="🏆"
                  placeholderTextColor={colors.textTertiary}
                  className="px-4 py-3 rounded-xl text-lg text-center"
                  style={{ 
                    backgroundColor: colors.surface,
                    color: colors.text,
                    borderWidth: 1,
                    borderColor: isDark ? "#38383A" : "#E5E7EB",
                  }}
                  maxLength={2}
                />
              </View>
              <View className="flex-1 ml-2">
                <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">
                  Tier Color
                </Text>
                <View className="flex-row items-center">
                  <TextInput
                    value={formTierColor}
                    onChangeText={setFormTierColor}
                    placeholder="#10B981"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="characters"
                    className="flex-1 px-4 py-3 rounded-l-xl text-base font-mono"
                    style={{ 
                      backgroundColor: colors.surface,
                      color: colors.text,
                      borderWidth: 1,
                      borderRightWidth: 0,
                      borderColor: isDark ? "#38383A" : "#E5E7EB",
                    }}
                    maxLength={7}
                  />
                  <View 
                    className="w-12 h-12 rounded-r-xl"
                    style={{ 
                      backgroundColor: validateHexColor(formTierColor) ? formTierColor : "#CCC",
                      borderWidth: 1,
                      borderColor: isDark ? "#38383A" : "#E5E7EB",
                    }}
                  />
                </View>
              </View>
            </View>

            {/* Preview */}
            <View className="mb-4">
              <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">
                Preview
              </Text>
              <View 
                className="px-4 py-3 rounded-xl flex-row items-center"
                style={{ backgroundColor: colors.surface }}
              >
                <Text className="text-xl mr-2">{formEmoji || "🏆"}</Text>
                <Text style={{ color: colors.text }} className="font-medium flex-1">
                  {formName || "Badge Name"}
                </Text>
                <View 
                  className="px-2 py-0.5 rounded"
                  style={{ backgroundColor: `${validateHexColor(formTierColor) ? formTierColor : "#CCC"}20` }}
                >
                  <Text 
                    style={{ color: validateHexColor(formTierColor) ? formTierColor : "#CCC" }} 
                    className="text-xs font-medium"
                  >
                    Tier
                  </Text>
                </View>
              </View>
            </View>

            {/* Exclusive Toggle */}
            <View 
              className="flex-row items-center justify-between px-4 py-4 rounded-xl mb-4"
              style={{ backgroundColor: colors.surface }}
            >
              <View className="flex-1 mr-4">
                <Text style={{ color: colors.text }} className="font-medium">
                  Exclusive (Gift)
                </Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">
                  Hidden unless manually granted
                </Text>
              </View>
              <Switch
                value={formIsExclusive}
                onValueChange={setFormIsExclusive}
                trackColor={{ false: isDark ? "#39393D" : "#E5E7EB", true: "#F59E0B80" }}
                thumbColor={formIsExclusive ? "#F59E0B" : isDark ? "#636366" : "#F4F4F5"}
              />
            </View>

            {/* Active Toggle */}
            <View 
              className="flex-row items-center justify-between px-4 py-4 rounded-xl mb-6"
              style={{ backgroundColor: colors.surface }}
            >
              <View className="flex-1 mr-4">
                <Text style={{ color: colors.text }} className="font-medium">
                  Active
                </Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">
                  Badge can be granted to users
                </Text>
              </View>
              <Switch
                value={formIsActive}
                onValueChange={setFormIsActive}
                trackColor={{ false: isDark ? "#39393D" : "#E5E7EB", true: `${themeColor}80` }}
                thumbColor={formIsActive ? themeColor : isDark ? "#636366" : "#F4F4F5"}
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}