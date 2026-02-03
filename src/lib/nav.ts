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
  DEV_SMOKE_TESTS: "/dev-smoke-tests",
  PRIVACY_SETTINGS: "/privacy-settings",
  SUGGESTIONS: "/suggestions",
  DISCOVER: "/discover",
} as const;

// ============================================
// Navigation Functions
// ============================================

/**
 * Navigate to home screen (replace - no back)
 */
export function goToHome(router: Router): void {
  router.replace(ROUTES.HOME);
}

/**
 * Navigate to welcome/onboarding screen (replace - no back)
 */
export function goToWelcome(router: Router): void {
  router.replace(ROUTES.WELCOME);
}

/**
 * Navigate to create event screen
 */
export function goToCreate(router: Router): void {
  router.push(ROUTES.CREATE);
}

/**
 * Navigate to calendar screen
 */
export function goToCalendar(router: Router): void {
  router.push(ROUTES.CALENDAR);
}

/**
 * Navigate to friends list screen
 */
export function goToFriends(router: Router): void {
  router.push(ROUTES.FRIENDS);
}

/**
 * Navigate to user's profile screen
 */
export function goToProfile(router: Router): void {
  router.push(ROUTES.PROFILE);
}

/**
 * Navigate to settings screen
 */
export function goToSettings(router: Router): void {
  router.push(ROUTES.SETTINGS);
}

/**
 * Navigate to Who's Free screen
 */
export function goToWhosFree(router: Router): void {
  router.push(ROUTES.WHOS_FREE);
}

/**
 * Navigate to subscription/upgrade screen
 */
export function goToSubscription(router: Router): void {
  router.push(ROUTES.SUBSCRIPTION);
}

/**
 * Navigate to dev smoke tests screen
 * ⚠️ DEV-ONLY: No-op in production builds
 */
export function goToDevSmokeTests(router: Router): void {
  if (!__DEV__) {
    devWarn('[nav] goToDevSmokeTests called in production - ignoring');
    return;
  }
  router.push(ROUTES.DEV_SMOKE_TESTS);
}

/**
 * Navigate to privacy settings screen
 */
export function goToPrivacySettings(router: Router): void {
  router.push(ROUTES.PRIVACY_SETTINGS);
}

/**
 * Navigate to friend suggestions screen
 */
export function goToSuggestions(router: Router): void {
  router.push(ROUTES.SUGGESTIONS);
}

/**
 * Navigate to discover screen
 */
export function goToDiscover(router: Router): void {
  router.push(ROUTES.DISCOVER);
}

// ============================================
// Dynamic Route Navigation
// ============================================

/**
 * Navigate to a specific circle by ID
 */
export function goToCircle(router: Router, circleId: string): void {
  router.push(`/circle/${circleId}`);
}

/**
 * Navigate to a specific event by ID
 */
export function goToEvent(router: Router, eventId: string): void {
  router.push(`/event/${eventId}`);
}

/**
 * Navigate to a specific friend by ID
 */
export function goToFriend(router: Router, friendId: string): void {
  router.push(`/friend/${friendId}`);
}

/**
 * Navigate to a specific user profile by ID
 */
export function goToUser(router: Router, userId: string): void {
  router.push(`/user/${userId}`);
}

// ============================================
// Safe Navigation with Error Handling
// ============================================

/**
 * Safely push a route with error handling
 * Falls back to home if navigation fails
 */
export function safePush(router: Router, path: string): void {
  try {
    router.push(path as any);
  } catch (error) {
    if (__DEV__) {
      devError('[Navigation] Failed to push:', path, error);
    }
    // Fallback to home on error
    try {
      router.replace(ROUTES.HOME);
    } catch (fallbackError) {
      if (__DEV__) {
        devError('[Navigation] Fatal: Could not navigate anywhere', fallbackError);
      }
    }
  }
}

/**
 * Safely replace a route with error handling
 * Falls back to home if navigation fails
 */
export function safeReplace(router: Router, path: string): void {
  try {
    router.replace(path as any);
  } catch (error) {
    if (__DEV__) {
      devError('[Navigation] Failed to replace:', path, error);
    }
    // Fallback to home on error
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

/**
 * Go back to previous screen
 */
export function goBack(router: Router): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    goToHome(router);
  }
}

/**
 * Dismiss modal and return
 */
export function dismissModal(router: Router): void {
  router.dismiss();
}
