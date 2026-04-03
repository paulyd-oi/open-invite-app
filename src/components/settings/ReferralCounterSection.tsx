import React, { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { Copy, Gift, ChevronDown, Check } from "@/ui/icons";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { api } from "@/lib/api";
import { safeToast } from "@/lib/safeToast";
import { qk } from "@/lib/queryKeys";
import { devLog } from "@/lib/devLog";

export function ReferralCounterSection({
  isDark,
  colors,
  themeColor,
}: {
  isDark: boolean;
  colors: { text: string; textSecondary: string; textTertiary: string; separator: string; surface: string; background: string };
  themeColor: string;
}) {
  const [referrerCodeInput, setReferrerCodeInput] = useState("");
  const [isApplyingCode, setIsApplyingCode] = useState(false);
  const [showReferrerInput, setShowReferrerInput] = useState(false);
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const authed = isAuthedForNetwork(bootStatus, session);
  if (__DEV__ && !authed) devLog('[P13_NET_GATE] tag="referralStats" blocked — not authed');

  const { data: referralStats, isLoading } = useQuery({
    queryKey: qk.referralStats(),
    queryFn: () => api.get<{
      referralCode: string;
      successfulReferrals: number;
      pendingReferrals: number;
      totalInvites: number;
      hasReferrer: boolean;
      nextReward: { type: string; remaining: number } | null;
    }>("/api/referral/stats"),
    enabled: authed,
  });

  const handleCopyCode = async () => {
    if (!referralStats?.referralCode) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(referralStats.referralCode);
    safeToast.success("Copied!", "Your referral code has been copied to clipboard");
  };

  const handleApplyReferrerCode = async () => {
    if (!referrerCodeInput.trim()) {
      safeToast.warning("Error", "Please enter a referral code");
      return;
    }

    setIsApplyingCode(true);
    try {
      const response = await api.post<{ success: boolean; referrerName: string; welcomeBonus: string }>("/api/referral/apply", {
        referralCode: referrerCodeInput.trim(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success(
        "Success!",
        `${response.referrerName} earned a referral credit.`
      );
      setReferrerCodeInput("");
      setShowReferrerInput(false);
      queryClient.invalidateQueries({ queryKey: qk.referralStats() });
    } catch (error: any) {
      const message = error?.message || "Failed to apply referral code";
      safeToast.error("Referral Failed", message);
    } finally {
      setIsApplyingCode(false);
    }
  };

  const hasReferrer = referralStats?.hasReferrer ?? false;

  return (
    <View className="p-4">
      {/* YOUR REFERRAL CODE - Big and prominent */}
      <View
        className="rounded-xl p-4 mb-4"
        style={{ backgroundColor: isDark ? "#1C2127" : "#F0FDF4", borderWidth: 1, borderColor: "#10B98140" }}
      >
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-sm font-medium" style={{ color: "#10B981" }}>YOUR REFERRAL CODE</Text>
          <Pressable
            onPress={handleCopyCode}
            className="flex-row items-center px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: "#10B98120" }}
          >
            <Copy size={14} color="#10B981" />
            <Text className="ml-1.5 text-sm font-medium" style={{ color: "#10B981" }}>Copy</Text>
          </Pressable>
        </View>
        <Text className="text-2xl font-black tracking-widest" style={{ color: colors.text }}>
          {isLoading ? "..." : referralStats?.referralCode ?? "---"}
        </Text>
        <Text className="text-xs mt-2" style={{ color: colors.textSecondary }}>
          Share your code so friends can find you on Open Invite
        </Text>
      </View>

      {/* ENTER REFERRER CODE SECTION */}
      {!hasReferrer && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.separator, paddingTop: 12 }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowReferrerInput(!showReferrerInput);
            }}
            className="flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              <View
                className="w-8 h-8 rounded-full items-center justify-center mr-2"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
              >
                <Gift size={16} color={themeColor} />
              </View>
              <Text className="text-sm font-medium" style={{ color: colors.text }}>
                Enter referrer's code
              </Text>
            </View>
            <ChevronDown
              size={16}
              color={colors.textTertiary}
              style={{ transform: [{ rotate: showReferrerInput ? "180deg" : "0deg" }] }}
            />
          </Pressable>

          {showReferrerInput && (
            <View className="mt-3">
              <Text className="text-xs mb-2" style={{ color: colors.textSecondary }}>
                If someone referred you, enter their code to give them credit.
              </Text>
              <View className="flex-row items-center">
                <TextInput
                  value={referrerCodeInput}
                  onChangeText={setReferrerCodeInput}
                  placeholder="Enter code (e.g. jdoe_a1b2)"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  className="flex-1 px-4 py-3 rounded-xl mr-2"
                  style={{
                    backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                    color: colors.text,
                  }}
                />
                <Pressable
                  onPress={handleApplyReferrerCode}
                  disabled={isApplyingCode || !referrerCodeInput.trim()}
                  className="px-4 py-3 rounded-xl"
                  style={{
                    backgroundColor: referrerCodeInput.trim() ? themeColor : isDark ? "#2C2C2E" : "#E5E7EB",
                  }}
                >
                  <Text
                    className="font-semibold"
                    style={{ color: referrerCodeInput.trim() ? "#FFFFFF" : colors.textTertiary }}
                  >
                    {isApplyingCode ? "..." : "Apply"}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}

      {hasReferrer && (
        <View className="flex-row items-center justify-center pt-2" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
          <Check size={14} color="#10B981" />
          <Text className="ml-1 text-xs" style={{ color: "#10B981" }}>
            You were referred by a friend!
          </Text>
        </View>
      )}
    </View>
  );
}
