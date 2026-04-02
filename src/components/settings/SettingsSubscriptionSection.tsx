import React from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { Crown, RotateCcw, Sparkles, Ticket } from "@/ui/icons";

interface SettingsSubscriptionSectionProps {
  userIsPremium: boolean;
  entitlementsLoading: boolean;
  isRestoringPurchases: boolean;
  isRefreshingEntitlements: boolean;
  colors: { text: string; textSecondary: string; textTertiary: string; separator: string; surface: string; background: string };
  isDark: boolean;
  themeColor: string;
  onNavigateToSubscription: () => void;
  onOpenPaywall: () => void;
  onRestorePurchases: () => void;
  onRefreshEntitlements: () => void;
  onRedeemCode?: () => void;
}

export function SettingsSubscriptionSection({
  userIsPremium,
  entitlementsLoading,
  isRestoringPurchases,
  isRefreshingEntitlements,
  colors,
  isDark,
  themeColor,
  onNavigateToSubscription,
  onOpenPaywall,
  onRestorePurchases,
  onRefreshEntitlements,
  onRedeemCode,
}: SettingsSubscriptionSectionProps) {
  return (
    <View style={{ backgroundColor: colors.surface }} className="rounded-2xl overflow-hidden">
      {/* Current Status - Show truthful state */}
      <Pressable
        onPress={onNavigateToSubscription}
        className="p-4"
        style={{ borderBottomWidth: !userIsPremium ? 1 : 0, borderBottomColor: colors.separator }}
      >
        <View className="flex-row items-center">
          <View
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: userIsPremium ? "#FFD70020" : isDark ? "#2C2C2E" : "#F9FAFB" }}
          >
            <Crown size={20} color={userIsPremium ? "#FFD700" : colors.textSecondary} />
          </View>
          <View className="flex-1">
            <Text style={{ color: colors.text }} className="text-base font-medium">
              {userIsPremium ? "Founder Pro" : "Free Plan"}
            </Text>
            <Text style={{ color: colors.textSecondary }} className="text-sm">
              {userIsPremium ? "All premium themes, effects & more" : "Unlimited events, 5 basic themes"}
            </Text>
          </View>
          {!userIsPremium && <Text style={{ color: colors.textTertiary }} className="text-lg">›</Text>}
        </View>
      </Pressable>

      {/* Upgrade CTA (only show for free users) */}
      {!userIsPremium && (
        <Pressable
          onPress={onOpenPaywall}
          className="flex-row items-center p-4"
          style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}
        >
          <View
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: `${themeColor}20` }}
          >
            <Sparkles size={20} color={themeColor} />
          </View>
          <View className="flex-1">
            <Text style={{ color: colors.text }} className="text-base font-medium">Upgrade to Founder Pro</Text>
            <Text style={{ color: colors.textSecondary }} className="text-sm">Unlock premium themes, effects & more</Text>
          </View>
          <View className="px-3 py-1 rounded-full" style={{ backgroundColor: `${themeColor}20` }}>
            <Text style={{ color: themeColor }} className="text-xs font-medium">Upgrade</Text>
          </View>
        </Pressable>
      )}

      {/* Redeem Church Code (iOS only, free users) */}
      {!userIsPremium && Platform.OS === "ios" && onRedeemCode && (
        <Pressable
          onPress={onRedeemCode}
          className="flex-row items-center p-4"
          style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}
        >
          <View
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: "#10B98120" }}
          >
            <Ticket size={20} color="#10B981" />
          </View>
          <View className="flex-1">
            <Text style={{ color: colors.text }} className="text-base font-medium">Have a Church Code?</Text>
            <Text style={{ color: colors.textSecondary }} className="text-sm">Redeem your promo code</Text>
          </View>
          <Text style={{ color: colors.textTertiary }} className="text-lg">›</Text>
        </Pressable>
      )}

      {/* Restore Purchases */}
      <Pressable
        onPress={onRestorePurchases}
        disabled={isRestoringPurchases}
        className="flex-row items-center p-4"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}
      >
        <View
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
        >
          <RotateCcw size={20} color={colors.textSecondary} />
        </View>
        <View className="flex-1">
          <Text style={{ color: colors.text }} className="text-base font-medium">
            {isRestoringPurchases ? "Restoring..." : "Restore Purchases"}
          </Text>
          <Text style={{ color: colors.textSecondary }} className="text-sm">
            Recover previous purchases
          </Text>
        </View>
      </Pressable>

      {/* Refresh Status Button */}
      <Pressable
        onPress={onRefreshEntitlements}
        disabled={isRefreshingEntitlements || entitlementsLoading}
        className="flex-row items-center p-4"
      >
        <View
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
        >
          <RotateCcw size={20} color={colors.textSecondary} />
        </View>
        <View className="flex-1">
          <Text style={{ color: colors.text }} className="text-base font-medium">
            {isRefreshingEntitlements ? "Refreshing..." : "Refresh Pro Status"}
          </Text>
          <Text style={{ color: colors.textSecondary }} className="text-sm">
            Sync your Founder Pro status
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
