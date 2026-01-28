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

// Throttle token registration to once per 24 hours
const TOKEN_REGISTRATION_KEY = "push_token_last_registered";
const TOKEN_REGISTRATION_THROTTLE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function useNotifications() {
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>();
  const [notification, setNotification] = useState<Notifications.Notification | undefined>();
  const notificationListener = useRef<EventSubscription | null>(null);
  const responseListener = useRef<EventSubscription | null>(null);
  const lastPermissionStatus = useRef<string | null>(null);

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
   */
  const checkAndRegisterToken = useCallback(async (forceRegister = false) => {
    if (!session?.user) return;

    try {
      const { status } = await Notifications.getPermissionsAsync();
      const permissionChanged = status !== lastPermissionStatus.current;
      const wasGranted = lastPermissionStatus.current === "granted";

      // Handle permission revocation
      if (status !== "granted" && wasGranted) {
        if (__DEV__) {
          console.log("[useNotifications] Permission revoked");
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
            console.log("[useNotifications] Token registration throttled (24h)");
          }
          lastPermissionStatus.current = status;
          return;
        }

        if (__DEV__) {
          console.log("[useNotifications] Registering push token");
        }

        const token = await registerForPushNotificationsAsync();
        if (token) {
          setExpoPushToken(token);

          // Send token to backend (backend upserts)
          await api.post("/api/notifications/register-token", {
            token,
            platform: "expo",
          });

          // Update backend with permission status
          await api.post("/api/notifications/status", {
            pushPermissionStatus: "granted",
          });

          // Mark as registered for throttling
          await markTokenRegistered();

          if (__DEV__) {
            console.log("[useNotifications] Token registered successfully");
          }
        }
      }

      lastPermissionStatus.current = status;
    } catch (error) {
      if (__DEV__) {
        console.error("[useNotifications] Error checking/registering token:", error);
      }
    }
  }, [session?.user, isRegistrationThrottled, markTokenRegistered]);

  // Initial registration and AppState listener for foreground permission re-check
  useEffect(() => {
    if (!session?.user) return;

    // Initial check (force register on first mount to ensure token is sent)
    checkAndRegisterToken(true);

    // Re-check permission when app comes to foreground (throttled)
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
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
  }, [session?.user?.id, checkAndRegisterToken]);

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
        } else if (type === "join_request" || type === "join_accepted" || type === "event_join") {
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

  return {
    expoPushToken,
    notification,
    recheckPermission: checkAndRegisterToken,
  };
}
