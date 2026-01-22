// Hook for managing push notifications
import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import type { EventSubscription } from "expo-modules-core";

import { registerForPushNotificationsAsync } from "@/lib/notifications";
import { api } from "@/lib/api";
import { useSession } from "@/lib/useSession";

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
   * Check and register token if permission is granted
   * Called on mount and when app returns to foreground
   */
  const checkAndRegisterToken = useCallback(async () => {
    if (!session?.user) return;

    try {
      const { status } = await Notifications.getPermissionsAsync();

      // Only process if permission status changed or we haven't registered yet
      if (status === "granted" && (lastPermissionStatus.current !== "granted" || !expoPushToken)) {
        console.log("[useNotifications] Permission granted, registering token");

        const token = await registerForPushNotificationsAsync();
        if (token) {
          setExpoPushToken(token);

          // Send token to backend
          await api.post("/api/notifications/register-token", {
            token,
            platform: "expo",
          });

          // Update backend with permission status
          await api.post("/api/notifications/status", {
            pushPermissionStatus: "granted",
          });

          console.log("[useNotifications] Token registered successfully");
        }
      } else if (status !== "granted" && lastPermissionStatus.current === "granted") {
        // Permission was revoked
        console.log("[useNotifications] Permission revoked");
        await api.post("/api/notifications/status", {
          pushPermissionStatus: "denied",
        });
      }

      lastPermissionStatus.current = status;
    } catch (error) {
      console.error("[useNotifications] Error checking/registering token:", error);
    }
  }, [session?.user, expoPushToken]);

  // Initial registration and AppState listener for foreground permission re-check
  useEffect(() => {
    if (!session?.user) return;

    // Initial check
    checkAndRegisterToken();

    // Re-check permission when app comes to foreground
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        console.log("[useNotifications] App became active, checking permission");
        checkAndRegisterToken();
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
        } else if (type === "join_request" || type === "join_accepted") {
          queryClient.invalidateQueries({ queryKey: ["events"] });
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
      }
    );

    // Handle notification taps
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        const type = data?.type;
        const eventId = data?.eventId;
        const friendId = data?.friendId;
        const circleId = data?.circleId;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        // Navigate based on notification type
        if (type === "new_event" || type === "event_update" || type === "event_reminder") {
          if (eventId) {
            router.push(`/event/${eventId}` as any);
          }
        } else if (type === "friend_request") {
          router.push("/friends");
        } else if (type === "friend_accepted" && friendId) {
          router.push(`/friend/${friendId}` as any);
        } else if ((type === "join_request" || type === "join_accepted") && eventId) {
          router.push(`/event/${eventId}` as any);
        } else if (type === "circle_message" && circleId) {
          router.push(`/circle/${circleId}` as any);
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
