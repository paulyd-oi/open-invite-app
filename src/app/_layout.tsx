// Polyfill TextEncoder/TextDecoder for React Native (required for crypto/auth libs)
import 'fast-text-encoding';

import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useRootNavigationState, usePathname, useSegments } from 'expo-router';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useFonts } from 'expo-font';
import {
  Sora_300Light,
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
} from '@expo-google-fonts/sora';

import { ThemeProvider as AppThemeProvider, useTheme } from '@/lib/ThemeContext';
import { SubscriptionProvider } from '@/lib/SubscriptionContext';
import { devLog } from '@/lib/devLog';
import { SplashScreen as AnimatedSplash } from '@/components/SplashScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NetworkStatusBanner } from '@/components/OfflineBanner';
import { UpdateBanner } from '@/components/UpdateBanner';
import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import { ToastContainer } from '@/components/Toast';
import { BootLoading } from '@/components/BootLoading';
import { AutoSyncProvider } from '@/components/AutoSyncProvider';
import { setupDeepLinkListener } from '@/lib/deepLinks';
import { initNetworkMonitoring } from '@/lib/networkStatus';
import { useOfflineSync } from '@/lib/offlineSync';
import { BACKEND_URL } from '@/lib/config';
import { useBootAuthority, hasBootResolvedOnce } from '@/hooks/useBootAuthority';
import { useNotifications } from '@/hooks/useNotifications';
import { useReferralClaim } from '@/hooks/useReferralClaim';
import { useEntitlementsSync } from '@/hooks/useEntitlementsSync';
import { useRevenueCatSync } from '@/hooks/useRevenueCatSync';
import { useEntitlementsForegroundRefresh } from '@/hooks/useEntitlementsForegroundRefresh';
import { useSession } from '@/lib/useSession';
import { EmailVerificationGateModal } from '@/components/EmailVerificationGateModal';
import { hasShownGateModal, markGateModalShown } from '@/lib/emailVerificationGate';
import { subscribeToAuthExpiry, resetAuthExpiryGuard } from '@/lib/authExpiry';
import { performLogout } from '@/lib/logout';
import { useQueryClient } from '@tanstack/react-query';
import { p15, once } from '@/lib/runtimeInvariants';
import { maybeTriggerInvariantsOnce, maybeRunScenarioOnce } from '@/lib/devStress';

export const unstable_settings = {
  // [P0_INIT_ROUTE_FIX] Set initialRouteName to 'welcome' directly.
  // This ensures fresh installs ALWAYS start at /welcome.
  // Previously used 'index' with redirect, but Expo Router's <Redirect>
  // is async (uses useFocusEffect), causing race conditions.
  initialRouteName: 'welcome',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
ExpoSplashScreen.preventAutoHideAsync();

// DEV-only: Intercept console.error to detect "Text strings must be rendered" crash
// and log a useful stack trace (gated behind dev log switch)
if (__DEV__) {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const message = args[0];
    if (typeof message === 'string' && message.includes('Text strings must be rendered')) {
      devLog('[TEXT_RENDER_CRASH]', '=== TEXT RENDER CRASH DETECTED ===');
      devLog('[TEXT_RENDER_CRASH]', 'Error:', message);
      devLog('[TEXT_RENDER_CRASH]', 'Stack:', new Error().stack);
      devLog('[TEXT_RENDER_CRASH]', '==================================');
    }
    originalConsoleError.apply(console, args);
  };
}

// DEV-only: Patch React.createElement to detect text children outside <Text> components
// This fires BEFORE the crash, giving us the exact callsite
if (__DEV__) {
  const React = require('react');
  const patchedFlag = '__TEXT_CHILD_DETECTOR_PATCHED__';
  
  if (!(global as any)[patchedFlag]) {
    (global as any)[patchedFlag] = true;
    
    const originalCreateElement = React.createElement;
    let detectionCount = 0;
    const MAX_DETECTIONS = 5; // Limit spam
    
    // Types that are allowed to have string/number children
    const TEXT_LIKE_TYPES = new Set([
      'Text', 'RCTText', 'AnimatedText', 'TextInput', 'RCTTextInput',
      'title', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'label',
    ]);
    
    function getTypeName(type: any): string {
      if (typeof type === 'string') return type;
      if (typeof type === 'function') {
        return type.displayName || type.name || 'AnonymousComponent';
      }
      if (type && typeof type === 'object') {
        // Handle forwardRef, memo, etc.
        if (type.displayName) return type.displayName;
        if (type.render?.displayName) return type.render.displayName;
        if (type.render?.name) return type.render.name;
        if (type.type?.displayName) return type.type.displayName;
        if (type.type?.name) return type.type.name;
      }
      return 'unknown';
    }
    
    function isTextLike(typeName: string): boolean {
      // Check exact match or if name contains "Text"
      if (TEXT_LIKE_TYPES.has(typeName)) return true;
      if (typeName.includes('Text')) return true;
      return false;
    }
    
    function flattenChildren(children: any): any[] {
      if (children == null) return [];
      if (Array.isArray(children)) {
        return children.flatMap(flattenChildren);
      }
      return [children];
    }
    
    function hasInvalidTextChild(children: any[], typeName: string): { found: boolean; value?: any } {
      if (isTextLike(typeName)) return { found: false };
      
      for (const child of children) {
        if (typeof child === 'string' && child.trim() !== '') {
          return { found: true, value: child };
        }
        if (typeof child === 'number') {
          return { found: true, value: child };
        }
      }
      return { found: false };
    }
    
    React.createElement = function patchedCreateElement(type: any, props: any, ...children: any[]) {
      if (detectionCount < MAX_DETECTIONS) {
        try {
          const typeName = getTypeName(type);
          const allChildren = flattenChildren(children);
          
          // Also check props.children
          if (props?.children != null) {
            allChildren.push(...flattenChildren(props.children));
          }
          
          const check = hasInvalidTextChild(allChildren, typeName);
          if (check.found) {
            detectionCount++;
            devLog('[TEXT_CHILD_DETECTOR]', '=== INVALID TEXT CHILD DETECTED ===');
            devLog('[TEXT_CHILD_DETECTOR]', 'Component:', typeName);
            devLog('[TEXT_CHILD_DETECTOR]', 'Offending child:', JSON.stringify(check.value), `(typeof: ${typeof check.value})`);
            devLog('[TEXT_CHILD_DETECTOR]', 'Props keys:', props ? Object.keys(props).join(', ') : 'none');
            devLog('[TEXT_CHILD_DETECTOR]', 'Stack trace:');
            devLog('[TEXT_CHILD_DETECTOR]', new Error().stack?.split('\n').slice(1, 10).join('\n') || '');
            devLog('[TEXT_CHILD_DETECTOR]', `=== Detection ${detectionCount}/${MAX_DETECTIONS} ===`);
          }
        } catch (e) {
          // Don't let detector errors break the app
        }
      }
      
      return originalCreateElement.apply(React, [type, props, ...children]);
    };
    
    devLog('[TEXT_CHILD_DETECTOR]', 'React.createElement text-child detector installed');
  }
}

/**
 * QueryClient SSOT Defaults (P1 Churn Hardening)
 * 
 * Goals: Reduce refetch/retry churn and backend load without changing UX.
 * 
 * queries:
 *   - retry: 1 max (skip on 401/403/404)
 *   - retryDelay: exponential backoff capped at 30s
 *   - staleTime: 15s global default (individual queries can override)
 *   - refetchOnWindowFocus: false (mobile - no window focus concept)
 *   - refetchOnMount: false (prefer cached; explicit invalidation when needed)
 *   - refetchOnReconnect: true (refresh data when network returns)
 *   - gcTime: 5 minutes (keep cache around for back-nav)
 * 
 * mutations:
 *   - retry: 0 (avoid duplicate writes)
 */
const QUERY_DEFAULTS = {
  queries: {
    // Don't retry on auth errors (401/403) or not found (404)
    retry: (failureCount: number, error: any) => {
      const status = error?.status ?? error?.response?.status;
      if (status === 401 || status === 403 || status === 404) return false;
      return failureCount < 1; // Max 1 retry
    },
    // Exponential backoff: 1s, 2s, 4s... capped at 30s
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
    // Default stale time (30s) - individual queries can override
    staleTime: 30000,
    // Garbage collection time - keep cache for 5 minutes
    gcTime: 300000,
    // Prevent aggressive refetching that can cause loops (mobile has no window focus)
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: true,
  },
  mutations: {
    retry: 0, // Never retry mutations (avoid duplicate writes)
  },
} as const;

// Log defaults once at module load in DEV
if (__DEV__) {
  devLog('[P1_QUERY_DEFAULTS]', 'QueryClient initialized with:', {
    'queries.retry': 'max 1 (skip 401/403/404)',
    'queries.retryDelay': 'exponential backoff, cap 30s',
    'queries.staleTime': `${QUERY_DEFAULTS.queries.staleTime}ms`,
    'queries.gcTime': `${QUERY_DEFAULTS.queries.gcTime}ms`,
    'queries.refetchOnWindowFocus': QUERY_DEFAULTS.queries.refetchOnWindowFocus,
    'queries.refetchOnMount': QUERY_DEFAULTS.queries.refetchOnMount,
    'queries.refetchOnReconnect': QUERY_DEFAULTS.queries.refetchOnReconnect,
    'mutations.retry': QUERY_DEFAULTS.mutations.retry,
  });
}

const queryClient = new QueryClient({
  defaultOptions: QUERY_DEFAULTS,
});

// Component that handles offline sync (must be inside QueryClientProvider)
function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  // Get boot status for auth gating
  const { status: bootStatus } = useBootAuthority();
  // This hook handles queue replay when coming back online (gated on authed)
  useOfflineSync(bootStatus);
  return <>{children}</>;
}

/**
 * Boot Router Component
 * 
 * Uses the boot authority to make the SINGLE initial routing decision.
 * While loading, shows splash screen.
 * Once boot status is known, redirects to appropriate route ONCE.
 * Does NOT re-route on session/token changes - those are handled by component logic.
 */
function BootRouter() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const { status: bootStatus, error: bootError, retry } = useBootAuthority();
  const hasRoutedRef = useRef(false);
  const gateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showEmailGateModal, setShowEmailGateModal] = useState(false);
  const queryClient = useQueryClient();
  
  // [P0_INIT_ROUTE] Log initial mount and every render for debugging
  if (__DEV__) {
    devLog('[P0_INIT_ROUTE]', 'render', {
      bootStatus,
      pathname,
      segments: segments.join('/'),
      navReady: !!navigationState?.key,
      hasRouted: hasRoutedRef.current,
    });
  }
  
  // Get session data for RevenueCat sync
  const { data: session } = useSession();
  const userId = session?.user?.id;

  // [P15_AUTH_INVAR] DEV-only: detect session vs bootStatus mismatch
  if (__DEV__ && bootStatus !== 'loading') {
    const hasSession = !!session?.user?.id;
    if (bootStatus === 'loggedOut' && hasSession && once('auth_mismatch_loggedOut_hasSession')) {
      p15('[P15_AUTH_INVAR]', { mismatch: 'loggedOut_but_hasSession', bootStatus, userId: session?.user?.id });
    }
    if (bootStatus === 'authed' && !hasSession && once('auth_mismatch_authed_noSession')) {
      p15('[P15_AUTH_INVAR]', { mismatch: 'authed_but_noSession', bootStatus, hasSession: false });
    }
  }

  // [P19_STRESS] DEV-only: fire synthetic invariant + scenario runner once per app run
  useEffect(() => {
    if (__DEV__) {
      maybeTriggerInvariantsOnce();
      maybeRunScenarioOnce();
    }
  }, []);

  // AUTH EXPIRY LISTENER: Handle 401 ONLY from $fetch by triggering SSOT logout
  // One-shot per session (emitter guards against spam)
  // [P0_AUTH_403_NO_LOGOUT] HARD GUARD: reject 403 even if emitter is called incorrectly
  useEffect(() => {
    const unsubscribe = subscribeToAuthExpiry((info) => {
      const status = info?.status;

      // HARD GUARD: 403 = permission denied, NEVER logout
      if (status === 403) {
        if (__DEV__) {
          devLog('[P0_AUTH_403_NO_LOGOUT]', {
            status: 403,
            endpoint: info?.endpoint || 'unknown',
            action: 'no_logout',
          });
        }
        return;
      }

      // Defensive: only proceed if status is explicitly 401
      if (status !== 401) {
        return;
      }

      // [P0_AUTH_EXPIRED_GATE] Only trigger logout if we were actually authed.
      // When bootStatus is loggedOut/loading, a stray 401 is expected noise — swallow it.
      if (bootStatus !== 'authed') {
        if (__DEV__) {
          devLog('[P0_AUTH_EXPIRED_GATE] tokenExists=false wasAuthed=false allowed=false bootStatus=' + bootStatus);
        }
        return;
      }

      if (__DEV__) {
        devLog('[P0_AUTH_EXPIRED_GATE] tokenExists=true wasAuthed=true allowed=true bootStatus=' + bootStatus);
      }

      // Trigger logout via SSOT - performLogout is idempotent
      performLogout({
        screen: 'auth_expiry',
        reason: 'auth_expired',
        queryClient,
        router,
      });
    });
    return unsubscribe;
  }, [queryClient, router, bootStatus]);

  // Reset auth expiry guard on successful login (allows re-detection in new session)
  useEffect(() => {
    if (bootStatus === 'authed') {
      resetAuthExpiryGuard();
    }
  }, [bootStatus]);

  // Sync RevenueCat user ID with backend auth (one-shot per login/logout)
  useRevenueCatSync({
    userId,
    isLoggedIn: bootStatus === 'authed' || bootStatus === 'onboarding',
  });

  // Claim any pending referral code once authed (one-shot, never blocks UI)
  useReferralClaim({ bootStatus, isOnboardingComplete: bootStatus === 'authed' });

  // Fetch entitlements once authed (one-shot, never blocks UI)
  useEntitlementsSync({ bootStatus });

  // Refresh entitlements on foreground (with 10min throttle)
  useEntitlementsForegroundRefresh({
    isLoggedIn: bootStatus === 'authed' || bootStatus === 'onboarding',
  });

  // Register push notifications globally (gates on bootStatus === 'authed' internally)
  // Previously in social.tsx - moved here so tokens register immediately on auth, not tab mount
  useNotifications();

  // DEV-only: Log once when authed shell is mounted for push bootstrap
  const loggedPushBootstrapOnceRef = useRef(false);
  useEffect(() => {
    if (bootStatus === 'authed' && session?.user?.id && !loggedPushBootstrapOnceRef.current) {
      loggedPushBootstrapOnceRef.current = true;
      devLog('[PUSH_BOOTSTRAP]', 'authed shell mounted for push bootstrap, userId:', session.user.id.substring(0, 8) + '...');
    }
  }, [bootStatus, session?.user?.id]);

  // Email verification gate modal (global, show once per account if unverified)
  useEffect(() => {
    const checkEmailGate = async () => {
      const userId = session?.user?.id;
      const emailVerified = session?.user?.emailVerified;
      
      if (!userId || emailVerified !== false) return;
      
      // Prevent double-scheduling: if timer already scheduled, do nothing
      if (gateTimerRef.current) return;
      
      const hasShown = await hasShownGateModal(userId);
      if (!hasShown) {
        // Wait 800ms after authed state, then show modal
        gateTimerRef.current = setTimeout(async () => {
          // Mark as shown BEFORE opening modal (best-effort persistence)
          try {
            await markGateModalShown(userId);
          } catch (error) {
            devLog('[EMAIL_GATE]', 'Failed to persist show-once flag:', error);
            // Continue showing modal even if write fails (better UX)
          }
          setShowEmailGateModal(true);
          gateTimerRef.current = null;
        }, 800);
      }
    };
    
    if (bootStatus === 'authed') {
      checkEmailGate();
    }

    // Cleanup: clear timer if effect re-runs or component unmounts
    return () => {
      if (gateTimerRef.current) {
        clearTimeout(gateTimerRef.current);
        gateTimerRef.current = null;
      }
    };
  }, [bootStatus, session?.user?.id, session?.user?.emailVerified]);

  // [P0_INIT_ROUTE_FIX] PRIMARY: BootRouter handles post-boot routing decisions.
  // App starts at /welcome (initialRouteName='welcome'), then this effect redirects
  // based on boot status:
  // - authed → /calendar
  // - loggedOut/error/onboarding → stay on /welcome
  useEffect(() => {
    if (!navigationState?.key) {
      return; // Navigation not ready yet
    }

    // Only route once based on boot status
    if (hasRoutedRef.current) {
      return;
    }

    // Still loading - don't route yet
    if (bootStatus === 'loading') {
      return;
    }

    hasRoutedRef.current = true;

    // [P0_AUTH_JITTER] Proof log: one-shot routing decision (must fire exactly once per boot)
    if (__DEV__) {
      devLog('[P0_AUTH_JITTER]', 'routing-decision', {
        surface: 'BootRouter',
        bootStatus,
        pathname,
        bootResolvedOnce: hasBootResolvedOnce(),
      });
    }

    // [P15_NAV_INVAR] DEV-only: detect illegal auth-route for bootStatus
    if (__DEV__) {
      const AUTHED_ROOTS = ['/calendar', '/social', '/discover', '/friends', '/settings'];
      const isAuthedRoute = AUTHED_ROOTS.some(r => pathname.startsWith(r));
      if (bootStatus === 'loggedOut' && isAuthedRoute && once(`nav_illegal_${pathname}`)) {
        p15('[P15_NAV_INVAR]', { illegalTarget: pathname, bootStatus, action: 'will_redirect' });
      }
      if ((bootStatus === 'loggedOut' || bootStatus === 'error') && pathname === '/login') {
        // Not a violation — login is reachable from welcome
      }
    }

    devLog(
      '[ONBOARDING_BOOT]',
      'Routing decision (fallback):',
      JSON.stringify({ bootStatus, currentPath: pathname, error: bootError || 'none' }, null, 2)
    );

    // INVARIANT: loggedOut → /welcome (Getting Started), NOT /login
    // Login is only reachable via button tap from Getting Started or deep link
    if (bootStatus === 'loggedOut' || bootStatus === 'error') {
      // ALWAYS route to /welcome on loggedOut, even if already on /login
      // This ensures fresh installs go to welcome, not login
      if (pathname !== '/welcome') {
        devLog('[ONBOARDING_BOOT]', '→ Routing to /welcome (no valid token - Getting Started)');
        router.replace('/welcome');
      }
    } else if (bootStatus === 'degraded') {
      // Network/timeout error - do NOT route, stay on current screen
      // User can retry by relaunching app or via retry() if exposed
      devLog('[ONBOARDING_BOOT]', '→ Degraded state (network/timeout) - not routing');
      // Do NOT set hasRoutedRef.current - allow retry to re-run routing
      hasRoutedRef.current = false;
      return; // Exit early, don't mark as routed
    } else if (bootStatus === 'onboarding') {
      // Authenticated but onboarding incomplete - send to welcome
      if (pathname !== '/welcome') {
        devLog('[ONBOARDING_BOOT]', '→ Routing to /welcome (token exists, onboarding incomplete)');
        router.replace('/welcome');
      }
    } else if (bootStatus === 'authed') {
      // Fully authenticated and onboarded - go to Calendar (home/center tab)
      if (pathname !== '/calendar') {
        devLog('[ONBOARDING_BOOT]', '→ Routing to /calendar (fully authenticated)');
        router.replace('/calendar');
      }
    }
  }, [navigationState?.key, bootStatus, router, pathname]);

  // [P0_AUTH_JITTER] Show loading overlay only during INITIAL boot (before first terminal resolution).
  // After boot resolves once (authed/loggedOut/onboarding/error), suppress overlay to prevent
  // jitter during login rebootstrap and logout flows.
  // Degraded keeps overlay because it's retriable, not terminal.
  const showBootOverlay = !hasBootResolvedOnce() && (bootStatus === 'loading' || bootStatus === 'degraded');

  if (__DEV__) {
    devLog('[P0_AUTH_JITTER]', 'render-gate', {
      surface: 'BootRouter',
      bootStatus,
      showBootOverlay,
      hasRouted: hasRoutedRef.current,
      bootResolvedOnce: hasBootResolvedOnce(),
      decision: showBootOverlay ? 'block (show overlay)' : 'pass (render app)',
    });
  }

  return (
    <>
      {showBootOverlay && (
        <BootLoading testID="boot-router-loading" context={`boot-router-${bootStatus}`} />
      )}
      <EmailVerificationGateModal
        visible={showEmailGateModal}
        onClose={() => setShowEmailGateModal(false)}
      />
    </>
  );
}

function RootLayoutNav() {
  const { themeColor, isDark, colors } = useTheme();

  // P0 FIX: Use dynamic theme colors based on dark/light mode
  const headerBg = colors.background;
  const headerTint = colors.text;

  // Dynamic theme based on user preference
  const OpenInviteTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: themeColor,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: themeColor,
    },
  };

  return (
    <ThemeProvider value={OpenInviteTheme}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        initialRouteName="welcome"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'none', // Instant page transitions
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="calendar" />
        <Stack.Screen name="create" />
        <Stack.Screen name="friends" />
        <Stack.Screen name="circles" />
        <Stack.Screen name="profile" />
        <Stack.Screen
          name="public-profile"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Public Profile',
            headerBackButtonDisplayMode: 'minimal',
            headerStyle: { backgroundColor: headerBg },
            headerTintColor: headerTint,
          }}
        />
        <Stack.Screen name="settings" />
        <Stack.Screen
          name="login"
          options={{
            presentation: 'card',
            animation: 'fade',
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="friend/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Profile',
            headerStyle: { backgroundColor: headerBg },
            headerTintColor: headerTint,
          }}
        />
        <Stack.Screen
          name="event/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Event Details',
            headerStyle: { backgroundColor: headerBg },
            headerTintColor: headerTint,
          }}
        />
        <Stack.Screen
          name="user/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Profile',
            headerBackButtonDisplayMode: 'minimal',
            headerStyle: { backgroundColor: headerBg },
            headerTintColor: headerTint,
          }}
        />
        <Stack.Screen
          name="discover"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="whos-free"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: "Who's Free?",
            headerStyle: { backgroundColor: headerBg },
            headerTintColor: headerTint,
          }}
        />
        <Stack.Screen
          name="paywall"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="onboarding"
          options={{
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="welcome"
          options={{
            headerShown: false,
            gestureEnabled: false,
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="activity"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="suggestions"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="invite"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Invite Friends',
            headerStyle: { backgroundColor: headerBg },
            headerTintColor: headerTint,
          }}
        />
        <Stack.Screen
          name="create-event-request"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Propose Event',
            headerStyle: { backgroundColor: headerBg },
            headerTintColor: headerTint,
          }}
        />
        <Stack.Screen
          name="event-request/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Proposed Event',
            headerStyle: { backgroundColor: headerBg },
            headerTintColor: headerTint,
          }}
        />
        <Stack.Screen
          name="account-center"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="help-faq"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Help & FAQ',
            headerStyle: { backgroundColor: headerBg },
            headerTintColor: headerTint,
          }}
        />
        <Stack.Screen
          name="notification-settings"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Notification Settings',
            headerStyle: { backgroundColor: headerBg },
            headerTintColor: headerTint,
          }}
        />
        <Stack.Screen
          name="blocked-contacts"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Blocked Contacts',
            headerStyle: { backgroundColor: headerBg },
            headerTintColor: headerTint,
          }}
        />
        <Stack.Screen
          name="import-calendar"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="circle/[id]"
          options={{
            presentation: 'card',
            headerShown: false,
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="event/edit/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Edit Event',
            headerStyle: { backgroundColor: headerBg },
            headerTintColor: headerTint,
          }}
        />
        <Stack.Screen
          name="subscription"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="privacy-settings"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);

  const [fontsLoaded] = useFonts({
    Sora_300Light,
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
  });

  useEffect(() => {
    // Hide the native splash screen once our custom one is ready
    ExpoSplashScreen.hideAsync();

    // Initialize network monitoring
    initNetworkMonitoring();
  }, []);

  // Global unhandled promise rejection logger for better error visibility during dev
  useEffect(() => {
    const handler = (event: any) => {
      try {
        devLog('[UNHANDLED_REJECTION]', event?.reason ?? event);
      } catch (e) {
        // Fallback - can't use devLog if it threw
      }
    };

    // Set both modern and legacy hooks where available
    try {
      (globalThis as any).onunhandledrejection = handler;
    } catch (e) {
      // ignore
    }

    // Log resolved backend URL for diagnostics
    devLog('[CONFIG]', 'BACKEND_URL=', BACKEND_URL);

    return () => {
      try {
        (globalThis as any).onunhandledrejection = null;
      } catch (e) {
        // ignore
      }
    };
  }, []);

  // Set up deep link listener
  useEffect(() => {
    const cleanup = setupDeepLinkListener();
    return cleanup;
  }, []);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  // Show loading while fonts are loading
  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#E85D4C" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <AppThemeProvider>
            {/* [P0_PRO_TRIO_UNLOCK] SubscriptionProvider MUST wrap app for useIsPro() to work */}
            <SubscriptionProvider>
              <OfflineSyncProvider>
                <AutoSyncProvider>
                  <ErrorBoundary>
                    <View style={{ flex: 1 }}>
                      <NetworkStatusBanner />
                      <UpdateBanner />
                      <AnnouncementBanner />
                      <ToastContainer />
                      <BootRouter />
                      <RootLayoutNav />
                    {showSplash && <AnimatedSplash onAnimationComplete={handleSplashComplete} />}
                  </View>
                </ErrorBoundary>
                </AutoSyncProvider>
              </OfflineSyncProvider>
            </SubscriptionProvider>
          </AppThemeProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
