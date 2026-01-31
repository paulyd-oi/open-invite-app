// src/components/Toast.tsx
import React, { useEffect } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type ToastVariant = "success" | "info" | "warning" | "error";

export type ToastData = {
  id: string;
  title?: string;
  message: string;
  variant?: ToastVariant;
  durationMs?: number; // auto-dismiss
};

function getToastStyle(variant: ToastVariant) {
  switch (variant) {
    case "success":
      return { bg: "#16A34A", icon: "checkmark-circle-outline" as const };
    case "warning":
      return { bg: "#F59E0B", icon: "warning-outline" as const };
    case "error":
      return { bg: "#EF4444", icon: "close-circle-outline" as const };
    case "info":
    default:
      return { bg: "#3B82F6", icon: "information-circle-outline" as const };
  }
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss?: (id: string) => void;
}) {
  const variant: ToastVariant = toast.variant ?? "info";
  const { bg, icon } = getToastStyle(variant);

  useEffect(() => {
    const duration = toast.durationMs ?? 3500;
    if (!duration || duration <= 0) return;

    const t = setTimeout(() => onDismiss?.(toast.id), duration);
    return () => clearTimeout(t);
  }, [toast.durationMs, toast.id, onDismiss]);

  return (
    <Pressable
      onPress={() => onDismiss?.(toast.id)}
      style={[styles.toast, { backgroundColor: bg }]}
      accessibilityRole="button"
      accessibilityLabel={
        toast.title
          ? `${String(toast.title)}. ${String(toast.message ?? "")}`
          : String(toast.message ?? "")
      }
    >
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>

      <View style={styles.textWrap}>
        {!!toast.title && <Text style={styles.title}>{String(toast.title)}</Text>}
        <Text style={styles.message}>{String(toast.message ?? "")}</Text>
      </View>

      <View style={styles.closeWrap}>
        <Ionicons name="close" size={18} color="#fff" />
      </View>
    </Pressable>
  );
}

/**
 * ToastContainer
 * - Safe default: toasts = []
 * - Renders nothing if empty
 */
export function ToastContainer({
  toasts = [],
  onDismiss,
}: {
  toasts?: ToastData[];
  onDismiss?: (id: string) => void;
}) {
  if (!Array.isArray(toasts) || toasts.length === 0) return null;

  return (
    <View pointerEvents="box-none" style={styles.container}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 90, // above bottom nav
    gap: 10,
    zIndex: 9999,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  iconWrap: {
    width: 28,
    alignItems: "center",
    marginRight: 10,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  message: {
    color: "#fff",
    fontSize: 13,
    opacity: 0.95,
  },
  closeWrap: {
    width: 28,
    alignItems: "flex-end",
    marginLeft: 8,
  },
});

/**
 * Safe toast API that never crashes.
 * Uses Alert.alert as fallback to guarantee runtime safety.
 * All files can safely import and call safeToast.success/error/warning/info.
 */
export const toast = {
  success(title: string, message?: string) {
    if (__DEV__) console.log('[Toast Success]', title, message);
    Alert.alert(title, message ?? "");
  },
  error(title: string, message?: string) {
    if (__DEV__) console.error('[Toast Error]', title, message);
    Alert.alert(title, message ?? "");
  },
  warning(title: string, message?: string) {
    if (__DEV__) console.warn('[Toast Warning]', title, message);
    Alert.alert(title, message ?? "");
  },
  info(title: string, message?: string) {
    if (__DEV__) console.log('[Toast Info]', title, message);
    Alert.alert(title, message ?? "");
  },
};
