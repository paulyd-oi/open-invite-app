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
      tokens?: Array<{ isActive?: boolean; lastSeenAt?: string }>;
    }>("/api/push/me");
    const tokens = response?.tokens ?? [];
    const activeTokens = tokens.filter((t) => t.isActive === true);
    const latestActive = activeTokens
      .map((t) => t.lastSeenAt)
      .filter(Boolean)
      .sort()
      .pop() ?? null;
    return {
      activeCount: activeTokens.length,
      totalCount: tokens.length,
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
  console.log(`${LOG_PREFIX} ========== PUSH REGISTRATION PROOF START ==========`);

  try {
    // Step 1: Device check
    const isPhysicalDevice = Device.isDevice;
    console.log(`${LOG_PREFIX} 1. isPhysicalDevice: ${isPhysicalDevice}`);
    if (!isPhysicalDevice) {
      console.log(`${LOG_PREFIX} ❌ ABORT: Not a physical device (simulator cannot get real tokens)`);
      return;
    }

    // Step 2: Permission status
    const { status: permissionStatus } = await Notifications.getPermissionsAsync();
    console.log(`${LOG_PREFIX} 2. permissionStatus: ${permissionStatus}`);
    if (permissionStatus !== "granted") {
      console.log(`${LOG_PREFIX} ❌ ABORT: Permission not granted (cannot fetch token)`);
      return;
    }

    // Step 3: ProjectId (using shared resolver)
    const projectId = resolveProjectId();
    console.log(`${LOG_PREFIX} 3. projectId: ${projectId || "NOT_FOUND"}`);
    if (!projectId) {
      console.log(`${LOG_PREFIX} ❌ ABORT: No projectId found`);
      return;
    }

    // Step 4: Get token
    console.log(`${LOG_PREFIX} 4. Fetching Expo push token...`);
    let token: string;
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      token = tokenData.data;
    } catch (tokenErr) {
      console.log(`${LOG_PREFIX} ❌ ABORT: getExpoPushTokenAsync failed:`, tokenErr);
      return;
    }

    const tokenPrefix = getTokenPrefix(token);
    const tokenLength = token?.length ?? 0;
    console.log(`${LOG_PREFIX}    tokenPrefix: ${tokenPrefix}`);
    console.log(`${LOG_PREFIX}    tokenLength: ${tokenLength}`);

    // Step 5: Validate token
    const isValid = isValidExpoPushToken(token);
    console.log(`${LOG_PREFIX} 5. isValidExpoPushToken: ${isValid}`);
    if (!isValid) {
      console.log(`${LOG_PREFIX} ❌ ABORT: Token failed validation (placeholder/mock/too-short)`);
      return;
    }

    // Step 6: POST /api/push/register
    console.log(`${LOG_PREFIX} 6. POST /api/push/register ...`);
    const PUSH_REGISTER_ROUTE = "/api/push/register";
    let postResult: { status: number; body: unknown };
    try {
      const response = await api.post<{ ok?: boolean; error?: string }>(PUSH_REGISTER_ROUTE, {
        token,
        platform: "expo",
      });
      postResult = { status: 200, body: response };
      console.log(`${LOG_PREFIX}    POST status: 200`);
      console.log(`${LOG_PREFIX}    POST body: ${JSON.stringify(response)}`);
    } catch (postErr: any) {
      const status = postErr?.status ?? postErr?.statusCode ?? "unknown";
      const body = postErr?.data ?? postErr?.message ?? String(postErr);
      postResult = { status: typeof status === "number" ? status : 500, body };
      if (status === 401) {
        console.log(`${LOG_PREFIX}    POST 401 UNAUTHORIZED - auth cookie missing or invalid`);
      } else {
        console.log(`${LOG_PREFIX}    POST status: ${status}`);
      }
      console.log(`${LOG_PREFIX}    POST error body: ${JSON.stringify(body)}`);
    }

    // Step 7: GET /api/push/me (verify backend state)
    console.log(`${LOG_PREFIX} 7. GET /api/push/me ...`);
    try {
      const meResponse = await api.get<{ tokens?: Array<{ tokenPrefix?: string; isActive?: boolean }> }>("/api/push/me");
      console.log(`${LOG_PREFIX}    GET status: 200`);
      console.log(`${LOG_PREFIX}    GET body: ${JSON.stringify(meResponse)}`);

      // Check for expected token
      const tokens = meResponse?.tokens ?? [];
      const matchingToken = tokens.find((t) => tokenPrefix.includes(t.tokenPrefix?.substring(0, 20) ?? ""));
      if (tokens.length === 0) {
        console.log(`${LOG_PREFIX}    ⚠️ No tokens in response`);
      } else if (matchingToken?.isActive) {
        console.log(`${LOG_PREFIX}    ✅ Token found and isActive=true`);
      } else {
        console.log(`${LOG_PREFIX}    ⚠️ Token found but isActive=${matchingToken?.isActive ?? "N/A"}`);
      }
    } catch (getErr: any) {
      const status = getErr?.status ?? getErr?.statusCode ?? "unknown";
      const body = getErr?.data ?? getErr?.message ?? String(getErr);
      console.log(`${LOG_PREFIX}    GET status: ${status}`);
      console.log(`${LOG_PREFIX}    GET error body: ${JSON.stringify(body)}`);
    }

    console.log(`${LOG_PREFIX} ========== PUSH REGISTRATION PROOF END ==========`);
  } catch (err) {
    console.log(`${LOG_PREFIX} UNEXPECTED ERROR:`, err);
  }
}

// Track if we've already processed the cold start notification
let coldStartNotificationProcessed = false;

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
        if (__DEV__) console.log(`[P0_PUSH_REG] THROTTLE_CHECK userId=${userIdPrefix}... result=false (no key)`);
        return false;
      }
      
      const lastRegistered = await AsyncStorage.getItem(throttleKey);
      if (!lastRegistered) {
        if (__DEV__) console.log(`[P0_PUSH_REG] THROTTLE_CHECK userId=${userIdPrefix}... result=false (no timestamp)`);
        return false;
      }
      
      const elapsed = Date.now() - parseInt(lastRegistered, 10);
      const throttled = elapsed < TOKEN_REGISTRATION_THROTTLE_MS;
      if (__DEV__) console.log(`[P0_PUSH_REG] THROTTLE_CHECK userId=${userIdPrefix}... elapsed=${Math.round(elapsed/1000)}s result=${throttled}`);
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
        if (__DEV__) console.log("[P0_PUSH_REG] No userId - cannot mark registered");
        return;
      }
      await AsyncStorage.setItem(throttleKey, Date.now().toString());
      if (__DEV__) console.log(`[P0_PUSH_REG] THROTTLE_MARKED userId=${userId?.substring(0, 8)}...`);
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
        console.log(`[P0_PUSH_REG] SKIP reason=NOT_AUTHED bootStatus=${bootStatus} hasUser=${!!session?.user}`);
      }
      return;
    }

    try {
      // Step 1: Check current permission status
      let { status } = await Notifications.getPermissionsAsync();
      
      if (__DEV__) {
        console.log(`[P0_PUSH_REG] PERMISSION_CHECK userId=${userIdPrefix}... status=${status}`);
      }

      // Step 2: If undetermined AND forceRegister, REQUEST permission (not just read)
      if (status === 'undetermined' && forceRegister) {
        if (__DEV__) {
          console.log(`[P0_PUSH_REG] PERMISSION_REQUEST userId=${userIdPrefix}...`);
        }
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        status = newStatus;
        if (__DEV__) {
          console.log(`[P0_PUSH_REG] PERMISSION_RESULT userId=${userIdPrefix}... status=${status}`);
        }
      } else if (status === 'undetermined' && !forceRegister) {
        // Permission undetermined and not forcing - skip without prompting
        if (__DEV__) {
          console.log(`[P0_PUSH_REG] SKIP reason=PERMISSION_UNDETERMINED userId=${userIdPrefix}...`);
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
          console.log(`[P0_PUSH_REG] PERMISSION_REVOKED userId=${userIdPrefix}...`);
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
          console.log(`[P0_PUSH_REG] SKIP reason=PERMISSION_${status.toUpperCase()} userId=${userIdPrefix}...`);
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
            console.log(`[P0_PUSH_REG] THROTTLED userId=${userIdPrefix}... checking backend state...`);
          }
          
          const backendState = await verifyPushMe();
          if (backendState && backendState.activeCount === 0) {
            // BYPASS THROTTLE: Backend has no active tokens!
            shouldRegister = true;
            throttleBypassReason = "BACKEND_EMPTY";
            if (__DEV__) {
              console.log(`[P0_PUSH_REG] THROTTLE_BYPASS reason=BACKEND_EMPTY userId=${userIdPrefix}... activeCount=0 totalCount=${backendState.totalCount}`);
            }
          } else if (backendState) {
            // Backend has active tokens, respect throttle
            if (__DEV__) {
              console.log(`[P0_PUSH_REG] SKIP reason=THROTTLED userId=${userIdPrefix}... backendActiveCount=${backendState.activeCount}`);
            }
            lastPermissionStatus.current = status;
            return;
          } else {
            // Backend verification failed, respect throttle to be safe
            if (__DEV__) {
              console.log(`[P0_PUSH_REG] SKIP reason=THROTTLED_VERIFY_FAILED userId=${userIdPrefix}...`);
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
        console.log(`[P0_PUSH_REG] ATTEMPT userId=${userIdPrefix}... force=${forceRegister} permChange=${permissionChanged} accountSwitch=${isAccountSwitch} throttleBypass=${throttleBypassReason ?? "none"}`);
      }

      const token = await registerForPushNotificationsAsync();
      
      // Validate token before sending to backend
      if (token && isValidExpoPushToken(token)) {
        setExpoPushToken(token);
        const tokenSuffix = token.slice(-6);

        if (__DEV__) {
          console.log(`[P0_PUSH_REG] TOKEN_VALID userId=${userIdPrefix}... tokenSuffix=${tokenSuffix}`);
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
              console.log(`[P0_PUSH_REG] REGISTER_SUCCESS userId=${userIdPrefix}... attempt=${attempt} tokenSuffix=${tokenSuffix}`);
            }
            break;
          } catch (regErr: any) {
            lastError = regErr;
            const errStatus = regErr?.status ?? regErr?.statusCode ?? "unknown";
            if (__DEV__) {
              console.log(`[P0_PUSH_REG] REGISTER_RETRY userId=${userIdPrefix}... attempt=${attempt} status=${errStatus}`);
            }
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, 1000));
            }
          }
        }
        
        if (!registerSuccess) {
          const errStatus = lastError?.status ?? lastError?.statusCode ?? "unknown";
          if (__DEV__) {
            console.log(`[P0_PUSH_REG] REGISTER_FAILED userId=${userIdPrefix}... status=${errStatus}`);
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
            console.log(`[P0_PUSH_REG] VERIFY_BACKEND userId=${userIdPrefix}... activeCount=${verifyState.activeCount} totalCount=${verifyState.totalCount} lastSeenAt=${verifyState.lastSeenAt ?? "null"}`);
            if (verifyState.activeCount === 0) {
              console.log(`[P0_PUSH_REG] ⚠️ WARNING: Backend still shows 0 active tokens after registration!`);
            } else {
              console.log(`[P0_PUSH_REG] ✓ COMPLETE userId=${userIdPrefix}... success=${registerSuccess} activeCount=${verifyState.activeCount}`);
            }
          } else {
            console.log(`[P0_PUSH_REG] VERIFY_FAILED userId=${userIdPrefix}... could not reach /api/push/me`);
          }
        }
      } else if (token) {
        // Token exists but failed validation
        if (__DEV__) {
          console.log(`[P0_PUSH_REG] TOKEN_INVALID userId=${userIdPrefix}... tokenPrefix=${getTokenPrefix(token)}`);
        }
        await api.post("/api/notifications/status", {
          pushPermissionStatus: "granted",
        }).catch(() => {});
      } else {
        // No token (simulator or unsupported device)
        if (__DEV__) {
          console.log(`[P0_PUSH_REG] SKIP reason=NO_TOKEN userId=${userIdPrefix}... (simulator/unsupported)`);
        }
      }

      lastPermissionStatus.current = status;
    } catch (error) {
      const userId = session?.user?.id;
      const userIdPrefix = userId?.substring(0, 8) ?? "none";
      if (__DEV__) {
        console.error(`[P0_PUSH_REG] EXCEPTION userId=${userIdPrefix}...`, error);
      }
    }
  }, [bootStatus, session?.user, isRegistrationThrottled, markTokenRegistered]);

  // P0_PUSH_REG: Initial registration and AppState listener
  // CRITICAL: Gate on bootStatus === 'authed' AND runs when userId changes (account switch)
  useEffect(() => {
    const userId = session?.user?.id;
    const userIdPrefix = userId?.substring(0, 8) ?? "none";
    
    if (bootStatus !== 'authed' || !session?.user) {
      if (__DEV__ && bootStatus !== 'authed') {
        console.log(`[P0_PUSH_REG] WAIT bootStatus=${bootStatus}`);
      }
      return;
    }

    // Check for account switch
    const isAccountSwitch = userId !== lastRegisteredUserId && lastRegisteredUserId !== null;
    
    // Initial check (do not request permission on mount - read only)
    if (__DEV__) {
      console.log(`[P0_PUSH_REG] BOOT_AUTHED userId=${userIdPrefix}... isAccountSwitch=${isAccountSwitch} lastUser=${lastRegisteredUserId?.substring(0, 8) ?? "null"}`);
      // Run proof diagnostic ONCE on cold start (DEV only)
      runPushRegistrationProof();
    }
    checkAndRegisterToken(false);

    // Re-check permission when app comes to foreground (throttled)
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active" && bootStatus === 'authed') {
        if (__DEV__) {
          console.log(`[P0_PUSH_REG] APP_ACTIVE userId=${userIdPrefix}...`);
        }
        checkAndRegisterToken(); // Will be throttled unless backend empty
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [bootStatus, session?.user?.id, checkAndRegisterToken]);

  // Notification listeners
  useEffect(() => {
    // Listen for incoming notifications
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        setNotification(notification);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Refresh relevant data based on notification type
        const type = notification.request.content.data?.type;
        if (type === "new_event" || type === "event_update") {
          queryClient.invalidateQueries({ queryKey: ["events"] });
        } else if (type === "friend_request" || type === "friend_accepted") {
          queryClient.invalidateQueries({ queryKey: ["friends"] });
          queryClient.invalidateQueries({ queryKey: ["friendRequests"] });
        } else if (type === "join_request" || type === "join_accepted" || type === "event_join" ||
  type === "new_attendee" || type === "new_attendee") {
          // RSVP/join notifications - refresh events and specific event
          queryClient.invalidateQueries({ queryKey: ["events"] });
          const eventId = notification.request.content.data?.eventId;
          if (eventId) {
            queryClient.invalidateQueries({ queryKey: ["event", eventId] });
          }
        } else if (type === "event_comment") {
          // Comment notification - refresh event comments
          const eventId = notification.request.content.data?.eventId;
          if (eventId) {
            queryClient.invalidateQueries({ queryKey: ["event", eventId] });
            queryClient.invalidateQueries({ queryKey: ["eventComments", eventId] });
          }
        } else if (type === "circle_message") {
          // Refresh circles to update unread counts
          queryClient.invalidateQueries({ queryKey: ["circles"] });
          // If we have the circleId, also refresh that specific circle's messages
          const circleId = notification.request.content.data?.circleId;
          if (circleId) {
            queryClient.invalidateQueries({ queryKey: ["circle", circleId] });
            queryClient.invalidateQueries({ queryKey: ["circle-messages", circleId] });
          }
        }
        
        // Always refresh notifications/activity list on any notification
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
    );

    /**
     * P0_PUSH_TAP: Handle notification tap (both background and foreground taps)
     * Uses centralized routing table for deterministic navigation.
     */
    const handleNotificationTap = (
      response: Notifications.NotificationResponse,
      source: "listener" | "cold_start"
    ) => {
      const data = response.notification.request.content.data as Record<string, any> | undefined;
      const { route, fallbackUsed, reason } = resolveNotificationRoute(data);

      // P0_PUSH_TAP: DEV proof logging
      if (__DEV__) {
        console.log(`[P0_PUSH_TAP] ${JSON.stringify({
          source,
          type: data?.type ?? "unknown",
          eventId: data?.eventId ?? data?.event_id ?? null,
          userId: data?.userId ?? data?.user_id ?? data?.actorId ?? null,
          circleId: data?.circleId ?? data?.circle_id ?? null,
          routeAttempted: route,
          fallbackUsed,
          reason,
        })}`);
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (route) {
        // Use replace for cold start to avoid stacking on initial route
        if (source === "cold_start") {
          router.replace(route as any);
        } else {
          router.push(route as any);
        }
      } else if (__DEV__) {
        console.warn('[P0_PUSH_TAP] No valid navigation target, payload:', data);
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
          // Mark as processed to prevent double-handling
          coldStartNotificationProcessed = true;
          
          if (__DEV__) {
            console.log('[P0_PUSH_TAP] Cold start notification detected');
          }
          
          // Small delay to ensure router is ready
          setTimeout(() => {
            handleNotificationTap(lastResponse, "cold_start");
          }, 100);
        } else if (__DEV__) {
          console.log('[P0_PUSH_TAP] No cold start notification');
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('[P0_PUSH_TAP] Failed to check cold start notification:', error);
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
  }, [router, queryClient]);

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
    console.log("[PUSH_DIAG] start at " + startedAt);

    // A) Check physical device and platform
    const isPhysicalDevice = Device.isDevice;
    const platform = `${Device.osName ?? "unknown"} ${Device.osVersion ?? ""} (${Device.modelName ?? "unknown"})`;
    console.log("[PUSH_DIAG] isPhysicalDevice=" + isPhysicalDevice + " platform=" + platform);
    
    // A.1) Get last registration time (user-scoped)
    let lastRegistrationTime: string | undefined;
    try {
      const userId = session?.user?.id;
      const throttleKey = getThrottleKey(userId);
      const lastRegTs = throttleKey ? await AsyncStorage.getItem(throttleKey) : null;
      if (lastRegTs) {
        const ts = parseInt(lastRegTs, 10);
        lastRegistrationTime = new Date(ts).toISOString();
        console.log("[PUSH_DIAG] lastRegistrationTime=" + lastRegistrationTime);
      } else {
        console.log("[PUSH_DIAG] lastRegistrationTime=never");
      }
    } catch {
      console.log("[PUSH_DIAG] lastRegistrationTime=error");
    }

    // B) Check auth status
    if (bootStatus !== 'authed' || !session?.user) {
      console.log("[PUSH_DIAG] not_authed bootStatus=" + bootStatus);
      return { ok: false, reason: "not_authed", startedAt, completedAt: new Date().toISOString(), platform, isPhysicalDevice, lastRegistrationTime };
    }

    try {
      // C) Read permission
      let { status } = await Notifications.getPermissionsAsync();
      console.log("[PUSH_DIAG] initial_permission=" + status);
      const initialPermission = status;

      // D) Request permission if undetermined
      let permissionRequest: string | undefined;
      if (status === 'undetermined') {
        console.log("[PUSH_DIAG] requesting_permission");
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        status = newStatus;
        permissionRequest = newStatus;
        console.log("[PUSH_DIAG] permission_after_request=" + status);
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
      console.log("[PUSH_DIAG] projectId=" + (projectId || "projectId_missing") + " source=" + projectIdSource);

      // E.1) Abort if projectId missing
      if (!projectId) {
        console.log("[PUSH_DIAG] ABORT: projectId_missing");
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
        console.log("[PUSH_DIAG] permission_not_granted=" + status);
        return { ok: false, reason: "permission_not_granted", startedAt, completedAt: new Date().toISOString(), platform, isPhysicalDevice, permission: status, permissionRequest, projectId, projectIdSource, lastRegistrationTime };
      }
      console.log("[PUSH_DIAG] permission=granted");

      // G) Get token directly from expo-notifications (not via registerForPushNotificationsAsync)
      let token: string | undefined;
      let tokenError: string | undefined;
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        token = tokenData.data;
      } catch (tokenErr: any) {
        tokenError = tokenErr?.message || String(tokenErr);
        console.log("[PUSH_DIAG] getExpoPushTokenAsync error=" + tokenError);
      }
      const tokenPrefix = getTokenPrefix(token);
      const tokenLength = token?.length ?? 0;
      console.log("[PUSH_DIAG] tokenPrefix=" + tokenPrefix + " tokenLength=" + tokenLength + (tokenError ? " error=" + tokenError : ""));
      
      // H) Validate token (uses shared validator)
      const isValidToken = isValidExpoPushToken(token);
      console.log("[PUSH_DIAG] isValidToken=" + isValidToken);

      if (!token || !isValidToken) {
        console.log("[PUSH_DIAG] invalid_token" + (tokenError ? " tokenError=" + tokenError : ""));
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
      console.log("[PUSH_DIAG] registering_token route=" + PUSH_REGISTER_ROUTE);
      
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
          console.log("[PUSH_DIAG] POST attempt=" + attempt + " status=200 body=" + JSON.stringify(postResponse));
          break;
        } catch (postErr: any) {
          postStatus = postErr?.status ?? postErr?.statusCode ?? "error";
          postBody = postErr?.data ?? postErr?.message ?? String(postErr);
          postError = typeof postBody === "string" ? postBody : JSON.stringify(postBody);
          console.log("[PUSH_DIAG] POST attempt=" + attempt + " status=" + postStatus + " error=" + JSON.stringify(postBody));
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
      console.log("[PUSH_DIAG] status_updated");

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
      let backendTokens: Array<{ tokenPrefix?: string; isActive?: boolean }> = [];
      try {
        const meResponse = await api.get<{ tokens?: Array<{ tokenPrefix?: string; isActive?: boolean }> }>("/api/push/me");
        getBody = meResponse;
        backendTokens = meResponse?.tokens ?? [];
        backendActiveCount = backendTokens.filter(t => t.isActive).length;
        console.log("[PUSH_DIAG] GET /api/push/me status=200 tokens=" + backendTokens.length + " active=" + backendActiveCount);
      } catch (getErr: any) {
        getStatus = getErr?.status ?? getErr?.statusCode ?? "error";
        getBody = getErr?.data ?? getErr?.message ?? String(getErr);
        console.log("[PUSH_DIAG] GET /api/push/me error=" + JSON.stringify(getBody));
      }

      // M) Success
      console.log("[PUSH_DIAG] success");
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
      console.log("[PUSH_DIAG] exception=" + (error?.message || "unknown"));
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
    console.log("[PUSH_DIAG] clearMyPushTokens start");
    
    if (bootStatus !== 'authed' || !session?.user) {
      return { ok: false, error: "not_authed" };
    }

    try {
      // POST to clear endpoint
      await api.post("/api/push/clear-mine", {});
      console.log("[PUSH_DIAG] clear-mine POST success");

      // GET updated token list
      const meResponse = await api.get<{ tokens?: Array<{ tokenPrefix?: string; isActive?: boolean }> }>("/api/push/me");
      const tokens = meResponse?.tokens ?? [];
      console.log("[PUSH_DIAG] after clear, tokens=" + tokens.length);

      return { ok: true, tokens };
    } catch (error: any) {
      console.log("[PUSH_DIAG] clearMyPushTokens error=" + (error?.message || "unknown"));
      return { ok: false, error: error?.message || "Unknown error" };
    }
  }, [bootStatus, session?.user]);

  return {
    expoPushToken,
    notification,
    recheckPermission: checkAndRegisterToken,
    runPushDiagnostics,
    clearMyPushTokens,
  };
}