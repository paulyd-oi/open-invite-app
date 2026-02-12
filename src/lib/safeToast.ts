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
 * Extract short requestId from an error object for DEV toast display.
 * Returns first 8 chars of the UUID, or empty string if not available.
 */
function extractShortReqId(source: unknown): string {
  if (source == null || typeof source !== "object") return "";
  const reqId = (source as Record<string, unknown>).requestId;
  if (typeof reqId !== "string" || reqId.length === 0) return "";
  return reqId.slice(0, 8);
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
 *
 * safeToast.error accepts an optional third argument (the originating error
 * object). In DEV builds, if the error carries a requestId (set by api.ts),
 * the short id is appended to the toast message for faster log correlation.
 */
export const safeToast = {
  success(title: unknown, message?: unknown) {
    const safeTitle = normalize(title);
    const safeMessage = normalize(message);
    if (__DEV__) devLog('[Toast Success]', safeTitle, safeMessage);
    Alert.alert(safeTitle, safeMessage);
  },
  error(title: unknown, message?: unknown, source?: unknown) {
    const safeTitle = normalize(title);
    let safeMessage = normalize(message);
    if (__DEV__) {
      const reqSnippet = extractShortReqId(source);
      if (reqSnippet) {
        safeMessage = safeMessage
          ? `${safeMessage} (req: ${reqSnippet})`
          : `(req: ${reqSnippet})`;
        devLog("[P0_TOAST_REQID]", { title: safeTitle, requestId: reqSnippet });
      }
      devError('[Toast Error]', safeTitle, safeMessage);
    }
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
