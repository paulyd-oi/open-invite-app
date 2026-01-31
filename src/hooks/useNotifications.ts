// Hook for managing push notifications
import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
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

          // Send token to backend (backend upserts)
          const PUSH_REGISTER_ROUTE = "/api/push/register";
          await api.post(PUSH_REGISTER_ROUTE, {
            token,
            platform: "expo",
          });

          if (__DEV__) {
            console.log(`[PUSH_BOOTSTRAP] ✓ Token registered | route=${PUSH_REGISTER_ROUTE} | tokenPrefix=${getTokenPrefix(token)}`);
          }

          // Update backend with permission status
          await api.post("/api/notifications/status", {
            pushPermissionStatus: "granted",
          });

          // Mark as registered for throttling
          await markTokenRegistered();
          registrationAttempted.current = true;

          if (__DEV__) {
            console.log("[PUSH_BOOTSTRAP] ✓ Push registration complete");
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
   * Returns diagnostic info about push token registration without exposing secrets.
   * Can be called from Settings screen to verify push setup.
   */
  const runPushDiagnostics = useCallback(async (): Promise<{
    ok: boolean;
    reason: string;
    permission?: string;
    tokenPrefix?: string;
    backendActiveCount?: number;
  }> => {
    console.log("[PUSH_DIAG] start");

    // A) Check auth status
    if (bootStatus !== 'authed' || !session?.user) {
      console.log("[PUSH_DIAG] not_authed bootStatus=" + bootStatus);
      return { ok: false, reason: "not_authed" };
    }

    try {
      // B) Read permission
      let { status } = await Notifications.getPermissionsAsync();
      console.log("[PUSH_DIAG] initial_permission=" + status);

      // C) Request permission if undetermined
      if (status === 'undetermined') {
        console.log("[PUSH_DIAG] requesting_permission");
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        status = newStatus;
        console.log("[PUSH_DIAG] permission_after_request=" + status);
      }

      // D) Check if granted
      if (status !== 'granted') {
        console.log("[PUSH_DIAG] permission_not_granted=" + status);
        return { ok: false, reason: "permission_not_granted", permission: status };
      }
      console.log("[PUSH_DIAG] permission=granted");

      // E) Get token
      const token = await registerForPushNotificationsAsync();
      
      // F) Validate token (uses shared validator)
      if (!token || !isValidExpoPushToken(token)) {
        console.log("[PUSH_DIAG] invalid_token");
        return { ok: false, reason: "invalid_token", permission: status };
      }
      const tokenPrefix = getTokenPrefix(token);
      console.log("[PUSH_DIAG] tokenPrefix=" + tokenPrefix);

      // G) POST /api/push/register
      const PUSH_REGISTER_ROUTE = "/api/push/register";
      console.log("[PUSH_DIAG] registering_token route=" + PUSH_REGISTER_ROUTE);
      await api.post(PUSH_REGISTER_ROUTE, {
        token,
        platform: "expo",
      });
      console.log(`[PUSH_DIAG] ✓ token_registered | route=${PUSH_REGISTER_ROUTE} | tokenPrefix=${tokenPrefix}`);

      // H) POST /api/notifications/status
      await api.post("/api/notifications/status", {
        pushPermissionStatus: "granted",
      });
      console.log("[PUSH_DIAG] status_updated");

      // I) GET device-tokens for proof
      let backendActiveCount = 0;
      try {
        const tokensResponse = await api.get<{ tokens: unknown[] } | unknown[]>("/api/notifications/device-tokens");
        // Handle both array and object response formats
        if (Array.isArray(tokensResponse)) {
          backendActiveCount = tokensResponse.length;
        } else if (tokensResponse && typeof tokensResponse === 'object' && 'tokens' in tokensResponse) {
          backendActiveCount = Array.isArray(tokensResponse.tokens) ? tokensResponse.tokens.length : 0;
        }
        console.log("[PUSH_DIAG] backendActiveCount=" + backendActiveCount);
      } catch (e) {
        // Non-fatal - endpoint may not exist in prod
        console.log("[PUSH_DIAG] device-tokens_fetch_skipped");
      }

      // J) Success
      console.log("[PUSH_DIAG] success");
      return {
        ok: true,
        reason: "success",
        permission: status,
        tokenPrefix,
        backendActiveCount,
      };
    } catch (error: any) {
      console.log("[PUSH_DIAG] error=" + (error?.message || "unknown"));
      return { ok: false, reason: "backend_error", permission: undefined };
    }
  }, [bootStatus, session?.user]);

  return {
    expoPushToken,
    notification,
    recheckPermission: checkAndRegisterToken,
    runPushDiagnostics,
  };
}