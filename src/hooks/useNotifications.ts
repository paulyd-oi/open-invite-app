// Hook for managing push notifications
import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import type { EventSubscription } from "expo-modules-core";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { registerForPushNotificationsAsync } from "@/lib/notifications";
import { api } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isValidExpoPushToken, getTokenPrefix } from "@/lib/push/validatePushToken";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { eventKeys } from "@/lib/eventQueryKeys";
import { circleKeys } from "@/lib/circleQueryKeys";
import { refreshCircleListContract } from "@/lib/circleRefreshContract";
import { handlePushEvent } from "@/lib/pushRouter";
import { recordPushReceipt } from "@/lib/push/pushReceiptStore";

// Throttle token registration to once per 24 hours per user
// CRITICAL: Key is user-scoped to prevent cross-account registration blocking
const TOKEN_REGISTRATION_KEY_PREFIX = "push_token_last_registered:";
const TOKEN_REGISTRATION_THROTTLE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Helper to build user-scoped throttle key
function getThrottleKey(userId: string | undefined): string | null {
  if (!userId) return null;
  return `${TOKEN_REGISTRATION_KEY_PREFIX}${userId}`;
}

// Track if push proof diagnostic has run this session (cold start only)
let pushProofDiagnosticRan = false;

// Track last userId we registered for (to detect account switches)
let lastRegisteredUserId: string | null = null;

/**
 * P0_PUSH_REG: Reset module-level push registration state.
 * MUST be called on logout so the next login triggers a fresh registration
 * regardless of throttle or same-user re-login.
 *
 * Clears:
 *   - lastRegisteredUserId (so next login is treated as fresh, not throttled)
 *   - pushProofDiagnosticRan (so DEV proof runs again on next login)
 *   - AsyncStorage throttle stamp for the given userId
 */
export async function resetPushRegistrationState(userId?: string): Promise<void> {
  const prevUser = lastRegisteredUserId;
  lastRegisteredUserId = null;
  pushProofDiagnosticRan = false;

  // Clear throttle stamp for the logging-out user (or prevUser if no userId given)
  const clearId = userId ?? prevUser;
  if (clearId) {
    const key = getThrottleKey(clearId);
    if (key) {
      try {
        await AsyncStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }

  if (__DEV__) {
    devLog(`[P0_PUSH_REG] RESET_STATE prevUser=${prevUser?.substring(0, 8) ?? "null"} clearedThrottle=${clearId?.substring(0, 8) ?? "null"}`);
  }
}

/**
 * P0_PUSH_REG: Verify backend token state via GET /api/push/me
 * Returns { activeCount, totalCount, lastSeenAt } or null on error
 */
async function verifyPushMe(): Promise<{
  activeCount: number;
  totalCount: number;
  lastSeenAt: string | null;
} | null> {
  try {
    const response = await api.get<{
      activeCount?: number;
      totalCount?: number;
      tokens?: Array<{ isActive?: boolean; tokenSuffix?: string; lastSeenAt?: string }>;
      _meta?: Record<string, unknown>;
    }>("/api/push/me");
    const tokens = response?.tokens ?? [];
    // [P0_PUSH_ME_ACTIVECOUNT_SSOT] Use backend activeCount when provided,
    // fall back to client-side derivation for older backends
    const activeCount = typeof response?.activeCount === "number"
      ? response.activeCount
      : tokens.filter((t) => t.isActive === true).length;
    const totalCount = typeof response?.totalCount === "number"
      ? response.totalCount
      : tokens.length;
    const latestActive = tokens
      .filter((t) => t.isActive === true)
      .map((t) => t.lastSeenAt)
      .filter(Boolean)
      .sort()
      .pop() ?? null;
    return {
      activeCount,
      totalCount,
      lastSeenAt: latestActive,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve EAS projectId with explicit fallback chain.
 * Used for getExpoPushTokenAsync({ projectId }).
 * 
 * Fallback order:
 * 1. Constants.easConfig?.projectId (set by EAS build)
 * 2. Constants.expoConfig?.extra?.eas?.projectId (app.json extra)
 * 3. Constants.expoConfig?.extra?.projectId (legacy fallback)
 * 
 * @returns projectId string or undefined if not found
 */
function resolveProjectId(): string | undefined {
  const p1 = Constants?.easConfig?.projectId;
  if (p1) return p1;
  
  const p2 = Constants?.expoConfig?.extra?.eas?.projectId;
  if (p2) return p2;
  
  const p3 = Constants?.expoConfig?.extra?.projectId;
  if (p3) return p3;
  
  return undefined;
}

/**
 * DEV ONLY: Push Registration Proof Diagnostic
 * 
 * Runs ONCE per cold start when user is authed.
 * Produces detailed console logs proving:
 * 1. Permission status
 * 2. ProjectId used
 * 3. Token obtained (prefix + length only)
 * 4. Token validation result
 * 5. POST /api/push/register result (status + body)
 * 6. GET /api/push/me result (status + body)
 * 
 * Look for lines starting with [PUSH_PROOF] in console.
 */
async function runPushRegistrationProof(): Promise<void> {
  if (!__DEV__) return;
  if (pushProofDiagnosticRan) return;
  pushProofDiagnosticRan = true;

  const LOG_PREFIX = "[PUSH_PROOF]";
  devLog(`${LOG_PREFIX} ========== PUSH REGISTRATION PROOF START ==========`);

  try {
    // Step 1: Device check
    const isPhysicalDevice = Device.isDevice;
    devLog(`${LOG_PREFIX} 1. isPhysicalDevice: ${isPhysicalDevice}`);
    if (!isPhysicalDevice) {
      devLog(`${LOG_PREFIX} ❌ ABORT: Not a physical device (simulator cannot get real tokens)`);
      return;
    }

    // Step 2: Permission status
    const { status: permissionStatus } = await Notifications.getPermissionsAsync();
    devLog(`${LOG_PREFIX} 2. permissionStatus: ${permissionStatus}`);
    if (permissionStatus !== "granted") {
      devLog(`${LOG_PREFIX} ❌ ABORT: Permission not granted (cannot fetch token)`);
      return;
    }

    // Step 3: ProjectId (using shared resolver)
    const projectId = resolveProjectId();
    devLog(`${LOG_PREFIX} 3. projectId: ${projectId || "NOT_FOUND"}`);
    if (!projectId) {
      devLog(`${LOG_PREFIX} ❌ ABORT: No projectId found`);
      return;
    }

    // Step 4: Get token
    devLog(`${LOG_PREFIX} 4. Fetching Expo push token...`);
    let token: string;
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      token = tokenData.data;
    } catch (tokenErr) {
      devLog(`${LOG_PREFIX} ❌ ABORT: getExpoPushTokenAsync failed:`, tokenErr);
      return;
    }

    const tokenPrefix = getTokenPrefix(token);
    const tokenLength = token?.length ?? 0;
    devLog(`${LOG_PREFIX}    tokenPrefix: ${tokenPrefix}`);
    devLog(`${LOG_PREFIX}    tokenLength: ${tokenLength}`);

    // Step 5: Validate token
    const isValid = isValidExpoPushToken(token);
    devLog(`${LOG_PREFIX} 5. isValidExpoPushToken: ${isValid}`);
    if (!isValid) {
      devLog(`${LOG_PREFIX} ❌ ABORT: Token failed validation (placeholder/mock/too-short)`);
      return;
    }

    // Step 6: POST /api/push/register
    devLog(`${LOG_PREFIX} 6. POST /api/push/register ...`);
    const PUSH_REGISTER_ROUTE = "/api/push/register";
    let postResult: { status: number; body: unknown };
    try {
      const response = await api.post<{ ok?: boolean; error?: string }>(PUSH_REGISTER_ROUTE, {
        token,
        platform: "expo",
      });
      postResult = { status: 200, body: response };
      devLog(`${LOG_PREFIX}    POST status: 200`);
      devLog(`${LOG_PREFIX}    POST body: ${JSON.stringify(response)}`);
    } catch (postErr: any) {
      const status = postErr?.status ?? postErr?.statusCode ?? "unknown";
      const body = postErr?.data ?? postErr?.message ?? String(postErr);
      postResult = { status: typeof status === "number" ? status : 500, body };
      if (status === 401) {
        devLog(`${LOG_PREFIX}    POST 401 UNAUTHORIZED - auth cookie missing or invalid`);
      } else {
        devLog(`${LOG_PREFIX}    POST status: ${status}`);
      }
      devLog(`${LOG_PREFIX}    POST error body: ${JSON.stringify(body)}`);
    }

    // Step 7: GET /api/push/me (verify backend state)
    devLog(`${LOG_PREFIX} 7. GET /api/push/me ...`);
    try {
      const meResponse = await api.get<{ tokens?: Array<{ tokenPrefix?: string; tokenSuffix?: string; isActive?: boolean }> }>("/api/push/me");
      devLog(`${LOG_PREFIX}    GET status: 200`);
      devLog(`${LOG_PREFIX}    GET body: ${JSON.stringify(meResponse)}`);

      // Check for expected token
      const tokens = meResponse?.tokens ?? [];
      const matchingToken = tokens.find((t) => tokenPrefix.includes(t.tokenPrefix?.substring(0, 20) ?? ""));
      if (tokens.length === 0) {
        devLog(`${LOG_PREFIX}    ⚠️ No tokens in response`);
      } else if (matchingToken?.isActive) {
        devLog(`${LOG_PREFIX}    ✅ Token found and isActive=true`);
      } else {
        devLog(`${LOG_PREFIX}    ⚠️ Token found but isActive=${matchingToken?.isActive ?? "N/A"}`);
      }
    } catch (getErr: any) {
      const status = getErr?.status ?? getErr?.statusCode ?? "unknown";
      const body = getErr?.data ?? getErr?.message ?? String(getErr);
      devLog(`${LOG_PREFIX}    GET status: ${status}`);
      devLog(`${LOG_PREFIX}    GET error body: ${JSON.stringify(body)}`);
    }

    devLog(`${LOG_PREFIX} ========== PUSH REGISTRATION PROOF END ==========`);
  } catch (err) {
    devLog(`${LOG_PREFIX} UNEXPECTED ERROR:`, err);
  }
}

// Track if we've already processed the cold start notification
let coldStartNotificationProcessed = false;

// P0_PUSH_TAP: Dedupe notification response handling (module-level)
// Prevents double-navigation when both listener and getLastNotificationResponseAsync fire
const handledResponseIds = new Set<string>();

// P0_PUSH_TAP: Generate unique ID for a notification response
function getResponseId(response: Notifications.NotificationResponse): string {
  const requestId = response.notification.request.identifier;
  const actionId = response.actionIdentifier;
  return `${requestId}:${actionId}`;
}

// P0_PUSH_TAP: Allowed route prefixes for deep-linking (security allowlist)
const ALLOWED_ROUTE_PREFIXES = ['/event/', '/user/', '/circle/', '/friends'];

// P0_PUSH_TAP: Check if a route path is allowed
function isAllowedRoute(route: string): boolean {
  if (!route || typeof route !== 'string') return false;
  return ALLOWED_ROUTE_PREFIXES.some(prefix => route.startsWith(prefix));
}

/**
 * P0_PUSH_TAP: ROUTING TABLE for notification tap navigation
 * Single source of truth for all push notification deep-linking.
 * 
 * Returns: { route: string | null, fallbackUsed: boolean, reason: string }
 */
function resolveNotificationRoute(data: Record<string, any> | undefined): {
  route: string | null;
  fallbackUsed: boolean;
  reason: string;
} {
  if (!data) {
    return { route: null, fallbackUsed: true, reason: "no_data" };
  }

  const type = data?.type;
  const eventId = data?.eventId || data?.event_id; // Support both key formats
  const friendId = data?.friendId || data?.friend_id;
  const userId = data?.userId || data?.user_id || data?.actorId || data?.actor_id || data?.senderId || data?.sender_id;
  const circleId = data?.circleId || data?.circle_id;

  // ROUTING TABLE (ordered by specificity)
  
  // 1. Event-related notifications → /event/:id
  if (
    type === "new_event" ||
    type === "event_update" ||
    type === "event_reminder" ||
    type === "reminder" ||
    type === "event_join" ||
    type === "new_attendee" ||
    type === "event_comment" ||
    type === "comment" ||
    type === "join_request" ||
    type === "join_accepted" ||
    type === "event_interest" ||
    type === "someones_interested"
  ) {
    if (eventId) {
      return { route: `/event/${eventId}`, fallbackUsed: false, reason: `type_${type}` };
    }
    // Event type but no eventId - fall through to fallbacks
  }

  // 2. Friend request → user profile
  if (type === "friend_request") {
    if (userId) {
      return { route: `/user/${userId}`, fallbackUsed: false, reason: "friend_request_user" };
    }
    return { route: "/friends", fallbackUsed: true, reason: "friend_request_no_user" };
  }

  // 3. Friend accepted → user profile
  if (type === "friend_accepted") {
    if (friendId) {
      return { route: `/user/${friendId}`, fallbackUsed: false, reason: "friend_accepted_friend" };
    }
    if (userId) {
      return { route: `/user/${userId}`, fallbackUsed: false, reason: "friend_accepted_user" };
    }
    return { route: "/friends", fallbackUsed: true, reason: "friend_accepted_no_target" };
  }

  // 4. Circle message → circle chat
  if (type === "circle_message" && circleId) {
    return { route: `/circle/${circleId}`, fallbackUsed: false, reason: "circle_message" };
  }

  // 5. Backend-provided route (allowlist enforced for security)
  const backendRoute = data?.route || data?.path;
  if (backendRoute && typeof backendRoute === 'string' && isAllowedRoute(backendRoute)) {
    return { route: backendRoute, fallbackUsed: false, reason: "backend_provided_route" };
  }

  // FALLBACK CHAIN (when type doesn't match or is missing)
  
  // Fallback A: If eventId present, go to event
  if (eventId) {
    return { route: `/event/${eventId}`, fallbackUsed: true, reason: "fallback_eventId" };
  }

  // Fallback B: If userId present, go to user profile
  if (userId) {
    return { route: `/user/${userId}`, fallbackUsed: true, reason: "fallback_userId" };
  }

  // Fallback C: If circleId present, go to circle
  if (circleId) {
    return { route: `/circle/${circleId}`, fallbackUsed: true, reason: "fallback_circleId" };
  }

  // No valid navigation target
  return { route: null, fallbackUsed: true, reason: "no_valid_target" };
}

export function useNotifications() {
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>();
  const [notification, setNotification] = useState<Notifications.Notification | undefined>();
  const notificationListener = useRef<EventSubscription | null>(null);
  const responseListener = useRef<EventSubscription | null>(null);
  const lastPermissionStatus = useRef<string | null>(null);
  const registrationAttempted = useRef<boolean>(false);
  const coldStartChecked = useRef<boolean>(false);
  
  // P0_PUSH_TAP: Pending deep link for deferred navigation
  // Stores { route, source } when tap is received before app is ready to navigate
  const pendingDeepLink = useRef<{ route: string; source: 'cold_start' | 'listener' } | null>(null);
  const pendingDeepLinkReplayed = useRef<boolean>(false);

  /**
   * Check if token registration is throttled for current user
   * P0_PUSH_REG: User-scoped to prevent cross-account registration blocking
   */
  const isRegistrationThrottled = useCallback(async (): Promise<boolean> => {
    try {
      const userId = session?.user?.id;
      const userIdPrefix = userId?.substring(0, 8) ?? "none";
      const throttleKey = getThrottleKey(userId);
      if (!throttleKey) {
        devLog(`[P0_PUSH_REG] THROTTLE_CHECK userId=${userIdPrefix}... result=false (no key)`);
        return false;
      }
      
      const lastRegistered = await AsyncStorage.getItem(throttleKey);
      if (!lastRegistered) {
        devLog(`[P0_PUSH_REG] THROTTLE_CHECK userId=${userIdPrefix}... result=false (no timestamp)`);
        return false;
      }
      
      const elapsed = Date.now() - parseInt(lastRegistered, 10);
      const throttled = elapsed < TOKEN_REGISTRATION_THROTTLE_MS;
      devLog(`[P0_PUSH_REG] THROTTLE_CHECK userId=${userIdPrefix}... elapsed=${Math.round(elapsed/1000)}s result=${throttled}`);
      return throttled;
    } catch {
      return false;
    }
  }, [session?.user?.id]);

  /**
   * Mark token as registered (for throttling) - user-scoped
   */
  const markTokenRegistered = useCallback(async () => {
    try {
      const userId = session?.user?.id;
      const throttleKey = getThrottleKey(userId);
      if (!throttleKey) {
        devLog("[P0_PUSH_REG] No userId - cannot mark registered");
        return;
      }
      await AsyncStorage.setItem(throttleKey, Date.now().toString());
      devLog(`[P0_PUSH_REG] THROTTLE_MARKED userId=${userId?.substring(0, 8)}...`);
    } catch {
      // Ignore storage errors
    }
  }, [session?.user?.id]);

  /**
   * P0_PUSH_REG: SINGLE SOURCE OF TRUTH for push token registration
   * 
   * CONTRACT: Once bootStatus === 'authed', the current user MUST have an active
   * token registered in backend within N seconds, unless OS permission is denied.
   * 
   * KEY IMPROVEMENT: Throttle is bypassed if backend shows activeCount=0
   * This prevents stale throttle from masking missing tokens.
   */
  const checkAndRegisterToken = useCallback(async (forceRegister = false) => {
    const userId = session?.user?.id;
    const userIdPrefix = userId?.substring(0, 8) ?? "none";
    
    // INVARIANT: Only register when fully authenticated
    if (bootStatus !== 'authed' || !session?.user) {
      if (__DEV__) {
        devLog(`[P0_PUSH_REG] SKIP reason=NOT_AUTHED bootStatus=${bootStatus} hasUser=${!!session?.user}`);
        recordPushReceipt("register_skip", userIdPrefix, { reason: "NOT_AUTHED", bootStatus });
      }
      return;
    }

    try {
      // Step 1: Check current permission status
      let { status } = await Notifications.getPermissionsAsync();
      
      if (__DEV__) {
        devLog(`[P0_PUSH_REG] PERMISSION_CHECK userId=${userIdPrefix}... status=${status}`);
      }

      // Step 2: If undetermined AND forceRegister, REQUEST permission (not just read)
      if (status === 'undetermined' && forceRegister) {
        if (__DEV__) {
          devLog(`[P0_PUSH_REG] PERMISSION_REQUEST userId=${userIdPrefix}...`);
        }
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        status = newStatus;
        if (__DEV__) {
          devLog(`[P0_PUSH_REG] PERMISSION_RESULT userId=${userIdPrefix}... status=${status}`);
        }
      } else if (status === 'undetermined' && !forceRegister) {
        // Permission undetermined and not forcing - skip without prompting
        if (__DEV__) {
          devLog(`[P0_PUSH_REG] SKIP reason=PERMISSION_UNDETERMINED userId=${userIdPrefix}...`);
        }
        lastPermissionStatus.current = status;
        return;
      }

      const permissionChanged = status !== lastPermissionStatus.current;
      const wasGranted = lastPermissionStatus.current === "granted";
      const isAccountSwitch = userId !== lastRegisteredUserId && lastRegisteredUserId !== null;

      // Handle permission revocation
      if (status !== "granted" && wasGranted) {
        if (__DEV__) {
          devLog(`[P0_PUSH_REG] PERMISSION_REVOKED userId=${userIdPrefix}...`);
        }
        await api.post("/api/notifications/status", {
          pushPermissionStatus: "denied",
        });
        lastPermissionStatus.current = status;
        return;
      }

      // Handle denied/undetermined
      if (status !== "granted") {
        if (__DEV__) {
          devLog(`[P0_PUSH_REG] SKIP reason=PERMISSION_${status.toUpperCase()} userId=${userIdPrefix}...`);
        }
        await api.post("/api/notifications/status", {
          pushPermissionStatus: status === "denied" ? "denied" : "undetermined",
        }).catch(() => {});
        lastPermissionStatus.current = status;
        return;
      }

      // Permission is granted - now check throttle with backend verification
      let shouldRegister = forceRegister || permissionChanged || isAccountSwitch;
      let throttleBypassReason: string | null = null;
      
      if (!shouldRegister) {
        // Check throttle
        const throttled = await isRegistrationThrottled();
        
        if (throttled) {
          // KEY FIX: Even if throttled, check backend state
          // If backend has 0 active tokens, bypass throttle
          if (__DEV__) {
            devLog(`[P0_PUSH_REG] THROTTLED userId=${userIdPrefix}... checking backend state...`);
          }
          
          const backendState = await verifyPushMe();
          if (backendState && backendState.activeCount === 0) {
            // BYPASS THROTTLE: Backend has no active tokens!
            shouldRegister = true;
            throttleBypassReason = "BACKEND_EMPTY";
            if (__DEV__) {
              devLog(`[P0_PUSH_REG] THROTTLE_BYPASS reason=BACKEND_EMPTY userId=${userIdPrefix}... activeCount=0 totalCount=${backendState.totalCount}`);
              devLog("[P0_PUSH_ME_TRUTH]", {
                decision: "ATTEMPT",
                activeCount: backendState.activeCount,
                totalCount: backendState.totalCount,
                reason: "BACKEND_EMPTY",
                force: forceRegister,
                isFreshLogin: false,
              });
            }
          } else if (backendState) {
            // Backend has active tokens, respect throttle
            if (__DEV__) {
              devLog(`[P0_PUSH_REG] SKIP reason=THROTTLED userId=${userIdPrefix}... backendActiveCount=${backendState.activeCount}`);
              devLog("[P0_PUSH_ME_TRUTH]", {
                decision: "THROTTLE_SKIP",
                activeCount: backendState.activeCount,
                totalCount: backendState.totalCount,
                reason: "THROTTLED_ACTIVE_EXISTS",
                force: forceRegister,
                isFreshLogin: false,
              });
            }
            lastPermissionStatus.current = status;
            return;
          } else {
            // Backend verification failed, respect throttle to be safe
            if (__DEV__) {
              devLog(`[P0_PUSH_REG] SKIP reason=THROTTLED_VERIFY_FAILED userId=${userIdPrefix}...`);
              devLog("[P0_PUSH_ME_TRUTH]", {
                decision: "THROTTLE_SKIP",
                activeCount: -1,
                totalCount: -1,
                reason: "VERIFY_FAILED",
                force: forceRegister,
                isFreshLogin: false,
              });
            }
            lastPermissionStatus.current = status;
            return;
          }
        } else {
          shouldRegister = true;
        }
      }

      if (!shouldRegister) {
        lastPermissionStatus.current = status;
        return;
      }

      // Log registration attempt context
      if (__DEV__) {
        devLog(`[P0_PUSH_REG] ATTEMPT userId=${userIdPrefix}... force=${forceRegister} permChange=${permissionChanged} accountSwitch=${isAccountSwitch} throttleBypass=${throttleBypassReason ?? "none"}`);
        recordPushReceipt("register_attempt", userIdPrefix, { reason: forceRegister ? "force" : isAccountSwitch ? "account_switch" : throttleBypassReason ?? "normal", force: forceRegister });
        // [P0_PUSH_ME_TRUTH] Emit proof log at registration decision point
        // (only when not already emitted from throttle bypass path above)
        if (!throttleBypassReason) {
          devLog("[P0_PUSH_ME_TRUTH]", {
            decision: "ATTEMPT",
            activeCount: -1,
            totalCount: -1,
            reason: forceRegister ? "force" : permissionChanged ? "perm_changed" : isAccountSwitch ? "account_switch" : "not_throttled",
            force: forceRegister,
            isFreshLogin: lastRegisteredUserId === null,
          });
        }
      }

      const token = await registerForPushNotificationsAsync();
      
      // Validate token before sending to backend
      if (token && isValidExpoPushToken(token)) {
        setExpoPushToken(token);
        const tokenSuffix = token.slice(-6);

        if (__DEV__) {
          devLog(`[P0_PUSH_REG] TOKEN_VALID userId=${userIdPrefix}... tokenSuffix=${tokenSuffix}`);
        }

        // Send token to backend with retry
        const PUSH_REGISTER_ROUTE = "/api/push/register";
        let registerSuccess = false;
        let lastError: any = null;
        
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            await api.post(PUSH_REGISTER_ROUTE, {
              token,
              platform: "expo",
            });
            registerSuccess = true;
            if (__DEV__) {
              devLog(`[P0_PUSH_REG] REGISTER_SUCCESS userId=${userIdPrefix}... attempt=${attempt} tokenSuffix=${tokenSuffix}`);
              recordPushReceipt("register_success", userIdPrefix, { tokenSuffix, attempt });
            }
            break;
          } catch (regErr: any) {
            lastError = regErr;
            const errStatus = regErr?.status ?? regErr?.statusCode ?? "unknown";
            if (__DEV__) {
              devLog(`[P0_PUSH_REG] REGISTER_RETRY userId=${userIdPrefix}... attempt=${attempt} status=${errStatus}`);
            }
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, 1000));
            }
          }
        }
        
        if (!registerSuccess) {
          const errStatus = lastError?.status ?? lastError?.statusCode ?? "unknown";
          if (__DEV__) {
            devLog(`[P0_PUSH_REG] REGISTER_FAILED userId=${userIdPrefix}... status=${errStatus}`);
          }
        }

        // Update backend with permission status
        await api.post("/api/notifications/status", {
          pushPermissionStatus: "granted",
        }).catch(() => {});

        // Mark as registered for throttling
        await markTokenRegistered();
        registrationAttempted.current = true;
        lastRegisteredUserId = userId ?? null;

        // PROOF: Verify backend state after registration
        if (__DEV__) {
          const verifyState = await verifyPushMe();
          if (verifyState) {
            devLog(`[P0_PUSH_REG] VERIFY_BACKEND userId=${userIdPrefix}... activeCount=${verifyState.activeCount} totalCount=${verifyState.totalCount} lastSeenAt=${verifyState.lastSeenAt ?? "null"}`);
            if (verifyState.activeCount === 0) {
              devLog(`[P0_PUSH_REG] ⚠️ WARNING: Backend still shows 0 active tokens after registration!`);
            } else {
              devLog(`[P0_PUSH_REG] ✓ COMPLETE userId=${userIdPrefix}... success=${registerSuccess} activeCount=${verifyState.activeCount}`);
            }
          } else {
            devLog(`[P0_PUSH_REG] VERIFY_FAILED userId=${userIdPrefix}... could not reach /api/push/me`);
          }
        }
      } else if (token) {
        // Token exists but failed validation
        if (__DEV__) {
          devLog(`[P0_PUSH_REG] TOKEN_INVALID userId=${userIdPrefix}... tokenPrefix=${getTokenPrefix(token)}`);
        }
        await api.post("/api/notifications/status", {
          pushPermissionStatus: "granted",
        }).catch(() => {});
      } else {
        // No token (simulator or unsupported device)
        if (__DEV__) {
          devLog(`[P0_PUSH_REG] SKIP reason=NO_TOKEN userId=${userIdPrefix}... (simulator/unsupported)`);
          recordPushReceipt("register_skip", userIdPrefix, { reason: "NO_TOKEN" });
        }
      }

      lastPermissionStatus.current = status;
    } catch (error) {
      const userId = session?.user?.id;
      const userIdPrefix = userId?.substring(0, 8) ?? "none";
      if (__DEV__) {
        devError(`[P0_PUSH_REG] EXCEPTION userId=${userIdPrefix}...`, error);
      }
    }
  }, [bootStatus, session?.user, isRegistrationThrottled, markTokenRegistered]);

  // P0_PUSH_REG: Initial registration and AppState listener
  // CRITICAL: Gate on bootStatus === 'authed' AND runs when userId changes (account switch)
  // After logout, resetPushRegistrationState() clears lastRegisteredUserId,
  // so the next boot-authed always forces registration (no stale throttle).
  useEffect(() => {
    const userId = session?.user?.id;
    const userIdPrefix = userId?.substring(0, 8) ?? "none";
    
    if (bootStatus !== 'authed' || !session?.user) {
      if (__DEV__ && bootStatus !== 'authed') {
        devLog(`[P0_PUSH_REG] WAIT bootStatus=${bootStatus}`);
      }
      // Reset ref when leaving authed (logout)
      registrationAttempted.current = false;
      return;
    }

    // Detect fresh login vs account switch
    const isAccountSwitch = userId !== lastRegisteredUserId && lastRegisteredUserId !== null;
    const isFreshLogin = lastRegisteredUserId === null; // cleared by resetPushRegistrationState
    
    // Force registration on fresh login or account switch (bypass throttle)
    const shouldForce = isFreshLogin || isAccountSwitch;
    
    // Initial check
    if (__DEV__) {
      devLog(`[P0_PUSH_REG] BOOT_AUTHED userId=${userIdPrefix}... isAccountSwitch=${isAccountSwitch} isFreshLogin=${isFreshLogin} force=${shouldForce} lastUser=${lastRegisteredUserId?.substring(0, 8) ?? "null"}`);
      // [P0_PUSH_TWO_ENDED] DEV proof: decision path after logout/login
      devLog(`[P0_PUSH_TWO_ENDED]`, {
        effectiveUserId: userIdPrefix,
        lastRegisteredUserId: lastRegisteredUserId?.substring(0, 8) ?? "null",
        decision: shouldForce ? "ATTEMPT" : "THROTTLE_CHECK",
        reason: isFreshLogin ? "fresh_login" : isAccountSwitch ? "account_switch" : "returning",
      });
      // Run proof diagnostic ONCE on cold start (DEV only)
      runPushRegistrationProof();
    }
    checkAndRegisterToken(shouldForce);

    // Re-check permission when app comes to foreground (throttled)
    // [P0_PUSH_TWO_ENDED] Also invalidate circle unread counts on foreground
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active" && bootStatus === 'authed') {
        if (__DEV__) {
          devLog(`[P0_PUSH_REG] APP_ACTIVE userId=${userIdPrefix}...`);
        }
        checkAndRegisterToken(); // Will be throttled unless backend empty
        // [P0_CIRCLE_LIST_REFRESH] SSOT contract: self-heal circles + unread on foreground
        refreshCircleListContract({ reason: "app_active", queryClient });
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [bootStatus, session?.user?.id, checkAndRegisterToken]);

  /**
   * P0_PUSH_TAP: REPLAY PENDING DEEP LINK
   * When bootStatus becomes 'authed', check if we have a deferred deep link and navigate to it.
   * This handles cold start taps that were received before auth was complete.
   */
  useEffect(() => {
    // Only replay when authed and we have a pending deep link that hasn't been replayed
    if (bootStatus !== 'authed') {
      return;
    }
    
    const pending = pendingDeepLink.current;
    if (!pending || pendingDeepLinkReplayed.current) {
      return;
    }
    
    // Mark as replayed BEFORE navigating to prevent double-replay
    pendingDeepLinkReplayed.current = true;
    pendingDeepLink.current = null;
    
    if (__DEV__) {
      devLog(`[P0_PUSH_TAP] REPLAY pendingDeepLink=${pending.route} source=${pending.source}`);
    }
    
    // Small delay to ensure router is fully mounted after auth completes
    setTimeout(() => {
      if (__DEV__) {
        devLog(`[P0_PUSH_TAP] NAVIGATE_REPLAY route=${pending.route} method=${pending.source === 'cold_start' ? 'replace' : 'push'}`);
      }
      
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      if (pending.source === 'cold_start') {
        router.replace(pending.route as any);
      } else {
        router.push(pending.route as any);
      }
    }, 150);
  }, [bootStatus, router]);

  // Notification listeners
  useEffect(() => {
    // Listen for incoming notifications
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        setNotification(notification);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // [P0_PUSH_TWO_ENDED] Record push received receipt (DEV only)
        if (__DEV__) {
          const uid = session?.user?.id?.substring(0, 8) ?? "none";
          const nd = notification.request.content.data;
          recordPushReceipt("push_received", uid, {
            pushType: nd?.type ?? "unknown",
            circleId: nd?.circleId ?? nd?.circle_id ?? null,
            eventId: nd?.eventId ?? nd?.event_id ?? null,
          });
        }

        // [P1_PUSH_ROUTER] Route all push-driven refreshes through centralized router
        const data = notification.request.content.data;
        const type = data?.type as string | undefined;
        
        if (type) {
          // Extract entityId based on type
          const entityId = 
            data?.eventId ?? 
            data?.event_id ?? 
            data?.circleId ?? 
            data?.circle_id ?? 
            data?.userId ?? 
            data?.user_id ?? 
            "unknown";
          
          handlePushEvent(
            {
              type,
              entityId: String(entityId),
              payload: data,
              receivedAt: Date.now(),
            },
            queryClient
          );
        }
        
        // Always refresh notifications/activity list on any notification
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
    );

    /**
     * P0_PUSH_TAP: Handle notification tap (both background and foreground taps)
     * Uses centralized routing table for deterministic navigation.
     * 
     * DEFERRED NAVIGATION: If bootStatus !== 'authed', stores the route
     * in pendingDeepLink ref to be replayed when app is ready.
     */
    const handleNotificationTap = (
      response: Notifications.NotificationResponse,
      source: "listener" | "cold_start"
    ) => {
      // P0_PUSH_TAP: DEDUPE - Check if we've already handled this response
      const responseId = getResponseId(response);
      if (handledResponseIds.has(responseId)) {
        if (__DEV__) {
          devLog(`[P0_PUSH_TAP] DEDUPE skipping already-handled response: ${responseId}`);
        }
        return;
      }
      handledResponseIds.add(responseId);
      
      // Clean up old entries (keep Set from growing unbounded)
      if (handledResponseIds.size > 50) {
        const entries = Array.from(handledResponseIds);
        entries.slice(0, 25).forEach(id => handledResponseIds.delete(id));
      }
      
      const data = response.notification.request.content.data as Record<string, any> | undefined;
      const { route, fallbackUsed, reason } = resolveNotificationRoute(data);

      // P0_PUSH_TAP: DEV proof logging - receipt
      if (__DEV__) {
        devLog(`[P0_PUSH_TAP] RECEIPT ${JSON.stringify({
          source,
          responseId,
          type: data?.type ?? "unknown",
          eventId: data?.eventId ?? data?.event_id ?? null,
          userId: data?.userId ?? data?.user_id ?? data?.actorId ?? null,
          circleId: data?.circleId ?? data?.circle_id ?? null,
          routeAttempted: route,
          fallbackUsed,
          reason,
          bootStatus,
        })}`);
      }

      if (!route) {
        if (__DEV__) {
          devWarn('[P0_PUSH_TAP] No valid navigation target, payload:', data);
        }
        return;
      }
      
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // P0_PUSH_TAP: CHECK IF APP IS READY TO NAVIGATE
      // Must be authed to navigate to protected routes
      if (bootStatus !== 'authed') {
        // DEFER: Store pending deep link to replay when ready
        pendingDeepLink.current = { route, source };
        pendingDeepLinkReplayed.current = false;
        if (__DEV__) {
          devLog(`[P0_PUSH_TAP] DEFERRED pendingDeepLink=${route} reason=bootStatus_${bootStatus}`);
        }
        return;
      }

      // P0_PUSH_TAP: NAVIGATE NOW
      if (__DEV__) {
        devLog(`[P0_PUSH_TAP] NAVIGATE_NOW route=${route} method=${source === 'cold_start' ? 'replace' : 'push'}`);
      }
      
      // Use replace for cold start to avoid stacking on initial route
      if (source === "cold_start") {
        router.replace(route as any);
      } else {
        router.push(route as any);
      }
    };

    // Handle notification taps (background/foreground)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => handleNotificationTap(response, "listener")
    );

    /**
     * P0_PUSH_TAP: COLD START HANDLING
     * Check for notification that opened the app from completely closed state.
     * This runs ONCE per app launch to catch taps that happened before listeners registered.
     */
    const checkColdStartNotification = async () => {
      // Only check once per app lifecycle AND once per useNotifications mount
      if (coldStartNotificationProcessed || coldStartChecked.current) {
        return;
      }
      coldStartChecked.current = true;

      try {
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        
        if (lastResponse) {
          // Mark as processed to prevent double-handling at module level
          coldStartNotificationProcessed = true;
          
          if (__DEV__) {
            devLog('[P0_PUSH_TAP] COLD_START_DETECTED responseId=' + getResponseId(lastResponse));
          }
          
          // Process immediately - handleNotificationTap will defer if not ready
          handleNotificationTap(lastResponse, "cold_start");
        } else if (__DEV__) {
          devLog('[P0_PUSH_TAP] No cold start notification');
        }
      } catch (error) {
        if (__DEV__) {
          devWarn('[P0_PUSH_TAP] Failed to check cold start notification:', error);
        }
      }
    };

    // Check for cold start notification
    checkColdStartNotification();

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [router, queryClient, bootStatus]);

  /**
   * Production-safe push diagnostics function.
   * Returns comprehensive diagnostic info about push token registration.
   * Can be called from Settings screen to verify push setup in TestFlight.
   * 
   * IMPORTANT: Never returns full token, only prefix + length for safety.
   */
  const runPushDiagnostics = useCallback(async (): Promise<{
    ok: boolean;
    reason: string;
    startedAt: string;
    completedAt?: string;
    platform: string;
    isPhysicalDevice: boolean;
    permission?: string;
    permissionRequest?: string;
    projectId?: string;
    projectIdSource?: string;
    tokenPrefix?: string;
    tokenLength?: number;
    tokenError?: string;
    isValidToken?: boolean;
    registerUrl?: string;
    postStatus?: number | string;
    postBody?: unknown;
    postError?: string;
    getStatus?: number | string;
    getBody?: unknown;
    backendActiveCount?: number;
    backendTokens?: Array<{ tokenPrefix?: string; isActive?: boolean }>;
    lastRegistrationTime?: string;
    exceptionMessage?: string;
    exceptionStack?: string;
  }> => {
    const startedAt = new Date().toISOString();
    devLog("[PUSH_DIAG] start at " + startedAt);

    // A) Check physical device and platform
    const isPhysicalDevice = Device.isDevice;
    const platform = `${Device.osName ?? "unknown"} ${Device.osVersion ?? ""} (${Device.modelName ?? "unknown"})`;
    devLog("[PUSH_DIAG] isPhysicalDevice=" + isPhysicalDevice + " platform=" + platform);
    
    // A.1) Get last registration time (user-scoped)
    let lastRegistrationTime: string | undefined;
    try {
      const userId = session?.user?.id;
      const throttleKey = getThrottleKey(userId);
      const lastRegTs = throttleKey ? await AsyncStorage.getItem(throttleKey) : null;
      if (lastRegTs) {
        const ts = parseInt(lastRegTs, 10);
        lastRegistrationTime = new Date(ts).toISOString();
        devLog("[PUSH_DIAG] lastRegistrationTime=" + lastRegistrationTime);
      } else {
        devLog("[PUSH_DIAG] lastRegistrationTime=never");
      }
    } catch {
      devLog("[PUSH_DIAG] lastRegistrationTime=error");
    }

    // B) Check auth status
    if (bootStatus !== 'authed' || !session?.user) {
      devLog("[PUSH_DIAG] not_authed bootStatus=" + bootStatus);
      return { ok: false, reason: "not_authed", startedAt, completedAt: new Date().toISOString(), platform, isPhysicalDevice, lastRegistrationTime };
    }

    try {
      // C) Read permission
      let { status } = await Notifications.getPermissionsAsync();
      devLog("[PUSH_DIAG] initial_permission=" + status);
      const initialPermission = status;

      // D) Request permission if undetermined
      let permissionRequest: string | undefined;
      if (status === 'undetermined') {
        devLog("[PUSH_DIAG] requesting_permission");
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        status = newStatus;
        permissionRequest = newStatus;
        devLog("[PUSH_DIAG] permission_after_request=" + status);
      }

      // E) Get projectId (using shared resolver with all fallbacks)
      const projectId = resolveProjectId();
      // Determine source of projectId
      let projectIdSource = "not_found";
      if (Constants?.easConfig?.projectId) {
        projectIdSource = "easConfig.projectId";
      } else if (Constants?.expoConfig?.extra?.eas?.projectId) {
        projectIdSource = "expoConfig.extra.eas.projectId";
      } else if (Constants?.expoConfig?.extra?.projectId) {
        projectIdSource = "expoConfig.extra.projectId";
      }
      devLog("[PUSH_DIAG] projectId=" + (projectId || "projectId_missing") + " source=" + projectIdSource);

      // E.1) Abort if projectId missing
      if (!projectId) {
        devLog("[PUSH_DIAG] ABORT: projectId_missing");
        return { 
          ok: false, 
          reason: "projectId_missing - Set 'extra.eas.projectId' in app.json or ensure EAS build", 
          startedAt,
          completedAt: new Date().toISOString(),
          platform,
          isPhysicalDevice, 
          permission: status,
          permissionRequest,
          projectId: "projectId_missing",
          projectIdSource,
          lastRegistrationTime 
        };
      }

      // F) Check if permission granted
      if (status !== 'granted') {
        devLog("[PUSH_DIAG] permission_not_granted=" + status);
        return { ok: false, reason: "permission_not_granted", startedAt, completedAt: new Date().toISOString(), platform, isPhysicalDevice, permission: status, permissionRequest, projectId, projectIdSource, lastRegistrationTime };
      }
      devLog("[PUSH_DIAG] permission=granted");

      // G) Get token directly from expo-notifications (not via registerForPushNotificationsAsync)
      let token: string | undefined;
      let tokenError: string | undefined;
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        token = tokenData.data;
      } catch (tokenErr: any) {
        tokenError = tokenErr?.message || String(tokenErr);
        devLog("[PUSH_DIAG] getExpoPushTokenAsync error=" + tokenError);
      }
      const tokenPrefix = getTokenPrefix(token);
      const tokenLength = token?.length ?? 0;
      devLog("[PUSH_DIAG] tokenPrefix=" + tokenPrefix + " tokenLength=" + tokenLength + (tokenError ? " error=" + tokenError : ""));
      
      // H) Validate token (uses shared validator)
      const isValidToken = isValidExpoPushToken(token);
      devLog("[PUSH_DIAG] isValidToken=" + isValidToken);

      if (!token || !isValidToken) {
        devLog("[PUSH_DIAG] invalid_token" + (tokenError ? " tokenError=" + tokenError : ""));
        return { 
          ok: false, 
          reason: tokenError ? "token_acquisition_failed: " + tokenError : "invalid_token", 
          startedAt,
          completedAt: new Date().toISOString(),
          platform,
          isPhysicalDevice, 
          permission: status,
          permissionRequest,
          projectId,
          projectIdSource,
          tokenPrefix,
          tokenLength,
          tokenError,
          isValidToken,
          lastRegistrationTime,
          postBody: tokenError ? { error: tokenError } : undefined,
        };
      }

      // I) POST /api/push/register (with retry)
      const PUSH_REGISTER_ROUTE = "/api/push/register";
      devLog("[PUSH_DIAG] registering_token route=" + PUSH_REGISTER_ROUTE);
      
      let postStatus: number | string = 200;
      let postBody: unknown = null;
      let postError: string | undefined;
      
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const postResponse = await api.post<{ ok?: boolean; error?: string }>(PUSH_REGISTER_ROUTE, {
            token,
            platform: "expo",
          });
          postBody = postResponse;
          postStatus = 200;
          devLog("[PUSH_DIAG] POST attempt=" + attempt + " status=200 body=" + JSON.stringify(postResponse));
          break;
        } catch (postErr: any) {
          postStatus = postErr?.status ?? postErr?.statusCode ?? "error";
          postBody = postErr?.data ?? postErr?.message ?? String(postErr);
          postError = typeof postBody === "string" ? postBody : JSON.stringify(postBody);
          devLog("[PUSH_DIAG] POST attempt=" + attempt + " status=" + postStatus + " error=" + JSON.stringify(postBody));
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
      
      if (postStatus !== 200) {
        return {
          ok: false,
          reason: "backend_error: POST " + PUSH_REGISTER_ROUTE + " returned " + postStatus,
          startedAt,
          completedAt: new Date().toISOString(),
          platform,
          isPhysicalDevice,
          permission: status,
          permissionRequest,
          projectId,
          projectIdSource,
          tokenPrefix,
          tokenLength,
          isValidToken,
          registerUrl: PUSH_REGISTER_ROUTE,
          postStatus,
          postBody,
          postError,
          lastRegistrationTime,
        };
      }

      // J) POST /api/notifications/status
      await api.post("/api/notifications/status", {
        pushPermissionStatus: "granted",
      });
      devLog("[PUSH_DIAG] status_updated");

      // K) Update lastRegistrationTime (user-scoped)
      const userId = session?.user?.id;
      const throttleKey = getThrottleKey(userId);
      if (throttleKey) {
        await AsyncStorage.setItem(throttleKey, Date.now().toString());
      }
      const newLastRegTime = new Date().toISOString();

      // L) GET /api/push/me for proof
      let getStatus: number | string = 200;
      let getBody: unknown = null;
      let backendActiveCount = 0;
      let backendTokens: Array<{ tokenPrefix?: string; tokenSuffix?: string; isActive?: boolean }> = [];
      try {
        const meResponse = await api.get<{ tokens?: Array<{ tokenPrefix?: string; tokenSuffix?: string; isActive?: boolean }> }>("/api/push/me");
        getBody = meResponse;
        backendTokens = meResponse?.tokens ?? [];
        backendActiveCount = backendTokens.filter(t => t.isActive).length;
        devLog("[PUSH_DIAG] GET /api/push/me status=200 tokens=" + backendTokens.length + " active=" + backendActiveCount);
      } catch (getErr: any) {
        getStatus = getErr?.status ?? getErr?.statusCode ?? "error";
        getBody = getErr?.data ?? getErr?.message ?? String(getErr);
        devLog("[PUSH_DIAG] GET /api/push/me error=" + JSON.stringify(getBody));
      }

      // M) Success
      devLog("[PUSH_DIAG] success");
      return {
        ok: true,
        reason: "success",
        startedAt,
        completedAt: new Date().toISOString(),
        platform,
        isPhysicalDevice,
        permission: status,
        permissionRequest,
        projectId,
        projectIdSource,
        tokenPrefix,
        tokenLength,
        isValidToken,
        registerUrl: PUSH_REGISTER_ROUTE,
        postStatus,
        postBody,
        getStatus,
        getBody,
        backendActiveCount,
        backendTokens,
        lastRegistrationTime: newLastRegTime,
      };
    } catch (error: any) {
      devLog("[PUSH_DIAG] exception=" + (error?.message || "unknown"));
      return { 
        ok: false, 
        reason: "exception", 
        startedAt,
        completedAt: new Date().toISOString(),
        platform: `${Device.osName ?? "unknown"} ${Device.osVersion ?? ""}`,
        isPhysicalDevice: Device.isDevice,
        exceptionMessage: error?.message || "Unknown error",
        exceptionStack: error?.stack?.substring(0, 500),
      };
    }
  }, [bootStatus, session?.user]);

  /**
   * Clear all push tokens for the current user from backend.
   * Returns the updated token list (should be empty).
   */
  const clearMyPushTokens = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
    tokens?: Array<{ tokenPrefix?: string; isActive?: boolean }>;
  }> => {
    devLog("[PUSH_DIAG] clearMyPushTokens start");
    
    if (bootStatus !== 'authed' || !session?.user) {
      return { ok: false, error: "not_authed" };
    }

    try {
      // POST to clear endpoint
      await api.post("/api/push/clear-mine", {});
      devLog("[PUSH_DIAG] clear-mine POST success");

      // GET updated token list
      const meResponse = await api.get<{ tokens?: Array<{ tokenPrefix?: string; tokenSuffix?: string; isActive?: boolean }> }>("/api/push/me");
      const tokens = meResponse?.tokens ?? [];
      devLog("[PUSH_DIAG] after clear, tokens=" + tokens.length);

      return { ok: true, tokens };
    } catch (error: any) {
      devLog("[PUSH_DIAG] clearMyPushTokens error=" + (error?.message || "unknown"));
      return { ok: false, error: error?.message || "Unknown error" };
    }
  }, [bootStatus, session?.user]);

  /**
   * P0_PUSH_REG: ensurePushRegistered — deterministic push registration.
   * Safe to call multiple times. Bypasses throttle when force=true.
   * Use for: DEV force re-register button, post-login hook, etc.
   */
  const ensurePushRegistered = useCallback(async (opts?: { reason?: string; force?: boolean }) => {
    const reason = opts?.reason ?? "manual";
    const force = opts?.force ?? false;
    const userId = session?.user?.id;
    const userIdPrefix = userId?.substring(0, 8) ?? "none";

    if (__DEV__) {
      devLog(`[P0_PUSH_REG] ENSURE reason=${reason} force=${force} userId=${userIdPrefix}... bootStatus=${bootStatus}`);
    }

    if (bootStatus !== "authed" || !session?.user) {
      if (__DEV__) {
        devLog(`[P0_PUSH_REG] ENSURE_SKIP reason=NOT_AUTHED bootStatus=${bootStatus}`);
      }
      return;
    }

    await checkAndRegisterToken(force);
  }, [bootStatus, session?.user, checkAndRegisterToken]);

  return {
    expoPushToken,
    notification,
    recheckPermission: checkAndRegisterToken,
    ensurePushRegistered,
    runPushDiagnostics,
    clearMyPushTokens,
  };
}