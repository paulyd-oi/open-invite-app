/**
 * BootLoading Component
 * 
 * Deterministic loading UI for boot/auth transitions.
 * INVARIANT: App must ALWAYS render something during boot - never null.
 * 
 * This component ensures E2E tests can detect boot state and
 * users never see a white screen.
 */

import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { devLog } from "@/lib/devLog";

interface BootLoadingProps {
  testID?: string;
  context?: string;
}

export function BootLoading({ testID = "boot-loading", context }: BootLoadingProps) {
  // DEV-only proof log
  if (__DEV__ && context) {
    devLog("[P0_BOOT_LOADING]", "Rendering boot loading UI, context:", context);
  }

  return (
    <View testID={testID} style={styles.container}>
      <ActivityIndicator size="large" color="#E85D4C" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF9F5",
  },
});
