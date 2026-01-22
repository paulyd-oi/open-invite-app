// Polyfill TextEncoder/TextDecoder for React Native (required for crypto/auth libs)
import 'fast-text-encoding';

import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useRootNavigationState, usePathname } from 'expo-router';
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
import { SplashScreen as AnimatedSplash } from '@/components/SplashScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NetworkStatusBanner } from '@/components/OfflineBanner';
import { ToastContainer } from '@/components/Toast';
import { AutoSyncProvider } from '@/components/AutoSyncProvider';
import { setupDeepLinkListener } from '@/lib/deepLinks';
import { initNetworkMonitoring } from '@/lib/networkStatus';
import { useOfflineSync } from '@/lib/offlineSync';
import { BACKEND_URL } from '@/lib/config';
import { useBootAuthority } from '@/hooks/useBootAuthority';
import { useReferralClaim } from '@/hooks/useReferralClaim';
import { useEntitlementsSync } from '@/hooks/useEntitlementsSync';

export const unstable_settings = {
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
ExpoSplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Component that handles offline sync (must be inside QueryClientProvider)
function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  // This hook handles queue replay when coming back online
  useOfflineSync();
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
  const navigationState = useRootNavigationState();
  const { status: bootStatus, error: bootError, retry } = useBootAuthority();
  const hasRoutedRef = useRef(false);

  // Claim any pending referral code once authed (one-shot, never blocks UI)
  useReferralClaim({ bootStatus, isOnboardingComplete: bootStatus === 'authed' });

  // Fetch entitlements once authed (one-shot, never blocks UI)
  useEntitlementsSync({ bootStatus });

  // Wait for navigation state to be ready before routing
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

    if (__DEV__) {
      console.log(
        '[BootRouter] Routing decision:',
        JSON.stringify({ bootStatus, currentPath: pathname, error: bootError || 'none' }, null, 2)
      );
    }

    // Guard: if bootStatus indicates logout in progress, always route to /login
    if (bootStatus === 'loggedOut' || bootStatus === 'error') {
      // Only replace if not already on /login (prevent infinite loop)
      if (pathname !== '/login') {
        if (__DEV__) {
          console.log('[BootRouter] → Routing to /login (no valid token)');
        }
        router.replace('/login');
      }
    } else if (bootStatus === 'degraded') {
      // Network/timeout error - do NOT route, stay on current screen
      // User can retry by relaunching app or via retry() if exposed
      if (__DEV__) {
        console.log('[BootRouter] → Degraded state (network/timeout) - not routing');
      }
      // Do NOT set hasRoutedRef.current - allow retry to re-run routing
      hasRoutedRef.current = false;
      return; // Exit early, don't mark as routed
    } else if (bootStatus === 'onboarding') {
      // Authenticated but onboarding incomplete - send to welcome
      if (pathname !== '/welcome') {
        if (__DEV__) {
          console.log('[BootRouter] → Routing to /welcome (token exists, onboarding incomplete)');
        }
        router.replace('/welcome');
      }
    } else if (bootStatus === 'authed') {
      // Fully authenticated and onboarded - go to feed (index route)
      if (pathname !== '/') {
        if (__DEV__) {
          console.log('[BootRouter] → Routing to / (fully authenticated)');
        }
        router.replace('/');
      }
    }
  }, [navigationState?.key, bootStatus, router, pathname]);

  // While loading or degraded, show nothing (splash screen handled in RootLayout)
  if (bootStatus === 'loading' || bootStatus === 'degraded') {
    return null;
  }

  return null;
}

function RootLayoutNav() {
  const { themeColor } = useTheme();

  // Dynamic theme based on user preference
  const OpenInviteTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: themeColor,
      background: '#FFF9F5',
      card: '#FFFFFF',
      text: '#1A1A2E',
      border: '#F0E6E0',
      notification: themeColor,
    },
  };

  return (
    <ThemeProvider value={OpenInviteTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#FFF9F5' },
          animation: 'none', // Instant page transitions
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="calendar" />
        <Stack.Screen name="create" />
        <Stack.Screen name="friends" />
        <Stack.Screen name="circles" />
        <Stack.Screen name="profile" />
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
            headerTitle: 'Friend Profile',
            headerStyle: { backgroundColor: '#FFF9F5' },
            headerTintColor: '#1A1A2E',
          }}
        />
        <Stack.Screen
          name="event/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Event Details',
            headerStyle: { backgroundColor: '#FFF9F5' },
            headerTintColor: '#1A1A2E',
          }}
        />
        <Stack.Screen
          name="user/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Profile',
            headerStyle: { backgroundColor: '#FFF9F5' },
            headerTintColor: '#1A1A2E',
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
            headerStyle: { backgroundColor: '#FFF9F5' },
            headerTintColor: '#1A1A2E',
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
            headerStyle: { backgroundColor: '#FFF9F5' },
            headerTintColor: '#1A1A2E',
          }}
        />
        <Stack.Screen
          name="create-event-request"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Propose Event',
            headerStyle: { backgroundColor: '#FFF9F5' },
            headerTintColor: '#1A1A2E',
          }}
        />
        <Stack.Screen
          name="event-request/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Proposed Event',
            headerStyle: { backgroundColor: '#FFF9F5' },
            headerTintColor: '#1A1A2E',
          }}
        />
        <Stack.Screen
          name="achievements"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Achievements',
            headerStyle: { backgroundColor: '#FFF9F5' },
            headerTintColor: '#1A1A2E',
          }}
        />
        <Stack.Screen
          name="account-center"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="design-showcase"
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
            headerStyle: { backgroundColor: '#FFF9F5' },
            headerTintColor: '#1A1A2E',
          }}
        />
        <Stack.Screen
          name="notification-settings"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Notification Settings',
            headerStyle: { backgroundColor: '#FFF9F5' },
            headerTintColor: '#1A1A2E',
          }}
        />
        <Stack.Screen
          name="blocked-contacts"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Blocked Contacts',
            headerStyle: { backgroundColor: '#FFF9F5' },
            headerTintColor: '#1A1A2E',
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
          }}
        />
        <Stack.Screen
          name="event/edit/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Edit Event',
            headerStyle: { backgroundColor: '#FFF9F5' },
            headerTintColor: '#1A1A2E',
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
        console.error('[global] Unhandled promise rejection:', event?.reason ?? event);
      } catch (e) {
        console.error('[global] Unhandled rejection (failed to log):', e);
      }
    };

    // Set both modern and legacy hooks where available
    try {
      (globalThis as any).onunhandledrejection = handler;
    } catch (e) {
      // ignore
    }

    // Log resolved backend URL for diagnostics
    if (__DEV__) {
      console.log('[Config] BACKEND_URL=', BACKEND_URL);
    }

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
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF9F5' }}>
        <ActivityIndicator size="large" color="#E85D4C" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <AppThemeProvider>
            <OfflineSyncProvider>
              <AutoSyncProvider>
                <ErrorBoundary>
                  <StatusBar style="dark" />
                  <View style={{ flex: 1 }}>
                    <NetworkStatusBanner />
                    <ToastContainer />
                    <BootRouter />
                    <RootLayoutNav />
                  {showSplash && <AnimatedSplash onAnimationComplete={handleSplashComplete} />}
                </View>
              </ErrorBoundary>
              </AutoSyncProvider>
            </OfflineSyncProvider>
          </AppThemeProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
