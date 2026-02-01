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

// Throttle token registration to once per 24 hours
const TOKEN_REGISTRATION_KEY = "push_token_last_registered";
const TOKEN_REGISTRATION_THROTTLE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Track if push proof diagnostic has run this session (cold start only)
let pushProofDiagnosticRan = false;

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

    // Step 3: ProjectId
    const projectId =
      Constants?.easConfig?.projectId ??
      Constants?.expoConfig?.extra?.eas?.projectId;
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

  /**
   * Check if token registration is throttled
   */
  const isRegistrationThrottled = useCallback(async (): Promise<boolean> => {
    try {
      const lastRegistered = await AsyncStorage.getItem(TOKEN_REGISTRATION_KEY);
      if (!lastRegistered) return false;
      
      const elapsed = Date.now() - parseInt(lastRegistered, 10);
      return elapsed < TOKEN_REGISTRATION_THROTTLE_MS;
    } catch {
      return false;
    }
  }, []);

  /**
   * Mark token as registered (for throttling)
   */
  const markTokenRegistered = useCallback(async () => {
    try {
      await AsyncStorage.setItem(TOKEN_REGISTRATION_KEY, Date.now().toString());
    } catch {
      // Ignore storage errors
    }
  }, []);

  /**
   * Check and register token if permission is granted
   * Called on mount and when app returns to foreground
   * Throttled to once per 24 hours (backend upserts, so repeated calls are safe but wasteful)
   * CRITICAL: Only runs when bootStatus === 'authed' to prevent 401 spam
   */
  const checkAndRegisterToken = useCallback(async (forceRegister = false) => {
    // INVARIANT: Only register when fully authenticated
    if (bootStatus !== 'authed' || !session?.user) {
      if (__DEV__) {
        console.log("[PUSH_BOOTSTRAP] Skipping - bootStatus:", bootStatus, "hasUser:", !!session?.user);
      }
      return;
    }

    try {
      // Step 1: Check current permission status
      let { status } = await Notifications.getPermissionsAsync();
      
      if (__DEV__) {
        console.log("[PUSH_BOOTSTRAP] Initial permission status:", status);
      }

      // Step 2: If undetermined, REQUEST permission (not just read)
      if (status === 'undetermined') {
        if (__DEV__) {
          console.log("[PUSH_BOOTSTRAP] Requesting permission from OS...");
        }
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        status = newStatus;
        if (__DEV__) {
          console.log("[PUSH_BOOTSTRAP] Permission after request:", status);
        }
      }

      const permissionChanged = status !== lastPermissionStatus.current;
      const wasGranted = lastPermissionStatus.current === "granted";

      // Handle permission revocation
      if (status !== "granted" && wasGranted) {
        if (__DEV__) {
          console.log("[PUSH_BOOTSTRAP] Permission revoked");
        }
        await api.post("/api/notifications/status", {
          pushPermissionStatus: "denied",
        });
        lastPermissionStatus.current = status;
        return;
      }

      // Handle permission granted
      if (status === "granted") {
        // Check throttle unless permission just changed or force register
        const throttled = !forceRegister && !permissionChanged && await isRegistrationThrottled();
        
        if (throttled) {
          if (__DEV__) {
            console.log("[PUSH_BOOTSTRAP] Token registration throttled (24h)");
          }
          lastPermissionStatus.current = status;
          return;
        }

        if (__DEV__) {
          console.log("[PUSH_BOOTSTRAP] Getting push token...");
        }

        const token = await registerForPushNotificationsAsync();
        
        // Validate token before sending to backend (uses shared validator)
        if (token && isValidExpoPushToken(token)) {
          setExpoPushToken(token);

          if (__DEV__) {
            console.log("[PUSH_BOOTSTRAP] Got valid token:", getTokenPrefix(token));
          }

          // Send token to backend (backend upserts) with retry
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
                console.log(`[PUSH_BOOTSTRAP] ✓ Token registered | attempt=${attempt} | route=${PUSH_REGISTER_ROUTE} | tokenPrefix=${getTokenPrefix(token)}`);
              }
              break;
            } catch (regErr: any) {
              lastError = regErr;
              if (__DEV__) {
                console.log(`[PUSH_BOOTSTRAP] Registration attempt ${attempt} failed:`, regErr?.message || regErr);
              }
              if (attempt < 2) {
                // Wait 1 second before retry
                await new Promise(r => setTimeout(r, 1000));
              }
            }
          }
          
          if (!registerSuccess && __DEV__) {
            console.log("[PUSH_BOOTSTRAP] ❌ Token registration failed after retry:", lastError?.message || "unknown");
          }

          // Update backend with permission status
          await api.post("/api/notifications/status", {
            pushPermissionStatus: "granted",
          });

          // Mark as registered for throttling (even if registration failed, to prevent spam)
          await markTokenRegistered();
          registrationAttempted.current = true;

          if (__DEV__) {
            console.log("[PUSH_BOOTSTRAP] ✓ Push registration complete, success=" + registerSuccess);
          }
        } else if (token) {
          // Token exists but failed validation (placeholder/invalid)
          if (__DEV__) {
            console.log("[PUSH_BOOTSTRAP] Token failed validation:", getTokenPrefix(token));
          }
          // Still update permission status even if token is invalid
          await api.post("/api/notifications/status", {
            pushPermissionStatus: "granted",
          });
        } else {
          // No token (simulator or unsupported device)
          if (__DEV__) {
            console.log("[PUSH_BOOTSTRAP] No token available (simulator/unsupported)");
          }
        }
      } else if (status === "denied") {
        // User denied permission - notify backend
        if (__DEV__) {
          console.log("[PUSH_BOOTSTRAP] Permission denied by user");
        }
        await api.post("/api/notifications/status", {
          pushPermissionStatus: "denied",
        });
      }

      lastPermissionStatus.current = status;
    } catch (error) {
      if (__DEV__) {
        console.error("[PUSH_BOOTSTRAP] Error:", error);
      }
    }
  }, [bootStatus, session?.user, isRegistrationThrottled, markTokenRegistered]);

  // Initial registration and AppState listener for foreground permission re-check
  // CRITICAL: Gate on bootStatus === 'authed' to prevent network calls when logged out
  useEffect(() => {
    if (bootStatus !== 'authed' || !session?.user) {
      if (__DEV__ && bootStatus !== 'authed') {
        console.log("[PUSH_BOOTSTRAP] Waiting for authed status, current:", bootStatus);
      }
      return;
    }

    // Initial check (force register on first mount to ensure token is sent)
    if (__DEV__) {
      console.log("[PUSH_BOOTSTRAP] Boot complete, initiating push registration");
      // Run proof diagnostic ONCE on cold start (DEV only)
      runPushRegistrationProof();
    }
    checkAndRegisterToken(true);

    // Re-check permission when app comes to foreground (throttled)
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active" && bootStatus === 'authed') {
        if (__DEV__) {
          console.log("[useNotifications] App became active, checking permission");
        }
        checkAndRegisterToken(); // Will be throttled by isRegistrationThrottled
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

    // Handle notification taps
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        const type = data?.type;
        const eventId = data?.eventId;
        const friendId = data?.friendId;
        const userId = data?.userId || data?.actorId || data?.senderId;
        const circleId = data?.circleId;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        // Navigate based on notification type
        // D5-F2: Deep-link handling for push taps
        
        // Event-related notifications → event detail
        if (
          type === "new_event" ||
          type === "event_update" ||
          type === "event_reminder" ||
          type === "event_join" ||
  type === "new_attendee" ||
          type === "event_comment" ||
          type === "join_request" ||
          type === "join_accepted"
        ) {
          if (eventId) {
            router.push(`/event/${eventId}` as any);
            return;
          }
        }
        
        // Friend request → user profile or friends list
        if (type === "friend_request") {
          if (userId) {
            router.push(`/user/${userId}` as any);
          } else {
            router.push("/friends");
          }
          return;
        }
        
        // Friend accepted → user profile
        if (type === "friend_accepted") {
          if (friendId) {
            router.push(`/user/${friendId}` as any);
          } else if (userId) {
            router.push(`/user/${userId}` as any);
          }
          return;
        }
        
        // Circle message → circle chat
        if (type === "circle_message" && circleId) {
          router.push(`/circle/${circleId}` as any);
          return;
        }
        
        // Fallback: if we have eventId, go to event
        if (eventId) {
          router.push(`/event/${eventId}` as any);
          return;
        }
        
        // Fallback: if we have userId, go to user profile
        if (userId) {
          router.push(`/user/${userId}` as any);
          return;
        }
        
        // No valid navigation target - log warning (D5-F2 requirement)
        if (__DEV__) {
          console.warn('[useNotifications] Push tap has no valid navigation target:', {
            type,
            eventId,
            userId,
            friendId,
            circleId,
          });
        }
      }
    );

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

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
    isPhysicalDevice: boolean;
    permission?: string;
    projectId?: string;
    tokenPrefix?: string;
    tokenLength?: number;
    isValidToken?: boolean;
    postStatus?: number | string;
    postBody?: unknown;
    getStatus?: number | string;
    getBody?: unknown;
    backendActiveCount?: number;
    backendTokens?: Array<{ tokenPrefix?: string; isActive?: boolean }>;
    lastRegistrationTime?: string;
  }> => {
    console.log("[PUSH_DIAG] start");

    // A) Check physical device
    const isPhysicalDevice = Device.isDevice;
    console.log("[PUSH_DIAG] isPhysicalDevice=" + isPhysicalDevice);
    
    // A.1) Get last registration time
    let lastRegistrationTime: string | undefined;
    try {
      const lastRegTs = await AsyncStorage.getItem(TOKEN_REGISTRATION_KEY);
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
      return { ok: false, reason: "not_authed", isPhysicalDevice, lastRegistrationTime };
    }

    try {
      // C) Read permission
      let { status } = await Notifications.getPermissionsAsync();
      console.log("[PUSH_DIAG] initial_permission=" + status);

      // D) Request permission if undetermined
      if (status === 'undetermined') {
        console.log("[PUSH_DIAG] requesting_permission");
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        status = newStatus;
        console.log("[PUSH_DIAG] permission_after_request=" + status);
      }

      // E) Get projectId
      const projectId =
        Constants?.easConfig?.projectId ??
        Constants?.expoConfig?.extra?.eas?.projectId;
      console.log("[PUSH_DIAG] projectId=" + (projectId || "NOT_FOUND"));

      // F) Check if permission granted
      if (status !== 'granted') {
        console.log("[PUSH_DIAG] permission_not_granted=" + status);
        return { ok: false, reason: "permission_not_granted", isPhysicalDevice, permission: status, projectId: projectId || "NOT_FOUND", lastRegistrationTime };
      }
      console.log("[PUSH_DIAG] permission=granted");

      // G) Get token
      const token = await registerForPushNotificationsAsync();
      const tokenPrefix = getTokenPrefix(token);
      const tokenLength = token?.length ?? 0;
      console.log("[PUSH_DIAG] tokenPrefix=" + tokenPrefix + " tokenLength=" + tokenLength);
      
      // H) Validate token (uses shared validator)
      const isValidToken = isValidExpoPushToken(token);
      console.log("[PUSH_DIAG] isValidToken=" + isValidToken);

      if (!token || !isValidToken) {
        console.log("[PUSH_DIAG] invalid_token");
        return { 
          ok: false, 
          reason: "invalid_token", 
          isPhysicalDevice, 
          permission: status, 
          projectId: projectId || "NOT_FOUND",
          tokenPrefix,
          tokenLength,
          isValidToken,
          lastRegistrationTime,
        };
      }

      // I) POST /api/push/register (with retry)
      const PUSH_REGISTER_ROUTE = "/api/push/register";
      console.log("[PUSH_DIAG] registering_token route=" + PUSH_REGISTER_ROUTE);
      
      let postStatus: number | string = 200;
      let postBody: unknown = null;
      let postAttempts = 0;
      
      for (let attempt = 1; attempt <= 2; attempt++) {
        postAttempts = attempt;
        try {
          const postResponse = await api.post<{ ok?: boolean; error?: string }>(PUSH_REGISTER_ROUTE, {
            token,
            platform: "expo",
          });
          postBody = postResponse;
          console.log("[PUSH_DIAG] POST attempt=" + attempt + " status=200 body=" + JSON.stringify(postResponse));
          break;
        } catch (postErr: any) {
          postStatus = postErr?.status ?? postErr?.statusCode ?? "error";
          postBody = postErr?.data ?? postErr?.message ?? String(postErr);
          console.log("[PUSH_DIAG] POST attempt=" + attempt + " status=" + postStatus + " error=" + JSON.stringify(postBody));
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
      
      if (postStatus !== 200) {
        return {
          ok: false,
          reason: "backend_error",
          isPhysicalDevice,
          permission: status,
          projectId: projectId || "NOT_FOUND",
          tokenPrefix,
          tokenLength,
          isValidToken,
          postStatus,
          postBody,
          lastRegistrationTime,
        };
      }

      // J) POST /api/notifications/status
      await api.post("/api/notifications/status", {
        pushPermissionStatus: "granted",
      });
      console.log("[PUSH_DIAG] status_updated");

      // K) Update lastRegistrationTime
      await AsyncStorage.setItem(TOKEN_REGISTRATION_KEY, Date.now().toString());
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
        isPhysicalDevice,
        permission: status,
        projectId: projectId || "NOT_FOUND",
        tokenPrefix,
        tokenLength,
        isValidToken,
        postStatus,
        postBody,
        getStatus,
        getBody,
        backendActiveCount,
        backendTokens,
        lastRegistrationTime: newLastRegTime,
      };
    } catch (error: any) {
      console.log("[PUSH_DIAG] error=" + (error?.message || "unknown"));
      return { ok: false, reason: "backend_error", isPhysicalDevice: Device.isDevice };
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