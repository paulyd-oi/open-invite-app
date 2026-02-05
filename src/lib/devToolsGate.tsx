/**
 * Dev Tools Gate
 * 
 * Single source of truth for dev tool access control.
 * Blocks access to dev screens in production unless explicitly enabled.
 * 
 * To enable dev tools in production builds:
 *   EXPO_PUBLIC_DEV_TOOLS=1
 */

import React, { useRef } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useEffect } from "react";

/**
 * Check if dev tools are enabled.
 * Returns true if:
 *   - __DEV__ is true (development build)
 *   - EXPO_PUBLIC_DEV_TOOLS === "1" (explicit override)
 */
export function isDevToolsEnabled(): boolean {
  return __DEV__ || process.env.EXPO_PUBLIC_DEV_TOOLS === "1";
}

/**
 * Blocked screen component for production builds.
 * Immediately redirects to /settings (or /login if auth fails).
 * Shows minimal fallback UI while redirecting.
 * P0 FIX: Uses ref to prevent redirect loop.
 */
export function DevToolsBlockedScreen({ name }: { name: string }): React.ReactElement {
  const router = useRouter();
  const didRedirectRef = useRef(false);

  useEffect(() => {
    // P0 FIX: Redirect ONCE to settings - prevent loop
    if (!didRedirectRef.current) {
      didRedirectRef.current = true;
      router.replace("/settings");
    }
  }, [router]);

  // Minimal fallback while redirecting
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" }}>
      <Text style={{ color: "#666", fontSize: 14 }}>Not available</Text>
    </View>
  );
}
