/**
 * Navigation Constants - Single Source of Truth
 * 
 * CANONICAL BOTTOM NAVIGATION TAB ORDER (PRODUCT DECISION - DO NOT REORDER)
 * ============================================================================
 * This order is a product-level invariant and must remain stable across all screens.
 * Any changes to this order require explicit product approval and coordination.
 * 
 * Order (left to right):
 * 1. Discover (Reconnect/Popular/Streaks)
 * 2. Social Calendar Feed (open events list)
 * 3. Home (CENTER - emphasized position)
 * 4. Friends
 * 5. Profile
 * 
 * Why this order:
 * - Discover is the entry point for exploration
 * - Calendar shows upcoming social events
 * - Home is center for quick access to feed
 * - Friends for social connections
 * - Profile for user settings (standard right position)
 * 
 * IMPORTANT: Do not create alternate tab arrays or per-screen overrides.
 * All screens must render BottomNavigation with this exact configuration.
 */

import type { LucideIcon } from "@/ui/icons";
import { Sparkles, Calendar, Home, Users, User } from "@/ui/icons";

export interface NavTab {
  /** Unique key for this tab */
  key: string;
  /** Icon component from ui/icons */
  Icon: LucideIcon;
  /** Display label shown under icon */
  label: string;
  /** Route path for navigation */
  href: string;
  /** Whether this tab should be rendered as center (elevated) */
  isCenter: boolean;
  /** Optional badge count key for notifications */
  badgeKey?: "friendRequests" | "eventRequests" | "circleUnread";
}

/**
 * CANONICAL TAB ORDER
 * This is the single source of truth for bottom navigation.
 * Do NOT create alternate arrays or override this order per-screen.
 */
export const BOTTOM_NAV_TABS: readonly NavTab[] = [
  {
    key: "discover",
    Icon: Sparkles,
    label: "Discover",
    href: "/discover",
    isCenter: false,
  },
  {
    key: "calendar",
    Icon: Calendar,
    label: "Calendar",
    href: "/calendar",
    isCenter: false,
    badgeKey: "eventRequests",
  },
  {
    key: "home",
    Icon: Home,
    label: "Home",
    href: "/",
    isCenter: true, // CENTER POSITION - emphasized with elevation
  },
  {
    key: "friends",
    Icon: Users,
    label: "Friends",
    href: "/friends",
    isCenter: false,
    badgeKey: "friendRequests",
  },
  {
    key: "profile",
    Icon: User,
    label: "Profile",
    href: "/profile",
    isCenter: false,
  },
] as const;

/**
 * Dev-only assertion to validate tab order hasn't been corrupted.
 * Logs warning if order differs from canonical.
 */
export function assertTabOrder(tabs: readonly NavTab[]): void {
  if (!__DEV__) return;

  const expectedKeys = BOTTOM_NAV_TABS.map(t => t.key);
  const actualKeys = tabs.map(t => t.key);
  
  const orderMatch = expectedKeys.every((key, index) => actualKeys[index] === key);
  
  if (!orderMatch) {
    console.warn(
      "[BottomNavigation] ⚠️ TAB ORDER VIOLATION DETECTED!\n" +
      `Expected: ${expectedKeys.join(" → ")}\n` +
      `Actual:   ${actualKeys.join(" → ")}\n` +
      "This violates the Navigation Invariant. Review src/constants/navigation.ts"
    );
  }
  
  // Verify HOME is in center position (index 2)
  const centerTab = tabs.find(t => t.isCenter);
  if (centerTab?.key !== "home") {
    console.warn(
      `[BottomNavigation] ⚠️ CENTER TAB VIOLATION!\n` +
      `Expected: home\n` +
      `Actual:   ${centerTab?.key ?? "none"}\n` +
      "Home must be in center position per Navigation Invariant."
    );
  }
}
