/**
 * Navigation Helper - Single source of truth for all app routes
 * Uses expo-router file-based routing
 */

import type { Router } from "expo-router";
import { devLog, devWarn, devError } from "./devLog";

// ============================================
// Route Constants
// ============================================

export const ROUTES = {
  HOME: "/",
  WELCOME: "/welcome",
  CREATE: "/create",
  CALENDAR: "/calendar",
  FRIENDS: "/friends",
  PROFILE: "/profile",
  SETTINGS: "/settings",
  WHOS_FREE: "/whos-free",
  SUBSCRIPTION: "/subscription",
  PRIVACY_SETTINGS: "/privacy-settings",
  SUGGESTIONS: "/suggestions",
  DISCOVER: "/discover",
} as const;

// ============================================
// Navigation Functions
// ============================================

export function goToHome(router: Router): void {
  router.replace(ROUTES.HOME);
}

export function goToWelcome(router: Router): void {
  router.replace(ROUTES.WELCOME);
}

export function goToCreate(router: Router): void {
  router.push(ROUTES.CREATE);
}

export function goToCalendar(router: Router): void {
  router.push(ROUTES.CALENDAR);
}

export function goToFriends(router: Router): void {
  router.push(ROUTES.FRIENDS);
}

export function goToProfile(router: Router): void {
  router.push(ROUTES.PROFILE);
}

export function goToSettings(router: Router): void {
  router.push(ROUTES.SETTINGS);
}

export function goToWhosFree(router: Router): void {
  router.push(ROUTES.WHOS_FREE);
}

export function goToSubscription(router: Router): void {
  router.push(ROUTES.SUBSCRIPTION);
}

export function goToPrivacySettings(router: Router): void {
  router.push(ROUTES.PRIVACY_SETTINGS);
}

export function goToSuggestions(router: Router): void {
  router.push(ROUTES.SUGGESTIONS);
}

export function goToDiscover(router: Router): void {
  router.push(ROUTES.DISCOVER);
}

// ============================================
// Dynamic Route Navigation
// ============================================

export function goToCircle(router: Router, circleId: string): void {
  router.push(`/circle/${circleId}`);
}

export function goToEvent(router: Router, eventId: string): void {
  router.push(`/event/${eventId}`);
}

export function goToFriend(router: Router, friendshipId: string): void {
  router.push(`/friend/${friendshipId}`);
}

/**
 * Navigate to a user profile.
 * [P0_SELF_PROFILE] If userId === viewerId, redirect to canonical /profile.
 */
export function goToUser(router: Router, userId: string, viewerId?: string): void {
  if (viewerId && userId === viewerId) {
    if (__DEV__) {
      devLog('[P0_SELF_PROFILE]', 'goToUser_redirect', { viewerId: viewerId.slice(0, 8), userId: userId.slice(0, 8), target: '/profile' });
    }
    router.push(ROUTES.PROFILE);
    return;
  }
  router.push(`/user/${userId}`);
}

// ============================================
// Safe Navigation with Error Handling
// ============================================

export function safePush(router: Router, path: string): void {
  try {
    router.push(path as any);
  } catch (error) {
    if (__DEV__) {
      devError('[Navigation] Failed to push:', path, error);
    }
    try {
      router.replace(ROUTES.HOME);
    } catch (fallbackError) {
      if (__DEV__) {
        devError('[Navigation] Fatal: Could not navigate anywhere', fallbackError);
      }
    }
  }
}

export function safeReplace(router: Router, path: string): void {
  try {
    router.replace(path as any);
  } catch (error) {
    if (__DEV__) {
      devError('[Navigation] Failed to replace:', path, error);
    }
    try {
      router.replace(ROUTES.HOME);
    } catch (fallbackError) {
      if (__DEV__) {
        devError('[Navigation] Fatal: Could not navigate anywhere', fallbackError);
      }
    }
  }
}

// ============================================
// Back Navigation
// ============================================

export function goBack(router: Router): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    goToHome(router);
  }
}

export function dismissModal(router: Router): void {
  router.dismiss();
}
