/**
 * Deep Linking Configuration for Open Invite
 *
 * Handles incoming deep links to open specific screens:
 * - open-invite://event/{id} - Open event details
 * - open-invite://user/{userId} - Open user profile (canonical)
 * - open-invite://friend/{userId} - Open user profile (legacy, normalized to /user/)
 * - open-invite://invite/{code} - Handle referral invites
 * - https://api.openinvite.cloud/share/event/{id} - Universal link for events
 * - .ics file imports - Calendar event sharing
 * 
 * [P0_PROFILE_ROUTE] Profile deep links ALWAYS use userId, never friendshipId.
 * The /friend/{id} deep link format is legacy and normalized to /user/{id} routing.
 */

import * as Linking from 'expo-linking';
import * as FileSystem from 'expo-file-system';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseICS, isValidICSContent } from './icsParser';
import { handleReferralUrl } from './referral';
import { devLog, devWarn, devError } from './devLog';
import { forceRefreshSession } from './sessionCache';
import { safeToast } from './safeToast';

// Backend URL for generating shareable links (production)
export const BACKEND_URL = 'https://api.openinvite.cloud';

// Deep link scheme
export const SCHEME = 'open-invite';

// Storage key for pending ICS import
const PENDING_ICS_IMPORT_KEY = 'pendingIcsImport';

/**
 * Generate a shareable deep link for an event
 */
export function getEventShareLink(eventId: string): string {
  // Use universal link format for better compatibility
  return `${BACKEND_URL}/share/event/${eventId}`;
}

/**
 * Generate a deep link URI for an event (app-to-app)
 */
export function getEventDeepLink(eventId: string): string {
  return Linking.createURL(`event/${eventId}`);
}

/**
 * Generate a shareable link for inviting friends
 */
export function getInviteShareLink(referralCode: string): string {
  return `${BACKEND_URL}/invite/${referralCode}`;
}

/**
 * Generate a deep link for a user profile (by userId)
 * [P0_PROFILE_ROUTE] Deep links use userId, not friendshipId.
 * The parsed.id will be a userId since profile shares are user-based.
 */
export function getUserProfileDeepLink(userId: string): string {
  // Use 'user' path for clarity - canonical profile route
  return Linking.createURL(`user/${userId}`);
}

/**
 * Store pending ICS import data for the create screen to pick up
 */
export async function storePendingIcsImport(data: {
  title: string;
  startTime: Date;
  endTime: Date | null;
  location: string | null;
  notes: string | null;
}): Promise<void> {
  try {
    await AsyncStorage.setItem(
      PENDING_ICS_IMPORT_KEY,
      JSON.stringify({
        ...data,
        startTime: data.startTime.toISOString(),
        endTime: data.endTime?.toISOString() || null,
      })
    );
  } catch (error) {
    devError('[ICS Import] Failed to store pending import:', error);
  }
}

/**
 * Get and clear pending ICS import data
 */
export async function getPendingIcsImport(): Promise<{
  title: string;
  startTime: Date;
  endTime: Date | null;
  location: string | null;
  notes: string | null;
} | null> {
  try {
    const data = await AsyncStorage.getItem(PENDING_ICS_IMPORT_KEY);
    if (!data) return null;

    await AsyncStorage.removeItem(PENDING_ICS_IMPORT_KEY);

    const parsed = JSON.parse(data);
    return {
      ...parsed,
      startTime: new Date(parsed.startTime),
      endTime: parsed.endTime ? new Date(parsed.endTime) : null,
    };
  } catch (error) {
    devError('[ICS Import] Failed to get pending import:', error);
    return null;
  }
}

/**
 * Handle .ics file import from share intent or file open
 */
async function handleIcsImport(url: string): Promise<boolean> {
  try {
    devLog('[ICS Import] Processing .ics file:', url);

    let icsContent: string;

    // Check if it's a file:// URL
    if (url.startsWith('file://')) {
      // Read file content
      const fileContent = await FileSystem.readAsStringAsync(url, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      icsContent = fileContent;
    } else if (url.startsWith('content://')) {
      // Android content URI - read via FileSystem
      const fileContent = await FileSystem.readAsStringAsync(url, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      icsContent = fileContent;
    } else {
      devError('[ICS Import] Unsupported URL scheme:', url);
      return false;
    }

    // Validate and parse
    if (!isValidICSContent(icsContent)) {
      devError('[ICS Import] Invalid .ics content');
      return false;
    }

    const parsed = parseICS(icsContent);
    if (!parsed) {
      devError('[ICS Import] Failed to parse .ics content');
      return false;
    }

    devLog('[ICS Import] Successfully parsed event:', parsed.title);

    // Store for create screen to pick up
    await storePendingIcsImport(parsed);

    // Navigate to create screen with import flag
    router.push('/create?fromImport=true');

    return true;
  } catch (error) {
    devError('[ICS Import] Error processing .ics file:', error);
    return false;
  }
}

/**
 * Parse an incoming deep link URL and return the route info
 */
export function parseDeepLink(url: string): { type: string; id?: string; code?: string; token?: string } | null {
  try {
    // Handle .ics file imports
    if (url.endsWith('.ics') || url.includes('.ics?') || url.startsWith('content://')) {
      return { type: 'ics-import' };
    }

    // Handle app scheme links (open-invite://...)
    if (url.startsWith(`${SCHEME}://`)) {
      const path = url.replace(`${SCHEME}://`, '');
      const [type, id] = path.split('/');
      
      // Handle verify-email deep links (e.g., open-invite://verify-email?token=xxx)
      // Also handle variations: verify, auth/verify-email, etc.
      if (type === 'verify-email' || type === 'verify' || path.startsWith('auth/verify')) {
        // Extract token from query string if present
        const tokenMatch = url.match(/[?&]token=([^&]+)/);
        return { type: 'verify-email', token: tokenMatch?.[1] || undefined };
      }

      if (type === 'event' && id) {
        return { type: 'event', id };
      }
      // [P0_PROFILE_ROUTE] Both 'friend' (legacy) and 'user' deep links route to user profile
      // The id in these links is always a userId, not friendshipId
      if (type === 'friend' && id) {
        return { type: 'user', id }; // Normalize legacy 'friend' type to 'user'
      }
      if (type === 'user' && id) {
        return { type: 'user', id };
      }
      if (type === 'invite' && id) {
        return { type: 'invite', code: id };
      }
    }

    // Handle universal links (https://...)
    // Handle verify-email universal links
    if (url.includes('/verify-email') || url.includes('/auth/verify')) {
      const tokenMatch = url.match(/[?&]token=([^&]+)/);
      return { type: 'verify-email', token: tokenMatch?.[1] || undefined };
    }
    
    if (url.includes('/share/event/')) {
      const match = url.match(/\/share\/event\/([a-zA-Z0-9_-]+)/);
      if (match?.[1]) {
        return { type: 'event', id: match[1] };
      }
    }

    if (url.includes('/invite/')) {
      const match = url.match(/\/invite\/([a-zA-Z0-9_-]+)/);
      if (match?.[1]) {
        return { type: 'invite', code: match[1] };
      }
    }

    return null;
  } catch (error) {
    if (__DEV__) {
      devError('Error parsing deep link:', error);
    }
    return null;
  }
}

/**
 * Handle incoming deep link and navigate to appropriate screen
 */
export async function handleDeepLink(url: string): Promise<boolean> {
  const parsed = parseDeepLink(url);

  if (!parsed) {
    if (__DEV__) {
      devLog('Could not parse deep link:', url);
    }
    return false;
  }

  if (__DEV__) {
    devLog('Handling deep link:', parsed);
  }

  switch (parsed.type) {
    case 'ics-import':
      return await handleIcsImport(url);

    case 'event':
      if (parsed.id) {
        router.push(`/event/${parsed.id}`);
        return true;
      }
      break;

    case 'user':
      // [P0_PROFILE_ROUTE] Route to canonical /user/ profile (parsed.id is userId)
      if (parsed.id) {
        if (__DEV__) {
          devLog(`[P0_PROFILE_ROUTE] kind=user chosen=user reason=canonical_profile idPrefix=${parsed.id.slice(0, 6)}`);
        }
        router.push(`/user/${parsed.id}`);
        return true;
      }
      break;

    case 'invite':
      if (parsed.code) {
        // Store referral code for later claim after signup/login
        await handleReferralUrl(url);
        // Navigate to calendar (or welcome if not logged in, handled by nav guards)
        router.push('/calendar');
        return true;
      }
      break;

    case 'verify-email':
      // P0_EMAIL_VERIFY: User tapped verification link in email.
      // Refresh session so emailVerified flag updates, then land on Calendar.
      if (__DEV__) devLog('[P0_EMAIL_VERIFY_DEEPLINK] refreshing session after email link tap');
      forceRefreshSession()
        .then(() => {
          safeToast.success('Email verified', "You're all set!");
          router.replace('/calendar');
        })
        .catch(() => {
          // Fallback: still navigate, session will refresh on next query
          router.replace('/calendar');
        });
      return true;
  }

  return false;
}

/**
 * Setup deep link listener
 * Returns cleanup function
 */
export function setupDeepLinkListener(callback?: (url: string) => void): () => void {
  // Handle links that open the app
  const subscription = Linking.addEventListener('url', ({ url }) => {
    if (__DEV__) {
      devLog('Deep link received:', url);
    }
    if (callback) {
      callback(url);
    } else {
      handleDeepLink(url);
    }
  });

  // Check for initial URL (app opened via link)
  Linking.getInitialURL().then((url) => {
    if (url) {
      if (__DEV__) {
        devLog('Initial deep link:', url);
      }
      if (callback) {
        callback(url);
      } else {
        handleDeepLink(url);
      }
    }
  });

  return () => {
    subscription.remove();
  };
}
