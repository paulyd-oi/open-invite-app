import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { ChevronLeft, Tag } from "@/ui/icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/ThemeContext";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { api } from "@/lib/api";
import { safeToast } from "@/lib/safeToast";
import { useSubscription } from "@/lib/SubscriptionContext";
import { useRefreshProContract } from "@/lib/entitlements";
import { useQueryClient } from "@tanstack/react-query";

export default function RedeemCodeScreen() {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const { status: bootStatus } = useBootAuthority();
  const queryClient = useQueryClient();
  const { isPremium } = useSubscription();
  const refreshProContract = useRefreshProContract();

  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<{
    benefit: string;
  } | null>(null);

  const handleRedeem = async () => {
    if (!code.trim()) return;

    const normalizedCode = code.trim().toUpperCase();
    
    // [PRO_SOT] Log BEFORE state
    if (__DEV__) {
      devLog("[PRO_SOT] BEFORE screen=redeem_code isPremium=", isPremium);
      devLog("[P0_DISCOUNT_APPLY] START screen=redeem_code code=", normalizedCode.slice(0, 4) + "…");
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSubmitting(true);

    try {
      const response = await api.post<{
        success: boolean;
        benefit?: string;
        error?: string;
      }>("/api/discount/redeem", { code: normalizedCode });

      // [P0_DISCOUNT_APPLY] Guard: backend may return 200 with success=false
      if (!response.success) {
        if (__DEV__) {
          devLog("[P0_DISCOUNT_APPLY] ERROR screen=redeem_code success=false");
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        safeToast.error("Invalid Code", response.error || "This code is not valid.");
        return;
      }

      // [P0_DISCOUNT_APPLY] Code accepted — refresh pro state
      // Wrap in its own try/catch so refresh failures don't show "Invalid Code"
      try {
        const { rcIsPro, backendIsPro, combinedIsPro } = await refreshProContract({ reason: "promo_redeem:redeem_code" });

        // [PRO_SOT] Log AFTER state
        if (__DEV__) {
          devLog("[PRO_SOT] AFTER screen=redeem_code combinedIsPro=", combinedIsPro);
          devLog("[P0_DISCOUNT_APPLY] OK screen=redeem_code combinedIsPro=", combinedIsPro);
        }
      } catch (refreshErr) {
        if (__DEV__) {
          devLog("[P0_DISCOUNT_APPLY] REFRESH_ERROR screen=redeem_code (code was accepted)", refreshErr);
        }
      }

      // Success!
      setSuccessData({ benefit: response.benefit || "Premium access" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Show appropriate toast
      safeToast.success("Pro Active!", response.benefit || "You now have full access to all features");

      // Invalidate queries for UI refresh
      queryClient.invalidateQueries({ queryKey: ["entitlements"] });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["subscriptionDetails"] });

      // Navigate back after a delay
      setTimeout(() => {
        router.back();
      }, 2000);
    } catch (error: any) {
      if (__DEV__) {
        devLog("[PRO_SOT] ERROR screen=redeem_code", error?.message);
        devLog("[P0_DISCOUNT_APPLY] ERROR screen=redeem_code", error?.message);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      // Parse error from API response
      let errorMessage = "Something went wrong. Please try again.";
      if (error?.message) {
        try {
          const match = error.message.match(/\{.*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            errorMessage = parsed.error || errorMessage;
          }
        } catch {
          // Use default error message
        }
      }

      // Map status codes to mom-safe messages
      if (error?.status === 401) {
        safeToast.error("Authentication required", "Please log in again and try");
      } else if (error?.status === 404) {
        safeToast.error("Invalid code", "That code isn't valid");
      } else if (error?.status === 400) {
        safeToast.error("Invalid Code", errorMessage);
      } else {
        safeToast.error("Error", errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDisabled = !code.trim() || isSubmitting || bootStatus !== 'authed';

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }}
      edges={["top"]}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: colors.surface }}
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={{ color: colors.text }} className="text-xl font-bold">
          Redeem Code
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Icon */}
          <View className="items-center mb-6">
            <View
              className="w-20 h-20 rounded-full items-center justify-center"
              style={{ backgroundColor: `${themeColor}20` }}
            >
              <Tag size={40} color={themeColor} />
            </View>
          </View>

          {/* Description */}
          <Text
            className="text-center text-base mb-8"
            style={{ color: colors.textSecondary }}
          >
            Enter a code from your community to unlock premium
          </Text>

          {/* Input */}
          <View className="mb-6">
            <Text
              className="text-sm font-medium mb-2 ml-1"
              style={{ color: colors.text }}
            >
              Code
            </Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Enter code"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={32}
              editable={!isSubmitting && bootStatus === 'authed'}
              className="text-base font-medium px-4 py-3.5 rounded-xl"
              style={{
                backgroundColor: colors.surface,
                color: colors.text,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
          </View>

          {/* Success Message */}
          {successData && (
            <View
              className="rounded-xl p-4 mb-6"
              style={{ backgroundColor: "#10B98120" }}
            >
              <Text
                className="text-sm font-medium mb-1"
                style={{ color: "#10B981" }}
              >
                ✓ Premium Activated
              </Text>
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                {successData.benefit}
              </Text>
            </View>
          )}

          {/* Redeem Button */}
          <Pressable
            onPress={handleRedeem}
            disabled={isDisabled}
            className="rounded-xl py-4 items-center justify-center"
            style={{
              backgroundColor: isDisabled
                ? colors.textTertiary
                : themeColor,
              opacity: isDisabled ? 0.5 : 1,
            }}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-white text-base font-semibold">
                Redeem
              </Text>
            )}
          </Pressable>

          {/* Auth Gate Message */}
          {bootStatus !== 'authed' && (
            <Text
              className="text-center text-sm mt-4"
              style={{ color: colors.textSecondary }}
            >
              Please log in to redeem a code
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
