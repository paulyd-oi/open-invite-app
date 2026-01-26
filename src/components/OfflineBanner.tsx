import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { WifiOff, RefreshCw, Cloud } from "@/ui/icons";
import { useQueryClient } from "@tanstack/react-query";

import { useTheme } from "@/lib/ThemeContext";
import { useNetworkStatus } from "@/lib/networkStatus";
import { useIsSyncing, useSyncProgress } from "@/lib/offlineStore";
import { useBootAuthority } from "@/hooks/useBootAuthority";

/**
 * Unified Network Status Banner
 *
 * Shows different states:
 * 1. Degraded - "Reconnecting..." with retry option (auth bootstrap failed but had cached session)
 * 2. Offline - "You're offline — changes will sync when you're back online"
 * 3. Syncing - "Syncing..." with progress indicator
 * 4. Online - Hidden
 */
export function NetworkStatusBanner() {
  const { isOffline, refresh } = useNetworkStatus();
  const isSyncing = useIsSyncing();
  const syncProgress = useSyncProgress();
  const queryClient = useQueryClient();
  const { themeColor } = useTheme();
  const [isRetrying, setIsRetrying] = React.useState(false);
  const { status: bootStatus, retry: retryBootstrap } = useBootAuthority();

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const online = await refresh();
      if (online) {
        await queryClient.invalidateQueries();
      }
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDegradedRetry = async () => {
    setIsRetrying(true);
    try {
      await retryBootstrap();
    } finally {
      setIsRetrying(false);
    }
  };

  // Show reconnecting banner when in degraded state (auth bootstrap failed but using cached session)
  if (bootStatus === 'degraded') {
    return (
      <Animated.View
        entering={FadeInUp.springify()}
        exiting={FadeOutUp.springify()}
        className="absolute top-0 left-0 right-0 z-50"
        style={{
          backgroundColor: "#FEF3C7",
          paddingTop: 50, // Account for status bar
        }}
      >
        <View className="flex-row items-center justify-between px-4 py-3">
          <View className="flex-row items-center flex-1">
            <Cloud size={18} color="#D97706" />
            <Text className="ml-2 font-medium flex-1" style={{ color: "#B45309" }} numberOfLines={1}>
              Reconnecting...
            </Text>
          </View>
          <Pressable
            onPress={handleDegradedRetry}
            disabled={isRetrying}
            className="flex-row items-center px-3 py-1.5 rounded-full ml-2"
            style={{ backgroundColor: "#D97706" }}
          >
            <RefreshCw
              size={14}
              color="#fff"
              style={{ opacity: isRetrying ? 0.5 : 1 }}
            />
            <Text className="text-white text-sm font-medium ml-1">
              {isRetrying ? "..." : "Retry"}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  // Show syncing banner
  if (isSyncing) {
    return (
      <Animated.View
        entering={FadeInUp.springify()}
        exiting={FadeOutUp.springify()}
        className="absolute top-0 left-0 right-0 z-50"
        style={{
          backgroundColor: "#DBEAFE",
          paddingTop: 50, // Account for status bar
        }}
      >
        <View className="flex-row items-center justify-center px-4 py-3">
          <ActivityIndicator size="small" color="#2563EB" />
          <Text className="ml-2 font-medium" style={{ color: "#1D4ED8" }}>
            Syncing...
            {syncProgress && ` (${syncProgress.current}/${syncProgress.total})`}
          </Text>
        </View>
      </Animated.View>
    );
  }

  // Show offline banner
  if (isOffline) {
    return (
      <Animated.View
        entering={FadeInUp.springify()}
        exiting={FadeOutUp.springify()}
        className="absolute top-0 left-0 right-0 z-50"
        style={{
          backgroundColor: "#FEF3C7",
          paddingTop: 50, // Account for status bar
        }}
      >
        <View className="flex-row items-center justify-between px-4 py-3">
          <View className="flex-row items-center flex-1">
            <WifiOff size={18} color="#D97706" />
            <Text className="ml-2 font-medium flex-1" style={{ color: "#B45309" }} numberOfLines={1}>
              Offline — changes will sync when you're back
            </Text>
          </View>
          <Pressable
            onPress={handleRetry}
            disabled={isRetrying}
            className="flex-row items-center px-3 py-1.5 rounded-full ml-2"
            style={{ backgroundColor: "#D97706" }}
          >
            <RefreshCw
              size={14}
              color="#fff"
              style={{ opacity: isRetrying ? 0.5 : 1 }}
            />
            <Text className="text-white text-sm font-medium ml-1">
              {isRetrying ? "..." : "Retry"}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  return null;
}

/**
 * Legacy Offline Banner Component (for backwards compatibility)
 * @deprecated Use NetworkStatusBanner instead
 */
export function OfflineBanner() {
  return <NetworkStatusBanner />;
}

/**
 * Error fallback component for when API requests fail
 */
interface ErrorFallbackProps {
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorFallback({
  message = "Something went wrong",
  onRetry,
  compact = false,
}: ErrorFallbackProps) {
  const { colors, themeColor } = useTheme();

  if (compact) {
    return (
      <View className="flex-row items-center justify-center py-4 px-4">
        <Text className="text-sm mr-2" style={{ color: colors.textSecondary }}>
          {message}
        </Text>
        {onRetry && (
          <Pressable onPress={onRetry}>
            <Text className="text-sm font-medium" style={{ color: themeColor }}>
              Retry
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center p-8">
      <View
        className="w-16 h-16 rounded-full items-center justify-center mb-4"
        style={{ backgroundColor: `${themeColor}15` }}
      >
        <WifiOff size={28} color={themeColor} />
      </View>
      <Text className="font-semibold text-center mb-2" style={{ color: colors.text }}>
        {message}
      </Text>
      <Text className="text-sm text-center mb-4" style={{ color: colors.textSecondary }}>
        Please check your connection and try again
      </Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          className="px-6 py-2.5 rounded-full"
          style={{ backgroundColor: themeColor }}
        >
          <Text className="text-white font-semibold">Try Again</Text>
        </Pressable>
      )}
    </View>
  );
}
