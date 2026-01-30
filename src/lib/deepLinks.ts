/**
 * Deep Linking Configuration for Open Invite
 *
 * Handles incoming deep links to open specific screens:
 * - open-invite://event/{id} - Open event details
 * - open-invite://friend/{id} - Open friend profile
 * - open-invite://invite/{code} - Handle referral invites
 * - https://open-invite-api.onrender.com/share/event/{id} - Universal link for events
 * - .ics file imports - Calendar event sharing
 */

import * as Linking from 'expo-linking';
import * as FileSystem from 'expo-file-system';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseICS, isValidICSContent } from './icsParser';
import { handleReferralUrl } from './referral';

// Backend URL for generating shareable links (Render production)
export const BACKEND_URL = 'https://open-invite-api.onrender.com';

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
 * Generate a deep link for friend profile
 */
export function getFriendDeepLink(friendId: string): string {
  return Linking.createURL(`friend/${friendId}`);
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
    console.error('[ICS Import] Failed to store pending import:', error);
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
    console.error('[ICS Import] Failed to get pending import:', error);
    return null;
  }
}

/**
 * Handle .ics file import from share intent or file open
 */
async function handleIcsImport(url: string): Promise<boolean> {
  try {
    console.log('[ICS Import] Processing .ics file:', url);

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
      console.error('[ICS Import] Unsupported URL scheme:', url);
      return false;
    }

    // Validate and parse
    if (!isValidICSContent(icsContent)) {
      console.error('[ICS Import] Invalid .ics content');
      return false;
    }

    const parsed = parseICS(icsContent);
    if (!parsed) {
      console.error('[ICS Import] Failed to parse .ics content');
      return false;
    }

    console.log('[ICS Import] Successfully parsed event:', parsed.title);

    // Store for create screen to pick up
    await storePendingIcsImport(parsed);

    // Navigate to create screen with import flag
    router.push('/create?fromImport=true');

    return true;
  } catch (error) {
    console.error('[ICS Import] Error processing .ics file:', error);
    return false;
  }
}

/**
 * Parse an incoming deep link URL and return the route info
 */
export function parseDeepLink(url: string): { type: string; id?: string; code?: string } | null {
  try {
    // Handle .ics file imports
    if (url.endsWith('.ics') || url.includes('.ics?') || url.startsWith('content://')) {
      return { type: 'ics-import' };
    }

    // Handle app scheme links (open-invite://...)
    if (url.startsWith(`${SCHEME}://`)) {
      const path = url.replace(`${SCHEME}://`, '');
      const [type, id] = path.split('/');

      if (type === 'event' && id) {
        return { type: 'event', id };
      }
      if (type === 'friend' && id) {
        return { type: 'friend', id };
      }
      if (type === 'invite' && id) {
        return { type: 'invite', code: id };
      }
    }

    // Handle universal links (https://...)
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
      console.error('Error parsing deep link:', error);
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
      console.log('Could not parse deep link:', url);
    }
    return false;
  }

  if (__DEV__) {
    console.log('Handling deep link:', parsed);
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

    case 'friend':
      if (parsed.id) {
        router.push(`/friend/${parsed.id}`);
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
      console.log('Deep link received:', url);
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
        console.log('Initial deep link:', url);
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
