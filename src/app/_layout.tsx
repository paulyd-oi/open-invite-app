// Polyfill TextEncoder/TextDecoder for React Native (required for crypto/auth libs)
import 'fast-text-encoding';

import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useState, useEffect } from 'react';
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
            presentation: 'modal',
            animation: 'slide_from_bottom',
            headerShown: false,
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
            headerTitle: 'Event Request',
            headerStyle: { backgroundColor: '#FFF9F5' },
            headerTintColor: '#1A1A2E',
          }}
        />
        <Stack.Screen
          name="event-request/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: 'Event Request',
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
