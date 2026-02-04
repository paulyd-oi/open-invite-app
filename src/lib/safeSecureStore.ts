/**
 * Safe SecureStore Wrapper
 *
 * Wraps expo-secure-store operations with try/catch to prevent
 * Keychain/SecureStore exceptions from crashing the app.
 *
 * All operations return safe defaults on failure:
 * - getItemAsync: returns null
 * - setItemAsync: returns false (success indicator)
 * - deleteItemAsync: returns false (success indicator)
 *
 * DEV-only logging with tag [P0_SECURESTORE] for caught exceptions.
 */

import * as SecureStore from "expo-secure-store";
import { devError } from "./devLog";

/**
 * Safe wrapper for SecureStore.getItemAsync
 * Returns null on any error (Keychain unavailable, etc.)
 */
export async function safeGetItemAsync(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    if (__DEV__) {
      devError("[P0_SECURESTORE]", `getItemAsync failed for key="${key}"`, error);
    }
    return null;
  }
}

/**
 * Safe wrapper for SecureStore.setItemAsync
 * Returns true on success, false on any error
 */
export async function safeSetItemAsync(key: string, value: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(key, value);
    return true;
  } catch (error) {
    if (__DEV__) {
      devError("[P0_SECURESTORE]", `setItemAsync failed for key="${key}"`, error);
    }
    return false;
  }
}

/**
 * Safe wrapper for SecureStore.deleteItemAsync
 * Returns true on success (or if key didn't exist), false on error
 */
export async function safeDeleteItemAsync(key: string): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(key);
    return true;
  } catch (error) {
    if (__DEV__) {
      devError("[P0_SECURESTORE]", `deleteItemAsync failed for key="${key}"`, error);
    }
    return false;
  }
}
