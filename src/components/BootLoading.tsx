/**
 * BootLoading Component
 * 
 * Deterministic loading UI for boot/auth transitions.
 * INVARIANT: App must ALWAYS render something during boot - never null.
 * 
 * This component ensures E2E tests can detect boot state and
 * users never see a white screen.
 */

import React, { useRef, useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { devLog } from "@/lib/devLog";

interface BootLoadingProps {
  testID?: string;
  context?: string;
  /** When false, overlay is hidden via opacity:0 + pointerEvents:'none'.
   *  Always mounted to avoid tree-swap reflow. */
  visible?: boolean;
}

export function BootLoading({ testID = "boot-loading", context, visible = true }: BootLoadingProps) {
  // [P0_BOOT_OVERLAY] DEV-only: log visibility transitions
  const prevVisibleRef = useRef(visible);
  useEffect(() => {
    if (__DEV__ && prevVisibleRef.current !== visible) {
      devLog('[P0_BOOT_OVERLAY]', `visible ${prevVisibleRef.current} → ${visible} (position: absolute, no layout impact)`);
      prevVisibleRef.current = visible;
    }
  }, [visible]);

  // DEV-only proof log
  if (__DEV__ && context) {
    devLog("[P0_BOOT_CONTRACT]", "Rendering boot loading UI, context:", context);
  }

  return (
    <View
      testID={testID}
      style={[styles.container, { opacity: visible ? 1 : 0 }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <ActivityIndicator size="large" color="#E85D4C" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // [P0_AUTH_JITTER] Absolute overlay to fully cover RootLayoutNav during initial boot.
    // Prevents split-screen flash (BootLoading + welcome visible simultaneously).
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 900,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
});
