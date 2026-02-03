// src/lib/safeToast.ts
import { Alert } from "react-native";
import { devLog, devWarn, devError } from "./devLog";

/**
 * Normalize any input to a safe string for display.
 * Handles null, undefined, objects, errors, numbers, booleans.
 */
function normalize(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input;
  if (typeof input === "number" || typeof input === "boolean") return String(input);
  if (input instanceof Error) return input.message;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

/**
 * Safe toast API that never crashes.
 * Uses Alert.alert as fallback to guarantee runtime safety.
 * All screens can safely call safeToast.success/error/warning/info.
 * 
 * In __DEV__, logs to console for debugging.
 * 
 * INVARIANT: All inputs are normalized to strings before display.
 * Callers can pass any type without risk of crash.
 */
export const safeToast = {
  success(title: unknown, message?: unknown) {
    const safeTitle = normalize(title);
    const safeMessage = normalize(message);
    if (__DEV__) devLog('[Toast Success]', safeTitle, safeMessage);
    Alert.alert(safeTitle, safeMessage);
  },
  error(title: unknown, message?: unknown) {
    const safeTitle = normalize(title);
    const safeMessage = normalize(message);
    if (__DEV__) devError('[Toast Error]', safeTitle, safeMessage);
    Alert.alert(safeTitle, safeMessage);
  },
  warning(title: unknown, message?: unknown) {
    const safeTitle = normalize(title);
    const safeMessage = normalize(message);
    if (__DEV__) devWarn('[Toast Warning]', safeTitle, safeMessage);
    Alert.alert(safeTitle, safeMessage);
  },
  info(title: unknown, message?: unknown) {
    const safeTitle = normalize(title);
    const safeMessage = normalize(message);
    if (__DEV__) devLog('[Toast Info]', safeTitle, safeMessage);
    Alert.alert(safeTitle, safeMessage);
  },
};
