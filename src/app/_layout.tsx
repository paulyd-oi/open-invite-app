// Polyfill TextEncoder/TextDecoder for React Native (required for crypto/auth libs)
import 'fast-text-encoding';

import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useRootNavigationState, usePathname, useSegments } from 'expo-router';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useFonts } from 'expo-font';
import { APP_FONTS } from '@/lib/fonts';

import { ThemeProvider as AppThemeProvider, useTheme } from '@/lib/ThemeContext';
import { SubscriptionProvider } from '@/lib/SubscriptionContext';
import { devLog } from '@/lib/devLog';
import { DEV_PROBES_ENABLED, DEV_OVERLAYS_VISIBLE } from '@/lib/devFlags';
import { SplashScreen as AnimatedSplash } from '@/components/SplashScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NetworkStatusBanner } from '@/components/OfflineBanner';
import { UpdateBanner } from '@/components/UpdateBanner';
import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import { ToastContainer } from '@/components/Toast';
import { BootLoading } from '@/components/BootLoading';
import { AutoSyncProvider } from '@/components/AutoSyncProvider';
import { setupDeepLinkListener, consumePendingDeepLinkRoute } from '@/lib/deepLinks';
import { initNetworkMonitoring } from '@/lib/networkStatus';
import { useOfflineSync } from '@/lib/offlineSync';
import { BACKEND_URL } from '@/lib/config';
import { useBootAuthority, hasBootResolvedOnce } from '@/hooks/useBootAuthority';
import { useNotifications } from '@/hooks/useNotifications';
import { useReferralClaim } from '@/hooks/useReferralClaim';
import { useRsvpIntentClaim } from '@/hooks/useRsvpIntentClaim';
import { useCircleInviteIntentClaim } from '@/hooks/useCircleInviteIntentClaim';
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
import { runProdGateSelfTest } from '@/lib/prodGateSelfTest';
import { connect as wsConnect, disconnect as wsDisconnect } from '@/lib/realtime/wsClient';
import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { PostHogProvider, usePostHog } from "posthog-react-native";
import { getPostHogProviderProps, posthogIdentify, posthogReset, setPostHogRef, POSTHOG_ENABLED } from "@/analytics/posthogSSOT";
import { usePostHogScreenTrack } from "@/analytics/usePostHogScreenTrack";
import { trackAppOpened, trackEmailVerified } from "@/analytics/analyticsEventsSSOT";

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: SENTRY_DSN,
enabled: !__DEV__ && !!SENTRY_DSN,
  release: `${Constants.expoConfig?.version ?? "unknown"} (${Constants.expoConfig?.ios?.buildNumber ?? "0"})`,
  environment: __DEV__ ? "development" : "production",
  tracesSampleRate: 0.0,
  sendDefaultPii: false,
});


// [P0_QUERY_STALENESS_VISUALIZER] DEV-only overlay
const QueryDebugOverlay = __DEV__
  ? require('@/dev/QueryDebugOverlay').default
  : () => null;

// [P0_LIVE_FEEL_PROOF_HARNESS] DEV-only live refresh diagnostics
const LiveRefreshProofOverlay = __DEV__
  ? require('@/dev/LiveRefreshProofOverlay').default
  : () => null;

// =============================================================================
// [P0_LAYOUT_JUMP_PROBE] DEV-only instrumentation to identify cold-start jump
// Logs safe-area insets, window dims, and RootLayoutNav container layout deltas.
// Max 10 layout logs per app start. Does not affect layout (absolute overlay).
// IMPORTANT: renders null-equivalent — does NOT wrap children. onLayout lives
// on the nav container View in RootLayout to avoid reconciliation side-effects.
// =============================================================================
const LayoutJumpProbe = __DEV__
  ? function LayoutJumpProbeImpl() {
      const insets = useSafeAreaInsets();
      const { width: winW, height: winH } = useWindowDimensions();
      const mountTs = useRef(Date.now());

      // Log once on mount — BOTH devLog and console.log for redundancy.
      // devLog('[P0_LAYOUT_JUMP_PROBE]') now always-on (added to ALWAYS_ON_TAG_PREFIXES),
      // but console.log is kept as belt-and-suspenders in case devLog is ever filtered.
      useEffect(() => {
        if (!DEV_PROBES_ENABLED) return;
        const payload = {
          tMs: 0,
          insetsTop: insets.top,
          insetsBottom: insets.bottom,
          winW,
          winH,
          initialMetricsTop: initialWindowMetrics?.insets?.top ?? 'null',
        };
        devLog('[P0_LAYOUT_JUMP_PROBE]', 'MOUNTED', payload);
      }, []);

      // Log when insets change (key signal for SafeArea hydration snap)
      const prevInsetsRef = useRef({ top: insets.top, bottom: insets.bottom });
      useEffect(() => {
        if (
          prevInsetsRef.current.top !== insets.top ||
          prevInsetsRef.current.bottom !== insets.bottom
        ) {
          const payload = {
            tMs: Date.now() - mountTs.current,
            phase: 'insets-change',
            insetsTop: insets.top,
            insetsBottom: insets.bottom,
            prevInsetsTop: prevInsetsRef.current.top,
            prevInsetsBottom: prevInsetsRef.current.bottom,
            winW,
            winH,
          };
          if (DEV_PROBES_ENABLED) devLog('[P0_LAYOUT_JUMP_PROBE]', payload);
          prevInsetsRef.current = { top: insets.top, bottom: insets.bottom };
        }
      }, [insets.top, insets.bottom]);

      // Log when window dims change
      const prevWinRef = useRef({ w: winW, h: winH });
      useEffect(() => {
        if (prevWinRef.current.w !== winW || prevWinRef.current.h !== winH) {
          const payload = {
            tMs: Date.now() - mountTs.current,
            phase: 'window-change',
            winW,
            winH,
            prevWinW: prevWinRef.current.w,
            prevWinH: prevWinRef.current.h,
          };
          if (DEV_PROBES_ENABLED) devLog('[P0_LAYOUT_JUMP_PROBE]', payload);
          prevWinRef.current = { w: winW, h: winH };
        }
      }, [winW, winH]);

      // Zero-impact absolute overlay — does NOT participate in layout flow.
      // onLayout for the nav container is wired directly in RootLayout.
      return (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0 }}
        />
      );
    }
  : function LayoutJumpProbeNoop() {
      return null;
    };

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
    // Only retry on server errors (5xx); prevent retry storms on client errors
    retry: (failureCount: number, error: any) => {
      const status = error?.status ?? error?.response?.status;
      if (typeof status === "number" && status >= 500) return failureCount < 2;
      return false;
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
    'queries.retry': 'max 2 on 5xx only',
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

// Conditional PostHog provider wrapper (no-op when key missing)
function PostHogProviderWrapper({ posthogProps, children }: { posthogProps: ReturnType<typeof getPostHogProviderProps>; children: React.ReactNode }) {
  if (!posthogProps) return <>{children}</>;
  return (
    <PostHogProvider
      apiKey={posthogProps.apiKey}
      options={posthogProps.options}
      autocapture={posthogProps.autocapture}
      debug={posthogProps.debug}
    >
      {children}
    </PostHogProvider>
  );
}

/**
 * PostHogLifecycle — identify / reset / screen tracking.
 *
 * Rendered ONLY inside PostHogProvider (via POSTHOG_ENABLED guard),
 * so usePostHog() is always valid — no conditional hook violation.
 *
 * [P0_POSTHOG_BOOT] proof tag
 */
function PostHogLifecycle({ bootStatus, userId, emailVerified }: {
  bootStatus: string;
  userId: string | undefined;
  emailVerified: boolean;
}) {
  const posthog = usePostHog();
  const identifiedRef = useRef(false);
  const prevEmailVerifiedRef = useRef(emailVerified);

  // Store instance so non-hook callers (track()) can reach PostHog
  useEffect(() => {
    setPostHogRef(posthog ?? null);
    return () => setPostHogRef(null);
  }, [posthog]);

  // [P0_ANALYTICS_EVENT] app_opened — once per cold start
  useEffect(() => {
    if (posthog) trackAppOpened();
  }, [posthog]);

  useEffect(() => {
    if (bootStatus === 'authed' && userId && posthog && !identifiedRef.current) {
      identifiedRef.current = true;
      posthogIdentify(posthog, userId, { emailVerified });
    }
    if ((bootStatus === 'loggedOut' || bootStatus === 'error') && identifiedRef.current) {
      identifiedRef.current = false;
      posthogReset(posthog);
    }
  }, [bootStatus, userId, posthog, emailVerified]);

  // [P0_ANALYTICS_EVENT] email_verified — edge detection (false → true)
  useEffect(() => {
    if (emailVerified && !prevEmailVerifiedRef.current) {
      trackEmailVerified();
    }
    prevEmailVerifiedRef.current = emailVerified;
  }, [emailVerified]);

  // [P0_POSTHOG_SCREEN] Track screen views via Expo Router pathname changes
  usePostHogScreenTrack();

  return null;
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
      runProdGateSelfTest();
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

  // [GROWTH_P3] Auto-apply pending RSVP intent from shared event deep link
  useRsvpIntentClaim({ bootStatus, isOnboardingComplete: bootStatus === 'authed' });

  // [GROWTH_FULLPHASE_A] Auto-join pending circle from shared circle deep link
  useCircleInviteIntentClaim({ bootStatus, isOnboardingComplete: bootStatus === 'authed' });

  // Fetch entitlements once authed (one-shot, never blocks UI)
  useEntitlementsSync({ bootStatus });

  // Refresh entitlements on foreground (with 10min throttle)
  useEntitlementsForegroundRefresh({
    isLoggedIn: bootStatus === 'authed' || bootStatus === 'onboarding',
  });

  // Register push notifications globally (gates on bootStatus === 'authed' internally)
  // Previously in social.tsx - moved here so tokens register immediately on auth, not tab mount
  useNotifications();

  // [P0_DEEPLINK_DEFER] Replay pending deep link once authed.
  // When a deep link arrives before boot resolves, deepLinks.ts stores the route
  // instead of navigating. This effect replays it once auth is confirmed.
  const deepLinkReplayedRef = useRef(false);
  useEffect(() => {
    if (bootStatus !== 'authed') return;
    if (deepLinkReplayedRef.current) return;
    const route = consumePendingDeepLinkRoute();
    if (!route) return;
    deepLinkReplayedRef.current = true;
    if (__DEV__) {
      devLog('[P0_DEEPLINK_DEFER] REPLAY route=' + route);
    }
    // Small delay to ensure router is mounted after auth completes
    setTimeout(() => {
      router.push(route as any);
    }, 150);
  }, [bootStatus, router]);

  // [P0_WS_BOOT] Start/stop realtime WS based on boot status (SSOT)
  // Idempotent: wsClient.connect() is a no-op if already connected/connecting or flag off.
  const wsBootedRef = useRef(false);
  useEffect(() => {
    const isAuthed = bootStatus === 'authed' || bootStatus === 'onboarding';

    if (isAuthed && userId) {
      if (!wsBootedRef.current) {
        wsBootedRef.current = true;
        devLog('[P0_WS_BOOT]', 'start', {
          bootStatus,
          userIdPrefix: userId.substring(0, 8),
        });
      }
      wsConnect();
    } else if (bootStatus === 'loggedOut' || bootStatus === 'error') {
      if (wsBootedRef.current) {
        wsBootedRef.current = false;
        devLog('[P0_WS_BOOT]', 'stop', {
          bootStatus,
          userIdPrefix: userId?.substring(0, 8) ?? 'none',
        });
      }
      wsDisconnect();
    }
    // Cleanup: disconnect on unmount (safety net)
    return () => {
      wsDisconnect();
    };
  }, [bootStatus, userId]);

  // [P0_POSTHOG_BOOT] PostHog lifecycle handled by <PostHogLifecycle /> below
  // (separate component so hooks are never called conditionally)

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
      // - loggedOut/error/onboarding → /welcome
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
      // Fully authenticated and onboarded - go to Calendar (authenticated default landing)
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
      {POSTHOG_ENABLED && (
        <PostHogLifecycle
          bootStatus={bootStatus}
          userId={userId}
          emailVerified={session?.user?.emailVerified ?? false}
        />
      )}
      {/* [P0_BOOT_OVERLAY] Always mounted — toggled via opacity+pointerEvents
          to avoid tree-swap reflow that causes cold-start layout jump. */}
      <BootLoading
        testID="boot-router-loading"
        context={`boot-router-${bootStatus}`}
        visible={showBootOverlay}
      />
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
        <Stack.Screen
          name="social"
          options={{
            headerShown: false,
          }}
        />
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
          name="verify-email"
          options={{
            presentation: 'card',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="add-friends"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="admin"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="admin-reports"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="admin-report-detail"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="redeem-code"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="referrals"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="calendar-import-help"
          options={{
            headerShown: false,
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
        <Stack.Screen
          name="account-settings"
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

  // [P1_FONTS_SSOT] Load ALL app fonts from the SSOT font map.
  // First paint is gated on fontsLoaded — splash stays visible until true.
  const [fontsLoaded] = useFonts(APP_FONTS);

  // [P1_FONTS_SSOT] Keep native splash visible until fonts are loaded.
  // This eliminates the first-paint font swap (system → Sora) on cold start.
  useEffect(() => {
    if (!fontsLoaded) return;
    ExpoSplashScreen.hideAsync();
  }, [fontsLoaded]);

  // Initialize network monitoring once on mount
  useEffect(() => {
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

  // [P1_FONTS_SSOT] Proof log when fonts finish loading (fires once)
  useEffect(() => {
    if (__DEV__ && fontsLoaded) {
      devLog('[P1_FONTS_SSOT] fontsLoaded=true — app tree always mounted, overlay hiding');
    }
  }, [fontsLoaded]);

  // [P0_FONTS_OVERLAY] Proof log: overlay visibility toggle
  useEffect(() => {
    if (__DEV__) {
      devLog('[P0_FONTS_OVERLAY]', { fontsLoaded, overlayVisible: !fontsLoaded });
    }
  }, [fontsLoaded]);

  // [P1_TOP_CHROME_JUMP] Proof: top-chrome banners are now in absolute overlay,
  // not in layout flow. Log once on mount to confirm.
  useEffect(() => {
    if (__DEV__) {
      devLog('[P1_TOP_CHROME_JUMP]', 'top-chrome overlay mounted: position=absolute, pointerEvents=box-none, zIndex=900 — banners do NOT participate in layout flow');
    }
  }, []);

  // [P0_LAYOUT_PROBE] Proof: splash always mounted, no tree swap on completion
  useEffect(() => {
    if (__DEV__) {
      devLog('[P0_LAYOUT_PROBE]', { showSplash, note: showSplash ? 'splash visible (absolute overlay)' : 'splash hidden (stays mounted, no tree swap)' });
    }
  }, [showSplash]);

  // [P0_LAYOUT_JUMP_PROBE] Nav container onLayout tracking (DEV-only, max 10 logs).
  // Placed here (in RootLayout) so the onLayout goes on the SAME wrapper View that
  // contains RootLayoutNav, without adding any extra reconciliation-order Views.
  const _navLayoutCountRef = useRef(0);
  const _prevNavLayoutRef = useRef({ y: -1, h: -1 });
  const _navLayoutMountTsRef = useRef(Date.now());
  const handleNavContainerLayout = (e: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => {
    if (!__DEV__) return;
    if (_navLayoutCountRef.current >= 10) return; // throttle: max 10 logs
    const { x, y, width, height } = e.nativeEvent.layout;
    const dY = _prevNavLayoutRef.current.y >= 0 ? y - _prevNavLayoutRef.current.y : 0;
    const dH = _prevNavLayoutRef.current.h >= 0 ? height - _prevNavLayoutRef.current.h : 0;
    // Skip if nothing changed (after first measurement)
    if (_prevNavLayoutRef.current.y === y && _prevNavLayoutRef.current.h === height && _prevNavLayoutRef.current.y >= 0) return;
    _navLayoutCountRef.current++;
    _prevNavLayoutRef.current = { y, h: height };
    const payload = {
      tMs: Date.now() - _navLayoutMountTsRef.current,
      phase: 'layout',
      layoutX: x,
      layoutY: y,
      layoutW: width,
      layoutH: height,
      dY,
      dH,
      measureCount: _navLayoutCountRef.current,
    };
    if (DEV_PROBES_ENABLED) devLog('[P0_LAYOUT_JUMP_PROBE]', payload);
  };

  const posthogProps = getPostHogProviderProps();

  return (
    <QueryClientProvider client={queryClient}>
      <PostHogProviderWrapper posthogProps={posthogProps}>
        {/* [P1_ONBOARD_SNAP] SafeAreaProvider with initialWindowMetrics eliminates
            first-render layout snap: without this, SafeAreaView starts with
            insets={top:0} then jumps once native measurement completes. */}
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <AppThemeProvider>
              {/* [P0_PREMIUM_CONTRACT] SubscriptionProvider MUST wrap app for usePremiumStatusContract() to work */}
              <SubscriptionProvider>
                <OfflineSyncProvider>
                  <AutoSyncProvider>
                    <ErrorBoundary>
                      <View style={{ flex: 1 }}>
                        <BootRouter />
                        {/* [P0_FONTS_OVERLAY] Opacity gate: nav content hidden until fonts load.
                            Tree stays mounted — no mount/unmount swap, no layout reflow. */}
                        {/* [P0_LAYOUT_JUMP_PROBE] onLayout on this View (nav container) captures
                            layout deltas for the RootLayoutNav wrapper. LayoutJumpProbe is a
                            zero-size absolute sibling — does NOT wrap children, no layout impact. */}
                        <View
                          style={{ flex: 1, opacity: fontsLoaded ? 1 : 0 }}
                          onLayout={__DEV__ ? handleNavContainerLayout : undefined}
                        >
                          {__DEV__ && <LayoutJumpProbe />}
                          <RootLayoutNav />
                        </View>
                        {/* [P1_TOP_CHROME_JUMP] Top-chrome overlay: absolutely positioned so
                            banners/toasts never participate in layout flow. Prevents content
                            from jumping when banners appear/disappear after async boot. */}
                        <View
                          pointerEvents="box-none"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            zIndex: 900,
                          }}
                        >
                          <NetworkStatusBanner />
                          <UpdateBanner />
                          <AnnouncementBanner />
                          <ToastContainer />
                        </View>
                        {DEV_OVERLAYS_VISIBLE && <QueryDebugOverlay />}
                        {DEV_OVERLAYS_VISIBLE && <LiveRefreshProofOverlay />}
                        {/* [P0_FONTS_OVERLAY] Absolute loader overlay — covers nav while fonts load.
                            Always mounted, toggled via opacity+pointerEvents (no tree swap). */}
                        <View
                          pointerEvents={fontsLoaded ? 'none' : 'auto'}
                          style={{
                            position: 'absolute',
                            top: 0, left: 0, right: 0, bottom: 0,
                            justifyContent: 'center',
                            alignItems: 'center',
                            backgroundColor: '#FFFFFF',
                            opacity: fontsLoaded ? 0 : 1,
                            zIndex: 1000,
                          }}
                        >
                          <ActivityIndicator size="large" color="#E85D4C" />
                        </View>
                      {/* [P0_LAYOUT_PROBE] AnimatedSplash: always mounted, toggled via visible prop.
                          Prevents tree-swap reflow when splash completes. Already position:absolute. */}
                      <AnimatedSplash
                        onAnimationComplete={handleSplashComplete}
                        visible={showSplash}
                      />
                    </View>
                  </ErrorBoundary>
                  </AutoSyncProvider>
                </OfflineSyncProvider>
              </SubscriptionProvider>
            </AppThemeProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
        </SafeAreaProvider>
      </PostHogProviderWrapper>
    </QueryClientProvider>
  );
}
