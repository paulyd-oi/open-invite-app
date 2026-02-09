import React, { useState, useEffect } from "react";
import { View, Text, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, X } from "@/ui/icons";
import { useTheme } from "@/lib/ThemeContext";
import { BACKEND_URL } from "@/lib/config";
import * as Haptics from "expo-haptics";
import { isDevToolsEnabled, DevToolsBlockedScreen } from "@/lib/devToolsGate";
import { Button } from "@/ui/Button";

interface HealthResponse {
  ok: boolean;
  version: string;
  commit: string;
  dbOk: boolean;
  now: string;
}

type HealthStatus = "idle" | "loading" | "success" | "error";

export default function DebugHealthScreen() {
  // P0 FIX: All hooks MUST be called unconditionally before any early returns
  const router = useRouter();
  const { isDark, colors, themeColor } = useTheme();
  const [status, setStatus] = useState<HealthStatus>("idle");
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchHealth = async () => {
    setStatus("loading");
    setError(null);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(`${BACKEND_URL}/api/health`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: HealthResponse = await response.json();
      setHealthData(data);
      setStatus("success");
      setLastChecked(new Date());
    } catch (err: any) {
      clearTimeout(timeoutId);
      
      if (err.name === "AbortError") {
        setError("Request timed out after 10 seconds. Try again.");
      } else {
        setError(err.message || "Couldn't reach server. Try again.");
      }
      setStatus("error");
      setLastChecked(new Date());
    }
  };

  useEffect(() => {
    // Auto-fetch on mount (only if dev tools enabled)
    if (isDevToolsEnabled()) {
      fetchHealth();
    }
  }, []);

  // P0: Hard gate for dev tools - AFTER all hooks
  if (!isDevToolsEnabled()) return <DevToolsBlockedScreen name="debug/health" />;

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const handleRetry = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    fetchHealth();
  };

  // Determine status label and color
  let statusLabel = "Unknown";
  let statusColor = colors.textTertiary;
  
  if (status === "loading") {
    statusLabel = "Checking...";
    statusColor = colors.textSecondary;
  } else if (status === "success" && healthData) {
    if (healthData.ok && healthData.dbOk) {
      statusLabel = "Healthy";
      statusColor = "#10B981"; // green
    } else if (healthData.ok && !healthData.dbOk) {
      statusLabel = "Degraded";
      statusColor = "#F59E0B"; // amber
    } else {
      statusLabel = "Unhealthy";
      statusColor = "#EF4444"; // red
    }
  } else if (status === "error") {
    statusLabel = "Offline / Error";
    statusColor = "#EF4444"; // red
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.background }}>
        <Pressable
          onPress={handleBack}
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{
            backgroundColor: colors.surface,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: isDark ? 0 : 0.1,
            shadowRadius: 2,
          }}
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={{ color: colors.text }} className="text-xl font-sora-bold">Debug: Health</Text>
      </View>

      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        {/* Status Pill */}
        <View className="mt-6 items-center">
          <View
            className="px-6 py-3 rounded-full flex-row items-center"
            style={{ backgroundColor: `${statusColor}20` }}
          >
            {status === "loading" && (
              <ActivityIndicator size="small" color={statusColor} style={{ marginRight: 8 }} />
            )}
            <Text className="text-base font-semibold" style={{ color: statusColor }}>
              {statusLabel}
            </Text>
          </View>

          {lastChecked && (
            <Text className="text-sm mt-2" style={{ color: colors.textSecondary }}>
              Last checked: {lastChecked.toLocaleTimeString()}
            </Text>
          )}
        </View>

        {/* Health Data or Error */}
        {status === "success" && healthData && (
          <View className="mt-8">
            <DataRow label="Status" value={healthData.ok ? "OK" : "Not OK"} colors={colors} />
            <DataRow label="Version" value={healthData.version} colors={colors} />
            <DataRow label="Commit" value={healthData.commit} colors={colors} />
            <DataRow label="Database" value={healthData.dbOk ? "OK" : "Offline"} colors={colors} />
            <DataRow label="Server Time" value={healthData.now} colors={colors} />
          </View>
        )}

        {status === "error" && error && (
          <View
            className="mt-8 p-4 rounded-xl"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
          >
            <Text className="text-base font-medium mb-1" style={{ color: colors.text }}>
              Error
            </Text>
            <Text className="text-sm" style={{ color: colors.textSecondary }}>
              {error}
            </Text>
          </View>
        )}

        {/* Retry Button */}
        {status !== "loading" && (
          <Button
            variant="primary"
            label="Retry"
            onPress={handleRetry}
            style={{ marginTop: 24, borderRadius: 12 }}
          />
        )}

        {/* Backend URL Display */}
        <View className="mt-6 mb-6">
          <Text className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>
            Backend URL
          </Text>
          <Text className="text-xs" style={{ color: colors.textSecondary }}>
            {BACKEND_URL}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DataRow({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View
      className="flex-row justify-between py-3 px-4"
      style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}
    >
      <Text className="text-sm font-medium" style={{ color: colors.textSecondary }}>
        {label}
      </Text>
      <Text className="text-sm font-mono" style={{ color: colors.text }}>
        {value}
      </Text>
    </View>
  );
}
