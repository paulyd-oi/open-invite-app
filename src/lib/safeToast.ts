// src/lib/safeToast.ts
import { Alert } from "react-native";

/**
 * Safe toast API that never crashes.
 * Uses Alert.alert as fallback to guarantee runtime safety.
 * All screens can safely call safeToast.success/error/warning/info.
 * 
 * In __DEV__, logs to console for debugging.
 */
export const safeToast = {
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
