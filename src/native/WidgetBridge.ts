/**
 * Widget Bridge — JS interface to native widget module
 *
 * Wraps NativeModules.WidgetBridge with safe no-op fallbacks
 * so the JS layer works even when the native module is not yet registered
 * (e.g., in Expo Go or before the native build includes the bridge).
 *
 * Platform behavior:
 *   iOS  — writes to App Group UserDefaults, reloads WidgetKit timelines
 *   Android — writes to SharedPreferences, triggers AppWidgetManager update
 */

import { NativeModules, Platform } from 'react-native';
import { devLog } from '@/lib/devLog';

// ─── Native Module Interface ─────────────────────────────────────────

interface WidgetBridgeNative {
  /** Write JSON payload to platform storage (App Group / SharedPrefs) */
  setTodayWidgetPayload(jsonString: string): Promise<boolean>;
  /** Reload native widget timelines/views */
  reloadTodayWidget(): Promise<boolean>;
}

// ─── Safe Accessor ───────────────────────────────────────────────────

function getNativeBridge(): WidgetBridgeNative | null {
  try {
    const bridge = NativeModules.WidgetBridge as WidgetBridgeNative | undefined;
    return bridge ?? null;
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Write the widget payload JSON to platform-specific storage.
 * Returns true if native bridge was available and succeeded.
 */
export async function setTodayWidgetPayload(jsonString: string): Promise<boolean> {
  const bridge = getNativeBridge();
  if (!bridge) {
    if (__DEV__) {
      devLog('[WidgetBridge] setTodayWidgetPayload — native module not available (no-op)', {
        platform: Platform.OS,
      });
    }
    return false;
  }

  try {
    return await bridge.setTodayWidgetPayload(jsonString);
  } catch (error) {
    if (__DEV__) {
      devLog('[WidgetBridge] setTodayWidgetPayload error', error);
    }
    return false;
  }
}

/**
 * Reload native widget timelines/views.
 * Returns true if native bridge was available and succeeded.
 */
export async function reloadTodayWidget(): Promise<boolean> {
  const bridge = getNativeBridge();
  if (!bridge) {
    if (__DEV__) {
      devLog('[WidgetBridge] reloadTodayWidget — native module not available (no-op)', {
        platform: Platform.OS,
      });
    }
    return false;
  }

  try {
    return await bridge.reloadTodayWidget();
  } catch (error) {
    if (__DEV__) {
      devLog('[WidgetBridge] reloadTodayWidget error', error);
    }
    return false;
  }
}
